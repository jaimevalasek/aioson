'use strict';

// Neural Chain — defensive invariant tests written by @tester (post Gate D).
//
// These tests guard contracts that are easy for future slices to silently
// violate. They are NOT coverage-driven (cumulative line coverage is
// already 1.61x source LOC) — they are tripwires for two specific
// architectural invariants of the feature:
//
//   A.1 BR-NC-04 — Audit code NEVER modifies user files. Filesystem writes
//                  from neural-chain modules must be bounded to the
//                  `.aioson/context/noises/` subtree.
//   A.2 BR-NC-10 — Every chain_audit telemetry event carries a stable core
//                  set of payload fields so `aioson chain:stats` (and any
//                  future dashboard) can rely on the schema.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { openRuntimeDb } = require('../src/runtime-store');
const { runChainHookOnAgentDone } = require('../src/neural-chain-agent-ingest');
const { writeNoiseFile, maybeDeleteNoiseFile } = require('../src/neural-chain-noise-file');
const { runChainAudit } = require('../src/commands/chain-audit');

const NEURAL_CHAIN_SRC_FILES = [
  'src/neural-chain-migration.js',
  'src/neural-chain-git-ingest.js',
  'src/neural-chain-agent-ingest.js',
  'src/neural-chain-noise-file.js',
  'src/neural-chain-config.js',
  'src/commands/chain-audit.js'
];

// fs APIs that mutate the filesystem (writes, deletes, renames, perms).
const FS_MUTATE_RE = /fs\.(writeFile|writeFileSync|unlink|unlinkSync|rm|rmSync|appendFile|appendFileSync|copyFile|copyFileSync|rename|renameSync|truncate|truncateSync|chmod|chmodSync|chown|chownSync)\b/g;

// BR-NC-10 spec — 8 required fields on EVERY chain_audit event payload,
// regardless of code path (CLI command, hook per-artifact, EC-NC-05 no-op).
// Hotfix v1.17.1 consolidated the two emitters behind
// `src/neural-chain-telemetry.js#emitChainAuditEvent` so the same schema
// applies everywhere. Extra context fields (agent, autonomy_mode,
// chain_auto_threshold, ingest_stats, skipped_reason, limit_applied, the
// legacy `source_file` singular alias) are allowed on top — they are
// emitter-specific context, not part of the contract.
const REQUIRED_BR_NC_10_FIELDS = [
  'feature_slug',
  'source_files',
  'impacts_found',
  'auto_fixable_count',
  'noise_file',
  'tokens_used',
  'duration_ms',
  'error'
];

async function makeTempProject() {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'aioson-tester-inv-'));
  await fsp.mkdir(path.join(dir, '.aioson', 'runtime'), { recursive: true });
  return dir;
}

// ─── A.1 BR-NC-04 — Audit never modifies user files ──────────────────────

test('A.1 BR-NC-04 (static) — only neural-chain-noise-file.js contains fs write calls', () => {
  const repoRoot = path.join(__dirname, '..');
  // The single allowed write surface — noise file lifecycle ops on
  // `.aioson/context/noises/*.md`. Any other neural-chain source file
  // introducing fs mutation needs explicit @architect review.
  const ALLOWED_FILE = 'src/neural-chain-noise-file.js';
  const ALLOWED_CALLS = ['fs.unlinkSync', 'fs.writeFileSync'];

  for (const rel of NEURAL_CHAIN_SRC_FILES) {
    const source = fs.readFileSync(path.join(repoRoot, rel), 'utf8');
    const calls = [...source.matchAll(FS_MUTATE_RE)].map((m) => m[0]).sort();
    if (rel === ALLOWED_FILE) {
      assert.deepEqual(
        calls,
        ALLOWED_CALLS,
        `${rel} mutates fs with unexpected calls. Expected only ${JSON.stringify(ALLOWED_CALLS)}, got ${JSON.stringify(calls)}. ` +
        `Audit/ingest code must NOT introduce new filesystem mutations outside the noise file lifecycle.`
      );
    } else {
      assert.equal(
        calls.length,
        0,
        `BR-NC-04 violation: ${rel} contains fs mutation call(s) ${JSON.stringify(calls)}. ` +
        `Audit code must NEVER modify user files; only noise-file.js writes to .aioson/context/noises/.`
      );
    }
  }
});

