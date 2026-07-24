'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { runSquadAutorun } = require('../src/commands/squad-autorun');

async function makeFixture({ workerScript = null, timeoutMs = 1000 } = {}) {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-autorun-'));
  const squadSlug = 'premium-fixture';
  const sessionId = 'truth-session';
  const squadDir = path.join(projectDir, '.aioson', 'squads', squadSlug);
  const sessionDir = path.join(squadDir, 'sessions', sessionId);
  await fs.mkdir(sessionDir, { recursive: true });
  await fs.writeFile(path.join(squadDir, 'squad.manifest.json'), JSON.stringify({
    schemaVersion: '1.0.0',
    slug: squadSlug,
    name: 'Premium fixture',
    mode: 'software',
    mission: 'Verify runtime truth',
    goal: 'Complete only executed work'
  }));
  await fs.writeFile(path.join(sessionDir, 'plan.json'), JSON.stringify({
    session_id: sessionId,
    squad_slug: squadSlug,
    goal: 'Run one task',
    tasks: [{
      id: 'task-1',
      title: 'Produce output',
      description: 'Return useful evidence',
      executor: 'executor',
      acceptance_criteria: ['output exists'],
      status: 'pending'
    }],
    parallel_groups: { 1: ['task-1'] }
  }, null, 2));

  if (workerScript !== null) {
    const workerDir = path.join(squadDir, 'workers', 'executor');
    await fs.mkdir(workerDir, { recursive: true });
    await fs.writeFile(path.join(workerDir, 'worker.json'), JSON.stringify({
      slug: 'executor',
      type: 'manual',
      timeout_ms: timeoutMs,
      retry: { attempts: 1 }
    }));
    await fs.writeFile(path.join(workerDir, 'run.js'), workerScript);
  }

  return { projectDir, squadSlug, sessionId, sessionDir };
}

async function runFixture(fixture, extraOptions = {}) {
  return runSquadAutorun({
    args: [fixture.projectDir],
    options: {
      squad: fixture.squadSlug,
      plan: fixture.sessionId,
      json: true,
      bus: false,
      sequential: true,
      'no-gap-closure': true,
      ...extraOptions
    },
    logger: { log() {}, warn() {}, error() {} }
  });
}

async function readTask(fixture) {
  const plan = JSON.parse(await fs.readFile(path.join(fixture.sessionDir, 'plan.json'), 'utf8'));
  return plan.tasks[0];
}

test('AC-premium-12 missing worker never completes or feeds completed count', async () => {
  const fixture = await makeFixture();
  const result = await runFixture(fixture);
  const task = await readTask(fixture);

  assert.equal(result.ok, false);
  assert.deepEqual(result.tasks, { total: 1, completed: 0, failed: 1, escalated: 0 });
  assert.equal(task.status, 'failed');
  assert.equal(task.result.worker_ran, false);
  assert.equal(task.result.execution_evidence, null);
  assert.equal(task.result.attempt_history[0].error, 'no_worker_script');
});

test('AC-premium-13 empty worker output is failed and retained in attempt history', async () => {
  const fixture = await makeFixture({
    workerScript: "process.stdout.write('{}');\n"
  });
  const result = await runFixture(fixture);
  const task = await readTask(fixture);

  assert.equal(result.tasks.completed, 0);
  assert.equal(result.tasks.failed, 1);
  assert.equal(task.result.attempt_history[0].error, 'invalid_worker_output');
  assert.equal(task.result.completed_at, null);
});

test('AC-premium-13 timeout is explicit and does not become successful output', async () => {
  const fixture = await makeFixture({
    workerScript: "setTimeout(() => process.stdout.write(JSON.stringify({ result: 'late' })), 1000);\n",
    timeoutMs: 20
  });
  const result = await runFixture(fixture, { timeout: 0.02 });
  const task = await readTask(fixture);

  assert.equal(result.tasks.completed, 0);
  assert.equal(result.tasks.failed, 1);
  assert.equal(task.result.attempt_history[0].timed_out, true);
  assert.match(task.result.attempt_history[0].error, /timed out/i);
});

