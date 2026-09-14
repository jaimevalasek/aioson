'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createAdapter } = require('../src/agent-execution/adapters/base');

function childAdapter(events, linger = false) {
  const script = `process.stdout.write(${JSON.stringify(events.map(event => JSON.stringify(event)).join('\n'))});${linger ? 'setInterval(()=>{},1000);' : ''}`;
  const adapter = createAdapter('codex', () => ['-e', script]);
  adapter.probe = () => ({ external_process: true, executable: process.execPath });
  return adapter;
}

test('adapter drains final JSON without newline before settling a real child process', async () => {
  const result = await childAdapter([{ type: 'turn.completed', usage: { input_tokens: 999, cached_input_tokens: 900, output_tokens: 11 } }]).execute({ mode: 'external', cwd: process.cwd(), captureUsage: true, timeout: 5000 });
  assert.equal(result.ok, true);
  assert.equal(result.usage.input_tokens, 999);
  assert.equal(result.usage.output_tokens, 11);
});

test('current-call usage narrows an unknown window and stops only the owned process', async () => {
  const events = [
    { type: 'event_msg', payload: { type: 'token_count', info: { last_token_usage: { total_tokens: 1100 }, model_context_window: 2000 } } },
    { type: 'turn.completed', usage: { input_tokens: 1100, cached_input_tokens: 0, output_tokens: 10 } }
  ];
  // Terminate every JSON line so the live guard can act before process close.
  const adapter = childAdapter(events, true);
  const build = adapter.build.bind(adapter);
  adapter.build = input => { const result = build(input); result.args[1] = result.args[1].replace('setInterval', 'process.stdout.write("\\n");setInterval'); return result; };
  const result = await adapter.execute({ mode: 'external', cwd: process.cwd(), captureUsage: true, timeout: 5000, context_budget: { max_tokens: 80000, max_fraction: 0.5 } });
  assert.equal(result.reason, 'context_budget_exceeded');
  assert.equal(result.context_budget.max_tokens, 1000);
  assert.equal(result.usage.complete, false);
});

test('without an operational context budget the adapter records usage above 80k and lets the child finish', async () => {
  const result = await childAdapter([
    { type: 'event_msg', payload: { type: 'token_count', info: { last_token_usage: { total_tokens: 120000 }, model_context_window: 200000 } } },
    { type: 'turn.completed', usage: { input_tokens: 120000, cached_input_tokens: 100000, output_tokens: 900 } }
  ]).execute({ mode: 'external', cwd: process.cwd(), captureUsage: true, context_budget: null, timeout: 5000 });
  assert.equal(result.ok, true);
  assert.equal(result.usage.input_tokens, 120000);
  assert.equal(result.context_budget, undefined);
});
