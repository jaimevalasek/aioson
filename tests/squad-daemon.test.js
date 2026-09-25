'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { SquadDaemon, parseCronExpression, cronMatches, parseCronField } = require('../src/squad-daemon');
const { openRuntimeDb } = require('../src/runtime-store');
const { cleanupTmpDir } = require('./helpers/sqlite-cleanup');
const deliveryStore = require('../src/squad/event-delivery');
const { spawn } = require('node:child_process');

const effectScript = [
  "const fs=require('node:fs');const path=require('node:path');",
  "const input=JSON.parse(process.argv[2]);",
  "fs.appendFileSync(path.join(__dirname,'effects.txt'),input._delivery.idempotency_key+'\\n');",
  "process.stdout.write(JSON.stringify({receipt:input._delivery.idempotency_key}));"
].join('\n');

function workerEffects(root, worker) {
  return path.join(root, '.aioson/squads/receiver/workers', worker, 'effects.txt');
}

async function makeTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-squad-daemon-'));
}

async function setupWorker(tmpDir, squadSlug, workerSlug, config, script) {
  const workerDir = path.join(tmpDir, '.aioson', 'squads', squadSlug, 'workers', workerSlug);
  await fs.mkdir(workerDir, { recursive: true });
  await fs.writeFile(path.join(workerDir, 'worker.json'), JSON.stringify(config, null, 2));
  if (script) {
    await fs.writeFile(path.join(workerDir, 'run.js'), script);
  }
}

