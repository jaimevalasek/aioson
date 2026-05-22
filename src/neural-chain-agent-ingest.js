'use strict';

/**
 * Neural Chain — agent_event ingest + per-session audit hook helper.
 *
 * Slice 3 closes the second edge type ('agent_event'). Co-edit pairs come
 * from the `artifacts` list passed to `agent:done` (typically the files
 * the agent created or modified during its session). Each session adds
 * +1 to hit_count for every directional pair (A→B, B→A) in the artifacts.
 *
 * Confidence per BR-NC-01: `min(1.0, hit_count / CONFIDENCE_SATURATION=5)`.
 * V1 simplification: running `hit_count` is treated as the agent_event
 * frequency signal. BR-NC-01 specifies `count_last_30d`; M2 graph
 * maintenance will introduce aging. Saturation at 5 hits bounds the
 * approximation regardless.
 *
 * Hard cap per BR-NC-08: HARD_CAP_PER_NODE active edges per source_path,
 * oldest archived by `last_seen_at` before exceeding the cap.
 *
 * EC-NC-05: empty / single-file artifact lists yield zero pairs →
 * `runChainHookOnAgentDone` still emits exactly one `chain_audit` event
 * with `impacts_found=0` so the guardrail metric series stays unbroken.
 *
 * Best-effort by design (BR-NC-11): every write is wrapped so a failure
 * never blocks the caller in `runAgentDone`.
 */

const path = require('node:path');
const { writeNoiseFile } = require('./neural-chain-noise-file');
const {
  readChainConfig,
  DEFAULT_AUTONOMY_MODE,
  DEFAULT_CHAIN_AUTO_THRESHOLD
} = require('./neural-chain-config');

const CONFIDENCE_SATURATION = 5;
const HARD_CAP_PER_NODE = 10000;

// BR-NC-02 rule (a) — common test naming patterns across languages.
// {stem} below = source module basename minus its extension.
//   {stem}.test.{ext}   • {stem}.spec.{ext}
//   test_{stem}.{ext}   • {stem}_test.{ext}   • {stem}-test.{ext}
const SOURCE_EXT_RE = /\.[a-zA-Z0-9]+$/;

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isTestFileFor(targetPath, sourcePath) {
  if (!targetPath || !sourcePath) return false;
  const sourceBase = path.basename(String(sourcePath));
  const targetBase = path.basename(String(targetPath));
  const stem = sourceBase.replace(SOURCE_EXT_RE, '');
  if (!stem || stem === sourceBase) return false; // source has no extension
  const s = escapeRegex(stem);
  const re = new RegExp(
    `^(${s}\\.(test|spec)\\.[a-zA-Z0-9]+|test_${s}\\.[a-zA-Z0-9]+|${s}_test\\.[a-zA-Z0-9]+|${s}-test\\.[a-zA-Z0-9]+)$`,
    'i'
  );
  return re.test(targetBase);
}

/**
 * BR-NC-02/03 classifier. Returns the marker to embed in the noise item:
 *   - 'AUTO-FIXABLE'             — matches BR-NC-02 (a) or (c) in standard/autonomous
 *   - 'AUTO-FIXABLE-BEST-EFFORT' — non-match in autonomous mode
 *   - null                       — non-match in standard mode, or guarded mode
 *
 * BR-NC-02 (b) (literal identifier match via diff) is deferred — requires
 * git diff parsing the prior session's edits, heavy for V1; planned as a
 * follow-up. Documented in spec § "Decisões arquiteturais desta slice".
 */
function classifyImpact({ impact, sourceFile, autonomyMode, threshold }) {
  if (autonomyMode === 'guarded') {
    return { marker: null, classification: 'noise' };
  }

  const isTestPair = isTestFileFor(impact && impact.target_path, sourceFile);
  const isThresholdMatch =
    impact &&
    typeof impact.confidence === 'number' &&
    impact.confidence > threshold &&
    impact.edge_type === 'agent_event' &&
    typeof impact.hit_count === 'number' &&
    impact.hit_count > 5;

  if (isTestPair || isThresholdMatch) {
    return { marker: 'AUTO-FIXABLE', classification: 'auto_fixable' };
  }

  if (autonomyMode === 'autonomous') {
    return { marker: 'AUTO-FIXABLE-BEST-EFFORT', classification: 'auto_fixable_best_effort' };
  }

  return { marker: null, classification: 'noise' };
}

function deriveSessionPairs(artifacts) {
  if (!Array.isArray(artifacts)) return [];

  const files = artifacts.filter(
    (f) =>
      f &&
      typeof f === 'string' &&
      !f.startsWith('.aioson/') &&
      !f.startsWith('.aioson\\') &&
      !f.startsWith('.git/') &&
      !f.startsWith('.git\\')
  );

  if (files.length < 2) return [];

  const pairs = [];
  for (let i = 0; i < files.length; i++) {
    for (let j = 0; j < files.length; j++) {
      if (i === j) continue;
      pairs.push({ source: files[i], target: files[j] });
    }
  }
  return pairs;
}

