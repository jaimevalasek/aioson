'use strict';

// Neural Chain — Phase 1 Slice 2 chain:audit CLI acceptance tests.
// Covers query semantics (top-N by confidence DESC, only active rows,
// source_path filter), telemetry emission (BR-NC-10), input validation,
// JSON vs human output, and failure non-blocking behavior (BR-NC-11).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { openRuntimeDb } = require('../src/runtime-store');
const { runChainAudit, DEFAULT_LIMIT, HARD_LIMIT_CAP } = require('../src/commands/chain-audit');

async function makeTempProject() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-chain-audit-'));
  await fs.mkdir(path.join(dir, '.aioson', 'runtime'), { recursive: true });
  return dir;
}

function silentLogger() {
  const lines = [];
  return {
    lines,
    log: (msg) => lines.push(String(msg)),
    error: () => {}
  };
}

function tFn(key, params) {
  if (params) {
    return Object.keys(params).reduce(
      (acc, k) => acc.replace(`{${k}}`, params[k]),
      key
    );
  }
  return key;
}

async function seedEdges(dir, edges) {
  const { db } = await openRuntimeDb(dir);
  const insert = db.prepare(`
    INSERT INTO chain_edges (source_path, target_path, edge_type, confidence, start_at, last_seen_at, hit_count, end_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const tx = db.transaction(() => {
    for (const edge of edges) {
      insert.run(
        edge.source_path,
        edge.target_path,
        edge.edge_type || 'git_co_edit',
        edge.confidence,
        edge.start_at || '2026-05-20T10:00:00Z',
        edge.last_seen_at || edge.start_at || '2026-05-20T10:00:00Z',
        edge.hit_count || 1,
        edge.end_at || null
      );
    }
  });
  tx();
  db.close();
}

test('chain:audit returns ok=false on missing file argument', async () => {
  const dir = await makeTempProject();
  const result = await runChainAudit({
    args: [dir],
    options: {},
    logger: silentLogger(),
    t: tFn
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing_file');
});

test('chain:audit returns empty list on fresh DB (no impacts)', async () => {
  const dir = await makeTempProject();
  const logger = silentLogger();
  // t omitted → exercises the English fallback string in the command.
  const result = await runChainAudit({
    args: [dir, 'src/foo.js'],
    options: {},
    logger
  });
  assert.equal(result.ok, true);
  assert.equal(result.impacts_found, 0);
  assert.deepEqual(result.impacts, []);
  assert.ok(logger.lines.some((l) => l.includes('no impacts')));
});

test('chain:audit returns impacts ordered by confidence DESC', async () => {
  const dir = await makeTempProject();
  await seedEdges(dir, [
    { source_path: 'src/foo.js', target_path: 'src/low.js', confidence: 0.2 },
    { source_path: 'src/foo.js', target_path: 'src/high.js', confidence: 0.9 },
    { source_path: 'src/foo.js', target_path: 'src/mid.js', confidence: 0.5 },
    { source_path: 'src/foo.js', target_path: 'src/edge.js', confidence: 0.5, edge_type: 'agent_event', hit_count: 7 }
  ]);

  const result = await runChainAudit({
    args: [dir, 'src/foo.js'],
    options: { json: true },
    logger: silentLogger(),
    t: tFn
  });

  assert.equal(result.ok, true);
  assert.equal(result.impacts_found, 4);
  assert.equal(result.impacts[0].target_path, 'src/high.js', 'highest confidence first');
  assert.equal(result.impacts[result.impacts.length - 1].target_path, 'src/low.js', 'lowest last');
});

test('chain:audit excludes archived rows (end_at IS NOT NULL)', async () => {
  const dir = await makeTempProject();
  await seedEdges(dir, [
    { source_path: 'src/foo.js', target_path: 'src/active.js', confidence: 0.5 },
    { source_path: 'src/foo.js', target_path: 'src/archived.js', confidence: 0.9, end_at: '2026-05-20T11:00:00Z' }
  ]);

  const result = await runChainAudit({
    args: [dir, 'src/foo.js'],
    options: { json: true },
    logger: silentLogger(),
    t: tFn
  });

  assert.equal(result.impacts_found, 1);
  assert.equal(result.impacts[0].target_path, 'src/active.js');
});

test('chain:audit honors --limit argument up to HARD_LIMIT_CAP', async () => {
  const dir = await makeTempProject();
  const seedRows = Array.from({ length: 30 }, (_, i) => ({
    source_path: 'src/foo.js',
    target_path: `src/dep${i}.js`,
    confidence: (30 - i) / 30
  }));
  await seedEdges(dir, seedRows);

  // limit < default
  const r5 = await runChainAudit({
    args: [dir, 'src/foo.js'],
    options: { limit: 5, json: true },
    logger: silentLogger(),
    t: tFn
  });
  assert.equal(r5.impacts_found, 5);

  // limit absent → default 20
  const rDefault = await runChainAudit({
    args: [dir, 'src/foo.js'],
    options: { json: true },
    logger: silentLogger(),
    t: tFn
  });
  assert.equal(rDefault.impacts_found, DEFAULT_LIMIT);

  // limit > HARD_LIMIT_CAP → capped silently
  const rOver = await runChainAudit({
    args: [dir, 'src/foo.js'],
    options: { limit: 9999, json: true },
    logger: silentLogger(),
    t: tFn
  });
  assert.ok(rOver.impacts_found <= HARD_LIMIT_CAP);
});

test('chain:audit emits exactly 1 chain_audit telemetry event per invocation (BR-NC-10)', async () => {
  const dir = await makeTempProject();
  await seedEdges(dir, [
    { source_path: 'src/foo.js', target_path: 'src/dep.js', confidence: 0.5 }
  ]);

  await runChainAudit({
    args: [dir, 'src/foo.js'],
    options: { json: true, feature: 'neural-chain' },
    logger: silentLogger(),
    t: tFn
  });

  const { db } = await openRuntimeDb(dir);
  try {
    const events = db.prepare(
      "SELECT event_type, message, payload_json FROM execution_events WHERE event_type = 'chain_audit'"
    ).all();
    assert.equal(events.length, 1);

    const payload = JSON.parse(events[0].payload_json);
    assert.equal(payload.source_file, 'src/foo.js');
    assert.equal(payload.feature_slug, 'neural-chain');
    assert.equal(payload.impacts_found, 1);
    assert.equal(typeof payload.duration_ms, 'number');
    assert.equal(payload.error, null);
  } finally {
    db.close();
  }
});

test('chain:audit emits telemetry with impacts_found=0 when file has no edges', async () => {
  const dir = await makeTempProject();
  await runChainAudit({
    args: [dir, 'src/unseen.js'],
    options: { json: true },
    logger: silentLogger(),
    t: tFn
  });

  const { db } = await openRuntimeDb(dir);
  try {
    const events = db.prepare(
      "SELECT payload_json FROM execution_events WHERE event_type = 'chain_audit'"
    ).all();
    assert.equal(events.length, 1);
    const payload = JSON.parse(events[0].payload_json);
    assert.equal(payload.impacts_found, 0);
  } finally {
    db.close();
  }
});

test('chain:audit results header is printed in human mode (not in JSON mode)', async () => {
  const dir = await makeTempProject();
  await seedEdges(dir, [
    { source_path: 'src/foo.js', target_path: 'src/dep.js', confidence: 0.5 }
  ]);

  const humanLogger = silentLogger();
  await runChainAudit({
    args: [dir, 'src/foo.js'],
    options: {},
    logger: humanLogger,
    t: tFn
  });
  assert.ok(humanLogger.lines.length > 0, 'human mode must emit at least the header');

  const jsonLogger = silentLogger();
  await runChainAudit({
    args: [dir, 'src/foo.js'],
    options: { json: true },
    logger: jsonLogger,
    t: tFn
  });
  assert.equal(jsonLogger.lines.length, 0, 'json mode must not emit human-readable lines');
});

test('chain:audit isolates by source_path (other files do not bleed into results)', async () => {
  const dir = await makeTempProject();
  await seedEdges(dir, [
    { source_path: 'src/foo.js', target_path: 'src/foo-dep.js', confidence: 0.8 },
    { source_path: 'src/bar.js', target_path: 'src/bar-dep.js', confidence: 0.9 }
  ]);

  const result = await runChainAudit({
    args: [dir, 'src/foo.js'],
    options: { json: true },
    logger: silentLogger(),
    t: tFn
  });
  assert.equal(result.impacts_found, 1);
  assert.equal(result.impacts[0].target_path, 'src/foo-dep.js');
});
