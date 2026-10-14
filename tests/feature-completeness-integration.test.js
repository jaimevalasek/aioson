'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { runGateCheck } = require('../src/commands/gate-check');
const { runArtifactValidate } = require('../src/commands/artifact-validate');
const { runPreflight } = require('../src/commands/preflight');
const { runFeatureClose } = require('../src/commands/feature-close');
const { validateHandoffContract } = require('../src/handoff-contract');
const {
  approveAndSealSheldonReview,
  qaExecutionReport
} = require('./helpers/feature-evidence');

async function tmp() { return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-completeness-integration-')); }
async function write(root, rel, body) {
  const file = path.join(root, rel);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, body, 'utf8');
}
const logger = { log() {}, error() {} };
function state() {
  return { mode: 'feature', featureSlug: 'demo', classification: 'SMALL', sequence: ['product', 'sheldon', 'planner', 'dev', 'qa'] };
}
function prd() {
  return `---\nclassification: SMALL\nproduct_scope: approved\nprd_ready: approved\nsheldon_review: pending\n---\n# Demo\n\n## Feature Capability Map\n\n| CAP | Promised outcome | Actor / trigger | Scope decision | Rationale |\n|---|---|---|---|---|\n| CAP-demo-01 | User sees a saved result | User submits | required | Core promise |\n\n## Acceptance Criteria\n\n| AC | CAP | Observable behavior | Evidence |\n|---|---|---|---|\n| AC-demo-01 | CAP-demo-01 | Saved result appears | integration test |\n`;
}
function plan() {
  return `---\nstatus: approved\n---\n# Plan\n\n## Engineering Controls\n\n| Concern | Evidence / trigger | Planned control | Verification | Recovery |\n|---|---|---|---|---|\n| compatibility | package.json establishes the current Node runtime | Preserve the existing module contract | node --test | Revert the additive change; no persistent data |\n\n## Implementation Delta\n\n| CAP | Action | Existing evidence | Exact paths | Required change |\n|---|---|---|---|---|\n| CAP-demo-01 | create | Inspected the nearest boundary from package.json | src/demo.js, tests/demo.test.js | Add implementation and AC-linked coverage |\n\n## Capability Delivery Plan\n\n| CAP | Phase | Files | Verification |\n|---|---|---|---|\n| CAP-demo-01 | 1 | src/demo.js, tests/demo.test.js | node --test |\n`;
}
async function seed(root) {
  await write(root, '.aioson/context/project.context.md', '---\nclassification: SMALL\n---\n');
  await write(root, '.aioson/context/prd-demo.md', prd());
  await approveAndSealSheldonReview(root);
  await write(root, '.aioson/context/implementation-plan-demo.md', plan());
}

test('artifact validation, preflight, and handoff agree on a thin PRD', async () => {
  const root = await tmp();
  await write(root, '.aioson/context/project.context.md', '---\nclassification: SMALL\n---\n');
  await write(root, '.aioson/context/prd-demo.md', '---\nproduct_scope: approved\nprd_ready: approved\n---\n# Thin\n');
  await write(root, '.aioson/context/implementation-plan-demo.md', plan());
  const artifacts = await runArtifactValidate({ args: [root], options: { json: true, feature: 'demo' }, logger });
  const preflight = await runPreflight({ args: [root], options: { json: true, agent: 'dev', feature: 'demo' }, logger });
  const handoff = await validateHandoffContract(root, state(), 'planner');
  assert.equal(artifacts.ok, false);
  assert.equal(preflight.readiness, 'BLOCKED');
  assert.equal(handoff.ok, false);
  assert.ok(artifacts.content_integrity.findings.some((item) => item.check === 'feature_capability_map_missing'));
});

test('Gate D rejects AC-name-only tests and accepts asserting evidence', async () => {
  const root = await tmp();
  await seed(root);
  await write(root, 'src/demo.js', 'module.exports = true;\n');
  await write(root, '.aioson/context/qa-report-demo.md', qaExecutionReport());
  await write(root, 'tests/demo.test.js', "const test=require('node:test'); test('AC-demo-01',()=>{});\n");
  let result = await runGateCheck({ args: [root], options: { json: true, feature: 'demo', gate: 'D' }, logger });
  assert.equal(result.ok, false);
  await write(root, 'tests/demo.test.js', "const test=require('node:test'); const assert=require('node:assert/strict'); test('AC-demo-01',()=>assert.equal(true,true));\n");
  result = await runGateCheck({ args: [root], options: { json: true, feature: 'demo', gate: 'D' }, logger });
  assert.equal(result.ok, true, result.missing.join('\n'));
});

