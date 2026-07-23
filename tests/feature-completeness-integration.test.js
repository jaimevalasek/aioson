'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { runGateCheck } = require('../src/commands/gate-check');
const { runArtifactValidate } = require('../src/commands/artifact-validate');
const { runPreflight } = require('../src/commands/preflight');
const { validateHandoffContract } = require('../src/handoff-contract');

async function tmp() { return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-completeness-integration-')); }
async function write(root, rel, body) {
  const file = path.join(root, rel);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, body, 'utf8');
}
const logger = { log() {}, error() {} };
function state() {
  return { mode: 'feature', featureSlug: 'demo', classification: 'SMALL', sequence: ['product', 'planner', 'dev', 'qa'] };
}
function prd() {
  return `---\nclassification: SMALL\nproduct_scope: approved\nprd_ready: approved\nsheldon_review: not_requested\n---\n# Demo\n\n## Feature Capability Map\n\n| CAP | Promised outcome | Actor / trigger | Scope decision | Rationale |\n|---|---|---|---|---|\n| CAP-demo-01 | User sees a saved result | User submits | required | Core promise |\n\n## Acceptance Criteria\n\n| AC | CAP | Observable behavior | Evidence |\n|---|---|---|---|\n| AC-demo-01 | CAP-demo-01 | Saved result appears | integration test |\n`;
}
function plan() {
  return `---\nstatus: approved\n---\n# Plan\n\n## Capability Delivery Plan\n\n| CAP | Phase | Files | Verification |\n|---|---|---|---|\n| CAP-demo-01 | 1 | src/demo.js, tests/demo.test.js | node --test |\n`;
}
async function seed(root) {
  await write(root, '.aioson/context/project.context.md', '---\nclassification: SMALL\n---\n');
  await write(root, '.aioson/context/prd-demo.md', prd());
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
  await write(root, '.aioson/context/qa-report-demo.md', '---\nverdict: PASS\n---\n# QA\n');
  await write(root, 'tests/demo.test.js', "const test=require('node:test'); test('AC-demo-01',()=>{});\n");
  let result = await runGateCheck({ args: [root], options: { json: true, feature: 'demo', gate: 'D' }, logger });
  assert.equal(result.ok, false);
  await write(root, 'tests/demo.test.js', "const test=require('node:test'); const assert=require('node:assert/strict'); test('AC-demo-01',()=>assert.equal(true,true));\n");
  result = await runGateCheck({ args: [root], options: { json: true, feature: 'demo', gate: 'D' }, logger });
  assert.equal(result.ok, true, result.missing.join('\n'));
});

test('Gate D requires planned production files but no ledger or harness', async () => {
  const root = await tmp();
  await seed(root);
  await write(root, '.aioson/context/qa-report-demo.md', '---\nverdict: PASS\n---\n# QA\n');
  await write(root, 'tests/demo.test.js', "const test=require('node:test'); const assert=require('node:assert/strict'); test('AC-demo-01',()=>assert.ok(true));\n");
  let result = await runGateCheck({ args: [root], options: { json: true, feature: 'demo', gate: 'D' }, logger });
  assert.equal(result.ok, false);
  assert.ok(result.missing.some((item) => item.includes('src/demo.js')));
  await write(root, 'src/demo.js', 'module.exports = true;\n');
  result = await runGateCheck({ args: [root], options: { json: true, feature: 'demo', gate: 'D' }, logger });
  assert.equal(result.ok, true);
  assert.equal(result.missing.some((item) => /ledger|harness/i.test(item)), false);
});

test('Planner handoff needs only Product-ready PRD and approved plan', async () => {
  const root = await tmp();
  await seed(root);
  const result = await validateHandoffContract(root, state(), 'planner');
  assert.equal(result.ok, true, JSON.stringify(result.missing));
  assert.equal(result.missing.some((item) => /requirements|architecture|readiness|conformance|harness/i.test(item)), false);
});