test('A.1 BR-NC-04 (functional) — runChainHookOnAgentDone + maybeDeleteNoiseFile only touch paths under .aioson/context/noises/', async () => {
  const dir = await makeTempProject();
  const { db } = await openRuntimeDb(dir);
  try {
    // Seed an edge so the audit produces impacts → guarded mode writes noise.
    db.prepare(`
      INSERT INTO chain_edges (source_path, target_path, edge_type, confidence, start_at, last_seen_at, hit_count)
      VALUES ('src/foo.js', 'src/dep.js', 'agent_event', 0.9, ?, ?, 8)
    `).run('2026-05-20T00:00:00Z', '2026-05-20T00:00:00Z');

    const writtenPaths = [];
    const unlinkedPaths = [];
    const origWrite = fs.writeFileSync;
    const origUnlink = fs.unlinkSync;
    fs.writeFileSync = (p, data, opts) => {
      writtenPaths.push(String(p));
      return origWrite.call(fs, p, data, opts);
    };
    fs.unlinkSync = (p) => {
      unlinkedPaths.push(String(p));
      return origUnlink.call(fs, p);
    };

    let noiseFile;
    try {
      const r = runChainHookOnAgentDone({
        db,
        targetDir: dir,
        artifacts: ['src/foo.js', 'src/bar.js'],
        agentName: '@dev',
        featureSlug: 'neural-chain',
        autonomyMode: 'guarded',
        now: new Date('2026-05-21T14:30:00Z')
      });
      assert.ok(r.noise_file, 'guarded mode + impacts → noise file written');
      noiseFile = r.noise_file;

      // Resolve all items + trigger delete via lifecycle helper.
      const text = origWrite === fs.writeFileSync
        ? fs.readFileSync(noiseFile, 'utf8')
        : fs.readFileSync(noiseFile, 'utf8');
      const checked = text.replace(/- \[ \]/g, '- [x]');
      origWrite.call(fs, noiseFile, checked, 'utf8');
      writtenPaths.push(noiseFile); // count the test setup write too
      maybeDeleteNoiseFile({ path: noiseFile });
    } finally {
      fs.writeFileSync = origWrite;
      fs.unlinkSync = origUnlink;
    }

    const allowedPrefix = path.join(dir, '.aioson', 'context', 'noises');
    for (const p of [...writtenPaths, ...unlinkedPaths]) {
      assert.ok(
        p.startsWith(allowedPrefix),
        `BR-NC-04 violation: fs operation targeted '${p}' — must be under '${allowedPrefix}'`
      );
    }
    assert.ok(writtenPaths.length >= 1, 'at least one noise file write recorded');
    assert.ok(unlinkedPaths.length >= 1, 'deletion-on-close trigger fired (unlink recorded)');
  } finally {
    db.close();
  }
});

// ─── A.2 BR-NC-10 — chain_audit telemetry schema completeness (core) ─────