function postJson(url, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const data = JSON.stringify(body);
    const req = http.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, (res) => {
      let respBody = '';
      res.on('data', (c) => { respBody += c; });
      res.on('end', () => resolve({ statusCode: res.statusCode, body: respBody }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function handoffFixture(t, workers = []) {
  const root = await makeTempDir();
  for (const worker of workers) {
    await setupWorker(root, 'receiver', worker.slug, {
      slug: worker.slug, type: 'event', trigger: { source: 'handoff' }, retry: { attempts: 1 },
      ...(worker.config || {})
    }, worker.script);
  }
  const daemon = new SquadDaemon(root, 'receiver', { poll: 60000 });
  await daemon.start();
  t.after(async () => { await daemon.stop(); await cleanupTmpDir(root); });
  for (const slug of ['sender', 'receiver']) {
    daemon.db.prepare("INSERT INTO squads (squad_slug,name,created_at,updated_at) VALUES (?,?,datetime('now'),datetime('now'))").run(slug, slug);
  }
  daemon.db.prepare("INSERT INTO squad_handoffs (id,from_squad,from_port,to_squad,to_port,payload_json,created_at) VALUES ('event-1','sender','out','receiver','in','{}',datetime('now'))").run();
  return { root, daemon };
}

test('handoff failure stays recoverable and a handoff without consumers is not acknowledged', async (t) => {
  const { daemon } = await handoffFixture(t, [{ slug: 'fails', script: 'process.exit(1);' }]);
  await daemon._pollEvents();
  assert.notEqual(daemon.db.prepare("SELECT status FROM squad_handoffs WHERE id='event-1'").get().status, 'consumed');
});

test('empty handoff consumer set cannot acknowledge delivery', async (t) => {
  const { root, daemon } = await handoffFixture(t);
  await daemon._pollEvents();
  assert.notEqual(daemon.db.prepare("SELECT status FROM squad_handoffs WHERE id='event-1'").get().status, 'consumed');
  assert.equal(deliveryStore.list(daemon.db, 'receiver').batches[0].error, 'no_consumers');
  await setupWorker(root, 'receiver', 'new', { slug: 'new', type: 'event', trigger: { source: 'handoff' } }, effectScript);
  await daemon._pollEvents();
  assert.equal(daemon.db.prepare("SELECT status FROM squad_handoffs WHERE id='event-1'").get().status, 'consumed');
});

test('partial handoff failure preserves first receipt and explicit retry executes only remaining consumer', async (t) => {
  const { root, daemon } = await handoffFixture(t, [
    { slug: 'first', script: effectScript },
    { slug: 'second', script: 'process.exit(1);', config: { retry: { attempts: 3 } } }
  ]);
  await daemon._pollEvents();
  const first = daemon.db.prepare("SELECT * FROM squad_deliveries WHERE worker_slug='first'").get();
  const second = daemon.db.prepare("SELECT * FROM squad_deliveries WHERE worker_slug='second'").get();
  assert.equal(first.status, 'completed');
  assert.equal(second.status, 'reconciliation_required');
  assert.equal(second.attempts, 1); // delivery controls retries, not worker retry config
  await daemon._pollEvents();
  assert.equal(daemon.db.prepare('SELECT attempts FROM squad_deliveries WHERE delivery_key=?').get(second.delivery_key).attempts, 1);
  await fs.writeFile(path.join(path.dirname(workerEffects(root, 'second')), 'run.js'), effectScript);
  assert.equal(deliveryStore.reconcile(daemon.db, { squad: 'receiver', key: second.delivery_key, resolution: 'retry', evidence: 'Worker failed before effect; implementation repaired' }).ok, true);
  await daemon._pollEvents();
  assert.equal(daemon.db.prepare("SELECT status FROM squad_handoffs WHERE id='event-1'").get().status, 'consumed');
  assert.equal(await fs.readFile(workerEffects(root, 'first'), 'utf8'), `${first.delivery_key}\n`);
  assert.equal(await fs.readFile(workerEffects(root, 'second'), 'utf8'), `${second.delivery_key}\n`);
});

test('overlapping polls and two daemon connections execute a delivery only once', async (t) => {
  const { root, daemon } = await handoffFixture(t, [{ slug: 'slow', script: effectScript }]);
  // Delay before receipt while retaining the actual external-effect marker.
  await fs.writeFile(path.join(path.dirname(workerEffects(root, 'slow')), 'run.js'), effectScript.replace("process.stdout.write(JSON.stringify({receipt:input._delivery.idempotency_key}));", "setTimeout(()=>process.stdout.write(JSON.stringify({receipt:input._delivery.idempotency_key})),200);"));
  const other = new SquadDaemon(root, 'receiver', { poll: 60000 });
  await other.start();
  try {
    await Promise.all([daemon._pollEvents(), daemon._pollEvents(), other._pollEvents()]);
    const row = daemon.db.prepare('SELECT * FROM squad_deliveries').get();
    assert.equal(row.status, 'completed');
    assert.equal(row.attempts, 1);
    assert.equal(await fs.readFile(workerEffects(root, 'slow'), 'utf8'), `${row.delivery_key}\n`);
  } finally { await other.stop(); }
});

test('idempotent retry is bounded, retains the same key and records backoff', async (t) => {
  const script = effectScript.replace("process.stdout.write(JSON.stringify({receipt:input._delivery.idempotency_key}));", 'process.exit(1);');
  const { root, daemon } = await handoffFixture(t, [{ slug: 'safe', script, config: { delivery: { idempotent: true, max_attempts: 2 } } }]);
  await daemon._pollEvents();
  let row = daemon.db.prepare('SELECT * FROM squad_deliveries').get();
  assert.equal(row.status, 'pending');
  assert.ok(row.next_attempt_at > Date.now());
  await daemon._pollEvents();
  assert.equal(daemon.db.prepare('SELECT attempts FROM squad_deliveries').get().attempts, 1);
  daemon.db.prepare('UPDATE squad_deliveries SET next_attempt_at=0').run();
  await daemon._pollEvents();
  row = daemon.db.prepare('SELECT * FROM squad_deliveries').get();
  assert.equal(row.status, 'failed');
  assert.equal(row.attempts, 2);
  await daemon._pollEvents();
  assert.equal(await fs.readFile(workerEffects(root, 'safe'), 'utf8'), `${row.delivery_key}\n${row.delivery_key}\n`);
});

test('reconciliation requires evidence and squad ownership and cannot steal a live claim', async (t) => {
  const { daemon } = await handoffFixture(t);
  const batch = deliveryStore.prepareBatch(daemon.db, { type: 'handoff', id: 'event-1', squad: 'receiver', workers: [{ slug: 'one' }] });
  const row = daemon.db.prepare('SELECT * FROM squad_deliveries WHERE source_key=?').get(batch.source_key);
  const claimed = deliveryStore.claim(daemon.db, row.delivery_key);
  const base = { squad: 'receiver', key: row.delivery_key, resolution: 'completed', evidence: 'receipt' };
  assert.equal(deliveryStore.reconcile(daemon.db, { ...base, evidence: '' }).error, 'resolution_and_evidence_required');
  assert.equal(deliveryStore.reconcile(daemon.db, { ...base, squad: 'other' }).error, 'delivery_not_found');
  assert.equal(deliveryStore.reconcile(daemon.db, base).error, 'delivery_in_use');
  deliveryStore.finish(daemon.db, claimed, { ok: true, output: { receipt: 'done' } });
  assert.equal(deliveryStore.reconcile(daemon.db, base).error, 'already_completed');
});

function childProcess(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: path.join(__dirname, '..'), windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (data) => { stdout += data; });
    child.stderr.on('data', (data) => { stderr += data; });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolve(stdout) : reject(new Error(`Child failed (${code}): ${stderr}\n${stdout}`)));
  });
}

