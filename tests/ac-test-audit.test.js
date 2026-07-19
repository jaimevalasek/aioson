'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { extractAcIds, auditAcceptanceCriteriaTests } = require('../src/lib/ac-test-audit');
const { runAcTestAudit } = require('../src/commands/ac-test-audit');
const { runHarnessCheck } = require('../src/commands/harness-check');

async function makeTmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-ac-test-audit-'));
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

test('extractAcIds supports slugged and numeric AC ids', () => {
  assert.deepEqual(
    extractAcIds('AC-checkout-01 AC-SDLC-02 AC-03 AC-checkout-01'),
    ['AC-03', 'AC-SDLC-02', 'AC-checkout-01']
  );
});

test('ac:test-audit requires --feature', async () => {
  const dir = await makeTmpDir();
  const result = await runAcTestAudit({
    args: [dir],
    options: { json: true },
    logger: makeLogger()
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, 'missing_feature');
});

test('ac:test-audit passes when no AC ids exist', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, '.aioson/context/requirements-checkout.md', '# Requirements\nNo explicit ids yet.');

  const result = await auditAcceptanceCriteriaTests(dir, 'checkout');

  assert.equal(result.ok, true);
  assert.equal(result.summary.acs_total, 0);
});

test('ac:test-audit strict mode rejects zero acceptance criteria', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, '.aioson/context/requirements-checkout.md', '# Requirements\nNo explicit ids yet.');

  const result = await auditAcceptanceCriteriaTests(dir, 'checkout', {
    requireCriteria: true,
    requireAssertions: true
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.missing, ['<no acceptance criteria declared>']);
});

test('ac:test-audit covers AC ids referenced by test files', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, '.aioson/context/requirements-checkout.md', 'AC-checkout-01: user can pay.');
  await writeFile(dir, 'tests/checkout.test.js', "test('AC-checkout-01 payment flow', () => {});\n");

  const result = await auditAcceptanceCriteriaTests(dir, 'checkout');

  assert.equal(result.ok, true);
  assert.equal(result.summary.covered, 1);
  assert.equal(result.items[0].status, 'covered');
  assert.equal(result.items[0].evidence[0].file, 'tests/checkout.test.js');
});

test('ac:test-audit strict mode rejects an empty test that only names the AC', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, '.aioson/context/requirements-checkout.md', 'AC-checkout-01: user can pay.');
  await writeFile(dir, 'tests/checkout.test.js', "test('AC-checkout-01 payment flow', () => {});\n");

  const result = await auditAcceptanceCriteriaTests(dir, 'checkout', {
    requireCriteria: true,
    requireAssertions: true
  });

  assert.equal(result.ok, false);
  assert.equal(result.items[0].status, 'weak');
  assert.equal(result.items[0].weak_evidence[0].file, 'tests/checkout.test.js');
});

test('ac:test-audit strict mode accepts an AC-linked test with an assertion signal', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, '.aioson/context/requirements-checkout.md', 'AC-checkout-01: user can pay.');
  await writeFile(dir, 'tests/checkout.test.js', "test('AC-checkout-01 payment flow', () => { assert.equal(pay(), true); });\n");

  const result = await auditAcceptanceCriteriaTests(dir, 'checkout', {
    requireCriteria: true,
    requireAssertions: true
  });

  assert.equal(result.ok, true);
  assert.equal(result.items[0].status, 'covered');
});

for (const [variant, source] of Object.entries({
  skipped: "test.skip('AC-checkout-01 payment flow', () => { assert.equal(pay(), true); });\n",
  todo: "test.todo('AC-checkout-01 assert.equal(pay(), true)');\n",
  commented: "// test('AC-checkout-01 payment flow', () => { assert.equal(pay(), true); });\n",
  string_only: "test('unrelated', () => { const note = 'AC-checkout-01 assert.equal(pay(), true)'; });\n"
})) {
  test(`ac:test-audit strict mode rejects ${variant} pseudo-evidence`, async () => {
    const dir = await makeTmpDir();
    await writeFile(dir, '.aioson/context/requirements-checkout.md', 'AC-checkout-01: user can pay.');
    await writeFile(dir, 'tests/checkout.test.js', source);

    const result = await auditAcceptanceCriteriaTests(dir, 'checkout', {
      requireCriteria: true,
      requireAssertions: true
    });

    assert.equal(result.ok, false);
    assert.equal(result.items[0].status, 'weak');
  });
}

