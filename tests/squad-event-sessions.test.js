'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const events = require('../src/squad/inter-squad-events');
const { openRuntimeDb } = require('../src/runtime-store');
const { savePlan, loadPlan } = require('../src/squad/task-decomposer');
const { runPersistentIteration, runSquadDaemon } = require('../src/commands/squad-daemon');
const { runSquadAutorun } = require('../src/commands/squad-autorun');

const logger = { log() {}, warn() {}, error() {} };
const squad = 'receiver';

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-event-session-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const dir = path.join(root, '.aioson/squads', squad);
  await fs.mkdir(path.join(dir, 'workers/worker'), { recursive: true });
  const manifest = { slug: squad, subscriptions: ['asset.*'], executors: [{ slug: 'worker', role: 'Process events' }] };
  await fs.writeFile(path.join(dir, 'squad.manifest.json'), JSON.stringify(manifest));
  await fs.writeFile(path.join(dir, 'workers/worker/worker.json'), JSON.stringify({ slug: 'worker', type: 'manual', retry: { attempts: 1 } }));
  await fs.writeFile(path.join(dir, 'workers/worker/run.js'), `
    const fs=require('fs'),path=require('path');const input=JSON.parse(process.argv[2]);
    fs.appendFileSync(path.join(__dirname,'effects.jsonl'),JSON.stringify(input)+'\\n');
    process.stdout.write(JSON.stringify({result:'A verified useful output with sufficient detail for the requested delivery and its review.'}));
  `);
  const id = await events.publish(root, { fromSquad: 'source', event: 'asset.ready', payload: { title: 'Original payload' } });
  return { root, dir, manifest, id };
}

async function withDb(root, action) {
  const { db } = await openRuntimeDb(root);
  try { return action(db); } finally { db.close(); }
}

async function plan(root, sessionId, status = 'pending') {
  await savePlan(root, squad, sessionId, { session_id: sessionId, squad_slug: squad, goal: 'Process source event',
    tasks: [{ id: 'task-1', executor: 'worker', title: 'Process event', description: 'Use source payload', status }],
    parallel_groups: { 1: ['task-1'] } });
}

function child(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, args, { windowsHide: true });
    let stdout = '', stderr = '';
    proc.stdout.on('data', (data) => { stdout += data; });
    proc.stderr.on('data', (data) => { stderr += data; });
    proc.on('error', reject);
    proc.on('close', (code) => code === 0 ? resolve(stdout) : reject(new Error(stderr || stdout)));
  });
}

test('two processes cannot bind one event to different sessions; different squads retain independent receipts', async (t) => {
  const { root, id } = await fixture(t);
  const script = `require('./src/squad/inter-squad-events').bindSession(process.argv[1],{toSquad:'receiver',sessionId:process.argv[2],subscriptions:['asset.*']}).then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e);process.exit(1)});`;
  const results = await Promise.all(['one', 'two'].map((session) => child(['-e', script, root, session]).then(JSON.parse)));
  assert.equal(results.filter((result) => result.ok).length, 1);
  const winner = results.find((result) => result.ok);
  assert.equal(results.find((result) => !result.ok).session_id, winner.sessionId);
  await events.bindSession(root, { toSquad: 'other', sessionId: 'other-session', subscriptions: ['asset.*'] });
  await Promise.all([
    events.acknowledgeSession(root, { toSquad: squad, sessionId: winner.sessionId }),
    events.acknowledgeSession(root, { toSquad: 'other', sessionId: 'other-session' })
  ]);
  await events.acknowledgeSession(root, { toSquad: squad, sessionId: winner.sessionId });
  const consumed = await withDb(root, (db) => JSON.parse(db.prepare('SELECT consumed_by FROM inter_squad_events WHERE id=?').get(id).consumed_by));
  assert.deepEqual(consumed.sort(), ['other', squad]);
});

