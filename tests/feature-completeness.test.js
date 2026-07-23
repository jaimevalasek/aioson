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
function prd({ withAcceptance = true, cap = 'CAP-demo-01', ac = 'AC-demo-01' } = {}) {
  return `---\nclassification: SMALL\nfeature_completeness: required\n---\n# Demo\n\n## Feature Capability Map\n\n| CAP | Promised outcome | Actor / trigger | Scope decision | Rationale |\n|---|---|---|---|---|\n| ${cap} | User completes the core outcome | User submits | required | Approved scope |\n${withAcceptance ? `\n## Acceptance Criteria\n\n| AC | CAP | Observable behavior | Evidence |\n|---|---|---|---|\n| ${ac} | ${cap} | Result appears in the real application | integration test and runtime smoke |\n` : ''}`;
}
function plan({ cap = 'CAP-demo-01', files = 'src/demo.js, tests/demo.test.js' } = {}) {
  return `---\nstatus: approved\n---\n# Plan\n\n## Capability Delivery Plan\n\n| CAP | Phase | Files | Verification |\n|---|---|---|---|\n| ${cap} | 1 | ${files} | node --test |\n`;
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
  assert.equal(result.summary.acceptance_criteria, 1);
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
