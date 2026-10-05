'use strict';

// aios.sqlite lifecycle: stale "active" rows no longer pin telemetry or block
// compaction, a closed feature's raw lane output goes away at feature:close,
// and the freed pages are handed back to the disk.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { openRuntimeDb } = require('../src/runtime-store');
const {
  pruneRuntimeData,
  liveRuntimeCounts,
  assessRuntimeDbHealth,
  purgeFeatureExecutionOutput,
  maintainRuntimeDb,
  getRuntimeStorageReport
} = require('../src/runtime-maintenance');
const { runFeatureClose } = require('../src/commands/feature-close');
const { runDoctor, applyDoctorFixes } = require('../src/doctor');

const NOW = Date.parse('2026-08-03T12:00:00.000Z');
const OLD = '2026-05-01T12:00:00.000Z';
const MINUTES_AGO = (minutes) => new Date(NOW - minutes * 60 * 1000).toISOString();

async function tempProject() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-runtime-lifecycle-'));
}

function insertExecutionRun(db, id, { feature = 'storage', state = 'passed', updatedAt = OLD } = {}) {
  db.prepare(`
    INSERT INTO agent_execution_runs(
      telemetry_run_id, dispatcher_run_id, attempt_id, feature, agent, host, model,
      state, created_at, updated_at, finished_at
    ) VALUES (?, ?, 'attempt-1', ?, 'dev', 'codex', 'model', ?, ?, ?, NULL)
  `).run(id, `dispatch-${id}`, feature, state, OLD, updatedAt);
}

function insertOutput(db, runId, count, { createdAt = OLD, size = 64, from = 1 } = {}) {
  const insert = db.prepare(`
    INSERT INTO agent_execution_events(telemetry_run_id, sequence_no, event_type, stream, safe_summary, bytes, created_at)
    VALUES (?, ?, 'output', 'stdout', ?, ?, ?)
  `);
  db.transaction(() => {
    for (let index = 0; index < count; index += 1) insert.run(runId, from + index, 'x'.repeat(size), size, createdAt);
  })();
}

function insertLifecycle(db, runId, sequence, createdAt = OLD) {
  db.prepare(`
    INSERT INTO agent_execution_events(telemetry_run_id, sequence_no, event_type, safe_summary, created_at)
    VALUES (?, ?, 'state_changed', 'passed', ?)
  `).run(runId, sequence, createdAt);
}

function count(db, sql, ...params) {
  return db.prepare(sql).get(...params).count;
}

test('retention reaches output of runs a dead engine left in a non-terminal state', async () => {
  const { db } = await openRuntimeDb(await tempProject());
  try {
    insertExecutionRun(db, 'stuck-correcting', { state: 'correcting', updatedAt: OLD });
    insertExecutionRun(db, 'stuck-running', { state: 'running', updatedAt: OLD });
    insertExecutionRun(db, 'live-running', { state: 'running', updatedAt: MINUTES_AGO(5) });
    insertOutput(db, 'stuck-correcting', 3);
    insertOutput(db, 'stuck-running', 2);
    insertOutput(db, 'live-running', 2);
    insertOutput(db, 'live-running', 1, { createdAt: MINUTES_AGO(1), from: 10 });

    pruneRuntimeData(db, { historyDays: 30, outputDays: 14, now: NOW });

    assert.equal(count(db, "SELECT COUNT(*) count FROM agent_execution_events WHERE telemetry_run_id IN ('stuck-correcting','stuck-running')"), 0,
      'a waiting state expires by inactivity; a process state with no event in the window is a dead engine');
    assert.equal(count(db, "SELECT COUNT(*) count FROM agent_execution_runs WHERE telemetry_run_id = 'stuck-correcting'"), 0);
    assert.equal(count(db, "SELECT COUNT(*) count FROM agent_execution_runs WHERE telemetry_run_id = 'stuck-running'"), 1,
      'AC-10: retention never removes the row of a running execution');
    assert.equal(count(db, "SELECT COUNT(*) count FROM agent_execution_events WHERE telemetry_run_id = 'live-running'"), 3,
      'a running execution still emitting keeps its whole tail');
  } finally {
    db.close();
  }
});

test('abandoned sessions recovered by agent:recover become prunable history', async () => {
  const { db } = await openRuntimeDb(await tempProject());
  try {
    db.prepare("INSERT INTO tasks(task_key,title,status,created_at,updated_at,finished_at) VALUES ('task-gone','t','abandoned',?,?,?)").run(OLD, OLD, OLD);
    db.prepare("INSERT INTO agent_runs(run_key,task_key,agent_name,title,status,started_at,updated_at,finished_at) VALUES ('run-gone','task-gone','@dev','r','abandoned',?,?,?)").run(OLD, OLD, OLD);
    pruneRuntimeData(db, { historyDays: 30, outputDays: 14, now: NOW });
    assert.equal(count(db, "SELECT COUNT(*) count FROM agent_runs WHERE run_key='run-gone'"), 0);
    assert.equal(count(db, "SELECT COUNT(*) count FROM tasks WHERE task_key='task-gone'"), 0);
  } finally {
    db.close();
  }
});

