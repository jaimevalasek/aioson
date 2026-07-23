'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { validateHandoffContract } = require('../src/handoff-contract');

async function makeTmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-orchestrator-contract-'));
}

async function writeFile(dir, relPath, content) {
  const full = path.join(dir, relPath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, 'utf8');
}

async function writeBase(dir, classification = 'MEDIUM') {
  await writeFile(dir, '.aioson/context/project.context.md', `---\nclassification: "${classification}"\n---\n# Project\n`);
  await writeFile(dir, '.aioson/context/project-pulse.md', '# Pulse\n');
}

function optionalCoordinatorState(slug, classification = 'MEDIUM') {
  return {
    mode: 'feature',
    featureSlug: slug,
    classification,
    sequence: ['product', 'planner', 'orchestrator', 'dev', 'qa']
  };
}

test('orchestrator handoff owns no specification package or gate', async () => {
  const dir = await makeTmpDir();
  const slug = 'bounded-coordination';
  await writeBase(dir);

  const result = await validateHandoffContract(dir, optionalCoordinatorState(slug), 'orchestrator');

  assert.equal(result.ok, true, JSON.stringify(result.missing));
  assert.equal(result.missing.some((item) => /requirements-|spec-|architecture|design-doc|readiness|gate [ABC]/i.test(item)), false);
});

test('orchestrator handoff does not invent a harness requirement for a runtime feature', async () => {
  const dir = await makeTmpDir();
  const slug = 'runtime-coordination';
  await writeBase(dir);
  await writeFile(dir, `.aioson/briefings/${slug}/prototype-manifest.md`, '# Core interactions\n');

  const result = await validateHandoffContract(dir, optionalCoordinatorState(slug), 'orchestrator');

  assert.equal(result.ok, true, JSON.stringify(result.missing));
  assert.equal(result.missing.some((item) => item.includes('harness') || item.includes('runtime_contract')), false);
});

test('orchestrator remains nonblocking when canonical PRD and plan are already present', async () => {
  const dir = await makeTmpDir();
  const slug = 'canonical-coordination';
  await writeBase(dir, 'SMALL');
  await writeFile(dir, `.aioson/context/prd-${slug}.md`, '---\nproduct_scope: approved\nprd_ready: approved\n---\n# PRD\n');
  await writeFile(dir, `.aioson/context/implementation-plan-${slug}.md`, '---\nstatus: approved\n---\n# Plan\n');

  const result = await validateHandoffContract(dir, optionalCoordinatorState(slug, 'SMALL'), 'orchestrator');

  assert.equal(result.ok, true, JSON.stringify(result.missing));
});
