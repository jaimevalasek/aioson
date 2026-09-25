'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { runSquadAutorun } = require('../src/commands/squad-autorun');
const { loadPlan, savePlan, updateTaskStatus } = require('../src/squad/task-decomposer');
const { spawn } = require('node:child_process');
const { reflect, reflectLoop, loadChecklist } = require('../src/squad/reflection');
const { scaffoldWorker } = require('../src/worker-runner');

function reflectionContext(fixture) {
  return { projectDir: fixture.projectDir, squadSlug: fixture.squadSlug, executorSlug: 'executor' };
}

async function changePlan(fixture, change) {
  const plan = await loadPlan(fixture.projectDir, fixture.squadSlug, fixture.sessionId);
  change(plan);
  await savePlan(fixture.projectDir, fixture.squadSlug, fixture.sessionId, plan);
}

async function addWorker(fixture, slug, script) {
  const directory = path.join(fixture.projectDir, '.aioson/squads', fixture.squadSlug, 'workers', slug);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, 'worker.json'), JSON.stringify({ slug, type: 'manual', retry: { attempts: 1 } }));
  await fs.writeFile(path.join(directory, 'run.js'), script);
}

async function configureBudget(fixture, budget) {
  const file = path.join(fixture.projectDir, '.aioson/squads', fixture.squadSlug, 'squad.manifest.json');
  const manifest = JSON.parse(await fs.readFile(file, 'utf8'));
  manifest.budget = budget;
  await fs.writeFile(file, JSON.stringify(manifest));
}

const countedWorker = [
  "const fs=require('node:fs'); const path=require('node:path');",
  "const input=JSON.parse(process.argv[2]);",
  "fs.appendFileSync(path.join(__dirname,'effects.txt'),input.task_id+'\\n');",
  "process.stdout.write(JSON.stringify({result:'delivered'}));"
].join('\n');

function effectsFile(fixture, worker = 'executor') {
  return path.join(fixture.projectDir, '.aioson/squads', fixture.squadSlug, 'workers', worker, 'effects.txt');
}

async function configureDependencies(fixture, dependencies, extra = {}) {
  const file = path.join(fixture.projectDir, '.aioson/squads', fixture.squadSlug, 'squad.manifest.json');
  const manifest = JSON.parse(await fs.readFile(file, 'utf8'));
  await fs.writeFile(file, JSON.stringify({ ...manifest, depends_on: dependencies, ...extra }));
}

async function readEventRows(fixture) {
  const { db } = await require('../src/runtime-store').openRuntimeDb(fixture.projectDir);
  try { return db.prepare('SELECT * FROM inter_squad_events ORDER BY id').all(); }
  finally { db.close(); }
}

test('event remains pending across budget pause and reaches the resumed worker with its payload', async (t) => {
  const fixture = await makeFixture({ workerScript: "const input=JSON.parse(process.argv[2]);require('fs').writeFileSync(require('path').join(__dirname,'input.json'),JSON.stringify(input));process.stdout.write(JSON.stringify({result:'delivered'}));" });
  t.after(() => fs.rm(fixture.projectDir, { recursive: true, force: true }));
  await configureDependencies(fixture, [{ squad: 'source', event: 'asset.ready' }]);
  const events = require('../src/squad/inter-squad-events');
  const id = await events.publish(fixture.projectDir, { fromSquad: 'source', event: 'asset.ready', payload: { file: 'asset.txt' } });
  await configureBudget(fixture, { max_tokens_per_session: 0 });
  assert.equal((await runFixture(fixture)).status, 'paused_budget');
  assert.equal((await readEventRows(fixture))[0].consumed_by, '[]');
  const pausedPlan = await loadPlan(fixture.projectDir, fixture.squadSlug, fixture.sessionId);
  assert.equal(pausedPlan.inter_squad_events[0].id, id);
  await configureBudget(fixture, { max_tokens_per_session: null });
  const resumed = await runFixture(fixture);
  assert.equal(resumed.ok, true);
  const input = JSON.parse(await fs.readFile(path.join(path.dirname(effectsFile(fixture)), 'input.json'), 'utf8'));
  assert.deepEqual(input.inter_squad_events[0].payload, { file: 'asset.txt' });
  assert.equal((await readEventRows(fixture))[0].consumed_by, JSON.stringify([fixture.squadSlug]));
});

test('failed event execution is not acknowledged and another session cannot steal it', async (t) => {
  const fixture = await makeFixture({ workerScript: 'process.exit(1);' });
  t.after(() => fs.rm(fixture.projectDir, { recursive: true, force: true }));
  await configureDependencies(fixture, [], { subscriptions: ['asset.*'] });
  await require('../src/squad/inter-squad-events').publish(fixture.projectDir, { fromSquad: 'source', event: 'asset.ready' });
  assert.equal((await runFixture(fixture)).ok, false);
  assert.equal((await readEventRows(fixture))[0].consumed_by, '[]');
  const other = await loadPlan(fixture.projectDir, fixture.squadSlug, fixture.sessionId);
  other.session_id = 'competing';
  other.tasks[0].status = 'pending';
  await savePlan(fixture.projectDir, fixture.squadSlug, 'competing', other);
  const result = await runFixture(fixture, { plan: 'competing' });
  assert.equal(result.error, 'event_session_conflict');
  assert.equal(result.session_id, fixture.sessionId);
});