test('A.2 BR-NC-10 — every chain_audit event from the hook carries the core payload fields', async () => {
  const dir = await makeTempProject();
  const { db } = await openRuntimeDb(dir);
  try {
    db.prepare(`
      INSERT INTO chain_edges (source_path, target_path, edge_type, confidence, start_at, last_seen_at, hit_count)
      VALUES ('src/foo.js', 'src/dep.js', 'agent_event', 0.9, ?, ?, 8)
    `).run('2026-05-20T00:00:00Z', '2026-05-20T00:00:00Z');

    // Exercise both branches of runChainHookOnAgentDone: per-artifact emits
    // (impacts_found > 0) AND the EC-NC-05 no-op event (empty artifacts).
    runChainHookOnAgentDone({
      db,
      targetDir: dir,
      artifacts: ['src/foo.js', 'src/bar.js'],
      agentName: '@dev',
      featureSlug: 'neural-chain',
      autonomyMode: 'guarded',
      now: new Date('2026-05-21T14:30:00Z')
    });
    runChainHookOnAgentDone({
      db,
      targetDir: dir,
      artifacts: [],
      agentName: '@dev',
      featureSlug: 'neural-chain',
      autonomyMode: 'guarded',
      now: new Date('2026-05-21T14:31:00Z')
    });

    const events = db.prepare(
      "SELECT payload_json FROM execution_events WHERE event_type = 'chain_audit' ORDER BY id ASC"
    ).all();
    assert.ok(events.length >= 3, `expected ≥3 events (2 per-artifact + 1 no-op), got ${events.length}`);

    for (const ev of events) {
      const payload = JSON.parse(ev.payload_json);
      for (const field of REQUIRED_BR_NC_10_FIELDS) {
        assert.ok(
          Object.prototype.hasOwnProperty.call(payload, field),
          `BR-NC-10 violation: hook event payload missing required field '${field}'. payload keys: ${JSON.stringify(Object.keys(payload))}`
        );
      }
      // Type discipline on the 8 required fields.
      assert.ok(
        payload.impacts_found === null || typeof payload.impacts_found === 'number',
        `impacts_found must be number|null, got ${typeof payload.impacts_found}`
      );
      assert.ok(Array.isArray(payload.source_files), 'source_files must be an array (plural per spec)');
      assert.equal(typeof payload.duration_ms, 'number', 'duration_ms required as number (0 on no-op)');
      assert.equal(typeof payload.auto_fixable_count, 'number', 'auto_fixable_count required as number');
      assert.equal(typeof payload.tokens_used, 'number', 'tokens_used required as number (V1 placeholder = 0)');
    }
  } finally {
    db.close();
  }
});

test('A.2 BR-NC-10 — chain:audit CLI also emits the core payload fields', async () => {
  const dir = await makeTempProject();
  const { db: setupDb } = await openRuntimeDb(dir);
  // Seed once via setup handle, then close so chain:audit's own openRuntimeDb succeeds cleanly.
  setupDb.prepare(`
    INSERT INTO chain_edges (source_path, target_path, edge_type, confidence, start_at, last_seen_at, hit_count)
    VALUES ('src/foo.js', 'src/dep.js', 'git_co_edit', 0.7, ?, ?, 7)
  `).run('2026-05-20T00:00:00Z', '2026-05-20T00:00:00Z');
  setupDb.close();

  const r = await runChainAudit({
    args: [dir],
    options: { file: 'src/foo.js', feature: 'neural-chain', json: true },
    logger: { log: () => {}, error: () => {} }
  });
  assert.equal(r.ok, true);

  const { db } = await openRuntimeDb(dir);
  try {
    const events = db.prepare(
      "SELECT payload_json FROM execution_events WHERE event_type = 'chain_audit' ORDER BY id DESC LIMIT 1"
    ).all();
    assert.equal(events.length, 1, 'CLI emits exactly one chain_audit event per invocation');

    const payload = JSON.parse(events[0].payload_json);
    for (const field of REQUIRED_BR_NC_10_FIELDS) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(payload, field),
        `BR-NC-10 violation: CLI event payload missing required field '${field}'. payload keys: ${JSON.stringify(Object.keys(payload))}`
      );
    }
    assert.equal(payload.feature_slug, 'neural-chain', '--feature flag propagates to payload');
    assert.ok(payload.impacts_found >= 1, 'audit found at least the seeded edge');
    assert.deepEqual(payload.source_files, ['src/foo.js'], 'CLI sets source_files to [filePath]');
  } finally {
    db.close();
  }
});

// ─── M-02 (bug-found-002) — BR-NC-01 dual-source dedupe ──────────────────

