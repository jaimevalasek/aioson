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

const { writeNoiseFile } = require('./neural-chain-noise-file');

const CONFIDENCE_SATURATION = 5;
const HARD_CAP_PER_NODE = 10000;

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
  autonomyMode = 'guarded',
  now = new Date()
} = {}) {
  if (!db || typeof db.prepare !== 'function') {
    return { ok: false, reason: 'missing_db' };
  }

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
        skipped_reason: 'no_artifacts',
        noise_file: null,
        autonomy_mode: autonomyMode,
        ingest_stats: ingest
      },
      'chain:audit (no-op: no artifacts in session)'
    );
    return { ok: true, ingest, audits, ec_nc_05: true, noise_file: null };
  }

  // Pass 1 — collect impacts per source file (no telemetry yet so we can
  // decide noise_file path before emitting events).
  for (const file of safeArtifacts) {
    const startedAt = Date.now();
    const impacts = queryImpacts(db, file);
    const durationMs = Date.now() - startedAt;
    audits.push({
      source_file: file,
      impacts: Array.isArray(impacts) ? impacts : [],
      impacts_found: impacts === null ? 0 : impacts.length,
      duration_ms: durationMs,
      error: impacts === null ? 'query_failed' : null
    });
  }

  // BR-NC-06: in `guarded` autonomy, persist one noise file per session
  // aggregating every impact returned across the session's source files.
  // `standard` / `autonomous` are handled by Slice 6 threshold rules.
  let noiseFile = null;
  const hasAnyImpacts = audits.some((a) => a.impacts_found > 0);
  if (autonomyMode === 'guarded' && targetDir && hasAnyImpacts) {
    try {
      const result = writeNoiseFile({
        targetDir,
        featureSlug,
        audits,
        autonomyMode,
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
        duration_ms: audit.duration_ms,
        ingest_stats: ingest,
        noise_file: noiseFile,
        autonomy_mode: autonomyMode,
        error: audit.error
      },
      `chain:audit ${audit.source_file} → ${audit.error ? 'error' : `${audit.impacts_found} impacts`} (session hook)`
    );
  }

  return { ok: true, ingest, audits, noise_file: noiseFile };
}

module.exports = {
  deriveSessionPairs,
  ingestAgentEventEdges,
  runChainHookOnAgentDone,
  queryImpacts,
  CONFIDENCE_SATURATION,
  HARD_CAP_PER_NODE
};
