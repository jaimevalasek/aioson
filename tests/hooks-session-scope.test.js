'use strict';

// The per-agent hooks run is shared: every window opened on the project, every
// lane worker and yesterday's session append to it. The checkpoint after a
// compaction read that run as "the session", so a new session got yesterday's
// files and claims ("falta rodar o seed de produção"), one lane's compaction cut
// another lane's window, and a second compaction forgot the agent, the plan and
// a test that never ran again. hooks:emit now stamps the harness session_id on
// every event and hooks:recap reads that session only; the agent, the plan and
// what still fails are read over the whole session, the files over the stretch.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { buildEventFromPayload } = require('../src/commands/hooks-emit');
const { buildClaudeHooks } = require('../src/commands/hooks-install');
const { openRuntimeDb } = require('../src/runtime-store');

const CLI = path.join(__dirname, '..', 'bin', 'aioson.js');
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-session-scope-home-'));

// Every spawned command gets a throwaway home and no inherited live session.
function env(extra = {}) {
  const out = {
    ...process.env,
    HOME,
    USERPROFILE: HOME,
    APPDATA: path.join(HOME, 'AppData'),
    XDG_CONFIG_HOME: path.join(HOME, '.config'),
    CODEX_HOME: path.join(HOME, '.codex'),
    CLAUDE_CONFIG_DIR: path.join(HOME, '.claude'),
    AIOSON_OPERATOR_MEMORY: 'false',
    ...extra
  };
  if (!('AIOSON_LIVE_SESSION' in extra)) delete out.AIOSON_LIVE_SESSION;
  if (!('AIOSON_LIVE_SESSION_KEY' in extra)) delete out.AIOSON_LIVE_SESSION_KEY;
  return out;
}

