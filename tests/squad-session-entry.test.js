'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const cli = path.resolve(__dirname, '../bin/aioson.js');

function invoke(args, json = true) {
  const result = spawnSync(process.execPath, [cli, ...args, ...(json ? ['--json'] : [])], { encoding: 'utf8' });
  return { code: result.status, output: json ? JSON.parse(result.stdout) : result.stdout, stderr: result.stderr };
}

test('session entries reject path traversal and resume without an identity', () => {
  assert.equal(invoke(['squad', 'resume', '.', '--squad=fixture']).output.error, 'missing_session');
  for (const squad of ['../outside', '..', 'nested/name', 'C:\\outside']) {
    assert.equal(invoke(['squad', 'status', '.', `--squad=${squad}`, '--session=valid']).output.error, 'invalid_identity');
  }
  for (const session of ['../outside', '..', 'nested/name']) {
    assert.equal(invoke(['squad:status', '.', '--squad=fixture', `--session=${session}`]).output.error, 'invalid_identity');
  }
});

test('run, legacy status, session status and resume share identity and preserve completed effects', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-session-entry-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const squadDir = path.join(dir, '.aioson/squads/fixture');
  const sessionDir = path.join(squadDir, 'sessions/session-one');
  const workerDir = path.join(squadDir, 'workers/executor');
  await fs.mkdir(sessionDir, { recursive: true });
  await fs.mkdir(workerDir, { recursive: true });
  await fs.writeFile(path.join(squadDir, 'squad.manifest.json'), JSON.stringify({ slug: 'fixture', mode: 'software', executors: [{ slug: 'executor', type: 'worker' }] }));
  await fs.writeFile(path.join(sessionDir, 'plan.json'), JSON.stringify({ session_id: 'session-one', squad_slug: 'fixture', goal: 'Deliver once',
    tasks: [{ id: 'one', title: 'Produce', executor: 'executor', status: 'pending', dependencies: [] }], parallel_groups: { 1: ['one'] } }));
  await fs.writeFile(path.join(workerDir, 'worker.json'), JSON.stringify({ slug: 'executor', type: 'manual', retry: { attempts: 1 } }));
  await fs.writeFile(path.join(workerDir, 'run.js'), "require('fs').appendFileSync(require('path').join(__dirname,'effects.txt'),'effect\\n');process.stdout.write(JSON.stringify({result:'delivered'}));");
  const options = [dir, '--squad=fixture', '--session=session-one'];
  const run = invoke(['squad', 'run', ...options, '--no-gap-closure']);
  assert.equal(run.code, 0, JSON.stringify(run));
  assert.equal(run.output.session_id, 'session-one');
  const before = await fs.readFile(path.join(sessionDir, 'plan.json'), 'utf8');
  const status = invoke(['squad', 'status', ...options]);
  const legacy = invoke(['squad:status', ...options]);
  assert.deepEqual(status.output, legacy.output);
  assert.equal(status.output.status, 'completed');
  assert.equal(status.output.goal, 'Deliver once');
  assert.equal(status.output.tasks.completed, 1);
  assert.ok(status.output.evidence[0].execution);
  assert.equal(await fs.readFile(path.join(sessionDir, 'plan.json'), 'utf8'), before);
  assert.match(invoke(['squad', 'status', ...options], false).output, /completed/);
  assert.equal(invoke(['squad', 'resume', ...options]).code, 0);
  assert.equal(await fs.readFile(path.join(workerDir, 'effects.txt'), 'utf8'), 'effect\n');
  const absent = invoke(['squad', 'status', dir, '--squad=fixture', '--session=absent']);
  assert.equal(absent.code, 1);
  assert.equal(absent.output.error, 'plan_not_found');
});

test('status diagnoses interrupted ownership without rewriting the portable plan', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-session-owner-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const folder = path.join(dir, '.aioson/squads/fixture/sessions/interrupted');
  await fs.mkdir(folder, { recursive: true });
  const file = path.join(folder, 'plan.json');
  const original = JSON.stringify({ session_id: 'interrupted', squad_slug: 'fixture', execution_status: 'running', tasks: [{ id: 'one', status: 'in_progress' }] });
  await fs.writeFile(file, original);
  const result = invoke(['squad', 'status', dir, '--squad=fixture', '--session=interrupted']);
  assert.equal(result.code, 0);
  assert.equal(result.output.status, 'reconciliation_required');
  assert.equal(result.output.heartbeat, null);
  assert.match(result.output.next_action, /Reconcile/);
  assert.equal(await fs.readFile(file, 'utf8'), original);
  await assert.rejects(fs.access(path.join(folder, 'coordination.sqlite')), { code: 'ENOENT' });
});
