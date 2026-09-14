'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { runGateCheck } = require('../src/commands/gate-check');
const { runGateApprove } = require('../src/commands/gate-approve');
const { runPreflight } = require('../src/commands/preflight');
const { runArtifactValidate } = require('../src/commands/artifact-validate');
const {
  approveAndSealSheldonReview,
  qaExecutionReport
} = require('./helpers/feature-evidence');

async function tmp() { return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-gate-check-')); }
async function write(root, rel, body) {
  const file = path.join(root, rel);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, body, 'utf8');
}
const logger = { log() {}, error() {} };

function prd(readiness = 'approved') {
  return `---\nclassification: SMALL\nfeature_completeness: required\nproduct_scope: approved\nprd_ready: ${readiness}\nsheldon_review: pending\nprototype: null\nprototype_status: none\nprototype_feature: null\n---\n# Demo\n\n## Feature Capability Map\n\n| CAP | Promised outcome | Actor / trigger | Scope decision | Rationale |\n|---|---|---|---|---|\n| CAP-demo-01 | User sees saved result | User submits | required | Core promise |\n\n## Current System Fit\n\n| CAP | Existing behavior / evidence | Fit decision | Required product delta |\n|---|---|---|---|\n| CAP-demo-01 | No existing behavior after inspecting package.json | new | Add the saved result through the real app |\n\n## Acceptance Criteria\n\n| AC | CAP | Observable behavior | Evidence |\n|---|---|---|---|\n| AC-demo-01 | CAP-demo-01 | Saved result appears | automated integration test |\n`;
}
function plan(status = 'pending') {
  return `---\nstatus: ${status}\n---\n# Plan\n\n## Engineering Controls\n\n| Concern | Evidence / trigger | Planned control | Verification | Recovery |\n|---|---|---|---|---|\n| compatibility | package.json establishes the current Node runtime | Preserve the existing module contract | node --test | Revert the additive change; no persistent data |\n\n## Implementation Delta\n\n| CAP | Action | Existing evidence | Exact paths | Required change |\n|---|---|---|---|---|\n| CAP-demo-01 | create | Inspected the nearest boundary from package.json | src/demo.js, tests/demo.test.js | Add implementation and AC-linked coverage |\n\n## Capability Delivery Plan\n\n| CAP | Phase | Files | Verification |\n|---|---|---|---|\n| CAP-demo-01 | 1 | src/demo.js, tests/demo.test.js | node --test |\n`;
}
async function seed(root, { readiness = 'approved', status = 'pending' } = {}) {
  await write(root, '.aioson/context/project.context.md', '---\nclassification: SMALL\n---\n');
  await write(root, '.aioson/context/prd-demo.md', prd(readiness));
  await approveAndSealSheldonReview(root);
  await write(root, '.aioson/context/implementation-plan-demo.md', plan(status));
}

test('gate:check validates required CLI arguments', async () => {
  const root = await tmp();
  assert.equal((await runGateCheck({ args: [root], options: { json: true, gate: 'A' }, logger })).reason, 'missing_feature');
  assert.equal((await runGateCheck({ args: [root], options: { json: true, feature: 'demo' }, logger })).reason, 'missing_gate');
  assert.equal((await runGateCheck({ args: [root], options: { json: true, feature: 'demo', gate: 'Z' }, logger })).reason, 'invalid_gate');
  // A10: --slug é alias de --feature — passa da validação de feature
  assert.equal((await runGateCheck({ args: [root], options: { json: true, slug: 'demo' }, logger })).reason, 'missing_gate');
});

test('Gate A validates product capability scope in the PRD', async () => {
  const root = await tmp();
  await seed(root);
  const result = await runGateCheck({ args: [root], options: { json: true, feature: 'demo', gate: 'A' }, logger });
  assert.equal(result.result, 'PASS');
  assert.match(result.recommendation, /@product/);
});

test('Gate B validates acceptance criteria and routes to Sheldon', async () => {
  const root = await tmp();
  await seed(root);
  const result = await runGateCheck({ args: [root], options: { json: true, feature: 'demo', gate: 'B' }, logger });
  assert.equal(result.result, 'PASS');
  assert.match(result.recommendation, /@sheldon/);
});