test('dependency checks preserve available events while another dependency is missing', async (t) => {
  const fixture = await makeFixture({ workerScript: countedWorker });
  t.after(() => fs.rm(fixture.projectDir, { recursive: true, force: true }));
  await configureDependencies(fixture, [{ squad: 'source', event: 'asset.ready' }, { squad: 'review', event: 'review.ready' }]);
  await require('../src/squad/inter-squad-events').publish(fixture.projectDir, { fromSquad: 'source', event: 'asset.ready', payload: { file: 'asset.txt' } });
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await runFixture(fixture);
    assert.equal(result.error, 'unmet_dependencies');
    assert.deepEqual(result.unmet, [{ squad: 'review', event: 'review.ready' }]);
    assert.equal((await readEventRows(fixture))[0].consumed_by, '[]');
  }
  await assert.rejects(fs.access(effectsFile(fixture)), { code: 'ENOENT' });
});

test('dependency event from a different squad cannot authorize execution', async (t) => {
  const fixture = await makeFixture({ workerScript: countedWorker });
  t.after(() => fs.rm(fixture.projectDir, { recursive: true, force: true }));
  await configureDependencies(fixture, [{ squad: 'expected', event: 'asset.ready' }]);
  await require('../src/squad/inter-squad-events').publish(fixture.projectDir, { fromSquad: 'other', event: 'asset.ready' });
  assert.equal((await runFixture(fixture)).error, 'unmet_dependencies');
  assert.equal((await readEventRows(fixture))[0].consumed_by, '[]');
  await assert.rejects(fs.access(effectsFile(fixture)), { code: 'ENOENT' });
});

test('overlapping dependency patterns can observe the same source event', async (t) => {
  const fixture = await makeFixture({ workerScript: countedWorker });
  t.after(() => fs.rm(fixture.projectDir, { recursive: true, force: true }));
  await configureDependencies(fixture, [{ squad: 'source', event: 'asset.*' }, { squad: 'source', event: 'asset.ready' }]);
  await require('../src/squad/inter-squad-events').publish(fixture.projectDir, { fromSquad: 'source', event: 'asset.ready' });
  assert.equal((await runFixture(fixture)).ok, true);
  assert.equal(await fs.readFile(effectsFile(fixture), 'utf8'), 'task-1\n');
});

test('peek filters expired and consumed events without changing stored rows', async (t) => {
  const fixture = await makeFixture();
  t.after(() => fs.rm(fixture.projectDir, { recursive: true, force: true }));
  const events = require('../src/squad/inter-squad-events');
  const expired = await events.publish(fixture.projectDir, { fromSquad: 'source', event: 'asset.old' });
  const consumed = await events.publish(fixture.projectDir, { fromSquad: 'source', event: 'asset.used' });
  const pending = await events.publish(fixture.projectDir, { fromSquad: 'source', event: 'asset.ready', payload: { file: 'asset.txt' } });
  const { db } = await require('../src/runtime-store').openRuntimeDb(fixture.projectDir);
  try {
    db.prepare('UPDATE inter_squad_events SET created_at = ? WHERE id = ?').run('2000-01-01T00:00:00.000Z', expired);
    db.prepare('UPDATE inter_squad_events SET consumed_by = ? WHERE id = ?').run(JSON.stringify([fixture.squadSlug]), consumed);
  } finally { db.close(); }
  const before = await readEventRows(fixture);
  const selected = await events.peek(fixture.projectDir, { toSquad: fixture.squadSlug, subscriptions: ['asset.*'], fromSquad: 'source' });
  assert.deepEqual(selected.map((event) => event.id), [pending]);
  assert.deepEqual(selected[0].payload, { file: 'asset.txt' });
  assert.deepEqual(await readEventRows(fixture), before);
});

test('zero budget pauses without effects; null limits stay unlimited and invalid limits fail closed', async (t) => {
  const fixture = await makeFixture({ workerScript: countedWorker });
  t.after(() => fs.rm(fixture.projectDir, { recursive: true, force: true }));
  await configureBudget(fixture, { max_tokens_per_session: 0 });
  const paused = await runFixture(fixture);
  assert.equal(paused.ok, false);
  assert.equal(paused.status, 'paused_budget');
  assert.equal(paused.budget_usage.attempts, 0);
  assert.equal(paused.budget_usage.measured_tokens, null);
  assert.equal((await readTask(fixture)).status, 'paused_budget');
  await assert.rejects(fs.access(effectsFile(fixture)), { code: 'ENOENT' });
  await configureBudget(fixture, { max_tokens_per_session: -1 });
  await assert.rejects(runFixture(fixture), /Invalid budget/);
  await configureBudget(fixture, { max_tokens_per_session: null, max_tokens_per_task: null });
  assert.equal((await runFixture(fixture)).ok, true);
});

