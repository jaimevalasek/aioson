'use strict';

/**
 * Regression coverage for the streamlined Product → Planner → Dev → QA
 * contract. Legacy requirements/spec/architecture/PM ownership assertions
 * intentionally do not belong here.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { runGateCheck } = require('../src/commands/gate-check');
const { runGateApprove } = require('../src/commands/gate-approve');
const { runArtifactValidate } = require('../src/commands/artifact-validate');
const {
  evaluateReadiness,
  detectStaleDevState,
  buildContextPackage,
  parseFrontmatter
} = require('../src/preflight-engine');

async function tmp() { return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-streamlined-sdlc-')); }
async function write(root, rel, content) {
  const file = path.join(root, rel);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content, 'utf8');
  return file;
}
const logger = { log() {}, error() {} };

function prd({ productScope = 'pending', prdReady = 'pending' } = {}) {
  return `---
classification: SMALL
product_scope: ${productScope}
prd_ready: ${prdReady}
sheldon_review: not_requested
---
# Feature

## Feature Capability Map
| CAP | Promised outcome | Actor / trigger | Scope decision | Rationale |
|---|---|---|---|---|
| CAP-demo-01 | User sees result | User submits | required | Core promise |

## Acceptance Criteria
| AC | CAP | Observable behavior | Evidence |
|---|---|---|---|
| AC-demo-01 | CAP-demo-01 | Result appears | focused test |
`;
}

function plan(status = 'pending') {
  return `---
status: ${status}
---
# Plan

## Capability Delivery Plan
| CAP | Phase | Files | Verification |
|---|---|---|---|
| CAP-demo-01 | 1 | src/demo.js, tests/demo.test.js | node --test |
`;
}

async function seed(root, slug = 'demo', planStatus = 'pending') {
  await write(root, '.aioson/context/project.context.md', '---\nclassification: SMALL\n---\n# Context\n');
  await write(root, `.aioson/context/prd-${slug}.md`, prd());
  await write(root, `.aioson/context/implementation-plan-${slug}.md`, plan(planStatus));
}

test('canonical path rule keeps system docs separate from workflow artifacts', async () => {
  const content = await fs.readFile(path.join(process.cwd(), '.aioson/rules/canonical-path-contract.md'), 'utf8');
  const fm = parseFrontmatter(content);
  assert.match(content, /docs\/pt\//);
  assert.match(content, /plans\//);
  assert.match(content, /\.aioson\/plans\/\{slug\}\//);
  assert.ok(!fm.agents || fm.agents === '[]');
});

test('Gate A approval writes product_scope to the Product PRD', async () => {
  const root = await tmp();
  await seed(root);
  const result = await runGateApprove({ args: [root], options: { json: true, feature: 'demo', gate: 'A' }, logger });
  assert.equal(result.ok, true);
  assert.equal(result.field_written, 'product_scope');
  assert.equal(result.artifact_file, '.aioson/context/prd-demo.md');
  assert.match(await fs.readFile(path.join(root, result.artifact_file), 'utf8'), /product_scope: approved/);
});

test('Gate B approval writes prd_ready to the same Product PRD', async () => {
  const root = await tmp();
  await seed(root);
  const result = await runGateApprove({ args: [root], options: { json: true, feature: 'demo', gate: 'B' }, logger });
  assert.equal(result.ok, true);
  assert.equal(result.field_written, 'prd_ready');
  assert.equal(result.next_agent, '@planner');
  assert.match(await fs.readFile(path.join(root, result.artifact_file), 'utf8'), /prd_ready: approved/);
});

test('Gate C missing-plan fallback names Planner and the canonical plan', async () => {
  const root = await tmp();
  await write(root, '.aioson/context/project.context.md', '---\nclassification: SMALL\n---\n');
  await write(root, '.aioson/context/prd-demo.md', prd({ productScope: 'approved', prdReady: 'approved' }));
  const result = await runGateApprove({ args: [root], options: { json: true, feature: 'demo', gate: 'C' }, logger });
  assert.equal(result.ok, false);
  assert.match(result.manual_fallback, /implementation-plan-demo\.md/);
  assert.match(result.manual_fallback, /owning agent must create it/i);
});

test('Gate C rejects a draft plan and points to Planner', async () => {
  const root = await tmp();
  await seed(root, 'demo', 'draft');
  const result = await runGateCheck({ args: [root], options: { json: true, feature: 'demo', gate: 'C' }, logger });
  assert.equal(result.result, 'BLOCKED');
  assert.match(result.recommendation, /@planner/);
  assert.ok(result.missing.some((item) => /status/i.test(item)));
});

test('Gate C approval writes approved status to the one Planner artifact', async () => {
  const root = await tmp();
  await seed(root);
  const result = await runGateApprove({ args: [root], options: { json: true, feature: 'demo', gate: 'C' }, logger });
  assert.equal(result.ok, true);
  assert.equal(result.field_written, 'status');
  assert.equal(result.next_agent, '@dev');
  assert.match(await fs.readFile(path.join(root, result.artifact_file), 'utf8'), /status: approved/);
});

test('stale dev-state detection preserves feature continuity safeguards', () => {
  assert.match(detectStaleDevState({ exists: true, active_feature: 'old', status: 'in_progress' }, 'new'), /old/);
  assert.match(detectStaleDevState({ exists: true, active_feature: 'demo', status: 'done' }, 'demo'), /done|completed/i);
  assert.equal(detectStaleDevState({ exists: true, active_feature: 'demo', status: 'in_progress' }, 'demo'), null);
});

test('optional Sheldon readiness needs a PRD but no enrichment artifact', () => {
  const base = {
    project_context: { exists: true },
    prd: { exists: false },
    implementation_plan: { exists: false },
    requirements: { exists: false }, spec: { exists: false }, architecture: { exists: false },
    sheldon_enrichment: { exists: false }, conformance: { exists: false }, dev_state: { exists: false }, features: { exists: false }
  };
  assert.equal(evaluateReadiness(base, {}, 'SMALL', 'sheldon', null, 'demo').status, 'BLOCKED');
  assert.equal(evaluateReadiness({ ...base, prd: { exists: true, path: 'prd-demo.md' } }, {}, 'SMALL', 'sheldon', null, 'demo').status, 'READY');
});

test('artifact validation routes a missing PRD to Product', async () => {
  const root = await tmp();
  await write(root, '.aioson/context/project.context.md', '---\nclassification: SMALL\n---\n');
  const result = await runArtifactValidate({ args: [root], options: { json: true, feature: 'demo' }, logger });
  assert.equal(result.ok, false);
  assert.match(result.next_agent, /@product/);
});

test('Dev context treats Planner plan as PRIMARY and old manifests as optional compatibility', () => {
  const artifacts = {
    project_context: { exists: true, path: '.aioson/context/project.context.md' },
    prd: { exists: true, path: '.aioson/context/prd-demo.md' },
    implementation_plan: { exists: true, path: '.aioson/context/implementation-plan-demo.md' },
    sheldon_enrichment: { exists: false }, sheldon_validation: { exists: false },
    requirements: { exists: false }, spec: { exists: false }, architecture: { exists: false },
    conformance: { exists: false }, dev_state: { exists: false }
  };
  const manifest = { exists: true, is_active: true, path: '.aioson/plans/demo/manifest.md' };
  const pkg = buildContextPackage('dev', 'demo', 'SMALL', artifacts, null, manifest);
  assert.ok(pkg.some((item) => /implementation-plan-demo\.md \[PRIMARY\]/.test(item)));
  assert.ok(pkg.some((item) => /manifest\.md \[legacy optional context\]/.test(item)));
});

test('Product prompt registers feature state and hands directly to Planner', async () => {
  const content = await fs.readFile(path.join(process.cwd(), '.aioson/agents/product.md'), 'utf8');
  assert.match(content, /Always register.*features\.md/i);
  assert.match(content, /Next agent: @planner/);
  assert.match(content, /Sheldon review: optional/);
});

test('Sheldon is optional PRD-only enrichment and does not depend on spec.md', async () => {
  const content = await fs.readFile(path.join(process.cwd(), '.aioson/agents/sheldon.md'), 'utf8');
  assert.match(content, /Optionally challenge/);
  assert.match(content, /Edit the existing PRD in place/);
  assert.doesNotMatch(content, /spec\.md.*done indicator/i);
});

test('PM never owns the canonical implementation plan by classification', () => {
  const { CONTRACTS } = require('../src/handoff-contract');
  assert.deepEqual(CONTRACTS.pm.artifacts, []);
});
