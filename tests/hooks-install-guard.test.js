'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
  buildAntigravityHooks,
  buildClaudeHooks,
  normalizeHookAgentName,
  runHooksInstall,
  runHooksUninstall,
  scrubAntigravityHookFile
} = require('../src/commands/hooks-install');
const {
  configPaths,
  isAiosonHandler,
  isAiosonHookEntry,
  readJsonForMerge
} = require('../src/lib/hook-settings-files');

// A temporary home with the harnesses' own overrides cleared, so nothing here
// ever reads or writes the real ~/.claude, ~/.codex or ~/.config/opencode.
async function withTempHome(fn) {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-guard-home-'));
  const keys = ['HOME', 'USERPROFILE', 'CODEX_HOME', 'CLAUDE_CONFIG_DIR', 'XDG_CONFIG_HOME'];
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  for (const key of keys.slice(2)) delete process.env[key];
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
  // pair/deyvin are retired ids folded into @dev.
  assert.equal(normalizeHookAgentName('@pair'), 'dev');
  assert.equal(normalizeHookAgentName('deyvin'), 'dev');
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

// ─── Corrupted-config guard ──────────────────────────────────────────────────
// Merging over a settings file we could not parse would rewrite it as a
// hooks-only object and destroy every other setting the user keeps there.
// readJsonForMerge is the classifier every merge site consults first.

test('readJsonForMerge treats a missing file as a fresh start', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-hooks-merge-'));
  const result = await readJsonForMerge(path.join(dir, 'does-not-exist.json'));
  assert.deepEqual(result, { data: {}, corrupted: false });
  await fs.rm(dir, { recursive: true, force: true });
});

test('readJsonForMerge parses a valid file', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-hooks-merge-'));
  const file = path.join(dir, 'settings.json');
  await fs.writeFile(file, '{"model":"opus","hooks":{}}', 'utf8');
  const result = await readJsonForMerge(file);
  assert.equal(result.corrupted, false);
  assert.equal(result.data.model, 'opus');
  await fs.rm(dir, { recursive: true, force: true });
});

test('only a command AIOSON generated is AIOSON\'s, and a mixed group is not', () => {
  assert.equal(isAiosonHandler({ command: 'aioson hooks:emit "$PWD" --agent=dev --source=claude 2>/dev/null || true' }), true);
  assert.equal(isAiosonHandler({ command: 'aioson hooks:recap . --agent=dev --source=codex --json 2>nul & exit /b 0' }), true);
  assert.equal(isAiosonHandler({ command: 'npx aioson live:start . --tool=codex --no-launch; python3 ~/notify.py' }), false);
  assert.equal(isAiosonHandler({ command: 'echo remember to run aioson hooks:emit later' }), false);
  assert.equal(isAiosonHookEntry({ hooks: [{ command: 'aioson hooks:emit "$PWD"' }, { command: 'python3 x.py' }] }), false);
});

test('readJsonForMerge: a file that exists but cannot be read is unreadable, never a fresh start', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-hooks-merge-'));
  const result = await readJsonForMerge(dir);
  assert.equal(result.data, null);
  assert.equal(result.unreadable, 'EISDIR');
  await fs.rm(dir, { recursive: true, force: true });
});

test('a settings file another process holds (EBUSY) is left whole: the install skips it with a warning', async () => {
  await withTempHome(async () => {
    const file = configPaths().claude;
    await fs.mkdir(path.dirname(file), { recursive: true });
    const content = { model: 'opus', permissions: { allow: ['Bash(npm test:*)'] }, env: { FOO: '1' } };
    await fs.writeFile(file, JSON.stringify(content, null, 2), 'utf8');
    const original = fs.readFile;
    fs.readFile = async (target, ...rest) => {
      if (path.resolve(String(target)) === path.resolve(file)) {
        const error = new Error('resource busy or locked');
        error.code = 'EBUSY';
        throw error;
      }
      return original.call(fs, target, ...rest);
    };
    const out = captureLogger();
    let result;
    try {
      result = await runHooksInstall({ args: ['.'], options: { tool: 'claude', agent: 'dev' }, logger: out });
    } finally {
      fs.readFile = original;
    }
    assert.equal(result.results[0].skipped, 'unreadable-config');
    assert.ok(out.lines.some((line) => /could not be read \(EBUSY\)/.test(line)), out.lines.join('\n'));
    assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')), content, 'not one setting lost');
  });
});

test('settings files are written next to the target and renamed over it: no partial file, no leftover', async () => {
  await withTempHome(async () => {
    const result = await runHooksInstall({ args: ['.'], options: { tool: 'claude,codex', agent: 'dev' }, logger: captureLogger() });
    assert.equal(result.ok, true);
    for (const file of [configPaths().claude, configPaths().codex]) {
      JSON.parse(await fs.readFile(file, 'utf8'));
      const leftovers = (await fs.readdir(path.dirname(file))).filter((name) => name.endsWith('.tmp'));
      assert.deepEqual(leftovers, [], file);
    }
  });
});

test('readJsonForMerge flags an existing unparseable file as corrupted', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-hooks-merge-'));
  const file = path.join(dir, 'settings.json');
  // trailing comma — the classic hand-edit that must NOT become a rewrite
  await fs.writeFile(file, '{"model":"opus",}', 'utf8');
  const result = await readJsonForMerge(file);
  assert.equal(result.corrupted, true);
  assert.equal(result.data, null);
  await fs.rm(dir, { recursive: true, force: true });
});