test('Gate C requires one complete implementation plan for SMALL and MEDIUM', async () => {
  const root = await tmp();
  await write(root, '.aioson/context/project.context.md', '---\nclassification: MEDIUM\n---\n');
  await write(root, '.aioson/context/prd-demo.md', prd('approved'));
  await approveAndSealSheldonReview(root);
  let result = await runGateCheck({ args: [root], options: { json: true, feature: 'demo', gate: 'C' }, logger });
  assert.equal(result.result, 'BLOCKED');
  assert.match(result.recommendation, /@planner/);
  await write(root, '.aioson/context/implementation-plan-demo.md', plan());
  result = await runGateCheck({ args: [root], options: { json: true, feature: 'demo', gate: 'C' }, logger });
  assert.equal(result.result, 'PASS');
  assert.match(result.recommendation, /@dev/);
});

test('Gate C bloqueia feature runtime detectável sem harness-contract (A5)', async () => {
  const root = await tmp();
  await seed(root, { status: 'pending' });
  await write(root, '.aioson/briefings/demo/prototype-manifest.md', '# Core interactions\n');

  const result = await runGateCheck({ args: [root], options: { json: true, feature: 'demo', gate: 'C' }, logger });
  assert.equal(result.result, 'BLOCKED');
  assert.ok(
    result.missing.some((m) => m.includes('missing_runtime_contract')),
    result.missing.join('\n')
  );
  const harnessEvidence = result.evidence.find((e) => e.type === 'harness_contract');
  assert.equal(harnessEvidence.ok, false);
  assert.ok(harnessEvidence.runtime_signals.includes('prototype-manifest'));

  // com o contrato presente (stub RG-*) o gate de harness deixa de bloquear
  const { runHarnessInit } = require('../src/commands/harness');
  await runHarnessInit({ args: [root], options: { slug: 'demo' }, logger: { log() {}, error() {} }, t: () => undefined });
  const after = await runGateCheck({ args: [root], options: { json: true, feature: 'demo', gate: 'C' }, logger });
  const afterEvidence = after.evidence.find((e) => e.type === 'harness_contract');
  assert.equal(afterEvidence.ok, true, JSON.stringify(afterEvidence.errors));
});

// AC-lineage-014
test('Gate C routes review and lineage failures to their causal owners', async () => {
  const reviewRoot = await tmp();
  await seed(reviewRoot, { status: 'approved' });
  await fs.appendFile(path.join(reviewRoot, '.aioson/context/prd-demo.md'), '\n<!-- changed after review -->\n');
  const staleReview = await runGateCheck({
    args: [reviewRoot],
    options: { json: true, feature: 'demo', gate: 'C' },
    logger
  });
  assert.equal(staleReview.result, 'BLOCKED');
  assert.match(staleReview.recommendation, /@sheldon/);

  const lineageRoot = await tmp();
  await seed(lineageRoot, { status: 'approved' });
  const prdPath = path.join(lineageRoot, '.aioson/context/prd-demo.md');
  await fs.appendFile(prdPath, `

## Source Coverage
| Promise | Product decision | CAP / AC | Evidence / rationale |
|---|---|---|---|
| PROM-demo-01 | required | CAP-demo-01 / AC-demo-01 | Preserved |
`);
  await approveAndSealSheldonReview(lineageRoot);
  await write(lineageRoot, '.aioson/briefings/demo/briefings.md', `---
source_plans: ["plans/demo/missing.md"]
---

### Source Inventory
| Source | Path | Fingerprint | Purpose |
|---|---|---|---|
| SRC-demo-01 | plans/demo/missing.md | sha256:${'a'.repeat(64)} | Required source |

### Source Promise Map
| Promise | Source | Approved intent | State |
|---|---|---|---|
| PROM-demo-01 | SRC-demo-01 | Saved result | required |
`);
  const missingSource = await runGateCheck({
    args: [lineageRoot],
    options: { json: true, feature: 'demo', gate: 'C' },
    logger
  });
  assert.equal(missingSource.result, 'BLOCKED');
  assert.match(missingSource.recommendation, /briefing:migrate-lineage/);
});