test('session budget survives resume, completed effects stay untouched and remaining dependency completes', async (t) => {
  const fixture = await makeFixture({ workerScript: countedWorker });
  t.after(() => fs.rm(fixture.projectDir, { recursive: true, force: true }));
  await changePlan(fixture, (plan) => { plan.tasks.push({ ...plan.tasks[0], id: 'task-2', dependencies: ['task-1'] }); });
  await configureBudget(fixture, { max_tokens_per_session: 900 });
  const paused = await runFixture(fixture);
  assert.equal(paused.status, 'paused_budget');
  assert.equal(paused.tasks.completed, 1);
  const stateManager = require('../src/squad/state-manager');
  const pausedState = await stateManager.readState(fixture.projectDir, fixture.squadSlug);
  assert.equal(pausedState.meta.sessions_completed || 0, 0);
  assert.equal(pausedState.meta.execution_status, 'paused_budget');
  assert.ok(pausedState.pending.some((item) => item.includes(fixture.sessionId)));
  assert.equal(await fs.readFile(effectsFile(fixture), 'utf8'), 'task-1\n');
  const accepted = JSON.stringify(await readTask(fixture));
  const again = await runFixture(fixture);
  assert.equal(again.status, 'paused_budget');
  assert.equal(again.budget_used, paused.budget_used);
  await configureBudget(fixture, { max_tokens_per_session: 5000 });
  const completed = await runFixture(fixture);
  assert.equal(completed.ok, true);
  assert.equal(completed.status, 'completed');
  assert.equal(completed.budget_usage.attempts, 2);
  assert.ok(completed.budget_used > paused.budget_used);
  assert.equal(JSON.stringify(await readTask(fixture)), accepted);
  assert.equal(await fs.readFile(effectsFile(fixture), 'utf8'), 'task-1\ntask-2\n');
  await runFixture(fixture);
  const finalState = await stateManager.readState(fixture.projectDir, fixture.squadSlug);
  assert.equal(finalState.meta.sessions_completed, 1);
  assert.equal(finalState.meta.tasks_completed_total, 2);
  assert.equal(finalState.pending.some((item) => item.includes(fixture.sessionId)), false);
});

test('parallel workers reserve against one session balance', async (t) => {
  const fixture = await makeFixture({ workerScript: countedWorker });
  t.after(() => fs.rm(fixture.projectDir, { recursive: true, force: true }));
  await changePlan(fixture, (plan) => { plan.tasks.push({ ...plan.tasks[0], id: 'task-2' }, { ...plan.tasks[0], id: 'task-3' }); });
  await configureBudget(fixture, { max_tokens_per_session: 900, action_on_exceed: 'abort' });
  const result = await runFixture(fixture, { sequential: false });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'paused_budget');
  assert.equal(result.budget_usage.pause.action, 'abort');
  assert.equal(result.budget_usage.attempts, 1);
  assert.ok(result.budget_used <= 900);
  assert.equal((await fs.readFile(effectsFile(fixture), 'utf8')).trim().split('\n').length, 1);
});

test('per-task budget checks internal retries and retains the last failed attempt', async (t) => {
  const fixture = await makeFixture({ workerScript: countedWorker.replace("process.stdout.write(JSON.stringify({result:'delivered'}));", "process.exit(1);") });
  t.after(() => fs.rm(fixture.projectDir, { recursive: true, force: true }));
  const workerConfig = path.join(path.dirname(effectsFile(fixture)), 'worker.json');
  await fs.writeFile(workerConfig, JSON.stringify({ slug: 'executor', type: 'manual', retry: { attempts: 2 } }));
  await configureBudget(fixture, { max_tokens_per_task: 900 });
  const result = await runFixture(fixture, { 'no-gap-closure': false });
  assert.equal(result.status, 'paused_budget');
  assert.equal(result.budget_usage.pause.scope, 'task');
  assert.equal(result.budget_usage.attempts, 1);
  assert.equal(await fs.readFile(effectsFile(fixture), 'utf8'), 'task-1\n');
  assert.equal((await readTask(fixture)).result.last_worker_attempt.ok, false);
});

test('pause before reviewer preserves generator output and resumes only review', async (t) => {
  const fixture = await makeFixture({ workerScript: countedWorker });
  t.after(() => fs.rm(fixture.projectDir, { recursive: true, force: true }));
  await addWorker(fixture, 'qa', "const input=JSON.parse(process.argv[2]); if(!input.artifact) process.exit(1); process.stdout.write(JSON.stringify({verdict:'PASS'}));");
  await changePlan(fixture, (plan) => { Object.assign(plan.tasks[0], { review_loop: true, reviewer: 'qa' }); });
  await configureBudget(fixture, { max_tokens_per_session: 900 });
  assert.equal((await runFixture(fixture)).status, 'paused_budget');
  assert.equal((await readTask(fixture)).result.budget_resume.kind, 'review');
  await configureBudget(fixture, { max_tokens_per_session: 5000 });
  const result = await runFixture(fixture);
  assert.equal(result.ok, true);
  assert.equal(result.budget_usage.attempts, 2);
  assert.deepEqual(Object.keys(result.budget_usage.task_estimates), ['task-1']);
  assert.equal(await fs.readFile(effectsFile(fixture), 'utf8'), 'task-1\n');
});

