'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsPromises = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const CLI_PATH = path.join(ROOT, 'bin', 'aioson.js');

function runCli(args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI_PATH, ...args], {
      cwd: options.cwd || ROOT,
      env: { ...process.env, ...(options.env || {}) }
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

test('every exact CLI dispatch is registered once for central JSON output', () => {
  const source = fs.readFileSync(path.join(ROOT, 'src', 'cli.js'), 'utf8');
  const setMatch = source.match(/const JSON_SUPPORTED_COMMANDS = new Set\(\[([\s\S]*?)\]\);/);
  assert.ok(setMatch, 'JSON_SUPPORTED_COMMANDS declaration missing');

  const entries = [...setMatch[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
  const counts = new Map();
  for (const entry of entries) counts.set(entry, (counts.get(entry) || 0) + 1);
  assert.deepEqual(
    [...counts].filter(([, count]) => count > 1),
    [],
    'JSON command registry contains duplicate entries'
  );

  const dispatchStart = source.indexOf('let result = null');
  const dispatchEnd = source.lastIndexOf('} catch (error)');
  assert.notEqual(dispatchStart, -1);
  assert.notEqual(dispatchEnd, -1);
  const dispatch = source.slice(dispatchStart, dispatchEnd);
  const exactCommands = new Set(
    [...dispatch.matchAll(/command\s*===\s*'([^']+)'/g)].map((match) => match[1])
  );
  const registered = new Set(entries);
  const missing = [...exactCommands].filter((command) => !registered.has(command)).sort();
  assert.deepEqual(missing, []);

  const aliasesMissing = [...exactCommands]
    .filter((command) => command.includes(':'))
    .filter((command) => !exactCommands.has(command.replace(/:/g, '-')))
    .sort();
  assert.deepEqual(aliasesMissing, [], 'colon commands must keep the documented dash alias convention');
});

test('recent command families emit one parseable JSON document', async (t) => {
  const projectDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'aioson-cli-json-'));
  t.after(() => fsPromises.rm(projectDir, { recursive: true, force: true }));

  const cases = [
    ['workflow:harden', projectDir, '--dry-run', '--json'],
    ['workflow:heal', projectDir, '--json'],
    ['backup:local', projectDir, '--json'],
    ['devlog:sync', projectDir, '--json'],
    ['runtime:prune', projectDir, '--older-than=bad', '--json'],
    ['briefing:approve', projectDir, '--slug=missing', '--json'],
    ['briefing:unapprove', projectDir, '--slug=missing', '--json']
  ];

  for (const args of cases) {
    const cli = await runCli(args);
    assert.doesNotThrow(
      () => JSON.parse(cli.stdout),
      `${args[0]} did not emit parseable JSON; stderr=${cli.stderr}`
    );
    assert.equal(cli.stderr, '', `${args[0]} leaked human-readable stderr in JSON mode`);
  }
});

test('tool:capabilities keeps its bare machine-readable payload', async () => {
  const cli = await runCli(['tool:capabilities', '--json']);
  assert.equal(cli.code, 0, cli.stderr);
  const payload = JSON.parse(cli.stdout);
  assert.equal(typeof payload.tools, 'object');
  assert.equal(payload.schema_version, 2);
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'payload'), false);
});

test('human-mode command failures return a non-zero exit code', async (t) => {
  const projectDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'aioson-cli-exit-'));
  t.after(() => fsPromises.rm(projectDir, { recursive: true, force: true }));

  const cli = await runCli(['workflow:heal', projectDir]);
  assert.equal(cli.code, 1);
  assert.match(cli.stderr, /--stage=<agent> is required/);
});

test('operator-memory commands expose dedicated, side-effect-free help', async (t) => {
  const homeDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'aioson-op-help-home-'));
  const projectDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'aioson-op-help-project-'));
  t.after(() => fsPromises.rm(homeDir, { recursive: true, force: true }));
  t.after(() => fsPromises.rm(projectDir, { recursive: true, force: true }));
  const env = {
    HOME: homeDir,
    USERPROFILE: homeDir,
    AIOSON_OPERATOR_ID: 'audit-help-user'
  };

  const commands = [
    'op:identity', 'op:capture', 'op:promote', 'op:forget',
    'op:list', 'op:show', 'op:reinforce', 'op:migrate'
  ];
  for (const command of commands) {
    const cli = await runCli([command, '--help', '--json'], { cwd: projectDir, env });
    assert.equal(cli.code, 0, `${command}: ${cli.stderr}`);
    assert.equal(JSON.parse(cli.stdout).ok, true, command);
  }

  const human = await runCli(['op:capture', '--help'], { cwd: projectDir, env });
  assert.match(human.stdout, /^op:capture —/);
  assert.doesNotMatch(human.stdout, /AIOSON CLI/);
  await assert.rejects(fsPromises.access(path.join(homeDir, '.aioson')));
});

test('commands with localized usage expose focused --help without executing', async (t) => {
  const projectDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'aioson-command-help-'));
  t.after(() => fsPromises.rm(projectDir, { recursive: true, force: true }));

  const cli = await runCli(['memory:trim', projectDir, '--help', '--json']);
  assert.equal(cli.code, 0, cli.stderr);
  const payload = JSON.parse(cli.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.command, 'memory:trim');
  assert.match(payload.usage, /^aioson memory:trim/);
  await assert.rejects(fsPromises.access(path.join(projectDir, '.aioson')));
});

test('a command-specific --version value is not hijacked by the CLI version shortcut', async () => {
  const cli = await runCli(['not-a-command', '--version=1.2.3', '--json']);
  assert.equal(cli.code, 1);
  const payload = JSON.parse(cli.stdout);
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, 'unknown_command');
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'version'), false);

  const versionCli = await runCli(['--version', '--json']);
  assert.equal(versionCli.code, 0);
  assert.equal(typeof JSON.parse(versionCli.stdout).version, 'string');
});
