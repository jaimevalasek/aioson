'use strict';

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { writeFeatureRow, tidyFeatureRegistry, parseFeatureRegistry, inspectFeatureRegistry } = require('../src/lib/feature-registry');
const { withRegistryLock, writeAtomically } = require('../src/lib/feature-registry-storage');
const { runFeatureRegister } = require('../src/commands/feature-registry');

let root;
let ctx;
let children;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-registry-concurrency-'));
  ctx = path.join(root, '.aioson', 'context');
  children = [];
});
afterEach(async () => {
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill();
      await exited;
    }
  }
  await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

const childScript = `
  const path = require('node:path');
  const { once } = require('node:events');
  const { writeFeatureRow } = require(process.argv[1]);
  const { withRegistryLock } = require(process.argv[2]);
  const root = process.argv[3];
  const mode = process.argv[4];
  (async () => {
    if (mode === 'hold') {
      await withRegistryLock(path.join(root, '.aioson', 'context'), async () => {
        const resume = once(process, 'message');
        process.send('locked');
        await resume;
      });
    } else {
      const start = once(process, 'message');
      process.send('ready');
      await start;
      for (let i = 0; i < 4; i++) await writeFeatureRow(root, { slug: mode + '-' + i, status: 'planning' });
    }
    process.disconnect();
  })().catch(error => { process.stderr.write(error.stack); process.exit(1); });
`;

function startChild(mode) {
  const child = spawn(process.execPath, ['-e', childScript,
    require.resolve('../src/lib/feature-registry'),
    require.resolve('../src/lib/feature-registry-storage'), root, mode
  ], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'], windowsHide: true });
  children.push(child);
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const ready = once(child, 'message');
  const exited = once(child, 'exit').then(([code]) => ({ code, stderr }));
  return { child, ready, exited };
}

test('concurrent row updates and tidy preserve all rows and relocated notes', { timeout: 15000 }, async () => {
  await writeFeatureRow(root, { slug: 'base', status: 'in_progress' });
  const file = path.join(ctx, 'features.md');
  await fs.appendFile(file, '\n# Operator decision\nKeep this heading and its explanation.\n');
  await Promise.all([
    ...Array.from({ length: 16 }, (_, i) => writeFeatureRow(root, { slug: `feature-${i}`, status: 'planning' })),
    tidyFeatureRegistry(root)
  ]);
  const registry = parseFeatureRegistry(await fs.readFile(file, 'utf8'));
  assert.equal(registry.rows.length, 17);
  assert.equal(registry.notes.length, 0);
  assert.match(await fs.readFile(path.join(ctx, 'done', 'registry-notes.md'), 'utf8'), /# Operator decision\nKeep this heading/);
  assert.ok(!(await fs.readdir(ctx)).some((name) => name.startsWith('.features')));
});

test('separate CLI processes retain every update to the shared registry', { timeout: 15000 }, async () => {
  const workers = Array.from({ length: 4 }, (_, i) => startChild(`worker-${i}`));
  await Promise.all(workers.map((worker) => worker.ready));
  for (const worker of workers) worker.child.send('go');
  for (const result of await Promise.all(workers.map((worker) => worker.exited))) assert.equal(result.code, 0, result.stderr);
  const registry = parseFeatureRegistry(await fs.readFile(path.join(ctx, 'features.md'), 'utf8'));
  assert.equal(new Set(registry.rows.map((row) => row.slug)).size, 16);
});

test('simultaneous registrations of the same slug report one creation and retain its start date', async () => {
  const outputs = await Promise.all(Array.from({ length: 8 }, () => runFeatureRegister({
    args: [root], options: { feature: 'same', json: true }
  })));
  assert.equal(outputs.filter((output) => output.created).length, 1);
  assert.equal(outputs.filter((output) => output.previousStatus === 'in_progress').length, 7);
  await runFeatureRegister({ args: [root], options: { feature: 'same', started: '2025-01-02', json: true } });
  const moved = await runFeatureRegister({ args: [root], options: { feature: 'same', status: 'paused', json: true } });
  assert.equal(moved.started, '2025-01-02');
});

test('a live owner cannot be displaced; a killed owner is recovered', { timeout: 15000 }, async () => {
  const holder = startChild('hold');
  assert.equal((await holder.ready)[0], 'locked');
  await assert.rejects(withRegistryLock(ctx, () => assert.fail('entered a held lock'), { timeoutMs: 75, pollMs: 10 }), { code: 'EFEATURELOCK' });
  holder.child.kill('SIGKILL');
  await holder.exited;
  await writeFeatureRow(root, { slug: 'recovered', status: 'planning' });
  assert.equal((await inspectFeatureRegistry(root)).measures.rows, 1);
});

test('failed operations release their lock and unreadable registries are never reset', async () => {
  await fs.mkdir(path.join(ctx, 'features.md'), { recursive: true });
  await assert.rejects(writeFeatureRow(root, { slug: 'lost' }));
  await assert.rejects(inspectFeatureRegistry(root));
  assert.ok(!(await fs.readdir(ctx)).some((name) => name.startsWith('.features')));
  await fs.rmdir(path.join(ctx, 'features.md'));
  await writeFeatureRow(root, { slug: 'retained' });
  assert.equal((await inspectFeatureRegistry(root)).measures.rows, 1);
});

test('a failed atomic replacement retains the previous file and cleans its temp', async (t) => {
  const file = path.join(root, 'state.md');
  await fs.writeFile(file, 'previous');
  t.mock.method(fs, 'rename', async () => { throw Object.assign(new Error('disk error'), { code: 'EIO' }); });
  await assert.rejects(writeAtomically(file, 'next'), { code: 'EIO' });
  assert.equal(await fs.readFile(file, 'utf8'), 'previous');
  assert.deepEqual(await fs.readdir(root), ['state.md']);
});

test('tidy keeps distinct backups even for the same clock timestamp', async () => {
  await writeFeatureRow(root, { slug: 'base' });
  const file = path.join(ctx, 'features.md');
  const now = () => new Date('2026-10-06T12:00:00Z');
  await fs.appendFile(file, '<!-- first note -->\n');
  const firstContent = await fs.readFile(file, 'utf8');
  const first = await tidyFeatureRegistry(root, { now });
  await fs.appendFile(file, '<!-- second note -->\n');
  const secondContent = await fs.readFile(file, 'utf8');
  const second = await tidyFeatureRegistry(root, { now });
  assert.notEqual(first.backup, second.backup);
  assert.equal(await fs.readFile(path.join(root, first.backup), 'utf8'), firstContent);
  assert.equal(await fs.readFile(path.join(root, second.backup), 'utf8'), secondContent);
});
