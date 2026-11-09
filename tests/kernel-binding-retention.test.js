'use strict';

// The five canonical chain kernels were slimmed (2026-11) by moving
// conditional procedure into routed docs behind one-line triggers. These tests
// prove nothing binding left with it:
//   - every hard-constraint bullet each kernel had is still in it, verbatim
//     (tests/fixtures/kernel-binding/hard-constraints.json, extracted from the
//     kernels as they stood before the change);
//   - every gate and stage command each kernel ran is still in it;
//   - every section that moved left its trigger in the kernel, and the routed
//     doc carries the procedure (context:evals proves each doc is selected for
//     a task that needs it and stays out of an unrelated one).
// Template and workspace copies must stay identical.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const KERNELS = ['product', 'sheldon', 'planner', 'dev', 'qa'];
const BASELINE = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'kernel-binding', 'hard-constraints.json'), 'utf8'));

const read = (rel) => fs.readFileSync(path.join(ROOT, 'template', rel), 'utf8').replace(/\r\n/g, '\n');
const kernel = (name) => read(`.aioson/agents/${name}.md`);

const GATE_COMMANDS = {
  dev: [
    'aioson dev:resume-data . --feature={slug} --phase={n} --capsule',
    'aioson context:brief . --agent=dev --mode=executing --feature={slug}',
    'aioson preflight . --agent=dev --feature={slug}',
    'aioson gate:check . --feature={slug} --gate=C',
    'aioson prototype:check . --feature={slug} --strict',
    'aioson dev:resume-data . --json',
    'aioson feature:trace . --feature={slug} --json',
    'aioson dossier:add-finding . --slug={slug} --agent=dev',
    'aioson harness:init . --slug={slug}',
    'aioson harness:check',
    'aioson ac:test-audit . --feature={slug} --strict',
    'aioson dev:state:write . --feature={slug} --phase={n}',
    'aioson workflow:next . --complete=dev',
    'aioson pulse:update . --agent=dev',
    'aioson agent:done . --agent=dev',
    'Next agent: @qa'
  ],
  qa: [
    'aioson context:brief . --agent=qa --mode=executing --feature={slug}',
    'aioson preflight . --agent=qa --feature={slug}',
    'aioson prototype:check . --feature={slug} --strict',
    'aioson ac:test-audit . --feature={slug} --strict',
    'aioson brain:query . --agent=qa --tags=interaction,forms --min-quality=4',
    'aioson feature:trace . --feature={slug} --json',
    'aioson browser:run . --script=<file> --url=<entry> --slug={slug}',
    'aioson rules:check . --changed',
    'aioson workflow:next . --complete=qa',
    'aioson gate:check . --feature={slug} --gate=D',
    'aioson gate:approve . --feature={slug} --gate=D',
    'aioson dossier:add-finding . --slug={slug} --agent=qa',
    'aioson pulse:update . --agent=qa',
    'aioson agent:done . --agent=qa'
  ],
  product: [
    'aioson feature:current . --json',
    'aioson verify:artifact . --kind=sources --slug={slug}',
    'prototype:check --strict',
    'aioson feature:register . --feature={slug}',
    'aioson brain:query . --agent=product --tags=spec-quality --min-quality=4',
    'aioson context:brief . --agent=product --mode=planning',
    'aioson artifact:validate . --feature={slug}',
    'aioson prototype:check . --feature={slug} --strict',
    'aioson verify:artifact . --kind=prd --slug={slug} --advisory',
    'aioson classify . --feature={slug} --apply --json',
    'aioson dossier:add-finding . --slug={slug} --agent=product',
    'aioson pulse:update . --agent=product',
    'aioson agent:done . --agent=product',
    'Next agent: @sheldon'
  ],
  planner: [
    'aioson feature:trace . --feature={slug} --json',
    'aioson context:brief . --agent=planner --mode=planning',
    'aioson preflight . --agent=planner --feature={slug}',
    'aioson prototype:check . --feature={slug} --strict',
    'aioson plan:bind . --feature={slug}',
    'aioson execution:offer . --feature={slug} --json',
    'aioson execution:configure . --feature={slug} --json',
    'aioson execution:compile . --feature={slug}',
    'aioson execution:dashboard . --feature={slug}',
    'aioson gate:check . --feature={slug} --gate=C',
    'aioson gate:approve . --feature={slug} --gate=C',
    'aioson dossier:add-finding . --slug={slug} --agent=planner',
    'aioson pulse:update . --agent=planner',
    'aioson agent:done . --agent=planner',
    'Next agent: @dev'
  ],
  sheldon: [
    'aioson verify:artifact . --kind=sources --slug={slug}',
    'aioson context:brief . --agent=sheldon --mode=planning',
    'aioson prototype:check . --feature={slug} --strict',
    'aioson verify:artifact . --kind=sources --slug={slug} --advisory',
    'aioson verify:artifact . --kind=prd --slug={slug} --advisory',
    'aioson brain:query . --agent=sheldon --tags=spec-quality --min-quality=4',
    'aioson classify . --feature={slug} --apply --json',
    'aioson verify:artifact . --kind=prd --slug={slug}`',
    'aioson review:prepare . --agent=sheldon --feature={slug}',
    'aioson review:check . --agent=sheldon --feature={slug}',
    'aioson dossier:add-finding . --slug={slug} --agent=sheldon',
    'aioson pulse:update . --agent=sheldon',
    'aioson agent:done . --agent=sheldon',
    'Next agent: @planner'
  ]
};

