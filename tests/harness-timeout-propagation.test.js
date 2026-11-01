'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const sandbox = require('../src/sandbox');
const { DEFAULT_CHECK_TIMEOUT_MS } = require('../src/harness/criteria-runner');
const { evaluateContractIntegrityGate } = require('../src/harness/contract-integrity-gate');
const { runWorkflowNext, finalizeCurrentStage, buildDefaultWorkflowConfig } = require('../src/commands/workflow-next');
const { runFeatureClose } = require('../src/commands/feature-close');

const logger = { log() {}, error() {}, warn() {} };

async function fixture(t, verification = 'node -e "process.exit(0)"') {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-harness-timeout-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const write = async (relative, contents) => {
    const target = path.join(root, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, contents);
  };
  await write('.aioson/plans/demo/harness-contract.json', JSON.stringify({
    feature: 'demo', governor: {},
    criteria: [{ id: 'RG-build', description: 'Bounded Node fixture', binary: true, verification }]
  }));
  return { root, write };
}

async function workflowFixture(t) {
  const value = await fixture(t);
  const state = { version: 1, mode: 'feature', classification: 'MICRO', featureSlug: 'demo', sequence: ['product', 'sheldon', 'planner', 'dev', 'qa'], completed: ['product', 'sheldon', 'planner'], skipped: [], current: 'dev', next: 'dev', detour: null, updatedAt: new Date().toISOString() };
  await value.write('.aioson/context/project.context.md', '---\nproject_name: timeout-fixture\nproject_type: script\nprofile: developer\nframework: Node.js\nframework_installed: true\nclassification: MICRO\ninteraction_language: en\nconversation_language: en\naioson_version: 1.76.0\n---\n');
  await value.write('.aioson/context/features.md', '| slug | status | started | completed |\n|---|---|---|---|\n| demo | in_progress | 2026-10-31 | |\n');
  await value.write('.aioson/context/workflow.state.json', JSON.stringify(state));
  await value.write('.aioson/context/prd-demo.md', '---\nclassification: MICRO\nproduct_scope: approved\nprd_ready: approved\n---\n# Demo\n\n## Feature Capability Map\n\n| CAP | Promised outcome | Actor / trigger | Scope decision | Rationale |\n|---|---|---|---|---|\n| CAP-demo-01 | Saved result appears | User submits | required | Core promise |\n\n## Acceptance Criteria\n\n| AC | CAP | Observable behavior | Evidence |\n|---|---|---|---|\n| AC-demo-01 | CAP-demo-01 | Saved result appears | integration test |\n');
  await value.write('.aioson/context/implementation-plan-demo.md', '---\nstatus: approved\n---\n# Plan\n\n## Capability Delivery Plan\n\n| CAP | Phase | Files | Verification |\n|---|---|---|---|\n| CAP-demo-01 | 1 | src/demo.js, tests/demo.test.js | node --test tests/demo.test.js |\n');
  await value.write('.aioson/context/project-pulse.md', 'pulse');
  await value.write('.aioson/context/dev-state.md', 'state');
  await value.write('src/demo.js', 'module.exports = { saved: true };\n');
  await value.write('tests/demo.test.js', "const assert = require('node:assert/strict'); // AC-demo-01\nassert.equal(require('../src/demo').saved, true);\n");
  return { ...value, state };
}

function captureSandbox(t, ok = true) {
  const calls = [];
  t.mock.method(sandbox, 'executeInSandbox', async (command, options) => {
    calls.push({ command, ...options });
    return { ok, exitCode: ok ? 0 : 1, stdout: '', stderr: ok ? '' : 'Deliberate isolated fixture failure', timedOut: false };
  });
  return calls;
}

test('integrity gate forwards an explicit CLI timeout through the real harness and criteria runner', async t => {
  const { root } = await fixture(t);
  const calls = captureSandbox(t);
  const result = await evaluateContractIntegrityGate(root, 'demo', { runChecks: true, changedFiles: [], timeout: '900000' });
  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].timeout, 900000);
});

test('omitted and invalid timeout options retain the existing300000ms harness default', async t => {
  assert.equal(DEFAULT_CHECK_TIMEOUT_MS, 300000);
  const { root } = await fixture(t);
  const calls = captureSandbox(t);
  for (const options of [{}, { timeout: 0 }, { timeout: -1 }, { timeout: 1.5 }, { timeout: 'invalid' }, { timeout: Infinity }, { timeout: '' }, { timeout: null }]) {
    const result = await evaluateContractIntegrityGate(root, 'demo', { runChecks: true, changedFiles: [], ...options });
    assert.equal(result.ok, true);
    assert.equal(calls.at(-1).timeout, 300000);
  }
  assert.equal(calls.length, 8);
});

test('workflow finalization forwards its explicit timeout without bypassing a failing harness', async t => {
  const { root, state } = await workflowFixture(t);
  const calls = captureSandbox(t, false);
  await assert.rejects(finalizeCurrentStage(root, buildDefaultWorkflowConfig(), state, 'dev', { timeout: '900000' }), /Harness Contract Gate BLOCKED/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].timeout, 900000);
  assert(!state.completed.includes('dev'));
});

test('workflow:next --complete=dev preserves the caller timeout through finalization', async t => {
  const { root } = await workflowFixture(t);
  const calls = captureSandbox(t, false);
  await assert.rejects(runWorkflowNext({ args: [root], options: { complete: 'dev', timeout: '900000', tool: 'codex', json: true, 'expect-feature': 'demo' }, logger, t: () => undefined }), /Harness Contract Gate BLOCKED/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].timeout, 900000);
  const state = JSON.parse(await fs.readFile(path.join(root, '.aioson/context/workflow.state.json')));
  assert(!state.completed.includes('dev'));
});

test('feature:close forwards an explicit timeout and retains the failed harness blocker', async t => {
  const { root, write } = await fixture(t);
  await write('.aioson/context/spec-demo.md', '---\nversion: 1\n---\n# Spec\n');
  const calls = captureSandbox(t, false);
  const result = await runFeatureClose({ args: [root], options: { feature: 'demo', verdict: 'PASS', timeout: '900000', json: true }, logger });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'harness_contract_gate_blocked');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].timeout, 900000);
});

test('integrity gate honors a real short timeout and reports the terminated child as failure', async t => {
  const { root } = await fixture(t, 'node -e "setTimeout(() => process.exit(0), 1500)"');
  const result = await evaluateContractIntegrityGate(root, 'demo', { runChecks: true, changedFiles: [], timeout: 150 });
  assert.equal(result.ok, false);
  assert(result.errors.some(error => error.code === 'harness_check_failed'));
  assert.equal(result.checkReport.checks[0].timedOut, true);
  assert.equal(result.checkReport.checks[0].ok, false);
  assert.match(result.checkReport.checks[0].stderr, /timed out after 150ms/);
});
