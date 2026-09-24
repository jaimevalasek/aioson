'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createTranslator } = require('../src/i18n');
const {
  buildDefaultWorkflowConfig,
  loadOrCreateState,
  parseFeaturesMarkdown,
  readWorkflowConfig,
  runWorkflowNext,
  applySkip
} = require('../src/commands/workflow-next');
const {
  approveAndSealSheldonReview,
  qaExecutionReport
} = require('./helpers/feature-evidence');

async function tmp() { return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-workflow-next-')); }
async function write(root, rel, body) {
  const file = path.join(root, rel);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, body, 'utf8');
}
const logger = { log() {}, error() {}, warn() {} };
const { t } = createTranslator('en');

async function context(root, classification = 'SMALL', autoHandoff = null) {
  const autoLine = autoHandoff === null ? '' : `auto_handoff: ${autoHandoff}\n`;
  await write(root, '.aioson/context/project.context.md', `---
project_name: demo
project_type: web_app
profile: developer
framework: Node.js
framework_installed: true
classification: ${classification}
${autoLine}interaction_language: en
conversation_language: en
aioson_version: 1.40.0
---
# Context
`);
}
async function active(root, slug = 'demo') {
  await write(root, '.aioson/context/features.md', `| slug | status | started | completed |
|---|---|---|---|
| ${slug} | in_progress | 2026-07-22 | |
`);
}
function productPrd({ review = 'pending', readiness = 'approved', acceptance = true, classification = 'SMALL' } = {}) {
  return `---\nclassification: ${classification}\nproduct_scope: approved\nprd_ready: ${readiness}\nsheldon_review: ${review}\n---\n# Demo\n\n## Feature Capability Map\n\n| CAP | Promised outcome | Actor / trigger | Scope decision | Rationale |\n|---|---|---|---|---|\n| CAP-demo-01 | User sees a saved result | User submits | required | Core promise |\n${acceptance ? `\n## Acceptance Criteria\n\n| AC | CAP | Observable behavior | Evidence |\n|---|---|---|---|\n| AC-demo-01 | CAP-demo-01 | Saved result appears | integration test |\n` : ''}`;
}
function plan() {
  return `---\nstatus: approved\n---\n# Plan\n\n## Capability Delivery Plan\n\n| CAP | Phase | Files | Verification |\n|---|---|---|---|\n| CAP-demo-01 | 1 | src/demo.js, tests/demo.test.js | node --test |\n`;
}
async function next(root, options = {}) {
  return runWorkflowNext({ args: [root], options: { tool: 'codex', ...options }, logger, t });
}

test('default SMALL and MEDIUM feature routes are identical and streamlined', () => {
  const config = buildDefaultWorkflowConfig();
  const expected = ['product', 'sheldon', 'planner', 'dev', 'qa'];
  assert.deepEqual(config.feature.MICRO, expected);
  assert.deepEqual(config.feature.SMALL, expected);
  assert.deepEqual(config.feature.MEDIUM, expected);
  for (const legacy of ['analyst', 'architect', 'pm', 'orchestrator', 'scope-check', 'discovery-design-doc']) {
    assert.equal(config.feature.MEDIUM.includes(legacy), false);
  }
});

test('fresh feature starts at Product', async () => {
  const root = await tmp();
  await context(root);
  await active(root);
  const result = await next(root);
  assert.equal(result.agent, 'product');
  assert.deepEqual(result.completed, []);
  assert.match(result.prompt, /Generated context retrieval — planning/);
  assert.match(result.prompt, /define the active feature PRD and current-system fit for feature demo/);
});

test('workflow activation applies direct --auto and --step overrides', async () => {
  const autoRoot = await tmp();
  await context(autoRoot, 'SMALL', false);
  await active(autoRoot);
  const autoResult = await next(autoRoot, { auto: true });
  assert.match(autoResult.prompt, /autopilot handoff is active/i);

  const stepRoot = await tmp();
  await context(stepRoot, 'SMALL', true);
  await active(stepRoot);
  const stepResult = await next(stepRoot, { step: true });
  assert.doesNotMatch(stepResult.prompt, /autopilot handoff is active/i);
});

test('a Product-ready PRD advances to mandatory Sheldon review', async () => {
  const root = await tmp();
  await context(root);
  await active(root);
  await write(root, '.aioson/context/prd-demo.md', productPrd());
  const result = await next(root);
  assert.equal(result.agent, 'sheldon');
  assert.deepEqual(result.completed, ['product']);
});