// Each moved section: the trigger the kernel keeps, and what the routed doc holds.
const ROUTED = [
  {
    kernel: 'dev',
    trigger: ['`.aioson/docs/dev/neural-chain-queue.md` — the activation context lists `NC-*` work items.'],
    doc: '.aioson/docs/dev/neural-chain-queue.md',
    holds: ['aioson chain:claim . --id=<NC-id> --agent=<self> --json', 'aioson chain:resolve', 'Release the claim when the current session cannot finish it.', 'Never modify an item claimed by another run.', 'DEV remains integration owner.']
  },
  {
    kernel: 'dev',
    trigger: ['`dev_auto_resume` / `dev_drift_detected`', '`.aioson/docs/dev/continuity-recovery.md`', 'three bounded options'],
    doc: '.aioson/docs/dev/continuity-recovery.md',
    holds: ['aioson runtime:emit . --agent=dev --type=dev_auto_resume', 'aioson runtime:emit . --agent=dev --type=dev_drift_detected']
  },
  {
    kernel: 'dev',
    trigger: ['`.aioson/docs/dev/execution-lanes.md` — only when `agent-execution-{slug}.json` declares `development_lanes.strategy: split`'],
    doc: '.aioson/docs/dev/execution-lanes.md',
    holds: ['aioson agent:execution:dispatch', 'Do not create frontend/backend lanes merely because both surfaces exist.']
  },
  {
    kernel: 'qa',
    trigger: ['`.aioson/context/security-findings-{slug}.json` exists, QA adjudicates every open finding per `.aioson/docs/qa/security-findings.md`; an unadjudicated Critical/High security finding blocks the verdict.'],
    doc: '.aioson/docs/qa/security-findings.md',
    holds: ['`fixed` — only after rerunning the finding\'s reproduction', '`false_positive` — with the disproving evidence', '`accepted_risk` — only with an explicit user/product decision', 'treat an unadjudicated Critical/High security finding as a blocking issue for the verdict']
  },
  {
    kernel: 'qa',
    trigger: ['Load `.aioson/docs/qa/evidence-shape.md` immediately before writing it', 'exact columns `CAP | AC | Result | Evidence`', '`Entry`, `Trigger`, `Real boundary`, `State change`, and `Visible result`'],
    doc: '.aioson/docs/qa/evidence-shape.md',
    holds: ['verdict: pass', 'production_entry: exact command/window/route', '| CAP | AC | Result | Evidence |', '- Real boundary: real handler/API/IPC/persistence boundary reached', 'the exact reproduction command;', 'Prose-only findings are not a valid FAIL report.']
  },
  {
    kernel: 'planner',
    trigger: ['Load `.aioson/docs/planner/plan-contract.md` immediately before writing'],
    doc: '.aioson/docs/planner/plan-contract.md',
    holds: ['plan_contract: 2', 'sheldon_review: required', '| Concern | Evidence / trigger | Planned control | Verification | Recovery |', '| CAP | Action | Existing evidence | Exact paths | Required change |', '| CAP | Phase | Files | Verification |', '- Done when: [binary observable result]']
  },
  {
    kernel: 'planner',
    trigger: ['add one `## Execution Sequence` table (`| Phase | Wave | Files | Scope | Done when |`)', 'Before writing or compiling this table, load `.aioson/docs/planner/orchestrated-execution.md`'],
    doc: '.aioson/docs/planner/orchestrated-execution.md',
    holds: ['| 1-backend | 1 | src/api/real.ext, tests/api/real.test.ext | CAP-{slug}-main | api command passes |']
  },
  {
    kernel: 'product',
    trigger: ['to the letter of `.aioson/docs/product/prd-contract.md`, loaded before writing'],
    doc: '.aioson/docs/product/prd-contract.md',
    holds: ['identity_status: current', '| Promise | Product decision | CAP / AC | Evidence / rationale |', '| CAP | Existing behavior / evidence | Fit decision | Required product delta |', 'record `prototype: none`, `manifest: none`, and every discovered old path under `excluded historical references` with its owning slug/status', 'The same section carries one `identity:` line matching the frontmatter binding.', '`kind=prd` hard-fails a PRD without this table']
  }
];

