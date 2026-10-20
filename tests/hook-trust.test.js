'use strict';

// Codex runs a hook nobody trusted in its TUI only under
// `--dangerously-bypass-hook-trust`. The sessions AIOSON launches unattended
// (a lane worker, a `live:start` under the unattended flag) get that flag at
// the spawn — only once AIOSON's own hooks are installed and the binary that
// runs lists the flag — while every argv builder keeps the output it had.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { resolveHookTrustArgs, aiosonHooksInstalled, resetHookTrustProbes } = require('../src/lib/hook-trust');
const { runHooksInstall } = require('../src/commands/hooks-install');
const { getToolCapabilities, resolvePermissionModeArgs, resolveSandboxArgs } = require('../src/lib/tool-capabilities');
const codexAdapter = require('../src/agent-execution/adapters/codex');
const { runLiveStart } = require('../src/commands/live');
const { createTranslator } = require('../src/i18n');

const FLAG = '--dangerously-bypass-hook-trust';
const UNATTENDED = '--dangerously-bypass-approvals-and-sandbox';

function captureLogger() {
  const lines = [];
  return { lines, log: (line) => lines.push(String(line)), error: (line) => lines.push(String(line)) };
}

// configPaths() resolves the home per call, so pointing HOME/USERPROFILE at a
// temporary directory — and clearing the harnesses' own overrides — keeps every
// read and write away from the real machine.
const HOME_OVERRIDES = ['CODEX_HOME', 'CLAUDE_CONFIG_DIR', 'XDG_CONFIG_HOME'];
async function withTempHome(fn) {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-hook-trust-home-'));
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
    await fs.rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

async function tempDir(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-hook-trust-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  return dir;
}

function withEnv(t, name, value) {
  const saved = process.env[name];
  process.env[name] = value;
  t.after(() => {
    if (saved === undefined) delete process.env[name];
    else process.env[name] = saved;
  });
}

// A Codex stand-in: `--help` prints a help text that lists the trust flag
// (a current build) or not (an older one), and counts the calls when asked;
// any other invocation records its argv and exits once stdin is done.
function fakeCodexSource(listsFlag) {
  const help = listsFlag
    ? 'Usage: codex [OPTIONS]\\n\\nOptions:\\n  --dangerously-bypass-approvals-and-sandbox\\n  --dangerously-bypass-hook-trust\\n'
    : 'Usage: codex [OPTIONS]\\n\\nOptions:\\n  --dangerously-bypass-approvals-and-sandbox\\n';
  return [
    "'use strict';",
    "const fs = require('node:fs');",
    'const args = process.argv.slice(2);',
    "if (args.includes('--help')) {",
    '  setTimeout(() => {',
    "    if (process.env.AIOSON_TEST_HELP_COUNTER) fs.appendFileSync(process.env.AIOSON_TEST_HELP_COUNTER, 'help\\n');",
    `    process.stdout.write('${help}');`,
    '    process.exit(0);',
    '  }, Number(process.env.AIOSON_TEST_HELP_DELAY_MS || 0));',
    '} else {',
    '  if (process.env.AIOSON_TEST_ARGV_FILE) fs.writeFileSync(process.env.AIOSON_TEST_ARGV_FILE, JSON.stringify(args));',
    "  process.stdin.on('error', () => process.exit(0));",
    "  process.stdin.on('end', () => process.exit(0));",
    '  process.stdin.resume();',
    '  setTimeout(() => process.exit(0), 300);',
    '}',
    ''
  ].join('\n');
}

async function writeFakeScript(dir, name, listsFlag) {
  const file = path.join(dir, name);
  await fs.writeFile(file, fakeCodexSource(listsFlag), 'utf8');
  return file;
}

// The way the resolver of the execution lanes finds a host: an npm `.cmd`
// shim next to its script, read from text, so it works on every OS.
async function writeFakeCodexBin(dir, listsFlag) {
  const binDir = path.join(dir, 'bin');
  await fs.mkdir(binDir, { recursive: true });
  await writeFakeScript(binDir, 'codex.js', listsFlag);
  await fs.writeFile(path.join(binDir, 'codex.cmd'), '@ECHO off\r\n"%~dp0\\node.exe" "%~dp0\\codex.js" %*\r\n', 'utf8');
  return binDir;
}

// The binary `live:start --tool-bin` launches: the same shim on Windows, an
// executable script elsewhere. Named `codex` so the registry recognizes it.
async function writeFakeCodexForLive(dir, listsFlag) {
  if (process.platform === 'win32') {
    const binDir = await writeFakeCodexBin(dir, listsFlag);
    return path.join(binDir, 'codex.cmd');
  }
  const file = path.join(dir, 'codex');
  await fs.writeFile(file, `#!/usr/bin/env node\n${fakeCodexSource(listsFlag)}`, 'utf8');
  await fs.chmod(file, 0o755);
  return file;
}

async function installCodexHooks(dir) {
  const result = await runHooksInstall({ args: [dir], options: { tool: 'codex', agent: 'dev' }, logger: captureLogger() });
  assert.equal(result.ok, true);
}

test('the registry declares the flag for Codex without touching the argv builders', () => {
  assert.deepEqual(getToolCapabilities('codex').hook_trust_args, [FLAG]);
  assert.equal(getToolCapabilities('claude').hook_trust_args, undefined);
  assert.deepEqual(resolvePermissionModeArgs('codex', 'yolo'), [UNATTENDED], 'yolo_args carry no hook-trust flag');
  assert.deepEqual(resolveSandboxArgs('codex', 'workspace-write').args, [UNATTENDED]);
  const built = codexAdapter.build({ mode: 'external', sandbox_mode: 'workspace-write', model: 'gpt-5.6', cwd: process.cwd() });
  assert.ok(!built.args.includes(FLAG), 'build() alone never adds it');
  const trusted = codexAdapter.build({ mode: 'external', sandbox_mode: 'workspace-write', model: 'gpt-5.6', cwd: process.cwd(), hook_trust_args: [FLAG] });
  assert.deepEqual(trusted.args.slice(0, 4), ['exec', '--skip-git-repo-check', UNATTENDED, FLAG], 'next to the unattended flag, before the prompt marker');
  assert.equal(trusted.args.at(-1), '-');
});

test('resolveHookTrustArgs: only an unattended Codex session, with AIOSON hooks installed, on a binary that lists the flag', async (t) => {
  await withTempHome(async (home) => {
    const dir = await tempDir(t);
    const newer = await writeFakeScript(dir, 'codex-new.js', true);
    const older = await writeFakeScript(dir, 'codex-old.js', false);
    const probeFor = (script) => ({ command: process.execPath, args: [script, '--help'] });

    assert.deepEqual(await resolveHookTrustArgs('claude', { probe: probeFor(newer) }), { args: [], reason: 'no_hook_trust' });
    assert.deepEqual(await resolveHookTrustArgs(null, { probe: probeFor(newer) }), { args: [], reason: 'no_hook_trust' }, 'a binary the registry does not know');
    assert.deepEqual(await resolveHookTrustArgs('codex', { unattended: false, probe: probeFor(newer) }), { args: [], reason: 'attended' });
    assert.deepEqual(await resolveHookTrustArgs('codex', { existingArgs: ['--model', 'x', FLAG], probe: probeFor(newer) }), { args: [], reason: 'caller_flag' });
    assert.deepEqual(await resolveHookTrustArgs('codex', { probe: probeFor(newer) }), { args: [], reason: 'hooks_not_installed' }, 'no hook file at all');

    await fs.mkdir(path.join(home, '.codex'), { recursive: true });
    await fs.writeFile(path.join(home, '.codex', 'hooks.json'), JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo mine' }] }] } }), 'utf8');
    assert.equal(aiosonHooksInstalled('codex'), false);
    assert.deepEqual(await resolveHookTrustArgs('codex', { probe: probeFor(newer) }), { args: [], reason: 'hooks_not_installed' }, "the user's own hooks are not ours to vet");

    await installCodexHooks(dir);
    assert.equal(aiosonHooksInstalled('codex'), true);
    assert.deepEqual(await resolveHookTrustArgs('codex', { probe: probeFor(newer) }), { args: [], reason: 'foreign_hooks' },
      'the flag is per invocation: beside ours, the user\'s own unreviewed hook would run under it too');

    await fs.rm(path.join(home, '.codex', 'hooks.json'));
    await installCodexHooks(dir);
    assert.deepEqual(await resolveHookTrustArgs('codex', { probe: probeFor(newer) }), { args: [FLAG], reason: 'added' }, 'AIOSON\'s hooks and nothing else');
    assert.deepEqual(await resolveHookTrustArgs('codex', { probe: probeFor(older) }), { args: [], reason: 'flag_unknown' }, 'an older Codex that would refuse the flag gets none');
    assert.deepEqual(await resolveHookTrustArgs('codex', { probe: { command: path.join(dir, 'missing.exe'), args: ['--help'] } }), { args: [], reason: 'flag_unknown' }, 'a binary that cannot run gets none, and nothing throws');
    assert.deepEqual(await resolveHookTrustArgs('codex', {}), { args: [], reason: 'flag_unknown' }, 'no way to ask the binary, no flag');

    await fs.writeFile(path.join(home, '.codex', 'hooks.json'), '{ not json', 'utf8');
    assert.deepEqual(await resolveHookTrustArgs('codex', { probe: probeFor(newer) }), { args: [], reason: 'hooks_not_installed' }, 'an unreadable hook file counts as none');
  });
});

test('the help of one command line is asked once per process', async (t) => {
  await withTempHome(async () => {
    const dir = await tempDir(t);
    const script = await writeFakeScript(dir, 'codex-counted.js', true);
    const counter = path.join(dir, 'help-calls.txt');
    withEnv(t, 'AIOSON_TEST_HELP_COUNTER', counter);
    await installCodexHooks(dir);
    const probe = { command: process.execPath, args: [script, '--help'] };
    const first = await resolveHookTrustArgs('codex', { probe });
    const second = await resolveHookTrustArgs('codex', { probe });
    assert.equal(first.reason, 'added');
    assert.equal(second.reason, 'added');
    assert.equal((await fs.readFile(counter, 'utf8')).split('\n').filter(Boolean).length, 1);
    resetHookTrustProbes();
    await resolveHookTrustArgs('codex', { probe });
    assert.equal((await fs.readFile(counter, 'utf8')).split('\n').filter(Boolean).length, 2, 'a cleared cache asks again');
  });
});

test('a lane worker spawned by the codex adapter receives the flag, placed next to the unattended flag', async (t) => {
  await withTempHome(async () => {
    const dir = await tempDir(t);
    const binDir = await writeFakeCodexBin(dir, true);
    const argvFile = path.join(dir, 'argv.json');
    withEnv(t, 'AIOSON_TEST_ARGV_FILE', argvFile);
    const input = () => ({
      mode: 'external',
      sandbox_mode: 'workspace-write',
      model: 'gpt-5.6',
      cwd: dir,
      prompt_text: 'hello',
      timeout: 15000,
      resolverOptions: { env: { PATH: binDir, Path: binDir }, platform: 'win32' }
    });

    const before = await codexAdapter.execute(input());
    assert.equal(before.ok, true, JSON.stringify(before));
    const plain = JSON.parse(await fs.readFile(argvFile, 'utf8'));
    assert.ok(plain.includes(UNATTENDED) && !plain.includes(FLAG), `without AIOSON hooks installed: ${plain.join(' ')}`);

    await installCodexHooks(dir);
    const after = await codexAdapter.execute(input());
    assert.equal(after.ok, true, JSON.stringify(after));
    const argv = JSON.parse(await fs.readFile(argvFile, 'utf8'));
    assert.equal(argv.indexOf(FLAG), argv.indexOf(UNATTENDED) + 1, argv.join(' '));
    assert.equal(argv.at(-1), '-');
  });
});

test('live:start adds the flag to an unattended Codex session, says so in the launch block, and leaves an attended one alone', async (t) => {
  await withTempHome(async () => {
    const dir = await tempDir(t);
    const project = path.join(dir, 'project');
    await fs.mkdir(project, { recursive: true });
    const binary = await writeFakeCodexForLive(dir, true);
    const argvFile = path.join(dir, 'argv.json');
    withEnv(t, 'AIOSON_TEST_ARGV_FILE', argvFile);
    await installCodexHooks(project);
    const { t: tr } = createTranslator('en');
    const start = (extra = {}) => runLiveStart({
      args: [project],
      options: { tool: 'codex', 'tool-bin': binary, agent: 'dev', 'no-health-check': true, 'no-health': true, ...extra },
      logger: captureLogger(),
      t: tr
    });

    const unattended = await start();
    assert.equal(unattended.ok, true);
    assert.equal(unattended.childExitCode, 0);
    assert.equal(unattended.launch.host, 'codex');
    assert.equal(unattended.launch.hook_trust, 'added');
    assert.deepEqual(unattended.launch.permission_args, [UNATTENDED], 'the permission decision is unchanged');
    assert.deepEqual(unattended.launch.args, [UNATTENDED, FLAG]);
    assert.deepEqual(JSON.parse(await fs.readFile(argvFile, 'utf8')), [UNATTENDED, FLAG], 'the binary received exactly that');

    const attended = await start({ 'permission-mode': 'default' });
    assert.equal(attended.ok, true);
    assert.equal(attended.launch.hook_trust, 'attended');
    assert.deepEqual(attended.launch.args, []);
    assert.deepEqual(JSON.parse(await fs.readFile(argvFile, 'utf8')), [], 'a session with a human at the terminal trusts through /hooks');

    const approvals = await start({ 'tool-args': '--ask-for-approval on-request --sandbox workspace-write' });
    assert.equal(approvals.launch.hook_trust, 'attended', 'the caller asked for approvals: a human is at the terminal');
    assert.deepEqual(JSON.parse(await fs.readFile(argvFile, 'utf8')), ['--ask-for-approval', 'on-request', '--sandbox', 'workspace-write']);

    const yolo = await start({ 'tool-args': '--yolo' });
    assert.equal(yolo.launch.hook_trust, 'added', 'the caller\'s own bypass alias is still unattended');
    assert.deepEqual(JSON.parse(await fs.readFile(argvFile, 'utf8')), ['--yolo', FLAG]);
  });
});

test('a lane aborted while the binary is being asked for its help is never spawned', async (t) => {
  await withTempHome(async () => {
    const dir = await tempDir(t);
    const binDir = await writeFakeCodexBin(dir, true);
    withEnv(t, 'AIOSON_TEST_HELP_DELAY_MS', '1500');
    await installCodexHooks(dir);
    resetHookTrustProbes();
    const controller = new AbortController();
    let spawned = false;
    const pending = codexAdapter.execute({
      mode: 'external',
      sandbox_mode: 'workspace-write',
      model: 'gpt-5.6',
      cwd: dir,
      prompt_text: 'hello',
      timeout: 15000,
      signal: controller.signal,
      abortReason: 'lease_lost',
      onSpawn: () => { spawned = true; },
      resolverOptions: { env: { PATH: binDir, Path: binDir }, platform: 'win32' }
    });
    setTimeout(() => controller.abort(), 400);
    const result = await pending;
    assert.equal(result.reason, 'lease_lost');
    assert.equal(spawned, false, 'the abort that arrived during the probe is honored before the spawn');
  });
});