test('voting resume retains accepted candidates and only runs missing instances', async (t) => {
  const fixture = await makeFixture({ workerScript: countedWorker });
  t.after(() => fs.rm(fixture.projectDir, { recursive: true, force: true }));
  await changePlan(fixture, (plan) => { plan.tasks[0].voting = { instances: 2, threshold: 1 }; });
  await configureBudget(fixture, { max_tokens_per_session: 900 });
  assert.equal((await runFixture(fixture)).status, 'paused_budget');
  assert.equal((await readTask(fixture)).result.budget_resume.kind, 'voting');
  await configureBudget(fixture, { max_tokens_per_session: 5000 });
  const result = await runFixture(fixture);
  assert.equal(result.ok, true);
  assert.equal(result.budget_usage.attempts, 2);
  assert.equal(await fs.readFile(effectsFile(fixture), 'utf8'), 'task-1\ntask-1\n');
});

test('legacy budget skips become resumable, intentional skips remain untouched', async (t) => {
  const fixture = await makeFixture({ workerScript: countedWorker });
  t.after(() => fs.rm(fixture.projectDir, { recursive: true, force: true }));
  await changePlan(fixture, (plan) => {
    plan.tasks[0].status = 'skipped';
    plan.tasks[0].result = { skip_reason: 'budget_exceeded' };
    plan.tasks.push({ ...plan.tasks[0], id: 'intentional', result: { skip_reason: 'operator_choice' } });
  });
  await runFixture(fixture);
  const plan = await loadPlan(fixture.projectDir, fixture.squadSlug, fixture.sessionId);
  assert.deepEqual(plan.tasks.map((task) => task.status), ['completed', 'skipped']);
  assert.equal(await fs.readFile(effectsFile(fixture), 'utf8'), 'task-1\n');
});

test('legacy completed work initializes a labelled estimate instead of resetting the session balance', async (t) => {
  const fixture = await makeFixture({ workerScript: countedWorker });
  t.after(() => fs.rm(fixture.projectDir, { recursive: true, force: true }));
  await changePlan(fixture, (plan) => {
    plan.tasks.push({ ...plan.tasks[0], id: 'task-2', dependencies: ['task-1'] });
    plan.tasks[0].status = 'completed';
    plan.tasks[0].result = { attempt_history: [{ worker_ran: true, status: 'completed' }] };
  });
  await configureBudget(fixture, { max_tokens_per_session: 900 });
  const result = await runFixture(fixture);
  assert.equal(result.status, 'paused_budget');
  assert.equal(result.budget_usage.history_complete, false);
  assert.equal(result.budget_usage.attempts, 1);
  assert.ok(result.budget_used > 0);
  await assert.rejects(fs.access(effectsFile(fixture)), { code: 'ENOENT' });
});

test('real CLI pause returns exit 1 and resumes through the same session after limit change', async (t) => {
  const fixture = await makeFixture({ workerScript: countedWorker });
  t.after(() => fs.rm(fixture.projectDir, { recursive: true, force: true }));
  await configureBudget(fixture, { max_tokens_per_session: 0 });
  const invoke = () => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, '../bin/aioson.js'), 'squad:autorun', fixture.projectDir,
      `--squad=${fixture.squadSlug}`, `--plan=${fixture.sessionId}`, '--json'], { windowsHide: true });
    let stdout = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.resume();
    child.on('error', reject);
    child.on('exit', (code) => {
      try { resolve({ code, result: JSON.parse(stdout) }); } catch (error) { reject(error); }
    });
  });
  const paused = await invoke();
  assert.equal(paused.code, 1);
  assert.equal(paused.result.status, 'paused_budget');
  assert.equal(paused.result.tasks.completed, 0);
  assert.equal(paused.result.budget_usage.measured_tokens, null);
  await configureBudget(fixture, { max_tokens_per_session: 5000 });
  const resumed = await invoke();
  assert.equal(resumed.code, 0);
  assert.equal(resumed.result.status, 'completed');
  assert.equal(resumed.result.session_id, paused.result.session_id);
  assert.equal(await fs.readFile(effectsFile(fixture), 'utf8'), 'task-1\n');
});

test('canonical executor checklist and iteration cap win over legacy configuration', async (t) => {
  const fixture = await makeFixture();
  t.after(() => fs.rm(fixture.projectDir, { recursive: true, force: true }));
  const directory = path.dirname(path.dirname(fixture.sessionDir));
  await fs.writeFile(path.join(directory, 'squad.manifest.json'), JSON.stringify({ executors: [{
    slug: 'executor', reflection: { max_iterations: 1, checklist: [{ id: 'non_empty', label: 'Canonical evidence', critical: true }] }
  }] }));
  await fs.writeFile(path.join(directory, 'squad.json'), JSON.stringify({ executors: { executor: { reflection: { checklist: ['legacy'] } } } }));
  const result = await reflect('', reflectionContext(fixture));
  assert.equal(result.verdict, 'ESCALATE');
  assert.equal(result.max_iterations, 1);
  assert.deepEqual(result.critical_failures, ['Canonical evidence']);
  await fs.writeFile(path.join(directory, 'squad.manifest.json'), '{invalid');
  await assert.rejects(loadChecklist(fixture.projectDir, fixture.squadSlug, 'executor'), SyntaxError);
  // Legacy configuration remains readable when the canonical file is absent.
  await fs.unlink(path.join(directory, 'squad.manifest.json'));
  assert.equal((await loadChecklist(fixture.projectDir, fixture.squadSlug, 'executor'))[0].label, 'legacy');
});