test('process crash after effect requires reconciliation; CLI receipt completes without replay', async (t) => {
  const { root, daemon } = await handoffFixture(t, [{ slug: 'effect', script: effectScript }]);
  await childProcess(['-e', `
    const { SquadDaemon } = require('./src/squad-daemon');
    (async () => {
      const daemon = new SquadDaemon(process.argv[1], 'receiver', {poll:60000});
      await daemon.start();
      const execute = daemon._executeWorker.bind(daemon);
      daemon._executeWorker = async (...args) => { await execute(...args); process.exit(0); };
      await daemon._pollEvents();
      process.exit(2);
    })().catch(error=>{console.error(error);process.exit(1);});
  `, root]);
  await daemon._pollEvents();
  const row = daemon.db.prepare('SELECT * FROM squad_deliveries').get();
  assert.equal(row.status, 'reconciliation_required');
  assert.equal(row.attempts, 1);
  assert.equal(await fs.readFile(workerEffects(root, 'effect'), 'utf8'), `${row.delivery_key}\n`);
  const stdout = await childProcess([path.join(__dirname, '../bin/aioson.js'), 'squad:daemon', root,
    '--sub=reconcile', '--squad=receiver', `--delivery=${row.delivery_key}`, '--resolution=completed', '--evidence=Verified local effect receipt', '--json']);
  assert.equal(JSON.parse(stdout).status, 'completed');
  await daemon._pollEvents();
  assert.equal(daemon.db.prepare("SELECT status FROM squad_handoffs WHERE id='event-1'").get().status, 'consumed');
  assert.equal(await fs.readFile(workerEffects(root, 'effect'), 'utf8'), `${row.delivery_key}\n`);
  const listed = JSON.parse(await childProcess([path.join(__dirname, '../bin/aioson.js'), 'squad:daemon', root, '--sub=deliveries', '--squad=receiver', '--json']));
  assert.equal(listed.deliveries[0].status, 'completed');
  assert.match(listed.deliveries[0].history_json, /Verified local effect receipt/);
});

test('cron claims survive overlapping checks and separate daemons in one minute', async (t) => {
  const { root, daemon } = await handoffFixture(t, [{ slug: 'cron', script: effectScript,
    config: { type: 'scheduled', trigger: { cron: '* * * * *' } } }]);
  const other = new SquadDaemon(root, 'receiver', { poll: 60000 });
  await other.start();
  try {
    await Promise.all([daemon._checkCron(), daemon._checkCron(), other._checkCron()]);
    const rows = daemon.db.prepare('SELECT * FROM squad_deliveries').all();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, 'completed');
    assert.equal(await fs.readFile(workerEffects(root, 'cron'), 'utf8'), `${rows[0].delivery_key}\n`);
  } finally { await other.stop(); }
});

test('additive delivery schema upgrades legacy database and is idempotent on reopen', async (t) => {
  const root = await makeTempDir();
  t.after(() => cleanupTmpDir(root));
  const runtime = path.join(root, '.aioson/runtime');
  await fs.mkdir(runtime, { recursive: true });
  const Database = require('better-sqlite3');
  const legacy = new Database(path.join(runtime, 'aios.sqlite'));
  legacy.exec(`CREATE TABLE squad_handoffs (id TEXT PRIMARY KEY,pipeline_slug TEXT,from_squad TEXT,from_port TEXT,to_squad TEXT,to_port TEXT,payload_json TEXT,status TEXT,created_at TEXT,consumed_at TEXT);
    INSERT INTO squad_handoffs (id,status,created_at) VALUES ('old','consumed','2026-01-01');`);
  legacy.close();
  for (let i = 0; i < 2; i++) {
    const handle = await openRuntimeDb(root);
    assert.equal(handle.db.prepare('SELECT version FROM squad_delivery_schema').get().version, 1);
    assert.equal(handle.db.prepare("SELECT status FROM squad_handoffs WHERE id='old'").get().status, 'consumed');
    handle.db.close();
  }
});

