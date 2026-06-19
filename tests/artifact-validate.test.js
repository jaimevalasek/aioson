'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { runArtifactValidate } = require('../src/commands/artifact-validate');

async function makeTmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-artifact-val-'));
}

async function writeFile(dir, relPath, content) {
  const full = path.join(dir, relPath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, 'utf8');
}

function makeLogger() {
  const lines = [];
  const errors = [];
  return {
    log: (msg = '') => lines.push(String(msg)),
    error: (msg = '') => errors.push(String(msg)),
    lines,
    errors
  };
}

test('artifact:validate: requires --feature', async () => {
  const tmpDir = await makeTmpDir();
  const result = await runArtifactValidate({
    args: [tmpDir],
    options: { json: true },
    logger: makeLogger()
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing_feature');
});

test('artifact:validate: INVALID when required files missing', async () => {
  const tmpDir = await makeTmpDir();
  const result = await runArtifactValidate({
    args: [tmpDir],
    options: { json: true, feature: 'checkout' },
    logger: makeLogger()
  });
  assert.equal(result.ok, false);
  assert.equal(result.integrity, 'INVALID');
  assert.ok(result.missing_required.length > 0);
});

test('artifact:validate: VALID when all required files exist for SMALL', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/project.context.md', '---\nclassification: SMALL\n---');
  await writeFile(tmpDir, '.aioson/context/prd-checkout.md', '# PRD');
  await writeFile(tmpDir, '.aioson/context/requirements-checkout.md', '# Reqs');
  await writeFile(tmpDir, '.aioson/context/spec-checkout.md', '---\nversion: 3\n---\n# Spec');
  await writeFile(tmpDir, '.aioson/context/architecture.md', '# Arch');
  await writeFile(tmpDir, '.aioson/context/design-doc.md', '# Design Doc');
  await writeFile(tmpDir, '.aioson/context/readiness.md', '# Readiness');
  await writeFile(tmpDir, '.aioson/context/implementation-plan-checkout.md', '---\nstatus: approved\n---\n# Plan');

  const result = await runArtifactValidate({
    args: [tmpDir],
    options: { json: true, feature: 'checkout' },
    logger: makeLogger()
  });
  assert.equal(result.ok, true);
  assert.equal(result.integrity, 'VALID');
  assert.equal(result.missing_required.length, 0);
});

test('artifact:validate: accepts slugged design-doc and readiness for feature mode', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/project.context.md', '---\nclassification: SMALL\n---');
  await writeFile(tmpDir, '.aioson/context/prd-checkout.md', '# PRD');
  await writeFile(tmpDir, '.aioson/context/requirements-checkout.md', '# Reqs');
  await writeFile(tmpDir, '.aioson/context/spec-checkout.md', '# Spec');
  await writeFile(tmpDir, '.aioson/context/architecture.md', '# Arch');
  await writeFile(tmpDir, '.aioson/context/design-doc-checkout.md', '# Feature Design Doc');
  await writeFile(tmpDir, '.aioson/context/readiness-checkout.md', '# Feature Readiness');
  await writeFile(tmpDir, '.aioson/context/implementation-plan-checkout.md', '---\nstatus: approved\n---\n# Plan');

  const result = await runArtifactValidate({
    args: [tmpDir],
    options: { json: true, feature: 'checkout' },
    logger: makeLogger()
  });

  assert.equal(result.ok, true);
  assert.ok(result.chain.some((c) => c.name === 'design-doc-checkout.md' && c.exists));
  assert.ok(result.chain.some((c) => c.name === 'readiness-checkout.md' && c.exists));
});

test('artifact:validate: shows slugged sheldon-validation when present', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/project.context.md', '---\nclassification: SMALL\n---');
  await writeFile(tmpDir, '.aioson/context/prd-checkout.md', '# PRD');
  await writeFile(tmpDir, '.aioson/context/sheldon-validation-checkout.md', '---\nverdict: ready\n---\n# Validation');
  await writeFile(tmpDir, '.aioson/context/requirements-checkout.md', '# Reqs');
  await writeFile(tmpDir, '.aioson/context/spec-checkout.md', '# Spec');
  await writeFile(tmpDir, '.aioson/context/architecture.md', '# Arch');
  await writeFile(tmpDir, '.aioson/context/design-doc-checkout.md', '# Feature Design Doc');
  await writeFile(tmpDir, '.aioson/context/readiness-checkout.md', '# Feature Readiness');
  await writeFile(tmpDir, '.aioson/context/implementation-plan-checkout.md', '---\nstatus: approved\n---\n# Plan');

  const result = await runArtifactValidate({
    args: [tmpDir],
    options: { json: true, feature: 'checkout' },
    logger: makeLogger()
  });

  const validation = result.chain.find((c) => c.name === 'sheldon-validation-checkout.md');
  assert.ok(validation);
  assert.equal(validation.exists, true);
  assert.equal(validation.required, false);
  assert.ok(validation.detail.includes('ready'));
});