test('TTL cleanup preserves claimed events and resume uses the frozen snapshot', async (t) => {
  const { root, id } = await fixture(t);
  const options = { toSquad: squad, sessionId: 'frozen', subscriptions: ['asset.*'] };
  const original = await events.bindSession(root, options);
  await withDb(root, (db) => db.prepare('UPDATE inter_squad_events SET created_at=?,payload=? WHERE id=?')
    .run('2000-01-01T00:00:00Z', '{"title":"changed"}', id));
  await events.consume(root, { toSquad: squad, subscriptions: ['asset.*'] });
  assert.deepEqual(await events.consume(root, { toSquad: 'new-consumer', subscriptions: ['asset.*'] }), []);
  const resumed = await events.bindSession(root, options);
  assert.deepEqual(resumed.events, original.events);
  await events.acknowledgeSession(root, options);
  assert.equal((await events.getSession(root, options)).status, 'completed');
});

test('malformed payload rolls back the batch and no event is claimed or consumed', async (t) => {
  const { root, id } = await fixture(t);
  await withDb(root, (db) => db.prepare('UPDATE inter_squad_events SET payload=? WHERE id=?').run('{', id));
  await assert.rejects(events.bindSession(root, { toSquad: squad, sessionId: 'bad', subscriptions: ['asset.*'] }), SyntaxError);
  assert.equal(await events.getSession(root, { toSquad: squad, sessionId: 'bad' }), null);
  await withDb(root, (db) => {
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM inter_squad_event_claims').get().count, 0);
    assert.equal(db.prepare('SELECT consumed_by FROM inter_squad_events WHERE id=?').get(id).consumed_by, '[]');
  });
});