function ingestAgentEventEdges({ db, artifacts, now = new Date() }) {
  if (!db || typeof db.prepare !== 'function') {
    throw new Error('ingestAgentEventEdges requires an open better-sqlite3 db handle');
  }

  const pairs = deriveSessionPairs(artifacts);
  if (pairs.length === 0) {
    return { skipped: true, reason: 'no_pairs', upserted: 0, archived: 0, capped_inserts: 0 };
  }

  const nowIso = now.toISOString();
  const stats = { skipped: false, upserted: 0, archived: 0, capped_inserts: 0 };
  const initialConfidence = Math.min(1.0, 1 / CONFIDENCE_SATURATION);

  // UPSERT: on conflict, increment hit_count + recompute confidence.
  // SQLite ON CONFLICT semantics — `hit_count` (no qualifier) = current row's value;
  // `excluded.<col>` = the value being inserted.
  const upsertStmt = db.prepare(`
    INSERT INTO chain_edges (source_path, target_path, edge_type, confidence, start_at, last_seen_at, hit_count)
    VALUES (?, ?, 'agent_event', ?, ?, ?, 1)
    ON CONFLICT(source_path, target_path, edge_type) WHERE end_at IS NULL
    DO UPDATE SET
      hit_count = hit_count + 1,
      confidence = MIN(1.0, (hit_count + 1.0) / ${CONFIDENCE_SATURATION}.0),
      last_seen_at = excluded.last_seen_at
  `);

  const countActiveStmt = db.prepare(`
    SELECT count(*) AS c FROM chain_edges
    WHERE source_path = ? AND end_at IS NULL
  `);

  const findExistingStmt = db.prepare(`
    SELECT id FROM chain_edges
    WHERE source_path = ? AND target_path = ? AND edge_type = 'agent_event' AND end_at IS NULL
  `);

  const findOldestStmt = db.prepare(`
    SELECT id FROM chain_edges
    WHERE source_path = ? AND end_at IS NULL
    ORDER BY last_seen_at ASC LIMIT 1
  `);

  const archiveStmt = db.prepare('UPDATE chain_edges SET end_at = ? WHERE id = ?');

  const tx = db.transaction((items) => {
    for (const item of items) {
      // BR-NC-08 hard cap — enforce only on new edges; existing-edge updates
      // don't grow the active set.
      const existingRow = findExistingStmt.get(item.source, item.target);
      if (!existingRow) {
        const { c: activeCount } = countActiveStmt.get(item.source);
        if (activeCount >= HARD_CAP_PER_NODE) {
          const oldest = findOldestStmt.get(item.source);
          if (oldest) {
            archiveStmt.run(nowIso, oldest.id);
            stats.archived += 1;
            stats.capped_inserts += 1;
          }
        }
      }

      upsertStmt.run(item.source, item.target, initialConfidence, nowIso, nowIso);
      stats.upserted += 1;
    }
  });

  tx(pairs);
  return stats;
}

function emitChainAuditEvent(db, payload, message) {
  try {
    db.prepare(`
      INSERT INTO execution_events (event_type, agent_name, message, payload_json, created_at)
      VALUES ('chain_audit', ?, ?, ?, ?)
    `).run(payload.agent || null, message, JSON.stringify(payload), new Date().toISOString());
  } catch (_) {
    // BR-NC-10 best-effort: telemetry failure must not propagate.
  }
}

function queryImpacts(db, sourcePath, limit = 20) {
  try {
    return db.prepare(`
      SELECT target_path, edge_type, confidence, hit_count, last_seen_at
      FROM chain_edges
      WHERE source_path = ? AND end_at IS NULL
      ORDER BY confidence DESC, hit_count DESC, last_seen_at DESC
      LIMIT ?
    `).all(sourcePath, limit);
  } catch (_) {
    return null;
  }
}

/**
 * Per-session hook called from `runAgentDone` after standard telemetry is
 * written. Performs ingest + per-file audit telemetry + EC-NC-05 no-op
 * fallback. Never throws; the caller wraps the invocation in try/catch
 * defensively, but this function additionally guards each SQL boundary
 * via try/catch and emitChainAuditEvent so a partial failure never
 * propagates.
 */
