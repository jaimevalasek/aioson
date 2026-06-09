'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
  loadWorkerConfig,
  listWorkers,
  runWorker,
  scaffoldWorker,
  generateWorkerJson,
  generateRunJs,
  generateWorkerReadme,
  validateInputs,
  resolveEnvVars
} = require('../src/worker-runner');
const {
  openRuntimeDb,
  insertWorkerRun,
  listWorkerRuns,
  getWorkerRunStats
} = require('../src/runtime-store');

async function makeTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-squad-worker-'));
}

async function setupWorker(tmpDir, squadSlug, workerSlug, config, script) {
  const workerDir = path.join(tmpDir, '.aioson', 'squads', squadSlug, 'workers', workerSlug);
  await fs.mkdir(workerDir, { recursive: true });
  await fs.writeFile(path.join(workerDir, 'worker.json'), JSON.stringify(config, null, 2));
  if (script) {
    await fs.writeFile(path.join(workerDir, 'run.js'), script);
  }
  return workerDir;
}

// --- Unit tests: validateInputs ---

test('validateInputs passes with no schema', () => {
  const result = validateInputs({}, null);
  assert.ok(result.valid);
  assert.equal(result.errors.length, 0);
});

test('validateInputs passes when all required fields present', () => {
  const result = validateInputs(
    { name: 'John', phone: '123' },
    { name: { type: 'string', required: true }, phone: { type: 'string', required: true } }
  );
  assert.ok(result.valid);
});

test('validateInputs fails when required field missing', () => {
  const result = validateInputs(
    { name: 'John' },
    { name: { type: 'string', required: true }, phone: { type: 'string', required: true } }
  );
  assert.ok(!result.valid);
  assert.ok(result.errors[0].includes('phone'));
});

test('validateInputs passes for optional fields', () => {
  const result = validateInputs(
    {},
    { notes: { type: 'string' } }
  );
  assert.ok(result.valid);
});

// --- Unit tests: resolveEnvVars ---

test('resolveEnvVars resolves existing env vars', () => {
  process.env.TEST_WORKER_VAR = 'hello';
  const resolved = resolveEnvVars(['TEST_WORKER_VAR', 'NONEXISTENT_VAR']);
  assert.equal(resolved.TEST_WORKER_VAR, 'hello');
  assert.ok(!('NONEXISTENT_VAR' in resolved));
  delete process.env.TEST_WORKER_VAR;
});

test('resolveEnvVars returns empty for null', () => {
  const resolved = resolveEnvVars(null);
  assert.deepEqual(resolved, {});
});

// --- Unit tests: generateWorkerJson ---

test('generateWorkerJson creates valid config', () => {
  const config = generateWorkerJson('send-sms', 'SMS Sender', 'scheduled', ['phone', 'message'], ['status'], ['SMS_API_KEY']);
  assert.equal(config.slug, 'send-sms');
  assert.equal(config.name, 'SMS Sender');
  assert.equal(config.type, 'scheduled');
  assert.ok('phone' in config.inputs);
  assert.ok('status' in config.outputs);
  assert.ok(config.env.includes('SMS_API_KEY'));
  assert.equal(config.trigger.type, 'scheduled');
  assert.ok(config.trigger.cron);
});

test('generateWorkerJson creates event trigger', () => {
  const config = generateWorkerJson('calc', 'Calc', 'event');
  assert.equal(config.trigger.type, 'event');
  assert.equal(config.trigger.source, 'content_item_created');
});

// --- Unit tests: generateRunJs ---

test('generateRunJs generates valid JS script', () => {
  const config = generateWorkerJson('test', 'Test', 'manual', ['name'], ['result']);
  const js = generateRunJs('test', config);
  assert.ok(js.includes('#!/usr/bin/env node'));
  assert.ok(js.includes('Worker: test'));
  assert.ok(js.includes('input.name'));
  assert.ok(js.includes('execute(input)'));
});

// --- Unit tests: generateWorkerReadme ---

test('generateWorkerReadme generates markdown', () => {
  const config = generateWorkerJson('send-msg', 'Sender', 'scheduled', ['phone'], ['status'], ['API_KEY']);
  const md = generateWorkerReadme('send-msg', config);
  assert.ok(md.includes('# Worker: Sender'));
  assert.ok(md.includes('scheduled'));
  assert.ok(md.includes('`phone`'));
  assert.ok(md.includes('`API_KEY`'));
});

