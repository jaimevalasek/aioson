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

async function tmp() { return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-workflow-next-')); }
async function write(root, rel, body) {
  const file = path.join(root, rel);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, body, 'utf8');
}
const logger = { log() {}, error() {}, warn() {} };
const { t } = createTranslator('en');

async function context(root, classification = 'SMALL') {
  await write(root, '.aioson/context/project.context.md', `---
project_name: demo
project_type: web_app
profile: developer
framework: Node.js
framework_installed: true
classification: ${classification}
interaction_language: en
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
function productPrd({ review = 'not_requested', readiness = 'approved', acceptance = true, classification = 'SMALL' } = {}) {
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
  const expected = ['product', 'planner', 'dev', 'qa'];
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
});

test('a Product-ready PRD advances directly to Planner', async () => {
  const root = await tmp();
  await context(root);
  await active(root);
  await write(root, '.aioson/context/prd-demo.md', productPrd());
  const result = await next(root);
  assert.equal(result.agent, 'planner');
  assert.deepEqual(result.completed, ['product']);
});

test('MEDIUM uses the same Product-to-Planner handoff without legacy artifacts', async () => {
  const root = await tmp();
  await context(root, 'MEDIUM');
  await active(root);
  await write(root, '.aioson/context/prd-demo.md', productPrd({ classification: 'MEDIUM' }));
  const result = await next(root);
  assert.equal(result.agent, 'planner');
  assert.deepEqual(result.completed, ['product']);
});

test('Sheldon remains available as an explicit custom detour', async () => {
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
  await write(root, '.aioson/context/implementation-plan-demo.md', plan());
  const result = await next(root);
  assert.equal(result.agent, 'dev');
  assert.deepEqual(result.completed, ['product', 'planner']);
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
  assert.deepEqual(loaded.state.sequence, ['product', 'planner', 'dev', 'qa']);
  const persisted = JSON.parse(await fs.readFile(path.join(root, '.aioson/context/workflow.state.json'), 'utf8'));
  assert.deepEqual(persisted.sequence, loaded.state.sequence);
});

test('custom workflow configuration remains an explicit opt-in escape hatch', async () => {
  const root = await tmp();
  await write(root, '.aioson/context/workflow.config.json', JSON.stringify({
    version: 1,
    feature: { SMALL: ['product', 'architect', 'planner', 'dev', 'qa'] }
  }));
  const loaded = await readWorkflowConfig(root);
  assert.equal(loaded.exists, true);
  assert.deepEqual(loaded.config.feature.SMALL, ['product', 'architect', 'planner', 'dev', 'qa']);
});

test('workflow skip cannot bypass Dev', () => {
  const config = buildDefaultWorkflowConfig();
  const state = {
    mode: 'feature', classification: 'SMALL', sequence: [...config.feature.SMALL],
    current: 'planner', next: 'dev', completed: ['product'], skipped: [], featureSlug: 'demo', detour: null
  };
  assert.throws(() => applySkip(config, state, 'qa'));
});

test('features parser ignores separators and returns active rows', () => {
  const features = parseFeaturesMarkdown('| slug | status | started | completed |\n|---|---|---|---|\n| a | done | 2026-01-01 | 2026-01-02 |\n| b | in_progress | 2026-01-03 | |\n');
  assert.equal(features.length, 2);
  assert.equal(features[1].slug, 'b');
});
