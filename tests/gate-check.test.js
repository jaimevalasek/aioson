'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { runGateCheck } = require('../src/commands/gate-check');
const { runGateApprove } = require('../src/commands/gate-approve');
const { runPreflight } = require('../src/commands/preflight');

async function tmp() { return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-gate-check-')); }
async function write(root, rel, body) {
  const file = path.join(root, rel);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, body, 'utf8');
}
const logger = { log() {}, error() {} };

function prd(readiness = 'approved') {
  return `---\nclassification: SMALL\nfeature_completeness: required\nproduct_scope: approved\nprd_ready: ${readiness}\nsheldon_review: not_requested\nprototype: null\nprototype_status: none\nprototype_feature: null\n---\n# Demo\n\n## Feature Capability Map\n\n| CAP | Promised outcome | Actor / trigger | Scope decision | Rationale |\n|---|---|---|---|---|\n| CAP-demo-01 | User sees saved result | User submits | required | Core promise |\n\n## Current System Fit\n\n| CAP | Existing behavior / evidence | Fit decision | Required product delta |\n|---|---|---|---|\n| CAP-demo-01 | No existing behavior after inspecting package.json | new | Add the saved result through the real app |\n\n## Acceptance Criteria\n\n| AC | CAP | Observable behavior | Evidence |\n|---|---|---|---|\n| AC-demo-01 | CAP-demo-01 | Saved result appears | automated integration test |\n`;
}
function plan(status = 'pending') {
  return `---\nstatus: ${status}\n---\n# Plan\n\n## Engineering Controls\n\n| Concern | Evidence / trigger | Planned control | Verification | Recovery |\n|---|---|---|---|---|\n| compatibility | package.json establishes the current Node runtime | Preserve the existing module contract | node --test | Revert the additive change; no persistent data |\n\n## Implementation Delta\n\n| CAP | Action | Existing evidence | Exact paths | Required change |\n|---|---|---|---|---|\n| CAP-demo-01 | create | Inspected the nearest boundary from package.json | src/demo.js, tests/demo.test.js | Add implementation and AC-linked coverage |\n\n## Capability Delivery Plan\n\n| CAP | Phase | Files | Verification |\n|---|---|---|---|\n| CAP-demo-01 | 1 | src/demo.js, tests/demo.test.js | node --test |\n`;
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

test('Gate C validates create paths before approval but accepts them during DEV resume', async () => {
  const root = await tmp();
  await seed(root, { status: 'approved' });

  await write(root, 'src/demo.js', 'module.exports = () => true;\n');
  let result = await runGateCheck({
    args: [root],
    options: { json: true, feature: 'demo', gate: 'C' },
    logger
  });
  assert.equal(result.result, 'BLOCKED');
  assert.ok(result.missing.some((item) => item.includes('implementation_delta_create_path_exists')));

  await fs.unlink(path.join(root, 'src/demo.js'));
  const approved = await runGateApprove({
    args: [root],
    options: { json: true, feature: 'demo', gate: 'C', agent: 'planner' },
    logger
  });
  assert.equal(approved.ok, true);
  assert.equal(approved.checkpoint_written, true);

  await write(root, 'src/demo.js', 'module.exports = () => true;\n');
  await write(root, 'tests/demo.test.js', "const test=require('node:test'); test('AC-demo-01',()=>{});\n");
  result = await runGateCheck({
    args: [root],
    options: { json: true, feature: 'demo', gate: 'C' },
    logger
  });
  assert.equal(result.result, 'PASS');

  const preflight = await runPreflight({
    args: [root],
    options: { json: true, agent: 'dev', feature: 'demo' },
    logger
  });
  assert.equal(
    preflight.readiness_blockers.some((item) => item.includes('implementation_delta_create_path_exists')),
    false
  );

  await write(
    root,
    '.aioson/context/implementation-plan-demo.md',
    `${plan('approved')}\n<!-- revised after Gate C approval -->\n`
  );
  result = await runGateCheck({
    args: [root],
    options: { json: true, feature: 'demo', gate: 'C' },
    logger
  });
  assert.equal(result.result, 'BLOCKED');
  assert.ok(result.missing.some((item) => item.includes('implementation_delta_create_path_exists')));
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
