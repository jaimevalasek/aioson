'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
  analyzeFeatureCompleteness,
  findingsThroughStage,
  parseFirstMarkdownTable
} = require('../src/lib/feature-completeness');

async function tmp() { return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-feature-completeness-')); }
async function write(root, rel, body) {
  const file = path.join(root, rel);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, body, 'utf8');
}
function prd({ withAcceptance = true, withFit = true, cap = 'CAP-demo-01', ac = 'AC-demo-01' } = {}) {
  return `---\nclassification: SMALL\nfeature_completeness: required\nprototype: null\nprototype_status: none\nprototype_feature: null\n---\n# Demo\n\n## Feature Capability Map\n\n| CAP | Promised outcome | Actor / trigger | Scope decision | Rationale |\n|---|---|---|---|---|\n| ${cap} | User completes the core outcome | User submits | required | Approved scope |\n${withFit ? `\n## Current System Fit\n\n| CAP | Existing behavior / evidence | Fit decision | Required product delta |\n|---|---|---|---|\n| ${cap} | No existing behavior after inspecting package.json | new | Add the approved outcome through the normal entry point |\n` : ''}${withAcceptance ? `\n## Acceptance Criteria\n\n| AC | CAP | Observable behavior | Evidence |\n|---|---|---|---|\n| ${ac} | ${cap} | Result appears in the real application | integration test and runtime smoke |\n` : ''}`;
}
function plan({
  cap = 'CAP-demo-01',
  files = 'src/demo.js, tests/demo.test.js',
  withControls = true,
  withDelta = true,
  action = 'create',
  deltaPaths = files
} = {}) {
  return `---\nstatus: approved\n---\n# Plan\n${withControls ? `\n## Engineering Controls\n\n| Concern | Evidence / trigger | Planned control | Verification | Recovery |\n|---|---|---|---|---|\n| compatibility | package.json establishes the current Node runtime | Preserve the existing module contract | node --test | Revert the additive change; no persistent data |\n` : ''}${withDelta ? `\n## Implementation Delta\n\n| CAP | Action | Existing evidence | Exact paths | Required change |\n|---|---|---|---|---|\n| ${cap} | ${action} | Inspected the nearest boundary from package.json | ${deltaPaths} | Deliver the approved outcome through the existing project structure |\n` : ''}\n## Capability Delivery Plan\n\n| CAP | Phase | Files | Verification |\n|---|---|---|---|\n| ${cap} | 1 | ${files} | node --test |\n`;
}
async function seed(root, options = {}) {
  await write(root, '.aioson/context/project.context.md', '---\nclassification: SMALL\n---\n');
  await write(root, '.aioson/context/prd-demo.md', prd(options));
  await write(root, '.aioson/context/implementation-plan-demo.md', plan(options));
}

test('streamlined completeness accepts one PRD plus one implementation plan', async () => {
  const root = await tmp();
  await seed(root);
  const result = await analyzeFeatureCompleteness(root, 'demo');
  assert.equal(result.ok, true);
  assert.equal(result.summary.required_capabilities, 1);
  assert.equal(result.summary.current_system_fit_rows, 1);
  assert.equal(result.summary.acceptance_criteria, 1);
  assert.equal(result.summary.engineering_controls, 1);
  assert.equal(result.summary.leverage_rows, 1);
  assert.equal(result.summary.delivery_rows, 1);
  assert.equal(result.summary.lens_decisions, 0);
});

test('missing PRD capability map blocks Product without asking for requirements', async () => {
  const root = await tmp();
  await write(root, '.aioson/context/project.context.md', '---\nclassification: MEDIUM\n---\n');
  await write(root, '.aioson/context/prd-demo.md', '# Thin product promise\n');
  const result = await analyzeFeatureCompleteness(root, 'demo', { force: true });
  const product = findingsThroughStage(result, 'product');
  assert.ok(product.some((item) => item.check === 'feature_capability_map_missing'));
  assert.equal(product.some((item) => /requirements|architecture|readiness|conformance/i.test(item.message)), false);
});

test('missing current-system fit blocks Product when feature completeness is required', async () => {
  const root = await tmp();
  await seed(root, { withFit: false });
  const result = await analyzeFeatureCompleteness(root, 'demo');
  assert.ok(findingsThroughStage(result, 'product').some((item) => item.check === 'current_system_fit_missing'));
});