test('every hard-constraint bullet each chain kernel had before the slimming is still in it, verbatim', () => {
  for (const name of KERNELS) {
    const bullets = BASELINE.kernels[name];
    assert.ok(Array.isArray(bullets) && bullets.length >= 10, `${name}: baseline lists its hard constraints`);
    const text = kernel(name);
    const section = text.slice(text.indexOf('## Hard constraints\n'), text.indexOf('\n## ', text.indexOf('## Hard constraints\n') + 5));
    for (const bullet of bullets) {
      assert.ok(section.includes(`- ${bullet}`), `${name}: hard constraint left the kernel:\n${bullet}`);
    }
  }
});

test('every gate and stage command each chain kernel ran is still in the kernel', () => {
  for (const name of KERNELS) {
    const text = kernel(name);
    for (const command of GATE_COMMANDS[name]) {
      assert.ok(text.includes(command), `${name}: gate/stage command missing from the kernel: ${command}`);
    }
  }
});

test('every section moved out of a chain kernel left its trigger there, and its routed doc holds the procedure', () => {
  for (const entry of ROUTED) {
    const text = kernel(entry.kernel);
    for (const line of entry.trigger) assert.ok(text.includes(line), `${entry.kernel}: trigger missing: ${line}`);
    const doc = read(entry.doc);
    assert.match(doc, /^---\n[\s\S]*?\bagents: \[[^\]]*\b/, `${entry.doc} is a routed doc with frontmatter`);
    for (const line of entry.holds) assert.ok(doc.includes(line), `${entry.doc}: moved procedure missing: ${line}`);
    const { MANAGED_FILES } = require('../src/constants');
    assert.ok(MANAGED_FILES.includes(entry.doc), `${entry.doc} ships to installed projects`);
  }
});

test('template and workspace copies of the slimmed kernels and their routed docs are identical', () => {
  // execution-lanes.md is only read here, never edited by the slimming; its
  // copies are compared where that doc is owned.
  const docs = new Set(ROUTED.map((entry) => entry.doc).filter((rel) => rel !== '.aioson/docs/dev/execution-lanes.md'));
  const rels = [...KERNELS.map((name) => `.aioson/agents/${name}.md`), ...docs];
  for (const rel of rels) {
    const template = fs.readFileSync(path.join(ROOT, 'template', rel), 'utf8');
    const workspace = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    assert.equal(workspace, template, `${rel}: template/workspace drift`);
  }
});
