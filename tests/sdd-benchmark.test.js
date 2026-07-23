'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { runSddBenchmark } = require('../src/commands/sdd-benchmark');

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
    '---', 'classification: SMALL', 'feature_completeness: required',
    'prototype: null', 'prototype_status: none', 'prototype_feature: null', '---',
    '# PRD', '## Feature Capability Map',
    '| CAP | Promised outcome | Actor / trigger | Scope decision | Rationale |',
     '|---|---|---|---|---|',
     `| CAP-${slug}-submit | Buyer completes checkout | Buyer submits the checkout | required | Primary outcome |`,
     '', '## Current System Fit',
     '| CAP | Existing behavior / evidence | Fit decision | Required product delta |',
     '|---|---|---|---|',
     `| CAP-${slug}-submit | Checkout stubs exist in src/checkout.js and tests/checkout.test.js | extend | Complete the checkout behavior and its executable proof |`,
     '', '## Acceptance Criteria',
     '| AC | CAP | Observable behavior | Evidence |', '|---|---|---|---|',
     `| AC-${slug}-01 | CAP-${slug}-submit | Checkout returns a confirmation | node test |`
   ].join('\n'));
   await writeFile(dir, `.aioson/context/implementation-plan-${slug}.md`, [
     '---', 'status: approved', '---', '# Plan', '## Engineering Controls',
     '| Concern | Evidence / trigger | Planned control | Verification | Recovery |',
     '|---|---|---|---|---|',
     '| compatibility | Existing checkout module contract | Preserve the existing callable boundary | npm test -- checkout | Revert additive changes; no persistent data |',
     '', '## Implementation Delta',
     '| CAP | Action | Existing evidence | Exact paths | Required change |',
     '|---|---|---|---|---|',
     `| CAP-${slug}-submit | modify | Existing checkout stubs were inspected | src/checkout.js, tests/checkout.test.js | Complete behavior and AC-linked coverage |`,
     '', '## Capability Delivery Plan',
     '| CAP | Phase | Files | Verification |', '|---|---|---|---|',
     `| CAP-${slug}-submit | 1 | src/checkout.js, tests/checkout.test.js | npm test -- checkout |`
   ].join('\n'));
   await writeFile(dir, 'src/checkout.js', 'module.exports = function checkout() { return true; };\n');
   await writeFile(dir, 'tests/checkout.test.js', `test('AC-${slug}-01 checkout', () => { assert.equal(checkout(), true); });\n`);

  const result = await runSddBenchmark({
    args: [dir],
    options: { feature: slug, json: true },
    logger: makeLogger()
  });

  assert.equal(result.ok, true);
  assert.equal(result.scores.tests, 1);
  assert.equal(result.scores.final, 1);

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
