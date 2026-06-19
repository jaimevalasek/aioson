'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildAntigravityHooks,
  buildClaudeHooks,
  isAiosonHookEntry,
  normalizeHookAgentName,
  runHooksInstall
} = require('../src/commands/hooks-install');

test('buildClaudeHooks wires a PreToolUse context:guard hook by default', () => {
  const hooks = buildClaudeHooks('dev');
  assert.ok(Array.isArray(hooks.PreToolUse), 'PreToolUse section is present');
  const entry = hooks.PreToolUse[0];
  assert.equal(entry.matcher, 'Write|Edit|MultiEdit|NotebookEdit');
  const cmd = entry.hooks[0].command;
  assert.match(cmd, /aioson context:guard/);
  assert.match(cmd, /--tool=claude/);
  assert.match(cmd, /--agent='dev'/);
  assert.match(cmd, /--json/);
  assert.match(cmd, /2>\/dev\/null \|\| true/); // advisory, never blocks the tool
});

test('buildClaudeHooks omits the guard hook when opted out', () => {
  const hooks = buildClaudeHooks('dev', false);
  assert.equal(hooks.PreToolUse, undefined);
  // Telemetry hooks remain regardless of the guard opt-out.
  assert.ok(hooks.PostToolUse, 'PostToolUse telemetry stays');
  assert.ok(hooks.Stop, 'Stop hook stays');
});

test('buildClaudeHooks bakes the requested agent into the guard command', () => {
  const hooks = buildClaudeHooks('qa');
  assert.match(hooks.PreToolUse[0].hooks[0].command, /--agent='qa'/);
});

test('normalizeHookAgentName accepts known agents, aliases, and kebab-case custom agents', () => {
  assert.equal(normalizeHookAgentName('@QA'), 'qa');
  assert.equal(normalizeHookAgentName('/dev'), 'dev');
  assert.equal(normalizeHookAgentName('@pair'), 'deyvin');
  assert.equal(normalizeHookAgentName('custom-agent-2'), 'custom-agent-2');
});

test('hook builders reject shell-control payloads in agent names', () => {
  const payloads = [
    'dev; echo AIOSON_PENTEST',
    'dev && echo AIOSON_PENTEST',
    'dev$(echo AIOSON_PENTEST)',
    'dev name',
    'dev\nname',
    'dev"name',
    "dev'name",
    '`dev`'
  ];

  for (const payload of payloads) {
    assert.throws(() => buildClaudeHooks(payload), /invalid agent name/);
    assert.throws(() => buildAntigravityHooks(payload), /invalid agent name/);
  }
});

test('runHooksInstall rejects invalid agent names before hook generation', async () => {
  const logs = [];
  const result = await runHooksInstall({
    args: ['.'],
    options: {
      tool: 'claude',
      agent: 'dev; echo AIOSON_PENTEST',
      'dry-run': true
    },
    logger: { log: (line) => logs.push(line) }
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'invalid_agent_name');
  assert.match(result.error, /invalid agent name/);
  assert.ok(logs.some((line) => line.includes('Invalid agent name')));
  assert.ok(logs.every((line) => !line.includes('--agent=dev; echo AIOSON_PENTEST')));
});

test('isAiosonHookEntry recognizes AIOSON-owned hooks and leaves user hooks alone', () => {
  const guard = { hooks: [{ type: 'command', command: 'aioson context:guard "$PWD" --tool=claude --json 2>/dev/null || true' }] };
  const emit = { hooks: [{ type: 'command', command: 'aioson hooks:emit "$PWD" --agent=dev --source=claude 2>/dev/null || true' }] };
  const done = { hooks: [{ type: 'command', command: 'aioson agent:done "$PWD" --agent=dev 2>/dev/null || true' }] };
  const userHook = { hooks: [{ type: 'command', command: 'npm run lint' }] };

  assert.equal(isAiosonHookEntry(guard), true);
  assert.equal(isAiosonHookEntry(emit), true);
  assert.equal(isAiosonHookEntry(done), true);
  assert.equal(isAiosonHookEntry(userHook), false);
  assert.equal(isAiosonHookEntry({}), false);
});
