'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  readAgentManifest,
  canAgentPerform,
  buildAgentCapabilitySummary,
  supportsTool
} = require('../src/agent-manifests');

const projectRoot = path.resolve(__dirname, '..');

test('readAgentManifest loads the dev manifest from the workspace', async () => {
  const manifest = await readAgentManifest(projectRoot, 'dev');
  assert.equal(Boolean(manifest), true);
  assert.equal(manifest.agent_id, 'dev');
  assert.equal(Array.isArray(manifest.capabilities), true);
});

test('agent manifest helpers expose declared capabilities and tool support', async () => {
  const manifest = await readAgentManifest(projectRoot, 'dev');
  assert.equal(canAgentPerform(manifest, 'implement_feature'), true);
  assert.equal(supportsTool(manifest, 'codex'), true);

  const summary = buildAgentCapabilitySummary(manifest, 'codex');
  assert.match(summary, /implement_feature/);
  assert.match(summary, /refactor_code/);
});

test('resolveAgentCapabilities returns empty array when manifest has no capabilities array', async () => {
  const { resolveAgentCapabilities } = require('../src/agent-manifests');
  const os = require('node:os');
  const fs = require('node:fs/promises');

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-manifest-'));
  await fs.mkdir(path.join(dir, '.aioson/agents/manifests'), { recursive: true });
  await fs.writeFile(
    path.join(dir, '.aioson/agents/manifests/mock.manifest.json'),
    JSON.stringify({ agent_id: 'mock', version: '1.0' }),
    'utf8'
  );

  const caps = await resolveAgentCapabilities(dir, 'mock');
  assert.deepEqual(caps, []);
});

test('readAgentManifest returns null for unknown agent without crashing', async () => {
  const manifest = await readAgentManifest(projectRoot, 'nonexistent-agent-xyz');
  assert.equal(manifest, null);
});

test('scope-check manifest exposes validated check_modes', async () => {
  const manifest = await readAgentManifest(projectRoot, 'scope-check');
  assert.equal(Boolean(manifest), true);
  assert.deepEqual(manifest.check_modes, ['pre-dev', 'post-dev', 'post-fix', 'final']);
});

test('sanitizeManifest filters out unknown check_modes so the field cannot drift', async () => {
  const { readAgentManifest: read } = require('../src/agent-manifests');
  const os = require('node:os');
  const fs = require('node:fs/promises');

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-manifest-modes-'));
  await fs.mkdir(path.join(dir, '.aioson/agents/manifests'), { recursive: true });
  await fs.writeFile(
    path.join(dir, '.aioson/agents/manifests/scope-check.manifest.json'),
    JSON.stringify({
      agent_id: 'scope-check',
      version: '1.0',
      check_modes: ['pre-dev', 'made-up-mode', 'post-fix']
    }),
    'utf8'
  );

  const manifest = await read(dir, 'scope-check');
  assert.deepEqual(manifest.check_modes, ['pre-dev', 'post-fix']); // 'made-up-mode' dropped
});
