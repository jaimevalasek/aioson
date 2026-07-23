'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { validateHandoffContract } = require('../src/handoff-contract');

async function tmp() { return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-sheldon-contract-')); }
async function write(root, rel, body) {
  const file = path.join(root, rel);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, body, 'utf8');
}
function state(slug, classification = 'SMALL') {
  return { mode: 'feature', featureSlug: slug, classification, sequence: ['product', 'sheldon', 'planner', 'dev', 'qa'] };
}
function prd(review) {
  return `---\nclassification: SMALL\nproduct_scope: approved\nprd_ready: approved\nsheldon_review: ${review}\n---\n# Demo\n\n## Feature Capability Map\n\n| CAP | Promised outcome | Actor / trigger | Scope decision | Rationale |\n|---|---|---|---|---|\n| CAP-demo-01 | User sees saved result | User submits | required | Core promise |\n\n## Acceptance Criteria\n\n| AC | CAP | Observable behavior | Evidence |\n|---|---|---|---|\n| AC-demo-01 | CAP-demo-01 | Saved result appears | integration test |\n`;
}

test('optional Sheldon handoff blocks when its explicit review is unfinished', async () => {
  const root = await tmp();
  await write(root, '.aioson/context/project.context.md', '---\nclassification: SMALL\n---\n');
  await write(root, '.aioson/context/prd-demo.md', prd('pending'));
  const result = await validateHandoffContract(root, state('demo'), 'sheldon');
  assert.equal(result.ok, false);
  assert.ok(result.missing.some((item) => item.includes('sheldon_review')));
});

test('optional Sheldon handoff passes with the reviewed PRD only', async () => {
  const root = await tmp();
  await write(root, '.aioson/context/project.context.md', '---\nclassification: MEDIUM\n---\n');
  await write(root, '.aioson/context/prd-demo.md', prd('approved').replace('SMALL', 'MEDIUM'));
  const result = await validateHandoffContract(root, state('demo', 'MEDIUM'), 'sheldon');
  assert.equal(result.ok, true, JSON.stringify(result.missing));
});

test('optional Sheldon handoff never requires enrichment, spec, design, readiness, conformance, or harness artifacts', async () => {
  const root = await tmp();
  await write(root, '.aioson/context/project.context.md', '---\nclassification: SMALL\n---\n');
  await write(root, '.aioson/context/prd-demo.md', prd('approved'));
  const result = await validateHandoffContract(root, state('demo'), 'sheldon');
  assert.equal(result.ok, true);
  assert.equal(result.missing.some((item) => /enrichment|requirements|spec-|design-doc|readiness|conformance|harness/i.test(item)), false);
});

test('optional Sheldon handoff catches a thin approved PRD', async () => {
  const root = await tmp();
  await write(root, '.aioson/context/project.context.md', '---\nclassification: SMALL\n---\n');
  await write(root, '.aioson/context/prd-demo.md', '---\nclassification: SMALL\nproduct_scope: approved\nprd_ready: approved\nsheldon_review: approved\n---\n# Thin\n');
  const result = await validateHandoffContract(root, state('demo'), 'sheldon');
  assert.equal(result.ok, false);
  assert.ok(result.missing.some((item) => item.includes('feature completeness')));
});
