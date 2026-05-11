'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { render, normalizeLevel, LEVELS } = require('../src/notify-renderer');
const { runNotify } = require('../src/commands/notify');

function makeLogger() {
  const lines = [];
  return { lines, log(l = '') { lines.push(String(l)); }, error(l = '') { lines.push(String(l)); } };
}

test('render produces ℹ prefix for info level with exitCode 0', () => {
  const r = render({ level: 'info', topic: 'memory', message: 'updating bootstrap' });
  assert.equal(r.level, 'info');
  assert.equal(r.exitCode, 0);
  assert.match(r.line, /^ℹ \[memory\] updating bootstrap$/);
});

test('render produces ⚠ prefix for warn level with exitCode 0', () => {
  const r = render({ level: 'warn', topic: 'bootstrap', message: 'stale 35 days' });
  assert.equal(r.level, 'warn');
  assert.equal(r.exitCode, 0);
  assert.match(r.line, /^⚠ \[bootstrap\] stale 35 days$/);
});

test('render produces ⛔ prefix for block level with exitCode 2', () => {
  const r = render({ level: 'block', topic: 'git', message: 'push manual required' });
  assert.equal(r.level, 'block');
  assert.equal(r.exitCode, 2);
  assert.match(r.line, /^⛔ \[git\] push manual required$/);
});

test('render falls back to info when level is unknown', () => {
  const r = render({ level: 'whoops', message: 'x' });
  assert.equal(r.level, 'info');
});

test('normalizeLevel is case-insensitive', () => {
  assert.equal(normalizeLevel('INFO'), 'info');
  assert.equal(normalizeLevel('Block'), 'block');
});

test('runNotify rejects empty message', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-notify-'));
  const logger = makeLogger();
  const result = await runNotify({
    args: [dir],
    options: { level: 'info', topic: 'x', message: '' },
    logger
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'missing_message');
});

test('runNotify prints rendered line and sets process.exitCode on block', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-notify-'));
  const previousExitCode = process.exitCode;
  process.exitCode = 0;
  const logger = makeLogger();
  const result = await runNotify({
    args: [dir],
    options: { level: 'block', topic: 'git', message: 'manual push' },
    logger
  });
  try {
    assert.equal(result.ok, false);
    assert.equal(result.exitCode, 2);
    assert.equal(process.exitCode, 2);
    assert.ok(logger.lines.some((l) => /⛔ \[git\] manual push/.test(l)));
  } finally {
    process.exitCode = previousExitCode;
  }
});

test('LEVELS table is stable for known keys', () => {
  assert.equal(LEVELS.info.exitCode, 0);
  assert.equal(LEVELS.warn.exitCode, 0);
  assert.equal(LEVELS.block.exitCode, 2);
});
