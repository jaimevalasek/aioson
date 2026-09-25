'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { heuristicDecompose } = require('../src/squad/task-decomposer');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { savePlan, loadPlan, updateTaskStatus, validatePlanDependencies } = require('../src/squad/task-decomposer');

async function planFixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-plan-state-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const plan = { tasks: Array.from({ length: 12 }, (_, index) => ({ id: `task-${index}`, status: 'pending', dependencies: [] })) };
  await savePlan(root, 'test', 'session', plan);
  return root;
}

function runChild(script, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', script, ...args], { cwd: path.join(__dirname, '..'), windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (data) => { stderr += data; });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`Child exited ${code}: ${stderr}`)));
  });
}

test('plan updates preserve all writes in one process and across processes', async (t) => {
  const root = await planFixture(t);
  await Promise.all(Array.from({ length: 12 }, (_, i) => updateTaskStatus(root, 'test', 'session', `task-${i}`, 'completed')));
  assert.equal((await loadPlan(root, 'test', 'session')).tasks.filter((task) => task.status === 'completed').length, 12);
  await Promise.all(Array.from({ length: 12 }, (_, i) => runChild(`
    const { updateTaskStatus } = require('./src/squad/task-decomposer');
    updateTaskStatus(process.argv[1], 'test', 'session', process.argv[2], 'done').catch(error => { console.error(error); process.exitCode = 1; });
  `, [root, `task-${i}`])));
  const plan = await loadPlan(root, 'test', 'session');
  assert.equal(plan.tasks.filter((task) => task.status === 'done').length, 12);
  assert.equal(plan.revision, 25);
});

test('stale snapshots cannot overwrite task updates and corrupt plans are explicit', async (t) => {
  const root = await planFixture(t);
  const snapshot = await loadPlan(root, 'test', 'session');
  await updateTaskStatus(root, 'test', 'session', 'task-0', 'completed');
  await assert.rejects(savePlan(root, 'test', 'session', snapshot), { code: 'STALE_PLAN' });
  assert.equal((await loadPlan(root, 'test', 'session')).tasks[0].status, 'completed');
  const file = path.join(root, '.aioson/squads/test/sessions/session/plan.json');
  await fs.writeFile(file, '{broken');
  await assert.rejects(loadPlan(root, 'test', 'session'), SyntaxError);
  await assert.rejects(updateTaskStatus(root, 'test', 'session', 'task-0', 'done'), SyntaxError);
  assert.equal(await fs.readFile(file, 'utf8'), '{broken');
  assert.equal(await loadPlan(root, 'test', 'absent'), null);
});

test('process interruption on either side of atomic replacement preserves a valid plan', async (t) => {
  const root = await planFixture(t);
  for (const phase of ['before', 'after']) {
    await runChild(`
      const fs = require('node:fs');
      const original = fs.renameSync;
      fs.renameSync = (...args) => {
        if (process.argv[2] === 'after') original(...args);
        process.exit(0);
      };
      require('./src/squad/task-decomposer').updateTaskStatus(process.argv[1], 'test', 'session', 'task-0', 'completed');
    `, [root, phase]);
    const plan = await loadPlan(root, 'test', 'session');
    assert.equal(plan.tasks[0].status, phase === 'before' ? 'pending' : 'completed');
    // A crashed writer's SQLite lock is released by the operating system.
    await updateTaskStatus(root, 'test', 'session', 'task-1', 'completed');
  }
});

test('dependency validation rejects duplicate IDs, missing targets and cycles, accepts legacy roots', () => {
  assert.equal(validatePlanDependencies({ tasks: [{ id: 'one' }] }), null);
  assert.match(validatePlanDependencies({ tasks: [{ id: 'one' }, { id: 'one' }] }), /unique/);
  assert.match(validatePlanDependencies({ tasks: [{ id: 'one', dependencies: ['missing'] }] }), /unknown/);
  assert.match(validatePlanDependencies({ tasks: [{ id: 'one', dependencies: ['two'] }, { id: 'two', dependencies: ['one'] }] }), /cycle/);
});