test('canonical quality file and critical semantic criteria stay unverified', async (t) => {
  const fixture = await makeFixture({ workerScript: "process.stdout.write(JSON.stringify({result:'a substantive output with enough length to pass any old heuristic about relevance'}));" });
  t.after(() => fs.rm(fixture.projectDir, { recursive: true, force: true }));
  const directory = path.dirname(path.dirname(fixture.sessionDir));
  await fs.mkdir(path.join(directory, 'checklists'));
  await fs.writeFile(path.join(directory, 'checklists/quality.md'), '- [critical] Claims supported by sources');
  await fs.writeFile(path.join(directory, 'quality.md'), '- Legacy criterion');
  const result = await reflect('Long output is not proof of source accuracy.', reflectionContext(fixture));
  assert.equal(result.verdict, 'UNVERIFIED');
  assert.equal(result.passed, false);
  assert.equal(result.score, null);
  assert.deepEqual(result.unverified_critical, ['Claims supported by sources']);
  // Required configuration is enforced even without --reflect; retrying cannot supply an evaluator.
  const run = await runFixture(fixture, { 'no-gap-closure': false });
  assert.equal(run.ok, false);
  const task = await readTask(fixture);
  assert.equal(task.status, 'unverified');
  assert.equal(task.result.completed_at, null);
  assert.equal(task.result.attempt_history.length, 1);
  const semantic = await reflect('This text has more than fifty characters and more than ten words but proves nothing.', reflectionContext(fixture), {
    checklist: [{ id: 'on_topic', label: 'Relevant', critical: true }]
  });
  assert.equal(semantic.verdict, 'UNVERIFIED');
});

test('NEEDS_ITERATION never completes, limited correction receives feedback and can succeed', async (t) => {
  const fixture = await makeFixture({ workerScript: [
    "const input = JSON.parse(process.argv[2]);",
    "process.stdout.write(JSON.stringify({result: input.failure_context ? 'Corrected output with sufficient concrete text to meet the explicit length lint requirement.' : 'short'}));"
  ].join('\n') });
  t.after(() => fs.rm(fixture.projectDir, { recursive: true, force: true }));
  assert.equal((await runFixture(fixture, { reflect: true })).ok, false);
  let task = await readTask(fixture);
  assert.equal(task.status, 'needs_iteration');
  assert.equal(task.result.completed_at, null);
  await updateTaskStatus(fixture.projectDir, fixture.squadSlug, fixture.sessionId, task.id, 'pending');
  assert.equal((await runFixture(fixture, { reflect: true, 'no-gap-closure': false })).ok, true);
  task = await readTask(fixture);
  assert.equal(task.status, 'completed');
  assert.equal(task.result.attempt_history.at(-2).status, 'needs_iteration');
  assert.ok(task.result.completed_at);
});

test('reflection stops at its configured cap and does not loop unverified criteria', async (t) => {
  const fixture = await makeFixture();
  t.after(() => fs.rm(fixture.projectDir, { recursive: true, force: true }));
  let calls = 0;
  const exhausted = await reflectLoop(async () => { calls++; return ''; }, reflectionContext(fixture));
  assert.equal(exhausted.reflection.verdict, 'ESCALATE');
  assert.equal(calls, 2);
  calls = 0;
  const unknown = await reflectLoop(async () => { calls++; return 'output'; }, reflectionContext(fixture), {
    checklist: [{ id: 'custom', label: 'Needs judgment', critical: true }]
  });
  assert.equal(unknown.reflection.verdict, 'UNVERIFIED');
  assert.equal(calls, 1);
});

test('missing mandatory artifact and evaluation errors never approve even without reflect flag', async (t) => {
  const fixture = await makeFixture({ workerScript: "process.stdout.write(JSON.stringify({result:'delivered'}));" });
  t.after(() => fs.rm(fixture.projectDir, { recursive: true, force: true }));
  await changePlan(fixture, (plan) => { plan.tasks[0].must_haves = { artifacts: ['missing.md'] }; });
  assert.equal((await runFixture(fixture)).ok, false);
  assert.equal((await readTask(fixture)).result.completed_at, null);
  await changePlan(fixture, (plan) => { plan.tasks[0].status = 'pending'; plan.tasks[0].must_haves = { artifacts: 42 }; });
  assert.equal((await runFixture(fixture)).ok, false);
  assert.equal((await readTask(fixture)).status, 'unverified');
});

test('autorun refuses intact scaffold as delivery', async (t) => {
  const fixture = await makeFixture();
  t.after(() => fs.rm(fixture.projectDir, { recursive: true, force: true }));
  await scaffoldWorker(fixture.projectDir, fixture.squadSlug, 'executor');
  assert.equal((await runFixture(fixture, { 'no-gap-closure': false })).ok, false);
  const task = await readTask(fixture);
  assert.equal(task.status, 'failed');
  assert.equal(task.result.worker_ran, false);
  assert.equal(task.result.completed_at, null);
  assert.equal(task.result.attempt_history.length, 1);
});

