'use strict';

// Messages the feature cycle met at its own stages: Product's "explicit none
// with its reason" failed prototype:check as an identity path; Gate C counted
// its blocking findings without printing them (and said "BLOCKED — BLOCKED —
// activate @planner to produce …" to the planner that just did); memory:status
// exited 1 on a healthy project that never ran /discover; and @quality's
// kernel-prescribed agent:done printed a CONTRACTS-map debug line.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { runPrototypeCheck } = require('../src/commands/prototype-check');
const { runGateCheck } = require('../src/commands/gate-check');
const { runMemoryStatus } = require('../src/commands/memory');
const { maybeAutoAdvanceWorkflow } = require('../src/commands/runtime');
const { approveAndSealSheldonReview } = require('./helpers/feature-evidence');

async function project(files) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-cycle-msg-'));
  for (const [rel, content] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
    await fs.writeFile(path.join(dir, rel), content, 'utf8');
  }
  return dir;
}

function capture() {
  const lines = [];
  return { lines, log: (m = '') => lines.push(String(m)), error: (m = '') => lines.push(String(m)), warn: () => {} };
}

test('prototype:check accepts the Prototype contract line `identity: none — <reason>`', async () => {
  const dir = await project({
    '.aioson/context/prd-todo.md': `---\nfeature: todo\nprototype: null\nprototype_status: none\nprototype_feature: null\nidentity: null\nidentity_status: none\n---\n\n# PRD\n\n## Prototype contract\n\n- prototype: none\n- manifest: none\n- status: none\n- identity: none — API-only feature, no visual surface.\n`
  });
  const result = await runPrototypeCheck({ args: [dir], options: { feature: 'todo', strict: true, json: true }, logger: capture() });
  assert.equal(result.ok, true, JSON.stringify(result));
});

test('a blocked Gate C prints the findings to repair, once labelled BLOCKED', async () => {
  const dir = await project({
    '.aioson/context/project.context.md': '---\nclassification: MEDIUM\n---\n',
    '.aioson/context/prd-demo.md': `---\nfeature: demo\nclassification: SMALL\nfeature_completeness: required\nproduct_scope: approved\nprd_ready: approved\nprototype: null\nprototype_status: none\nprototype_feature: null\n---\n\n# PRD\n\n## Feature Capability Map\n\n| CAP | Promised outcome | Actor / trigger | Scope decision | Rationale |\n|---|---|---|---|---|\n| CAP-demo-01 | A user saves a value | user / save | required | core |\n\n## Current System Fit\n\n| CAP | Existing behavior / evidence | Fit decision | Required product delta |\n|---|---|---|---|\n| CAP-demo-01 | \`src/app.js\` stores nothing yet | extend | add saving |\n\n## Acceptance Criteria\n\n| AC | CAP | Observable behavior | Evidence |\n|---|---|---|---|\n| AC-demo-01 | CAP-demo-01 | Saving a value shows it in the list | focused automated test |\n`,
    'src/app.js': 'module.exports = {};\n',
    'package.json': '{"scripts":{"test":"node --test"}}\n',
    '.aioson/context/implementation-plan-demo.md': `---\nfeature: demo\nstatus: approved\nplan_contract: 2\nsource_prd: .aioson/context/prd-demo.md\nprototype: null\nprototype_status: none\nprototype_feature: null\n---\n\n# Implementation Plan — demo\n\n## Implementation Delta\n\n| CAP | Action | Existing evidence | Exact paths | Required change |\n|---|---|---|---|---|\n| CAP-demo-01 | modify | \`src/app.js\` exports nothing | src/app.js | add saving |\n\n## Capability Delivery Plan\n\n| CAP | Phase | Files | Verification |\n|---|---|---|---|\n| CAP-demo-01 | 1 | src/app.js | \`npm run test\` |\n\n## Phase 1 — save a value\n\n- CAP/AC: CAP-demo-01 / AC-demo-01\n- Verification: \`npm run test\`\n- Done when: AC-01 passes and the saved value is listed\n`
  });
  await approveAndSealSheldonReview(dir, 'demo');
  const logger = capture();
  const result = await runGateCheck({ args: [dir], options: { feature: 'demo', gate: 'C' }, logger });
  assert.equal(result.result, 'BLOCKED');
  const text = logger.lines.join('\n');
  assert.match(text, /- \[plan_ac_unknown\] Phase 1 cites undeclared AC-01/);
  assert.doesNotMatch(text, /BLOCKED — BLOCKED/);
  assert.doesNotMatch(text, /to produce and approve implementation-plan-demo\.md/);
});

test('memory:status on a project that never ran /discover reports and exits 0', async () => {
  const dir = await project({ '.aioson/context/project.context.md': '---\nclassification: MICRO\n---\n' });
  const status = await runMemoryStatus({ args: [dir], options: { json: true }, logger: capture() });
  assert.equal(status.ok, false, 'ok still says the memory is incomplete');
  assert.equal(status.exitCode, 0);
});

test("@quality's agent:done is a known agent with no canonical artifact, not a CONTRACTS-map warning", async () => {
  const dir = await project({
    '.aioson/context/workflow.state.json': JSON.stringify({ version: 1, mode: 'feature', featureSlug: 'demo', classification: 'MEDIUM', sequence: ['product', 'planner', 'dev', 'qa'], current: 'qa', completed: ['product', 'planner', 'dev'], skipped: [] })
  });
  await fs.mkdir(path.join(dir, '.aioson', 'runtime'), { recursive: true });
  const logger = capture();
  const result = await maybeAutoAdvanceWorkflow({ targetDir: dir, normalizedAgent: '@quality', options: {}, logger, t: (k) => k });
  assert.equal(result.skipped, 'no_canonical_artifact');
  assert.deepEqual(logger.lines.filter((l) => /CONTRACTS map/.test(l)), []);
});