test('Product completeness requires an explicit current or none prototype declaration', async () => {
  const root = await tmp();
  await seed(root);
  const file = path.join(root, '.aioson/context/prd-demo.md');
  const content = await fs.readFile(file, 'utf8');
  await fs.writeFile(
    file,
    content.replace(/^prototype(?:_status|_feature)?:.*\n/gm, ''),
    'utf8'
  );

  const result = await analyzeFeatureCompleteness(root, 'demo');
  assert.ok(findingsThroughStage(result, 'product').some(
    (item) => item.check === 'prototype_prototype_status_missing'
  ));
});

test('Product completeness blocks a prototype borrowed from another feature', async () => {
  const root = await tmp();
  await seed(root);
  const file = path.join(root, '.aioson/context/prd-demo.md');
  const content = await fs.readFile(file, 'utf8');
  await fs.writeFile(
    file,
    content
      .replace('prototype: null', 'prototype: .aioson/briefings/closed-feature/prototype.html')
      .replace('prototype_status: none', 'prototype_status: current')
      .replace('prototype_feature: null', 'prototype_feature: demo')
      .concat(`

## Prototype contract
- status: current
- feature: demo
- prototype: .aioson/briefings/closed-feature/prototype.html
- manifest: .aioson/briefings/closed-feature/prototype-manifest.md
`),
    'utf8'
  );

  const result = await analyzeFeatureCompleteness(root, 'demo');
  assert.ok(findingsThroughStage(result, 'product').some(
    (item) => item.check === 'prototype_prototype_feature_mismatch'
  ));
});

test('Sheldon stage requires acceptance criteria inside the same PRD', async () => {
  const root = await tmp();
  await seed(root, { withAcceptance: false });
  const result = await analyzeFeatureCompleteness(root, 'demo');
  assert.ok(findingsThroughStage(result, 'specification').some((item) => item.check === 'acceptance_criteria_missing'));
});

test('acceptance criteria must reference a declared capability', async () => {
  const root = await tmp();
  await seed(root, { ac: 'AC-demo-01' });
  const file = path.join(root, '.aioson/context/prd-demo.md');
  await fs.appendFile(file, '\n');
  const content = (await fs.readFile(file, 'utf8')).replace('| AC-demo-01 | CAP-demo-01 |', '| AC-demo-01 | CAP-unknown-01 |');
  await fs.writeFile(file, content, 'utf8');
  const result = await analyzeFeatureCompleteness(root, 'demo');
  assert.ok(result.findings.some((item) => item.check === 'acceptance_criterion_cap_unknown'));
});

test('Planner stage requires exact paths and executable verification in one plan', async () => {
  const root = await tmp();
  await seed(root, { files: 'TBD' });
  const result = await analyzeFeatureCompleteness(root, 'demo');
  assert.ok(findingsThroughStage(result, 'plan').some((item) => item.check === 'capability_delivery_files_missing'));
});

test('Planner stage requires an implementation delta when feature completeness is required', async () => {
  const root = await tmp();
  await seed(root, { withDelta: false });
  const result = await analyzeFeatureCompleteness(root, 'demo');
  assert.ok(findingsThroughStage(result, 'plan').some((item) => item.check === 'implementation_delta_missing'));
});

test('Planner stage requires proportional engineering controls when feature completeness is required', async () => {
  const root = await tmp();
  await seed(root, { withControls: false });
  const result = await analyzeFeatureCompleteness(root, 'demo', { preImplementation: true });
  assert.ok(findingsThroughStage(result, 'plan').some((item) => item.check === 'engineering_controls_missing'));
});

test('post-implementation audits do not retroactively block a legacy plan that predates engineering controls', async () => {
  const root = await tmp();
  await seed(root, { withControls: false });
  const result = await analyzeFeatureCompleteness(root, 'demo');
  assert.equal(result.stage_findings.plan.some((item) => item.check === 'engineering_controls_missing'), false);
});

test('Planner may explicitly record no material engineering control after naming inspected boundaries', async () => {
  const root = await tmp();
  await seed(root);
  const planPath = path.join(root, '.aioson/context/implementation-plan-demo.md');
  const content = await fs.readFile(planPath, 'utf8');
  await fs.writeFile(
    planPath,
    content.replace(
      /## Engineering Controls[\s\S]*?(?=## Implementation Delta)/,
      '## Engineering Controls\n\nNo material cross-cutting engineering concern after inspecting `package.json` and `src/demo.js`.\n\n'
    ),
    'utf8'
  );
  const result = await analyzeFeatureCompleteness(root, 'demo');
  assert.equal(result.engineering_controls.explicitNone, true);
  assert.equal(result.stage_findings.plan.some((item) => item.check.startsWith('engineering_controls_')), false);
});

