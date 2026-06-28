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

async function writeBase(dir, slug, classification = 'MEDIUM') {
  await writeFile(dir, '.aioson/context/project.context.md', `---\nclassification: "${classification}"\n---\n# Project\n`);
  await writeFile(dir, `.aioson/context/prd-${slug}.md`, `---\nclassification: ${classification}\n---\n# PRD\n`);
}

// MEDIUM maestro lane: @orchestrator routes straight to @dev as the single spec authority.
function maestroState(slug, classification = 'MEDIUM') {
  return {
    mode: 'feature',
    featureSlug: slug,
    classification,
    sequence: ['product', 'orchestrator', 'dev', 'pentester', 'qa']
  };
}

async function writeMaestroArtifacts(dir, slug) {
  await writeFile(dir, `.aioson/context/requirements-${slug}.md`, '# Requirements\n');
  await writeFile(
    dir,
    `.aioson/context/spec-${slug}.md`,
    '---\ngate_requirements: approved\ngate_design: approved\ngate_plan: approved\n---\n# Spec\n'
  );
  await writeFile(dir, `.aioson/context/design-doc-${slug}.md`, '# Design\n');
  await writeFile(dir, `.aioson/context/readiness-${slug}.md`, '# Readiness\n');
  await writeFile(dir, `.aioson/context/implementation-plan-${slug}.md`, '---\nstatus: approved\n---\n# Plan\n');
}

test('orchestrator handoff blocks the maestro lane when the spec package is incomplete', async () => {
  const dir = await makeTmpDir();
  const slug = 'maestro-missing-spec';
  await writeBase(dir, slug);
  await writeFile(dir, `.aioson/context/requirements-${slug}.md`, '# Requirements\n');

  const result = await validateHandoffContract(dir, maestroState(slug), 'orchestrator');

  assert.equal(result.ok, false);
  assert.ok(result.missing.some((item) => item.includes(`spec-${slug}.md`)));
  assert.ok(result.missing.some((item) => item.includes('gate C')));
});

test('orchestrator handoff passes the maestro lane with the consolidated spec package and approved gates', async () => {
  const dir = await makeTmpDir();
  const slug = 'maestro-ready';
  await writeBase(dir, slug);
  await writeMaestroArtifacts(dir, slug);

  const result = await validateHandoffContract(dir, maestroState(slug), 'orchestrator');

  assert.equal(result.ok, true, `expected pass, got: ${JSON.stringify(result.missing)}`);
});

test('orchestrator handoff blocks a maestro runtime feature without a harness contract', async () => {
  const dir = await makeTmpDir();
  const slug = 'maestro-runtime';
  await writeBase(dir, slug);
  await writeMaestroArtifacts(dir, slug);
  await writeFile(dir, `.aioson/briefings/${slug}/prototype-manifest.md`, '# Core interactions\n');

  const result = await validateHandoffContract(dir, maestroState(slug), 'orchestrator');

  assert.equal(result.ok, false);
  assert.ok(result.missing.some((item) => item.includes('missing_runtime_contract')));
});
