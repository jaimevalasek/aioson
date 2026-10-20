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
const fsSync = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  buildCodexHooks,
  runHooksInstall,
  runHooksUninstall
} = require('../src/commands/hooks-install');
const { configPaths, isAiosonHookEntry } = require('../src/lib/hook-settings-files');
const { buildEventFromPayload } = require('../src/commands/hooks-emit');
const { formatForTool } = require('../src/commands/hooks-recap');
const { buildCompactionRecap } = require('../src/lib/compaction-recap');
const { openRuntimeDb } = require('../src/runtime-store');

const CLI = path.join(__dirname, '..', 'bin', 'aioson.js');

// The shapes Codex really sends (codex-rs/core/src/tools/context.rs): a shell
// command's tool_input is `{ command }` and its tool_response is the model-facing
// output as one string, with no exit code; an apply_patch carries the patch in
// tool_input.command; update_plan sends its arguments.
const codexPayload = (fields) => ({ hook_event_name: 'PostToolUse', session_id: 's', turn_id: 't', tool_use_id: 'c', cwd: '.', model: 'gpt-5.5', permission_mode: 'default', transcript_path: null, ...fields });
const codexBash = (command, output) => buildEventFromPayload(codexPayload({ tool_name: 'Bash', tool_input: { command }, tool_response: output }), 'codex');

function captureLogger() {
  const lines = [];
  return { lines, log: (line) => lines.push(String(line)), error: (line) => lines.push(String(line)) };
}

