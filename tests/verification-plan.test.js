'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { runVerificationPlan } = require('../src/commands/verification-plan');
const { defaults } = require('../src/agent-execution/manifest');

const noopLogger = { log() {} };

async function makeTmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-vplan-'));
}

async function writeContext(dir, frontmatter) {
  const ctxDir = path.join(dir, '.aioson', 'context');
  await fs.mkdir(ctxDir, { recursive: true });
  await fs.writeFile(path.join(ctxDir, 'project.context.md'), frontmatter, 'utf8');
}

function byAgent(result, id) {
  return result.agents.find((a) => a.agent === id);
}

test('per-phase on SMALL launches no review agent', async () => {
  const dir = await makeTmpDir();
  const result = await runVerificationPlan({
    args: [dir],
    options: { feature: 'demo', trigger: 'per-phase', classification: 'SMALL', json: true },
    logger: noopLogger
  });
  assert.equal(result.ok, true);
  assert.equal(result.host, 'claude');
  assert.equal(byAgent(result, 'qa').run, false);
  assert.equal(byAgent(result, 'qa').model, 'sonnet-4.6');
  assert.equal(byAgent(result, 'tester').run, false);
  assert.equal(byAgent(result, 'pentester').run, false);
  assert.equal(byAgent(result, 'validator').run, false);
});

test('per-phase on MICRO skips qa (skip_on_micro budget)', async () => {
  const dir = await makeTmpDir();
  const result = await runVerificationPlan({
    args: [dir],
    options: { trigger: 'per-phase', classification: 'MICRO', json: true },
    logger: noopLogger
  });
  assert.equal(byAgent(result, 'qa').run, false);
});

test('end-of-feature on MEDIUM + sensitive still runs only QA by default', async () => {
  const dir = await makeTmpDir();
  const result = await runVerificationPlan({
    args: [dir],
    options: { feature: 'checkout', trigger: 'end-of-feature', classification: 'MEDIUM', sensitive: true, json: true },
    logger: noopLogger
  });
  assert.equal(byAgent(result, 'qa').run, true);
  for (const id of ['tester', 'pentester', 'validator']) assert.equal(byAgent(result, id).run, false, `${id} should remain opt-in`);
  assert.equal(byAgent(result, 'validator').cross_check.enabled, false);
  assert.equal(byAgent(result, 'pentester').report, 'security-findings-checkout.json');
});

test('classification does not enable Tester or Pentester', async () => {
  const dir = await makeTmpDir();
  const result = await runVerificationPlan({
    args: [dir],
    options: { trigger: 'end-of-feature', classification: 'MEDIUM', json: true },
    logger: noopLogger
  });
  assert.equal(byAgent(result, 'pentester').run, false);
  assert.equal(byAgent(result, 'tester').run, false);
});

test('execution manifest may explicitly enable optional post-DEV specialists', async () => {
  const dir = await makeTmpDir();
  const ctx = path.join(dir, '.aioson', 'context');
  await fs.mkdir(ctx, { recursive: true });
  const manifest = defaults('checkout', 'codex');
  manifest.agents.tester.enabled = true;
  manifest.agents.pentester.enabled = true;
  manifest.agents.validator.enabled = true;
  await fs.writeFile(path.join(ctx, 'agent-execution-checkout.json'), JSON.stringify(manifest));
  const result = await runVerificationPlan({
    args: [dir],
    options: { feature: 'checkout', trigger: 'end-of-feature', classification: 'MICRO', json: true },
    logger: noopLogger,
    catalogLoader: async () => ({ available: false, reason: 'fixture', models: [] })
  });
  for (const id of ['qa', 'tester', 'pentester', 'validator']) assert.equal(byAgent(result, id).run, true, `${id} should honor explicit enablement`);
});

test('--host pins the dispatch host and its native model', async () => {
  const dir = await makeTmpDir();
  const result = await runVerificationPlan({
    args: [dir],
    options: { trigger: 'per-phase', classification: 'SMALL', host: 'codex', json: true },
    logger: noopLogger
  });
  assert.equal(result.host, 'codex');
  assert.equal(byAgent(result, 'qa').model, 'configured-default'); // codex delegates to its own model
});

