'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createExecutionLoopGuard } = require('../src/agent-execution/execution-loop-guard');

function active(tool, parameters) {
  return { event: 'step_update', step_update: { state: 'ACTIVE', step_type: 'tool', tool_name: tool, tool_info: { parameters } } };
}

test('Antigravity repeated read guard trips on the fourth identical request', () => {
  const loops = [];
  const guard = createExecutionLoopGuard('antigravity', { onLoop: detail => loops.push(detail) });
  for (let index = 0; index < 3; index++) assert.equal(guard.observe(active('view_file', { AbsolutePath: 'C:\\repo\\large.ts' })), null);
  assert.equal(guard.observe(active('view_file', { AbsolutePath: 'C:\\repo\\large.ts' })), 'unproductive_loop');
  assert.equal(guard.tripped, true);
  assert.equal(loops[0].repeats, 4);
  assert.equal(loops[0].kind, 'repeated_read');
});

test('a progress action resets exact and cumulative read streaks', () => {
  const guard = createExecutionLoopGuard('antigravity');
  for (let index = 0; index < 3; index++) guard.observe(active('grep_search', { Query: 'one', SearchPath: 'src' }));
  guard.observe(active('grep_search', { Query: 'two', SearchPath: 'src' }));
  assert.equal(guard.observe(active('replace_file_content', { TargetFile: 'src/a.js' })), null);
  assert.equal(guard.repeats, 1, 'the progress action begins its own exact-action streak');
  assert.equal(guard.readsSinceProgress, 0);
  for (let index = 0; index < 3; index++) assert.equal(guard.observe(active('grep_search', { Query: 'one', SearchPath: 'src' })), null);
  assert.equal(createExecutionLoopGuard('codex').observe(active('view_file', { AbsolutePath: 'a' })), null);
});

test('four identical commands without an intervening edit are an execution loop too', () => {
  const guard = createExecutionLoopGuard('antigravity');
  const command = active('run_command', { CommandLine: 'npm run typecheck' });
  assert.equal(guard.observe(command), null);
  assert.equal(guard.observe(command), null);
  assert.equal(guard.observe(command), null);
  assert.equal(guard.observe(command), 'unproductive_loop');
});

test('Antigravity broad read-only churn stops before a long unit timeout', () => {
  const loops = [];
  const guard = createExecutionLoopGuard('antigravity', { threshold: 99, readThreshold: 6, onLoop: detail => loops.push(detail) });
  for (let index = 0; index < 5; index++) assert.equal(guard.observe(active('view_file', { AbsolutePath: `C:\\repo\\${index}.ts` })), null);
  assert.equal(guard.observe(active('grep_search', { Query: 'last', SearchPath: 'src' })), 'unproductive_loop');
  assert.equal(loops[0].kind, 'read_only_churn');
  assert.equal(loops[0].read_actions, 6);
});
