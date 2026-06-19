'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
  buildAntigravityHooks,
  buildClaudeHooks,
  isAiosonHookEntry,
  normalizeHookAgentName,
  runHooksInstall,
  runHooksUninstall,
  scrubAntigravityHookFile
} = require('../src/commands/hooks-install');

function captureLogger() {
  const lines = [];
  return { lines, log(value) { lines.push(String(value)); } };
}

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

test('scrubAntigravityHookFile removes only AIOSON entries and preserves user hooks (P2)', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-hooks-uninst-'));
  const file = path.join(tmp, 'hooks.json');
  try {
    await fs.writeFile(file, JSON.stringify({
      hooks: {
        PostToolUse: [
          { matcher: 'Write', hooks: [{ command: 'aioson hooks:emit "$PWD" --agent=dev 2>/dev/null || true' }] },
          { matcher: 'Write', hooks: [{ command: 'my-own-tool log' }] }
        ],
        SessionStart: [{ type: 'command', command: 'aioson live:start "$PWD" --tool=antigravity' }]
      }
    }, null, 2), 'utf8');

    const res = await scrubAntigravityHookFile(file, false, captureLogger(), 'test');
    assert.equal(res.removed, true);

    const after = JSON.parse(await fs.readFile(file, 'utf8'));
    assert.equal(after.hooks.PostToolUse.length, 1, 'only the user hook survives PostToolUse');
    assert.equal(after.hooks.PostToolUse[0].hooks[0].command, 'my-own-tool log');
    assert.equal(after.hooks.SessionStart, undefined, 'an emptied event key is dropped');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('runHooksUninstall handles antigravity and codex instead of a silent no-op (P2)', async () => {
  const out = captureLogger();
  // dry-run keeps it from touching the real HOME while still exercising dispatch.
  const res = await runHooksUninstall({
    args: ['.'],
    options: { tool: 'antigravity,codex', 'dry-run': true },
    logger: out
  });

  assert.equal(res.ok, true);
  const tools = res.results.map((r) => r.tool);
  assert.ok(tools.includes('antigravity'), 'antigravity is dispatched');
  assert.ok(tools.includes('codex'), 'codex is dispatched');
  assert.equal(out.lines.some((line) => /Unknown tool/.test(line)), false, 'no unsupported-tool warning');
});

test('runHooksUninstall flags a genuinely unknown tool as unsupported (P2)', async () => {
  const out = captureLogger();
  const res = await runHooksUninstall({
    args: ['.'],
    options: { tool: 'sublime', 'dry-run': true },
    logger: out
  });

  assert.equal(res.ok, true);
  assert.equal(res.results[0].tool, 'sublime');
  assert.equal(res.results[0].reason, 'unsupported');
  assert.ok(out.lines.some((line) => /Unknown tool: sublime/.test(line)));
});