test('MEDIUM uses the same Product-to-Sheldon handoff without legacy artifacts', async () => {
  const root = await tmp();
  await context(root, 'MEDIUM');
  await active(root);
  await write(root, '.aioson/context/prd-demo.md', productPrd({ classification: 'MEDIUM' }));
  const result = await next(root);
  assert.equal(result.agent, 'sheldon');
  assert.deepEqual(result.completed, ['product']);
});

test('unrelated expected feature aborts before routing and preserves active workflow state', async () => {
  const root = await tmp();
  await context(root, 'MEDIUM');
  await active(root, 'play-service-distribution');
  await write(
    root,
    '.aioson/context/prd-play-service-distribution.md',
    productPrd({ classification: 'MEDIUM' })
  );
  const state = {
    version: 1,
    mode: 'feature',
    classification: 'MEDIUM',
    sequence: ['product', 'sheldon', 'planner', 'dev', 'qa'],
    current: 'sheldon',
    next: 'sheldon',
    completed: ['product'],
    skipped: [],
    featureSlug: 'play-service-distribution',
    detour: null,
    updatedAt: '2026-07-27T21:23:07.697Z'
  };
  const statePath = '.aioson/context/workflow.state.json';
  await write(root, statePath, `${JSON.stringify(state, null, 2)}\n`);
  const before = await fs.readFile(path.join(root, statePath), 'utf8');

  await assert.rejects(
    next(root, { 'expect-feature': 'draft-maintenance-harnesses' }),
    (error) => {
      assert.equal(error.code, 'WORKFLOW_FEATURE_MISMATCH');
      assert.equal(error.expectedFeature, 'draft-maintenance-harnesses');
      assert.equal(error.activeFeature, 'play-service-distribution');
      assert.match(error.message, /Simple Plan without workflow:next/);
      return true;
    }
  );

  const after = await fs.readFile(path.join(root, statePath), 'utf8');
  assert.equal(after, before);
  await assert.rejects(
    fs.access(path.join(root, '.aioson/context/workflow.events.jsonl')),
    { code: 'ENOENT' }
  );
  await assert.rejects(
    fs.access(path.join(root, '.aioson/context/last-handoff.json')),
    { code: 'ENOENT' }
  );
});

test('matching expected feature preserves normal workflow continuation', async () => {
  const root = await tmp();
  await context(root, 'MEDIUM');
  await active(root, 'play-service-distribution');
  await write(
    root,
    '.aioson/context/prd-play-service-distribution.md',
    productPrd({ classification: 'MEDIUM' })
  );

  const result = await next(root, { 'expect-feature': 'play-service-distribution' });
  assert.equal(result.agent, 'sheldon');
  assert.equal(result.featureSlug, 'play-service-distribution');
  assert.deepEqual(result.completed, ['product']);
});

test('project-mode expectation continues when no feature workflow is active', async () => {
  const root = await tmp();
  await context(root, 'SMALL');

  const result = await next(root, { 'expect-feature': 'none' });
  assert.equal(result.mode, 'project');
  assert.equal(result.featureSlug, null);
  assert.equal(result.agent, 'product');
});

test('feature mismatch is checked before a legacy workflow state can be reconciled', async () => {
  const root = await tmp();
  await context(root, 'MEDIUM');
  await active(root, 'play-service-distribution');
  const legacyState = {
    version: 1,
    mode: 'feature',
    classification: 'MEDIUM',
    sequence: ['product', 'planner', 'dev', 'qa'],
    current: 'planner',
    next: 'planner',
    completed: ['product'],
    skipped: [],
    featureSlug: 'play-service-distribution',
    detour: null,
    updatedAt: '2026-07-27T21:23:07.697Z'
  };
  const statePath = '.aioson/context/workflow.state.json';
  const original = `${JSON.stringify(legacyState, null, 2)}\n`;
  await write(root, statePath, original);

  await assert.rejects(
    next(root, { 'expect-feature': 'draft-maintenance-harnesses' }),
    { code: 'WORKFLOW_FEATURE_MISMATCH' }
  );

  assert.equal(await fs.readFile(path.join(root, statePath), 'utf8'), original);
});

test('workflow activation warns when project routing templates lag behind the CLI', async () => {
  const root = await tmp();
  await context(root);
  await active(root);
  await write(root, '.aioson/install.json', '{"template_version":"1.38.0"}\n');
  const warnings = [];

  const result = await runWorkflowNext({
    args: [root],
    options: { tool: 'codex', 'expect-feature': 'demo' },
    logger: { log() {}, error() {}, warn(message) { warnings.push(message); } },
    t
  });

  assert.equal(result.agent, 'product');
  assert.equal(result.templateVersion.status, 'outdated');
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /aioson update \./);
});

