'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { runGateCheck } = require('../src/commands/gate-check');

async function tmp() { return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-gate-check-')); }
async function write(root, rel, body) {
  const file = path.join(root, rel);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, body, 'utf8');
}
const logger = { log() {}, error() {} };

function prd(readiness = 'approved') {
  return `---\nclassification: SMALL\nproduct_scope: approved\nprd_ready: ${readiness}\nsheldon_review: not_requested\n---\n# Demo\n\n## Feature Capability Map\n\n| CAP | Promised outcome | Actor / trigger | Scope decision | Rationale |\n|---|---|---|---|---|\n| CAP-demo-01 | User sees saved result | User submits | required | Core promise |\n\n## Acceptance Criteria\n\n| AC | CAP | Observable behavior | Evidence |\n|---|---|---|---|\n| AC-demo-01 | CAP-demo-01 | Saved result appears | automated integration test |\n`;
}
function plan(status = 'pending') {
  return `---\nstatus: ${status}\n---\n# Plan\n\n## Capability Delivery Plan\n\n| CAP | Phase | Files | Verification |\n|---|---|---|---|\n| CAP-demo-01 | 1 | src/demo.js, tests/demo.test.js | node --test |\n`;
}
async function seed(root, { readiness = 'approved', status = 'pending' } = {}) {
  await write(root, '.aioson/context/project.context.md', '---\nclassification: SMALL\n---\n');
  await write(root, '.aioson/context/prd-demo.md', prd(readiness));
  await write(root, '.aioson/context/implementation-plan-demo.md', plan(status));
}

test('gate:check validates required CLI arguments', async () => {
  const root = await tmp();
  assert.equal((await runGateCheck({ args: [root], options: { json: true, gate: 'A' }, logger })).reason, 'missing_feature');
  assert.equal((await runGateCheck({ args: [root], options: { json: true, feature: 'demo' }, logger })).reason, 'missing_gate');
  assert.equal((await runGateCheck({ args: [root], options: { json: true, feature: 'demo', gate: 'Z' }, logger })).reason, 'invalid_gate');
});

test('Gate A validates product capability scope in the PRD', async () => {
  const root = await tmp();
  await seed(root);
  const result = await runGateCheck({ args: [root], options: { json: true, feature: 'demo', gate: 'A' }, logger });
  assert.equal(result.result, 'PASS');
  assert.match(result.recommendation, /@product/);
});

test('Gate B validates acceptance criteria and routes to Planner', async () => {
  const root = await tmp();
  await seed(root);
  const result = await runGateCheck({ args: [root], options: { json: true, feature: 'demo', gate: 'B' }, logger });
  assert.equal(result.result, 'PASS');
  assert.match(result.recommendation, /@planner/);
});

test('Gate C requires one complete implementation plan for SMALL and MEDIUM', async () => {
  const root = await tmp();
  await write(root, '.aioson/context/project.context.md', '---\nclassification: MEDIUM\n---\n');
  await write(root, '.aioson/context/prd-demo.md', prd('approved'));
  let result = await runGateCheck({ args: [root], options: { json: true, feature: 'demo', gate: 'C' }, logger });
  assert.equal(result.result, 'BLOCKED');
  assert.match(result.recommendation, /@planner/);
  await write(root, '.aioson/context/implementation-plan-demo.md', plan());
  result = await runGateCheck({ args: [root], options: { json: true, feature: 'demo', gate: 'C' }, logger });
  assert.equal(result.result, 'PASS');
  assert.match(result.recommendation, /@dev/);
});

test('Gate D requires plan approval, QA PASS, real files, and AC-linked assertions', async () => {
  const root = await tmp();
  await seed(root, { readiness: 'approved', status: 'approved' });
  await write(root, 'src/demo.js', 'module.exports = () => true;\n');
  await write(root, 'tests/demo.test.js', "const test=require('node:test'); const assert=require('node:assert/strict'); test('AC-demo-01',()=>assert.equal(true,true));\n");
  await write(root, '.aioson/context/qa-report-demo.md', '---\nverdict: PASS\n---\n# QA\n');
  const result = await runGateCheck({ args: [root], options: { json: true, feature: 'demo', gate: 'D' }, logger });
  assert.equal(result.result, 'PASS');
});

test('Gate D rejects a PASS label without AC test evidence', async () => {
  const root = await tmp();
  await seed(root, { readiness: 'approved', status: 'approved' });
  await write(root, 'src/demo.js', 'module.exports = () => true;\n');
  await write(root, 'tests/demo.test.js', "const test=require('node:test'); test('unrelated',()=>{});\n");
  await write(root, '.aioson/context/qa-report-demo.md', '---\nverdict: PASS\n---\n# QA\n');
  const result = await runGateCheck({ args: [root], options: { json: true, feature: 'demo', gate: 'D' }, logger });
  assert.equal(result.result, 'BLOCKED');
  assert.ok(result.missing.some((item) => item.includes('AC test audit')));
});