// AC-lineage-018
test('Gate C recovers a missing legacy checkpoint from post-plan path evidence and rejects a newer plan', async () => {
  const root = await tmp();
  await seed(root, { status: 'approved' });

  await write(root, 'src/demo.js', 'module.exports = () => true;\n');
  const planPath = path.join(root, '.aioson/context/implementation-plan-demo.md');
  const sourcePath = path.join(root, 'src/demo.js');
  const oldTime = new Date('2026-07-27T10:00:00.000Z');
  const newTime = new Date('2026-07-27T10:01:00.000Z');
  await fs.utimes(planPath, oldTime, oldTime);
  await fs.utimes(sourcePath, newTime, newTime);
  let result = await runGateCheck({
    args: [root],
    options: { json: true, feature: 'demo', gate: 'C' },
    logger
  });
  assert.equal(result.result, 'PASS');
  assert.equal(
    result.evidence.find((item) => item.type === 'gate_c_baseline').mode,
    'recovered_execution'
  );
  const recoveredPreflight = await runPreflight({
    args: [root],
    options: { json: true, agent: 'dev', feature: 'demo' },
    logger
  });
  const recoveredArtifact = await runArtifactValidate({
    args: [root],
    options: { json: true, feature: 'demo' },
    logger
  });
  assert.equal(recoveredPreflight.gate_c_baseline.mode, 'recovered_execution');
  assert.equal(recoveredPreflight.readiness, 'READY');
  assert.equal(recoveredArtifact.gate_c_baseline.mode, 'recovered_execution');
  assert.equal(recoveredArtifact.integrity, 'VALID');

  const approved = await runGateApprove({
    args: [root],
    options: { json: true, feature: 'demo', gate: 'C', agent: 'planner' },
    logger
  });
  assert.equal(approved.ok, true);
  assert.equal(approved.checkpoint_written, true);

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
  assert.ok(result.missing.some((item) => item.includes('gate_c_recovery_plan_newer_than_execution')));
  assert.match(result.recommendation, /revalidate implementation-plan-demo\.md/);
});

test('Gate D requires plan approval, QA PASS, real files, and AC-linked assertions', async () => {
  const root = await tmp();
  await seed(root, { readiness: 'approved', status: 'approved' });
  await write(root, 'src/demo.js', 'module.exports = () => true;\n');
  await write(root, 'tests/demo.test.js', "const test=require('node:test'); const assert=require('node:assert/strict'); test('AC-demo-01',()=>assert.equal(true,true));\n");
  await write(root, '.aioson/context/qa-report-demo.md', qaExecutionReport());
  const result = await runGateCheck({ args: [root], options: { json: true, feature: 'demo', gate: 'D' }, logger });
  assert.equal(result.result, 'PASS');
});

test('Gate D rejects a PASS label without AC test evidence', async () => {
  const root = await tmp();
  await seed(root, { readiness: 'approved', status: 'approved' });
  await write(root, 'src/demo.js', 'module.exports = () => true;\n');
  await write(root, 'tests/demo.test.js', "const test=require('node:test'); test('unrelated',()=>{});\n");
  await write(root, '.aioson/context/qa-report-demo.md', qaExecutionReport());
  const result = await runGateCheck({ args: [root], options: { json: true, feature: 'demo', gate: 'D' }, logger });
  assert.equal(result.result, 'BLOCKED');
  assert.ok(result.missing.some((item) => item.includes('AC test audit')));
});

async function seedConditional(root) {
  await seed(root, { status: 'approved' });
  await write(root, 'src/demo.js', 'module.exports = () => true;\n');
  await write(root, 'tests/demo.test.js', "const test=require('node:test'); const assert=require('node:assert/strict'); test('AC-demo-01',()=>assert.equal(require('../src/demo')(),true));\n");
  const prdPath = path.join(root, '.aioson/context/prd-demo.md');
  await fs.appendFile(prdPath, '| AC-demo-02 | CAP-demo-01 | Caption uses current terminology | visual check |\n');
  await approveAndSealSheldonReview(root);
  const report = qaExecutionReport({ verdict: 'accepted_with_followups' }).replace('\n\n## Commands executed', '\n| CAP-demo-01 | AC-demo-02 | FAIL | Inspected saved result: caption uses legacy terminology |\n\n## Commands executed');
  await write(root, '.aioson/context/qa-report-demo.md', report);
  await write(root, '.aioson/context/features.md', '| demo | in_progress | 2026-09-08 | active |\n');
  await write(root, '.aioson/closure-policy.json', JSON.stringify({ schema_version: 1, enabled: true, auto_close: true, allow_secondary_ac_deferral: true, authorized_by: 'test-owner' }));
  const input = { schema_version: 1, findings: [{ id: 'caption', severity: 'low', kind: 'wording', verified: true,
    risk: { primary_flow: false, data_loss: false, security: false, availability: false },
    summary: 'Correct result caption', reproduction: 'Save a value and inspect the caption.', expected: 'Caption uses approved terminology.',
    observed: 'Caption uses legacy terminology.', verification: 'node --test tests/demo.test.js and inspect caption',
    rationale: 'Values save and load correctly; caption is readable.', files: ['src/demo.js'], ac_ids: ['AC-demo-02'] }] };
  await require('../src/lib/delivery-followups').prepareFollowups(root, 'demo', input);
  return { report, input };
}

