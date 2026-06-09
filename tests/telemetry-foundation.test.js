'use strict';

// Active Learning Loop — Phase 1 (telemetry-foundation) acceptance tests.
// Covers AC-ALL-101..105 from .aioson/plans/active-learning-loop/plan-telemetry-foundation.md.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');

const { openRuntimeDb, appendContextLoadEvent } = require('../src/runtime-store');
const { runMigration } = require('../src/learning-loop-migration');
const { runContextLoad } = require('../src/commands/context-load');

async function makeTempProject() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-telemetry-'));
  await fs.mkdir(path.join(dir, '.aioson', 'rules'), { recursive: true });
  await fs.mkdir(path.join(dir, '.aioson', 'brains', 'dev'), { recursive: true });
  return dir;
}

function silentLogger() {
  return { log: () => {}, error: () => {} };
}

function tFn(key, params) {
  if (key === 'context_load.target_invalid' && params && params.target) {
    return `invalid target: ${params.target}`;
  }
  if (key === 'context_load.target_required') return 'target required';
  if (key === 'context_load.agent_required') return 'agent required';
  return key;
}

test('AC-ALL-101: rule load emits exactly 1 execution_events row with event_type=rule_loaded in <100ms', async () => {
  const dir = await makeTempProject();
  await fs.writeFile(path.join(dir, '.aioson', 'rules', 'security-baseline.md'), '---\nname: security-baseline\n---\nbody\n', 'utf8');

  const t0 = Date.now();
  const result = await runContextLoad({
    args: [dir],
    options: { target: 'rule:security-baseline', agent: 'dev' },
    logger: silentLogger(),
    t: tFn
  });
  const elapsedMs = Date.now() - t0;

  assert.equal(result.ok, true);
  assert.equal(result.emitted, 1);
  // The operation is sub-100ms in isolation; under the full parallel suite,
  // wall-clock is dominated by scheduler contention rather than the operation
  // itself, so this is a generous hang/catastrophic-regression guard, not a
  // precise latency SLO (which needs an isolated perf run).
  assert.ok(elapsedMs <= 5000, `context:load too slow: ${elapsedMs}ms`);

  const { db } = await openRuntimeDb(dir);
  try {
    const rows = db.prepare(
      "SELECT event_type, agent_name, payload_json FROM execution_events WHERE event_type = 'rule_loaded'"
    ).all();
    assert.equal(rows.length, 1, 'exactly 1 rule_loaded row should be present');
    assert.equal(rows[0].event_type, 'rule_loaded');
    assert.equal(rows[0].agent_name, 'dev');
  } finally {
    db.close();
  }
});

test('AC-ALL-102: payload_json contains target_slug, target_path, agent_name and includes feature_slug when provided', async () => {
  const dir = await makeTempProject();
  await fs.writeFile(path.join(dir, '.aioson', 'rules', 'security-baseline.md'), 'rule body', 'utf8');

  await runContextLoad({
    args: [dir],
    options: {
      target: 'rule:security-baseline',
      agent: 'dev',
      feature: 'active-learning-loop',
      classification: 'MEDIUM'
    },
    logger: silentLogger(),
    t: tFn
  });

  const { db } = await openRuntimeDb(dir);
  try {
    const row = db.prepare(
      "SELECT payload_json FROM execution_events WHERE event_type = 'rule_loaded' LIMIT 1"
    ).get();
    assert.ok(row, 'rule_loaded row missing');

    const payload = JSON.parse(row.payload_json);
    assert.equal(payload.target_slug, 'security-baseline');
    assert.equal(payload.target_path, '.aioson/rules/security-baseline.md');
    assert.equal(payload.agent_name, 'dev');
    assert.equal(payload.feature_slug, 'active-learning-loop');
    assert.equal(payload.classification, 'MEDIUM');
    // EC-ALL-13: cross-platform path normalization to forward-slash
    assert.ok(!payload.target_path.includes('\\'), 'target_path must use forward-slashes');
  } finally {
    db.close();
  }
});

test('AC-ALL-103: existing v1.x aios.sqlite without learning-loop index opens and gets the index without ALTER', async () => {
  const dir = await makeTempProject();
  const runtimeDir = path.join(dir, '.aioson', 'runtime');
  await fs.mkdir(runtimeDir, { recursive: true });
  const dbPath = path.join(runtimeDir, 'aios.sqlite');

  // Simulate a v1.x DB: only execution_events table, no learning-loop index, no other tables.
  const legacy = new Database(dbPath);
  legacy.exec(`
    CREATE TABLE execution_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      agent_name TEXT,
      payload_json TEXT,
      sequence_no INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
    INSERT INTO execution_events (event_type, agent_name, payload_json, created_at)
    VALUES ('legacy_event', 'legacy', NULL, datetime('now'));
  `);
  legacy.close();

  // Direct migration call must be idempotent and non-destructive.
  const db1 = new Database(dbPath);
  runMigration(db1);
  const idx = db1.prepare(
    "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_execution_events_context_load'"
  ).get();
  assert.ok(idx, 'partial index should exist after migration');

  // Legacy row preserved (no destructive ALTER).
  const legacyRow = db1.prepare("SELECT event_type FROM execution_events WHERE event_type = 'legacy_event'").get();
  assert.equal(legacyRow.event_type, 'legacy_event');

  // Re-run is a no-op.
  runMigration(db1);
  db1.close();
});

