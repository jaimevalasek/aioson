'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

const {
  checkContractIntegrity,
  findDuplicateVerifications,
  hasRuntimeGate,
  isRuntimeGateCriterion
} = require('../src/harness/contract-integrity');
const { detectRuntimeFeature, looksLikeMigration } = require('../src/harness/detect-runtime-feature');
const { runHarnessCheck } = require('../src/commands/harness-check');

function makeLogger() {
  const lines = [];
  const errors = [];
  return { log: (m = '') => lines.push(String(m)), error: (m = '') => errors.push(String(m)), lines, errors };
}
const mockT = () => undefined;

// ───────────────────────── pure: contract-integrity ─────────────────────────

test('isRuntimeGateCriterion matches canonical and rg-* ids, case-insensitive', () => {
  assert.ok(isRuntimeGateCriterion({ id: 'RG-build' }));
  assert.ok(isRuntimeGateCriterion({ id: 'rg-migrate' }));
  assert.ok(isRuntimeGateCriterion({ id: 'RG-smoke-core' }));
  assert.ok(!isRuntimeGateCriterion({ id: 'C1' }));
  assert.ok(!isRuntimeGateCriterion({ id: 'regression' })); // not rg-
});

test('findDuplicateVerifications groups identical binary verification commands', () => {
  const dups = findDuplicateVerifications({
    criteria: [
      { id: 'C1', binary: true, verification: 'npm test' },
      { id: 'C2', binary: true, verification: 'npm test' },
      { id: 'C3', binary: true, verification: 'npm run build' },
      { id: 'C4', binary: true } // no verification → ignored
    ]
  });
  assert.equal(dups.length, 1);
  assert.deepEqual(dups[0].ids.sort(), ['C1', 'C2']);
});

test('checkContractIntegrity: runtime feature without RG-* is a blocking error', () => {
  const result = checkContractIntegrity(
    { criteria: [{ id: 'C1', binary: true, verification: 'pnpm test -- file' }] },
    { isRuntimeFeature: true }
  );
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.code === 'missing_runtime_gate'));
});

test('checkContractIntegrity: runtime feature with an RG-* criterion passes the gate', () => {
  const result = checkContractIntegrity(
    {
      criteria: [
        { id: 'RG-build', binary: true, verification: 'npm run build' },
        { id: 'C1', binary: true, verification: 'npm test' }
      ]
    },
    { isRuntimeFeature: true }
  );
  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0);
  assert.ok(hasRuntimeGate({ criteria: [{ id: 'RG-build' }] }));
});

test('checkContractIntegrity: duplicate verification is a hard error on runtime, advisory otherwise', () => {
  const dupContract = {
    criteria: [
      { id: 'RG-build', binary: true, verification: 'npm run build' },
      { id: 'RG-smoke', binary: true, verification: 'npm test' },
      { id: 'C1', binary: true, verification: 'npm test' } // duplicate of RG-smoke
    ]
  };
  const runtime = checkContractIntegrity(dupContract, { isRuntimeFeature: true });
  assert.equal(runtime.ok, false);
  assert.ok(runtime.errors.some((e) => e.code === 'duplicate_verification'));

  const nonRuntime = checkContractIntegrity(dupContract, { isRuntimeFeature: false });
  assert.equal(nonRuntime.ok, true); // duplicate is only a warning off-runtime
  assert.ok(nonRuntime.warnings.some((w) => w.code === 'duplicate_verification'));
});

test('checkContractIntegrity: non-runtime feature with no RG-* is fine', () => {
  const result = checkContractIntegrity(
    { criteria: [{ id: 'C1', binary: true, verification: 'npm test' }] },
    { isRuntimeFeature: false }
  );
  assert.equal(result.ok, true);
});

// ───────────────────────── pure: runtime detection ─────────────────────────

test('looksLikeMigration recognises migration/prisma paths only', () => {
  assert.ok(looksLikeMigration('prisma/migrations/001_init/migration.sql'));
  assert.ok(looksLikeMigration('db/migrations/2026_add_table.sql'));
  assert.ok(looksLikeMigration('schema.prisma'));
  assert.ok(!looksLikeMigration('src/services/user.ts'));
  assert.ok(!looksLikeMigration('tests/user.test.ts'));
});

test('detectRuntimeFeature: prototype-manifest presence flags a runtime feature', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-detect-'));
  const briefing = path.join(tmp, '.aioson', 'briefings', 'flow-deck');
  await fs.mkdir(briefing, { recursive: true });
  await fs.writeFile(path.join(briefing, 'prototype-manifest.md'), '# Core interactions\n', 'utf8');
  const r = detectRuntimeFeature(tmp, 'flow-deck', { completedSteps: [] });
  assert.equal(r.isRuntimeFeature, true);
  assert.ok(r.signals.includes('prototype-manifest'));
});