// configPaths() resolves the home per call, so pointing HOME/USERPROFILE at a
// temporary directory — and clearing the harnesses' own overrides (CODEX_HOME,
// CLAUDE_CONFIG_DIR, XDG_CONFIG_HOME) — keeps every write away from the real machine.
const HOME_OVERRIDES = ['CODEX_HOME', 'CLAUDE_CONFIG_DIR', 'XDG_CONFIG_HOME'];
async function withTempHome(fn) {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-codex-home-'));
  const saved = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
  for (const key of HOME_OVERRIDES) saved[key] = process.env[key];
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  for (const key of HOME_OVERRIDES) delete process.env[key];
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

test('buildCodexHooks: Codex tool names, async telemetry, a compact SessionStart recap, a lean SessionEnd, guarded Windows lines', () => {
  const hooks = buildCodexHooks('dev');
  assert.equal(hooks.PostToolUse[0].matcher, 'apply_patch|Bash|update_plan');
  const emit = hooks.PostToolUse[0].hooks[0];
  assert.match(emit.command, /aioson hooks:emit "\$PWD" --agent='dev' --source='codex'/);
  assert.equal(emit.commandWindows, 'aioson hooks:emit . --agent=dev --source=codex 2>nul & exit /b 0', 'a missing aioson or a crash is never a failed hook on Windows');
  assert.equal(typeof emit.timeout, 'number');
  for (const event of ['PostToolUse', 'UserPromptSubmit', 'Stop']) {
    const handler = hooks[event][0].hooks[0];
    assert.equal(handler.async, true, `${event} records in the background`);
    assert.equal(handler.statusMessage, undefined, `${event} prints no status line on every call`);
  }
  for (const event of ['PreCompact', 'SessionStart', 'SessionEnd']) {
    assert.notEqual(hooks[event][0].hooks[0].async, true, `${event} stays synchronous: the marker and the checkpoint keep their order`);
  }

  assert.equal(hooks.SessionStart[0].matcher, 'compact');
  assert.match(hooks.SessionStart[0].hooks[0].command, /aioson hooks:recap "\$PWD" .*--source='codex' --json/);
  assert.equal(hooks.SessionStart[0].hooks[0].commandWindows, 'aioson hooks:recap . --agent=dev --source=codex --json 2>nul & exit /b 0');
  assert.ok(hooks.PreCompact, 'PreCompact records the compaction marker');
  assert.match(hooks.Stop[0].hooks[0].command, /hooks:emit/);
  assert.doesNotMatch(hooks.Stop[0].hooks[0].command, /agent:done/, 'a turn end does not close the session');
  const end = hooks.SessionEnd[0].hooks[0];
  assert.match(end.command, /^aioson hooks:emit "\$PWD" --agent='dev' --source='codex' --event=SessionEnd 2>\/dev\/null \|\| true$/);
  assert.equal(end.commandWindows, 'aioson hooks:emit . --agent=dev --source=codex --event=SessionEnd 2>nul & exit /b 0');
  assert.ok(end.timeout <= 3, 'Codex caps SessionEnd at 3 s');
  assert.equal(hooks.PreToolUse, undefined, 'no guard: apply_patch input is a patch, not a file');

  for (const groups of Object.values(hooks)) {
    for (const group of groups) assert.equal(isAiosonHookEntry(group), true, 'reinstall and uninstall recognize every entry');
  }
  assert.throws(() => buildCodexHooks('dev; echo x'), /invalid agent name/);
});

const LEGACY_WRAPPER = '#!/bin/bash\n# AIOSON session wrapper for Codex CLI\n# Generated by: aioson hooks:install --tool=codex --agent=dev\ncodex-bin "$@"\n';

test('hooks:install --tool=codex merges into ~/.codex/hooks.json, keeps user hooks, never duplicates, leaves the old wrapper as a pass-through', async () => {
  await withTempHome(async (home) => {
    const hooksPath = configPaths().codex;
    assert.equal(hooksPath, path.join(home, '.codex', 'hooks.json'));
    await fs.mkdir(path.dirname(hooksPath), { recursive: true });
    const userHook = { matcher: 'Bash', hooks: [{ type: 'command', command: 'python3 policy.py' }] };
    await fs.writeFile(hooksPath, JSON.stringify({ description: 'mine', hooks: { PreToolUse: [userHook] } }, null, 2), 'utf8');
    await fs.writeFile(configPaths().codex_wrapper, LEGACY_WRAPPER, 'utf8');

    const out = captureLogger();
    const first = await runHooksInstall({ args: ['.'], options: { tool: 'codex', agent: 'dev' }, logger: out });
    assert.equal(first.ok, true);
    assert.ok(out.lines.some((line) => /\/hooks once — one review covers every AIOSON hook/.test(line)), 'the user is told to trust the hooks once inside Codex');
    assert.ok(!out.lines.some((line) => /agent:done/.test(line)), `no Codex hook runs agent:done, so the summary never says one does: ${out.lines.join(' | ')}`);
    assert.ok(out.lines.some((line) => /Legacy Codex wrapper retired/.test(line)));
    const wrapper = await fs.readFile(configPaths().codex_wrapper, 'utf8');
    assert.match(wrapper, /exec codex "\$@"/, 'an alias that still points at the wrapper keeps opening Codex');
    assert.match(wrapper, /deprecated/);

    const again = captureLogger();
    await runHooksInstall({ args: ['.'], options: { tool: 'codex', agent: 'dev' }, logger: again });
    assert.ok(again.lines.some((line) => /AIOSON hooks unchanged; the trust given in \/hooks still holds/.test(line)), 'an identical reinstall leaves the file alone');
    assert.ok(!again.lines.some((line) => /run \/hooks once/.test(line)));
    const written = JSON.parse(await fs.readFile(hooksPath, 'utf8'));
    assert.equal(written.description, 'mine', 'the user\'s metadata survives');
    assert.deepEqual(written.hooks.PreToolUse, [userHook], 'user hooks stay, the guard is not installed for Codex');
    assert.equal(written.hooks.PostToolUse.length, 1, 'a reinstall does not duplicate');
    assert.equal(written.hooks.SessionStart[0].matcher, 'compact');

    const removal = await runHooksUninstall({ args: ['.'], options: { tool: 'codex' }, logger: captureLogger() });
    assert.equal(removal.results[0].removed, true);
    const after = JSON.parse(await fs.readFile(hooksPath, 'utf8'));
    assert.deepEqual(after.hooks, { PreToolUse: [userHook] }, 'only AIOSON entries are removed');
    const foreign = '#!/bin/sh\necho mine\n';
    await fs.writeFile(configPaths().codex_wrapper, foreign, 'utf8');
    await runHooksInstall({ args: ['.'], options: { tool: 'codex', agent: 'dev' }, logger: captureLogger() });
    assert.equal(await fs.readFile(configPaths().codex_wrapper, 'utf8'), foreign, 'a file that is not the old wrapper is left alone');
  });
});

test('merge and uninstall work handler by handler: a user handler beside ours survives, ours is never duplicated, a hook that merely calls aioson is the user\'s', async () => {
  await withTempHome(async () => {
    const hooksPath = configPaths().codex;
    await fs.mkdir(path.dirname(hooksPath), { recursive: true });
    const ours = 'aioson hooks:emit "$PWD" --agent=dev --source=codex 2>/dev/null || true';
    await fs.writeFile(hooksPath, JSON.stringify({ hooks: {
      SessionStart: [{ hooks: [{ type: 'command', command: 'npx aioson live:start . --tool=codex --no-launch; python3 ~/notify.py' }] }],
      Stop: [{ hooks: [{ type: 'command', command: ours }, { type: 'command', command: 'python3 ~/my-own-stop-logger.py' }] }],
      PostToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'python3 ~/policy.py' }, { type: 'command', command: ours }] }]
    } }, null, 2), 'utf8');

    await runHooksInstall({ args: ['.'], options: { tool: 'codex', agent: 'dev' }, logger: captureLogger() });
    const after = JSON.parse(await fs.readFile(hooksPath, 'utf8'));
    const commands = (event) => after.hooks[event].flatMap((group) => group.hooks.map((handler) => handler.command));
    assert.ok(commands('SessionStart').some((command) => command.includes('notify.py')), 'a user hook that calls `npx aioson` is not ours');
    assert.ok(commands('Stop').includes('python3 ~/my-own-stop-logger.py'), 'a user handler sharing a group with ours stays');
    assert.equal(commands('PostToolUse').filter((command) => command.startsWith('aioson hooks:emit')).length, 1, 'ours in a user group is replaced, not duplicated');
    assert.ok(commands('PostToolUse').includes('python3 ~/policy.py'));

    await runHooksUninstall({ args: ['.'], options: { tool: 'codex' }, logger: captureLogger() });
    const left = JSON.parse(await fs.readFile(hooksPath, 'utf8'));
    const all = Object.values(left.hooks).flatMap((groups) => groups.flatMap((group) => group.hooks.map((handler) => handler.command)));
    assert.ok(all.every((command) => !/^aioson /.test(command)), all.join(' | '));
    assert.equal(all.length, 3, 'every user handler survives the uninstall');
  });
});

