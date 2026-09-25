'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { openRuntimeDb, upsertPipeline, addPipelineNode, addPipelineEdge } = require('../src/runtime-store');
const { readPreservedOutput } = require('../src/squad/delivery-artifacts');
const cli = path.resolve(__dirname, '../bin/aioson.js');

async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-pipeline-session-'));
  const { db } = await openRuntimeDb(dir);
  t.after(async () => { db.close(); await fs.rm(dir, { recursive: true, force: true }); });
  upsertPipeline(db, { slug: 'flow', name: 'Flow' });
  for (const slug of ['alpha', 'beta']) {
    db.prepare("INSERT INTO squads (squad_slug,name,mode,status,visibility,created_at,updated_at) VALUES (?,?,'content','active','private',?,?)")
      .run(slug, slug, new Date().toISOString(), new Date().toISOString());
    addPipelineNode(db, { pipelineSlug: 'flow', squadSlug: slug, config: { task_plan: { tasks: [{
      id: 'deliver', title: 'Produce deterministic output', executor: 'executor', dependencies: [],
      acceptance_criteria: ['Return the input value with the configured deterministic transformation']
    }] } } });
    const folder = path.join(dir, '.aioson/squads', slug);
    const worker = path.join(folder, 'workers/executor');
    await fs.mkdir(worker, { recursive: true });
    await fs.writeFile(path.join(folder, 'squad.manifest.json'), JSON.stringify({ slug, mode: 'content', executors: [{ slug: 'executor', type: 'worker', role: 'Produce output' }] }));
    await fs.writeFile(path.join(worker, 'worker.json'), JSON.stringify({ slug: 'executor', type: 'manual', retry: { attempts: 1 } }));
    await fs.writeFile(path.join(worker, 'run.js'), `
      const fs=require('node:fs'),path=require('node:path');
      const input=JSON.parse(process.argv[2]);
      fs.appendFileSync(path.join(__dirname,'effects.txt'),'effect\\n');
      const incoming=input.pipeline_context.inputs;
      const result=incoming.length?JSON.parse(fs.readFileSync(path.join(input.project_dir,incoming[0].deliveries[0].path),'utf8')).output.result+'-derived':'seed';
      process.stdout.write(JSON.stringify({result}));
    `);
  }
  addPipelineEdge(db, { pipelineSlug: 'flow', sourceSquad: 'alpha', sourcePort: 'out', targetSquad: 'beta', targetPort: 'in' });
  db.prepare("INSERT INTO squad_handoffs (id,pipeline_slug,from_squad,from_port,to_squad,to_port,payload_json,status,created_at) VALUES ('legacy','flow','alpha','out','beta','in','{}','pending',?)").run(new Date().toISOString());
  const invoke = args => {
    const child = spawnSync(process.execPath, [cli, ...args, '--json'], { encoding: 'utf8' });
    return { code: child.status, result: JSON.parse(child.stdout) };
  };
  const pipeline = (sub = 'run', extra = []) => invoke(['squad:pipeline', dir, `--sub=${sub}`, '--pipeline=flow', '--run-id=release-one', ...extra]);
  const resume = node => invoke(['squad', 'resume', dir, `--squad=${node.squad}`, `--session=${node.session_id}`, '--no-gap-closure']);
  return { dir, db, pipeline, resume };
}

