'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { runGateCheck } = require('../src/commands/gate-check');
const { runVerifyGate } = require('../src/commands/verify-gate');

async function makeTmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-gate-check-'));
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

test('gate:check: requires --feature', async () => {
  const tmpDir = await makeTmpDir();
  const result = await runGateCheck({
    args: [tmpDir],
    options: { json: true, gate: 'A' },
    logger: makeLogger()
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing_feature');
});

test('gate:check: requires --gate', async () => {
  const tmpDir = await makeTmpDir();
  const result = await runGateCheck({
    args: [tmpDir],
    options: { json: true, feature: 'checkout' },
    logger: makeLogger()
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing_gate');
});

test('gate:check: invalid gate letter returns error', async () => {
  const tmpDir = await makeTmpDir();
  const result = await runGateCheck({
    args: [tmpDir],
    options: { json: true, feature: 'checkout', gate: 'Z' },
    logger: makeLogger()
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'invalid_gate');
});

test('gate:check: Gate A BLOCKED when requirements file missing', async () => {
  const tmpDir = await makeTmpDir();
  const result = await runGateCheck({
    args: [tmpDir],
    options: { json: true, feature: 'checkout', gate: 'A' },
    logger: makeLogger()
  });
  assert.equal(result.ok, false);
  assert.equal(result.result, 'BLOCKED');
  assert.ok(result.missing.some((m) => m.includes('requirements-checkout.md')));
});

test('gate:check: Gate A PASS when requirements file exists', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/requirements-checkout.md', '# Requirements\nREQ-1: User can checkout.\n');
  const result = await runGateCheck({
    args: [tmpDir],
    options: { json: true, feature: 'checkout', gate: 'A' },
    logger: makeLogger()
  });
  assert.equal(result.ok, true);
  assert.equal(result.result, 'PASS');
});

test('gate:check: Gate C BLOCKED when prerequisites not met', async () => {
  const tmpDir = await makeTmpDir();
  // No requirements file, so Gate A is not met → Gate C should be blocked
  const result = await runGateCheck({
    args: [tmpDir],
    options: { json: true, feature: 'checkout', gate: 'C' },
    logger: makeLogger()
  });
  assert.equal(result.ok, false);
  assert.equal(result.result, 'BLOCKED');
});

test('gate:check: Gate C PASS when all prerequisites met', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/requirements-checkout.md', '# Reqs\n');
  await writeFile(tmpDir, '.aioson/context/architecture.md', '# Arch\n');
  await writeFile(tmpDir, '.aioson/context/implementation-plan-checkout.md',
    '---\nstatus: approved\n---\n# Plan\n');
  await writeFile(tmpDir, '.aioson/context/spec-checkout.md',
    '---\ngate_requirements: approved\ngate_design: approved\ngate_plan: approved\n---\n');
  const result = await runGateCheck({
    args: [tmpDir],
    options: { json: true, feature: 'checkout', gate: 'C' },
    logger: makeLogger()
  });
  assert.equal(result.result, 'PASS');
});

test('gate:check: Gate C for SMALL feature in MEDIUM project does not require implementation plan', async () => {
  const tmpDir = await makeTmpDir();
  // Regression: SMALL feature inside a MEDIUM project — the SMALL sequence
  // never routes through @pm, so Gate C must not demand implementation-plan.
  await writeFile(tmpDir, '.aioson/context/project.context.md', '---\nclassification: MEDIUM\n---');
  await writeFile(tmpDir, '.aioson/context/prd-checkout.md', '---\nclassification: SMALL\n---');
  await writeFile(tmpDir, '.aioson/context/spec-checkout.md',
    '---\ngate_requirements: approved\ngate_design: approved\n---\n');
  const result = await runGateCheck({
    args: [tmpDir],
    options: { json: true, feature: 'checkout', gate: 'C' },
    logger: makeLogger()
  });
  assert.equal(result.result, 'PASS');
  assert.ok(!result.missing.some((m) => m.includes('implementation-plan')));
});

test('gate:check: Gate C for MEDIUM feature still requires implementation plan', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/project.context.md', '---\nclassification: MEDIUM\n---');
  await writeFile(tmpDir, '.aioson/context/spec-checkout.md',
    '---\ngate_requirements: approved\ngate_design: approved\n---\n');
  const result = await runGateCheck({
    args: [tmpDir],
    options: { json: true, feature: 'checkout', gate: 'C' },
    logger: makeLogger()
  });
  assert.equal(result.result, 'BLOCKED');
  assert.ok(result.missing.some((m) => m.includes('implementation-plan-checkout.md')));
  assert.ok(result.recommendation.includes('@pm'));
});

test('gate:check: Gate C blocked recommendation for SMALL does not route to @pm', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/prd-checkout.md', '---\nclassification: SMALL\n---');
  // Gates A/B not approved → blocked, but the fix recommendation must not demand @pm
  const result = await runGateCheck({
    args: [tmpDir],
    options: { json: true, feature: 'checkout', gate: 'C' },
    logger: makeLogger()
  });
  assert.equal(result.result, 'BLOCKED');
  assert.ok(!result.recommendation.includes('@pm'));
});

test('gate:check: Gate D BLOCKED without QA sign-off', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/spec-checkout.md',
    '---\ngate_requirements: approved\ngate_design: approved\ngate_plan: approved\n---\n# Spec\n');
  const result = await runGateCheck({
    args: [tmpDir],
    options: { json: true, feature: 'checkout', gate: 'D' },
    logger: makeLogger()
  });
  assert.equal(result.result, 'BLOCKED');
  assert.ok(result.missing.some((m) => m.includes('QA')));
});

