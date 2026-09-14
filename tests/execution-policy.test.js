'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizePolicy, contextBudget } = require('../src/agent-execution/execution-policy');

test('quality budget caps large windows and respects smaller model windows', () => {
  const { policy } = normalizePolicy();
  assert.equal(contextBudget(policy, 'codex', 'large', 1000000).max_tokens, 80000);
  assert.equal(contextBudget(policy, 'codex', 'small', 32000).max_tokens, 16000);
  assert.equal(contextBudget(policy, 'codex', 'medium', 200000).max_tokens, 80000);
  assert.equal(contextBudget(policy, 'custom', 'unknown').context_window_tokens, null);
  assert.equal(normalizePolicy({ context: { max_fraction: 0.8 } }).ok, false);
  assert.equal(normalizePolicy({ context: { max_tokens: NaN } }).ok, false);
});

test('exact model budgets cannot enlarge the project ceiling or bypass schema validation', () => {
  const entry = { host: 'codex', model: 'exact', context_window_tokens: 200000, max_tokens: 30000 };
  const { policy } = normalizePolicy({ context: { models: [entry] } });
  assert.equal(contextBudget(policy, 'codex', 'exact').max_tokens, 30000);
  assert.equal(contextBudget(policy, 'codex', 'similar').max_tokens, 80000);
  assert.equal(contextBudget(policy, 'codex', 'exact', 16000).max_tokens, 8000);
  assert.equal(normalizePolicy({ context: { models: [entry, entry] } }).ok, false);
  assert.equal(normalizePolicy({ qa: { max_rework_rounds: 100 } }).ok, false);
  assert.equal(normalizePolicy({ context: null }).ok, false);
});
