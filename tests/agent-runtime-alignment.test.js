'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { AGENT_DEFINITIONS } = require('../src/constants');

const ROOT = path.resolve(__dirname, '..');

async function read(relPath) {
  return fs.readFile(path.join(ROOT, relPath), 'utf8');
}

test('ux-ui is an optional interaction specialist without a Gate B document', async () => {
  const prompt = await read('template/.aioson/agents/ux-ui.md');

  const checks = [
    'Resolve one named interaction',
    'UX/UI is optional for every classification',
    'prototype evidence',
    'Never create a mandatory `ui-spec`',
    'Return to `@product`',
    'Return to `@product` for behavior/scope or `@planner`'
  ];

  for (const token of checks) {
    assert.equal(prompt.includes(token), true, `missing ux-ui runtime-alignment token: ${token}`);
  }
});

test('pm prompt and manifest expose bounded advice without plan ownership', async () => {
  const prompt = await read('template/.aioson/agents/pm.md');
  const manifest = JSON.parse(await read('template/.aioson/agents/manifests/pm.manifest.json'));
  const pm = AGENT_DEFINITIONS.find((agent) => agent.id === 'pm');

  const promptChecks = [
    'opt-in prioritization and release advisor',
    'PM is never activated by MICRO, SMALL, or MEDIUM classification alone',
    '`@planner` is the sole owner of `implementation-plan-{slug}.md` and Gate C',
    'Do not turn advice into another mandatory workflow stage'
  ];

  for (const token of promptChecks) {
    assert.equal(prompt.includes(token), true, `missing pm runtime-alignment token: ${token}`);
  }

  assert.equal(pm.dependsOn.some((dep) => dep.includes('implementation-plan')), true);
  assert.deepEqual(manifest.capabilities[0].outputs, []);
});

test('orchestrator coordinates only justified plan phases without a spec package', async () => {
  const prompt = await read('template/.aioson/agents/orchestrator.md');
  const manifest = JSON.parse(await read('template/.aioson/agents/manifests/orchestrator.manifest.json'));
  const orchestrator = AGENT_DEFINITIONS.find((agent) => agent.id === 'orchestrator');

  const promptChecks = [
    'explicitly requested parallel or cross-cutting execution problem',
    'Give each lane explicit file ownership',
    'Use specialists only for a concrete trigger',
    'do not create a second plan or spec package',
    'Never activate because a feature is MEDIUM'
  ];

  for (const token of promptChecks) {
    assert.equal(prompt.includes(token), true, `missing orchestrator runtime-alignment token: ${token}`);
  }

  assert.equal(orchestrator.dependsOn.some((dep) => dep.includes('project.context.md')), true);
  assert.equal(orchestrator.dependsOn.some((dep) => dep.includes('implementation-plan')), true);
  assert.deepEqual(manifest.capabilities[0].outputs, []);
});