test('gate:check: blocked recommendation uses the real feature slug', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/spec-checkout.md',
    '---\ngate_requirements: approved\ngate_design: approved\ngate_plan: approved\ngate_execution: pending_qa_confirmation\n---\n# Spec\n');

  const result = await runGateCheck({
    args: [tmpDir],
    options: { json: true, feature: 'checkout', gate: 'D' },
    logger: makeLogger()
  });

  assert.equal(result.result, 'BLOCKED');
  assert.ok(result.recommendation.includes('--feature=checkout'));
  assert.ok(!result.recommendation.includes('<slug>'));
});

test('gate:check: Gate D PASS with QA sign-off PASS', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/spec-checkout.md',
    '---\ngate_requirements: approved\ngate_design: approved\ngate_plan: approved\n---\n# Spec\n\n## QA Sign-off\n\n- **Verdict:** PASS\n');
  const result = await runGateCheck({
    args: [tmpDir],
    options: { json: true, feature: 'checkout', gate: 'D' },
    logger: makeLogger()
  });
  assert.equal(result.result, 'PASS');
});

test('gate:check: accepts gate name alias "requirements" → A', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/requirements-checkout.md', '# Reqs\n');
  const result = await runGateCheck({
    args: [tmpDir],
    options: { json: true, feature: 'checkout', gate: 'requirements' },
    logger: makeLogger()
  });
  assert.equal(result.gate, 'A');
  assert.equal(result.result, 'PASS');
});

test('gate:check: human output shows result and recommendation', async () => {
  const tmpDir = await makeTmpDir();
  const logger = makeLogger();
  await runGateCheck({ args: [tmpDir], options: { feature: 'checkout', gate: 'A' }, logger });
  assert.ok(logger.lines.some((l) => l.includes('Gate') || l.includes('Result')));
});

test('verify:gate: processa flag --contract e falha se critério não for atendido', async () => {
  const tmpDir = await makeTmpDir();
  
  // Setup: Spec e Contrato
  await writeFile(tmpDir, '.aioson/context/spec-test.md', '# Spec\n## Done criteria\n- [ ] Task 1\n');
  const contract = {
    criteria: [
      { id: 'C1', description: 'Arquivo crítico deve existir', assertion: 'src/critical.js' }
    ]
  };
  await writeFile(tmpDir, 'contract.json', JSON.stringify(contract));

  const result = await runVerifyGate({
    args: [tmpDir],
    options: {
      json: true,
      spec: '.aioson/context/spec-test.md',
      contract: 'contract.json',
      artifact: tmpDir
    },
    logger: makeLogger()
  });

  assert.strictEqual(result.verdict, 'FAIL_WITH_ISSUES');
  assert.ok(result.issues.some(i => i.includes('Missing required file: `src/critical.js`')), 'Deve reportar arquivo do contrato como faltando');
});

test('verify:gate: PASS quando contrato é atendido', async () => {
  const tmpDir = await makeTmpDir();
  
  await writeFile(tmpDir, 'spec.md', '# Spec\n## Done criteria\n- [x] OK\n');
  await writeFile(tmpDir, 'src/critical.js', 'console.log("ok");');
  const contract = {
    criteria: [{ id: 'C1', description: 'Exists', assertion: 'src/critical.js' }]
  };
  await writeFile(tmpDir, 'contract.json', JSON.stringify(contract));

  const result = await runVerifyGate({
    args: [tmpDir],
    options: {
      json: true,
      spec: 'spec.md',
      contract: 'contract.json',
      artifact: tmpDir
    },
    logger: makeLogger()
  });

  assert.strictEqual(result.verdict, 'PASS');
});
