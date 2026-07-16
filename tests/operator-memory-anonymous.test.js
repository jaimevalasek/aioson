'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const CLI = path.resolve(__dirname, '..', 'bin', 'aioson.js');

function runCli(args, { cwd, env }) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, ...args], { cwd, env });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

test('anonymous identity captures evidence but never promotes standing decisions', async (t) => {
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-anonymous-home-'));
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-anonymous-project-'));
  const emptyGitConfig = path.join(homeDir, 'empty.gitconfig');
  await fs.writeFile(emptyGitConfig, '', 'utf8');
  t.after(() => fs.rm(homeDir, { recursive: true, force: true }));
  t.after(() => fs.rm(projectDir, { recursive: true, force: true }));

  const env = { ...process.env };
  delete env.AIOSON_OPERATOR_ID;
  Object.assign(env, {
    HOME: homeDir,
    USERPROFILE: homeDir,
    XDG_CONFIG_HOME: homeDir,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: emptyGitConfig
  });

  const captureArgs = [
    'op:capture',
    '--signal=authorization',
    '--quote=always do this',
    '--proposal=always keep anonymous memory isolated',
    '--source-agent=test',
    '--json'
  ];
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const cli = await runCli(captureArgs, { cwd: projectDir, env });
    assert.equal(cli.code, 0, cli.stderr);
    const payload = JSON.parse(cli.stdout);
    assert.equal(payload.identity, '_anonymous');
    assert.equal(payload.promoted, false);
    assert.equal(payload.reason, 'identity_unresolved');
    assert.equal(payload.detected_count, attempt);
  }

  const active = await runCli(['op:list', '--json'], { cwd: projectDir, env });
  assert.equal(JSON.parse(active.stdout).count, 0);
  const proposals = await runCli(['op:list', '--proposals', '--json'], { cwd: projectDir, env });
  assert.equal(JSON.parse(proposals.stdout).count, 1);
});
