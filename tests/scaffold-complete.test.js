'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createTranslator } = require('../src/i18n');
const { runLiveStart } = require('../src/commands/live');
const { runScaffoldComplete } = require('../src/commands/scaffold-complete');
const { openRuntimeDb } = require('../src/runtime-store');

async function makeTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-scaffold-complete-'));
}

function createQuietLogger() {
  const lines = [];
  return { lines, log(l) { lines.push(String(l)); }, error(l) { lines.push(String(l)); } };
}

async function startSession(dir) {
  const { t } = createTranslator('en');
  const logger = createQuietLogger();
  const start = await runLiveStart({
    args: [dir],
    options: {
      tool: 'codex',
      'tool-bin': 'node',
      agent: 'product',
      'no-launch': true,
      json: true
    },
    logger,
    t
  });
  assert.equal(start.ok, true);
  return start;
}

async function writeManifest(dir, content) {
  const manifestPath = path.join(dir, 'manifest.json');
  await fs.writeFile(manifestPath, JSON.stringify(content, null, 2));
  return manifestPath;
}

test('scaffold:complete emits agent_events with correct schema', async () => {
  const dir = await makeTempDir();
  const start = await startSession(dir);
  const manifest = {
    slug: 'my-app',
    name: 'My App',
    description: 'Test app',
    version: '1.0.0',
    author_id: 'user-1',
    packages: []
  };
  await writeManifest(dir, manifest);

  const { t } = createTranslator('en');
  const logger = createQuietLogger();
  const result = await runScaffoldComplete({
    args: [dir],
    options: { slug: 'my-app', json: true },
    logger,
    t
  });

  assert.equal(result.ok, true);
  assert.equal(result.slug, 'my-app');
  assert.equal(result.runKey, start.runKey);
  assert.equal(result.sessionKey, start.sessionKey);

  const { db } = await openRuntimeDb(dir, { mustExist: true });
  try {
    const row = db
      .prepare(
        `SELECT event_type, message, payload_json, run_key
         FROM agent_events
         WHERE event_type = 'scaffold_complete'
         ORDER BY created_at DESC LIMIT 1`
      )
      .get();
    assert.equal(row.event_type, 'scaffold_complete');
    assert.equal(row.run_key, start.runKey);
    assert.match(row.message, /Scaffold complete: my-app/);

    const payload = JSON.parse(row.payload_json);
    assert.equal(payload.slug, 'my-app');
    assert.equal(payload.manifest.name, 'My App');
    assert.equal(payload.manifest.version, '1.0.0');
    assert.ok(payload.scaffold_path.includes(path.basename(dir)));
  } finally {
    db.close();
  }
});

test('scaffold:complete rejects invalid slug', async () => {
  const dir = await makeTempDir();
  await startSession(dir);
  await writeManifest(dir, { name: 'X', description: 'Y', version: '1.0.0' });
  const { t } = createTranslator('en');
  await assert.rejects(
    () => runScaffoldComplete({ args: [dir], options: { slug: 'BadSlug_!' }, logger: createQuietLogger(), t }),
    /Invalid slug/
  );
});

test('scaffold:complete rejects manifest with missing required fields', async () => {
  const dir = await makeTempDir();
  await startSession(dir);
  await writeManifest(dir, { name: 'X' }); // sem description, version
  const { t } = createTranslator('en');
  await assert.rejects(
    () => runScaffoldComplete({ args: [dir], options: { slug: 'app' }, logger: createQuietLogger(), t }),
    /missing required fields/
  );
});

test('scaffold:complete rejects slug mismatch with manifest.slug', async () => {
  const dir = await makeTempDir();
  await startSession(dir);
  await writeManifest(dir, {
    slug: 'other-slug',
    name: 'X',
    description: 'Y',
    version: '1.0.0'
  });
  const { t } = createTranslator('en');
  await assert.rejects(
    () => runScaffoldComplete({ args: [dir], options: { slug: 'app' }, logger: createQuietLogger(), t }),
    /Slug mismatch/
  );
});

test('scaffold:complete fails when no active session exists', async () => {
  const dir = await makeTempDir();
  await writeManifest(dir, { name: 'X', description: 'Y', version: '1.0.0' });
  const { t } = createTranslator('en');
  await assert.rejects(
    () => runScaffoldComplete({ args: [dir], options: { slug: 'app' }, logger: createQuietLogger(), t }),
    /Runtime DB not found/
  );
});