test('only recently moved work counts as live; stale active rows are reported, not blocking', async () => {
  const { db, dbPath } = await openRuntimeDb(await tempProject());
  try {
    db.prepare("INSERT INTO agent_runs(run_key,agent_name,title,status,started_at,updated_at) VALUES ('run-stale','@dev','r','running',?,?)").run(OLD, OLD);
    db.prepare("INSERT INTO agent_runs(run_key,agent_name,title,status,started_at,updated_at) VALUES ('run-live','@dev','r','running',?,?)").run(OLD, MINUTES_AGO(10));
    insertExecutionRun(db, 'exec-stale', { state: 'running', updatedAt: OLD });
    insertExecutionRun(db, 'exec-quiet-but-writing', { state: 'running', updatedAt: OLD });
    insertOutput(db, 'exec-quiet-but-writing', 1, { createdAt: MINUTES_AGO(1) });

    const counts = liveRuntimeCounts(db, { now: NOW });
    assert.equal(counts.live.agent_runs, 1);
    assert.equal(counts.stale.agent_runs, 1);
    assert.equal(counts.live.agent_execution_runs, 1, 'a run still emitting events is live even without a state change');
    assert.equal(counts.stale.agent_execution_runs, 1);

    const report = getRuntimeStorageReport(db, dbPath, { now: NOW });
    assert.equal(report.stale.total, 2);
    assert.ok(report.recommendations.includes('recover_stale_runs'));
    assert.equal(report.health.status, 'healthy');
  } finally {
    db.close();
  }
});

test('health flags reclaimable free pages and oversized live data', () => {
  const mb = 1024 * 1024;
  assert.equal(assessRuntimeDbHealth({ sizeBytes: 30 * mb, reclaimableFreeBytes: 2 * mb }).status, 'healthy');
  assert.equal(assessRuntimeDbHealth({ sizeBytes: 20 * mb, reclaimableFreeBytes: 9 * mb }).status, 'warn');
  assert.deepEqual(assessRuntimeDbHealth({ sizeBytes: 119 * mb, reclaimableFreeBytes: 73 * mb }).reasons, ['reclaimable_free_pages']);
  assert.deepEqual(assessRuntimeDbHealth({ sizeBytes: 100 * mb, reclaimableFreeBytes: 10 * mb }).reasons, ['live_data_oversized'],
    '10 MB free in a 100 MB file is under the ratio; 90 MB of live data is not healthy');
  assert.equal(assessRuntimeDbHealth({}).status, 'healthy');
});

test('closing a feature drops its raw lane output but keeps run history and other features', async () => {
  const { db } = await openRuntimeDb(await tempProject());
  try {
    insertExecutionRun(db, 'closed-a', { feature: 'checkout', updatedAt: MINUTES_AGO(600) });
    insertExecutionRun(db, 'closed-live', { feature: 'checkout', state: 'running', updatedAt: MINUTES_AGO(3) });
    insertExecutionRun(db, 'other', { feature: 'billing', updatedAt: MINUTES_AGO(600) });
    insertOutput(db, 'closed-a', 4, { createdAt: MINUTES_AGO(700) });
    insertLifecycle(db, 'closed-a', 99, MINUTES_AGO(700));
    insertOutput(db, 'closed-live', 2, { createdAt: MINUTES_AGO(2) });
    insertOutput(db, 'other', 3, { createdAt: MINUTES_AGO(700) });

    const deleted = purgeFeatureExecutionOutput(db, 'checkout', { now: NOW });

    assert.equal(deleted, 4);
    assert.equal(count(db, "SELECT COUNT(*) count FROM agent_execution_events WHERE telemetry_run_id='closed-a' AND event_type='state_changed'"), 1);
    assert.equal(count(db, "SELECT COUNT(*) count FROM agent_execution_runs WHERE telemetry_run_id='closed-a'"), 1);
    assert.equal(count(db, "SELECT COUNT(*) count FROM agent_execution_events WHERE telemetry_run_id='closed-live'"), 2);
    assert.equal(count(db, "SELECT COUNT(*) count FROM agent_execution_events WHERE telemetry_run_id='other'"), 3);
  } finally {
    db.close();
  }
});