test('Sheldon remains mandatory when explicitly present in custom configuration', async () => {
  const root = await tmp();
  await context(root);
  await active(root);
  await write(root, '.aioson/context/workflow.config.json', JSON.stringify({
    version: 1,
    feature: { SMALL: ['product', 'sheldon', 'planner', 'dev', 'qa'] }
  }));
  await write(root, '.aioson/context/prd-demo.md', productPrd());
  const result = await next(root);
  assert.equal(result.agent, 'sheldon');
  assert.deepEqual(result.completed, ['product']);
});

test('an approved plan advances to Dev', async () => {
  const root = await tmp();
  await context(root);
  await active(root);
  await write(root, '.aioson/context/prd-demo.md', productPrd());
  await approveAndSealSheldonReview(root);
  await write(root, '.aioson/context/implementation-plan-demo.md', plan());
  const result = await next(root);
  assert.equal(result.agent, 'dev');
  assert.deepEqual(result.completed, ['product', 'sheldon', 'planner']);
});

test('QA FAIL uses one bounded DEV correction and returns to a final QA pass', async () => {
  const root = await tmp();
  await context(root);
  await active(root);
  await write(root, '.aioson/context/prd-demo.md', productPrd());
  await approveAndSealSheldonReview(root);
  await write(root, '.aioson/context/implementation-plan-demo.md', plan());
  await write(root, 'src/demo.js', 'module.exports = { saved: true };\n');
  await write(
    root,
    'tests/demo.test.js',
    "const test = require('node:test'); const assert = require('node:assert/strict'); test('AC-demo-01 saves result', () => assert.equal(require('../src/demo').saved, true));\n"
  );
  await write(
    root,
    '.aioson/context/qa-report-demo.md',
    '---\nverdict: FAIL\n---\n# QA Report\n\n## Verdict and blocking findings\n\nAC-demo-01 fails on the normal path.\n'
  );
  await write(root, '.aioson/context/workflow.state.json', JSON.stringify({
    version: 1,
    mode: 'feature',
    classification: 'SMALL',
    sequence: ['product', 'sheldon', 'planner', 'dev', 'qa'],
    current: 'qa',
    next: null,
    completed: ['product', 'sheldon', 'planner', 'dev'],
    skipped: [],
    featureSlug: 'demo',
    detour: null,
    updatedAt: new Date().toISOString()
  }));

  const correction = await next(root, { complete: 'qa' });
  assert.equal(correction.completedStage, null);
  assert.equal(correction.agent, 'dev');
  assert.equal(correction.reviewCycle.action, 'invoke_dev');
  assert.equal(correction.reviewCycle.cycle, 1);
  assert.deepEqual(correction.completed, ['product', 'sheldon', 'planner']);
  assert.match(correction.prompt, /Bounded QA correction cycle \(1\/1\)/);

  const devComplete = await next(root, { complete: 'dev' });
  assert.equal(devComplete.completedStage, 'dev');
  assert.equal(devComplete.agent, 'qa');
  assert.equal(devComplete.reviewCycle.action, 'invoke_qa');
  const resolvedCycle = JSON.parse(
    await fs.readFile(path.join(root, '.aioson/runtime/qa-dev-cycle.json'), 'utf8')
  );
  assert.equal(resolvedCycle.status, 'resolved');

  await write(root, '.aioson/context/qa-report-demo.md', qaExecutionReport({
    command: 'node --test tests/demo.test.js',
    entry: 'node src/demo.js'
  }));
  const passed = await next(root, { complete: 'qa' });
  assert.equal(passed.completedStage, 'qa');
  assert.equal(passed.agent, null);
  await assert.rejects(
    fs.access(path.join(root, '.aioson/runtime/qa-dev-cycle.json')),
    { code: 'ENOENT' }
  );
});

