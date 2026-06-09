'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { SquadDaemon } = require('../src/squad-daemon');
const { openRuntimeDb } = require('../src/runtime-store');
const { runSquadDeploy, generateNginxConf } = require('../src/commands/squad-deploy');
const { runSquadDoctor } = require('../src/commands/squad-doctor');
const { cleanupTmpDir } = require('./helpers/sqlite-cleanup');

// --- Helpers ---

async function makeTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-wh-prod-'));
}

async function setupWorker(tmpDir, squadSlug, workerSlug, config, script) {
  const workerDir = path.join(tmpDir, '.aioson', 'squads', squadSlug, 'workers', workerSlug);
  await fs.mkdir(workerDir, { recursive: true });
  await fs.writeFile(path.join(workerDir, 'worker.json'), JSON.stringify(config, null, 2));
  if (script) {
    await fs.writeFile(path.join(workerDir, 'run.js'), script);
  }
}

function makeRequest(options, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const data = body !== undefined ? JSON.stringify(body) : '';
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data),
      ...extraHeaders
    };
    const req = http.request({ ...options, headers }, (res) => {
      let respBody = '';
      res.on('data', (c) => { respBody += c; });
      res.on('end', () => resolve({ statusCode: res.statusCode, body: respBody }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function hmacSha256(secret, body) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
}

// --- Tests: webhook.bind ---

test('SquadDaemon uses webhook.bind when set in config', async () => {
  const tmpDir = await makeTempDir();
  let handle = null;
  try {
    handle = await openRuntimeDb(tmpDir);
    await fs.mkdir(path.join(tmpDir, '.aioson', 'squads', 'bind-squad', 'workers'), { recursive: true });

    const daemon = new SquadDaemon(tmpDir, 'bind-squad', {
      port: 0,
      poll: 60000,
      config: { webhook: { bind: '127.0.0.1' } }
    });
    await daemon.start();
    const addr = daemon.httpServer.address();
    assert.equal(addr.address, '127.0.0.1');
    await daemon.stop();
  } finally {
    await cleanupTmpDir(tmpDir, { handles: [handle] });
  }
});

test('SquadDaemon defaults to 127.0.0.1 when no webhook.bind', async () => {
  const tmpDir = await makeTempDir();
  let handle = null;
  try {
    handle = await openRuntimeDb(tmpDir);
    await fs.mkdir(path.join(tmpDir, '.aioson', 'squads', 'nobind-squad', 'workers'), { recursive: true });

    const daemon = new SquadDaemon(tmpDir, 'nobind-squad', { port: 0, poll: 60000 });
    await daemon.start();
    const addr = daemon.httpServer.address();
    assert.equal(addr.address, '127.0.0.1');
    await daemon.stop();
  } finally {
    await cleanupTmpDir(tmpDir, { handles: [handle] });
  }
});

// --- Tests: HMAC validation disabled ---

test('_handleWebhook with validate_signature=false accepts request without HMAC header', async () => {
  const tmpDir = await makeTempDir();
  let handle = null;
  try {
    handle = await openRuntimeDb(tmpDir);
    const script = 'process.stdout.write(JSON.stringify({ ok: true })); process.exit(0);';
    await setupWorker(tmpDir, 'nosig-squad', 'echo', {
      slug: 'echo', name: 'Echo', type: 'webhook', timeout_ms: 5000
    }, script);

    const daemon = new SquadDaemon(tmpDir, 'nosig-squad', {
      port: 0, poll: 60000,
      config: { webhook: { validate_signature: false } }
    });
    const info = await daemon.start();

    const res = await makeRequest({
      hostname: '127.0.0.1', port: info.port, path: '/webhook/echo', method: 'POST'
    }, { msg: 'hello' });
    assert.equal(res.statusCode, 200);

    await daemon.stop();
  } finally {
    await cleanupTmpDir(tmpDir, { handles: [handle] });
  }
});

// --- Tests: HMAC validation enabled ---

test('_handleWebhook with correct HMAC returns 200', async () => {
  const tmpDir = await makeTempDir();
  const secret = 'test-secret-abc';
  const origEnv = process.env.TEST_HMAC_SECRET;
  process.env.TEST_HMAC_SECRET = secret;
  let handle = null;
  try {
    handle = await openRuntimeDb(tmpDir);
    const script = 'process.stdout.write(JSON.stringify({ ok: true })); process.exit(0);';
    await setupWorker(tmpDir, 'hmac-squad', 'echo', {
      slug: 'echo', name: 'Echo', type: 'webhook', timeout_ms: 5000
    }, script);

    const daemon = new SquadDaemon(tmpDir, 'hmac-squad', {
      port: 0, poll: 60000,
      config: {
        webhook: {
          validate_signature: true,
          signature_env: 'TEST_HMAC_SECRET',
          signature_header: 'x-hub-signature-256'
        }
      }
    });
    const info = await daemon.start();

    const bodyStr = JSON.stringify({ msg: 'hello' });
    const sig = hmacSha256(secret, bodyStr);

    const res = await makeRequest(
      { hostname: '127.0.0.1', port: info.port, path: '/webhook/echo', method: 'POST' },
      { msg: 'hello' },
      { 'x-hub-signature-256': sig }
    );
    assert.equal(res.statusCode, 200);

    await daemon.stop();
  } finally {
    if (origEnv === undefined) delete process.env.TEST_HMAC_SECRET;
    else process.env.TEST_HMAC_SECRET = origEnv;
    await cleanupTmpDir(tmpDir, { handles: [handle] });
  }
});

test('_handleWebhook with wrong HMAC returns 401', async () => {
  const tmpDir = await makeTempDir();
  const secret = 'test-secret-xyz';
  const origEnv = process.env.TEST_HMAC_WRONG;
  process.env.TEST_HMAC_WRONG = secret;
  let handle = null;
  try {
    handle = await openRuntimeDb(tmpDir);
    await fs.mkdir(path.join(tmpDir, '.aioson', 'squads', 'badhmac-squad', 'workers'), { recursive: true });

    const daemon = new SquadDaemon(tmpDir, 'badhmac-squad', {
      port: 0, poll: 60000,
      config: {
        webhook: {
          validate_signature: true,
          signature_env: 'TEST_HMAC_WRONG',
          signature_header: 'x-hub-signature-256'
        }
      }
    });
    const info = await daemon.start();

    const res = await makeRequest(
      { hostname: '127.0.0.1', port: info.port, path: '/webhook/some-worker', method: 'POST' },
      { msg: 'hello' },
      { 'x-hub-signature-256': 'sha256=invalidsignature' }
    );
    assert.equal(res.statusCode, 401);
    const parsed = JSON.parse(res.body);
    assert.equal(parsed.error, 'invalid_signature');

    await daemon.stop();
  } finally {
    if (origEnv === undefined) delete process.env.TEST_HMAC_WRONG;
    else process.env.TEST_HMAC_WRONG = origEnv;
    await cleanupTmpDir(tmpDir, { handles: [handle] });
  }
});

test('_handleWebhook without HMAC header when signature required returns 401', async () => {
  const tmpDir = await makeTempDir();
  const origEnv = process.env.TEST_HMAC_REQ;
  process.env.TEST_HMAC_REQ = 'some-secret';
  let handle = null;
  try {
    handle = await openRuntimeDb(tmpDir);
    await fs.mkdir(path.join(tmpDir, '.aioson', 'squads', 'reqsig-squad', 'workers'), { recursive: true });

    const daemon = new SquadDaemon(tmpDir, 'reqsig-squad', {
      port: 0, poll: 60000,
      config: {
        webhook: {
          validate_signature: true,
          signature_env: 'TEST_HMAC_REQ',
          signature_header: 'x-hub-signature-256'
        }
      }
    });
    const info = await daemon.start();

    const res = await makeRequest(
      { hostname: '127.0.0.1', port: info.port, path: '/webhook/some-worker', method: 'POST' },
      { msg: 'hello' }
      // no signature header
    );
    assert.equal(res.statusCode, 401);
    const parsed = JSON.parse(res.body);
    assert.equal(parsed.error, 'signature_required');

    await daemon.stop();
  } finally {
    if (origEnv === undefined) delete process.env.TEST_HMAC_REQ;
    else process.env.TEST_HMAC_REQ = origEnv;
    await cleanupTmpDir(tmpDir, { handles: [handle] });
  }
});

test('_handleWebhook when signature env var not set returns 401 signature_required', async () => {
  const tmpDir = await makeTempDir();
  const envKey = 'TEST_HMAC_UNSET_' + Date.now();
  delete process.env[envKey]; // ensure unset
  let handle = null;
  try {
    handle = await openRuntimeDb(tmpDir);
    await fs.mkdir(path.join(tmpDir, '.aioson', 'squads', 'unset-squad', 'workers'), { recursive: true });

    const daemon = new SquadDaemon(tmpDir, 'unset-squad', {
      port: 0, poll: 60000,
      config: {
        webhook: {
          validate_signature: true,
          signature_env: envKey,
          signature_header: 'x-hub-signature-256'
        }
      }
    });
    const info = await daemon.start();

    const res = await makeRequest(
      { hostname: '127.0.0.1', port: info.port, path: '/webhook/some-worker', method: 'POST' },
      { msg: 'hello' },
      { 'x-hub-signature-256': 'sha256=anyvalue' }
    );
    assert.equal(res.statusCode, 401);
    const parsed = JSON.parse(res.body);
    assert.equal(parsed.error, 'signature_required');

    await daemon.stop();
  } finally {
    await cleanupTmpDir(tmpDir, { handles: [handle] });
  }
});

// --- Tests: generateNginxConf ---

test('generateNginxConf includes slug and port', () => {
  const conf = generateNginxConf('farmacia', 3001, 'cloudpanel');
  assert.ok(conf.includes('farmacia'));
  assert.ok(conf.includes('3001'));
  assert.ok(conf.includes('cloudpanel'));
  assert.ok(conf.includes('location /farmacia/webhook/'));
  assert.ok(conf.includes('proxy_pass http://127.0.0.1:3001/webhook/'));
});

// --- Tests: runSquadDeploy ---

test('runSquadDeploy creates nginx.conf with correct slug and port', async () => {
  const tmpDir = await makeTempDir();
  try {
    const squadDir = path.join(tmpDir, '.aioson', 'squads', 'farmacia-test');
    await fs.mkdir(squadDir, { recursive: true });
    await fs.writeFile(
      path.join(squadDir, 'squad.json'),
      JSON.stringify({ port: 4321, webhook: { public: true } })
    );

    const logs = [];
    const logger = { log: (m) => logs.push(m), error: (m) => logs.push(m) };

    const result = await runSquadDeploy({
      args: ['farmacia-test', tmpDir],
      options: { provider: 'cloudpanel' },
      logger
    });

    assert.ok(result.ok);
    const content = await fs.readFile(result.path, 'utf8');
    assert.ok(content.includes('farmacia-test'));
    assert.ok(content.includes('4321'));
    assert.ok(content.includes('cloudpanel'));
    assert.ok(content.includes('location /farmacia-test/webhook/'));
  } finally {
    await fs.rm(tmpDir, { recursive: true, maxRetries: 5, retryDelay: 50 });
  }
});

test('runSquadDeploy returns error when squad.json missing', async () => {
  const tmpDir = await makeTempDir();
  try {
    const logs = [];
    const logger = { log: (m) => logs.push(m), error: (m) => logs.push(m) };
    const result = await runSquadDeploy({
      args: ['missing-squad', tmpDir],
      options: {},
      logger
    });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'squad_not_found');
  } finally {
    await fs.rm(tmpDir, { recursive: true, maxRetries: 5, retryDelay: 50 });
  }
});

test('runSquadDeploy requires squad slug', async () => {
  const logs = [];
  const logger = { log: (m) => logs.push(m), error: (m) => logs.push(m) };
  const result = await runSquadDeploy({ args: [], options: {}, logger });
  assert.equal(result.ok, false);
});

// --- Tests: squad:doctor webhook checks ---

async function setupMinimalSquad(tmpDir, squadSlug, squadJson) {
  const squadDir = path.join(tmpDir, '.aioson', 'squads', squadSlug);
  await fs.mkdir(squadDir, { recursive: true });
  // Minimal manifest
  const manifest = {
    slug: squadSlug,
    name: 'Test Squad',
    executors: [],
    rules: {}
  };
  await fs.writeFile(path.join(squadDir, 'squad.manifest.json'), JSON.stringify(manifest));
  await fs.writeFile(path.join(squadDir, 'squad.md'), `# ${squadSlug}`);
  if (squadJson) {
    await fs.writeFile(path.join(squadDir, 'squad.json'), JSON.stringify(squadJson));
  }
}

test('squad:doctor reports error when validate_signature=true but env var missing', async () => {
  const tmpDir = await makeTempDir();
  const envKey = 'TEST_DOCTOR_MISSING_' + Date.now();
  delete process.env[envKey];
  try {
    await setupMinimalSquad(tmpDir, 'doctor-squad', {
      webhook: {
        validate_signature: true,
        signature_env: envKey
      }
    });

    const logs = [];
    const logger = { log: (m) => logs.push(m), error: (m) => logs.push(m) };
    const t = (key, params) => {
      const map = {
        'squad_doctor.check_metadata': `Metadata: ${params?.path}`,
        'squad_doctor.check_manifest': `Manifest: ${params?.path}`,
        'squad_doctor.check_rules': `Rules: ${params?.path}`,
        'squad_doctor.check_design_doc': `Design doc: ${params?.path}`,
        'squad_doctor.check_readiness': `Readiness: ${params?.path}`,
        'squad_doctor.check_executors': `Executors: ${params?.count} (missing: ${params?.missing})`,
        'squad_doctor.check_output_dir': `Output dir: ${params?.path}`,
        'squad_doctor.check_media_dir': `Media dir: ${params?.path}`,
        'squad_doctor.check_runtime_missing': 'Runtime DB not found',
        'squad_doctor.check_active_runs': `Active runs: ${params?.count} (stale: ${params?.stale})`,
        'squad_doctor.check_content_indexing': `Content indexing: ${params?.indexed} indexed, ${params?.pending} pending`,
        'squad_doctor.report_title': `Doctor report: ${params?.squad} at ${params?.path}`,
        'squad_doctor.prefix_ok': '[ok]',
        'squad_doctor.prefix_warn': '[warn]',
        'squad_doctor.prefix_fail': '[fail]',
        'squad_doctor.check_line': `${params?.prefix} ${params?.message}`,
        'squad_doctor.summary': `Summary: ${params?.passed} ok, ${params?.warned} warn, ${params?.failed} fail`
      };
      return map[key] || key;
    };

    const result = await runSquadDoctor({
      args: [tmpDir],
      options: { squad: 'doctor-squad', json: true },
      logger,
      t
    });

    const webhookCheck = result.checks.find(c => c.id.startsWith('webhook_env_'));
    assert.ok(webhookCheck, 'webhook env check should be present');
    assert.equal(webhookCheck.ok, false);
    assert.equal(webhookCheck.severity, 'error');
    assert.ok(webhookCheck.message.includes(envKey));
  } finally {
    await fs.rm(tmpDir, { recursive: true, maxRetries: 5, retryDelay: 50 });
  }
});

test('squad:doctor reports ok when validate_signature=true and env var defined', async () => {
  const tmpDir = await makeTempDir();
  const envKey = 'TEST_DOCTOR_SET_' + Date.now();
  process.env[envKey] = 'my-secret';
  try {
    await setupMinimalSquad(tmpDir, 'doctor-ok-squad', {
      webhook: {
        validate_signature: true,
        signature_env: envKey
      }
    });

    const logs = [];
    const logger = { log: (m) => logs.push(m), error: (m) => logs.push(m) };
    const t = (key, params) => {
      const map = {
        'squad_doctor.check_metadata': `Metadata: ${params?.path}`,
        'squad_doctor.check_manifest': `Manifest: ${params?.path}`,
        'squad_doctor.check_rules': `Rules: ${params?.path}`,
        'squad_doctor.check_design_doc': `Design doc: ${params?.path}`,
        'squad_doctor.check_readiness': `Readiness: ${params?.path}`,
        'squad_doctor.check_executors': `Executors: ${params?.count}`,
        'squad_doctor.check_output_dir': `Output dir: ${params?.path}`,
        'squad_doctor.check_media_dir': `Media dir: ${params?.path}`,
        'squad_doctor.check_runtime_missing': 'Runtime DB not found',
        'squad_doctor.check_active_runs': `Active runs: ${params?.count}`,
        'squad_doctor.check_content_indexing': `Content indexing: ${params?.indexed}`,
        'squad_doctor.report_title': `Doctor report`,
        'squad_doctor.prefix_ok': '[ok]',
        'squad_doctor.prefix_warn': '[warn]',
        'squad_doctor.prefix_fail': '[fail]',
        'squad_doctor.check_line': `${params?.prefix} ${params?.message}`,
        'squad_doctor.summary': `Summary`
      };
      return map[key] || key;
    };

    const result = await runSquadDoctor({
      args: [tmpDir],
      options: { squad: 'doctor-ok-squad', json: true },
      logger,
      t
    });

    const webhookCheck = result.checks.find(c => c.id.startsWith('webhook_env_'));
    assert.ok(webhookCheck, 'webhook env check should be present');
    assert.equal(webhookCheck.ok, true);
  } finally {
    delete process.env[envKey];
    await fs.rm(tmpDir, { recursive: true, maxRetries: 5, retryDelay: 50 });
  }
});

test('squad:doctor adds public webhook warning when webhook.public=true', async () => {
  const tmpDir = await makeTempDir();
  try {
    await setupMinimalSquad(tmpDir, 'public-squad', {
      webhook: { public: true }
    });

    const logs = [];
    const logger = { log: (m) => logs.push(m), error: (m) => logs.push(m) };
    const t = (key, params) => {
      const map = {
        'squad_doctor.check_metadata': `Metadata`,
        'squad_doctor.check_manifest': `Manifest`,
        'squad_doctor.check_rules': `Rules`,
        'squad_doctor.check_design_doc': `Design doc`,
        'squad_doctor.check_readiness': `Readiness`,
        'squad_doctor.check_executors': `Executors`,
        'squad_doctor.check_output_dir': `Output dir`,
        'squad_doctor.check_media_dir': `Media dir`,
        'squad_doctor.check_runtime_missing': 'Runtime DB not found',
        'squad_doctor.check_active_runs': `Active runs`,
        'squad_doctor.check_content_indexing': `Content indexing`,
        'squad_doctor.report_title': `Doctor report`,
        'squad_doctor.prefix_ok': '[ok]',
        'squad_doctor.prefix_warn': '[warn]',
        'squad_doctor.prefix_fail': '[fail]',
        'squad_doctor.check_line': `${params?.prefix} ${params?.message}`,
        'squad_doctor.summary': `Summary`
      };
      return map[key] || key;
    };

    const result = await runSquadDoctor({
      args: [tmpDir],
      options: { squad: 'public-squad', json: true },
      logger,
      t
    });

    const deployCheck = result.checks.find(c => c.id === 'webhook_public_deploy');
    assert.ok(deployCheck, 'public deploy warning should be present');
    assert.equal(deployCheck.severity, 'warn');
    assert.ok(deployCheck.message.includes('squad:deploy'));
  } finally {
    await fs.rm(tmpDir, { recursive: true, maxRetries: 5, retryDelay: 50 });
  }
});
