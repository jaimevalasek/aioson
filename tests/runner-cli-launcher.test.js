'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildArgs, detectCLI, launchCLI } = require('../src/runner/cli-launcher');

describe('runner/cli-launcher.js — buildArgs', () => {
  it('builds args for claude with defaults', () => {
    const args = buildArgs('claude', 'hello world');
    assert.deepEqual(args, [
      '-p', 'hello world',
      '--output-format', 'stream-json',
      '--dangerously-skip-permissions'
    ]);
  });

  it('builds args for claude with allowedTools and outputFormat', () => {
    const args = buildArgs('claude', 'prompt', { allowedTools: 'bash,file', outputFormat: 'json' });
    assert.deepEqual(args, [
      '-p', 'prompt',
      '--output-format', 'json',
      '--dangerously-skip-permissions',
      '--allowedTools', 'bash,file'
    ]);
  });

  it('builds args for codex', () => {
    const args = buildArgs('codex', 'do it');
    assert.deepEqual(args, ['-p', 'do it', '--quiet', '--no-interactive']);
  });

  it('builds args for unknown cli', () => {
    const args = buildArgs('opencode', 'test');
    assert.deepEqual(args, ['-p', 'test']);
  });
});

describe('runner/cli-launcher.js — detectCLI', () => {
  it('returns env var AIOSON_RUNNER_TOOL when set', async () => {
    const original = process.env.AIOSON_RUNNER_TOOL;
    process.env.AIOSON_RUNNER_TOOL = 'my-tool';
    try {
      const result = await detectCLI();
      assert.equal(result, 'my-tool');
    } finally {
      if (original === undefined) {
        delete process.env.AIOSON_RUNNER_TOOL;
      } else {
        process.env.AIOSON_RUNNER_TOOL = original;
      }
    }
  });
});

describe('runner/cli-launcher.js — launchCLI', () => {
  it('returns ok=false and exitCode=-1 for nonexistent tool', async () => {
    const result = await launchCLI('.', 'test', { tool: 'nonexistent-cli-xyz', timeout: 500 });
    assert.equal(result.ok, false);
    assert.equal(result.exitCode, -1);
  });

  it('detects TASK_COMPLETE marker in stdout', async () => {
    // node -p evaluates JS and prints the result; we embed TASK_COMPLETE in the expression
    const result = await launchCLI('.', 'console.log(1); "TASK_COMPLETE"', {
      tool: 'node',
      timeout: 10000
    });
    assert.equal(result.completionMarker, true);
    assert.ok(result.output.includes('TASK_COMPLETE'));
  });
});
