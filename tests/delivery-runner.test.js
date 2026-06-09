'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const Database = require('better-sqlite3');

const { runAutoDelivery, runManualDelivery, resolveEnvPlaceholders } = require('../src/delivery-runner');

async function makeTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-delivery-'));
}

function createTestDb(dir) {
  const dbDir = path.join(dir, '.aioson', 'runtime');
  require('node:fs').mkdirSync(dbDir, { recursive: true });
  const db = new Database(path.join(dbDir, 'aios.sqlite'));
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS delivery_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      squad_slug TEXT NOT NULL,
      content_key TEXT,
      webhook_slug TEXT,
      trigger_type TEXT NOT NULL,
      url TEXT NOT NULL,
      status_code INTEGER,
      response_body TEXT,
      error_message TEXT,
      attempt INTEGER DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_delivery_log_squad ON delivery_log(squad_slug);
    CREATE INDEX IF NOT EXISTS idx_delivery_log_content ON delivery_log(content_key);
  `);
  return db;
}

async function writeManifest(dir, slug, outputStrategy) {
  const squadDir = path.join(dir, '.aioson', 'squads', slug);
  await fs.mkdir(squadDir, { recursive: true });
  const manifest = {
    schemaVersion: '1.0.0',
    slug,
    name: 'Test Squad',
    mode: 'content',
    mission: 'Test',
    goal: 'Test',
    outputStrategy
  };
  await fs.writeFile(path.join(squadDir, 'squad.manifest.json'), JSON.stringify(manifest, null, 2));
}

function startTestServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({ server, port, url: `http://127.0.0.1:${port}` });
    });
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

test('resolveEnvPlaceholders replaces known vars', () => {
  process.env.__TEST_DELIVERY_VAR = 'hello';
  assert.equal(resolveEnvPlaceholders('{{ENV:__TEST_DELIVERY_VAR}}'), 'hello');
  assert.equal(resolveEnvPlaceholders('prefix-{{ENV:__TEST_DELIVERY_VAR}}-suffix'), 'prefix-hello-suffix');
  delete process.env.__TEST_DELIVERY_VAR;
});

test('resolveEnvPlaceholders returns empty for unknown vars', () => {
  assert.equal(resolveEnvPlaceholders('{{ENV:__TOTALLY_UNKNOWN_VAR_12345}}'), '');
});

test('runAutoDelivery returns no_manifest when manifest is missing', async () => {
  const dir = await makeTempDir();
  const db = createTestDb(dir);
  try {
    const result = await runAutoDelivery(db, {
      projectDir: dir,
      squadSlug: 'nonexistent',
      contentKey: 'test-key',
      contentPayload: { test: true }
    });
    assert.equal(result.delivered, false);
    assert.equal(result.reason, 'no_manifest');
  } finally {
    db.close();
    await fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
});

test('runAutoDelivery returns auto_publish_disabled when disabled', async () => {
  const dir = await makeTempDir();
  const db = createTestDb(dir);
  try {
    await writeManifest(dir, 'test-squad', {
      mode: 'hybrid',
      delivery: { autoPublish: false, webhooks: [] }
    });
    const result = await runAutoDelivery(db, {
      projectDir: dir,
      squadSlug: 'test-squad',
      contentKey: 'test-key',
      contentPayload: { test: true }
    });
    assert.equal(result.delivered, false);
    assert.equal(result.reason, 'auto_publish_disabled');
  } finally {
    db.close();
    await fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
});

test('runAutoDelivery sends webhook when autoPublish is true', async () => {
  const dir = await makeTempDir();
  const db = createTestDb(dir);
  let receivedPayload = null;

  const { server, url } = await startTestServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      receivedPayload = JSON.parse(body);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"ok":true}');
    });
  });

  try {
    await writeManifest(dir, 'test-squad', {
      mode: 'hybrid',
      delivery: {
        autoPublish: true,
        webhooks: [
          { slug: 'test-hook', url, trigger: 'on-publish', format: 'json' }
        ]
      }
    });

    const result = await runAutoDelivery(db, {
      projectDir: dir,
      squadSlug: 'test-squad',
      contentKey: 'my-content',
      contentPayload: { title: 'Test Content' }
    });

    assert.equal(result.delivered, true);
    assert.equal(result.allOk, true);
    assert.equal(result.results.length, 1);
    assert.equal(result.results[0].ok, true);
    assert.equal(result.results[0].statusCode, 200);

    // Verify payload was received
    assert.equal(receivedPayload.squadSlug, 'test-squad');
    assert.equal(receivedPayload.contentKey, 'my-content');
    assert.deepEqual(receivedPayload.content, { title: 'Test Content' });

    // Verify delivery log was written
    const logs = db.prepare('SELECT * FROM delivery_log WHERE squad_slug = ?').all('test-squad');
    assert.equal(logs.length, 1);
    assert.equal(logs[0].webhook_slug, 'test-hook');
    assert.equal(logs[0].status_code, 200);
    assert.equal(logs[0].trigger_type, 'auto');
  } finally {
    db.close();
    await closeServer(server);
    await fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
});