test('Gate C semantics require modify paths to exist and create paths to be absent', async () => {
  const root = await tmp();
  await seed(root, { files: 'src/demo.js', action: 'modify' });
  let result = await analyzeFeatureCompleteness(root, 'demo', { preImplementation: true });
  assert.ok(result.stage_findings.plan.some((item) => item.check === 'implementation_delta_existing_path_missing'));

  await write(root, 'src/demo.js', 'module.exports = true;\n');
  result = await analyzeFeatureCompleteness(root, 'demo', { preImplementation: true });
  assert.equal(findingsThroughStage(result, 'plan').length, 0);

  await write(root, '.aioson/context/implementation-plan-demo.md', plan({ files: 'src/demo.js', action: 'create' }));
  result = await analyzeFeatureCompleteness(root, 'demo', { preImplementation: true });
  assert.ok(result.stage_findings.plan.some((item) => item.check === 'implementation_delta_create_path_exists'));
});

test('stage-neutral audits allow create paths before or after implementation', async () => {
  const root = await tmp();
  await seed(root);

  let result = await analyzeFeatureCompleteness(root, 'demo');
  assert.equal(result.ok, true);

  await write(root, 'src/demo.js', 'module.exports = true;\n');
  await write(root, 'tests/demo.test.js', 'module.exports = true;\n');
  result = await analyzeFeatureCompleteness(root, 'demo');
  assert.equal(result.ok, true);
});

test('Capability Delivery Plan cannot contain a path absent from Implementation Delta', async () => {
  const root = await tmp();
  await seed(root, {
    files: 'src/demo.js, tests/demo.test.js',
    deltaPaths: 'src/demo.js'
  });
  const result = await analyzeFeatureCompleteness(root, 'demo');
  assert.ok(result.stage_findings.plan.some((item) => item.check === 'capability_delivery_path_unclassified'));
});

test('execution verifies that every planned path exists without a ledger or harness', async () => {
  const root = await tmp();
  await seed(root);
  let result = await analyzeFeatureCompleteness(root, 'demo', { includeExecution: true });
  assert.equal(result.ok, false);
  assert.ok(result.stage_findings.execution.some((item) => item.check === 'capability_delivery_files_missing'));
  await write(root, 'src/demo.js', 'module.exports = true;\n');
  await write(root, 'tests/demo.test.js', 'module.exports = true;\n');
  result = await analyzeFeatureCompleteness(root, 'demo', { includeExecution: true });
  assert.equal(result.ok, true);
});

test('execution expects retire paths to disappear after existing at Gate C', async () => {
  const root = await tmp();
  await seed(root, { files: 'src/legacy.js', action: 'retire' });
  await write(root, 'src/legacy.js', 'module.exports = true;\n');

  let result = await analyzeFeatureCompleteness(root, 'demo', { preImplementation: true });
  assert.equal(findingsThroughStage(result, 'plan').length, 0);

  result = await analyzeFeatureCompleteness(root, 'demo', { includeExecution: true });
  assert.ok(result.stage_findings.execution.some((item) => item.check === 'capability_retired_files_present'));

  await fs.rm(path.join(root, 'src/legacy.js'));
  result = await analyzeFeatureCompleteness(root, 'demo', { includeExecution: true });
  assert.equal(result.ok, true);
});

test('MICRO without a formal contract remains lightweight', async () => {
  const root = await tmp();
  await write(root, '.aioson/context/project.context.md', '---\nclassification: MICRO\n---\n');
  const result = await analyzeFeatureCompleteness(root, 'demo', { includeExecution: true });
  assert.equal(result.applicable, false);
  assert.equal(result.ok, true);
});

test('markdown table parser preserves escaped pipes and fails malformed rows closed', () => {
  const parsed = parseFirstMarkdownTable('| A | B |\n|---|---|\n| one \\| two | ok |\n| broken |');
  assert.equal(parsed.rows[0][0], 'one | two');
  assert.equal(parsed.malformed.length, 1);
});
