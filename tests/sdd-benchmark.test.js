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
  await writeFile(dir, `.aioson/context/prd-${slug}.md`, `AC-${slug}-01: checkout works.`);
  await writeFile(dir, `.aioson/context/requirements-${slug}.md`, `REQ-${slug}-01. AC-${slug}-01.`);
  await writeFile(dir, `.aioson/context/spec-${slug}.md`, `AC-${slug}-01.`);
  await writeFile(dir, '.aioson/context/architecture.md', '# Arch');
  await writeFile(dir, `.aioson/context/design-doc-${slug}.md`, '# Design');
  await writeFile(dir, `.aioson/context/readiness-${slug}.md`, '# Ready');
  await writeFile(dir, 'tests/checkout.test.js', `test('AC-${slug}-01 checkout', () => {});\n`);

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
