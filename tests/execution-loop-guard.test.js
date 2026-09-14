'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createExecutionLoopGuard } = require('../src/agent-execution/execution-loop-guard');

function active(tool, parameters) {
  return { event: 'step_update', step_update: { state: 'ACTIVE', step_type: 'tool', tool_name: tool, tool_info: { parameters } } };
}

test('Antigravity repeated read guard trips on the sixth identical request', () => {
  const loops = [];
  const guard = createExecutionLoopGuard('antigravity', { onLoop: detail => loops.push(detail) });
  for (let index = 0; index < 5; index++) assert.equal(guard.observe(active('view_file', { AbsolutePath: 'C:\\repo\\large.ts' })), null);
  assert.equal(guard.observe(active('view_file', { AbsolutePath: 'C:\\repo\\large.ts' })), 'unproductive_loop');
  assert.equal(guard.tripped, true);
  assert.equal(loops[0].repeats, 6);
});

test('different reads reset the guard and mutating or unknown tools are ignored', () => {
  const guard = createExecutionLoopGuard('antigravity');
  for (let index = 0; index < 5; index++) guard.observe(active('grep_search', { Query: 'one', SearchPath: 'src' }));
  guard.observe(active('grep_search', { Query: 'two', SearchPath: 'src' }));
  for (let index = 0; index < 5; index++) assert.equal(guard.observe(active('grep_search', { Query: 'one', SearchPath: 'src' })), null);
  assert.equal(guard.observe(active('replace_file_content', { TargetFile: 'src/a.js' })), null);
  assert.equal(createExecutionLoopGuard('codex').observe(active('view_file', { AbsolutePath: 'a' })), null);
});
