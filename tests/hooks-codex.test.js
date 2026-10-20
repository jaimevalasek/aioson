'use strict';

// Codex ships native hooks in Claude Code's shape (hooks.json under ~/.codex,
// the same stdin fields, the same SessionStart envelope) with its own tool
// names and a trust step the user performs. The adapter must speak exactly
// that, and hooks:emit must read what Codex sends: apply_patch for file edits,
// update_plan for the plan, an exit code inside tool_response for a failed
// command.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
  buildCodexHooks,
  configPaths,
  isAiosonHookEntry,
  runHooksInstall,
  runHooksUninstall
} = require('../src/commands/hooks-install');
const { buildEventFromPayload } = require('../src/commands/hooks-emit');
const { formatForTool } = require('../src/commands/hooks-recap');
const { buildCompactionRecap } = require('../src/lib/compaction-recap');

function captureLogger() {
  const lines = [];
  return { lines, log: (line) => lines.push(String(line)), error: (line) => lines.push(String(line)) };
}

// configPaths() resolves the home per call, so pointing HOME/USERPROFILE at a
// temporary directory keeps every write away from the real machine.
async function withTempHome(fn) {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-codex-home-'));
  const saved = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  try {
    return await fn(home);
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await fs.rm(home, { recursive: true, force: true });
  }
}

test('buildCodexHooks: Codex tool names, a compact SessionStart recap, SessionEnd closes the run, Windows handlers unquoted', () => {
  const hooks = buildCodexHooks('dev');
  assert.equal(hooks.PostToolUse[0].matcher, 'apply_patch|Bash|update_plan');
  const emit = hooks.PostToolUse[0].hooks[0];
  assert.match(emit.command, /aioson hooks:emit "\$PWD" --agent='dev' --source='codex'/);
  assert.equal(emit.commandWindows, 'aioson hooks:emit . --agent=dev --source=codex');
  assert.equal(typeof emit.timeout, 'number');

  assert.equal(hooks.SessionStart[0].matcher, 'compact');
  assert.match(hooks.SessionStart[0].hooks[0].command, /aioson hooks:recap "\$PWD" .*--source='codex' --json/);
  assert.equal(hooks.SessionStart[0].hooks[0].commandWindows, 'aioson hooks:recap . --agent=dev --source=codex --json');
  assert.ok(hooks.PreCompact, 'PreCompact records the compaction marker');
  assert.match(hooks.Stop[0].hooks[0].command, /hooks:emit/);
  assert.doesNotMatch(hooks.Stop[0].hooks[0].command, /agent:done/, 'a turn end does not close the session');
  assert.match(hooks.SessionEnd[0].hooks[0].command, /aioson agent:done/);
  assert.ok(hooks.SessionEnd[0].hooks[0].timeout > 1, 'Codex defaults SessionEnd to 1 s');
  assert.equal(hooks.PreToolUse, undefined, 'no guard: apply_patch input is a patch, not a file');

  for (const groups of Object.values(hooks)) {
    for (const group of groups) assert.equal(isAiosonHookEntry(group), true, 'reinstall and uninstall recognize every entry');
  }
  assert.throws(() => buildCodexHooks('dev; echo x'), /invalid agent name/);
});

test('hooks:install --tool=codex merges into ~/.codex/hooks.json, keeps user hooks, never duplicates, retires the wrapper', async () => {
  await withTempHome(async (home) => {
    const hooksPath = configPaths().codex;
    assert.equal(hooksPath, path.join(home, '.codex', 'hooks.json'));
    await fs.mkdir(path.dirname(hooksPath), { recursive: true });
    const userHook = { matcher: 'Bash', hooks: [{ type: 'command', command: 'python3 policy.py' }] };
    await fs.writeFile(hooksPath, JSON.stringify({ description: 'mine', hooks: { PreToolUse: [userHook] } }, null, 2), 'utf8');
    await fs.writeFile(configPaths().codex_wrapper, '#!/bin/bash\n', 'utf8');

    const out = captureLogger();
    const first = await runHooksInstall({ args: ['.'], options: { tool: 'codex', agent: 'dev' }, logger: out });
    assert.equal(first.ok, true);
    assert.ok(out.lines.some((line) => /\/hooks/.test(line)), 'the user is told to trust the hooks inside Codex');
    assert.ok(out.lines.some((line) => /Legacy Codex wrapper removed/.test(line)));
    await assert.rejects(fs.access(configPaths().codex_wrapper), 'the pre-hooks wrapper is retired');

    await runHooksInstall({ args: ['.'], options: { tool: 'codex', agent: 'dev' }, logger: captureLogger() });
    const written = JSON.parse(await fs.readFile(hooksPath, 'utf8'));
    assert.equal(written.description, 'mine', 'the user\'s metadata survives');
    assert.deepEqual(written.hooks.PreToolUse, [userHook], 'user hooks stay, the guard is not installed for Codex');
    assert.equal(written.hooks.PostToolUse.length, 1, 'a reinstall does not duplicate');
    assert.equal(written.hooks.SessionStart[0].matcher, 'compact');

    const removal = await runHooksUninstall({ args: ['.'], options: { tool: 'codex' }, logger: captureLogger() });
    assert.equal(removal.results[0].removed, true);
    const after = JSON.parse(await fs.readFile(hooksPath, 'utf8'));
    assert.deepEqual(after.hooks, { PreToolUse: [userHook] }, 'only AIOSON entries are removed');
  });
});