test('AC-premium-12 executed meaningful output records causal completion evidence', async () => {
  const fixture = await makeFixture({
    workerScript: "process.stdout.write(JSON.stringify({ result: 'delivered' }));\n"
  });
  const result = await runFixture(fixture);
  const task = await readTask(fixture);

  assert.equal(result.ok, true);
  assert.equal(result.tasks.completed, 1);
  assert.equal(task.status, 'completed');
  assert.equal(task.result.worker_ran, true);
  assert.equal(task.result.execution_evidence.output_present, true);
  assert.ok(task.result.completed_at);
});

test('AC-premium-13 exhausted gap closure preserves every attempt and never marks escalation completed', async () => {
  const fixture = await makeFixture({
    workerScript: "process.stderr.write(JSON.stringify({ error: 'deterministic failure' })); process.exit(1);\n"
  });
  const result = await runFixture(fixture, {
    'no-gap-closure': false,
    'max-retries': 2
  });
  const task = await readTask(fixture);

  assert.equal(result.tasks.escalated, 1);
  assert.equal(task.status, 'escalated');
  assert.equal(task.result.gap_closure_exhausted, true);
  assert.equal(task.result.attempt_history.length, 2);
  assert.deepEqual(task.result.attempt_history.map((entry) => entry.attempt), [1, 2]);
  assert.equal(task.result.completed_at, null);
  assert.ok(task.result.finished_at);
});

test('AC-premium-07 legacy autorun never substitutes the integration owner for a task-bound specialist', async () => {
  const fixture = await makeFixture({
    workerScript: "process.stdout.write(JSON.stringify({ result: 'owner output' }));\n"
  });
  const planPath = path.join(fixture.sessionDir, 'plan.json');
  const plan = JSON.parse(await fs.readFile(planPath, 'utf8'));
  plan.tasks[0].specialist = {
    slug: 'specialist-domain',
    role: 'Domain specialist',
    contribution: 'Supply specialist evidence',
    integration_owner: 'executor'
  };
  await fs.writeFile(planPath, JSON.stringify(plan, null, 2));

  const result = await runFixture(fixture);
  const task = await readTask(fixture);
  assert.equal(result.tasks.completed, 0);
  assert.equal(task.status, 'failed');
  assert.equal(task.result.worker_ran, false);
  assert.equal(task.result.attempt_history[0].error, 'specialist_executor_unavailable');
});

test('AC-premium-07 legacy autorun executes an available task-bound specialist and keeps owner metadata', async () => {
  const fixture = await makeFixture({
    workerScript: "process.stdout.write(JSON.stringify({ result: 'owner should not run' }));\n"
  });
  const specialistDir = path.join(
    fixture.projectDir,
    '.aioson',
    'squads',
    fixture.squadSlug,
    'workers',
    'specialist-domain'
  );
  await fs.mkdir(specialistDir, { recursive: true });
  await fs.writeFile(path.join(specialistDir, 'worker.json'), JSON.stringify({
    slug: 'specialist-domain',
    type: 'manual',
    retry: { attempts: 1 }
  }));
  await fs.writeFile(path.join(specialistDir, 'run.js'), [
    "'use strict';",
    'const input = JSON.parse(process.argv[2]);',
    'process.stdout.write(JSON.stringify({',
    "  result: 'specialist output',",
    '  integration_owner: input.specialist.integration_owner',
    '}));'
  ].join('\n'));
  const planPath = path.join(fixture.sessionDir, 'plan.json');
  const plan = JSON.parse(await fs.readFile(planPath, 'utf8'));
  plan.tasks[0].specialist = {
    slug: 'specialist-domain',
    role: 'Domain specialist',
    contribution: 'Supply specialist evidence',
    integration_owner: 'executor',
    persistent: false
  };
  await fs.writeFile(planPath, JSON.stringify(plan, null, 2));

  const result = await runFixture(fixture);
  const task = await readTask(fixture);
  assert.equal(result.tasks.completed, 1);
  assert.equal(task.result.execution_evidence.worker, 'specialist-domain');
  assert.match(task.result.output_summary, /"integration_owner":"executor"/);
});