test('the hooks follow each harness\'s own config dir: CODEX_HOME, XDG_CONFIG_HOME, CLAUDE_CONFIG_DIR', async () => {
  await withTempHome(async (home) => {
    process.env.CODEX_HOME = path.join(home, 'codex-home');
    process.env.XDG_CONFIG_HOME = path.join(home, 'xdg');
    process.env.CLAUDE_CONFIG_DIR = path.join(home, 'claude-dir');
    const paths = configPaths();
    assert.equal(paths.codex, path.join(home, 'codex-home', 'hooks.json'));
    assert.equal(paths.opencode, path.join(home, 'xdg', 'opencode', 'plugins', 'aioson.js'));
    assert.equal(paths.claude, path.join(home, 'claude-dir', 'settings.json'));
    const result = await runHooksInstall({ args: ['.'], options: { tool: 'codex,opencode,claude', agent: 'dev' }, logger: captureLogger() });
    assert.equal(result.ok, true);
    for (const file of [paths.codex, paths.opencode, paths.claude]) await fs.access(file);
    await assert.rejects(fs.access(path.join(home, '.codex', 'hooks.json')), 'nothing lands where the harness does not look');
  });
});

test('SessionEnd records the end and closes only the hooks session; outside a project nothing is created and the exit is 0', async (t) => {
  const dir = fsSync.mkdtempSync(path.join(os.tmpdir(), 'aioson-codex-end-'));
  const outside = fsSync.mkdtempSync(path.join(os.tmpdir(), 'aioson-codex-outside-'));
  t.after(() => {
    fsSync.rmSync(dir, { recursive: true, force: true });
    fsSync.rmSync(outside, { recursive: true, force: true });
  });
  fsSync.mkdirSync(path.join(dir, '.aioson'), { recursive: true });
  fsSync.writeFileSync(path.join(dir, '.aioson', 'config.md'), '# project\n', 'utf8');
  const env = { ...process.env };
  delete env.AIOSON_LIVE_SESSION;
  delete env.AIOSON_LIVE_SESSION_KEY;
  const run = (cwd, payload, extra = []) => spawnSync(process.execPath, [CLI, 'hooks:emit', '.', '--agent=dev', '--source=codex', ...extra], { cwd, input: payload ? JSON.stringify(payload) : '', env, encoding: 'utf8' });

  assert.equal(run(dir, codexPayload({ tool_name: 'Bash', tool_input: { command: 'npm test' }, tool_response: 'Tests  1 passed (1)' })).status, 0);
  const session = JSON.parse(fsSync.readFileSync(path.join(dir, '.aioson', 'runtime', '.sessions', '@dev.json'), 'utf8'));
  const end = run(dir, { hook_event_name: 'SessionEnd', reason: 'other', session_id: 's', cwd: dir, transcript_path: null }, ['--event=SessionEnd']);
  assert.equal(end.status, 0, end.stderr);
  assert.equal(end.stdout, '', 'nothing on stdout');
  const { db } = await openRuntimeDb(dir, { mustExist: true });
  try {
    assert.equal(db.prepare('SELECT status FROM agent_runs WHERE run_key = ?').get(session.runKey).status, 'completed');
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM agent_events WHERE run_key = ? AND event_type = 'session_ended'").get(session.runKey).n, 1);
  } finally {
    db.close();
  }
  assert.equal(JSON.parse(fsSync.readFileSync(path.join(dir, '.aioson', 'runtime', '.sessions', '@dev.json'), 'utf8')).finished, true);
  run(dir, codexPayload({ session_id: 's2', tool_name: 'Bash', tool_input: { command: 'npm test' }, tool_response: 'Tests  1 passed (1)' }));
  assert.notEqual(JSON.parse(fsSync.readFileSync(path.join(dir, '.aioson', 'runtime', '.sessions', '@dev.json'), 'utf8')).runKey, session.runKey, 'the next session opens its own run');

  const away = run(outside, { hook_event_name: 'SessionEnd', reason: 'other', session_id: 'x' }, ['--event=SessionEnd']);
  assert.equal(away.status, 0);
  assert.equal(fsSync.existsSync(path.join(outside, '.aioson')), false, 'no .aioson outside a project');
  assert.equal(fsSync.existsSync(path.join(outside, 'aioson-logs')), false);
});

