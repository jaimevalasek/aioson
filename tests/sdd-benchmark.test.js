'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { runSddBenchmark } = require('../src/commands/sdd-benchmark');
const { CANONICAL_LENSES } = require('../src/lib/feature-completeness');

async function makeTmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-sdd-benchmark-'));
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

test('sdd:benchmark requires --feature', async () => {
  const dir = await makeTmpDir();
  const result = await runSddBenchmark({
    args: [dir],
    options: { json: true },
    logger: makeLogger()
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, 'missing_feature');
});

test('sdd:benchmark scores a covered SMALL feature and writes markdown report', async () => {
  const dir = await makeTmpDir();
  const slug = 'checkout';
  await writeFile(dir, '.aioson/context/project.context.md', '---\nclassification: SMALL\n---');
  await writeFile(dir, `.aioson/context/prd-${slug}.md`, [
    '---', 'classification: SMALL', 'feature_completeness: required', '---',
    '# PRD', '## Feature Capability Map',
    '| CAP | Promised outcome | Actor / trigger | Scope decision | Rationale |',
    '|---|---|---|---|---|',
    `| CAP-${slug}-submit | Buyer completes checkout | Buyer submits the checkout | required | Primary outcome |`
  ].join('\n'));
  const lensRows = CANONICAL_LENSES.map((lens) => lens === 'primary-outcome'
    ? `| CAP-${slug}-submit | primary-outcome | required | Checkout returns a confirmation | REQ-${slug}-01 | AC-${slug}-01 |`
    : `| feature-wide | ${lens} | not_applicable | ${lens} has no surface in this bounded fixture | — | — |`).join('\n');
  await writeFile(dir, `.aioson/context/requirements-${slug}.md`, [
    `REQ-${slug}-01. AC-${slug}-01.`,
    '## Feature Capability Matrix',
    '| CAP | Lens | Decision | Behavior / rationale | REQ | AC |',
    '|---|---|---|---|---|---|',
    lensRows
  ].join('\n'));
  await writeFile(dir, `.aioson/context/spec-${slug}.md`, `AC-${slug}-01.`);
  await writeFile(dir, '.aioson/context/architecture.md', '# Arch');
  await writeFile(dir, `.aioson/context/design-doc-${slug}.md`, [
    '# Design', '## Implementation Leverage Matrix',
    '| CAP | Concern | Decision | Evidence | Target |',
    '|---|---|---|---|---|',
    `| CAP-${slug}-submit | checkout service | reuse | package.json and src/checkout.js inspected | src/checkout.js |`
  ].join('\n'));
  await writeFile(dir, `.aioson/context/readiness-${slug}.md`, '# Ready');
  await writeFile(dir, `.aioson/context/implementation-plan-${slug}.md`, [
    '---', 'status: approved', '---', '# Plan', '## Capability Delivery Plan',
    '| CAP | Phase | Files | Verification |', '|---|---|---|---|',
    `| CAP-${slug}-submit | 1 | src/checkout.js, tests/checkout.test.js | npm test -- checkout |`
  ].join('\n'));
  await writeFile(dir, 'tests/checkout.test.js', `test('AC-${slug}-01 checkout', () => { assert.equal(checkout(), true); });\n`);

  const result = await runSddBenchmark({
    args: [dir],
    options: { feature: slug, json: true },
    logger: makeLogger()
  });

  assert.equal(result.ok, true);
  assert.equal(result.scores.tests, 1);
  assert.ok(result.scores.final > 0.8);

  const report = await fs.readFile(
    path.join(dir, '.aioson/context/retro/sdd-benchmark-checkout.md'),
    'utf8'
  );
  assert.ok(report.includes('SDD Benchmark'));
  assert.ok(report.includes(`AC-${slug}-01`));
});

test('sdd:benchmark reports missing AC test evidence', async () => {
  const dir = await makeTmpDir();
  const slug = 'billing';
  await writeFile(dir, '.aioson/context/project.context.md', '---\nclassification: MICRO\n---');
  await writeFile(dir, `.aioson/context/prd-${slug}.md`, `AC-${slug}-01: billing works.`);
  await writeFile(dir, `.aioson/context/requirements-${slug}.md`, `AC-${slug}-01.`);

  const result = await runSddBenchmark({
    args: [dir],
    options: { feature: slug, json: true },
    logger: makeLogger()
  });

  assert.equal(result.ok, false);
  assert.equal(result.scores.tests, 0);
  assert.deepEqual(result.ac_test_audit.missing, [`AC-${slug}-01`]);
});
