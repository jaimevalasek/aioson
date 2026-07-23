'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { runArtifactValidate } = require('../src/commands/artifact-validate');

async function tmp() { return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-artifact-val-')); }
async function write(root, rel, body) {
  const file = path.join(root, rel);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, body, 'utf8');
}
const logger = { log() {}, error() {} };

function prd({ productScope = 'approved', prdReady = 'approved' } = {}) {
  return `---\nclassification: SMALL\nproduct_scope: ${productScope}\nprd_ready: ${prdReady}\nsheldon_review: not_requested\n---\n# Demo\n\n## Feature Capability Map\n\n| CAP | Promised outcome | Actor / trigger | Scope decision | Rationale |\n|---|---|---|---|---|\n| CAP-demo-01 | User sees saved result | User submits valid input | required | Core promise |\n\n## Acceptance Criteria\n\n| AC | CAP | Observable behavior | Evidence |\n|---|---|---|---|\n| AC-demo-01 | CAP-demo-01 | Saved result appears in the real app | automated integration test |\n`;
}

function plan(status = 'approved') {
  return `---\nstatus: ${status}\n---\n# Plan\n\n## Capability Delivery Plan\n\n| CAP | Phase | Files | Verification |\n|---|---|---|---|\n| CAP-demo-01 | 1 | src/demo.js, tests/demo.test.js | npm test |\n`;
}

async function seed(root, { productScope = 'approved', prdReady = 'approved', status = 'approved' } = {}) {
  await write(root, '.aioson/context/project.context.md', '---\nclassification: SMALL\n---\n');
  await write(root, '.aioson/context/prd-demo.md', prd({ productScope, prdReady }));
  await write(root, '.aioson/context/implementation-plan-demo.md', plan(status));
}

test('artifact:validate requires a feature slug', async () => {
  const result = await runArtifactValidate({ args: [await tmp()], options: { json: true }, logger });
  assert.equal(result.reason, 'missing_feature');
});

test('artifact:validate exposes only the streamlined canonical chain', async () => {
  const root = await tmp();
  await seed(root);
  const result = await runArtifactValidate({ args: [root], options: { json: true, feature: 'demo' }, logger });
  assert.equal(result.ok, true);
  assert.deepEqual(result.chain.map((item) => item.name), [
    'project.context.md',
    'prd-demo.md',
    'implementation-plan-demo.md',
    'qa-report-demo.md'
  ]);
  assert.equal(result.chain.some((item) => /requirements|spec-|architecture|readiness|conformance/i.test(item.name)), false);
});

test('artifact:validate routes a Product-incomplete PRD back to Product', async () => {
  const root = await tmp();
  await seed(root, { prdReady: 'pending' });
  const result = await runArtifactValidate({ args: [root], options: { json: true, feature: 'demo' }, logger });
  assert.equal(result.ok, false);
  assert.equal(result.next_missing, 'prd-demo.md');
  assert.match(result.next_agent, /@product/);
});

test('artifact:validate routes a missing plan to Planner', async () => {
  const root = await tmp();
  await write(root, '.aioson/context/project.context.md', '---\nclassification: MEDIUM\n---\n');
  await write(root, '.aioson/context/prd-demo.md', prd());
  const result = await runArtifactValidate({ args: [root], options: { json: true, feature: 'demo' }, logger });
  assert.equal(result.next_missing, 'implementation-plan-demo.md');
  assert.match(result.next_agent, /@planner/);
});

test('artifact:validate rejects a thin PRD without creating legacy document obligations', async () => {
  const root = await tmp();
  await write(root, '.aioson/context/project.context.md', '---\nclassification: SMALL\n---\n');
  await write(root, '.aioson/context/prd-demo.md', '---\nproduct_scope: approved\nprd_ready: approved\n---\n# Thin PRD\n');
  await write(root, '.aioson/context/implementation-plan-demo.md', plan());
  const result = await runArtifactValidate({ args: [root], options: { json: true, feature: 'demo' }, logger });
  assert.equal(result.ok, false);
  assert.match(result.next_missing, /^content:/);
  assert.match(result.next_agent, /@product/);
});

test('QA report is post-implementation evidence and optional before development', async () => {
  const root = await tmp();
  await seed(root);
  const result = await runArtifactValidate({ args: [root], options: { json: true, feature: 'demo' }, logger });
  assert.equal(result.ok, true);
  assert.deepEqual(result.missing_optional, ['qa-report-demo.md']);
});