test('runAutoDelivery retries on 500 errors', async () => {
  const dir = await makeTempDir();
  const db = createTestDb(dir);
  let requestCount = 0;

  const { server, url } = await startTestServer((_req, res) => {
    requestCount++;
    if (requestCount < 3) {
      res.writeHead(500);
      res.end('Internal Server Error');
    } else {
      res.writeHead(200);
      res.end('OK');
    }
  });

  try {
    await writeManifest(dir, 'retry-squad', {
      mode: 'sqlite',
      delivery: {
        autoPublish: true,
        webhooks: [
          { slug: 'retry-hook', url, trigger: 'on-publish', format: 'json' }
        ]
      }
    });

    const result = await runAutoDelivery(db, {
      projectDir: dir,
      squadSlug: 'retry-squad',
      contentKey: 'retry-key',
      contentPayload: {}
    });

    assert.equal(result.delivered, true);
    assert.equal(result.allOk, true);
    assert.equal(result.results[0].attempts, 3);
    assert.equal(requestCount, 3);

    // Verify all attempts were logged
    const logs = db.prepare('SELECT * FROM delivery_log WHERE squad_slug = ? ORDER BY attempt').all('retry-squad');
    assert.equal(logs.length, 3);
    assert.equal(logs[0].status_code, 500);
    assert.equal(logs[1].status_code, 500);
    assert.equal(logs[2].status_code, 200);
  } finally {
    db.close();
    await closeServer(server);
    await fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
});

test('runAutoDelivery fails after max retries', async () => {
  const dir = await makeTempDir();
  const db = createTestDb(dir);

  const { server, url } = await startTestServer((_req, res) => {
    res.writeHead(503);
    res.end('Service Unavailable');
  });

  try {
    await writeManifest(dir, 'fail-squad', {
      mode: 'sqlite',
      delivery: {
        autoPublish: true,
        webhooks: [
          { slug: 'fail-hook', url, trigger: 'on-publish', format: 'json' }
        ]
      }
    });

    const result = await runAutoDelivery(db, {
      projectDir: dir,
      squadSlug: 'fail-squad',
      contentKey: 'fail-key',
      contentPayload: {}
    });

    assert.equal(result.delivered, true);
    assert.equal(result.allOk, false);
    assert.equal(result.results[0].ok, false);
    assert.equal(result.results[0].attempts, 3);

    const logs = db.prepare('SELECT * FROM delivery_log WHERE squad_slug = ?').all('fail-squad');
    assert.equal(logs.length, 3);
  } finally {
    db.close();
    await closeServer(server);
    await fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
});

test('runManualDelivery fires all webhooks on manual trigger', async () => {
  const dir = await makeTempDir();
  const db = createTestDb(dir);
  let hitCount = 0;

  const { server, url } = await startTestServer((_req, res) => {
    hitCount++;
    res.writeHead(200);
    res.end('OK');
  });

  try {
    await writeManifest(dir, 'manual-squad', {
      mode: 'hybrid',
      delivery: {
        autoPublish: false,
        webhooks: [
          { slug: 'hook-a', url, trigger: 'on-publish', format: 'json' },
          { slug: 'hook-b', url, trigger: 'manual', format: 'json' }
        ]
      }
    });

    const result = await runManualDelivery(db, {
      projectDir: dir,
      squadSlug: 'manual-squad',
      contentKey: 'manual-key',
      triggerType: 'manual',
      contentPayload: { title: 'Manual' }
    });

    assert.equal(result.delivered, true);
    assert.equal(result.results.length, 2);
    assert.equal(hitCount, 2);
  } finally {
    db.close();
    await closeServer(server);
    await fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
});

test('runAutoDelivery does not retry on 4xx errors (except 429)', async () => {
  const dir = await makeTempDir();
  const db = createTestDb(dir);
  let requestCount = 0;

  const { server, url } = await startTestServer((_req, res) => {
    requestCount++;
    res.writeHead(400);
    res.end('Bad Request');
  });

  try {
    await writeManifest(dir, 'no-retry-squad', {
      mode: 'sqlite',
      delivery: {
        autoPublish: true,
        webhooks: [
          { slug: 'no-retry-hook', url, trigger: 'on-publish', format: 'json' }
        ]
      }
    });

    const result = await runAutoDelivery(db, {
      projectDir: dir,
      squadSlug: 'no-retry-squad',
      contentKey: 'no-retry-key',
      contentPayload: {}
    });

    assert.equal(result.delivered, true);
    assert.equal(result.allOk, false);
    assert.equal(requestCount, 1); // No retry on 400
    assert.equal(result.results[0].attempts, 1);
  } finally {
    db.close();
    await closeServer(server);
    await fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
});
