'use strict';

// The global --help prints HELP_KEYS (src/cli.js). Commands kept a usage line
// (`aioson <command> --help` printed it) yet were missing from the global list
// — commit:prepare, dossier:init/show, live:list, memory:trim, runtime:log,
// squad:plan, plan — and op:capture/op:show, which the gateway names beside
// op:list, had no line at all. A dispatchable command whose usage key exists
// is listed; every listed key exists.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const TEST_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-cli-help-home-'));
process.env.HOME = TEST_HOME;
process.env.USERPROFILE = TEST_HOME;

const en = require('../src/i18n/messages/en');

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'src', 'cli.js'), 'utf8');
const strings = (text) => [...text.matchAll(/'([^']+)'/g)].map((match) => match[1]);
const HELP_KEYS = strings(/const HELP_KEYS = \[([\s\S]*?)\];/.exec(SOURCE)[1]);
const QUALITY_KEYS = strings(/function printQualityHelp[\s\S]*?for \(const key of \[([^\]]*)\]\)/.exec(SOURCE)[1]);
const LISTED = new Set([...HELP_KEYS, ...QUALITY_KEYS]);
const hasText = (key) => typeof en.cli[key.replace(/^cli\./, '')] === 'string';

test('every dispatchable command with a usage line is in the global --help', () => {
  const commands = new Set([...SOURCE.matchAll(/command\s*===\s*'([^']+)'/g)].map((match) => match[1]));
  const unlisted = [...commands]
    .map((command) => [command, `cli.help_${command.replace(/[:-]/g, '_')}`])
    .filter(([, key]) => hasText(key) && !LISTED.has(key))
    .map(([command, key]) => `${command} → ${key}`);
  assert.deepEqual(unlisted, []);
});

test('every global --help key has its English text', () => {
  assert.ok(HELP_KEYS.length > 200, `parsed ${HELP_KEYS.length} keys`);
  assert.equal(new Set(HELP_KEYS).size, HELP_KEYS.length, 'no key is listed twice');
  assert.deepEqual([...LISTED].filter((key) => !key.startsWith('cli.')), [], 'the translator needs the cli. namespace');
  assert.deepEqual([...LISTED].filter((key) => !hasText(key)), []);
});

test('op:capture and op:show sit beside op:list', () => {
  const at = HELP_KEYS.indexOf('cli.help_op_list');
  assert.deepEqual(HELP_KEYS.slice(at, at + 3), ['cli.help_op_list', 'cli.help_op_show', 'cli.help_op_capture']);
});