test('session ownership excludes other processes and recovers a dead owner', async (t) => {
  const root = await planFixture(t);
  const { acquireExecution, sessionDirectory } = require('../src/squad/plan-store');
  const directory = sessionDirectory(root, 'test', 'session');
  const release = acquireExecution(directory);
  try {
    await runChild(`
      const assert = require('node:assert/strict');
      const { acquireExecution } = require('./src/squad/plan-store');
      assert.equal(acquireExecution(process.argv[1]), null);
    `, [directory]);
  } finally { release(); }
  // Simulate a crash without releasing the persistent execution owner.
  await runChild(`
    const assert = require('node:assert/strict');
    const { acquireExecution } = require('./src/squad/plan-store');
    assert.equal(typeof acquireExecution(process.argv[1]), 'function');
    process.exit(0);
  `, [directory]);
  const recovered = acquireExecution(directory);
  assert.equal(typeof recovered, 'function');
  recovered();
});

test('AC-premium-05 decomposition records owner reviewer decision rights and contribution', () => {
  const executors = [
    {
      slug: 'domain-researcher',
      role: 'Senior researcher',
      type: 'agent',
      persistent: true,
      contribution: 'Own source discovery',
      keywords: ['researcher', 'research', 'source'],
      skills: []
    },
    {
      slug: 'quality-reviewer',
      role: 'Independent quality reviewer',
      type: 'reviewer',
      persistent: true,
      contribution: 'Veto unsupported claims',
      keywords: ['reviewer', 'quality', 'validator'],
      skills: []
    }
  ];
  const plan = heuristicDecompose(
    'Research current sources; write the source-grounded recommendation; review every claim',
    executors
  );

  assert.ok(plan.tasks.length >= 3);
  for (const task of plan.tasks) {
    assert.ok(task.owner);
    assert.ok(task.reviewer);
    assert.notEqual(task.owner, task.reviewer);
    assert.equal(task.decision_right.owner, 'final');
    assert.equal(task.decision_right.reviewer, 'veto-on-quality-failure');
    assert.ok(task.contribution);
  }
  assert.deepEqual(plan.composition.persistent_core.sort(), ['domain-researcher', 'quality-reviewer']);
});

test('AC-premium-07 capability gap adds a task-bound specialist without inflating persistent core', () => {
  const executors = [{
    slug: 'integration-owner',
    role: 'Coordinator',
    type: 'agent',
    persistent: true,
    contribution: 'Integrate final output',
    keywords: ['coordinator'],
    skills: []
  }];
  const plan = heuristicDecompose(
    'Analyze quantum error correction benchmarks for the recommendation',
    executors
  );
  const task = plan.tasks[0];

  assert.equal(task.owner, 'integration-owner');
  assert.equal(task.specialist.persistent, false);
  assert.equal(task.specialist.integration_owner, 'integration-owner');
  assert.deepEqual(plan.composition.persistent_core, ['integration-owner']);
  assert.equal(plan.composition.ephemeral_specialists.length, 1);
  assert.equal(plan.composition.ephemeral_specialists[0].slug, task.specialist.slug);
});

test('Portuguese task verbs select research and review expertise', () => {
  const executors = [
    { slug: 'pesquisador', role: 'Senior researcher', type: 'agent', keywords: ['researcher'], skills: [] },
    { slug: 'revisor', role: 'Quality reviewer', type: 'reviewer', keywords: ['reviewer'], skills: [] }
  ];
  const plan = heuristicDecompose(
    'Pesquisar fontes atuais; revisar as afirmações encontradas',
    executors
  );

  assert.equal(plan.tasks[0].owner, 'pesquisador');
  assert.equal(plan.tasks[1].owner, 'revisor');
});
