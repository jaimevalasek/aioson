'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizePolicy, contextWindow } = require('../src/agent-execution/execution-policy');

test('context windows are reported without imposing a quality ceiling', () => {
  const { policy } = normalizePolicy();
  assert.deepEqual(contextWindow(policy, 'codex', 'large', 1000000), { limit_tokens: 1000000, source: 'harness_or_catalog' });
  assert.equal(contextWindow(policy, 'custom', 'unknown').limit_tokens, null);
  const legacy = normalizePolicy({ context: { max_fraction: 0.8, max_tokens: 120000, max_continuations: 3 } });
  assert.equal(legacy.ok, true);
  assert.deepEqual(legacy.policy.context, { models: [] });
});

test('exact model windows provide a reporting fallback and use the smaller observed window', () => {
  const entry = { host: 'codex', model: 'exact', context_window_tokens: 200000, max_tokens: 30000 };
  const { policy } = normalizePolicy({ context: { models: [entry] } });
  assert.deepEqual(policy.context.models, [{ host: 'codex', model: 'exact', context_window_tokens: 200000 }]);
  assert.deepEqual(contextWindow(policy, 'codex', 'exact'), { limit_tokens: 200000, source: 'project_configuration' });
  assert.equal(contextWindow(policy, 'codex', 'similar').limit_tokens, null);
  assert.deepEqual(contextWindow(policy, 'codex', 'exact', 16000), { limit_tokens: 16000, source: 'project_configuration+harness' });
  assert.equal(normalizePolicy({ context: { models: [entry, entry] } }).ok, false);
  assert.equal(normalizePolicy({ qa: { max_rework_rounds: 100 } }).ok, false);
  assert.equal(normalizePolicy({ context: null }).ok, false);
});