test('voting rejects divergent completed outputs and preserves accepted identical evidence', async (t) => {
  const fixture = await makeFixture({ workerScript: "const input=JSON.parse(process.argv[2]); process.stdout.write(JSON.stringify({result:'answer '+input.voting_instance}));" });
  t.after(() => fs.rm(fixture.projectDir, { recursive: true, force: true }));
  await changePlan(fixture, (plan) => { plan.tasks[0].voting = { instances: 2, threshold: 0.66 }; });
  assert.equal((await runFixture(fixture)).ok, false);
  let task = await readTask(fixture);
  assert.equal(task.status, 'escalated');
  assert.equal(task.result.completed_at, null);
  await addWorker(fixture, 'executor', "process.stdout.write(JSON.stringify({result:'same answer'}));");
  await updateTaskStatus(fixture.projectDir, fixture.squadSlug, fixture.sessionId, task.id, 'pending');
  assert.equal((await runFixture(fixture)).ok, true);
  task = await readTask(fixture);
  assert.equal(task.result.voting.agreement_kind, 'exact_output');
  assert.equal(task.result.execution_evidence.output_present, true);
});

test('independent review sees artifact, generator sees feedback, and acceptance preserves evidence', async (t) => {
  const fixture = await makeFixture({ workerScript: "const input=JSON.parse(process.argv[2]); process.stdout.write(JSON.stringify({result:input.review_feedback ? 'fixed artifact' : 'first artifact'}));" });
  t.after(() => fs.rm(fixture.projectDir, { recursive: true, force: true }));
  await changePlan(fixture, (plan) => { Object.assign(plan.tasks[0], { review_loop: true, reviewer: 'qa', max_review_iterations: 2 }); });
  await addWorker(fixture, 'qa', [
    "const fs=require('node:fs'); const path=require('node:path');",
    "const input=JSON.parse(process.argv[2]);",
    "const plan=JSON.parse(fs.readFileSync(path.join(__dirname,'../../sessions',input.session_id,'plan.json'),'utf8'));",
    "if(plan.tasks[0].status==='completed'||plan.tasks[0].result.completed_at) throw new Error('premature acceptance');",
    "if(!input.artifact) throw new Error('missing artifact');",
    "process.stdout.write(JSON.stringify({verdict:input.artifact.result==='fixed artifact'?'PASS':'FAIL',feedback:'correct artifact'}));"
  ].join('\n'));
  assert.equal((await runFixture(fixture)).ok, true);
  const task = await readTask(fixture);
  assert.equal(task.result.eval_optimize.iterations, 2);
  assert.equal(task.result.eval_optimize.reviewer, 'qa');
  assert.equal(task.result.execution_evidence.output_present, true);
  assert.equal(task.result.attempt_history.length, 2);
  assert.ok(task.result.completed_at);
});

test('review text merely mentioning PASS does not approve', async (t) => {
  const fixture = await makeFixture({ workerScript: "process.stdout.write(JSON.stringify({result:'artifact'}));" });
  t.after(() => fs.rm(fixture.projectDir, { recursive: true, force: true }));
  await changePlan(fixture, (plan) => { Object.assign(plan.tasks[0], { review_loop: true, reviewer: 'qa', max_review_iterations: 1 }); });
  await addWorker(fixture, 'qa', "process.stdout.write(JSON.stringify({result:'Do not PASS this artifact yet'}));");
  assert.equal((await runFixture(fixture)).ok, false);
  const task = await readTask(fixture);
  assert.equal(task.status, 'escalated');
  assert.equal(task.result.completed_at, null);
  assert.ok(task.result.execution_evidence);
});

test('failed reviewer cannot approve and failure evidence is retained without blind retry', async (t) => {
  const fixture = await makeFixture({ workerScript: "process.stdout.write(JSON.stringify({result:'artifact'}));" });
  t.after(() => fs.rm(fixture.projectDir, { recursive: true, force: true }));
  await changePlan(fixture, (plan) => { Object.assign(plan.tasks[0], { review_loop: true, reviewer: 'qa', max_review_iterations: 3 }); });
  await addWorker(fixture, 'qa', "process.stdout.write(JSON.stringify({verdict:'PASS'})); process.exit(1);");
  assert.equal((await runFixture(fixture)).ok, false);
  const task = await readTask(fixture);
  assert.equal(task.status, 'escalated');
  assert.equal(task.result.completed_at, null);
  assert.equal(task.result.eval_optimize.iterations, 1);
  assert.equal(task.result.eval_optimize.evaluation.attempt_history[0].status, 'failed');
});

test('must-have behavior mentioned in output remains unverified without behavior evidence', async (t) => {
  const fixture = await makeFixture();
  t.after(() => fs.rm(fixture.projectDir, { recursive: true, force: true }));
  const result = await reflect('Authentication works and users can sign in.', {
    ...reflectionContext(fixture), task: { must_haves: { truths: ['Authentication works'] } }
  }, { checklist: [{ id: 'non_empty', label: 'Output exists', critical: true }] });
  assert.equal(result.verdict, 'UNVERIFIED');
  assert.equal(result.passed, false);
  assert.match(result.unverified_critical[0], /Authentication works/);
});