test('hooks:emit reads apply_patch files, update_plan steps and the exit code Codex puts in tool_response', () => {
  const patch = buildEventFromPayload({
    hook_event_name: 'PostToolUse',
    tool_name: 'apply_patch',
    tool_input: { input: '*** Begin Patch\n*** Update File: src/a.js\n@@\n-x\n+y\n*** Add File: src/b.js\n+1\n*** End Patch\n' }
  }, 'codex');
  assert.equal(patch.eventType, 'artifact');
  assert.equal(patch.filePath, 'src/a.js');
  assert.deepEqual(patch.extra.files, ['src/a.js', 'src/b.js']);
  assert.equal(patch.message, 'apply_patch: a.js, b.js');

  const plan = buildEventFromPayload({
    hook_event_name: 'PostToolUse',
    tool_name: 'update_plan',
    tool_input: { plan: [{ step: 'write tests', status: 'completed' }, { step: 'fix refund', status: 'in_progress' }, { step: 'docs', status: 'pending' }] }
  }, 'codex');
  assert.equal(plan.eventType, 'plan_updated');
  assert.match(plan.message, /Tarefas: 1 de 3 feitas · em andamento: fix refund · próximas: docs/);

  const failed = buildEventFromPayload({
    hook_event_name: 'PostToolUse',
    tool_name: 'Bash',
    tool_input: { command: 'npm test' },
    tool_response: { output: 'FAIL src/refund.test.js\n Tests  1 failed | 12 passed (13)', exit_code: 1 }
  }, 'codex');
  assert.equal(failed.extra.outcome, 'failed');
  assert.match(failed.extra.result, /Tests 1 failed \| 12 passed \(13\)/);

  const passed = buildEventFromPayload({
    hook_event_name: 'PostToolUse',
    tool_name: 'Bash',
    tool_input: { command: 'npm test' },
    tool_response: { output: 'Tests  13 passed (13)', exit_code: 0 }
  }, 'codex');
  assert.equal(passed.extra.outcome, 'passed');
  assert.match(passed.extra.result, /13 passed/);

  const silent = buildEventFromPayload({
    hook_event_name: 'PostToolUse',
    tool_name: 'Bash',
    tool_input: { command: 'npm run build' },
    tool_response: { output: 'done', exit_code: 2 }
  }, 'codex');
  assert.equal(silent.extra.outcome, 'failed');
  assert.equal(silent.extra.result, 'Exit code 2');
});

test('a multi-file patch lists every file in the recap, newest first', () => {
  const recap = buildCompactionRecap({
    events: [{ event_type: 'artifact', message: 'apply_patch: a.js, b.js', payload_json: JSON.stringify({ file: 'src/a.js', files: ['src/a.js', 'src/b.js'] }) }]
  });
  assert.match(recap, /Files changed, newest first: src\/b\.js, src\/a\.js/);
});

test('hooks:recap answers Codex with the SessionStart envelope and the OpenCode plugin with the bare context', () => {
  assert.deepEqual(formatForTool('codex', 'x'), { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: 'x' } });
  assert.deepEqual(formatForTool('claude', 'x'), { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: 'x' } });
  assert.deepEqual(formatForTool('opencode', 'x'), { additionalContext: 'x' });
});