test('conditional Gate D preserves QA FAIL, closes, archives and exposes one pending plan', async t => {
  const root = await tmp(); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const { report } = await seedConditional(root);
  const check = await runGateCheck({ args: [root], options: { feature: 'demo', gate: 'D', json: true }, logger });
  assert.equal(check.ok, true, JSON.stringify(check.missing));
  assert.equal(check.disposition, 'accepted_with_followups');
  const approved = await runGateApprove({ args: [root], options: { feature: 'demo', gate: 'D', json: true }, logger });
  assert.equal(approved.ok, true, JSON.stringify(approved));
  assert.equal(await fs.readFile(path.join(root, '.aioson/context/qa-report-demo.md'), 'utf8'), report);
  const { runFeatureClose } = require('../src/commands/feature-close');
  assert.equal((await runFeatureClose({ args: [root], options: { feature: 'demo', verdict: 'PASS', force: true, json: true }, logger })).reason, 'closure_verdict_mismatch');
  const closed = await runFeatureClose({ args: [root], options: { feature: 'demo', verdict: 'ACCEPTED_WITH_FOLLOWUPS', json: true }, logger });
  assert.equal(closed.ok, true, JSON.stringify(closed));
  assert.equal(closed.followup_plans.length, 1);
  assert.equal(await fs.readFile(path.join(root, '.aioson/context/done/demo/qa-report-demo.md'), 'utf8'), report);
  assert.match(await fs.readFile(path.join(root, '.aioson/context/features.md'), 'utf8'), /done/);
  const { runFeatureClosure } = require('../src/commands/feature-closure');
  const pending = await runFeatureClosure({ args: [root], options: { list: true, json: true }, logger });
  assert.equal(pending.plans.length, 1);
  assert.equal(pending.plans[0].status, 'pending');
  const evaluation = await require('../src/lib/delivery-followups').evaluateFollowups(root, 'demo');
  assert.equal(evaluation.eligible, true, JSON.stringify(evaluation));
  await require('../src/lib/delivery-followups').persistFollowupPlans(root, 'demo', evaluation);
  assert.equal((await runFeatureClosure({ args: [root], options: { list: true }, logger })).plans.length, 1);
  const repeated = await runFeatureClose({ args: [root], options: { feature: 'demo', verdict: 'ACCEPTED_WITH_FOLLOWUPS', json: true }, logger });
  assert.equal(repeated.ok, true, JSON.stringify(repeated));
  assert.equal(repeated.followup_plans.length, 1);
});

test('conditional close cannot lose debt on write conflict or bypass security', async t => {
  const root = await tmp(); t.after(() => fs.rm(root, { recursive: true, force: true }));
  await seedConditional(root);
  await write(root, '.aioson/context/simple-plans/demo-followup-caption.md', '# Owner work');
  const { runFeatureClose } = require('../src/commands/feature-close');
  const result = await runFeatureClose({ args: [root], options: { feature: 'demo', verdict: 'ACCEPTED_WITH_FOLLOWUPS', json: true }, logger });
  assert.equal(result.reason, 'followup_persistence_failed', JSON.stringify(result));
  assert.match(await fs.readFile(path.join(root, '.aioson/context/features.md'), 'utf8'), /in_progress/);
  await write(root, '.aioson/context/security-findings-demo.json', JSON.stringify({ findings: [{ status: 'open', severity: 'critical', recommended_gate_status: 'block' }], review_contract: { scope_mode: 'focused', evidence_policy: 'verified', findings_artifact_path: '.aioson/context/security-findings-demo.json' } }));
  const blocked = await runGateCheck({ args: [root], options: { feature: 'demo', gate: 'D', json: true }, logger });
  assert.equal(blocked.ok, false);
  assert.match(JSON.stringify(blocked.missing), /security|closure_followups/);
});