test('Gate D reads a Laravel delivery: php artisan QA commands and PHPUnit assertions', async () => {
  const root = await tmp();
  await seed(root);
  await write(root, 'src/demo.js', 'module.exports = true;\n');
  await write(root, 'tests/demo.test.js', "const test=require('node:test'); test('placeholder',()=>{});\n");
  await write(root, 'tests/Feature/DemoTest.php', `<?php

class DemoTest extends TestCase
{
    /**
     * AC-demo-01: o resultado salvo aparece.
     */
    public function test_saved_result_appears(): void
    {
        $this->get('/demo')->assertOk();
        $this->assertSame(1, Demo::count());
    }
}
`);
  await write(root, '.aioson/context/qa-report-demo.md', qaExecutionReport({
    command: 'php artisan test --filter=DemoTest',
    entry: 'GET /demo'
  }));
  let result = await runGateCheck({ args: [root], options: { json: true, feature: 'demo', gate: 'D' }, logger });
  assert.equal(result.ok, true, result.missing.join('\n'));

  // A section that names no runner at all still fails, whatever the stack.
  await write(root, '.aioson/context/qa-report-demo.md', qaExecutionReport({ command: 'aioson ac:test-audit' }));
  result = await runGateCheck({ args: [root], options: { json: true, feature: 'demo', gate: 'D' }, logger });
  assert.equal(result.ok, false);
  assert.ok(result.missing.some((item) => item.includes('qa_executed_command_evidence_missing')));
});

test('Gate D requires planned production files but no ledger or harness', async () => {
  const root = await tmp();
  await seed(root);
  await write(root, '.aioson/context/qa-report-demo.md', qaExecutionReport());
  await write(root, 'tests/demo.test.js', "const test=require('node:test'); const assert=require('node:assert/strict'); test('AC-demo-01',()=>assert.ok(true));\n");
  let result = await runGateCheck({ args: [root], options: { json: true, feature: 'demo', gate: 'D' }, logger });
  assert.equal(result.ok, false);
  assert.ok(result.missing.some((item) => item.includes('src/demo.js')));
  await write(root, 'src/demo.js', 'module.exports = true;\n');
  result = await runGateCheck({ args: [root], options: { json: true, feature: 'demo', gate: 'D' }, logger });
  assert.equal(result.ok, true);
  assert.equal(result.missing.some((item) => /ledger|harness/i.test(item)), false);
});

test('Planner handoff needs Product-ready PRD, current Sheldon PASS, and approved plan', async () => {
  const root = await tmp();
  await seed(root);
  const result = await validateHandoffContract(root, state(), 'planner');
  assert.equal(result.ok, true, JSON.stringify(result.missing));
  assert.equal(result.missing.some((item) => /requirements|architecture|readiness|conformance|harness/i.test(item)), false);
});

test('recovered execution baseline keeps Gate C, consumers, handoff, and feature close convergent (AC-lineage-016, AC-lineage-017, AC-lineage-018, AC-lineage-019)', async (t) => {
  const root = await tmp();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await seed(root);
  await write(root, '.aioson/context/project-pulse.md', '---\nactive_feature: demo\n---\n# Pulse\n');
  await write(root, 'src/demo.js', 'module.exports = () => true;\n');
  await write(root, 'tests/demo.test.js', "const test=require('node:test'); const assert=require('node:assert/strict'); test('AC-demo-01',()=>assert.equal(true,true));\n");
  await write(root, '.aioson/context/qa-report-demo.md', qaExecutionReport({ command: 'node --test tests/demo.test.js' }));
  const planPath = path.join(root, '.aioson/context/implementation-plan-demo.md');
  const oldTime = new Date('2026-07-27T10:00:00.000Z');
  const newTime = new Date('2026-07-27T10:01:00.000Z');
  await fs.utimes(planPath, oldTime, oldTime);
  await fs.utimes(path.join(root, 'src/demo.js'), newTime, newTime);
  await fs.utimes(path.join(root, 'tests/demo.test.js'), newTime, newTime);

  const gateC = await runGateCheck({ args: [root], options: { json: true, feature: 'demo', gate: 'C' }, logger });
  const artifacts = await runArtifactValidate({ args: [root], options: { json: true, feature: 'demo' }, logger });
  const preflight = await runPreflight({ args: [root], options: { json: true, agent: 'dev', feature: 'demo' }, logger });
  const handoff = await validateHandoffContract(root, state(), 'planner');
  const closed = await runFeatureClose({
    args: [root],
    options: { json: true, feature: 'demo', verdict: 'PASS', 'no-archive': true },
    logger
  });

  // AC-lineage-016 AC-lineage-017
  assert.equal(gateC.result, 'PASS');
  assert.equal(gateC.evidence.find((item) => item.type === 'gate_c_baseline').mode, 'recovered_execution');
  assert.equal(artifacts.integrity, 'VALID');
  assert.equal(artifacts.gate_c_baseline.mode, 'recovered_execution');
  assert.equal(preflight.readiness, 'READY');
  assert.equal(preflight.gate_c_baseline.mode, 'recovered_execution');
  assert.equal(handoff.ok, true, JSON.stringify(handoff.missing));
  assert.equal(closed.ok, true, JSON.stringify(closed));
  assert.ok(closed.updates.includes('feature completeness gate: PASSED (fresh CAP/AC executable evidence)'));
});
