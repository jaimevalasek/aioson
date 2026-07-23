'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { defaults, initManifest, loadManifest } = require('../src/agent-execution/manifest');
const { validateManifest } = require('../src/agent-execution/schema');

// AC-AED-01 AC-AED-02 AC-AED-03 AC-AED-13 AC-AED-15
test('Codex manifest defaults keep DEV/QA on, specialists off, and optional development lanes dormant', () => {
  const manifest = defaults('demo', 'codex');
  assert.equal(validateManifest(manifest, 'demo').ok, true);
  assert.equal(Object.keys(manifest.agents).length, 5);
  assert.equal(manifest.agents.dev.model, 'configured-default');
  assert.ok(Object.values(manifest.agents).every(agent => agent.mode === 'external'));
  assert.ok(Object.values(manifest.agents).every(agent => agent.reasoning_effort === 'medium'));
  assert.equal(manifest.agents.dev.enabled, true);
  assert.equal(manifest.agents.qa.enabled, true);
  assert.equal(manifest.agents.tester.enabled, false);
  assert.equal(manifest.agents.pentester.enabled, false);
  assert.equal(manifest.agents.validator.enabled, false);
  assert.equal(manifest.development_lanes.strategy, 'single');
  assert.equal(manifest.development_lanes.integration_owner, 'dev');
  assert.ok(Object.values(manifest.development_lanes.lanes).every(lane => lane.enabled === false));
  assert.deepEqual(manifest.cycle_limits, { dev_qa: 1, tester: 1, pentester: 1 });
});

test('hosts without reasoning-effort support do not receive an incompatible default', () => {
  const manifest = defaults('demo', 'claude');
  assert.equal(validateManifest(manifest, 'demo').ok, true);
  assert.ok(Object.values(manifest.agents).every(agent => !Object.hasOwn(agent, 'reasoning_effort')));
});

test('validation reports actionable JSON paths', () => {
  const manifest = defaults('demo');
  manifest.host = 'invalid';
  manifest.agents.qa.model = '';
  const result = validateManifest(manifest, 'demo');
  assert.equal(result.ok, false);
  assert.deepEqual(result.errors.map(error => error.path), ['$.host', '$.agents.qa.model']);
});

test('security: model names and fallback names are length bounded before resolution', () => {
  const manifest = defaults('demo');
  manifest.agents.dev.model = 'x'.repeat(201);
  manifest.agents.qa.fallbacks = [{ host: 'codex', model: 'y'.repeat(201) }];
  const result = validateManifest(manifest, 'demo');
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(error => error.path === '$.agents.dev.model'));
  assert.ok(result.errors.some(error => error.path === '$.agents.qa.fallbacks[0].model'));
});

test('split development lanes require explicit enabled scope and valid fallback reasons', () => {
  const manifest = defaults('demo');
  manifest.development_lanes.strategy = 'split';
  manifest.development_lanes.lanes.backend.enabled = true;
  manifest.development_lanes.lanes.backend.write_paths = ['src/api/**', 'tests/api/**'];
  manifest.development_lanes.lanes.backend.fallbacks = [
    { host: 'claude', model: 'configured-default', on: ['unavailable'] }
  ];
  assert.equal(validateManifest(manifest, 'demo').ok, true);
  manifest.development_lanes.lanes.backend.write_paths = [];
  const invalid = validateManifest(manifest, 'demo');
  assert.ok(invalid.errors.some(error => error.path === '$.development_lanes.lanes.backend.write_paths'));
});

test('initialization is create-once and preserves every developer edit byte for byte', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aed-owned-'));
  const made = await initManifest(dir, 'demo', 'codex');
  assert.equal(made.created, true);
  assert.equal(made.unchanged, false);

  const manifest = made.manifest;
  manifest.agents.dev.model = 'gpt-custom';
  manifest.agents.dev.reasoning_effort = 'high';
  manifest.agents.qa.enabled = false;
  delete manifest.agents.tester.reasoning_effort;
  manifest.cycle_limits = { dev_qa: 2, tester: 0, pentester: 2 };
  const developerOwnedBytes = `${JSON.stringify(manifest, null, 4)}\r\n`;
  await fs.writeFile(made.path, developerOwnedBytes, 'utf8');

  const repeated = await initManifest(dir, 'demo', 'claude', {
    cycleLimits: { dev_qa: 9, tester: 9, pentester: 9 }
  });
  assert.equal(repeated.created, false);
  assert.equal(repeated.unchanged, true);
  assert.equal(await fs.readFile(made.path, 'utf8'), developerOwnedBytes);

  const loaded = await loadManifest(dir, 'demo');
  assert.equal(loaded.ok, true);
  assert.equal(loaded.manifest.host, 'codex');
  assert.equal(loaded.manifest.agents.dev.model, 'gpt-custom');
  assert.equal(loaded.manifest.agents.dev.reasoning_effort, 'high');
  assert.equal(loaded.manifest.agents.qa.enabled, false);
  assert.equal(Object.hasOwn(loaded.manifest.agents.tester, 'reasoning_effort'), false);
  assert.deepEqual(loaded.manifest.cycle_limits, { dev_qa: 2, tester: 0, pentester: 2 });
});

// AC-AEMR-01 AC-AEMR-02
test('reasoning effort remains schema-validated after creation', () => {
  const manifest = defaults('demo', 'codex');
  manifest.agents.dev.reasoning_effort = 'extreme';
  const invalid = validateManifest(manifest, 'demo');
  assert.ok(invalid.errors.some(error => error.path === '$.agents.dev.reasoning_effort'));
});

// AC-AED-14
test('missing manifest reports legacy compatibility instead of invalid config', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aed-legacy-'));
  const loaded = await loadManifest(dir, 'legacy');
  assert.equal(loaded.ok, true);
  assert.equal(loaded.exists, false);
  assert.equal(loaded.legacy, true);
});
