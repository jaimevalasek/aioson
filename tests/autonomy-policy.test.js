'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  readAutonomyProtocol,
  getToolPolicy,
  getAgentMaxMode,
  resolveEffectiveMode,
  isCommandAllowed,
  canRunHeadless
} = require('../src/autonomy-policy');

async function makeTmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-autonomy-'));
}

test('autonomy policy defaults to guarded when protocol file is missing', async () => {
  const dir = await makeTmpDir();
  const protocol = await readAutonomyProtocol(dir);
  const toolPolicy = getToolPolicy(protocol, 'codex');

  assert.equal(protocol.global_mode, 'guarded');
  assert.equal(toolPolicy.mode, 'guarded');
  assert.equal(toolPolicy.requires_tty, true);
  assert.equal(canRunHeadless(toolPolicy), false);
});

test('resolveEffectiveMode clamps requested mode by tool and agent limits', () => {
  // SF-project-16: manifest cannot widen the agent ceiling above global_mode.
  // With global_mode=guarded, a manifest claiming [guarded, trusted] is
  // capped at guarded — both getAgentMaxMode and resolveEffectiveMode reflect
  // the cap.
  const protocol = {
    version: '1.0',
    global_mode: 'guarded',
    tools: {
      codex: { mode: 'trusted', requires_tty: false }
    },
    agents: {}
  };
  const manifest = {
    autonomy_modes: ['guarded', 'trusted']
  };

  const effective = resolveEffectiveMode({
    protocol,
    tool: 'codex',
    agentId: 'dev',
    manifest,
    requestedMode: 'headless'
  });

  assert.equal(getAgentMaxMode(protocol, 'dev', manifest), 'guarded');
  assert.equal(effective, 'guarded');
});

test('resolveEffectiveMode allows manifest to claim mode up to global ceiling', () => {
  // When global_mode permits, manifest can declare any mode at or below it.
  const protocol = {
    version: '1.0',
    global_mode: 'headless',
    tools: {
      codex: { mode: 'trusted', requires_tty: false }
    },
    agents: {}
  };
  const manifest = { autonomy_modes: ['guarded', 'trusted'] };

  // agent ceiling = min(manifest most-permissive=trusted, global=headless) = trusted
  assert.equal(getAgentMaxMode(protocol, 'dev', manifest), 'trusted');

  // effective = min(tool=trusted, agent=trusted, requested=headless) = trusted
  const effective = resolveEffectiveMode({
    protocol,
    tool: 'codex',
    agentId: 'dev',
    manifest,
    requestedMode: 'headless'
  });
  assert.equal(effective, 'trusted');
});

test('isCommandAllowed honors blacklist before whitelist', () => {
  const policy = {
    shell_whitelist: ['git *', 'aioson *'],
    shell_blacklist: ['git reset *']
  };

  assert.equal(isCommandAllowed(policy, 'shell', 'git status'), true);
  assert.equal(isCommandAllowed(policy, 'shell', 'git reset --hard'), false);
  assert.equal(isCommandAllowed(policy, 'shell', 'npm test'), false);
});
