'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { resolvePromptTool } = require('../src/prompt-tool');

test('resolvePromptTool accepts supported tools', () => {
  assert.equal(resolvePromptTool('codex'), 'codex');
  assert.equal(resolvePromptTool('claude'), 'claude');
  assert.equal(resolvePromptTool('opencode'), 'opencode');
  assert.equal(resolvePromptTool('  CoDeX  '), 'codex');
});

test('resolvePromptTool falls back to codex for invalid values', () => {
  assert.equal(resolvePromptTool(undefined), 'codex');
  assert.equal(resolvePromptTool(null), 'codex');
  assert.equal(resolvePromptTool(''), 'codex');
  assert.equal(resolvePromptTool('unknown-tool'), 'codex');
});
