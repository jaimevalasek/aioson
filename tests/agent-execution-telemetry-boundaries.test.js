'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createTelemetryBridge } = require('../src/agent-execution/telemetry-bridge');
const {
  openRuntimeDb,
  createExecutionRun,
  attachExecutionProcess,
  appendExecutionEvent,
  listExecutionEvents,
  findExecutionRun,
  pruneExecutionTelemetry,
} = require('../src/runtime-store');

async function fixture(prefix) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const opened = await openRuntimeDb(dir);
  return { dir, ...opened };
}

function correlation(suffix = 'one') {
  return {
    feature: 'agent-execution-telemetry-bridge',
    agent: 'dev',
    dispatcher_run_id: `run-${suffix}`,
    attempt_id: `attempt-${suffix}`,
    host: 'codex',
    model: 'test-model',
  };
}

test('AC-04: partial stdout and stderr chunks remain isolated by stream', async () => {
  const { dir } = await fixture('aex-stream-isolation-');
  const bridge = await createTelemetryBridge(dir, correlation(), { flushMs: 60_000 });

  bridge.output('stderr', 'stderr-part');
  bridge.output('stdout', 'stdout-line\n');
  bridge.close();

  const { db } = await openRuntimeDb(dir);
  const output = listExecutionEvents(db, bridge.run.telemetry_run_id, { limit: 100 })
    .events.filter((event) => event.event_type === 'output');
  assert.deepEqual(
    output.map((event) => [event.stream, event.safe_summary]),
    [['stdout', 'stdout-line\n'], ['stderr', 'stderr-part']],
  );
  db.close();
});

test('AC-09: exact final page reports has_more false', async () => {
  const { db } = await fixture('aex-cursor-final-');
  const run = createExecutionRun(db, correlation());
  appendExecutionEvent(db, run.telemetry_run_id, { type: 'diagnostic', safe_summary: 'only item' });

  const page = listExecutionEvents(db, run.telemetry_run_id, { after: 1, limit: 1 });
  assert.equal(page.events.length, 1);
  assert.equal(page.next_cursor, 2);
  assert.equal(page.has_more, false);
  db.close();
});

test('AC-10: retention never removes an active running execution', async () => {
  const { db } = await fixture('aex-retention-active-');
  const c = correlation();
  createExecutionRun(db, c);
  attachExecutionProcess(db, c, { pid: 4242, fingerprint: 'process-fingerprint' });
  db.prepare("UPDATE agent_execution_runs SET updated_at='2000-01-01T00:00:00Z'").run();

  assert.equal(pruneExecutionTelemetry(db, { retentionDays: 1, batch: 10 }), 0);
  assert.equal(findExecutionRun(db, c).state, 'running');
  db.close();
});