test('ac:test-audit strict mode does not borrow an assertion from a later unrelated test', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, '.aioson/context/requirements-checkout.md', 'AC-checkout-01: payment succeeds.\n');
  await writeFile(dir, 'tests/checkout.test.js', [
    "test('AC-checkout-01 payment flow', () => {});",
    "test('unrelated health check', () => { assert.equal(health(), true); });"
  ].join('\n'));

  const result = await auditAcceptanceCriteriaTests(dir, 'checkout', {
    requireCriteria: true,
    requireAssertions: true
  });

  assert.equal(result.ok, false);
  assert.equal(result.items[0].status, 'weak');
});

test('ac:test-audit covers AC ids referenced by executable harness criteria', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, '.aioson/context/requirements-checkout.md', 'AC-checkout-02: trial can start.');
  await writeFile(dir, '.aioson/plans/checkout/harness-contract.json', JSON.stringify({
    feature: 'checkout',
    governor: {},
    criteria: [
      {
        id: 'C1',
        description: 'AC-checkout-02 is verified',
        binary: true,
        verification: 'node -e "process.exit(0)"'
      }
    ]
  }));
  const harness = await runHarnessCheck({
    args: [dir],
    options: { slug: 'checkout', json: true, strict: true },
    logger: makeLogger(),
    t: () => undefined
  });
  assert.equal(harness.ok, true);

  const result = await auditAcceptanceCriteriaTests(dir, 'checkout');

  assert.equal(result.ok, true);
  assert.equal(result.items[0].status, 'covered');
  assert.equal(result.items[0].evidence[0].criterion, 'C1');
});

test('ac:test-audit does not trust an unexecuted harness declaration', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, '.aioson/context/requirements-checkout.md', 'AC-checkout-02: trial can start.');
  await writeFile(dir, '.aioson/plans/checkout/harness-contract.json', JSON.stringify({
    feature: 'checkout',
    governor: {},
    criteria: [{
      id: 'C1',
      description: 'AC-checkout-02 is verified',
      binary: true,
      verification: 'node -e "process.exit(0)"'
    }]
  }));

  const result = await auditAcceptanceCriteriaTests(dir, 'checkout', {
    requireCriteria: true,
    requireAssertions: true
  });

  assert.equal(result.ok, false);
  assert.equal(result.items[0].status, 'missing');
});

test('ac:test-audit does not let a longer AC id cover a shorter prefix id (substring collision)', async () => {
  const dir = await makeTmpDir();
  await writeFile(
    dir,
    '.aioson/context/requirements-checkout.md',
    'AC-1: user can log in.\nAC-2: user can log out.\nAC-10: admin can disable a user.'
  );
  // Only AC-10 is cited by a test. AC-1 must NOT be marked covered just because
  // "AC-10" contains the substring "AC-1".
  await writeFile(dir, 'tests/checkout.test.js', "test('admin disable', () => { /* AC-10 */ });\n");

  const result = await auditAcceptanceCriteriaTests(dir, 'checkout');

  const byId = Object.fromEntries(result.items.map((i) => [i.ac, i.status]));
  assert.equal(byId['AC-10'], 'covered');
  assert.equal(byId['AC-1'], 'missing');
  assert.equal(byId['AC-2'], 'missing');
  assert.equal(result.ok, false);
  assert.deepEqual(result.missing.sort(), ['AC-1', 'AC-2']);
});

test('ac:test-audit blocks when an AC has no test evidence', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, '.aioson/context/requirements-checkout.md', 'AC-checkout-03: subscription status is visible.');
  await writeFile(dir, 'tests/checkout.test.js', "test('unrelated test', () => {});\n");

  const result = await auditAcceptanceCriteriaTests(dir, 'checkout');

  assert.equal(result.ok, false);
  assert.deepEqual(result.missing, ['AC-checkout-03']);
});

test('ac:test-audit --json emits report', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, '.aioson/context/requirements-checkout.md', 'AC-checkout-04: cancel trial.');
  await writeFile(dir, 'tests/checkout.test.js', "test('AC-checkout-04 cancel', () => {});\n");
  const logger = makeLogger();

  const result = await runAcTestAudit({
    args: [dir],
    options: { feature: 'checkout', json: true },
    logger
  });

  assert.equal(result.ok, true);
  const parsed = JSON.parse(logger.lines.join('\n'));
  assert.equal(parsed.summary.covered, 1);
});
