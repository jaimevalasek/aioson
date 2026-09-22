'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { applyProjectEnv, mergeProjectEnv, parseDotEnv, readProjectDotEnv } = require('../src/lib/project-env');

test('parseDotEnv handles quotes and comments', () => {
  const parsed = parseDotEnv(`
# comment
CURSOR_API_KEY="cursor_abc"
OTHER=ignored
export FOO='bar'
`);
  assert.equal(parsed.CURSOR_API_KEY, 'cursor_abc');
  assert.equal(parsed.FOO, 'bar');
  assert.equal(parsed.OTHER, 'ignored');
});

test('mergeProjectEnv fills missing keys from project .env', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-env-'));
  fs.writeFileSync(path.join(dir, '.env'), 'CURSOR_API_KEY=cursor_from_dotenv\n', 'utf8');
  const merged = mergeProjectEnv(dir, { PATH: '/bin' });
  assert.equal(merged.CURSOR_API_KEY, 'cursor_from_dotenv');
  assert.equal(merged.PATH, '/bin');
});

test('mergeProjectEnv keeps OS env over .env', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-env-'));
  fs.writeFileSync(path.join(dir, '.env'), 'CURSOR_API_KEY=cursor_from_dotenv\n', 'utf8');
  const merged = mergeProjectEnv(dir, { CURSOR_API_KEY: 'cursor_from_os' });
  assert.equal(merged.CURSOR_API_KEY, 'cursor_from_os');
});

test('applyProjectEnv hydrates process.env when unset', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-env-'));
  fs.writeFileSync(path.join(dir, '.env'), 'CURSOR_API_KEY=cursor_apply_test\n', 'utf8');
  const previous = process.env.CURSOR_API_KEY;
  delete process.env.CURSOR_API_KEY;
  try {
    applyProjectEnv(dir);
    assert.equal(process.env.CURSOR_API_KEY, 'cursor_apply_test');
    assert.equal(readProjectDotEnv(dir).present, true);
  } finally {
    if (previous === undefined) delete process.env.CURSOR_API_KEY;
    else process.env.CURSOR_API_KEY = previous;
  }
});
