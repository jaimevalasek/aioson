'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { SquadDaemon } = require('../src/squad-daemon');
const { openRuntimeDb } = require('../src/runtime-store');
const { cleanupTmpDir } = require('./helpers/sqlite-cleanup');
const { renderSquadApiSection } = require('../src/context-writer');
const { runSquadValidate } = require('../src/commands/squad-validate');

async function makeTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-api-ep-'));
}

async function setupWorker(tmpDir, squadSlug, workerSlug, config, script) {
  const workerDir = path.join(tmpDir, '.aioson', 'squads', squadSlug, 'workers', workerSlug);
  await fs.mkdir(workerDir, { recursive: true });
  await fs.writeFile(path.join(workerDir, 'worker.json'), JSON.stringify(config, null, 2));
  if (script) {
    await fs.writeFile(path.join(workerDir, 'run.js'), script);
  }
}

function makeRequest(options, body, method, extraHeaders) {
  method = method || 'POST';
  extraHeaders = extraHeaders || {};
  return new Promise((resolve, reject) => {
    const data = body !== undefined ? JSON.stringify(body) : '';
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data),
      ...extraHeaders
    };
    const req = http.request({ ...options, method, headers }, (res) => {
      let respBody = '';
      res.on('data', (c) => { respBody += c; });
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: respBody }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// --- Tests: GET /status ---

test('GET /status returns 200 (regression fix)', async () => {
  const tmpDir = await makeTempDir();
  let handle = null;
  try {
    handle = await openRuntimeDb(tmpDir);
    await fs.mkdir(path.join(tmpDir, '.aioson', 'squads', 'status-squad', 'workers'), { recursive: true });

    const daemon = new SquadDaemon(tmpDir, 'status-squad', { port: 0, poll: 60000 });
    const info = await daemon.start();

    const res = await new Promise((resolve, reject) => {
      const req = http.request(
        { hostname: '127.0.0.1', port: info.port, path: '/status', method: 'GET' },
        (r) => {
          let body = '';
          r.on('data', c => { body += c; });
          r.on('end', () => resolve({ statusCode: r.statusCode, body }));
        }
      );
      req.on('error', reject);
      req.end();
    });

    assert.equal(res.statusCode, 200);
    const parsed = JSON.parse(res.body);
    assert.equal(parsed.squad, 'status-squad');

    await daemon.stop();
  } finally {
    await cleanupTmpDir(tmpDir, { handles: [handle] });
  }
});

// --- Tests: POST /api/:path ---

test('Daemon with api_endpoints: POST /api/buscar executes worker', async () => {
  const tmpDir = await makeTempDir();
  let handle = null;
  try {
    handle = await openRuntimeDb(tmpDir);
    const script = 'process.stdout.write(JSON.stringify({ produtos: [] })); process.exit(0);';
    await setupWorker(tmpDir, 'api-squad', 'buscar', {
      slug: 'buscar', name: 'Buscar', type: 'webhook', timeout_ms: 5000
    }, script);

    const daemon = new SquadDaemon(tmpDir, 'api-squad', {
      port: 0, poll: 60000,
      config: {
        api_endpoints: [
          { path: '/buscar', worker: 'buscar', method: 'POST', cors_origins: [] }
        ]
      }
    });
    const info = await daemon.start();

    const res = await makeRequest(
      { hostname: '127.0.0.1', port: info.port, path: '/api/buscar' },
      { busca: 'paracetamol' }
    );
    assert.equal(res.statusCode, 200);

    await daemon.stop();
  } finally {
    await cleanupTmpDir(tmpDir, { handles: [handle] });
  }
});

test('Daemon without api_endpoints: POST /api/buscar returns 404', async () => {
  const tmpDir = await makeTempDir();
  let handle = null;
  try {
    handle = await openRuntimeDb(tmpDir);
    await fs.mkdir(path.join(tmpDir, '.aioson', 'squads', 'noapi-squad', 'workers'), { recursive: true });

    const daemon = new SquadDaemon(tmpDir, 'noapi-squad', { port: 0, poll: 60000 });
    const info = await daemon.start();

    const res = await makeRequest(
      { hostname: '127.0.0.1', port: info.port, path: '/api/buscar' },
      {}
    );
    assert.equal(res.statusCode, 404);
    const body = JSON.parse(res.body);
    assert.equal(body.error, 'api_endpoint_not_found');

    await daemon.stop();
  } finally {
    await cleanupTmpDir(tmpDir, { handles: [handle] });
  }
});

test('CORS: origin in whitelist receives Access-Control-Allow-Origin header', async () => {
  const tmpDir = await makeTempDir();
  let handle = null;
  try {
    handle = await openRuntimeDb(tmpDir);
    const script = 'process.stdout.write(JSON.stringify({ ok: true })); process.exit(0);';
    await setupWorker(tmpDir, 'cors-squad', 'api-worker', {
      slug: 'api-worker', name: 'API Worker', type: 'webhook', timeout_ms: 5000
    }, script);

    const daemon = new SquadDaemon(tmpDir, 'cors-squad', {
      port: 0, poll: 60000,
      config: {
        api_endpoints: [
          { path: '/data', worker: 'api-worker', method: 'POST', cors_origins: ['https://farmacia.com'] }
        ]
      }
    });
    const info = await daemon.start();

    const res = await makeRequest(
      { hostname: '127.0.0.1', port: info.port, path: '/api/data' },
      {},
      'POST',
      { origin: 'https://farmacia.com' }
    );
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['access-control-allow-origin'], 'https://farmacia.com');

    await daemon.stop();
  } finally {
    await cleanupTmpDir(tmpDir, { handles: [handle] });
  }
});

test('CORS: origin not in whitelist does not receive Access-Control-Allow-Origin header', async () => {
  const tmpDir = await makeTempDir();
  let handle = null;
  try {
    handle = await openRuntimeDb(tmpDir);
    const script = 'process.stdout.write(JSON.stringify({ ok: true })); process.exit(0);';
    await setupWorker(tmpDir, 'cors2-squad', 'api-worker', {
      slug: 'api-worker', name: 'API Worker', type: 'webhook', timeout_ms: 5000
    }, script);

    const daemon = new SquadDaemon(tmpDir, 'cors2-squad', {
      port: 0, poll: 60000,
      config: {
        api_endpoints: [
          { path: '/data', worker: 'api-worker', method: 'POST', cors_origins: ['https://farmacia.com'] }
        ]
      }
    });
    const info = await daemon.start();

    const res = await makeRequest(
      { hostname: '127.0.0.1', port: info.port, path: '/api/data' },
      {},
      'POST',
      { origin: 'https://evil.com' }
    );
    assert.equal(res.statusCode, 200);
    assert.ok(!res.headers['access-control-allow-origin'], 'should not set CORS header for unlisted origin');

    await daemon.stop();
  } finally {
    await cleanupTmpDir(tmpDir, { handles: [handle] });
  }
});

test('OPTIONS preflight returns 204', async () => {
  const tmpDir = await makeTempDir();
  let handle = null;
  try {
    handle = await openRuntimeDb(tmpDir);
    await fs.mkdir(path.join(tmpDir, '.aioson', 'squads', 'opt-squad', 'workers'), { recursive: true });

    const daemon = new SquadDaemon(tmpDir, 'opt-squad', {
      port: 0, poll: 60000,
      config: {
        api_endpoints: [
          { path: '/check', worker: 'check', method: 'POST', cors_origins: ['https://farmacia.com'] }
        ]
      }
    });
    const info = await daemon.start();

    const res = await makeRequest(
      { hostname: '127.0.0.1', port: info.port, path: '/api/check' },
      undefined,
      'OPTIONS',
      { origin: 'https://farmacia.com' }
    );
    assert.equal(res.statusCode, 204);

    await daemon.stop();
  } finally {
    await cleanupTmpDir(tmpDir, { handles: [handle] });
  }
});

// --- Tests: context-writer Squad API Endpoints section ---

test('renderSquadApiSection: returns section with endpoints when squad has api_endpoints', async () => {
  const tmpDir = await makeTempDir();
  try {
    const squadDir = path.join(tmpDir, '.aioson', 'squads', 'farmacia');
    await fs.mkdir(squadDir, { recursive: true });
    await fs.writeFile(path.join(squadDir, 'squad.json'), JSON.stringify({
      port: 3001,
      api_endpoints: [
        { path: '/buscar', worker: 'buscar', method: 'POST', description: 'Busca produtos' }
      ]
    }));

    const section = await renderSquadApiSection(tmpDir);
    assert.ok(section.includes('## Squad API Endpoints'));
    assert.ok(section.includes('farmacia'));
    assert.ok(section.includes('/api/buscar'));
    assert.ok(section.includes('Busca produtos'));
    assert.ok(section.includes('3001'));
  } finally {
    await fs.rm(tmpDir, { recursive: true });
  }
});

test('renderSquadApiSection: returns empty string when no squads have api_endpoints', async () => {
  const tmpDir = await makeTempDir();
  try {
    const section = await renderSquadApiSection(tmpDir);
    assert.equal(section, '');
  } finally {
    await fs.rm(tmpDir, { recursive: true });
  }
});

test('renderSquadApiSection: squad without squad.json is skipped', async () => {
  const tmpDir = await makeTempDir();
  try {
    const squadDir = path.join(tmpDir, '.aioson', 'squads', 'no-json-squad');
    await fs.mkdir(squadDir, { recursive: true });
    // No squad.json

    const section = await renderSquadApiSection(tmpDir);
    assert.equal(section, '');
  } finally {
    await fs.rm(tmpDir, { recursive: true });
  }
});

// --- Tests: squad:validate api_endpoints worker check ---

test('squad:validate fails with clear message if api_endpoints worker does not exist', async () => {
  const tmpDir = await makeTempDir();
  try {
    const squadDir = path.join(tmpDir, '.aioson', 'squads', 'api-val-squad');
    await fs.mkdir(path.join(squadDir, 'agents'), { recursive: true });
    await fs.writeFile(path.join(squadDir, 'agents', 'agents.md'), '# Agents');
    await fs.writeFile(path.join(squadDir, 'agents', 'orquestrador.md'), '# Orquestrador');

    const manifest = {
      schemaVersion: '1',
      slug: 'api-val-squad',
      name: 'API Val Squad',
      mode: 'software',
      mission: 'Test',
      goal: 'Test',
      api_endpoints: [
        { path: '/buscar', worker: 'missing-worker', method: 'POST' }
      ]
    };
    await fs.writeFile(path.join(squadDir, 'squad.manifest.json'), JSON.stringify(manifest));

    const logger = { log() {}, error() {} };
    const result = await runSquadValidate({
      args: [tmpDir],
      options: { squad: 'api-val-squad' },
      logger
    });

    assert.equal(result.valid, false);
    const errorMsg = result.errors.find(e => e.includes('missing-worker'));
    assert.ok(errorMsg, `Expected error about missing-worker, got: ${JSON.stringify(result.errors)}`);
  } finally {
    await fs.rm(tmpDir, { recursive: true });
  }
});

test('squad:validate passes api_endpoints check when worker directory exists', async () => {
  const tmpDir = await makeTempDir();
  try {
    const squadDir = path.join(tmpDir, '.aioson', 'squads', 'api-ok-squad');
    await fs.mkdir(path.join(squadDir, 'agents'), { recursive: true });
    await fs.mkdir(path.join(squadDir, 'workers', 'buscar'), { recursive: true });
    await fs.writeFile(path.join(squadDir, 'agents', 'agents.md'), '# Agents');
    await fs.writeFile(path.join(squadDir, 'agents', 'orquestrador.md'), '# Orquestrador');
    await fs.writeFile(
      path.join(squadDir, 'workers', 'buscar', 'worker.json'),
      JSON.stringify({ slug: 'buscar' })
    );

    const manifest = {
      schemaVersion: '1',
      slug: 'api-ok-squad',
      name: 'API OK Squad',
      mode: 'software',
      mission: 'Test',
      goal: 'Test',
      api_endpoints: [
        { path: '/buscar', worker: 'buscar', method: 'POST' }
      ]
    };
    await fs.writeFile(path.join(squadDir, 'squad.manifest.json'), JSON.stringify(manifest));

    const logger = { log() {}, error() {} };
    const result = await runSquadValidate({
      args: [tmpDir],
      options: { squad: 'api-ok-squad' },
      logger
    });

    const apiErrors = result.errors.filter(e => e.includes('api_endpoints'));
    assert.equal(apiErrors.length, 0, `Unexpected api_endpoints errors: ${JSON.stringify(apiErrors)}`);
  } finally {
    await fs.rm(tmpDir, { recursive: true });
  }
});
