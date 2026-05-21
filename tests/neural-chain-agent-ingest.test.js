'use strict';

// Neural Chain — Phase 1 Slice 3 agent_event ingest acceptance tests.
// Covers deriveSessionPairs, ingestAgentEventEdges (confidence formula,
// idempotency, hard cap BR-NC-08), and runChainHookOnAgentDone (EC-NC-05
// no-op skip path + telemetry-per-file emission).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { openRuntimeDb } = require('../src/runtime-store');
const {
  deriveSessionPairs,
  ingestAgentEventEdges,
  runChainHookOnAgentDone,
  CONFIDENCE_SATURATION,
  HARD_CAP_PER_NODE
} = require('../src/neural-chain-agent-ingest');

async function makeTempProject() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-agent-ingest-'));
  await fs.mkdir(path.join(dir, '.aioson', 'runtime'), { recursive: true });
  return dir;
}

test('deriveSessionPairs returns [] for empty / single-file lists (EC-NC-05)', () => {
  assert.deepEqual(deriveSessionPairs([]), []);
  assert.deepEqual(deriveSessionPairs(['src/only.js']), []);
  assert.deepEqual(deriveSessionPairs(null), []);
  assert.deepEqual(deriveSessionPairs(undefined), []);
});

test('deriveSessionPairs filters .aioson/* and .git/* paths', () => {
  const pairs = deriveSessionPairs([
    'src/a.js',
    '.aioson/context/spec.md',
    'src/b.js',
    '.git/HEAD'
  ]);
  // 2 source files → 2 directional pairs (a→b, b→a)
  assert.equal(pairs.length, 2);
  for (const p of pairs) {
    assert.ok(['src/a.js', 'src/b.js'].includes(p.source));
    assert.ok(['src/a.js', 'src/b.js'].includes(p.target));
  }
});

test('deriveSessionPairs generates N*(N-1) directional pairs for N source files', () => {
  const pairs = deriveSessionPairs(['a.js', 'b.js', 'c.js']);
  // 3 files → 6 directional pairs (a→b, a→c, b→a, b→c, c→a, c→b)
  assert.equal(pairs.length, 6);
});

test('ingestAgentEventEdges skips when artifacts < 2 (EC-NC-05)', async () => {
  const dir = await makeTempProject();
  const { db } = await openRuntimeDb(dir);
  try {
    const result = ingestAgentEventEdges({ db, artifacts: ['src/only.js'] });
    assert.equal(result.skipped, true);
    assert.equal(result.reason, 'no_pairs');
    assert.equal(result.upserted, 0);

    const rows = db.prepare('SELECT count(*) AS c FROM chain_edges').get();
    assert.equal(rows.c, 0);
  } finally {
    db.close();
  }
});

test('ingestAgentEventEdges inserts new edges with initial confidence = 1/SATURATION (BR-NC-01)', async () => {
  const dir = await makeTempProject();
  const { db } = await openRuntimeDb(dir);
  try {
    const result = ingestAgentEventEdges({
      db,
      artifacts: ['src/a.js', 'src/b.js'],
      now: new Date('2026-05-21T00:00:00Z')
    });
    assert.equal(result.skipped, false);
    assert.equal(result.upserted, 2); // 2 directional pairs

    const rows = db.prepare(
      `SELECT source_path, target_path, confidence, hit_count
       FROM chain_edges WHERE edge_type = 'agent_event' AND end_at IS NULL
       ORDER BY source_path`
    ).all();
    assert.equal(rows.length, 2);

    const expectedConfidence = 1 / CONFIDENCE_SATURATION; // 0.2
    for (const row of rows) {
      assert.equal(row.confidence, expectedConfidence);
      assert.equal(row.hit_count, 1);
    }
  } finally {
    db.close();
  }
});

