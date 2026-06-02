'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { installTemplate, readInstallProfile } = require('../src/installer');

async function makeTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-profile-'));
}

async function fileExists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

// Profile claude+development: tool-specific non-claude files excluded
test('installTemplate with claude+development profile skips AGENTS.md and OPENCODE.md', async () => {
  const dir = await makeTempDir();
  const profile = { tools: ['claude'], uses: ['development'] };

  const result = await installTemplate(dir, {
    mode: 'install',
    installProfile: profile
  });

  assert.equal(result.copied.includes('AGENTS.md'), false);
  assert.equal(result.copied.includes('OPENCODE.md'), false);
  assert.equal(await fileExists(path.join(dir, 'AGENTS.md')), false);
  assert.equal(await fileExists(path.join(dir, 'OPENCODE.md')), false);
  assert.equal(await fileExists(path.join(dir, 'CLAUDE.md')), true);
});

test('installTemplate with claude+development profile skips squad agent', async () => {
  const dir = await makeTempDir();
  const profile = { tools: ['claude'], uses: ['development'] };

  const result = await installTemplate(dir, {
    mode: 'install',
    installProfile: profile
  });

  const squadAgent = result.copied.find(f => f === '.aioson/agents/squad.md');
  assert.equal(squadAgent, undefined);
  assert.equal(await fileExists(path.join(dir, '.aioson/agents/squad.md')), false);
});

test('installTemplate with claude+development profile copies core dev agent setup.md', async () => {
  const dir = await makeTempDir();
  const profile = { tools: ['claude'], uses: ['development'] };

  const result = await installTemplate(dir, {
    mode: 'install',
    installProfile: profile
  });

  assert.equal(result.copied.includes('.aioson/agents/setup.md'), true);
});

test('installTemplate with development+squads profile copies squad.md', async () => {
  const dir = await makeTempDir();
  const profile = { tools: ['claude'], uses: ['development', 'squads'] };

  await installTemplate(dir, {
    mode: 'install',
    installProfile: profile
  });

  assert.equal(await fileExists(path.join(dir, '.aioson/agents/squad.md')), true);
});

// null profile → copies everything (current behavior)
test('installTemplate with null profile copies all tool files', async () => {
  const dir = await makeTempDir();

  await installTemplate(dir, {
    mode: 'install',
    installProfile: null
  });

  assert.equal(await fileExists(path.join(dir, 'CLAUDE.md')), true);
  assert.equal(await fileExists(path.join(dir, 'AGENTS.md')), true);
});

// install_profile saved in install.json
test('installTemplate saves install_profile in install.json', async () => {
  const dir = await makeTempDir();
  const profile = { tools: ['claude'], uses: ['development'] };

  await installTemplate(dir, {
    mode: 'install',
    installProfile: profile
  });

  const saved = await readInstallProfile(dir);
  assert.deepEqual(saved, profile);
});

// readInstallProfile returns null if no install.json
test('readInstallProfile returns null when no install.json exists', async () => {
  const dir = await makeTempDir();
  const result = await readInstallProfile(dir);
  assert.equal(result, null);
});

// readInstallProfile returns null when install_profile is missing from metadata
test('readInstallProfile returns null when install_profile not in metadata', async () => {
  const dir = await makeTempDir();
  // Install without profile
  await installTemplate(dir, { mode: 'install', installProfile: null });
  const result = await readInstallProfile(dir);
  assert.equal(result, null);
});

// .aioson/config.md always installed even with strict profile
test('installTemplate always installs .aioson/config.md regardless of profile', async () => {
  const dir = await makeTempDir();
  const profile = { tools: ['opencode'], uses: ['development'] };

  await installTemplate(dir, {
    mode: 'install',
    installProfile: profile
  });

  assert.equal(await fileExists(path.join(dir, '.aioson/config.md')), true);
});

// onProgress callback called during copy
test('installTemplate calls onProgress during file copy', async () => {
  const dir = await makeTempDir();
  const progress = [];

  await installTemplate(dir, {
    mode: 'install',
    installProfile: null,
    onProgress: (p) => progress.push(p)
  });

  assert.ok(progress.length > 0);
  assert.ok(progress[0].total > 0);
  assert.ok(typeof progress[0].file === 'string');
});
