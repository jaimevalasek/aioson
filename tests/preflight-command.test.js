'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { runPreflight } = require('../src/commands/preflight');

async function makeTmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-preflight-'));
}

async function writeFile(dir, relPath, content) {
  const full = path.join(dir, relPath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, 'utf8');
}

function makeLogger() {
  const lines = [];
  const errors = [];
  return {
    log: (msg = '') => lines.push(String(msg)),
    error: (msg = '') => errors.push(String(msg)),
    lines,
    errors
  };
}

// ── JSON output ───────────────────────────────────────────────────────────────

test('preflight: returns ok=true in json mode', async () => {
  const tmpDir = await makeTmpDir();
  const result = await runPreflight({
    args: [tmpDir],
    options: { json: true, agent: 'dev' },
    logger: makeLogger()
  });
  assert.equal(result.ok, true);
  assert.ok('mode' in result);
  assert.ok('artifacts' in result);
  assert.ok('phase_gates' in result);
});

test('preflight: mode is greenfield when no context', async () => {
  const tmpDir = await makeTmpDir();
  const result = await runPreflight({
    args: [tmpDir],
    options: { json: true, agent: 'dev' },
    logger: makeLogger()
  });
  assert.equal(result.mode, 'greenfield');
});

test('preflight: mode is feature when prd exists', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/project.context.md', '---\nclassification: SMALL\n---');
  await writeFile(tmpDir, '.aioson/context/prd-checkout.md', '# PRD');
  const result = await runPreflight({
    args: [tmpDir],
    options: { json: true, agent: 'dev', feature: 'checkout' },
    logger: makeLogger()
  });
  assert.equal(result.mode, 'feature');
  assert.equal(result.feature_slug, 'checkout');
});

test('preflight: analyst feature without PRD is unframed_feature and not blocked', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/project.context.md', '---\nclassification: SMALL\n---');
  const result = await runPreflight({
    args: [tmpDir],
    options: { json: true, agent: 'analyst', feature: 'code-tab-ide-ux' },
    logger: makeLogger()
  });
  assert.equal(result.mode, 'unframed_feature');
  assert.equal(result.readiness, 'READY_WITH_WARNINGS');
  assert.equal(result.readiness_blockers.length, 0);
  assert.ok(result.readiness_warnings.some((w) => w.includes('PRD missing')));
});

test('preflight: detects classification from project.context.md', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/project.context.md', '---\nclassification: MEDIUM\n---');
  const result = await runPreflight({
    args: [tmpDir],
    options: { json: true, agent: 'dev' },
    logger: makeLogger()
  });
  assert.equal(result.classification, 'MEDIUM');
});

test('preflight: readiness READY when reviewed PRD and approved plan exist for dev', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/project.context.md', '---\nclassification: SMALL\n---');
  await writeFile(tmpDir, '.aioson/context/prd-feat.md', `---
classification: SMALL
product_scope: approved
prd_ready: approved
sheldon_review: not_requested
---
# Feature

## Feature Capability Map

| CAP | Promised outcome | Actor / trigger | Scope decision | Rationale |
|---|---|---|---|---|
| CAP-feat-01 | User sees the result | User submits | required | Core promise |

## Acceptance Criteria

| AC | CAP | Observable behavior | Evidence |
|---|---|---|---|
| AC-feat-01 | CAP-feat-01 | Result appears | integration test |
`);
  await writeFile(tmpDir, '.aioson/context/implementation-plan-feat.md', `---
status: approved
---
# Plan

## Capability Delivery Plan

| CAP | Phase | Files | Verification |
|---|---|---|---|
| CAP-feat-01 | 1 | src/feat.js, tests/feat.test.js | node --test |
`);
  const result = await runPreflight({
    args: [tmpDir],
    options: { json: true, agent: 'dev', feature: 'feat' },
    logger: makeLogger()
  });
  assert.equal(result.readiness, 'READY');
});