test('real CLI reports unverified contract with failure exit and no completion timestamp', async (t) => {
  const fixture = await makeFixture({ workerScript: "process.stdout.write(JSON.stringify({result:'delivered'}));" });
  t.after(() => fs.rm(fixture.projectDir, { recursive: true, force: true }));
  const directory = path.dirname(path.dirname(fixture.sessionDir));
  await fs.mkdir(path.join(directory, 'checklists'));
  await fs.writeFile(path.join(directory, 'checklists/quality.md'), '- [critical] Verify external source accuracy');
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, '../bin/aioson.js'), 'squad:autorun', fixture.projectDir,
      `--squad=${fixture.squadSlug}`, `--plan=${fixture.sessionId}`, '--json'], { windowsHide: true });
    let stdout = '';
    child.stdout.on('data', (data) => { stdout += data; });
    child.stderr.resume();
    child.on('error', reject);
    child.on('exit', (code) => {
      try { resolve({ code, result: JSON.parse(stdout) }); } catch (error) { reject(error); }
    });
  });
  assert.equal(result.code, 1);
  assert.equal(result.result.ok, false);
  assert.equal(result.result.tasks.completed, 0);
  assert.equal(result.result.evaluation_pending[0].status, 'unverified');
  const task = await readTask(fixture);
  assert.equal(task.status, 'unverified');
  assert.equal(task.result.completed_at, null);
});

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

test('failed dependency blocks downstream; independent work completes and resume preserves it', async (t) => {
  const fixture = await makeFixture({ workerScript: [
    "const fs = require('node:fs');",
    "const path = require('node:path');",
    "const input = JSON.parse(process.argv[2]);",
    "fs.appendFileSync(path.join(__dirname, 'effects.txt'), input.task_id + '\\n');",
    "process.stdout.write(JSON.stringify({ result: 'delivered' }));"
  ].join('\n') });
  t.after(() => fs.rm(fixture.projectDir, { recursive: true, force: true }));
  const plan = await loadPlan(fixture.projectDir, fixture.squadSlug, fixture.sessionId);
  const base = plan.tasks[0];
  plan.tasks = [
    { ...base, id: 'upstream', executor: 'missing' },
    { ...base, id: 'downstream', dependencies: ['upstream'] },
    { ...base, id: 'independent' }
  ];
  // Deliberately stale groups: dependency ordering must come from the graph.
  plan.parallel_groups = { 1: ['downstream', 'upstream', 'independent'] };
  await savePlan(fixture.projectDir, fixture.squadSlug, fixture.sessionId, plan);
  const result = await runFixture(fixture, { sequential: false });
  assert.equal(result.ok, false);
  assert.deepEqual(result.blocked_tasks, [{ id: 'downstream', waiting_for: ['upstream'] }]);
  let persisted = await loadPlan(fixture.projectDir, fixture.squadSlug, fixture.sessionId);
  assert.deepEqual(persisted.tasks.map((task) => task.status), ['failed', 'pending', 'completed']);
  const effectsPath = path.join(fixture.projectDir, '.aioson/squads', fixture.squadSlug, 'workers/executor/effects.txt');
  assert.equal(await fs.readFile(effectsPath, 'utf8'), 'independent\n');
  const accepted = JSON.stringify(persisted.tasks[2]);
  // Explicitly repair the failed executor and retry that task.
  persisted.tasks[0].executor = 'executor';
  persisted.tasks[0].status = 'pending';
  await savePlan(fixture.projectDir, fixture.squadSlug, fixture.sessionId, persisted);
  const resumed = await runFixture(fixture);
  assert.equal(resumed.ok, true);
  assert.equal(resumed.tasks.completed, 3);
  persisted = await loadPlan(fixture.projectDir, fixture.squadSlug, fixture.sessionId);
  assert.equal(JSON.stringify(persisted.tasks[2]), accepted);
  assert.ok(persisted.tasks[1].result.completed_at);
  assert.equal(await fs.readFile(effectsPath, 'utf8'), 'independent\nupstream\ndownstream\n');
});

test('invalid dependency plan is rejected before workers execute', async (t) => {
  const fixture = await makeFixture({ workerScript: "throw new Error('must never run');" });
  t.after(() => fs.rm(fixture.projectDir, { recursive: true, force: true }));
  const plan = await loadPlan(fixture.projectDir, fixture.squadSlug, fixture.sessionId);
  plan.tasks[0].dependencies = ['task-1'];
  await savePlan(fixture.projectDir, fixture.squadSlug, fixture.sessionId, plan);
  assert.equal((await runFixture(fixture)).error, 'invalid_plan');
  assert.equal((await readTask(fixture)).status, 'pending');
});

test('concurrent resumes have a single session owner; orphaned tasks require reconciliation', async (t) => {
  const fixture = await makeFixture({ workerScript: "setTimeout(() => process.stdout.write(JSON.stringify({ result: 'delivered' })), 300);" });
  t.after(() => fs.rm(fixture.projectDir, { recursive: true, force: true }));
  const results = await Promise.all([runFixture(fixture), runFixture(fixture)]);
  assert.equal(results.filter((result) => result.ok).length, 1);
  assert.equal(results.filter((result) => result.error === 'session_in_use').length, 1);
  await updateTaskStatus(fixture.projectDir, fixture.squadSlug, fixture.sessionId, 'task-1', 'in_progress');
  const interrupted = await runFixture(fixture);
  assert.equal(interrupted.error, 'reconciliation_required');
  assert.deepEqual(interrupted.tasks, ['task-1']);
});