test('BR-NC-01 dedupe — same (source, target) with both edge_types returns ONE row with max confidence', async () => {
  const dir = await makeTempProject();
  const { db } = await openRuntimeDb(dir);
  try {
    // Same (source, target) pair indexed under BOTH edge_types — would have
    // returned 2 separate rows before hotfix v1.17.1. Spec BR-NC-01 says
    // report max(c_git, c_event) — a single row, no double-count.
    db.prepare(`
      INSERT INTO chain_edges (source_path, target_path, edge_type, confidence, start_at, last_seen_at, hit_count)
      VALUES ('src/foo.js', 'src/dep.js', 'git_co_edit', 0.6, ?, ?, 6),
             ('src/foo.js', 'src/dep.js', 'agent_event', 0.9, ?, ?, 8),
             ('src/foo.js', 'src/other.js', 'agent_event', 0.5, ?, ?, 3)
    `).run(
      '2026-05-20T00:00:00Z', '2026-05-20T00:00:00Z',
      '2026-05-20T00:00:00Z', '2026-05-20T00:00:00Z',
      '2026-05-20T00:00:00Z', '2026-05-20T00:00:00Z'
    );

    const r = runChainHookOnAgentDone({
      db,
      targetDir: dir,
      artifacts: ['src/foo.js', 'src/bar.js'],
      autonomyMode: 'guarded',
      featureSlug: 'neural-chain',
      now: new Date('2026-05-22T14:30:00Z')
    });

    // foo source now has 4 edge rows: (dep, git_co_edit, 0.6) +
    // (dep, agent_event, 0.9) + (other, agent_event, 0.5) + (bar,
    // agent_event, 0.2 — ingested by the hook). After BR-NC-01 dedupe by
    // target_path, that collapses to 3 unique targets — dep appears once
    // (was 2 rows without dedupe), other/bar each once. Without the fix
    // this would have been 4 rows.
    const fooAudit = r.audits.find((a) => a.source_file === 'src/foo.js');
    assert.ok(fooAudit, 'audit for src/foo.js present');
    assert.equal(fooAudit.impacts_found, 3, 'dedupe collapsed dep dual-source into 1 row (3 unique targets)');

    const depRows = fooAudit.impacts.filter((i) => i.target_path === 'src/dep.js');
    assert.equal(depRows.length, 1, 'dep.js appears exactly once after dedupe');
    assert.equal(depRows[0].confidence, 0.9, 'max(c_git=0.6, c_event=0.9) = 0.9');
    assert.equal(depRows[0].edge_type, 'agent_event', 'edge_type from the row that won the max');

    // Noise file body should list dep.js exactly once (not twice).
    const text = fs.readFileSync(r.noise_file, 'utf8');
    const depMatches = (text.match(/^- \[ \].*src\/dep\.js/gm) || []).length;
    assert.equal(depMatches, 1, `dep.js must appear once in noise file (got ${depMatches})`);
  } finally {
    db.close();
  }
});

test('BR-NC-01 dedupe — chain:audit CLI also dedupes dual-source rows', async () => {
  const dir = await makeTempProject();
  const { db: setupDb } = await openRuntimeDb(dir);
  setupDb.prepare(`
    INSERT INTO chain_edges (source_path, target_path, edge_type, confidence, start_at, last_seen_at, hit_count)
    VALUES ('src/foo.js', 'src/dep.js', 'git_co_edit', 0.4, ?, ?, 4),
           ('src/foo.js', 'src/dep.js', 'agent_event', 0.85, ?, ?, 7)
  `).run(
    '2026-05-20T00:00:00Z', '2026-05-20T00:00:00Z',
    '2026-05-20T00:00:00Z', '2026-05-20T00:00:00Z'
  );
  setupDb.close();

  const r = await runChainAudit({
    args: [dir],
    options: { file: 'src/foo.js', feature: 'neural-chain', json: true },
    logger: { log: () => {}, error: () => {} }
  });
  assert.equal(r.ok, true);
  assert.equal(r.impacts_found, 1, 'CLI dedupes to a single row');
  assert.equal(r.impacts[0].target_path, 'src/dep.js');
  assert.equal(r.impacts[0].confidence, 0.85, 'CLI reports the max confidence');
  assert.equal(r.impacts[0].edge_type, 'agent_event', 'CLI reports the edge_type from the winning row');
});
