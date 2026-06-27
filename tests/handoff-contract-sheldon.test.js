'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { validateHandoffContract } = require('../src/handoff-contract');

async function makeTmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-sheldon-contract-'));
}

async function writeFile(dir, relPath, content) {
  const full = path.join(dir, relPath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, 'utf8');
}

async function writeBase(dir, slug, classification = 'SMALL') {
  await writeFile(dir, '.aioson/context/project.context.md', `---\nclassification: "${classification}"\n---\n# Project\n`);
  await writeFile(dir, `.aioson/context/prd-${slug}.md`, `---\nclassification: ${classification}\n---\n# PRD\n`);
}

function leanState(slug, classification = 'SMALL') {
  return {
    mode: 'feature',
    featureSlug: slug,
    classification,
    sequence: ['product', 'sheldon', 'dev', 'qa']
  };
}

async function writeLeanArtifacts(dir, slug) {
  await writeFile(dir, `.aioson/context/sheldon-enrichment-${slug}.md`, '# Sheldon\n');
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

test('sheldon handoff blocks lean lane when spec bridge is missing', async () => {
  const dir = await makeTmpDir();
  const slug = 'lean-missing-spec';
  await writeBase(dir, slug);
  await writeFile(dir, `.aioson/context/sheldon-enrichment-${slug}.md`, '# Sheldon\n');

  const result = await validateHandoffContract(dir, leanState(slug), 'sheldon');

  assert.equal(result.ok, false);
  assert.ok(result.missing.some((item) => item.includes(`spec-${slug}.md`)));
  assert.ok(result.missing.some((item) => item.includes('gate C')));
});

test('sheldon handoff passes lean lane with bridge artifacts and approved collapsed gates', async () => {
  const dir = await makeTmpDir();
  const slug = 'lean-ready';
  await writeBase(dir, slug);
  await writeLeanArtifacts(dir, slug);

  const result = await validateHandoffContract(dir, leanState(slug), 'sheldon');

  assert.equal(result.ok, true, `expected pass, got: ${JSON.stringify(result.missing)}`);
});

test('sheldon handoff blocks lean runtime feature without harness contract', async () => {
  const dir = await makeTmpDir();
  const slug = 'lean-runtime';
  await writeBase(dir, slug);
  await writeLeanArtifacts(dir, slug);
  await writeFile(dir, `.aioson/briefings/${slug}/prototype-manifest.md`, '# Core interactions\n');

  const result = await validateHandoffContract(dir, leanState(slug), 'sheldon');

  assert.equal(result.ok, false);
  assert.ok(result.missing.some((item) => item.includes('missing_runtime_contract')));
});
