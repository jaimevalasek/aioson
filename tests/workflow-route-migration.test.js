'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
  loadOrCreateState, runWorkflowNext, STATE_RELATIVE_PATH, featureStateArchivePath
} = require('../src/commands/workflow-next');
const { approveAndSealSheldonReview } = require('./helpers/feature-evidence');

const CANONICAL = ['product', 'sheldon', 'planner', 'dev', 'qa'];
const LEGACY = ['product', 'analyst', 'scope-check', 'architect', 'discovery-design-doc', 'dev', 'qa'];
const PRD = `---
classification: SMALL
product_scope: approved
prd_ready: approved
sheldon_review: pending
---
# Demo
## Feature Capability Map
| CAP | Promised outcome | Actor / trigger | Scope decision | Rationale |
|---|---|---|---|---|
| CAP-demo-01 | User sees a saved result | User submits | required | Core promise |
## Acceptance Criteria
| AC | CAP | Observable behavior | Evidence |
|---|---|---|---|
| AC-demo-01 | CAP-demo-01 | Saved result appears | integration test |
`;
const logger = { log() {}, warn() {}, error() {} };
async function write(root, rel, body) {
  const file = path.join(root, rel);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, typeof body === 'string' ? body : JSON.stringify(body));
}
async function fixture(t, { archived = false, mode = 'feature', sequence = LEGACY, ...progress } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-route-migration-'));
  t.after(() => fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  await write(root, '.aioson/context/project.context.md', '---\nproject_name: migration\nproject_type: script\nprofile: developer\nframework: Node.js\nframework_installed: true\nclassification: SMALL\ninteraction_language: en\n---\n');
  if (mode === 'feature') {
    await write(root, '.aioson/context/features.md', '| slug | status | started | completed |\n|---|---|---|---|\n| demo | in_progress | 2026-09-09 | |\n');
  }
  const state = {
    version: 1, mode, classification: 'SMALL', sequence,
    current: 'analyst', next: 'scope-check', completed: ['product'], skipped: [],
    featureSlug: mode === 'feature' ? 'demo' : null, detour: null, ...progress
  };
  const stateFile = archived ? featureStateArchivePath(root, 'demo') : path.join(root, STATE_RELATIVE_PATH);
  await write(root, path.relative(root, stateFile), state);
  return { root, stateFile, state };
}

for (const archived of [false, true]) {
  test(`${archived ? 'archived' : 'live'} legacy progress resumes the canonical route without Analyst`, async (t) => {
    const { root, stateFile } = await fixture(t, { archived });
    const before = await fs.readFile(stateFile, 'utf8');
    const preview = await loadOrCreateState(root, { persist: false });
    assert.deepEqual(preview.state.sequence, CANONICAL);
    assert.deepEqual(preview.state.completed, ['product']);
    assert.equal(preview.state.current, null);
    assert.equal(preview.state.next, 'sheldon');
    assert.equal(await fs.readFile(stateFile, 'utf8'), before, 'status must not rewrite or consume the old state');
    const loaded = await loadOrCreateState(root);
    assert.deepEqual(loaded.state.sequence, CANONICAL);
    const saved = JSON.parse(await fs.readFile(path.join(root, STATE_RELATIVE_PATH), 'utf8'));
    assert.equal(saved.next, 'sheldon');
    assert.equal((await loadOrCreateState(root)).changed, false, 'migration is idempotent');
    if (archived) assert.equal(await fs.access(stateFile).then(() => true, () => false), false);
  });
}

test('project-mode legacy defaults gain Product, Sheldon and Planner as well', async (t) => {
  const { root } = await fixture(t, {
    mode: 'project', sequence: ['setup', 'product', 'analyst', 'architect', 'dev', 'qa'],
    completed: ['setup', 'product']
  });
  const result = await loadOrCreateState(root, { persist: false });
  assert.deepEqual(result.state.sequence, ['setup', ...CANONICAL]);
  assert.equal(result.state.next, 'sheldon');
  assert.deepEqual(result.state.completed, ['setup', 'product']);
});

test('an explicit configured specialist route survives a restore', async (t) => {
  const sequence = ['product', 'analyst', 'sheldon', 'planner', 'dev', 'qa'];
  const { root } = await fixture(t, { archived: true, sequence, next: 'sheldon' });
  await write(root, '.aioson/context/workflow.config.json', { version: 1, feature: { SMALL: sequence } });
  const result = await loadOrCreateState(root, { persist: false });
  assert.deepEqual(result.state.sequence, sequence);
  assert.equal(result.state.current, 'analyst');
});

test('an explicitly active Analyst detour survives migration and returns to a canonical stage', async (t) => {
  const detour = { active: true, agent: 'analyst', returnTo: 'architect' };
  const { root } = await fixture(t, { archived: true, detour });
  const result = await loadOrCreateState(root, { persist: false });
  assert.deepEqual(result.state.sequence, CANONICAL);
  assert.equal(result.state.current, 'analyst');
  assert.equal(result.state.detour.active, true);
  assert.equal(result.state.detour.returnTo, 'sheldon');
});

test('a newly required Planner cannot be silently skipped by legacy Dev completion', async (t) => {
  const { root } = await fixture(t, {
    sequence: ['product', 'sheldon', 'dev', 'qa'], completed: ['product', 'sheldon', 'dev'],
    current: 'qa', next: 'qa'
  });
  await write(root, '.aioson/context/prd-demo.md', PRD);
  await approveAndSealSheldonReview(root);
  const result = await loadOrCreateState(root, { persist: false });
  assert.equal(result.state.next, 'planner');
  assert.deepEqual(result.state.completed, ['product', 'sheldon']);
  assert.equal(result.state.skipped.includes('planner'), false);
});

test('a mismatched feature request cannot persist migration or consume an archive', async (t) => {
  const { root, stateFile } = await fixture(t, { archived: true });
  const before = await fs.readFile(stateFile, 'utf8');
  await assert.rejects(runWorkflowNext({
    args: [root], options: { 'expect-feature': 'unrelated' }, logger, t: (key) => key
  }), { code: 'WORKFLOW_FEATURE_MISMATCH' });
  assert.equal(await fs.readFile(stateFile, 'utf8'), before);
  assert.equal(await fs.access(path.join(root, STATE_RELATIVE_PATH)).then(() => true, () => false), false);
});

test('migration preserves completed Dev when the current PRD review and plan substantiate the new stages', async (t) => {
  const { root } = await fixture(t, {
    archived: true, completed: ['product', 'analyst', 'dev'], current: 'qa', next: 'qa'
  });
  await write(root, '.aioson/context/prd-demo.md', PRD);
  await approveAndSealSheldonReview(root);
  await write(root, '.aioson/context/implementation-plan-demo.md', '---\nstatus: approved\n---\n# Plan\n\n## Capability Delivery Plan\n\n| CAP | Phase | Files | Verification |\n|---|---|---|---|\n| CAP-demo-01 | 1 | src/demo.js, tests/demo.test.js | node --test |\n');
  const result = await loadOrCreateState(root, { persist: false });
  assert.deepEqual(result.state.sequence, CANONICAL);
  assert.deepEqual(result.state.completed, ['product', 'sheldon', 'planner', 'dev']);
  assert.deepEqual(result.state.skipped, []);
  assert.equal(result.state.current, 'qa');
  assert.equal(result.state.next, 'qa');
});

test('a delivered legacy feature remains terminal instead of acquiring retroactive stage debt', async (t) => {
  const { root } = await fixture(t, { archived: true, completed: [...LEGACY], current: null, next: null });
  const result = await loadOrCreateState(root, { persist: false });
  assert.equal(result.state.current, null);
  assert.equal(result.state.next, null);
  assert.deepEqual(result.state.completed, LEGACY);
});
