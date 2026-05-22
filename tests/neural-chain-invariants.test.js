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

// Required payload fields on every chain_audit event regardless of code path.
// Spec BR-NC-10 lists 8 fields; the two emitters (CLI vs hook) currently drift
// on the others. Tracked as `[bug-found-002]` + `[bug-found-003]` in
// test-plan.md. This test guards only the truly universal subset.
const REQUIRED_BASE_PAYLOAD_FIELDS = [
  'feature_slug',
  'impacts_found'
];
// Additional fields required when an audit actually ran (not on the EC-NC-05
// no-op event, which currently omits them — `[bug-found-003]`).
const REQUIRED_OPERATIONAL_PAYLOAD_FIELDS = [
  'duration_ms'
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
      for (const field of REQUIRED_BASE_PAYLOAD_FIELDS) {
        assert.ok(
          Object.prototype.hasOwnProperty.call(payload, field),
          `BR-NC-10 violation: hook event payload missing core field '${field}'. payload keys: ${JSON.stringify(Object.keys(payload))}`
        );
      }
      // Operational fields only required when this is NOT the EC-NC-05 no-op event.
      const isNoOp = payload.skipped_reason === 'no_artifacts';
      if (!isNoOp) {
        for (const field of REQUIRED_OPERATIONAL_PAYLOAD_FIELDS) {
          assert.ok(
            Object.prototype.hasOwnProperty.call(payload, field),
            `BR-NC-10 violation: operational hook event missing field '${field}'. payload keys: ${JSON.stringify(Object.keys(payload))}`
          );
        }
      }
      // `impacts_found` may be null (query failed) or a number — never undefined.
      assert.ok(
        payload.impacts_found === null || typeof payload.impacts_found === 'number',
        `impacts_found must be number|null, got ${typeof payload.impacts_found}`
      );
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
    for (const field of [...REQUIRED_BASE_PAYLOAD_FIELDS, ...REQUIRED_OPERATIONAL_PAYLOAD_FIELDS]) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(payload, field),
        `BR-NC-10 violation: CLI event payload missing core field '${field}'. payload keys: ${JSON.stringify(Object.keys(payload))}`
      );
    }
    assert.equal(payload.feature_slug, 'neural-chain', '--feature flag propagates to payload');
    assert.ok(payload.impacts_found >= 1, 'audit found at least the seeded edge');
  } finally {
    db.close();
  }
});
