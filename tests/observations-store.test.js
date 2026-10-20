'use strict';

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { addObservation, resolveObservation, readStore, observationId, refExists, observationsPath } = require('../src/lib/observations');

let root;
let children;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-observations-concurrency-'));
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

// Lane workers and parallel terminals each run their own `aioson observe`.
const childScript = `
  const { once } = require('node:events');
  const { addObservation } = require(process.argv[1]);
  const root = process.argv[2];
  const worker = process.argv[3];
  (async () => {
    const start = once(process, 'message');
    process.send('ready');
    await start;
    for (let i = 0; i < 4; i++) {
      await addObservation(root, { kind: 'defect', summary: 'worker ' + worker + ' noticed item number ' + i, agent: 'dev' });
    }
    process.disconnect();
  })().catch((error) => { process.stderr.write(error.stack); process.exit(1); });
`;

function startChild(worker) {
  const child = spawn(process.execPath, ['-e', childScript, require.resolve('../src/lib/observations'), root, worker], {
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    windowsHide: true
  });
  children.push(child);
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  return { child, ready: once(child, 'message'), exited: once(child, 'exit').then(([code]) => ({ code, stderr })) };
}

async function storedItems() {
  const { store, error } = await readStore(root);
  assert.equal(error, null);
  return store.items;
}

test('concurrent observations in one process keep every item and leave no lock or temp behind', async () => {
  await Promise.all(Array.from({ length: 16 }, (_, i) => addObservation(root, {
    kind: 'idea',
    summary: `parallel idea number ${i} about the checkout`
  })));
  const items = await storedItems();
  assert.equal(items.length, 16);
  const leftovers = (await fs.readdir(path.join(root, '.aioson', 'context'))).filter((name) => name !== 'observations.json');
  assert.deepEqual(leftovers, []);
});

test('separate CLI processes retain every observation written at the same time', { timeout: 20000 }, async () => {
  const workers = Array.from({ length: 4 }, (_, i) => startChild(String(i)));
  await Promise.all(workers.map((worker) => worker.ready));
  for (const worker of workers) worker.child.send('go');
  for (const result of await Promise.all(workers.map((worker) => worker.exited))) assert.equal(result.code, 0, result.stderr);
  assert.equal(new Set((await storedItems()).map((item) => item.id)).size, 16);
});

test('a resolve racing a new observation keeps both writes', async () => {
  const first = await addObservation(root, { kind: 'risk', summary: 'the retry loop may double charge the card' });
  await Promise.all([
    resolveObservation(root, { id: first.item.id, as: 'dismissed', why: 'payments are idempotent by key' }),
    addObservation(root, { kind: 'question', summary: 'which currency does phase 4 display first' })
  ]);
  const items = await storedItems();
  assert.equal(items.length, 2);
  assert.equal(items.find((item) => item.id === first.item.id).status, 'resolved');
});

test('two different summaries whose short ids collide stay two items; a repeat of either still raises its own seen', async () => {
  // A real pair: both hash to OBS-c7a56c at six hex digits.
  const a = 'checkout total rounding differs case 1853';
  const b = 'checkout total rounding differs case 2710';
  assert.equal(observationId('defect', a), observationId('defect', b));
  const first = await addObservation(root, { kind: 'defect', summary: a });
  const second = await addObservation(root, { kind: 'defect', summary: b });
  assert.equal(second.created, true, 'a collision is a new item, not a repeat');
  assert.notEqual(second.item.id, first.item.id);
  assert.equal((await addObservation(root, { kind: 'defect', summary: b })).item.id, second.item.id);
  const items = await storedItems();
  assert.equal(items.length, 2);
  assert.deepEqual(items.map((item) => item.seen), [1, 2]);
});

test('a hand-edited item missing its paths or with an edited summary is re-observed, not crashed or duplicated', async () => {
  const first = await addObservation(root, { kind: 'process', summary: 'the guard repeats the UI rule on markdown edits' });
  const file = observationsPath(root);
  const store = JSON.parse(await fs.readFile(file, 'utf8'));
  delete store.items[0].paths;
  store.items[0].resolution = null;
  store.items[0].status = 'resolved';
  await fs.writeFile(file, JSON.stringify(store));
  const again = await addObservation(root, { kind: 'process', summary: 'the guard repeats the UI rule on markdown edits', paths: 'src/lib/guard.js' });
  assert.equal(again.item.id, first.item.id);
  assert.equal(again.reopened, true);
  assert.deepEqual(again.item.paths, ['src/lib/guard.js']);

  const edited = JSON.parse(await fs.readFile(file, 'utf8'));
  edited.items[0].summary = 'the guard repeats the UI rule when only markdown changed';
  await fs.writeFile(file, JSON.stringify(edited));
  const repeat = await addObservation(root, { kind: 'process', summary: 'the guard repeats the UI rule on markdown edits' });
  assert.equal(repeat.created, false, 'the owner reworded it; it is still the same item');
  assert.equal((await storedItems()).length, 1);
});

test('a resolve ref outside the project is refused on any drive; a dotted feature slug is a slug', async () => {
  const outside = process.platform === 'win32' ? `${root[0].toUpperCase() === 'C' ? 'D' : 'C'}:\\elsewhere\\plan.md` : '/etc/hostname';
  assert.deepEqual(await refExists(root, outside), { ok: false, reason: 'outside the project' });
  assert.deepEqual(await refExists(root, '../plan.md'), { ok: false, reason: 'outside the project' });
  await fs.mkdir(path.join(root, '.aioson', 'context', 'features', 'checkout-v2.0'), { recursive: true });
  assert.deepEqual(await refExists(root, 'checkout-v2.0'), { ok: true, kind: 'feature' });
  assert.equal((await refExists(root, 'docs/missing.md')).reason, 'path does not exist');
});