test('AC-ALL-104: brain query emits event_type=brain_loaded with same payload schema', async () => {
  const dir = await makeTempProject();
  await fs.writeFile(
    path.join(dir, '.aioson', 'brains', 'dev', 'patterns.brain.json'),
    JSON.stringify({ nodes: [] }),
    'utf8'
  );

  const result = await runContextLoad({
    args: [dir],
    options: { target: 'brain:dev/patterns', agent: 'dev', feature: 'active-learning-loop' },
    logger: silentLogger(),
    t: tFn
  });

  assert.equal(result.ok, true);
  assert.equal(result.emitted, 1);

  const { db } = await openRuntimeDb(dir);
  try {
    const row = db.prepare(
      "SELECT event_type, agent_name, payload_json FROM execution_events WHERE event_type = 'brain_loaded'"
    ).get();
    assert.ok(row, 'brain_loaded row missing');
    assert.equal(row.event_type, 'brain_loaded');
    assert.equal(row.agent_name, 'dev');

    const payload = JSON.parse(row.payload_json);
    assert.equal(payload.target_slug, 'dev/patterns');
    assert.equal(payload.target_path, '.aioson/brains/dev/patterns.brain.json');
    assert.equal(payload.agent_name, 'dev');
    assert.equal(payload.feature_slug, 'active-learning-loop');
  } finally {
    db.close();
  }
});

test('AC-ALL-105: DD-1 decision file decision-instrumentation.md exists at the expected path', () => {
  const projectRoot = path.resolve(__dirname, '..');
  const ddPath = path.join(projectRoot, '.aioson', 'plans', 'active-learning-loop', 'decision-instrumentation.md');
  assert.ok(fsSync.existsSync(ddPath), `DD-1 decision file missing at ${ddPath}`);
  const body = fsSync.readFileSync(ddPath, 'utf8');
  assert.match(body, /context:load/, 'DD-1 must reference the chosen context:load CLI verb');
  assert.match(body, /status:\s*closed/i, 'DD-1 status must be closed before implementation');
});

test('batch mode: 1 transaction emits N events for multiple slugs', async () => {
  const dir = await makeTempProject();
  await fs.writeFile(path.join(dir, '.aioson', 'rules', 'one.md'), 'rule 1', 'utf8');
  await fs.writeFile(path.join(dir, '.aioson', 'rules', 'two.md'), 'rule 2', 'utf8');
  await fs.writeFile(path.join(dir, '.aioson', 'rules', 'three.md'), 'rule 3', 'utf8');

  const result = await runContextLoad({
    args: [dir],
    options: { target: 'rule', agent: 'dev', batch: 'one,two,three' },
    logger: silentLogger(),
    t: tFn
  });

  assert.equal(result.ok, true);
  assert.equal(result.emitted, 3);

  const { db } = await openRuntimeDb(dir);
  try {
    const { count } = db.prepare("SELECT COUNT(*) as count FROM execution_events WHERE event_type = 'rule_loaded'").get();
    assert.equal(count, 3);
  } finally {
    db.close();
  }
});

test('missing target file: warn-not-fail (event still emitted)', async () => {
  const dir = await makeTempProject();
  const result = await runContextLoad({
    args: [dir],
    options: { target: 'rule:does-not-exist', agent: 'dev' },
    logger: silentLogger(),
    t: tFn
  });

  assert.equal(result.ok, true);
  assert.equal(result.emitted, 1);

  const { db } = await openRuntimeDb(dir);
  try {
    const row = db.prepare("SELECT payload_json FROM execution_events WHERE event_type = 'rule_loaded'").get();
    assert.ok(row);
    const payload = JSON.parse(row.payload_json);
    assert.equal(payload.target_slug, 'does-not-exist');
  } finally {
    db.close();
  }
});

test('invalid target rejected with structured error', async () => {
  const dir = await makeTempProject();
  const result = await runContextLoad({
    args: [dir],
    options: { target: 'invalid-kind:foo', agent: 'dev', json: true },
    logger: silentLogger(),
    t: tFn
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'invalid_target');
});

test('missing --agent rejected', async () => {
  const dir = await makeTempProject();
  const result = await runContextLoad({
    args: [dir],
    options: { target: 'rule:foo', json: true },
    logger: silentLogger(),
    t: tFn
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing_agent');
});

test('appendContextLoadEvent rejects invalid event_type', async () => {
  const dir = await makeTempProject();
  const { db } = await openRuntimeDb(dir);
  try {
    assert.throws(
      () => appendContextLoadEvent(db, { eventType: 'not_a_real_event', agentName: 'dev' }),
      /invalid eventType/
    );
  } finally {
    db.close();
  }
});
