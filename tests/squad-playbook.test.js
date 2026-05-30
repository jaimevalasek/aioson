'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { runSquadPlaybook } = require('../src/commands/squad-playbook');

async function makeTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-playbook-'));
}

function collectLogger() {
  const lines = [];
  return { lines, log: (l) => lines.push(String(l)), error: (l) => lines.push(String(l)) };
}

test('capture writes an active entry, list returns it', async () => {
  const dir = await makeTempDir();
  const logger = collectLogger();

  const cap = await runSquadPlaybook({
    args: ['capture'],
    options: { dir, rule: 'roster from priors', lesson: 'derive roster from sourceDocs', from: 'editorial/c1', json: true },
    logger,
  });
  assert.ok(cap.ok);
  assert.equal(cap.captured.count, 1);

  const list = await runSquadPlaybook({ args: ['list'], options: { dir, json: true }, logger });
  assert.ok(list.ok);
  assert.equal(list.entries.length, 1);
  assert.equal(list.entries[0].rule, 'roster from priors');
  assert.equal(list.entries[0].from, 'editorial/c1');

  // file persisted under .aioson/squads/.playbook/
  const file = path.join(dir, '.aioson', 'squads', '.playbook', 'generation-playbook.json');
  const onDisk = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.equal(onDisk.entries.length, 1);
});

test('capturing the same rule+lesson dedups and bumps the count', async () => {
  const dir = await makeTempDir();
  const logger = collectLogger();
  const opts = { dir, rule: 'vivid prose', lesson: 'cite sources per item', json: true };

  await runSquadPlaybook({ args: ['capture'], options: opts, logger });
  const second = await runSquadPlaybook({ args: ['capture'], options: { ...opts, rule: 'Vivid   Prose' }, logger });

  assert.equal(second.captured.count, 2); // normalized key matches despite case/spacing
  const list = await runSquadPlaybook({ args: ['list'], options: { dir, json: true }, logger });
  assert.equal(list.entries.length, 1);
  assert.equal(list.entries[0].count, 2);
});

test('capture errors without rule/lesson', async () => {
  const dir = await makeTempDir();
  const logger = collectLogger();
  const r = await runSquadPlaybook({ args: ['capture'], options: { dir, rule: 'x' }, logger });
  assert.ok(!r.ok);
  assert.equal(r.error, 'missing_fields');
});

test('list on an empty/absent playbook returns no entries', async () => {
  const dir = await makeTempDir();
  const logger = collectLogger();
  const r = await runSquadPlaybook({ args: ['list'], options: { dir, json: true }, logger });
  assert.ok(r.ok);
  assert.deepEqual(r.entries, []);
});

test('unknown subcommand errors', async () => {
  const dir = await makeTempDir();
  const logger = collectLogger();
  const r = await runSquadPlaybook({ args: ['frobnicate'], options: { dir }, logger });
  assert.ok(!r.ok);
  assert.equal(r.error, 'unknown_subcommand');
});

test('playbook list treats a corrupt playbook file as empty (resilience)', async () => {
  const dir = await makeTempDir();
  const file = path.join(dir, '.aioson', 'squads', '.playbook', 'generation-playbook.json');
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, '{ corrupt json');
  const logger = collectLogger();
  const r = await runSquadPlaybook({ args: ['list'], options: { dir, json: true }, logger });
  assert.ok(r.ok);
  assert.deepEqual(r.entries, []);
});

test('playbook list omits non-active entries', async () => {
  const dir = await makeTempDir();
  const file = path.join(dir, '.aioson', 'squads', '.playbook', 'generation-playbook.json');
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify({ entries: [
    { _key: 'a => b', rule: 'a', lesson: 'b', count: 1, status: 'active' },
    { _key: 'c => d', rule: 'c', lesson: 'd', count: 1, status: 'archived' },
  ] }));
  const logger = collectLogger();
  const r = await runSquadPlaybook({ args: ['list'], options: { dir, json: true }, logger });
  assert.ok(r.ok);
  assert.equal(r.entries.length, 1);
  assert.equal(r.entries[0].rule, 'a');
});
