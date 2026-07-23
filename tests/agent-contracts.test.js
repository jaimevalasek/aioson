'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { AGENT_DEFINITIONS, MANAGED_FILES, REQUIRED_FILES } = require('../src/constants');

const ROOT = path.resolve(__dirname, '..');
const TEMPLATE = path.join(ROOT, 'template');
const read = (rel) => fs.readFile(path.join(TEMPLATE, rel), 'utf8');

test('template ships every registered agent and the new Planner', async () => {
  for (const agent of AGENT_DEFINITIONS) {
    const content = await read(agent.path);
    assert.ok(content.length > 0, `${agent.id} prompt is missing`);
  }
  assert.ok(AGENT_DEFINITIONS.some((agent) => agent.id === 'planner'));
  assert.ok(MANAGED_FILES.includes('.aioson/agents/planner.md'));
  assert.ok(REQUIRED_FILES.includes('.aioson/agents/planner.md'));
});

test('canonical prompts expose compact decision contracts', async () => {
  for (const name of ['product', 'sheldon', 'planner', 'dev', 'qa']) {
    const content = await read(`.aioson/agents/${name}.md`);
    for (const heading of ['LANGUAGE BOUNDARY', '## Mission', '## Required input', '## Hard constraints']) {
      assert.match(content, new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${name} missing ${heading}`);
    }
    assert.ok(content.length < 14000, `${name} prompt grew beyond the compact kernel budget`);
  }
});

test('the canonical chain has one PRD, one plan, and one QA report', async () => {
  const [product, sheldon, planner, dev, qa] = await Promise.all(
    ['product', 'sheldon', 'planner', 'dev', 'qa'].map((name) => read(`.aioson/agents/${name}.md`))
  );
  assert.match(product, /single product authority|only canonical product\/specification document/i);
  assert.match(sheldon, /same PRD|in place/i);
  assert.match(planner, /exactly one planning artifact/i);
  assert.match(dev, /do not require requirements, spec, architecture/i);
  assert.match(qa, /qa-report-\{slug\}\.md/);
});

test('Planner creates vertical production-path stages from CAP and AC trace', async () => {
  const planner = await read('.aioson/agents/planner.md');
  for (const token of ['Capability Delivery Plan', 'CAP-*', 'AC-*', 'production entry point', 'real UI', 'exact repository-relative paths']) {
    assert.ok(planner.includes(token), `Planner missing ${token}`);
  }
  assert.match(planner, /Next agent: @dev/);
  assert.doesNotMatch(planner, /Next agent: @(analyst|architect|pm|orchestrator)/);
});

test('prototype intent is preserved through Product, Sheldon, Planner, Dev, and QA', async () => {
  for (const name of ['product', 'sheldon', 'planner', 'dev', 'qa']) {
    const content = await read(`.aioson/agents/${name}.md`);
    assert.match(content, /prototype/i, `${name} lost the prototype contract`);
  }
});

test('Dev and QA reject detached mock proof and require the normal app path', async () => {
  const [dev, qa] = await Promise.all([read('.aioson/agents/dev.md'), read('.aioson/agents/qa.md')]);
  assert.match(dev, /detached fixtures|alternate binaries|test-only flags|mocked transports/i);
  assert.match(dev, /default entry point|production entry point/i);
  assert.match(qa, /detached fixture|mock data/i);
  assert.match(qa, /normal production path|normal application entry point/i);
});

test('MICRO, SMALL, and MEDIUM share the same streamlined route with optional Sheldon', async () => {
  const [agents, config, skill] = await Promise.all([
    read('AGENTS.md'),
    read('.aioson/config.md'),
    read('.aioson/skills/process/aioson-spec-driven/SKILL.md')
  ]);
  for (const content of [agents, config, skill]) {
    assert.match(content, /product.*planner.*dev.*qa/is);
  }
  assert.match(config, /classification controls budgets and depth/i);
  assert.match(config, /opt-in|optional/i);
  assert.match(config, /Sheldon.*opt-in|Sheldon.*optional/i);
});

test('QA is a bounded reviewer and never deepens work merely by classification', async () => {
  const [qa, reference] = await Promise.all([
    read('.aioson/agents/qa.md'),
    read('.aioson/skills/process/aioson-spec-driven/references/qa.md')
  ]);
  for (const content of [qa, reference]) {
    assert.match(content, /more than twice|repeat the same failing command or diagnostic more than twice/i);
    assert.match(content, /minimal reproduction.*Dev|return.*reproduction to Dev/i);
    assert.match(content, /not.*classification|never classification-triggered|not a classification/i);
  }
  assert.match(qa, /Small work should normally receive a small verification pass/i);
});

test('canonical prompts never make legacy abstraction artifacts prerequisites', async () => {
  for (const name of ['product', 'sheldon', 'planner', 'dev', 'qa']) {
    const content = await read(`.aioson/agents/${name}.md`);
    assert.match(content, /Never create|Do not require|does not require|never require/i, `${name} must state its legacy-artifact boundary`);
  }
});

test('observability is best-effort and agent:done stays last', async () => {
  for (const name of ['product', 'sheldon', 'planner', 'dev', 'qa']) {
    const content = await read(`.aioson/agents/${name}.md`);
    const done = content.lastIndexOf(`aioson agent:done . --agent=${name}`);
    assert.ok(done > 0, `${name} missing agent:done`);
    assert.equal(content.slice(done).includes('aioson runtime:emit'), false, `${name} emits milestones after done`);
    for (const line of content.split(/\r?\n/).filter((line) => /aioson (runtime:emit|pulse:update|dossier:add-finding)/.test(line))) {
      assert.match(line, /\|\| true$/, `${name} best-effort observability command can block`);
    }
  }
});

test('help and manifests expose Planner as a first-class agent', async () => {
  const [help, manifest, devManifest] = await Promise.all([
    read('.aioson/docs/agent-help.md'),
    read('.aioson/agents/manifests/planner.manifest.json'),
    read('.aioson/agents/manifests/dev.manifest.json')
  ]);
  assert.match(help, /## @planner/);
  assert.equal(JSON.parse(manifest).agent_id, 'planner');
  assert.ok(JSON.parse(devManifest).capabilities.some((capability) => JSON.stringify(capability).includes('implementation-plan-{slug}.md')));
});