test('ingestAgentEventEdges increments hit_count and recomputes confidence on re-ingest (BR-NC-07)', async () => {
  const dir = await makeTempProject();
  const { db } = await openRuntimeDb(dir);
  try {
    const artifacts = ['src/a.js', 'src/b.js'];

    // Ingest 5 times → hit_count should reach 5 → confidence saturates at 1.0
    for (let i = 0; i < 5; i++) {
      ingestAgentEventEdges({
        db,
        artifacts,
        now: new Date(`2026-05-${21 + i}T00:00:00Z`)
      });
    }

    const edge = db.prepare(
      `SELECT confidence, hit_count, last_seen_at FROM chain_edges
       WHERE source_path='src/a.js' AND target_path='src/b.js'
       AND edge_type='agent_event' AND end_at IS NULL`
    ).get();
    assert.equal(edge.hit_count, 5);
    assert.equal(edge.confidence, 1.0, 'confidence should saturate at 1.0 after 5 hits');
    assert.ok(edge.last_seen_at.startsWith('2026-05-25'), 'last_seen_at should track latest now');

    // Ingest 5 more times → hit_count grows but confidence stays saturated
    for (let i = 0; i < 5; i++) {
      ingestAgentEventEdges({
        db,
        artifacts,
        now: new Date(`2026-05-${26 + i}T00:00:00Z`)
      });
    }
    const saturated = db.prepare(
      `SELECT confidence, hit_count FROM chain_edges
       WHERE source_path='src/a.js' AND target_path='src/b.js'
       AND edge_type='agent_event' AND end_at IS NULL`
    ).get();
    assert.equal(saturated.hit_count, 10);
    assert.equal(saturated.confidence, 1.0, 'confidence stays at 1.0 (saturated)');
  } finally {
    db.close();
  }
});

test('ingestAgentEventEdges enforces hard cap 10k via archive of oldest (BR-NC-08)', async () => {
  const dir = await makeTempProject();
  const { db } = await openRuntimeDb(dir);
  try {
    // Seed 10000 active agent_event edges for 'src/cap.js' with ascending last_seen_at.
    const insert = db.prepare(`
      INSERT INTO chain_edges (source_path, target_path, edge_type, confidence, start_at, last_seen_at, hit_count)
      VALUES (?, ?, 'agent_event', 0.2, ?, ?, 1)
    `);
    const tx = db.transaction(() => {
      for (let i = 0; i < HARD_CAP_PER_NODE; i++) {
        const seq = String(i).padStart(5, '0');
        const iso = `2026-01-01T00:00:00.${seq}Z`;
        insert.run('src/cap.js', `dep${seq}.js`, iso, iso);
      }
    });
    tx();

    const before = db.prepare(
      `SELECT count(*) AS c FROM chain_edges WHERE source_path='src/cap.js' AND end_at IS NULL`
    ).get();
    assert.equal(before.c, HARD_CAP_PER_NODE);

    // Ingest a NEW pair → triggers archive flow.
    const result = ingestAgentEventEdges({
      db,
      artifacts: ['src/cap.js', 'src/new-target.js'],
      now: new Date('2026-05-21T00:00:00Z')
    });
    // Two directional pairs: cap→new-target (new) and new-target→cap (new).
    // Only the cap-side hits the cap (new-target has 0 existing edges).
    assert.ok(result.archived >= 1, 'at least 1 edge archived from cap.js side');

    const activeAfter = db.prepare(
      `SELECT count(*) AS c FROM chain_edges WHERE source_path='src/cap.js' AND end_at IS NULL`
    ).get();
    assert.equal(activeAfter.c, HARD_CAP_PER_NODE, 'active count stays at cap on src/cap.js side');

    const archivedOldest = db.prepare(
      `SELECT target_path FROM chain_edges
       WHERE source_path='src/cap.js' AND end_at IS NOT NULL
       ORDER BY end_at DESC LIMIT 1`
    ).get();
    assert.equal(archivedOldest.target_path, 'dep00000.js', 'oldest by last_seen_at archived');
  } finally {
    db.close();
  }
});

test('ingestAgentEventEdges throws on invalid db handle', () => {
  assert.throws(() => ingestAgentEventEdges({ db: null, artifacts: ['a', 'b'] }), /requires an open better-sqlite3/);
});