function makeProject(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-session-scope-'));
  fs.mkdirSync(path.join(dir, '.aioson'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.aioson', 'config.md'), '# project\n', 'utf8');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function cli(args, { input = '', cwd, extraEnv } = {}) {
  return spawnSync(process.execPath, [CLI, ...args], { input, cwd, env: env(extraEnv), encoding: 'utf8' });
}

function emit(dir, payload, { source = 'claude', extra = [], extraEnv } = {}) {
  const result = cli(['hooks:emit', dir, '--agent=dev', `--source=${source}`, ...extra], { input: JSON.stringify(payload), extraEnv });
  assert.equal(result.status, 0, result.stderr);
  return result;
}

function recap(dir, payload, { source = 'claude', extraEnv } = {}) {
  const result = cli(['hooks:recap', dir, '--agent=dev', `--source=${source}`, '--json'], { input: JSON.stringify(payload), extraEnv });
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  return (parsed.hookSpecificOutput || parsed).additionalContext || '';
}

const patch = (...files) => `*** Begin Patch\n${files.map((file) => `*** Update File: ${file}\n@@\n-a\n+b\n`).join('')}*** End Patch\n`;
const codexEdit = (session, ...files) => ({ hook_event_name: 'PostToolUse', session_id: session, tool_name: 'apply_patch', tool_input: { command: patch(...files) }, tool_response: 'Success.' });
const claudeWrite = (dir, session, file) => ({ hook_event_name: 'PostToolUse', session_id: session, tool_name: 'Write', tool_input: { file_path: path.join(dir, file) } });

test('a new session never inherits the files or the claims of the one before it', (t) => {
  const dir = makeProject(t);
  emit(dir, claudeWrite(dir, 'S1', 'db/migrate/001_users.sql'));
  emit(dir, { hook_event_name: 'Stop', session_id: 'S1', last_assistant_message: 'Migração 001 aplicada; falta rodar o seed de produção.' });
  emit(dir, claudeWrite(dir, 'S2', 'src/ui/button.tsx'));
  emit(dir, { hook_event_name: 'PreCompact', session_id: 'S2', trigger: 'auto' });

  const context = recap(dir, { hook_event_name: 'SessionStart', session_id: 'S2', source: 'compact' });
  assert.match(context, /Files changed, newest first: src\/ui\/button\.tsx/);
  assert.doesNotMatch(context, /001_users|seed de produção/, context);
});

test('two lane workers compacting in turn keep their own windows', (t) => {
  const dir = makeProject(t);
  emit(dir, codexEdit('lane-a', 'src/lane-a/refund.js'), { source: 'codex' });
  emit(dir, codexEdit('lane-b', 'src/lane-b/invoice.js'), { source: 'codex' });
  emit(dir, { hook_event_name: 'PreCompact', session_id: 'lane-b', trigger: 'auto' }, { source: 'codex' });
  emit(dir, codexEdit('lane-a', 'src/lane-a/refund.test.js'), { source: 'codex' });
  emit(dir, { hook_event_name: 'PreCompact', session_id: 'lane-a', trigger: 'auto' }, { source: 'codex' });

  const context = recap(dir, { hook_event_name: 'SessionStart', session_id: 'lane-a', source: 'compact' }, { source: 'codex' });
  assert.match(context, /Files changed, newest first: src\/lane-a\/refund\.test\.js, src\/lane-a\/refund\.js/, context);
  assert.doesNotMatch(context, /invoice/);
});

test('the agent, the plan and a failure never run again survive the second compaction', (t) => {
  const dir = makeProject(t);
  emit(dir, { hook_event_name: 'UserPromptSubmit', session_id: 'C1', prompt: '/aioson:agent:qa revise o checkout' });
  emit(dir, { hook_event_name: 'PostToolUse', session_id: 'C1', tool_name: 'TodoWrite', tool_input: { todos: [{ content: 'revisar AC-1', status: 'in_progress' }, { content: 'revisar AC-2', status: 'pending' }] } });
  emit(dir, { hook_event_name: 'PostToolUseFailure', session_id: 'C1', tool_name: 'Bash', tool_input: { command: 'npm test' }, error: 'Exit code 1\nTests  1 failed | 3 passed (4)' });
  emit(dir, { hook_event_name: 'PreCompact', session_id: 'C1', trigger: 'auto' });

  const first = recap(dir, { hook_event_name: 'SessionStart', session_id: 'C1', source: 'compact' });
  assert.match(first, /Agent: @qa/, 'an activation in a session opened without live:start is recorded for that session');
  assert.match(first, /Still failing \(latest run\): \$ npm test/);

  emit(dir, claudeWrite(dir, 'C1', 'notes.md'));
  emit(dir, { hook_event_name: 'PreCompact', session_id: 'C1', trigger: 'auto' });
  const second = recap(dir, { hook_event_name: 'SessionStart', session_id: 'C1', source: 'compact' });
  assert.match(second, /Agent: @qa/, second);
  assert.match(second, /Still failing \(latest run\): \$ npm test → Tests 1 failed \| 3 passed \(4\)/);
  assert.match(second, /Plan: Tarefas: 0 de 2 feitas/);
  assert.match(second, /Files changed, newest first: notes\.md\n/, 'the files are the stretch the second compaction summarized');
});

test('hooks:emit and agent:done meet in one session file', async (t) => {
  const dir = makeProject(t);
  emit(dir, claudeWrite(dir, 'C1', 'src/a.js'));
  const done = cli(['agent:done', dir, '--agent=dev', '--summary=turn closed', '--json']);
  assert.equal(done.status, 0, done.stderr);
  assert.equal(JSON.parse(done.stdout).mode, 'live_event', 'agent:done finds the session hooks:emit opened');
  const { db } = await openRuntimeDb(dir, { mustExist: true });
  try {
    const hooksRun = db.prepare("SELECT run_key FROM agent_runs WHERE agent_name = '@dev' AND source = 'live'").get();
    const types = db.prepare('SELECT event_type FROM agent_events WHERE run_key = ? ORDER BY id').all(hooksRun.run_key).map((row) => row.event_type);
    assert.deepEqual(types, ['session_started', 'artifact', 'agent_done'], 'the turn closes on the run the hooks write to');
    const standalone = db.prepare("SELECT COUNT(*) AS n FROM agent_runs WHERE agent_name = '@dev' AND source = 'direct'").get().n;
    assert.equal(standalone, 0, 'no standalone "@dev completed" run per call');
  } finally {
    db.close();
  }
});

test('an AIOSON agent activated through Claude\'s Skill tool is an activation; other skills are not recorded', () => {
  const activation = buildEventFromPayload({ hook_event_name: 'PostToolUse', session_id: 'x', tool_name: 'Skill', tool_input: { skill: 'aioson:agent:sheldon' } }, 'claude');
  assert.equal(activation.eventType, 'agent_activated');
  assert.equal(activation.message, '@sheldon');
  assert.equal(buildEventFromPayload({ hook_event_name: 'PostToolUse', tool_name: 'Skill', tool_input: { skill: 'pdf' } }, 'claude'), null);
  assert.ok(buildClaudeHooks('dev').PostToolUse.some((group) => /\bSkill\b/.test(group.matcher)), 'the Claude hooks listen to the Skill tool');
});

test('a lane worker never inherits the live session of the process that spawned it', async (t) => {
  const dir = makeProject(t);
  const saved = {
    AIOSON_LIVE_SESSION: process.env.AIOSON_LIVE_SESSION,
    AIOSON_LIVE_SESSION_KEY: process.env.AIOSON_LIVE_SESSION_KEY,
    CODEX_HOME: process.env.CODEX_HOME
  };
  process.env.AIOSON_LIVE_SESSION = 'parent-session';
  process.env.AIOSON_LIVE_SESSION_KEY = 'parent-session';
  process.env.CODEX_HOME = path.join(HOME, '.codex');
  t.after(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  const out = path.join(dir, 'lane-env.json');
  const { createAdapter } = require('../src/agent-execution/adapters/base');
  const adapter = createAdapter('codex', () => ['-e', `require('fs').writeFileSync(${JSON.stringify(out)}, JSON.stringify({ session: process.env.AIOSON_LIVE_SESSION || null, key: process.env.AIOSON_LIVE_SESSION_KEY || null }))`]);
  adapter.probe = () => ({ external_process: true, executable: process.execPath, source: 'test' });
  const result = await adapter.execute({ mode: 'external', model: 'x', cwd: dir, prompt_text: 'x', timeout: 20000 });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(JSON.parse(fs.readFileSync(out, 'utf8')), { session: null, key: null });
  assert.equal(process.env.AIOSON_LIVE_SESSION, 'parent-session', 'the parent keeps its own session');
});

test('outside an AIOSON project every hook entry point exits 0 and creates nothing', (t) => {
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-session-scope-outside-'));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  const calls = [
    [['hooks:emit', '.', '--agent=dev', '--source=claude'], { hook_event_name: 'PostToolUse', session_id: 'o', tool_name: 'Write', tool_input: { file_path: path.join(outside, 'a.js') } }],
    [['hooks:emit', '.', '--then=agent:done', '--agent=dev', '--source=claude'], { hook_event_name: 'Stop', session_id: 'o', last_assistant_message: 'done' }],
    [['hooks:emit', '.', '--agent=dev', '--source=codex', '--event=SessionEnd'], { hook_event_name: 'SessionEnd', session_id: 'o', reason: 'other' }],
    [['hooks:recap', '.', '--agent=dev', '--source=codex', '--json'], { hook_event_name: 'SessionStart', session_id: 'o', source: 'compact' }],
    [['context:guard', '.', '--tool=claude', '--agent=auto', '--json'], { tool_name: 'Write', tool_input: { file_path: path.join(outside, 'a.js'), content: 'x' } }]
  ];
  for (const [args, payload] of calls) {
    const result = cli(args, { input: JSON.stringify(payload), cwd: outside });
    assert.equal(result.status, 0, `${args.join(' ')}: ${result.stderr}`);
  }
  assert.deepEqual(fs.readdirSync(outside), [], 'no .aioson/, no aioson-logs/');
});

test.after(() => fs.rmSync(HOME, { recursive: true, force: true }));
