'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

async function makeTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-rtperm-'));
}

// ─── SF-project-15 — sandbox enforces shell_whitelist/blacklist when policy is supplied ──

test('SF-15: executeInSandbox refuses commands not in shell_whitelist when policy is supplied', async () => {
  const { executeInSandbox } = require('../src/sandbox');
  const policy = {
    shell_whitelist: ['echo *'],
    shell_blacklist: [],
    aioson_whitelist: [],
    requires_tty: false
  };

  const result = await executeInSandbox('rm -rf /tmp/aioson-pwn-15', { policy, timeout: 1000 });
  assert.equal(result.ok, false);
  assert.equal(result.refusedByPolicy, true);
  assert.match(result.stderr, /autonomy-policy.*refused/);
});

test('SF-15: executeInSandbox refuses commands matching shell_blacklist', async () => {
  const { executeInSandbox } = require('../src/sandbox');
  const policy = {
    shell_whitelist: [],
    shell_blacklist: ['rm *'],
    aioson_whitelist: [],
    requires_tty: false
  };

  const result = await executeInSandbox('rm -rf /tmp/whatever', { policy, timeout: 1000 });
  assert.equal(result.refusedByPolicy, true);
});

test('SF-15: executeInSandbox runs allowed commands when policy permits', async () => {
  const { executeInSandbox } = require('../src/sandbox');
  const policy = {
    shell_whitelist: ['echo *'],
    shell_blacklist: [],
    aioson_whitelist: [],
    requires_tty: false
  };

  const result = await executeInSandbox('echo aioson-allowed', { policy, timeout: 5000 });
  assert.equal(result.ok, true);
  assert.match(result.stdout, /aioson-allowed/);
});

test('SF-15: executeInSandbox runs without policy (back-compat) — opts.policy absent', async () => {
  const { executeInSandbox } = require('../src/sandbox');
  const result = await executeInSandbox('echo back-compat', { timeout: 5000 });
  assert.equal(result.ok, true);
  assert.match(result.stdout, /back-compat/);
});

// ─── SF-project-16 — manifest hardening ───────────────────────────────────────

test('SF-16: readAgentManifest refuses non-canonical agent ids', async () => {
  const { readAgentManifest } = require('../src/agent-manifests');
  const dir = await makeTempDir();
  const manifestsDir = path.join(dir, '.aioson/agents/manifests');
  await fs.mkdir(manifestsDir, { recursive: true });
  // Plant a manifest for a non-canonical id.
  await fs.writeFile(
    path.join(manifestsDir, 'totally-fake-agent.manifest.json'),
    JSON.stringify({ autonomy_modes: ['headless'] }),
    'utf8'
  );

  const result = await readAgentManifest(dir, 'totally-fake-agent');
  assert.equal(result, null, 'non-canonical agent id must be refused before disk read');
});

test('SF-16: readAgentManifest filters unknown autonomy_modes from manifest', async () => {
  const { readAgentManifest } = require('../src/agent-manifests');
  const dir = await makeTempDir();
  const manifestsDir = path.join(dir, '.aioson/agents/manifests');
  await fs.mkdir(manifestsDir, { recursive: true });
  // dev is canonical; but the modes contain a forged "godmode" string.
  await fs.writeFile(
    path.join(manifestsDir, 'dev.manifest.json'),
    JSON.stringify({ autonomy_modes: ['guarded', 'godmode', 'trusted'], capabilities: [] }),
    'utf8'
  );

  const result = await readAgentManifest(dir, 'dev');
  assert.deepEqual(result.autonomy_modes, ['guarded', 'trusted'], 'unknown modes must be filtered out');
});

test('SF-16: getAgentMaxMode caps manifest-declared modes at protocol global_mode', () => {
  const { getAgentMaxMode } = require('../src/autonomy-policy');
  const protocol = { version: '1.0', global_mode: 'guarded', tools: {}, agents: {} };
  // Forged manifest claiming the most permissive mode.
  const forgedManifest = { autonomy_modes: ['headless'] };

  const result = getAgentMaxMode(protocol, 'dev', forgedManifest);
  assert.equal(result, 'guarded', 'manifest cannot widen the autonomy ceiling beyond global_mode');
});

test('SF-16: getAgentMaxMode honors per-agent policy override above manifest', () => {
  const { getAgentMaxMode } = require('../src/autonomy-policy');
  const protocol = {
    version: '1.0',
    global_mode: 'trusted',
    tools: {},
    agents: { committer: { max_mode: 'guarded' } }
  };
  // Manifest claims headless, but agent-policy override pins committer at guarded.
  const result = getAgentMaxMode(protocol, 'committer', { autonomy_modes: ['headless'] });
  assert.equal(result, 'guarded');
});
