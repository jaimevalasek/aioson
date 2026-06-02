'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { buildArgs, detectCLI } = require('../src/runner/cli-launcher');
const { runRunnerRun } = require('../src/commands/runner-run');

async function makeTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-runner-run-'));
}

function makeLogger() {
  const lines = [];
  const errors = [];
  return {
    log: (msg = '') => lines.push(String(msg)),
    error: (msg = '') => errors.push(String(msg)),
    lines,
    errors
  };
}

// ── buildArgs ──────────────────────────────────────────────────────────────

test('buildArgs: claude includes -p and output-format', () => {
  const args = buildArgs('claude', 'hello world');
  assert.ok(args.includes('-p'));
  assert.ok(args.includes('hello world'));
  assert.ok(args.includes('--output-format'));
  assert.ok(args.includes('stream-json'));
  assert.ok(args.includes('--dangerously-skip-permissions'));
});

test('buildArgs: claude with allowedTools', () => {
  const args = buildArgs('claude', 'task', { allowedTools: 'Read,Write' });
  assert.ok(args.includes('--allowedTools'));
  assert.ok(args.includes('Read,Write'));
});

test('buildArgs: codex includes --quiet --no-interactive', () => {
  const args = buildArgs('codex', 'task');
  assert.ok(args.includes('--quiet'));
  assert.ok(args.includes('--no-interactive'));
});

test('buildArgs: unknown cli falls back to -p', () => {
  const args = buildArgs('opencode', 'task');
  assert.ok(args.includes('-p'));
  assert.ok(args.includes('task'));
});

// ── runner:run --dry-run ───────────────────────────────────────────────────

test('runner:run: --task required', async () => {
  const tmpDir = await makeTempDir();
  const logger = makeLogger();
  const result = await runRunnerRun({ args: [tmpDir], options: {}, logger });
  assert.equal(result.ok, false);
  assert.ok(logger.errors.some((e) => e.includes('--task')));
});

test('runner:run: dry-run shows command without executing', async () => {
  const tmpDir = await makeTempDir();
  const logger = makeLogger();
  // Override AIOSON_RUNNER_TOOL so detectCLI doesn't need real CLIs
  process.env.AIOSON_RUNNER_TOOL = 'claude';
  const result = await runRunnerRun({
    args: [tmpDir],
    options: { task: 'list the files', agent: 'dev', dryRun: true },
    logger
  });
  delete process.env.AIOSON_RUNNER_TOOL;
  assert.equal(result.ok, true);
  assert.equal(result.dryRun, true);
  assert.ok(logger.lines.some((l) => l.includes('[dry-run]')));
});

test('runner:run: dry-run with cascade shows cascade info', async () => {
  const tmpDir = await makeTempDir();
  const logger = makeLogger();
  process.env.AIOSON_RUNNER_TOOL = 'claude';
  const result = await runRunnerRun({
    args: [tmpDir],
    options: { task: 'do something', agent: 'dev', dryRun: true, cascade: 'haiku,sonnet' },
    logger
  });
  delete process.env.AIOSON_RUNNER_TOOL;
  assert.equal(result.ok, true);
  assert.ok(logger.lines.some((l) => l.includes('haiku,sonnet')));
});
