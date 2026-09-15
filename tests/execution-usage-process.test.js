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

test('current-call usage reports the observed window without stopping the owned process', async () => {
  const events = [
    { type: 'event_msg', payload: { type: 'token_count', info: { last_token_usage: { total_tokens: 1100 }, model_context_window: 2000 } } },
    { type: 'turn.completed', usage: { input_tokens: 1100, cached_input_tokens: 0, output_tokens: 10 } }
  ];
  const result = await childAdapter(events).execute({ mode: 'external', cwd: process.cwd(), captureUsage: true, timeout: 5000, context_window: { limit_tokens: 80000, source: 'catalog' } });
  assert.equal(result.ok, true);
  assert.deepEqual(result.context_window, { limit_tokens: 2000, source: 'harness' });
  assert.equal(result.usage.peak_context_tokens, 1100);
  assert.equal(result.usage.complete, true);
});

test('adapter records usage above the retired 80k ceiling and lets the child finish', async () => {
  const result = await childAdapter([
    { type: 'event_msg', payload: { type: 'token_count', info: { last_token_usage: { total_tokens: 120000 }, model_context_window: 200000 } } },
    { type: 'turn.completed', usage: { input_tokens: 120000, cached_input_tokens: 100000, output_tokens: 900 } }
  ]).execute({ mode: 'external', cwd: process.cwd(), captureUsage: true, timeout: 5000 });
  assert.equal(result.ok, true);
  assert.equal(result.usage.input_tokens, 120000);
  assert.deepEqual(result.context_window, { limit_tokens: 200000, source: 'harness' });
});
