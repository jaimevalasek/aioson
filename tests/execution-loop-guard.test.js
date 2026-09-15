'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createExecutionLoopGuard } = require('../src/agent-execution/execution-loop-guard');

function active(tool, parameters) {
  return { event: 'step_update', step_update: { state: 'ACTIVE', step_type: 'tool', tool_name: tool, tool_info: { parameters } } };
}

function opencode(tool, input, status = 'completed') {
  return { type: 'tool_use', part: { type: 'tool', tool, state: { status, input } } };
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

test('OpenCode broad read-only churn uses the same evidence guard and ignores streaming duplicates', () => {
  const loops = [];
  const guard = createExecutionLoopGuard('opencode', { threshold: 99, readThreshold: 4, onLoop: detail => loops.push(detail) });
  assert.equal(guard.observe(opencode('read', { filePath: 'src/a.ts' }, 'running')), null);
  assert.equal(guard.readsSinceProgress, 0, 'only a completed tool call counts');
  assert.equal(guard.observe(opencode('read', { filePath: 'src/a.ts' })), null);
  assert.equal(guard.observe(opencode('grep', { pattern: 'one', path: 'src' })), null);
  assert.equal(guard.observe(opencode('glob', { pattern: '**/*.ts' })), null);
  assert.equal(guard.observe(opencode('grep', { pattern: 'two', path: 'src' })), 'unproductive_loop');
  assert.equal(loops[0].host, 'opencode');
  assert.equal(loops[0].kind, 'read_only_churn');
});

test('an OpenCode edit resets its read-only investigation streak', () => {
  const guard = createExecutionLoopGuard('opencode', { threshold: 99, readThreshold: 3 });
  guard.observe(opencode('read', { filePath: 'src/a.ts' }));
  guard.observe(opencode('grep', { pattern: 'one', path: 'src' }));
  assert.equal(guard.observe(opencode('edit', { filePath: 'src/a.ts', oldString: 'a', newString: 'b' })), null);
  assert.equal(guard.readsSinceProgress, 0);
  assert.equal(guard.observe(opencode('read', { filePath: 'src/b.ts' })), null);
});

test('OpenCode shell inspection counts as read-only churn', () => {
  const guard = createExecutionLoopGuard('opencode', { threshold: 99, readThreshold: 4 });
  assert.equal(guard.observe(opencode('bash', { command: 'rg -n "preview|stream" src/server | head -80' })), null);
  assert.equal(guard.observe(opencode('bash', { command: 'git diff -- src/server' })), null);
  assert.equal(guard.observe(opencode('read', { filePath: 'src/domain/timeline.ts' })), null);
  assert.equal(guard.observe(opencode('bash', { command: 'Get-Content src/server/routes/timeline.route.ts | Select-String preview' })), 'unproductive_loop');
});

test('a shell command that may write is progress, not read-only inspection', () => {
  const guard = createExecutionLoopGuard('opencode', { threshold: 99, readThreshold: 3 });
  guard.observe(opencode('read', { filePath: 'src/a.ts' }));
  guard.observe(opencode('bash', { command: 'rg -n one src | head -20' }));
  assert.equal(guard.observe(opencode('bash', { command: 'node scripts/fix.js' })), null);
  assert.equal(guard.readsSinceProgress, 0);
  assert.equal(guard.observe(opencode('bash', { command: 'sed -i s/old/new/ src/a.ts' })), null);
  assert.equal(guard.readsSinceProgress, 0);
});
