'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createTranslator } = require('../src/i18n');
const { runInit } = require('../src/commands/init');
const hooksInstall = require('../src/commands/hooks-install');

async function makeTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-init-hooks-'));
}

function createCollectLogger() {
  const lines = [];
  return {
    lines,
    log(line) {
      lines.push(String(line));
    },
    error(line) {
      lines.push(String(line));
    }
  };
}

// runInit calls hooksInstall.runHooksInstall through the module namespace so
// it can be stubbed here — the real thing writes machine-global settings.
function stubHooksInstall(impl) {
  const original = hooksInstall.runHooksInstall;
  hooksInstall.runHooksInstall = impl;
  return () => {
    hooksInstall.runHooksInstall = original;
  };
}

test('init installs hooks by default and forwards the project dir and tool', async () => {
  const tempDir = await makeTempDir();
  const originalCwd = process.cwd();
  process.chdir(tempDir);

  const calls = [];
  const restore = stubHooksInstall(async (payload) => {
    calls.push(payload);
    return { ok: true, results: [{ tool: 'claude' }], agentName: 'dev', dryRun: false };
  });

  try {
    const { t } = createTranslator('en');
    const result = await runInit({
      args: ['demo-hooks'],
      options: { tool: 'claude' },
      logger: createCollectLogger(),
      t
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].args[0], path.join(tempDir, 'demo-hooks'));
    assert.equal(calls[0].options.tool, 'claude');
    assert.equal(result.hooksInstall.ok, true);
  } finally {
    restore();
    process.chdir(originalCwd);
  }
});

test('every init tool has its own hooks installer now; a tool without one falls back to auto-detection', async () => {
  const tempDir = await makeTempDir();
  const originalCwd = process.cwd();
  process.chdir(tempDir);

  const calls = [];
  const restore = stubHooksInstall(async (payload) => {
    calls.push(payload);
    return { ok: true, results: [], agentName: 'dev', dryRun: false };
  });

  try {
    const { t } = createTranslator('en');
    // opencode used to be prompt-only; its plugin adapter makes it a hooks target.
    await runInit({
      args: ['demo-detect'],
      options: { tool: 'opencode' },
      logger: createCollectLogger(),
      t
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.tool, 'opencode');

    // A prompt-only host still resolves to machine auto-detection.
    await hooksInstall.installDefaultHooks({ targetDir: tempDir, options: { tool: 'cursor' }, logger: createCollectLogger(), t });
    assert.equal(calls.length, 2);
    assert.equal(calls[1].options.tool, 'all');
  } finally {
    restore();
    process.chdir(originalCwd);
  }
});

test('--no-hooks skips the install and says how to run it later', async () => {
  const tempDir = await makeTempDir();
  const originalCwd = process.cwd();
  process.chdir(tempDir);

  const calls = [];
  const restore = stubHooksInstall(async (payload) => {
    calls.push(payload);
    return { ok: true };
  });

  try {
    const { t } = createTranslator('en');
    const logger = createCollectLogger();
    const result = await runInit({
      args: ['demo-skip'],
      options: { 'no-hooks': true },
      logger,
      t
    });

    assert.equal(calls.length, 0);
    assert.equal(result.hooksInstall, null);
    assert.equal(
      logger.lines.some((line) => line.includes('aioson hooks:install')),
      true
    );
  } finally {
    restore();
    process.chdir(originalCwd);
  }
});

test('a default reinstall (init/install/update) keeps the agent and the guard agent already installed', async () => {
  const home = await makeTempDir();
  const keys = ['HOME', 'USERPROFILE', 'CODEX_HOME', 'CLAUDE_CONFIG_DIR', 'XDG_CONFIG_HOME'];
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  for (const key of keys.slice(2)) delete process.env[key];
  try {
    const { t } = createTranslator('en');
    await fs.mkdir(path.join(home, '.claude'), { recursive: true });
    await fs.mkdir(path.join(home, '.codex'), { recursive: true });
    await hooksInstall.runHooksInstall({ args: [home], options: { tool: 'claude,codex', agent: 'qa' }, logger: createCollectLogger() });
    await hooksInstall.installDefaultHooks({ targetDir: home, options: {}, logger: createCollectLogger(), t });

    const codex = JSON.parse(await fs.readFile(path.join(home, '.codex', 'hooks.json'), 'utf8'));
    assert.match(codex.hooks.PostToolUse[0].hooks[0].command, /--agent='qa'/, 'a reset to dev would also void the trust Codex keeps per hook');
    const claude = JSON.parse(await fs.readFile(path.join(home, '.claude', 'settings.json'), 'utf8'));
    assert.match(claude.hooks.PostToolUse[0].hooks[0].command, /--agent='qa'/);
    assert.match(claude.hooks.PreToolUse[0].hooks[0].command, /context:guard .*--agent='qa'/, 'the guard agent chosen at install stays');
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await fs.rm(home, { recursive: true, force: true });
  }
});

test('a hooks failure is reported but never fails the init', async () => {
  const tempDir = await makeTempDir();
  const originalCwd = process.cwd();
  process.chdir(tempDir);

  const restore = stubHooksInstall(async () => {
    throw new Error('settings file locked');
  });

  try {
    const { t } = createTranslator('en');
    const logger = createCollectLogger();
    const result = await runInit({
      args: ['demo-fail'],
      options: {},
      logger,
      t
    });

    assert.equal(result.ok, true);
    assert.equal(result.hooksInstall.ok, false);
    assert.equal(result.hooksInstall.error, 'settings file locked');
    assert.equal(
      logger.lines.some((line) => line.includes('settings file locked')),
      true
    );
  } finally {
    restore();
    process.chdir(originalCwd);
  }
});