test('artifact:validate: points missing feature readiness to discovery-design-doc', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/project.context.md', '---\nclassification: SMALL\n---');
  await writeFile(tmpDir, '.aioson/context/prd-checkout.md', '# PRD');
  await writeFile(tmpDir, '.aioson/context/requirements-checkout.md', '# Reqs');
  await writeFile(tmpDir, '.aioson/context/spec-checkout.md', '# Spec');
  await writeFile(tmpDir, '.aioson/context/architecture.md', '# Arch');
  await writeFile(tmpDir, '.aioson/context/design-doc-checkout.md', '# Feature Design Doc');
  await writeFile(tmpDir, '.aioson/context/implementation-plan-checkout.md', '---\nstatus: approved\n---\n# Plan');

  const result = await runArtifactValidate({
    args: [tmpDir],
    options: { json: true, feature: 'checkout' },
    logger: makeLogger()
  });

  assert.equal(result.ok, false);
  assert.equal(result.next_missing, 'readiness-checkout.md');
  assert.ok(result.next_agent.includes('@discovery-design-doc'));
});

test('artifact:validate: conformance not required for SMALL classification', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/project.context.md', '---\nclassification: SMALL\n---');
  await writeFile(tmpDir, '.aioson/context/prd-checkout.md', '# PRD');
  await writeFile(tmpDir, '.aioson/context/requirements-checkout.md', '# Reqs');
  await writeFile(tmpDir, '.aioson/context/spec-checkout.md', '---\nversion: 1\n---');
  await writeFile(tmpDir, '.aioson/context/architecture.md', '# Arch');
  await writeFile(tmpDir, '.aioson/context/design-doc.md', '# Design Doc');
  await writeFile(tmpDir, '.aioson/context/readiness.md', '# Readiness');
  await writeFile(tmpDir, '.aioson/context/implementation-plan-checkout.md', '# Plan');

  const result = await runArtifactValidate({
    args: [tmpDir],
    options: { json: true, feature: 'checkout' },
    logger: makeLogger()
  });
  // conformance is missing but not required for SMALL
  const conformanceChain = result.chain.find((c) => c.name.includes('conformance'));
  assert.ok(conformanceChain);
  assert.equal(conformanceChain.required, false);
});

test('artifact:validate: shows spec version and gates in chain detail', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/project.context.md', '---\nclassification: SMALL\n---');
  await writeFile(tmpDir, '.aioson/context/prd-checkout.md', '# PRD');
  await writeFile(tmpDir, '.aioson/context/requirements-checkout.md', '# Reqs');
  await writeFile(tmpDir, '.aioson/context/spec-checkout.md',
    '---\nversion: 5\ngate_requirements: approved\ngate_plan: approved\n---\n# Spec');
  await writeFile(tmpDir, '.aioson/context/architecture.md', '# Arch');
  await writeFile(tmpDir, '.aioson/context/design-doc.md', '# Design Doc');
  await writeFile(tmpDir, '.aioson/context/readiness.md', '# Readiness');
  await writeFile(tmpDir, '.aioson/context/implementation-plan-checkout.md', '# Plan');

  const result = await runArtifactValidate({
    args: [tmpDir],
    options: { json: true, feature: 'checkout' },
    logger: makeLogger()
  });

  const specEntry = result.chain.find((c) => c.name.includes('spec-checkout'));
  assert.ok(specEntry);
  assert.ok(specEntry.detail && specEntry.detail.includes('5'));
});

test('artifact:validate: human output contains chain integrity line', async () => {
  const tmpDir = await makeTmpDir();
  const logger = makeLogger();
  await runArtifactValidate({ args: [tmpDir], options: { feature: 'checkout' }, logger });
  assert.ok(logger.lines.some((l) => l.includes('integrity') || l.includes('Chain') || l.includes('INVALID')));
});

test('artifact:validate: feature is in result', async () => {
  const tmpDir = await makeTmpDir();
  const result = await runArtifactValidate({
    args: [tmpDir],
    options: { json: true, feature: 'my-feature' },
    logger: makeLogger()
  });
  assert.equal(result.feature, 'my-feature');
});

// ── AC-SDLC-22: next_missing and next_agent ───────────────────────────────────

test('artifact:validate: next_missing is first required missing file when chain incomplete', async () => {
  const tmpDir = await makeTmpDir();
  // Only project.context.md — prd is the first required artifact that is missing
  await writeFile(tmpDir, '.aioson/context/project.context.md', '---\nclassification: SMALL\n---');

  const result = await runArtifactValidate({
    args: [tmpDir],
    options: { json: true, feature: 'checkout' },
    logger: makeLogger()
  });

  assert.equal(result.ok, false);
  assert.ok(result.next_missing, 'must have next_missing field when chain incomplete');
  assert.ok(result.next_missing.includes('prd-checkout.md'), `next_missing must be prd file, got: ${result.next_missing}`);
});

