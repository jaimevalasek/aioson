'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { runGateApprove } = require('../src/commands/gate-approve');

async function tmp() { return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-gate-approve-')); }
async function write(root, rel, body) {
  const file = path.join(root, rel);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, body, 'utf8');
}
const logger = { log() {}, error() {} };
const prd = `---\nclassification: SMALL\nproduct_scope: pending\nprd_ready: pending\nsheldon_review: not_requested\nowner: product\n---\n# Demo\n\n## Feature Capability Map\n\n| CAP | Promised outcome | Actor / trigger | Scope decision | Rationale |\n|---|---|---|---|---|\n| CAP-demo-01 | User sees saved result | User submits | required | Core promise |\n\n## Acceptance Criteria\n\n| AC | CAP | Observable behavior | Evidence |\n|---|---|---|---|\n| AC-demo-01 | CAP-demo-01 | Saved result appears | integration test |\n`;
const plan = `---\nstatus: pending\n---\n# Plan\n\n## Capability Delivery Plan\n\n| CAP | Phase | Files | Verification |\n|---|---|---|---|\n| CAP-demo-01 | 1 | src/demo.js, tests/demo.test.js | node --test |\n`;

async function seed(root) {
  await write(root, '.aioson/context/project.context.md', '---\nclassification: SMALL\n---\n');
  await write(root, '.aioson/context/prd-demo.md', prd);
  await write(root, '.aioson/context/implementation-plan-demo.md', plan);
}

test('gate:approve validates arguments and blocks missing artifacts', async () => {
  const root = await tmp();
  assert.equal((await runGateApprove({ args: [root], options: { json: true, gate: 'A' }, logger })).reason, 'missing_feature');
  assert.equal((await runGateApprove({ args: [root], options: { json: true, feature: 'demo' }, logger })).reason, 'missing_gate');
  assert.equal((await runGateApprove({ args: [root], options: { json: true, feature: 'demo', gate: 'Z' }, logger })).reason, 'invalid_gate');
  assert.equal((await runGateApprove({ args: [root], options: { json: true, feature: 'demo', gate: 'A' }, logger })).blocked, true);
});

test('Gate A approval updates the PRD and keeps Product responsible for readiness', async () => {
  const root = await tmp();
  await seed(root);
  const result = await runGateApprove({ args: [root], options: { json: true, feature: 'demo', gate: 'A' }, logger });
  assert.equal(result.ok, true);
  assert.equal(result.artifact_file, '.aioson/context/prd-demo.md');
  assert.equal(result.next_agent, '@product');
  assert.match(await fs.readFile(path.join(root, result.artifact_file), 'utf8'), /product_scope: approved/);
});

test('Gate B approval edits the same PRD in place and points to Planner', async () => {
  const root = await tmp();
  await seed(root);
  const result = await runGateApprove({ args: [root], options: { json: true, feature: 'demo', gate: 'B' }, logger });
  const content = await fs.readFile(path.join(root, result.artifact_file), 'utf8');
  assert.equal(result.ok, true);
  assert.equal(result.next_agent, '@planner');
  assert.match(content, /prd_ready: approved/);
  assert.match(content, /sheldon_review: not_requested/);
  assert.match(content, /owner: product/);
});

test('Gate C approval updates the one plan and points to Dev', async () => {
  const root = await tmp();
  await seed(root);
  const result = await runGateApprove({ args: [root], options: { json: true, feature: 'demo', gate: 'C' }, logger });
  assert.equal(result.ok, true);
  assert.equal(result.artifact_file, '.aioson/context/implementation-plan-demo.md');
  assert.equal(result.next_agent, '@dev');
  assert.match(await fs.readFile(path.join(root, result.artifact_file), 'utf8'), /status: approved/);
});

test('manual fallback names the canonical owner artifact', async () => {
  const root = await tmp();
  const result = await runGateApprove({ args: [root], options: { json: true, feature: 'demo', gate: 'C' }, logger });
  assert.match(result.manual_fallback, /implementation-plan-demo\.md/);
  assert.doesNotMatch(result.manual_fallback, /spec-demo\.md/);
});