test('two independent daemon processes contend for the same delivery without duplicate effect', async (t) => {
  const { root, daemon } = await handoffFixture(t, [{ slug: 'effect', script: effectScript }]);
  const script = `
    const { SquadDaemon }=require('./src/squad-daemon');
    (async()=>{const d=new SquadDaemon(process.argv[1],'receiver',{poll:60000});await d.start();await d._pollEvents();await d.stop();})()
      .catch(error=>{console.error(error);process.exit(1);});
  `;
  await Promise.all([childProcess(['-e', script, root]), childProcess(['-e', script, root])]);
  const row = daemon.db.prepare('SELECT * FROM squad_deliveries').get();
  assert.equal(row.status, 'completed');
  assert.equal(row.attempts, 1);
  assert.equal(await fs.readFile(workerEffects(root, 'effect'), 'utf8'), `${row.delivery_key}\n`);
});

test('daemon stop drains an active delivery before closing SQLite', async (t) => {
  const script = effectScript.replace("process.stdout.write(JSON.stringify({receipt:input._delivery.idempotency_key}));", "setTimeout(()=>process.stdout.write(JSON.stringify({receipt:input._delivery.idempotency_key})),200);");
  const { root, daemon } = await handoffFixture(t, [{ slug: 'slow', script }]);
  const polling = daemon._pollEvents();
  let started = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { await fs.access(workerEffects(root, 'slow')); started = true; break; } catch { /* wait for worker */ }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.equal(started, true);
  await daemon.stop();
  await polling;
  const handle = await openRuntimeDb(root);
  try { assert.equal(handle.db.prepare('SELECT status FROM squad_deliveries').get().status, 'completed'); }
  finally { handle.db.close(); }
});

// --- Unit tests: parseCronField ---

test('parseCronField returns null for wildcard', () => {
  assert.equal(parseCronField('*', 0, 59), null);
});

test('parseCronField parses single value', () => {
  const result = parseCronField('5', 0, 59);
  assert.ok(result.has(5));
  assert.equal(result.size, 1);
});

test('parseCronField parses range', () => {
  const result = parseCronField('1-3', 0, 59);
  assert.ok(result.has(1));
  assert.ok(result.has(2));
  assert.ok(result.has(3));
  assert.equal(result.size, 3);
});

test('parseCronField parses step', () => {
  const result = parseCronField('*/15', 0, 59);
  assert.ok(result.has(0));
  assert.ok(result.has(15));
  assert.ok(result.has(30));
  assert.ok(result.has(45));
  assert.equal(result.size, 4);
});

test('parseCronField parses comma-separated', () => {
  const result = parseCronField('1,5,10', 0, 59);
  assert.ok(result.has(1));
  assert.ok(result.has(5));
  assert.ok(result.has(10));
  assert.equal(result.size, 3);
});

// --- Unit tests: parseCronExpression ---

test('parseCronExpression parses standard expression', () => {
  const parsed = parseCronExpression('0 8 * * *');
  assert.ok(parsed);
  assert.ok(parsed.minute.has(0));
  assert.ok(parsed.hour.has(8));
  assert.equal(parsed.dayOfMonth, null);
  assert.equal(parsed.month, null);
  assert.equal(parsed.dayOfWeek, null);
});

test('parseCronExpression resolves presets', () => {
  const hourly = parseCronExpression('@hourly');
  assert.ok(hourly);
  assert.ok(hourly.minute.has(0));
  assert.equal(hourly.hour, null);

  const daily = parseCronExpression('@daily');
  assert.ok(daily);
  assert.ok(daily.minute.has(0));
  assert.ok(daily.hour.has(0));
});

test('parseCronExpression returns null for invalid', () => {
  assert.equal(parseCronExpression('invalid'), null);
  assert.equal(parseCronExpression('1 2 3'), null);
});

// --- Unit tests: cronMatches ---

test('cronMatches correctly matches date', () => {
  const parsed = parseCronExpression('30 14 * * *'); // 14:30 every day
  const matching = new Date('2026-03-24T14:30:00');
  const notMatching = new Date('2026-03-24T14:31:00');
  assert.ok(cronMatches(parsed, matching));
  assert.ok(!cronMatches(parsed, notMatching));
});