test('AC-AEMR-14 manifest planning surfaces requested/resolved model, strategy and separate effort', async () => {
  const dir = await makeTmpDir();
  const ctx = path.join(dir, '.aioson', 'context');
  await fs.mkdir(ctx, { recursive: true });
  const manifest = defaults('demo', 'codex');
  manifest.agents.qa.model = 'GPT 5.6 Terra';
  manifest.agents.qa.reasoning_effort = 'high';
  await fs.writeFile(path.join(ctx, 'agent-execution-demo.json'), JSON.stringify(manifest));
  const catalogLoader = async () => ({ available: true, source: 'fixture', fetched_at: '2026-07-11', models: [{ slug: 'gpt-5.6-terra', display_name: 'GPT-5.6-Terra', supported_efforts: ['high'] }] });
  const result = await runVerificationPlan({ args: [dir], options: { feature: 'demo', trigger: 'per-phase', classification: 'SMALL', json: true }, logger: noopLogger, catalogLoader });
  const qa = byAgent(result, 'qa');
  assert.equal(qa.model, 'gpt-5.6-terra');
  assert.equal(qa.model_requested, 'GPT 5.6 Terra');
  assert.equal(qa.model_resolved, 'gpt-5.6-terra');
  assert.equal(qa.model_resolution_strategy, 'normalized_name');
  assert.equal(qa.reasoning_effort, 'high');
  assert.equal(qa.execution.reasoning_effort, 'high');
});

test('classification auto-detects from project.context.md when not passed', async () => {
  const dir = await makeTmpDir();
  await writeContext(dir, '---\nclassification: MICRO\n---\n# ctx\n');
  const result = await runVerificationPlan({
    args: [dir],
    options: { trigger: 'per-phase', json: true },
    logger: noopLogger
  });
  assert.equal(result.classification, 'MICRO');
  assert.equal(byAgent(result, 'qa').run, false); // MICRO per-phase => skipped
});

test('phase_loop is surfaced in the plan', async () => {
  const dir = await makeTmpDir();
  const result = await runVerificationPlan({
    args: [dir],
    options: { trigger: 'per-phase', json: true },
    logger: noopLogger
  });
  assert.deepEqual(result.phase_loop, {
    auto_continue: true,
    compact_between_phases: true,
    max_fix_retries_per_phase: 2
  });
});

test('per-phase with auto_continue emits a CONTINUE-NOW directive (no /compact)', async () => {
  const dir = await makeTmpDir();
  const result = await runVerificationPlan({
    args: [dir],
    options: { trigger: 'per-phase', classification: 'SMALL', json: true },
    logger: noopLogger
  });
  assert.match(result.continuation_directive, /CONTINUE-NOW/);
  // The directive must explicitly forbid self-compaction — self-issuing /compact
  // ends the turn on Claude Code, which is the phase-loop stop bug.
  assert.match(result.continuation_directive, /never self-issue \/compact/i);
});

test('end-of-feature emits an END-OF-FEATURE directive', async () => {
  const dir = await makeTmpDir();
  const result = await runVerificationPlan({
    args: [dir],
    options: { trigger: 'end-of-feature', classification: 'MEDIUM', json: true },
    logger: noopLogger
  });
  assert.match(result.continuation_directive, /END-OF-FEATURE/);
});

test('auto_continue=false yields a PAUSE directive', async () => {
  const dir = await makeTmpDir();
  await fs.mkdir(path.join(dir, '.aioson', 'config'), { recursive: true });
  await fs.writeFile(
    path.join(dir, '.aioson', 'config', 'verification.json'),
    JSON.stringify({ version: '1.0', phase_loop: { auto_continue: false } }),
    'utf8'
  );
  const result = await runVerificationPlan({
    args: [dir],
    options: { trigger: 'per-phase', classification: 'SMALL', json: true },
    logger: noopLogger
  });
  assert.equal(result.phase_loop.auto_continue, false);
  assert.match(result.continuation_directive, /PAUSE/);
});

test('pretty (non-json) output renders without throwing', async () => {
  const dir = await makeTmpDir();
  const lines = [];
  const result = await runVerificationPlan({
    args: [dir],
    options: { trigger: 'end-of-feature', classification: 'MEDIUM' },
    logger: { log: (s) => lines.push(s) }
  });
  assert.equal(result.ok, true);
  assert.ok(lines.some((l) => l.includes('Verification plan')));
  assert.ok(lines.some((l) => l.includes('Phase loop')));
  assert.ok(lines.some((l) => l.includes('▶ ')));
});

test('invalid --trigger fails loudly instead of silently coercing to per-phase', async () => {
  const dir = await makeTmpDir();
  const result = await runVerificationPlan({
    args: [dir],
    options: { feature: 'demo', trigger: 'end_of_feature', classification: 'SMALL', json: true },
    logger: noopLogger
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'invalid_trigger');
  assert.equal(result.trigger, 'end_of_feature');
  assert.ok(Array.isArray(result.valid_triggers) && result.valid_triggers.includes('per-phase'));
  // The old coercion emitted an imperative CONTINUE-NOW directive here.
  assert.equal(result.continuation_directive, undefined);
});