test('QA correction limit persists and blocks repeated re-entry', async () => {
  const root = await tmp();
  await context(root);
  await active(root);
  await write(root, '.aioson/context/prd-demo.md', productPrd());
  await approveAndSealSheldonReview(root);
  await write(root, '.aioson/context/implementation-plan-demo.md', plan());
  await write(root, '.aioson/context/qa-report-demo.md', '---\nverdict: FAIL\n---\n# QA Report\n\nBlocking defect.\n');
  const state = {
    version: 1,
    mode: 'feature',
    classification: 'SMALL',
    sequence: ['product', 'sheldon', 'planner', 'dev', 'qa'],
    current: 'qa',
    next: null,
    completed: ['product', 'sheldon', 'planner', 'dev'],
    skipped: [],
    featureSlug: 'demo',
    detour: null,
    updatedAt: new Date().toISOString()
  };
  await write(root, '.aioson/context/workflow.state.json', JSON.stringify(state));
  await next(root, { complete: 'qa' });

  await write(root, '.aioson/context/workflow.state.json', JSON.stringify(state));
  await assert.rejects(
    next(root, { complete: 'qa' }),
    /QA Cycle Limit Reached/
  );
  const exhausted = JSON.parse(
    await fs.readFile(path.join(root, '.aioson/runtime/qa-dev-cycle.json'), 'utf8')
  );
  assert.equal(exhausted.status, 'limit_reached');

  await assert.rejects(
    next(root, { complete: 'qa' }),
    /QA Cycle Limit Reached/
  );
});

test('a thin PRD does not falsely complete Product', async () => {
  const root = await tmp();
  await context(root);
  await active(root);
  await write(root, '.aioson/context/prd-demo.md', '---\nclassification: SMALL\n---\n# Thin\n');
  const result = await next(root);
  assert.equal(result.agent, 'product');
  assert.deepEqual(result.completed, []);
});

test('loadOrCreateState persists the canonical sequence', async () => {
  const root = await tmp();
  await context(root);
  await active(root);
  const loaded = await loadOrCreateState(root);
  assert.deepEqual(loaded.state.sequence, ['product', 'sheldon', 'planner', 'dev', 'qa']);
  const persisted = JSON.parse(await fs.readFile(path.join(root, '.aioson/context/workflow.state.json'), 'utf8'));
  assert.deepEqual(persisted.sequence, loaded.state.sequence);
});

test('legacy feature state rewinds to Sheldon when no current hash-bound review exists', async () => {
  const root = await tmp();
  await context(root);
  await active(root);
  await write(root, '.aioson/context/prd-demo.md', productPrd({ review: 'approved' }));
  await write(root, '.aioson/context/workflow.state.json', JSON.stringify({
    version: 1,
    mode: 'feature',
    classification: 'SMALL',
    sequence: ['product', 'planner', 'dev', 'qa'],
    current: 'dev',
    next: 'dev',
    completed: ['product', 'planner'],
    skipped: [],
    featureSlug: 'demo',
    detour: null,
    updatedAt: new Date().toISOString()
  }));

  const loaded = await loadOrCreateState(root);
  assert.deepEqual(loaded.state.sequence, ['product', 'sheldon', 'planner', 'dev', 'qa']);
  assert.deepEqual(loaded.state.completed, ['product']);
  assert.deepEqual(loaded.state.skipped, []);
  assert.equal(loaded.state.current, null);
  assert.equal(loaded.state.next, 'sheldon');
});

test('custom workflow configuration remains an explicit opt-in escape hatch', async () => {
  const root = await tmp();
  await write(root, '.aioson/context/workflow.config.json', JSON.stringify({
    version: 1,
    feature: { SMALL: ['product', 'orchestrator', 'architect', 'planner', 'dev', 'qa'] }
  }));
  const loaded = await readWorkflowConfig(root);
  assert.equal(loaded.exists, true);
  // a retired stage in a custom route is dropped; the live custom stage stays
  assert.deepEqual(loaded.config.feature.SMALL, ['product', 'orchestrator', 'sheldon', 'planner', 'dev', 'qa']);
});

test('workflow skip cannot bypass Dev', () => {
  const config = buildDefaultWorkflowConfig();
  const state = {
    mode: 'feature', classification: 'SMALL', sequence: [...config.feature.SMALL],
    current: 'planner', next: 'dev', completed: ['product'], skipped: [], featureSlug: 'demo', detour: null
  };
  assert.throws(() => applySkip(config, state, 'qa'));
});

test('workflow skip cannot bypass Sheldon', () => {
  const config = buildDefaultWorkflowConfig();
  const state = {
    mode: 'feature', classification: 'SMALL', sequence: [...config.feature.SMALL],
    current: 'product', next: 'sheldon', completed: ['product'], skipped: [], featureSlug: 'demo', detour: null
  };
  assert.throws(() => applySkip(config, state, 'planner'), /sheldon.*mandatory/i);
});

test('features parser ignores separators and returns active rows', () => {
  const features = parseFeaturesMarkdown('| slug | status | started | completed |\n|---|---|---|---|\n| a | done | 2026-01-01 | 2026-01-02 |\n| b | in_progress | 2026-01-03 | |\n');
  assert.equal(features.length, 2);
  assert.equal(features[1].slug, 'b');
});