test('automatic close honors step and policy, and only runs after final QA', async t => {
  const root = await tmp(); t.after(() => fs.rm(root, { recursive: true, force: true }));
  await seedConditional(root);
  const { closeAfterQa } = require('../src/lib/delivery-lifecycle');
  const completion = { completedStage: 'qa', featureSlug: 'demo', nextAgent: null };
  assert.equal(await closeAfterQa(root, { ...completion, step: true }, logger), null);
  assert.equal(await closeAfterQa(root, { ...completion, completedStage: 'dev' }, logger), null);
  assert.equal(await closeAfterQa(root, { ...completion, nextAgent: 'dev' }, logger), null);
  const result = await closeAfterQa(root, completion, logger);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.attempted, true);
  assert.equal(result.followup_plans.length, 1);
});


test('workflow final QA performs authorized closure after retiring workflow state', async t => {
  const root = await tmp(); t.after(() => fs.rm(root, { recursive: true, force: true }));
  await seedConditional(root);
  await write(root, '.aioson/context/project.context.md', '---\nproject_name: demo\nproject_type: web_app\nprofile: developer\nframework: Node.js\nframework_installed: true\nclassification: SMALL\ninteraction_language: en\nconversation_language: en\naioson_version: 1.65.0\n---\n');
  await write(root, '.aioson/context/features.md', '| slug | status | started | completed |\n|---|---|---|---|\n| demo | in_progress | 2026-09-08 | |\n');
  await write(root, '.aioson/context/workflow.state.json', JSON.stringify({ version: 1, mode: 'feature', classification: 'SMALL', sequence: ['product', 'sheldon', 'planner', 'dev', 'qa'], current: 'qa', next: null, completed: ['product', 'sheldon', 'planner', 'dev'], skipped: [], featureSlug: 'demo', detour: null, updatedAt: new Date().toISOString() }));
  const { t: translate } = require('../src/i18n').createTranslator('en');
  const result = await require('../src/commands/workflow-next').runWorkflowNext({ args: [root], options: { tool: 'codex', complete: 'qa', 'expect-feature': 'demo' }, logger, t: translate });
  assert.equal(result.completedStage, 'qa', JSON.stringify(result));
  assert.equal(result.closure?.ok, true, JSON.stringify(result.closure));
  await assert.rejects(fs.access(path.join(root, '.aioson/context/workflow.state.json')), { code: 'ENOENT' });
  assert.equal(result.closure.followup_plans.length, 1);
});


test('Gate C enforces v2 AC phases and content binding without retroactive legacy rejection', async t => {
  const root = await tmp(); t.after(() => fs.rm(root, { recursive: true, force: true }));
  await seed(root);
  const planPath = path.join(root, '.aioson/context/implementation-plan-demo.md');
  let body = plan().replace('status: pending', 'status: pending\nplan_contract: 2') + '\n## Phase 1 — Deliver saved result\n- CAP/AC: CAP-demo-01, AC-demo-01\n- Verification: node --test tests/demo.test.js\n- Done when: Saved value appears through the real application.\n';
  await fs.writeFile(planPath, body);
  const { handleBind } = require('../src/commands/implementation-plan');
  assert.equal((await handleBind(root, 'demo', { logger })).ok, true);
  const options = { feature: 'demo', gate: 'C', json: true };
  let result = await runGateCheck({ args: [root], options, logger });
  assert.equal(result.ok, true, JSON.stringify(result.missing));
  body = await fs.readFile(planPath, 'utf8');
  await fs.writeFile(planPath, body.replace('AC-demo-01', 'AC-phantom'));
  result = await runGateCheck({ args: [root], options, logger });
  assert.equal(result.ok, false);
  assert.match(result.missing.join(' '), /plan_ac_unknown/);
  assert.match(result.missing.join(' '), /plan_ac_uncovered/);
  await fs.writeFile(planPath, body);
  await fs.appendFile(path.join(root, '.aioson/context/prd-demo.md'), '\nOwner changed the result caption.\n');
  await approveAndSealSheldonReview(root);
  result = await runGateCheck({ args: [root], options, logger });
  assert.equal(result.ok, false);
  assert.match(result.missing.join(' '), /plan_source_stale/);
});
