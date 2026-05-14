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
