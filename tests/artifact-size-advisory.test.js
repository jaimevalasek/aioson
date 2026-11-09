'use strict';

/**
 * prd-{slug}.md and implementation-plan-{slug}.md are opened whole by Sheldon,
 * Planner and QA; real ones reached 86 KB and 134 KB. Past an advisory budget,
 * kind=prd and Gate C say so with the numbers and the largest sections — and
 * never change a verdict.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { sizeAdvisory, SIZE_BUDGET } = require('../src/lib/artifact-size');
const { runGateCheck } = require('../src/commands/gate-check');
const { approveAndSealSheldonReview } = require('./helpers/feature-evidence');

const CLI = path.join(__dirname, '..', 'bin', 'aioson.js');
const logger = { log() {}, error() {} };
const appendix = (bytes) => `\n## Appendix — raw research\n\n${'Interview note kept for the record, not needed to build the phase. '.repeat(Math.ceil(bytes / 68))}\n`;

async function write(root, rel, body) {
  const file = path.join(root, rel);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, body, 'utf8');
}

const PRD = `---\nclassification: SMALL\nfeature_completeness: required\nproduct_scope: approved\nprd_ready: approved\nsheldon_review: pending\nprototype: null\nprototype_status: none\nprototype_feature: null\n---\n# Demo\n\n## Feature Capability Map\n\n| CAP | Promised outcome | Actor / trigger | Scope decision | Rationale |\n|---|---|---|---|---|\n| CAP-demo-01 | User sees saved result | User submits | required | Core promise |\n\n## Current System Fit\n\n| CAP | Existing behavior / evidence | Fit decision | Required product delta |\n|---|---|---|---|\n| CAP-demo-01 | No existing behavior after inspecting package.json | new | Add the saved result through the real app |\n\n## Acceptance Criteria\n\n| AC | CAP | Observable behavior | Evidence |\n|---|---|---|---|\n| AC-demo-01 | CAP-demo-01 | Saved result appears | automated integration test |\n`;
const PLAN = `---\nstatus: pending\n---\n# Plan\n\n## Engineering Controls\n\n| Concern | Evidence / trigger | Planned control | Verification | Recovery |\n|---|---|---|---|---|\n| compatibility | package.json establishes the current Node runtime | Preserve the existing module contract | node --test | Revert the additive change; no persistent data |\n\n## Implementation Delta\n\n| CAP | Action | Existing evidence | Exact paths | Required change |\n|---|---|---|---|---|\n| CAP-demo-01 | create | Inspected the nearest boundary from package.json | src/demo.js, tests/demo.test.js | Add implementation and AC-linked coverage |\n\n## Capability Delivery Plan\n\n| CAP | Phase | Files | Verification |\n|---|---|---|---|\n| CAP-demo-01 | 1 | src/demo.js, tests/demo.test.js | node --test |\n`;

test('the advisory names the size, the budget, the token cost and the largest sections', () => {
  assert.equal(sizeAdvisory({ kind: 'prd', text: PRD, file: 'prd-demo.md' }), null, 'under budget: silent');
  const big = sizeAdvisory({ kind: 'prd', text: PRD + appendix(60 * 1024), file: 'prd-demo.md' });
  assert.equal(big.code, 'artifact_oversize');
  assert.equal(big.budget, SIZE_BUDGET.prd);
  assert.ok(big.bytes > SIZE_BUDGET.prd);
  assert.equal(big.largest_sections[0].heading, 'Appendix — raw research');
  assert.match(big.message, /^prd-demo\.md is \d+(\.\d)? KB \(advisory budget 48 KB, about \d+k tokens for every agent that reads it whole\): move appendices, raw research and long examples to a linked file and keep decisions, the CAP and AC tables and Source Coverage here\. Largest sections: Appendix — raw research \d+(\.\d)? KB/);
  assert.match(sizeAdvisory({ kind: 'plan', text: PLAN + appendix(70 * 1024), file: 'plan.md' }).message, /advisory budget 64 KB.*keep the phases, Implementation Delta/);
});

test('kind=prd warns on an oversized PRD without changing its verdict', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-size-prd-'));
  await write(root, 'small/prd-demo.md', PRD);
  await write(root, 'big/prd-demo.md', PRD + appendix(60 * 1024));
  const run = (rel) => JSON.parse(spawnSync(process.execPath, [CLI, 'verify:artifact', root, '--kind=prd', `--file=${rel}`, '--advisory', '--no-persist', '--json'], { encoding: 'utf8' }).stdout);
  const small = run('small/prd-demo.md');
  const big = run('big/prd-demo.md');
  assert.equal(big.ok, small.ok, 'size never decides the verdict');
  assert.deepEqual(big.issues, small.issues);
  assert.equal((small.warnings || []).filter((w) => /advisory budget/.test(w)).length, 0);
  assert.equal((big.warnings || []).filter((w) => /advisory budget 48 KB/.test(w)).length, 1);
});

test('Gate C carries the plan size advisory as evidence and keeps its result', async () => {
  const results = {};
  for (const variant of ['small', 'big']) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), `aioson-size-gate-${variant}-`));
    await write(root, '.aioson/context/project.context.md', '---\nclassification: SMALL\n---\n');
    await write(root, '.aioson/context/prd-demo.md', PRD);
    await approveAndSealSheldonReview(root);
    await write(root, '.aioson/context/implementation-plan-demo.md', variant === 'big' ? PLAN + appendix(70 * 1024) : PLAN);
    results[variant] = await runGateCheck({ args: [root], options: { json: true, feature: 'demo', gate: 'C' }, logger });
  }
  assert.equal(results.big.result, results.small.result, 'size never decides the gate');
  assert.equal(results.big.ok, results.small.ok);
  assert.equal(results.small.evidence.filter((e) => e.type === 'artifact_size').length, 0);
  const advisory = results.big.evidence.find((e) => e.type === 'artifact_size');
  assert.equal(advisory.ok, true);
  assert.equal(advisory.advisory, true);
  assert.equal(advisory.warnings.length, 1);
  assert.equal(advisory.warnings[0].kind, 'plan');
  assert.match(advisory.warnings[0].message, /implementation-plan-demo\.md is .* \(advisory budget 64 KB/);
});
