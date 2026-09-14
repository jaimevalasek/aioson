'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const registry = require('../src/lib/tool-capabilities');
const { HOSTS, effortsForHost } = require('../src/agent-execution/schema');
const input = {
  mode: 'external', cwd: process.cwd(), model: 'gemini-3.8-flash-medium',
  reasoning_effort: 'medium', sandbox_mode: 'workspace-write',
  prompt_text: 'Unicode ação; $(do-not-execute)\n'.repeat(3000), timeout: 3600000
};

test('Antigravity is an execution host backed by agy, preserving its interactive registration', () => {
  assert.ok(registry.listExecutionHosts().includes('antigravity'));
  assert.equal(registry.getExecutionCapabilities('antigravity').binary, 'agy');
  assert.ok(HOSTS.includes('antigravity'));
  assert.deepEqual(effortsForHost('antigravity'), ['low', 'medium', 'high']);
  assert.equal(registry.hostForBinary('agy'), 'agy');
});

test('execution roles accept the requested mixed-host configuration', () => {
  const { validateExecutionRoles } = require('../src/lib/execution-roles');
  const result = validateExecutionRoles({
    version: 1, enabled: false,
    roles: {
      backend_dev: { host: 'antigravity', model: input.model, reasoning_effort: 'medium' },
      frontend_dev: { host: 'codex', model: 'gpt-5.6-sol', reasoning_effort: 'medium' },
      qa: { host: 'codex', model: 'gpt-6-astra', reasoning_effort: null }
    },
    parallel: { max_concurrent_lanes: 2 }, on_unavailable: 'ask'
  });
  assert.equal(result.ok, true, JSON.stringify(result));
});

test('Antigravity passes large prompts through stdin and isolates model, effort and workspace arguments', () => {
  const adapter = require('../src/agent-execution/adapters/antigravity');
  const built = adapter.build({ ...input, writable_roots: ['C:/path with spaces', '/another/root'] });
  assert.equal(built.ok, true);
  assert.equal(built.executable, 'agy');
  assert.equal(typeof built.stdin, 'string');
  assert.equal(JSON.parse(built.stdin).event, 'user');
  assert.equal(JSON.parse(built.stdin).message.content, input.prompt_text);
  assert.equal(built.options.shell, false);
  assert.deepEqual(built.args, [
    '--input-format', 'stream-json', '--output-format', 'stream-json', '--print-timeout', '3600000ms',
    '--mode', 'accept-edits', '--dangerously-skip-permissions', '--model', input.model, '--effort', 'medium',
    '--add-dir', 'C:/path with spaces', '--add-dir', '/another/root'
  ]);
  assert.ok(!built.args.includes(input.prompt_text));
});

test('Antigravity preserves configured-default and unlimited timeout without claiming read-only or native subagents', () => {
  const adapter = require('../src/agent-execution/adapters/antigravity');
  const built = adapter.build({ ...input, model: 'configured-default', reasoning_effort: null, timeout: 0 });
  assert.ok(!built.args.includes('--model'));
  assert.ok(!built.args.includes('--effort'));
  assert.equal(built.args[built.args.indexOf('--print-timeout') + 1], '0ms');
  assert.equal(adapter.build({ ...input, sandbox_mode: 'read-only' }).reason, 'sandbox_mode_unsupported');
  assert.equal(adapter.build({ ...input, mode: 'subagent' }).reason, 'unsupported_capability');
});

test('Antigravity stops a repeated structured read so the dispatcher can use fallback', async () => {
  const adapter = require('../src/agent-execution/adapters/antigravity');
  const { createExecutionLoopGuard } = require('../src/agent-execution/execution-loop-guard');
  const child = Object.create(adapter);
  const script = `const event={event:'step_update',step_update:{state:'ACTIVE',step_type:'tool',tool_name:'view_file',tool_info:{parameters:{AbsolutePath:'C:/repo/large.ts'}}}};for(let i=0;i<6;i++)process.stdout.write(JSON.stringify(event)+'\\n');setTimeout(()=>{},5000);`;
  child.build = value => ({ ...adapter.build(value), executable: process.execPath, args: ['-e', script], stdin: false });
  const guard = createExecutionLoopGuard('antigravity');
  const result = await child.execute({ ...input, captureUsage: true, timeout: 5000, onStructuredEvent: event => guard.observe(event) });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'unproductive_loop');
  assert.equal(guard.tripped, true);
});