test('hooks:emit never exits non-zero: a broken runtime store loses the event, not the hook', (t) => {
  const dir = fsSync.mkdtempSync(path.join(os.tmpdir(), 'aioson-codex-broken-'));
  t.after(() => fsSync.rmSync(dir, { recursive: true, force: true }));
  fsSync.mkdirSync(path.join(dir, '.aioson'), { recursive: true });
  fsSync.writeFileSync(path.join(dir, '.aioson', 'config.md'), '# project\n', 'utf8');
  fsSync.writeFileSync(path.join(dir, '.aioson', 'runtime'), 'not a directory', 'utf8');
  const env = { ...process.env };
  delete env.AIOSON_LIVE_SESSION;
  delete env.AIOSON_LIVE_SESSION_KEY;
  const result = spawnSync(process.execPath, [CLI, 'hooks:emit', dir, '--agent=dev', '--source=codex'], { input: JSON.stringify(codexPayload({ tool_name: 'Bash', tool_input: { command: 'npm test' }, tool_response: 'ok' })), env, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
});

test('the Windows guard turns any failure of the hook line into exit 0', { skip: process.platform !== 'win32' }, () => {
  const line = buildCodexHooks('dev').PostToolUse[0].hooks[0].commandWindows.replace(/^aioson /, 'aioson-not-installed-here ');
  const result = spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/c', line], { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
});

test('hooks:emit reads the files of a Codex apply_patch: a move records where the file went, a delete is not a change', () => {
  const patch = buildEventFromPayload(codexPayload({
    tool_name: 'apply_patch',
    tool_input: { command: '*** Begin Patch\n*** Update File: src/a.js\n@@\n-x\n+y\n*** Add File: src/b.js\n+1\n*** Update File: src/old-name.js\n*** Move to: src/new-name.js\n@@\n-a\n+b\n*** Delete File: src/dead.js\n*** End Patch\n' },
    tool_response: 'Success. Updated the following files:\nM src/a.js\nA src/b.js\nM src/new-name.js\nD src/dead.js\n'
  }), 'codex');
  assert.equal(patch.eventType, 'artifact');
  assert.equal(patch.filePath, 'src/a.js');
  assert.deepEqual(patch.extra.files, ['src/a.js', 'src/b.js', 'src/new-name.js']);
  assert.deepEqual(patch.extra.deleted, ['src/dead.js']);
  assert.equal(patch.message, 'apply_patch: a.js, b.js, new-name.js (deleted: dead.js)');

  const plan = buildEventFromPayload(codexPayload({
    tool_name: 'update_plan',
    tool_input: { plan: [{ step: 'write tests', status: 'completed' }, { step: 'fix refund', status: 'in_progress' }, { step: 'docs', status: 'pending' }] },
    tool_response: 'Plan updated'
  }), 'codex');
  assert.equal(plan.eventType, 'plan_updated');
  assert.match(plan.message, /Tarefas: 1 de 3 feitas · em andamento: fix refund · próximas: docs/);
});

test('a Codex command\'s verdict comes from its output text alone: runner summaries and an exit line, never invented', () => {
  const failed = codexBash('npm test', 'FAIL src/refund.test.js\n  refund > rounds half-up\n Tests  1 failed | 12 passed (13)\n');
  assert.equal(failed.extra.outcome, 'failed');
  assert.match(failed.extra.result, /Tests 1 failed \| 12 passed \(13\)/);
  assert.equal(codexBash('npm test', ' Tests  13 passed (13)\n').extra.outcome, 'passed');
  assert.equal(codexBash('cargo test', 'test result: ok. 5 passed; 0 failed; 0 ignored').extra.outcome, 'passed');
  assert.equal(codexBash('pytest', '1 failed, 2 passed in 0.12s').extra.outcome, 'failed');
  assert.equal(codexBash('node --test', 'not ok 3 - refund rounds\n# fail 1').extra.outcome, 'failed');
  assert.equal(codexBash('go test ./...', 'FAIL\tgithub.com/acme/refund\t0.2s').extra.outcome, 'failed');

  const exited = codexBash('npm run build', 'Process exited with code 2\nsrc/app.ts(3,1): error TS2304');
  assert.equal(exited.extra.outcome, 'failed');
  assert.equal(exited.extra.result, 'Exit code 2');
  assert.equal(codexBash('npm test', 'Exit code: 0\nTests  13 passed (13)').extra.outcome, 'passed');

  const silent = codexBash('npm run build', "src/app.ts(3,1): error TS2304: Cannot find name 'foo'.\n");
  assert.equal(silent.extra.outcome, undefined, 'no runner summary and no exit line: no verdict');
  assert.equal(silent.extra.result, undefined);
});

test('a verdict from Codex\'s text needs a test runner: another command, an empty output or a TAP todo fails nothing', () => {
  const verdict = (event) => [event.extra.outcome, event.extra.result];
  assert.deepEqual(verdict(codexBash('git log --oneline -3', 'a1b2c3d fix: 3 failing tests in refund\nb2c3d4e feat: refund rounding\n')), [undefined, undefined], 'a commit message is not a test run');
  assert.deepEqual(verdict(codexBash('grep -c "failed" ci.log', 'ci.log: 2 failed uploads were retried\n')), [undefined, undefined]);
  assert.deepEqual(verdict(codexBash('test -f dist/app.js', '')), [undefined, undefined], 'an empty output says nothing either way');
  const todo = 'TAP version 13\n# Subtest: refund rounds\nnot ok 1 - refund rounds # TODO\n  ---\n  duration_ms: 1\n  ...\n1..1\n# tests 1\n# pass 0\n# fail 0\n# todo 1\n';
  assert.equal(codexBash('node --test', todo).extra.outcome, 'passed', 'a TAP # TODO is reported not ok and fails nothing');
  assert.equal(codexBash('node --test', 'not ok 2 - flaky # SKIP network\n# fail 0\n').extra.outcome, 'passed', 'nor does a # SKIP');
  assert.equal(codexBash('pytest -q', '==================== 5 passed, 1 error in 0.55s ====================\n').extra.outcome, 'failed', 'pytest counts a broken fixture as an error');
  assert.equal(codexBash('cd api && CI=1 npx vitest run', ' Tests  2 failed | 30 passed (32)\n').extra.outcome, 'failed', 'the runner after `cd … &&`, a variable and npx');
  assert.equal(codexBash('git log --oneline -1', 'Process exited with code 1\n').extra.outcome, 'failed', 'an exit line decides for any command');
});

test('a harness that reports the exit code inside an object still gets its verdict', () => {
  const object = (response) => buildEventFromPayload({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'npm test' }, tool_response: response }, 'other');
  const failed = object({ output: 'FAIL src/refund.test.js\n Tests  1 failed | 12 passed (13)', exit_code: 1 });
  assert.equal(failed.extra.outcome, 'failed');
  assert.match(failed.extra.result, /Tests 1 failed \| 12 passed \(13\)/);
  assert.equal(object({ output: 'Tests  13 passed (13)', exit_code: 0 }).extra.outcome, 'passed');
  const silent = object({ output: 'done', exit_code: 2 });
  assert.equal(silent.extra.outcome, 'failed');
  assert.equal(silent.extra.result, 'Exit code 2');
});

test('end to end: a failing Codex command is still failing after the compaction', (t) => {
  const dir = fsSync.mkdtempSync(path.join(os.tmpdir(), 'aioson-codex-e2e-'));
  t.after(() => fsSync.rmSync(dir, { recursive: true, force: true }));
  fsSync.mkdirSync(path.join(dir, '.aioson'), { recursive: true });
  fsSync.writeFileSync(path.join(dir, '.aioson', 'config.md'), '# project\n', 'utf8');
  const run = (command, payload, extra = []) => {
    const env = { ...process.env };
    delete env.AIOSON_LIVE_SESSION;
    delete env.AIOSON_LIVE_SESSION_KEY;
    const result = spawnSync(process.execPath, [CLI, command, dir, '--agent=dev', '--source=codex', ...extra], { input: JSON.stringify(payload), env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  };
  run('hooks:emit', codexPayload({ tool_name: 'Bash', tool_input: { command: 'npm test' }, tool_response: 'FAIL src/refund.test.js\n Tests  1 failed | 12 passed (13)\n' }));
  run('hooks:emit', { hook_event_name: 'PreCompact', session_id: 's', trigger: 'auto' });
  const out = JSON.parse(run('hooks:recap', { hook_event_name: 'SessionStart', session_id: 's', source: 'compact' }, ['--json']));
  assert.match(out.hookSpecificOutput.additionalContext, /Still failing \(latest run\): \$ npm test → FAIL src\/refund\.test\.js · Tests 1 failed \| 12 passed \(13\)/);
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