test('cronMatches handles wildcard (every minute)', () => {
  const parsed = parseCronExpression('* * * * *');
  assert.ok(cronMatches(parsed, new Date()));
});

test('cronMatches handles day of week', () => {
  const parsed = parseCronExpression('0 9 * * 1'); // Monday at 9am
  const monday = new Date('2026-03-23T09:00:00'); // Monday
  const tuesday = new Date('2026-03-24T09:00:00'); // Tuesday
  assert.ok(cronMatches(parsed, monday));
  assert.ok(!cronMatches(parsed, tuesday));
});

test('cronMatches returns false for null parsed', () => {
  assert.ok(!cronMatches(null, new Date()));
});

// --- Integration tests: SquadDaemon ---

test('SquadDaemon starts and stops with no workers', async () => {
  const tmpDir = await makeTempDir();
  let handle = null;
  try {
    handle = await openRuntimeDb(tmpDir);
    // Create empty squad dir
    await fs.mkdir(path.join(tmpDir, '.aioson', 'squads', 'empty-squad', 'workers'), { recursive: true });

    const daemon = new SquadDaemon(tmpDir, 'empty-squad', { port: 0, poll: 60000 });
    const info = await daemon.start();
    assert.ok(info.port > 0);
    assert.equal(info.workers, 0);
    assert.equal(info.cronJobs, 0);
    assert.ok(daemon.running);

    const status = daemon.getStatus();
    assert.equal(status.squad, 'empty-squad');
    assert.ok(status.running);

    await daemon.stop();
    assert.ok(!daemon.running);
  } finally {
    await cleanupTmpDir(tmpDir, { handles: [handle] });
  }
});

test('SquadDaemon registers cron jobs for scheduled workers', async () => {
  const tmpDir = await makeTempDir();
  let handle = null;
  try {
    handle = await openRuntimeDb(tmpDir);
    await setupWorker(tmpDir, 'cron-squad', 'daily-task', {
      slug: 'daily-task', name: 'Daily', type: 'scheduled',
      trigger: { type: 'scheduled', cron: '0 8 * * *' },
      timeout_ms: 5000
    }, 'process.stdout.write("{}"); process.exit(0);');

    const daemon = new SquadDaemon(tmpDir, 'cron-squad', { port: 0, poll: 60000 });
    const info = await daemon.start();
    assert.equal(info.cronJobs, 1);
    assert.equal(info.workers, 1);

    const status = daemon.getStatus();
    assert.equal(status.cronJobs.length, 1);
    assert.equal(status.cronJobs[0].worker, 'daily-task');
    assert.equal(status.cronJobs[0].cron, '0 8 * * *');

    await daemon.stop();
  } finally {
    await cleanupTmpDir(tmpDir, { handles: [handle] });
  }
});

test('SquadDaemon webhook endpoint executes worker', async () => {
  const tmpDir = await makeTempDir();
  let handle = null;
  try {
    handle = await openRuntimeDb(tmpDir);
    const script = `
const input = JSON.parse(process.argv[2] || '{}');
process.stdout.write(JSON.stringify({ received: input.msg || 'none' }));
process.exit(0);
`;
    await setupWorker(tmpDir, 'webhook-squad', 'receiver', {
      slug: 'receiver', name: 'Receiver', type: 'webhook',
      inputs: {},
      timeout_ms: 5000,
      retry: { attempts: 1 }
    }, script);

    const daemon = new SquadDaemon(tmpDir, 'webhook-squad', { port: 0, poll: 60000 });
    const info = await daemon.start();

    try {
      // POST to webhook
      const res = await postJson(`http://127.0.0.1:${info.port}/webhook/receiver`, { msg: 'hello' });
      assert.equal(res.statusCode, 200);
      const body = JSON.parse(res.body);
      assert.ok(body.ok);
      assert.equal(body.output.received, 'hello');
    } finally {
      await daemon.stop();
    }
  } finally {
    await cleanupTmpDir(tmpDir, { handles: [handle] });
  }
});