test('artifact:validate: next_agent points to @product when prd is missing', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/project.context.md', '---\nclassification: SMALL\n---');

  const result = await runArtifactValidate({
    args: [tmpDir],
    options: { json: true, feature: 'checkout' },
    logger: makeLogger()
  });

  assert.equal(result.ok, false);
  assert.ok(result.next_agent, 'must have next_agent field when chain incomplete');
  assert.ok(result.next_agent.includes('@product'), `next_agent must be @product when prd missing, got: ${result.next_agent}`);
});

test('artifact:validate: next_agent points to @analyst when prd exists but requirements missing', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/project.context.md', '---\nclassification: SMALL\n---');
  await writeFile(tmpDir, '.aioson/context/prd-checkout.md', '# PRD');
  // requirements is missing → @analyst

  const result = await runArtifactValidate({
    args: [tmpDir],
    options: { json: true, feature: 'checkout' },
    logger: makeLogger()
  });

  assert.equal(result.ok, false);
  assert.ok(result.next_agent.includes('@analyst'), `next_agent must be @analyst when requirements missing, got: ${result.next_agent}`);
});

test('artifact:validate: counts slugged REQ and AC identifiers', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/project.context.md', '---\nclassification: SMALL\n---');
  await writeFile(tmpDir, '.aioson/context/prd-checkout.md', '# PRD');
  await writeFile(tmpDir, '.aioson/context/requirements-checkout.md', [
    '# Reqs',
    'REQ-SDLC-01',
    'REQ-SDLC-02',
    'AC-SDLC-01',
    'AC-SDLC-02',
    'AC-SDLC-03'
  ].join('\n'));
  await writeFile(tmpDir, '.aioson/context/spec-checkout.md', '# Spec');
  await writeFile(tmpDir, '.aioson/context/architecture.md', '# Arch');
  await writeFile(tmpDir, '.aioson/context/implementation-plan-checkout.md', '# Plan');

  const result = await runArtifactValidate({
    args: [tmpDir],
    options: { json: true, feature: 'checkout' },
    logger: makeLogger()
  });

  const reqEntry = result.chain.find((c) => c.name === 'requirements-checkout.md');
  assert.equal(reqEntry.detail, '2 REQs, 3 ACs');
});

test('artifact:validate: next_agent points to @pm when implementation-plan missing (SMALL)', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/project.context.md', '---\nclassification: SMALL\n---');
  await writeFile(tmpDir, '.aioson/context/prd-checkout.md', '# PRD');
  await writeFile(tmpDir, '.aioson/context/requirements-checkout.md', '# Reqs');
  await writeFile(tmpDir, '.aioson/context/spec-checkout.md', '# Spec');
  await writeFile(tmpDir, '.aioson/context/architecture.md', '# Arch');
  await writeFile(tmpDir, '.aioson/context/design-doc.md', '# Design Doc');
  await writeFile(tmpDir, '.aioson/context/readiness.md', '# Readiness');
  // implementation-plan missing

  const result = await runArtifactValidate({
    args: [tmpDir],
    options: { json: true, feature: 'checkout' },
    logger: makeLogger()
  });

  assert.equal(result.ok, false);
  assert.ok(
    result.next_missing && result.next_missing.includes('implementation-plan-checkout.md'),
    `next_missing must be implementation-plan, got: ${result.next_missing}`
  );
  assert.ok(result.next_agent.includes('@pm'), `next_agent must be @pm, got: ${result.next_agent}`);
});

test('artifact:validate: next_missing and next_agent are null when chain is VALID', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/project.context.md', '---\nclassification: SMALL\n---');
  await writeFile(tmpDir, '.aioson/context/prd-checkout.md', '# PRD');
  await writeFile(tmpDir, '.aioson/context/requirements-checkout.md', '# Reqs');
  await writeFile(tmpDir, '.aioson/context/spec-checkout.md', '# Spec');
  await writeFile(tmpDir, '.aioson/context/architecture.md', '# Arch');
  await writeFile(tmpDir, '.aioson/context/design-doc.md', '# Design Doc');
  await writeFile(tmpDir, '.aioson/context/readiness.md', '# Readiness');
  await writeFile(tmpDir, '.aioson/context/implementation-plan-checkout.md', '# Plan');

  const result = await runArtifactValidate({
    args: [tmpDir],
    options: { json: true, feature: 'checkout' },
    logger: makeLogger()
  });

  assert.equal(result.ok, true);
  assert.equal(result.next_missing, null, 'next_missing must be null when chain valid');
  assert.equal(result.next_agent, null, 'next_agent must be null when chain valid');
});

test('artifact:validate: human output shows next_missing and next_agent when blocked', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/project.context.md', '---\nclassification: SMALL\n---');
  const logger = makeLogger();

  await runArtifactValidate({ args: [tmpDir], options: { feature: 'checkout' }, logger });

  assert.ok(logger.lines.some((l) => l.includes('Next missing')), 'human output must show Next missing line');
  assert.ok(logger.lines.some((l) => l.includes('Next agent')), 'human output must show Next agent line');
});