test('persistent resumes a paused session, delivers payload once, then reports idle', async (t) => {
  const { root, dir, manifest, id } = await fixture(t);
  const next = await events.nextSession(root, { toSquad: squad, subscriptions: manifest.subscriptions });
  await plan(root, next.sessionId);
  await fs.writeFile(path.join(dir, 'squad.manifest.json'), JSON.stringify({ ...manifest, budget: { max_tokens_per_session: 0 } }));
  const paused = await runPersistentIteration(root, squad, manifest, logger);
  assert.equal(paused.status, 'paused_budget');
  assert.equal(paused.session_id, next.sessionId);
  assert.equal((await events.nextSession(root, { toSquad: squad })).sessionId, next.sessionId);
  await fs.writeFile(path.join(dir, 'squad.manifest.json'), JSON.stringify(manifest));
  const resumed = await runPersistentIteration(root, squad, manifest, logger);
  assert.equal(resumed.status, 'completed');
  assert.equal(resumed.session_id, next.sessionId);
  assert.equal((await runPersistentIteration(root, squad, manifest, logger)).status, 'idle');
  const effects = (await fs.readFile(path.join(dir, 'workers/worker/effects.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(effects.length, 1);
  assert.equal(effects[0].inter_squad_events[0].id, id);
  assert.equal(effects[0].inter_squad_events[0].payload.title, 'Original payload');
});

test('process exit after completed work before ack resumes without replay or capturing new events', async (t) => {
  const { root, dir } = await fixture(t);
  await plan(root, 'receipt-gap');
  await child(['-e', `
    require('./src/squad/inter-squad-events').acknowledgeSession=async()=>process.exit(0);
    require('./src/commands/squad-autorun').runSquadAutorun({args:[process.argv[1]],options:{squad:'receiver',plan:'receipt-gap',json:true},logger:{log(){},warn(){},error(){}}}).catch(e=>{console.error(e);process.exit(1)});
  `, root]);
  const bound = await events.getSession(root, { toSquad: squad, sessionId: 'receipt-gap' });
  assert.equal(bound.status, 'pending');
  const effectFile = path.join(dir, 'workers/worker/effects.jsonl');
  const acceptedEffects = await fs.readFile(effectFile, 'utf8');
  assert.equal(acceptedEffects.trim().split('\n').length, 1);
  const later = await events.publish(root, { fromSquad: 'source', event: 'asset.later' });
  const cli = await child(['bin/aioson.js', 'squad:autorun', root, '--squad=receiver', '--plan=receipt-gap', '--json']);
  assert.equal(JSON.parse(cli).status, 'completed');
  assert.equal((await events.getSession(root, { toSquad: squad, sessionId: bound.sessionId })).status, 'completed');
  assert.equal((await events.peek(root, { toSquad: squad, subscriptions: ['asset.*'] }))[0].id, later);
  assert.equal(await fs.readFile(effectFile, 'utf8'), acceptedEffects);
});

test('process exit after worker effect before task receipt requires reconciliation, not replay', async (t) => {
  const { root, dir } = await fixture(t);
  await plan(root, 'interrupted');
  await child(['-e', `
    const workers=require('./src/worker-runner');const run=workers.runWorker;
    workers.runWorker=async(...args)=>{await run(...args);process.exit(0)};
    require('./src/commands/squad-autorun').runSquadAutorun({args:[process.argv[1]],options:{squad:'receiver',plan:'interrupted',json:true},logger:{log(){},warn(){},error(){}}}).catch(e=>{console.error(e);process.exit(1)});
  `, root]);
  const before = await fs.readFile(path.join(dir, 'workers/worker/effects.jsonl'), 'utf8');
  const result = await runPersistentIteration(root, squad, {}, logger);
  assert.equal(result.error, 'reconciliation_required');
  assert.equal((await events.getSession(root, { toSquad: squad, sessionId: 'interrupted' })).status, 'pending');
  assert.equal(await fs.readFile(path.join(dir, 'workers/worker/effects.jsonl'), 'utf8'), before);
});

test('persistent creates one stable plan for a fresh event and preserves unverified work', async (t) => {
  const { root, manifest } = await fixture(t);
  const next = await events.nextSession(root, { toSquad: squad, subscriptions: manifest.subscriptions });
  const result = await runPersistentIteration(root, squad, manifest, logger);
  assert.equal(result.session_id, next.sessionId);
  const saved = await loadPlan(root, squad, next.sessionId);
  assert.ok(saved.tasks.length > 0);
  assert.equal(saved.inter_squad_events[0].payload.title, 'Original payload');
  // Heuristic must-have claims require review; persistent cannot treat a prepared claim as proof.
  if (!result.ok) {
    assert.equal((await events.nextSession(root, { toSquad: squad })).sessionId, next.sessionId);
    assert.equal((await runPersistentIteration(root, squad, manifest, logger)).session_id, next.sessionId);
  } else {
    assert.equal((await events.getSession(root, { toSquad: squad, sessionId: next.sessionId })).status, 'completed');
  }
});

test('persistent never reconstructs a claimed session with a missing plan', async (t) => {
  const { root, manifest } = await fixture(t);
  await events.bindSession(root, { toSquad: squad, sessionId: 'missing', subscriptions: manifest.subscriptions });
  assert.equal((await runPersistentIteration(root, squad, manifest, logger)).error, 'event_plan_missing');
  assert.equal(await loadPlan(root, squad, 'missing'), null);
});

test('dry run and empty plans never acknowledge available events', async (t) => {
  const { root, id } = await fixture(t);
  await plan(root, 'dry');
  await runSquadAutorun({ args: [root], options: { squad, plan: 'dry', 'dry-run': true, json: true }, logger });
  await savePlan(root, squad, 'empty', { tasks: [], parallel_groups: {}, goal: 'No work' });
  await runSquadAutorun({ args: [root], options: { squad, plan: 'empty', json: true }, logger });
  await withDb(root, (db) => assert.equal(db.prepare('SELECT consumed_by FROM inter_squad_events WHERE id=?').get(id).consumed_by, '[]'));
});

test('persistent stop interrupts sleep and removes its signal listeners', async (t) => {
  const { root, dir, manifest } = await fixture(t);
  await fs.writeFile(path.join(dir, 'squad.manifest.json'), JSON.stringify({ ...manifest, subscriptions: [] }));
  const before = ['SIGINT', 'SIGTERM'].map((signal) => process.listenerCount(signal));
  const result = await runSquadDaemon({ args: [root], options: { squad, persistent: true, 'loop-delay': '60s' },
    logger: { ...logger, log(message) { if (message.includes('] idle')) setImmediate(() => process.emit('SIGTERM')); } } });
  assert.equal(result.iterations, 1);
  assert.deepEqual(['SIGINT', 'SIGTERM'].map((signal) => process.listenerCount(signal)), before);
  await assert.rejects(fs.access(path.join(dir, 'daemon-alive.json')), { code: 'ENOENT' });
});
