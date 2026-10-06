'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const corpus = require('../.aioson/context/squad-evaluation-corpus.json');
const { baselineCommit, buildPrompt, hasRevision, parseTrace, responseSchema, variants } = require('../scripts/testing/squad-optimization-benchmark');
const { aggregate } = require('../scripts/testing/squad-optimization-score');

// The baseline variant reads the kernel frozen at a historical commit, which a
// shallow checkout (CI) does not have. The current variants never need history.
const currentVariants = variants.filter(variant => variant !== 'existing-configuration');

test('the Squad benchmark keeps evaluation criteria out of current candidate prompts', () => {
  assert.equal(corpus.cases.length, 18);
  assert.equal(new Set(corpus.cases.map(sample => sample.id)).size, 18);
  for (const sample of corpus.cases) {
    const prompts = currentVariants.map(variant => buildPrompt(sample, variant));
    for (const prompt of prompts) {
      assert.ok(prompt.includes(sample.input));
      assert.ok(!prompt.includes(sample.criteria[0].text), `${sample.id} leaked its criterion`);
    }
    assert.notEqual(prompts[0], prompts[1]);
  }
  assert.deepEqual(responseSchema.required, ['answer', 'evidence', 'files']);
});

test('the frozen baseline prompt keeps criteria out and differs from the current ones', (t) => {
  if (!hasRevision(baselineCommit)) {
    t.skip(`baseline commit ${baselineCommit} is not in this checkout (shallow clone)`);
    return;
  }
  for (const sample of corpus.cases) {
    const baseline = buildPrompt(sample, 'existing-configuration');
    assert.ok(baseline.includes(sample.input));
    assert.ok(!baseline.includes(sample.criteria[0].text), `${sample.id} leaked its criterion`);
    assert.notEqual(baseline, buildPrompt(sample, currentVariants[0]));
  }
});

test('JSONL telemetry reads terminal usage and excludes candidate self scores', () => {
  const trace = parseTrace([
    JSON.stringify({ type: 'thread.started', thread_id: 'thread-1' }),
    JSON.stringify({ type: 'item.completed', item: { type: 'command_execution' } }),
    JSON.stringify({ type: 'item.completed', item: { type: 'mcp_tool_call' } }),
    JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'done' } }),
    JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 31, cached_input_tokens: 3, output_tokens: 7 } })
  ].join('\n'));
  assert.equal(trace.thread_id, 'thread-1');
  assert.equal(trace.command_executions, 1);
  assert.equal(trace.mcp_tool_calls, 1);
  assert.equal(trace.usage.output_tokens, 7);
  assert.equal(trace.terminal, 'turn.completed');
  assert.deepEqual(parseTrace('{broken').errors, ['unparseable']);
});

test('report totals accepted cases separately from partial criteria and measured tokens', () => {
  const rows = [
    { variant: variants[0], domain: 'content', accepted: true, criteria: [{ passed: true }, { passed: true }, { passed: true }], elapsed_ms: 1000, usage: { input_tokens: 20, output_tokens: 4, cached_input_tokens: 1 }, tool_commands: 1 },
    { variant: variants[0], domain: 'content', accepted: false, criteria: [{ passed: true }, { passed: false }, { passed: true }], elapsed_ms: 2000, usage: { input_tokens: 30, output_tokens: 6, cached_input_tokens: 2 }, tool_commands: 0 }
  ];
  const a = aggregate(rows, variants[0], 'content');
  assert.equal(a.accepted, 1);
  assert.equal(a.criteria_passed, 5);
  assert.equal(a.criteria_total, 6);
  assert.equal(a.input_tokens, 50);
  assert.equal(a.output_tokens, 10);
  assert.equal(a.median_elapsed_ms, 1500);
});