// --- Integration tests: scaffoldWorker ---

test('scaffoldWorker creates worker files', async () => {
  const tmpDir = await makeTempDir();
  try {
    const result = await scaffoldWorker(tmpDir, 'odonto', 'confirma-consulta', {
      name: 'Confirmador',
      triggerType: 'scheduled',
      inputs: ['phone', 'date'],
      outputs: ['status'],
      env: ['WHATSAPP_TOKEN']
    });
    assert.ok(result.workerDir);
    assert.ok(result.config);

    // Verify files exist
    const configRaw = await fs.readFile(path.join(result.workerDir, 'worker.json'), 'utf8');
    const config = JSON.parse(configRaw);
    assert.equal(config.slug, 'confirma-consulta');
    assert.equal(config.type, 'scheduled');

    const runJs = await fs.readFile(path.join(result.workerDir, 'run.js'), 'utf8');
    assert.ok(runJs.includes('confirma-consulta'));

    const readme = await fs.readFile(path.join(result.workerDir, 'README.md'), 'utf8');
    assert.ok(readme.includes('Confirmador'));
  } finally {
    await fs.rm(tmpDir, { recursive: true, maxRetries: 5, retryDelay: 50 });
  }
});

// --- Integration tests: loadWorkerConfig / listWorkers ---

test('loadWorkerConfig returns config for existing worker', async () => {
  const tmpDir = await makeTempDir();
  try {
    await setupWorker(tmpDir, 'squad1', 'worker1', { slug: 'worker1', name: 'W1', type: 'manual' });
    const config = await loadWorkerConfig(tmpDir, 'squad1', 'worker1');
    assert.equal(config.slug, 'worker1');
  } finally {
    await fs.rm(tmpDir, { recursive: true, maxRetries: 5, retryDelay: 50 });
  }
});

test('loadWorkerConfig returns null for missing worker', async () => {
  const tmpDir = await makeTempDir();
  try {
    const config = await loadWorkerConfig(tmpDir, 'squad1', 'nonexistent');
    assert.equal(config, null);
  } finally {
    await fs.rm(tmpDir, { recursive: true, maxRetries: 5, retryDelay: 50 });
  }
});

test('listWorkers returns all workers for squad', async () => {
  const tmpDir = await makeTempDir();
  try {
    await setupWorker(tmpDir, 'squad1', 'w1', { slug: 'w1', name: 'W1', type: 'manual' });
    await setupWorker(tmpDir, 'squad1', 'w2', { slug: 'w2', name: 'W2', type: 'event' });
    const workers = await listWorkers(tmpDir, 'squad1');
    assert.equal(workers.length, 2);
    const slugs = workers.map(w => w.slug);
    assert.ok(slugs.includes('w1'));
    assert.ok(slugs.includes('w2'));
  } finally {
    await fs.rm(tmpDir, { recursive: true, maxRetries: 5, retryDelay: 50 });
  }
});

test('listWorkers returns empty for squad without workers', async () => {
  const tmpDir = await makeTempDir();
  try {
    const workers = await listWorkers(tmpDir, 'empty-squad');
    assert.deepEqual(workers, []);
  } finally {
    await fs.rm(tmpDir, { recursive: true, maxRetries: 5, retryDelay: 50 });
  }
});

// --- Integration tests: runWorker ---

test('runWorker executes JS script and returns output', async () => {
  const tmpDir = await makeTempDir();
  try {
    const script = `
const input = JSON.parse(process.argv[2] || '{}');
process.stdout.write(JSON.stringify({ greeting: 'hello ' + (input.name || 'world') }));
process.exit(0);
`;
    await setupWorker(tmpDir, 'squad1', 'greeter', {
      slug: 'greeter', name: 'Greeter', type: 'manual',
      inputs: { name: { type: 'string', required: false } },
      outputs: { greeting: { type: 'string' } },
      timeout_ms: 5000,
      retry: { attempts: 1 }
    }, script);

    const result = await runWorker(tmpDir, 'squad1', 'greeter', { name: 'Jaime' }, { noRetry: true });
    assert.ok(result.ok);
    assert.equal(result.output.greeting, 'hello Jaime');
    assert.ok(result.durationMs >= 0);
  } finally {
    await fs.rm(tmpDir, { recursive: true, maxRetries: 5, retryDelay: 50 });
  }
});

