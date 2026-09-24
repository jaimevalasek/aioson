'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { AGENT_DEFINITIONS } = require('../src/constants');
const { canonicalAgentId } = require('../src/agents');

const ROOT = path.resolve(__dirname, '..');

async function read(relPath) {
  return fs.readFile(path.join(ROOT, relPath), 'utf8');
}

async function assertRetired(id, absorber) {
  for (const relPath of [
    `template/.aioson/agents/${id}.md`,
    `template/.aioson/agents/manifests/${id}.manifest.json`
  ]) {
    await assert.rejects(fs.access(path.join(ROOT, relPath)), `retired ${id} still ships ${relPath}`);
  }
  assert.equal(AGENT_DEFINITIONS.some((agent) => agent.id === id), false, `retired ${id} still defined`);
  const owner = AGENT_DEFINITIONS.find((agent) => agent.id === absorber);
  assert.ok(owner.retiredIds.includes(id), `${absorber} does not declare retired ${id}`);
  assert.equal(canonicalAgentId(id), absorber);
  return owner;
}

test('retired ux-ui is absorbed by product, which keeps the prototype contract', async () => {
  await assertRetired('ux-ui', 'product');
  const prompt = await read('template/.aioson/agents/product.md');
  assert.equal(prompt.includes('## Prototype contract'), true, 'product lost the prototype contract it absorbed');
});

test('retired pm is absorbed by planner, the sole owner of the implementation plan', async () => {
  const planner = await assertRetired('pm', 'planner');
  // The plan has exactly one owner now: the absorber, never an advisor stage.
  assert.equal(planner.output.includes('implementation-plan'), true);
  const owners = AGENT_DEFINITIONS.filter((agent) => /implementation-plan/.test(agent.output || ''));
  assert.deepEqual(owners.map((agent) => agent.id), ['planner']);
});

test('orchestrator coordinates only justified plan phases without a spec package', async () => {
  const prompt = await read('template/.aioson/agents/orchestrator.md');
  const manifest = JSON.parse(await read('template/.aioson/agents/manifests/orchestrator.manifest.json'));
  const orchestrator = AGENT_DEFINITIONS.find((agent) => agent.id === 'orchestrator');

  const promptChecks = [
    'explicitly requested parallel or cross-cutting execution problem',
    // Ownership/conflicts/ledger are engine-materialized since the token-economy
    // wave: assign writes the ownership map, guard refuses conflicts, status is
    // the ledger. The invariant (explicit disjoint ownership per lane) survives
    // as the reviewed orchestrator:assign map.
    'orchestrator:assign',
    'orchestrator:guard',
    'orchestrator:status',
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