test('detectRuntimeFeature: migration step flags a runtime feature; nothing flags none', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-detect-'));
  const withMigration = detectRuntimeFeature(tmp, 'billing', {
    completedSteps: ['prisma/migrations/001/migration.sql']
  });
  assert.equal(withMigration.isRuntimeFeature, true);

  const none = detectRuntimeFeature(tmp, 'copy-tweak', { completedSteps: ['src/labels.ts'] });
  assert.equal(none.isRuntimeFeature, false);
  assert.deepEqual(none.signals, []);
});

// ───────────────────────── integration: harness:check ─────────────────────────

async function writePlan(tmpDir, slug, contract, { prototype = false, progress = null } = {}) {
  const planDir = path.join(tmpDir, '.aioson', 'plans', slug);
  await fs.mkdir(planDir, { recursive: true });
  await fs.writeFile(path.join(planDir, 'harness-contract.json'), JSON.stringify(contract, null, 2), 'utf8');
  if (progress) await fs.writeFile(path.join(planDir, 'progress.json'), JSON.stringify(progress, null, 2), 'utf8');
  if (prototype) {
    const briefing = path.join(tmpDir, '.aioson', 'briefings', slug);
    await fs.mkdir(briefing, { recursive: true });
    await fs.writeFile(path.join(briefing, 'prototype-manifest.md'), '# Core\n- create board\n', 'utf8');
  }
  return planDir;
}

test('harness:check: runtime feature (prototype) with no RG-* fails on contract-integrity', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-hc-int-'));
  const slug = 'flow-deck';
  await writePlan(tmp, slug, {
    feature: slug,
    governor: {},
    criteria: [{ id: 'C1', description: 'unit', binary: true, verification: 'node -e "process.exit(0)"' }]
  }, { prototype: true });

  const result = await runHarnessCheck({ args: [tmp], options: { slug, json: true }, logger: makeLogger(), t: mockT });
  assert.equal(result.ok, false);
  assert.equal(result.integrity.ok, false);
  assert.equal(result.integrity.is_runtime_feature, true);
  assert.ok(result.integrity.errors.some((e) => e.code === 'missing_runtime_gate'));
});

test('harness:check: runtime feature with passing RG-* criteria is ok', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-hc-int-'));
  const slug = 'flow-deck-ok';
  await writePlan(tmp, slug, {
    feature: slug,
    governor: {},
    criteria: [
      { id: 'RG-build', description: 'builds', binary: true, verification: 'node -e "process.exit(0)"' },
      { id: 'RG-smoke', description: 'core', binary: true, verification: 'node -e "void 0; process.exit(0)"' }
    ]
  }, { prototype: true });

  const result = await runHarnessCheck({ args: [tmp], options: { slug, json: true }, logger: makeLogger(), t: mockT });
  assert.equal(result.ok, true);
  assert.equal(result.integrity.ok, true);
  assert.equal(result.integrity.is_runtime_feature, true);
});

test('harness:check: migration step in progress flags runtime and enforces the gate', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-hc-int-'));
  const slug = 'billing';
  await writePlan(tmp, slug, {
    feature: slug,
    governor: {},
    criteria: [{ id: 'C1', description: 'unit', binary: true, verification: 'node -e "process.exit(0)"' }]
  }, { progress: { feature: slug, status: 'in_progress', completed_steps: ['prisma/migrations/001/migration.sql'], circuit_state: 'CLOSED' } });

  const result = await runHarnessCheck({ args: [tmp], options: { slug, json: true }, logger: makeLogger(), t: mockT });
  assert.equal(result.integrity.is_runtime_feature, true);
  assert.equal(result.ok, false);
  assert.ok(result.integrity.errors.some((e) => e.code === 'missing_runtime_gate'));
});

test('harness:check: non-runtime contract is unaffected by the integrity gate', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-hc-int-'));
  const slug = 'copy-tweak';
  await writePlan(tmp, slug, {
    feature: slug,
    governor: {},
    criteria: [{ id: 'C1', description: 'unit', binary: true, verification: 'node -e "process.exit(0)"' }]
  });

  const result = await runHarnessCheck({ args: [tmp], options: { slug, json: true }, logger: makeLogger(), t: mockT });
  assert.equal(result.ok, true);
  assert.equal(result.integrity.is_runtime_feature, false);
  assert.equal(result.integrity.ok, true);
});