test('runWorker returns error for failing script', async () => {
  const tmpDir = await makeTempDir();
  try {
    const script = `
process.stderr.write(JSON.stringify({ error: 'something went wrong' }));
process.exit(1);
`;
    await setupWorker(tmpDir, 'squad1', 'fail-worker', {
      slug: 'fail-worker', name: 'Failer', type: 'manual',
      timeout_ms: 5000,
      retry: { attempts: 1 }
    }, script);

    const result = await runWorker(tmpDir, 'squad1', 'fail-worker', {}, { noRetry: true });
    assert.ok(!result.ok);
    assert.ok(result.error.includes('something went wrong'));
  } finally {
    await fs.rm(tmpDir, { recursive: true, maxRetries: 5, retryDelay: 50 });
  }
});

test('runWorker fails for missing worker config', async () => {
  const tmpDir = await makeTempDir();
  try {
    const result = await runWorker(tmpDir, 'squad1', 'ghost', {});
    assert.ok(!result.ok);
    assert.ok(result.error.includes('not found'));
  } finally {
    await fs.rm(tmpDir, { recursive: true, maxRetries: 5, retryDelay: 50 });
  }
});

test('runWorker validates required inputs', async () => {
  const tmpDir = await makeTempDir();
  try {
    await setupWorker(tmpDir, 'squad1', 'strict', {
      slug: 'strict', name: 'Strict', type: 'manual',
      inputs: { phone: { type: 'string', required: true } },
      timeout_ms: 5000
    }, 'process.stdout.write("{}"); process.exit(0);');

    const result = await runWorker(tmpDir, 'squad1', 'strict', {}, { noRetry: true });
    assert.ok(!result.ok);
    assert.ok(result.error.includes('phone'));
  } finally {
    await fs.rm(tmpDir, { recursive: true, maxRetries: 5, retryDelay: 50 });
  }
});

// --- Integration tests: worker_runs table ---

test('worker_runs table is created by openRuntimeDb', async () => {
  const tmpDir = await makeTempDir();
  try {
    const { db } = await openRuntimeDb(tmpDir);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='worker_runs'").all();
    assert.equal(tables.length, 1);
    db.close();
  } finally {
    await fs.rm(tmpDir, { recursive: true, maxRetries: 5, retryDelay: 50 });
  }
});

test('insertWorkerRun and listWorkerRuns work correctly', async () => {
  const tmpDir = await makeTempDir();
  try {
    const { db } = await openRuntimeDb(tmpDir);
    insertWorkerRun(db, {
      squadSlug: 'odonto',
      workerSlug: 'confirma',
      triggerType: 'manual',
      inputJson: '{"phone":"123"}',
      outputJson: '{"status":"confirmed"}',
      status: 'completed',
      durationMs: 150,
      attempt: 1
    });
    insertWorkerRun(db, {
      squadSlug: 'odonto',
      workerSlug: 'confirma',
      triggerType: 'scheduled',
      status: 'failed',
      errorMessage: 'timeout',
      durationMs: 30000,
      attempt: 3
    });

    const runs = listWorkerRuns(db, 'odonto');
    assert.equal(runs.length, 2);
    assert.equal(runs[0].status, 'failed'); // most recent first
    assert.equal(runs[1].status, 'completed');
    db.close();
  } finally {
    await fs.rm(tmpDir, { recursive: true, maxRetries: 5, retryDelay: 50 });
  }
});

test('getWorkerRunStats aggregates correctly', async () => {
  const tmpDir = await makeTempDir();
  try {
    const { db } = await openRuntimeDb(tmpDir);
    insertWorkerRun(db, { squadSlug: 's1', workerSlug: 'w1', triggerType: 'manual', status: 'completed', durationMs: 100 });
    insertWorkerRun(db, { squadSlug: 's1', workerSlug: 'w1', triggerType: 'manual', status: 'completed', durationMs: 200 });
    insertWorkerRun(db, { squadSlug: 's1', workerSlug: 'w1', triggerType: 'manual', status: 'failed', durationMs: 50 });

    const stats = getWorkerRunStats(db, 's1');
    assert.equal(stats.length, 2); // completed + failed
    const completed = stats.find(s => s.status === 'completed');
    assert.equal(completed.count, 2);
    assert.equal(completed.avg_duration_ms, 150);
    db.close();
  } finally {
    await fs.rm(tmpDir, { recursive: true, maxRetries: 5, retryDelay: 50 });
  }
});