test('SquadDaemon webhook returns 404 for unknown paths', async () => {
  const tmpDir = await makeTempDir();
  let handle = null;
  try {
    handle = await openRuntimeDb(tmpDir);
    await fs.mkdir(path.join(tmpDir, '.aioson', 'squads', 'test-404', 'workers'), { recursive: true });

    const daemon = new SquadDaemon(tmpDir, 'test-404', { port: 0, poll: 60000 });
    const info = await daemon.start();

    try {
      const res = await postJson(`http://127.0.0.1:${info.port}/unknown`, {});
      assert.equal(res.statusCode, 404);
    } finally {
      await daemon.stop();
    }
  } finally {
    await cleanupTmpDir(tmpDir, { handles: [handle] });
  }
});

test('SquadDaemon webhook returns 400 for invalid JSON', async () => {
  const tmpDir = await makeTempDir();
  let handle = null;
  try {
    handle = await openRuntimeDb(tmpDir);
    await fs.mkdir(path.join(tmpDir, '.aioson', 'squads', 'test-bad', 'workers'), { recursive: true });

    const daemon = new SquadDaemon(tmpDir, 'test-bad', { port: 0, poll: 60000 });
    const info = await daemon.start();

    try {
      const parsed = new URL(`http://127.0.0.1:${info.port}/webhook/test`);
      const res = await new Promise((resolve, reject) => {
        const req = http.request({
          hostname: parsed.hostname,
          port: parsed.port,
          path: parsed.pathname,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        }, (r) => {
          let body = '';
          r.on('data', (c) => { body += c; });
          r.on('end', () => resolve({ statusCode: r.statusCode, body }));
        });
        req.on('error', reject);
        req.write('{invalid json');
        req.end();
      });
      assert.equal(res.statusCode, 400);
    } finally {
      await daemon.stop();
    }
  } finally {
    await cleanupTmpDir(tmpDir, { handles: [handle] });
  }
});

test('SquadDaemon records worker runs in SQLite', async () => {
  const tmpDir = await makeTempDir();
  let handle = null;
  try {
    handle = await openRuntimeDb(tmpDir);
    const script = 'process.stdout.write(JSON.stringify({ok:true})); process.exit(0);';
    await setupWorker(tmpDir, 'log-squad', 'logger-w', {
      slug: 'logger-w', name: 'Logger', type: 'webhook',
      timeout_ms: 5000, retry: { attempts: 1 }
    }, script);

    const daemon = new SquadDaemon(tmpDir, 'log-squad', { port: 0, poll: 60000 });
    const info = await daemon.start();

    try {
      await postJson(`http://127.0.0.1:${info.port}/webhook/logger-w`, { test: true });

      // Check SQLite
      const runs = handle.db.prepare('SELECT * FROM worker_runs WHERE squad_slug = ?').all('log-squad');
      assert.equal(runs.length, 1);
      assert.equal(runs[0].worker_slug, 'logger-w');
      assert.equal(runs[0].trigger_type, 'webhook');
      assert.equal(runs[0].status, 'completed');
    } finally {
      await daemon.stop();
    }
  } finally {
    await cleanupTmpDir(tmpDir, { handles: [handle] });
  }
});

test('squad_daemons table is created by openRuntimeDb', async () => {
  const tmpDir = await makeTempDir();
  let handle = null;
  try {
    handle = await openRuntimeDb(tmpDir);
    const tables = handle.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='squad_daemons'").all();
    assert.equal(tables.length, 1);
  } finally {
    await cleanupTmpDir(tmpDir, { handles: [handle] });
  }
});

test('SquadDaemon upserts daemon record in SQLite', async () => {
  const tmpDir = await makeTempDir();
  let handle = null;
  try {
    handle = await openRuntimeDb(tmpDir);
    await fs.mkdir(path.join(tmpDir, '.aioson', 'squads', 'rec-squad', 'workers'), { recursive: true });

    const daemon = new SquadDaemon(tmpDir, 'rec-squad', { port: 0, poll: 60000 });
    await daemon.start();

    const record = handle.db.prepare('SELECT * FROM squad_daemons WHERE squad_slug = ?').get('rec-squad');
    assert.ok(record);
    assert.equal(record.status, 'running');
    assert.equal(record.pid, process.pid);

    await daemon.stop();

    const stopped = handle.db.prepare('SELECT * FROM squad_daemons WHERE squad_slug = ?').get('rec-squad');
    assert.equal(stopped.status, 'stopped');
  } finally {
    await cleanupTmpDir(tmpDir, { handles: [handle] });
  }
});