test('maintenance gives the space back to the disk and holds off while work is live', async () => {
  const { db, dbPath } = await openRuntimeDb(await tempProject());
  try {
    insertExecutionRun(db, 'bulk', { feature: 'checkout', state: 'running', updatedAt: new Date(NOW).toISOString() });
    insertOutput(db, 'bulk', 5000, { createdAt: new Date(NOW).toISOString(), size: 2048 });
    db.pragma('wal_checkpoint(TRUNCATE)');
    insertExecutionRun(db, 'writer', { feature: 'billing', state: 'running', updatedAt: MINUTES_AGO(1) });

    const held = maintainRuntimeDb(db, dbPath, { feature: 'checkout', now: NOW });
    assert.equal(held.featureOutputDeleted, 0, 'the bulk run moved inside the live window, so it is still live');

    db.prepare("UPDATE agent_execution_runs SET state='passed', updated_at=? WHERE telemetry_run_id='bulk'").run(MINUTES_AGO(600));
    const blocked = maintainRuntimeDb(db, dbPath, { feature: 'checkout', now: NOW });
    assert.equal(blocked.featureOutputDeleted, 5000);
    assert.equal(blocked.compaction.ok, false);
    assert.equal(blocked.compaction.skipped, 'live_runtime');

    db.prepare("UPDATE agent_execution_runs SET state='passed', updated_at=? WHERE telemetry_run_id='writer'").run(MINUTES_AGO(600));
    const freed = maintainRuntimeDb(db, dbPath, { now: NOW });
    assert.equal(freed.compaction.ok, true);
    assert.ok(freed.compaction.afterBytes < freed.compaction.beforeBytes / 2,
      `expected the file to shrink: ${freed.compaction.beforeBytes} -> ${freed.compaction.afterBytes}`);
    assert.equal(freed.health.status, 'healthy');
  } finally {
    db.close();
  }
});

test('openRuntimeDb drops the duplicate event-cursor index on existing databases', async () => {
  const dir = await tempProject();
  const first = await openRuntimeDb(dir);
  first.db.exec('CREATE INDEX IF NOT EXISTS idx_agent_execution_events_cursor ON agent_execution_events(telemetry_run_id, sequence_no)');
  first.db.close();
  const { db } = await openRuntimeDb(dir);
  try {
    const names = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='agent_execution_events'").all().map((row) => row.name);
    assert.ok(!names.includes('idx_agent_execution_events_cursor'));
    const plan = db.prepare('EXPLAIN QUERY PLAN SELECT * FROM agent_execution_events WHERE telemetry_run_id=? AND sequence_no>? ORDER BY sequence_no').all('x', 0);
    assert.ok(plan.some((step) => /USING INDEX sqlite_autoindex_agent_execution_events_1/.test(step.detail)), JSON.stringify(plan));
  } finally {
    db.close();
  }
});

async function seedClosableProject(slug) {
  const dir = await tempProject();
  await fs.mkdir(path.join(dir, '.aioson', 'context'), { recursive: true });
  await fs.writeFile(
    path.join(dir, '.aioson', 'context', 'features.md'),
    `# Features\n\n| slug | status | started | completed |\n|------|--------|---------|-----------|\n| ${slug} | in_progress | 2026-05-13 | — |\n`,
    'utf8'
  );
  return dir;
}

test('feature:close runs the runtime lifecycle for any verdict and reports it', async () => {
  const dir = await seedClosableProject('checkout');
  const seeded = await openRuntimeDb(dir);
  insertExecutionRun(seeded.db, 'lane-1', { feature: 'checkout', state: 'correcting', updatedAt: '2026-01-01T00:00:00.000Z' });
  insertOutput(seeded.db, 'lane-1', 12, { createdAt: '2026-01-01T00:00:00.000Z' });
  seeded.db.close();

  const result = await runFeatureClose({
    args: [dir],
    options: { feature: 'checkout', verdict: 'FAIL', json: true, 'no-archive': true },
    logger: { log() {}, error() {} }
  });

  assert.equal(result.closed, true);
  assert.ok(result.runtimeMaintenance, 'feature:close must return the maintenance result');
  assert.ok(result.updates.some((line) => line.startsWith('runtime db:')), result.updates.join('\n'));
  const { db } = await openRuntimeDb(dir);
  try {
    assert.equal(count(db, "SELECT COUNT(*) count FROM agent_execution_events WHERE telemetry_run_id='lane-1' AND event_type='output'"), 0);
  } finally {
    db.close();
  }
});

test('doctor flags a bloated runtime database and --fix compacts it', async () => {
  const dir = await tempProject();
  const { db } = await openRuntimeDb(dir);
  insertExecutionRun(db, 'bulk', { state: 'passed', updatedAt: OLD });
  insertOutput(db, 'bulk', 5000, { size: 2048 });
  db.pragma('wal_checkpoint(TRUNCATE)');
  db.prepare('DELETE FROM agent_execution_events').run();
  db.pragma('wal_checkpoint(TRUNCATE)');
  db.close();

  const report = await runDoctor(dir);
  const check = report.checks.find((item) => item.id === 'runtime:db_health');
  assert.ok(check, 'doctor must report runtime:db_health');
  assert.equal(check.ok, false);
  assert.equal(check.severity, 'warning');

  // Only the runtime section of the report, so --fix does not reinstall the template here.
  const fixes = await applyDoctorFixes(dir, { checks: [], livingMemory: { runtimeDb: report.livingMemory.runtimeDb } }, { dryRun: false });
  const action = fixes.actions.find((item) => item.id === 'runtime_db_health');
  assert.equal(action.applied, true);
  assert.ok(action.reclaimedBytes > 8 * 1024 * 1024);

  const after = await runDoctor(dir);
  assert.equal(after.checks.find((item) => item.id === 'runtime:db_health').ok, true);
});
