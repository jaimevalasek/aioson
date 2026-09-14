'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createUsageCollector, aggregateUsage } = require('../src/agent-execution/execution-usage');
const emit = (parser, event) => parser.push(JSON.stringify(event) + '\n');

test('Codex turn usage is not current context and duplicate completion is not double charged', () => {
  let contexts = 0;
  const parser = createUsageCollector('codex', { onContext: () => contexts++ });
  const event = { type: 'turn.completed', usage: { input_tokens: 400000, cached_input_tokens: 300000, output_tokens: 1000, reasoning_output_tokens: 100 } };
  const bytes = Buffer.from(JSON.stringify(event) + '\n');
  parser.push(bytes.subarray(0, 12)); parser.push(bytes.subarray(12)); emit(parser, event);
  const usage = parser.finish();
  assert.equal(usage.input_tokens, 400000);
  assert.equal(usage.uncached_input_tokens, 100000);
  assert.equal(usage.output_tokens, 1000);
  assert.equal(usage.peak_context_tokens, null);
  assert.equal(contexts, 0);
});

test('OpenCode replaces repeated steps, includes caches in context, and retains reported cost', () => {
  const contexts = [];
  const parser = createUsageCollector('opencode', { onContext: value => contexts.push(value.tokens) });
  const step = id => ({ type: 'step_finish', part: { id, tokens: { input: 50, output: 10, reasoning: 2, cache: { read: 100, write: 20 } }, cost: 0.03 } });
  emit(parser, step('a')); emit(parser, step('a')); emit(parser, step('b'));
  const usage = parser.finish();
  assert.equal(usage.input_tokens, 340);
  assert.equal(usage.output_tokens, 24, 'visible output and reasoning share the output tariff');
  assert.equal(usage.cache_read_tokens, 200);
  assert.equal(usage.peak_context_tokens, 170);
  assert.equal(usage.reported_cost_usd, 0.06);
  assert.deepEqual(contexts, [170, 170, 170]);
});

test('Antigravity final cumulative usage replaces step sums and keeps ambiguous cache semantics unknown', () => {
  const parser = createUsageCollector('antigravity');
  const usage = { input_tokens: 100, output_tokens: 12, thinking_tokens: 5, cache_read_tokens: 300 };
  emit(parser, { event: 'step_update', step_update: { state: 'DONE', step_index: 1, usage } });
  emit(parser, { event: 'result', result: { usage } });
  emit(parser, { event: 'result', result: { usage } });
  assert.equal(parser.finish().input_tokens, 100);
  assert.equal(parser.snapshot().uncached_input_tokens, null);
  assert.equal(parser.snapshot().peak_context_tokens, null);
});

test('truncated, missing and malformed usage are not silently treated as zero or complete', () => {
  const parser = createUsageCollector('codex', { maxLineBytes: 300 });
  parser.push('x'.repeat(500)); parser.push('\n');
  emit(parser, { type: 'turn.completed', usage: { input_tokens: 42, output_tokens: 5 } });
  assert.equal(parser.finish().complete, false);
  assert.equal(parser.snapshot().cache_read_tokens, null);
  assert.equal(createUsageCollector('unknown').finish(), null);
  assert.equal(aggregateUsage([parser.snapshot(), null]).complete, false);
});

test('Claude partial messages never count provisional output and a crashed result never erases prior spend', () => {
  let updates = 0;
  const parser = createUsageCollector('claude', { onUpdate: () => updates++ });
  const message = { type: 'assistant', message: { id: 'm1', usage: { input_tokens: 100, cache_read_input_tokens: 20, cache_creation_input_tokens: 0, output_tokens: 1 } } };
  emit(parser, message); emit(parser, message); emit(parser, { type: 'tool', text: 'ignored' });
  assert.equal(updates, 1);
  assert.equal(parser.snapshot().output_tokens, null);
  emit(parser, { type: 'result', subtype: 'error_during_execution', usage: { input_tokens: 0, output_tokens: 0 } });
  assert.equal(parser.finish().input_tokens, 120);
  assert.equal(parser.snapshot().complete, false);
  const complete = createUsageCollector('claude');
  emit(complete, message);
  emit(complete, { type: 'result', subtype: 'success', usage: { input_tokens: 100, cache_read_input_tokens: 20, cache_creation_input_tokens: 0, output_tokens: 50 } });
  assert.equal(complete.finish().output_tokens, 50);
  assert.equal(complete.snapshot().complete, true);
});