function runChainHookOnAgentDone({
  db,
  artifacts,
  agentName = null,
  featureSlug = null,
  targetDir = null,
  autonomyMode = null,
  chainAutoThreshold = null,
  now = new Date()
} = {}) {
  if (!db || typeof db.prepare !== 'function') {
    return { ok: false, reason: 'missing_db' };
  }

  // Slice 6: resolve autonomy mode + threshold from `.aioson/config.md`
  // frontmatter when not explicitly provided. EC-NC-07: missing file /
  // missing keys / invalid values → runtime defaults (guarded, 0.8).
  let resolvedMode = autonomyMode;
  let resolvedThreshold = chainAutoThreshold;
  if ((resolvedMode === null || resolvedThreshold === null) && targetDir) {
    try {
      const cfg = readChainConfig({ targetDir });
      if (resolvedMode === null) resolvedMode = cfg.autonomyMode;
      if (resolvedThreshold === null) resolvedThreshold = cfg.chainAutoThreshold;
    } catch (_) {
      // best-effort
    }
  }
  if (resolvedMode === null) resolvedMode = DEFAULT_AUTONOMY_MODE;
  if (resolvedThreshold === null) resolvedThreshold = DEFAULT_CHAIN_AUTO_THRESHOLD;

  const safeArtifacts = Array.isArray(artifacts) ? artifacts.slice() : [];

  let ingest;
  try {
    ingest = ingestAgentEventEdges({ db, artifacts: safeArtifacts, now });
  } catch (err) {
    ingest = { skipped: true, reason: 'ingest_failed', error: err && err.message ? err.message : String(err) };
  }

  const audits = [];

  if (safeArtifacts.length === 0) {
    // EC-NC-05: zero edits → emit one no-op audit event so the guardrail
    // metric series stays continuous.
    emitChainAuditEvent(
      db,
      {
        agent: agentName,
        source_file: null,
        feature_slug: featureSlug,
        impacts_found: 0,
        auto_fixable_count: 0,
        skipped_reason: 'no_artifacts',
        noise_file: null,
        autonomy_mode: resolvedMode,
        chain_auto_threshold: resolvedThreshold,
        ingest_stats: ingest
      },
      'chain:audit (no-op: no artifacts in session)'
    );
    return { ok: true, ingest, audits, ec_nc_05: true, noise_file: null, autonomy_mode: resolvedMode };
  }

  // Pass 1 — collect impacts per source file AND classify each via
  // BR-NC-02/03. Marker is attached to the impact in place so writeNoiseFile
  // can render the prefix verbatim.
  let autoFixableCount = 0;
  for (const file of safeArtifacts) {
    const startedAt = Date.now();
    const rawImpacts = queryImpacts(db, file);
    const durationMs = Date.now() - startedAt;
    const classified = Array.isArray(rawImpacts)
      ? rawImpacts.map((impact) => {
          const { marker, classification } = classifyImpact({
            impact,
            sourceFile: file,
            autonomyMode: resolvedMode,
            threshold: resolvedThreshold
          });
          if (classification === 'auto_fixable') autoFixableCount += 1;
          return { ...impact, marker, classification };
        })
      : [];
    audits.push({
      source_file: file,
      impacts: classified,
      impacts_found: rawImpacts === null ? 0 : classified.length,
      duration_ms: durationMs,
      error: rawImpacts === null ? 'query_failed' : null
    });
  }

  // BR-NC-06/03: noise file is written in `standard` and `autonomous` modes
  // too (Slice 6) — items carry the `[AUTO-FIXABLE]` / `[AUTO-FIXABLE-BEST-EFFORT]`
  // prefix when applicable. `guarded` mode still writes one noise file with
  // unprefixed items (same as Slice 4). Skip the write only when there are
  // zero impacts across all artifacts.
  let noiseFile = null;
  const hasAnyImpacts = audits.some((a) => a.impacts_found > 0);
  if (targetDir && hasAnyImpacts) {
    try {
      const result = writeNoiseFile({
        targetDir,
        featureSlug,
        audits,
        autonomyMode: resolvedMode,
        now
      });
      noiseFile = result.path;
    } catch (_) {
      // BR-NC-11 best-effort: noise write must not block agent_done.
    }
  }

  // Pass 2 — per-artifact telemetry events. noise_file is the same on every
  // event (session-scoped) so dashboards can attribute the file regardless of
  // which event row is sampled.
  for (const audit of audits) {
    emitChainAuditEvent(
      db,
      {
        agent: agentName,
        source_file: audit.source_file,
        feature_slug: featureSlug,
        impacts_found: audit.error ? null : audit.impacts_found,
        auto_fixable_count: audit.error ? null : audit.impacts.filter((i) => i.classification === 'auto_fixable').length,
        duration_ms: audit.duration_ms,
        ingest_stats: ingest,
        noise_file: noiseFile,
        autonomy_mode: resolvedMode,
        chain_auto_threshold: resolvedThreshold,
        error: audit.error
      },
      `chain:audit ${audit.source_file} → ${audit.error ? 'error' : `${audit.impacts_found} impacts`} (session hook)`
    );
  }

  return {
    ok: true,
    ingest,
    audits,
    noise_file: noiseFile,
    autonomy_mode: resolvedMode,
    chain_auto_threshold: resolvedThreshold,
    auto_fixable_count: autoFixableCount
  };
}

module.exports = {
  deriveSessionPairs,
  ingestAgentEventEdges,
  runChainHookOnAgentDone,
  queryImpacts,
  classifyImpact,
  isTestFileFor,
  CONFIDENCE_SATURATION,
  HARD_CAP_PER_NODE
};
