'use strict';

// Regression: the memory:archive/restore/search commands called their i18n keys
// WITHOUT the `cli.` namespace prefix, so t() missed and logged the raw key
// (e.g. "memory_archive.id_required") in every locale. These tests invoke each
// command on an early i18n path with a real pt-BR translator and assert the
// localized string is shown and no raw key leaks.

const test = require('node:test');
const assert = require('node:assert/strict');

const { createTranslator } = require('../src/i18n');
const { runMemoryArchive } = require('../src/commands/memory-archive');
const { runMemoryRestore } = require('../src/commands/memory-restore');
const { runMemorySearch } = require('../src/commands/memory-search');

function makeLogger() {
  const lines = [];
  return { lines, log(l = '') { lines.push(String(l)); }, error(l = '') { lines.push(String(l)); } };
}

const { t } = createTranslator('pt-BR');

test('memory:archive resolves localized i18n (no raw key leak)', async () => {
  const lg = makeLogger();
  await runMemoryArchive({ args: ['.'], options: {}, logger: lg, t }); // missing --id
  const out = lg.lines.join('\n');
  assert.ok(out.includes(t('cli.memory_archive.id_required')), 'localized id_required shown');
  assert.ok(!out.includes('memory_archive.id_required'), 'raw i18n key must not leak');
});

test('memory:restore resolves localized i18n (no raw key leak)', async () => {
  const lg = makeLogger();
  await runMemoryRestore({ args: ['.'], options: {}, logger: lg, t }); // missing --id
  const out = lg.lines.join('\n');
  assert.ok(out.includes(t('cli.memory_restore.id_required')), 'localized id_required shown');
  assert.ok(!out.includes('memory_restore.id_required'), 'raw i18n key must not leak');
});

test('memory:search resolves localized i18n (no raw key leak)', async () => {
  const lg = makeLogger();
  await runMemorySearch({ args: [''], options: {}, logger: lg, t }); // empty query
  const out = lg.lines.join('\n');
  assert.ok(out.includes(t('cli.memory_search.query_empty')), 'localized query_empty shown');
  assert.ok(!out.includes('memory_search.query_empty'), 'raw i18n key must not leak');
});

test('the cli.-prefixed keys actually exist for all three commands (pt-BR)', () => {
  for (const key of ['cli.memory_archive.id_required', 'cli.memory_restore.id_required', 'cli.memory_search.query_empty']) {
    assert.notEqual(t(key), key, `${key} must resolve, not echo the key`);
  }
});
