'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { readPreservedOutput } = require('../src/squad/delivery-artifacts');

const cli = path.resolve(__dirname, '../bin/aioson.js');
function invoke(dir, action, session, extra = []) {
  const result = spawnSync(process.execPath, [cli, 'squad', action, dir, '--squad=fixture', `--session=${session}`, '--json', '--no-gap-closure', ...extra], { encoding: 'utf8' });
  return { code: result.status, output: JSON.parse(result.stdout) };
}

test('localized revision preserves accepted content and reruns only selected tasks and dependents', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-revision-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const squad = path.join(dir, '.aioson/squads/fixture');
  const session = path.join(squad, 'sessions/original');
  const worker = path.join(squad, 'workers/executor');
  await fs.mkdir(session, { recursive: true });
  await fs.mkdir(worker, { recursive: true });
  await fs.writeFile(path.join(squad, 'squad.manifest.json'), JSON.stringify({ slug: 'fixture', mode: 'content', subscriptions: ['asset.*'], depends_on: [{ squad: 'source', event: 'asset.required' }] }));
  const tasks = ['article', 'derived', 'independent'].map(id => ({ id, title: id, executor: 'executor', status: 'pending', dependencies: id === 'derived' ? ['article'] : [] }));
  const planFile = path.join(session, 'plan.json');
  await fs.writeFile(planFile, JSON.stringify({ session_id: 'original', squad_slug: 'fixture', goal: 'Produce content', tasks, parallel_groups: { 1: ['article', 'independent'], 2: ['derived'] } }));
  await fs.writeFile(path.join(worker, 'worker.json'), JSON.stringify({ slug: 'executor', type: 'manual', retry: { attempts: 1 } }));
  await fs.writeFile(path.join(worker, 'run.js'), `
    const fs=require('node:fs'), path=require('node:path');
    const input=JSON.parse(process.argv[2]);
    fs.appendFileSync(path.join(__dirname,'effects.txt'), input.task_id+'\\n');
    const read=ref=>JSON.parse(fs.readFileSync(path.join(input.project_dir,ref.path),'utf8')).output;
    let output;
    if(input.task_id==='article') {
      output=input.revision_context ? {...read(input.revision_context.previous_delivery),opening:input.revision_context.feedback} : {opening:'Long introduction',body:'Accepted body unchanged'};
    } else if(input.task_id==='derived') output={summary:read(input.dependency_deliveries[0].delivery).opening};
    else output={result:'Independent accepted delivery'};
    process.stdout.write(JSON.stringify(output));
  `);
  const events = require('../src/squad/inter-squad-events');
  await events.publish(dir, { fromSquad: 'source', event: 'asset.required', payload: { original: true } });
  assert.equal(invoke(dir, 'run', 'original').code, 0);
  const originalText = await fs.readFile(planFile, 'utf8');
  const original = JSON.parse(originalText);
  const eventId = await events.publish(dir, { fromSquad: 'source', event: 'asset.ready', payload: { new: true } });
  const revision = invoke(dir, 'revise', 'original', ['--tasks=article', '--feedback=Short opening']);
  assert.equal(revision.code, 0, JSON.stringify(revision));
  assert.equal(revision.output.status, 'prepared');
  assert.deepEqual(revision.output.affected_tasks, ['article', 'derived']);
  assert.deepEqual(revision.output.preserved_tasks, ['independent']);
  assert.equal(await fs.readFile(planFile, 'utf8'), originalText);
  const revisedId = revision.output.session_id;
  const revisedPath = path.join(squad, 'sessions', revisedId, 'plan.json');
  const prepared = JSON.parse(await fs.readFile(revisedPath, 'utf8'));
  assert.equal(prepared.tasks.find(task => task.id === 'derived').status, 'pending');
  assert.equal(invoke(dir, 'resume', revisedId).code, 0);
  const revised = JSON.parse(await fs.readFile(revisedPath, 'utf8'));
  const outputFor = async (plan, id) => (await readPreservedOutput(dir, plan.tasks.find(task => task.id === id).result.delivery_evidence)).output;
  assert.deepEqual(await outputFor(revised, 'article'), { opening: 'Short opening', body: 'Accepted body unchanged' });
  assert.deepEqual(await outputFor(revised, 'derived'), { summary: 'Short opening' });
  assert.deepEqual(await outputFor(original, 'article'), { opening: 'Long introduction', body: 'Accepted body unchanged' });
  assert.deepEqual(revised.tasks[2].result, original.tasks[2].result);
  assert.equal(await fs.readFile(planFile, 'utf8'), originalText);
  const effects = (await fs.readFile(path.join(worker, 'effects.txt'), 'utf8')).trim().split('\n');
  assert.equal(effects.filter(id => id === 'independent').length, 1);
  assert.equal(effects.filter(id => id === 'article').length, 2);
  assert.equal(effects.filter(id => id === 'derived').length, 2);
  const { db } = await require('../src/runtime-store').openRuntimeDb(dir);
  try { assert.equal(db.prepare('SELECT consumed_by FROM inter_squad_events WHERE id = ?').get(eventId).consumed_by, '[]'); }
  finally { db.close(); }
  assert.equal(invoke(dir, 'revise', 'original', ['--tasks=missing', '--feedback=change']).output.error, 'unknown_revision_task');
  await fs.writeFile(path.join(dir, original.tasks[0].result.delivery_evidence.path), 'tampered');
  assert.equal(invoke(dir, 'revise', 'original', ['--tasks=article', '--feedback=change']).code, 1);
});