test('runChainHookOnAgentDone emits exactly 1 chain_audit event on empty artifacts (EC-NC-05)', async () => {
  const dir = await makeTempProject();
  const { db } = await openRuntimeDb(dir);
  try {
    const result = runChainHookOnAgentDone({
      db,
      artifacts: [],
      agentName: '@dev',
      featureSlug: 'neural-chain'
    });

    assert.equal(result.ok, true);
    assert.equal(result.ec_nc_05, true);

    const events = db.prepare(
      "SELECT payload_json, message FROM execution_events WHERE event_type = 'chain_audit'"
    ).all();
    assert.equal(events.length, 1, 'exactly 1 chain_audit event emitted on empty session');

    const payload = JSON.parse(events[0].payload_json);
    assert.equal(payload.source_file, null);
    assert.equal(payload.impacts_found, 0);
    assert.equal(payload.skipped_reason, 'no_artifacts');
    assert.ok(events[0].message.includes('no-op'));
  } finally {
    db.close();
  }
});

test('runChainHookOnAgentDone emits 1 chain_audit per artifact + ingests pairs', async () => {
  const dir = await makeTempProject();
  const { db } = await openRuntimeDb(dir);
  try {
    const result = runChainHookOnAgentDone({
      db,
      artifacts: ['src/foo.js', 'src/bar.js'],
      agentName: '@dev',
      featureSlug: 'neural-chain'
    });

    assert.equal(result.ok, true);
    assert.equal(result.audits.length, 2, 'one audit per artifact');
    assert.equal(result.ingest.upserted, 2, '2 directional pairs ingested');
    assert.equal(result.ingest.skipped, false);

    const auditEvents = db.prepare(
      "SELECT payload_json, agent_name FROM execution_events WHERE event_type = 'chain_audit'"
    ).all();
    assert.equal(auditEvents.length, 2);
    for (const ev of auditEvents) {
      assert.equal(ev.agent_name, '@dev');
      const payload = JSON.parse(ev.payload_json);
      assert.equal(payload.feature_slug, 'neural-chain');
      assert.ok(['src/foo.js', 'src/bar.js'].includes(payload.source_file));
    }

    // Verify chain_edges populated with agent_event edges
    const edges = db.prepare(
      `SELECT source_path, target_path, hit_count FROM chain_edges
       WHERE edge_type='agent_event' AND end_at IS NULL ORDER BY source_path`
    ).all();
    assert.equal(edges.length, 2);
    assert.equal(edges[0].hit_count, 1);
  } finally {
    db.close();
  }
});

test('runChainHookOnAgentDone never throws on invalid db (returns ok=false)', () => {
  const result = runChainHookOnAgentDone({ db: null, artifacts: ['a', 'b'] });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing_db');
});

test('runChainHookOnAgentDone audit sees pre-existing edges from prior sessions', async () => {
  const dir = await makeTempProject();
  const { db } = await openRuntimeDb(dir);
  try {
    // Pre-populate chain_edges with a git_co_edit edge for 'src/foo.js'.
    db.prepare(`
      INSERT INTO chain_edges (source_path, target_path, edge_type, confidence, start_at, last_seen_at, hit_count)
      VALUES ('src/foo.js', 'src/dep.js', 'git_co_edit', 0.8, ?, ?, 8)
    `).run('2026-05-20T00:00:00Z', '2026-05-20T00:00:00Z');

    const result = runChainHookOnAgentDone({
      db,
      artifacts: ['src/foo.js', 'src/other.js'],
      agentName: '@dev'
    });

    // Audit for 'src/foo.js' should find the pre-existing git edge.
    const fooAudit = result.audits.find((a) => a.source_file === 'src/foo.js');
    assert.ok(fooAudit, 'audit for src/foo.js present');
    // After ingest of (foo→other, other→foo), foo source has 2 active edges:
    // git_co_edit (foo→dep, pre-existing) + agent_event (foo→other, just added).
    assert.equal(fooAudit.impacts_found, 2, 'audit sees git edge + new agent_event edge');
  } finally {
    db.close();
  }
});