test('preflight: readiness BLOCKED when project context missing', async () => {
  const tmpDir = await makeTmpDir();
  const result = await runPreflight({
    args: [tmpDir],
    options: { json: true, agent: 'dev', feature: 'feat' },
    logger: makeLogger()
  });
  assert.equal(result.readiness, 'BLOCKED');
  assert.ok(result.readiness_blockers.length > 0);
});

test('preflight: phase_gates defaults to pending', async () => {
  const tmpDir = await makeTmpDir();
  const result = await runPreflight({
    args: [tmpDir],
    options: { json: true, agent: 'dev', feature: 'feat' },
    logger: makeLogger()
  });
  assert.equal(result.phase_gates.requirements, 'pending');
  assert.equal(result.phase_gates.plan, 'pending');
});

test('preflight: reads spec version and last checkpoint', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/project.context.md', '---\nclassification: SMALL\n---');
  await writeFile(tmpDir, '.aioson/context/spec-cart.md',
    '---\nversion: 4\nlast_checkpoint: "Cart service done"\ngate_plan: approved\n---');
  const result = await runPreflight({
    args: [tmpDir],
    options: { json: true, agent: 'dev', feature: 'cart' },
    logger: makeLogger()
  });
  assert.equal(result.artifacts.spec.version, '4');
  assert.equal(result.artifacts.spec.last_checkpoint, 'Cart service done');
});

// ── Human output ──────────────────────────────────────────────────────────────

test('preflight: human output contains header line', async () => {
  const tmpDir = await makeTmpDir();
  const logger = makeLogger();
  await runPreflight({ args: [tmpDir], options: { agent: 'dev' }, logger });
  assert.ok(logger.lines.some((l) => l.includes('Pre-flight')));
});

test('preflight: human output mentions Readiness', async () => {
  const tmpDir = await makeTmpDir();
  const logger = makeLogger();
  await runPreflight({ args: [tmpDir], options: { agent: 'dev', feature: 'x' }, logger });
  assert.ok(logger.lines.some((l) => l.includes('Readiness')));
});

test('preflight: human output shows gates', async () => {
  const tmpDir = await makeTmpDir();
  const logger = makeLogger();
  await runPreflight({ args: [tmpDir], options: { agent: 'dev', feature: 'x' }, logger });
  assert.ok(logger.lines.some((l) => l.includes('Gate')));
});

test('preflight: rules are listed when rules dir has files', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/rules/my-rule.md', '# Rule');
  const result = await runPreflight({
    args: [tmpDir],
    options: { json: true, agent: 'dev' },
    logger: makeLogger()
  });
  assert.ok(result.rules.includes('my-rule.md'));
});

test('preflight: design governance docs are listed in json mode', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/design-docs/file-size.md',
    '---\nagents: []\n---\n# File Size');
  const result = await runPreflight({
    args: [tmpDir],
    options: { json: true, agent: 'dev' },
    logger: makeLogger()
  });
  assert.ok(result.design_governance.includes('.aioson/design-docs/file-size.md'));
  assert.deepEqual(result.context_layers.design_governance, result.design_governance);
});

test('preflight: human output lists design governance docs', async () => {
  const tmpDir = await makeTmpDir();
  const logger = makeLogger();
  await writeFile(tmpDir, '.aioson/design-docs/naming.md',
    '---\nagents: []\n---\n# Naming');
  await runPreflight({ args: [tmpDir], options: { agent: 'dev' }, logger });
  assert.ok(logger.lines.some((l) => l.includes('Design governance')));
  assert.ok(logger.lines.some((l) => l.includes('.aioson/design-docs/naming.md')));
});

test('preflight: dev_state is populated from dev-state.md', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/dev-state.md',
    '---\nactive_feature: cart\nnext_step: "Write tests"\n---');
  const result = await runPreflight({
    args: [tmpDir],
    options: { json: true, agent: 'dev' },
    logger: makeLogger()
  });
  assert.equal(result.dev_state.active_feature, 'cart');
  assert.equal(result.dev_state.next_step, 'Write tests');
});