test('pipeline run IDs bind portable sessions and verify every node without consuming daemon handoffs', async t => {
  const { dir, db, pipeline, resume } = await fixture(t);
  assert.equal(pipeline('status').result.error, 'pipeline_run_not_found');
  const first = pipeline('run', ['--goal=Deliver output']);
  assert.equal(first.code, 0, JSON.stringify(first));
  assert.equal(first.result.status, 'prepared');
  assert.equal(first.result.nextNode, 'alpha');
  assert.equal(first.result.nodes[1].status, 'blocked');
  assert.equal(pipeline().result.nodes[0].session_id, first.result.nodes[0].session_id);
  const executed = resume(first.result.nodes[0]); assert.equal(executed.result.status, 'completed', JSON.stringify(executed));
  const pending = pipeline('status').result;
  assert.equal(pending.status, 'pending');
  assert.match(pending.next_action, /squad:pipeline/);
  await assert.rejects(fs.access(path.join(dir, '.aioson/squads/beta/sessions', pending.nodes[1].session_id, 'plan.json')), { code: 'ENOENT' });
  const second = pipeline();
  assert.equal(second.result.nextNode, 'beta');
  assert.equal(resume(second.result.nodes[1]).result.status, 'completed');
  const final = pipeline('status');
  assert.equal(final.result.status, 'completed');
  assert.equal(final.result.nextNode, null);
  const beta = final.result.nodes[1];
  assert.equal((await readPreservedOutput(dir, beta.evidence[0].delivery)).output.result, 'seed-derived');
  assert.equal(db.prepare("SELECT status FROM squad_handoffs WHERE id='legacy'").get().status, 'pending');
  const effects = await fs.readFile(path.join(dir, '.aioson/squads/beta/workers/executor/effects.txt'), 'utf8');
  assert.equal(pipeline().result.status, 'completed');
  assert.equal(await fs.readFile(path.join(dir, '.aioson/squads/beta/workers/executor/effects.txt'), 'utf8'), effects);
  assert.equal(pipeline('run', ['--goal=Different goal']).result.error, 'pipeline_goal_conflict');
  addPipelineEdge(db, { pipelineSlug: 'flow', sourceSquad: 'alpha', sourcePort: 'extra', targetSquad: 'beta', targetPort: 'extra' });
  assert.equal(pipeline().result.error, 'pipeline_structure_changed');
});

test('tampering after downstream preparation blocks both dispatch and global completion', async t => {
  const { dir, pipeline, resume } = await fixture(t);
  const first = pipeline('run', ['--goal=Deliver output']);
  assert.equal(resume(first.result.nodes[0]).code, 0);
  const second = pipeline();
  await fs.writeFile(path.join(dir, second.result.nodes[0].evidence[0].delivery.path), 'tampered');
  assert.equal(resume(second.result.nodes[1]).code, 1);
  await assert.rejects(fs.access(path.join(dir, '.aioson/squads/beta/workers/executor/effects.txt')), { code: 'ENOENT' });
  const status = pipeline('status');
  assert.equal(status.result.status, 'blocked');
  assert.equal(status.result.nodes[0].status, 'unverified');
  assert.equal(status.result.nodes[1].status, 'blocked');
});

test('heuristic pipeline contracts remain unverified until their criteria can be evaluated', async t => {
  const { db, pipeline, resume } = await fixture(t);
  db.prepare("UPDATE pipeline_nodes SET config_json = NULL WHERE pipeline_slug = 'flow'").run();
  const prepared = pipeline('run', ['--goal=Deliver output']);
  assert.equal(prepared.result.nodes[0].requires_contract_review, true);
  assert.equal(pipeline('status').result.nodes[0].requires_contract_review, true);
  assert.equal(resume(prepared.result.nodes[0]).result.status, 'incomplete');
  assert.equal(pipeline('status').result.nodes[0].status, 'incomplete');
  assert.equal(pipeline('status').result.nodes[1].status, 'blocked');
});

test('an unrelated session cannot supply pipeline acceptance', async t => {
  const { dir, pipeline, resume } = await fixture(t);
  const first = pipeline('run', ['--goal=Deliver output']);
  assert.equal(resume(first.result.nodes[0]).code, 0);
  const filename = path.join(dir, '.aioson/squads/alpha/sessions', first.result.nodes[0].session_id, 'plan.json');
  const plan = JSON.parse(await fs.readFile(filename, 'utf8'));
  plan.pipeline_context.run_id = 'unrelated';
  await fs.writeFile(filename, JSON.stringify(plan));
  const status = pipeline('status').result;
  assert.equal(status.nodes[0].error, 'pipeline_session_conflict');
  assert.equal(status.nodes[1].status, 'blocked');
});

