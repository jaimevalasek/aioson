'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { runMemoryArchive } = require('../src/commands/memory-archive');
const { runMemoryRestore } = require('../src/commands/memory-restore');
const { validateTargetSlug } = require('../src/learning-loop-archive');

const quietLogger = { log() {}, error() {} };

test('memory target IDs reject traversal and platform path separators', () => {
  for (const kind of ['rule', 'learning', 'brain']) {
    for (const slug of ['../secret', '../../secret', 'safe/../secret', 'safe\\..\\secret']) {
      assert.equal(validateTargetSlug(kind, slug).ok, false, `${kind}:${slug} should be rejected`);
    }
  }

  assert.equal(validateTargetSlug('rule', 'safe-rule').ok, true);
  assert.equal(validateTargetSlug('learning', 'pl-safe_learning').ok, true);
  assert.equal(validateTargetSlug('brain', 'dev/patterns').ok, true);
});

test('memory:archive rejects traversal before touching an outside file', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-memory-archive-security-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const outsideFile = path.join(dir, 'victim.md');
  await fs.writeFile(outsideFile, 'must remain\n', 'utf8');

  const result = await runMemoryArchive({
    args: [dir],
    options: { id: 'rule:../../victim', reason: 'security test', json: true },
    logger: quietLogger
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'invalid_id');
  assert.equal(await fs.readFile(outsideFile, 'utf8'), 'must remain\n');
});

test('memory:restore rejects traversal before initializing runtime storage', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-memory-restore-security-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));

  const result = await runMemoryRestore({
    args: [dir],
    options: { id: 'brain:../../victim', json: true },
    logger: quietLogger
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'invalid_id');
  await assert.rejects(fs.access(path.join(dir, '.aioson', 'runtime')));
});