test('real CLI executes dependency order and resume does not repeat accepted effects', async (t) => {
  const fixture = await makeFixture({ workerScript: [
    "const fs = require('node:fs');",
    "const path = require('node:path');",
    "const marker = path.join(__dirname, 'effects.txt');",
    "const input = JSON.parse(process.argv[2]);",
    "fs.appendFileSync(marker, input.task_id + '\\n');",
    "process.stdout.write(JSON.stringify({result:'delivered'}));"
  ].join('\n') });
  t.after(() => fs.rm(fixture.projectDir, { recursive: true, force: true }));
  const plan = await loadPlan(fixture.projectDir, fixture.squadSlug, fixture.sessionId);
  plan.tasks.push({ ...plan.tasks[0], id: 'task-2', dependencies: ['task-1'] });
  plan.parallel_groups = { 1: ['task-2', 'task-1'] };
  await savePlan(fixture.projectDir, fixture.squadSlug, fixture.sessionId, plan);
  const runCli = () => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, '../bin/aioson.js'), 'squad:autorun', fixture.projectDir,
      `--squad=${fixture.squadSlug}`, `--plan=${fixture.sessionId}`, '--json', '--no-gap-closure'], { windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (data) => { stdout += data; });
    child.stderr.on('data', (data) => { stderr += data; });
    child.on('error', reject);
    child.on('exit', (code) => {
      try {
        assert.equal(code, 0, stderr);
        resolve(JSON.parse(stdout));
      } catch (error) { reject(error); }
    });
  });
  assert.equal((await runCli()).ok, true);
  assert.equal((await runCli()).ok, true);
  const effects = await fs.readFile(path.join(fixture.projectDir, '.aioson/squads', fixture.squadSlug, 'workers/executor/effects.txt'), 'utf8');
  assert.equal(effects, 'task-1\ntask-2\n');
});

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

test('Agent Teams preparation persists prepared without completion, hooks or event acknowledgement', async t => {
  const fixture = await makeFixture({ workerScript: countedWorker });
  t.after(() => fs.rm(fixture.projectDir, { recursive: true, force: true }));
  await configureDependencies(fixture, [], { subscriptions: ['asset.*'],
    hooks: { pre_run: 'node -e "process.exit(2)"' } });
  await require('../src/squad/inter-squad-events').publish(fixture.projectDir, { fromSquad: 'source', event: 'asset.ready' });
  const script = `
    const adapter=require('./src/squad/agent-teams-adapter');
    adapter.resolveEngine=()=>({engine:'agent-teams',version:'test-boundary'});
    const {runSquadAutorun}=require('./src/commands/squad-autorun');
    runSquadAutorun({args:[process.argv[1]], options:{squad:'premium-fixture',plan:'truth-session',json:true},
      logger:{log(){},warn(){},error(){}}}).then(result=>process.stdout.write(JSON.stringify(result))).catch(e=>{console.error(e);process.exit(1)});
  `;
  const child = require('node:child_process').spawnSync(process.execPath, ['-e', script, fixture.projectDir], {
    cwd: path.resolve(__dirname, '..'), encoding: 'utf8'
  });
  assert.equal(child.status, 0, child.stderr);
  const result = JSON.parse(child.stdout);
  assert.equal(result.ok, true);
  assert.equal(result.status, 'prepared');
  assert.equal((await loadPlan(fixture.projectDir, fixture.squadSlug, fixture.sessionId)).execution_status, 'prepared');
  assert.equal((await readTask(fixture)).status, 'pending');
  const state = await require('../src/squad/state-manager').readState(fixture.projectDir, fixture.squadSlug);
  assert.equal(state.meta.sessions_completed, 0);
  assert.equal(state.meta.execution_status, 'prepared');
  assert.equal((await readEventRows(fixture))[0].consumed_by, '[]');
  await assert.rejects(fs.access(effectsFile(fixture)), { code: 'ENOENT' });
});


test('legacy execution still enforces the pre-run hook before worker effects', async t => {
  const fixture = await makeFixture({ workerScript: countedWorker });
  t.after(() => fs.rm(fixture.projectDir, { recursive: true, force: true }));
  await configureDependencies(fixture, [], { hooks: { pre_run: 'node -e "process.exit(2)"' } });
  assert.equal((await runFixture(fixture, { engine: 'legacy' })).error, 'hook_denied');
  await assert.rejects(fs.access(effectsFile(fixture)), { code: 'ENOENT' });
});

test('hook interruption fails closed instead of authorizing worker dispatch', () => {
  const { runHook } = require('../src/lib/hook-protocol');
  const result = runHook('node -e "setTimeout(()=>{},5000)"', {}, { timeoutMs: 20 });
  assert.equal(result.denied, true);
  assert.equal(result.allowed, false);
  assert.equal(result.exitCode, null);
  assert.ok(result.stderr);
});
