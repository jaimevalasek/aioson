'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  buildDefaultVerificationConfig,
  readVerificationConfig,
  resolveHost,
  getAgentConfig,
  getAgentDispatch,
  resolveAgentEnabled,
  agentHasTrigger,
  resolveAgentReportPath,
  getCrossCheck,
  getBudget,
  getPhaseLoop,
  getAuditCodePolicy,
  shouldRunForTrigger
} = require('../src/verification-policy');

async function makeTmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-verification-'));
}

async function writeConfig(dir, config) {
  const configDir = path.join(dir, '.aioson', 'config');
  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(path.join(configDir, 'verification.json'), `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

test('verification config defaults when the file is missing', async () => {
  const dir = await makeTmpDir();
  const config = await readVerificationConfig(dir);

  assert.equal(config.host, 'auto');
  // qa/validator default ON; tester/pentester default to 'auto' (framework decides).
  assert.equal(config.agents.qa.enabled, true);
  assert.equal(config.agents.validator.enabled, true);
  assert.equal(config.agents.tester.enabled, 'auto');
  assert.equal(config.agents.pentester.enabled, 'auto');
});

test('the shipped default config equals buildDefaultVerificationConfig (round-trip)', async () => {
  const dir = await makeTmpDir();
  await writeConfig(dir, buildDefaultVerificationConfig());
  const config = await readVerificationConfig(dir);
  assert.deepEqual(config, buildDefaultVerificationConfig());
});

test('resolveHost precedence: explicit > config.host > env > default', () => {
  const auto = buildDefaultVerificationConfig();              // host: 'auto'
  const pinned = { ...auto, host: 'opencode' };

  // explicit arg wins over everything
  assert.equal(resolveHost(pinned, 'codex', { AIOSON_RUNNER_TOOL: 'claude' }), 'codex');
  // config.host wins over env when no explicit arg
  assert.equal(resolveHost(pinned, null, { AIOSON_RUNNER_TOOL: 'claude' }), 'opencode');
  // env used only when config.host is 'auto'
  assert.equal(resolveHost(auto, null, { AIOSON_RUNNER_TOOL: 'codex' }), 'codex');
  assert.equal(resolveHost(auto, null, { AIOSON_TOOL: 'opencode' }), 'opencode');
  // ultimate fallback
  assert.equal(resolveHost(auto, null, {}), 'claude');
  // unknown values are ignored, not honored
  assert.equal(resolveHost(auto, 'gpt-5', { AIOSON_RUNNER_TOOL: 'gemini' }), 'claude');
});

test('getAgentDispatch resolves the right native model per host', () => {
  const config = buildDefaultVerificationConfig();

  // On Claude Code, qa runs native on a cheap Claude tier; validator on the strong one.
  assert.deepEqual(getAgentDispatch(config, 'qa', 'claude'), { host: 'claude', mode: 'native', model: 'sonnet-4.6' });
  assert.deepEqual(getAgentDispatch(config, 'validator', 'claude'), { host: 'claude', mode: 'native', model: 'opus-4.8' });

  // On codex/opencode, the model delegates to that CLI's own configured default —
  // you do NOT run a codex model as a Claude sub-agent; the host picks its native model.
  assert.deepEqual(getAgentDispatch(config, 'qa', 'codex'), { host: 'codex', mode: 'native', model: 'configured-default' });

  // Unknown host falls back through resolveHost to the default host (claude).
  assert.equal(getAgentDispatch(config, 'qa', 'gpt-5').host, 'claude');
});

test("resolveAgentEnabled resolves 'auto' from run context", () => {
  const config = buildDefaultVerificationConfig();

  // qa is hard-true regardless of context
  assert.equal(resolveAgentEnabled(config, 'qa', {}), true);
  // pentester 'auto' => only on a sensitive surface
  assert.equal(resolveAgentEnabled(config, 'pentester', { sensitiveSurface: true }), true);
  assert.equal(resolveAgentEnabled(config, 'pentester', { sensitiveSurface: false }), false);
  // tester 'auto' => on anything above MICRO
  assert.equal(resolveAgentEnabled(config, 'tester', { classification: 'SMALL' }), true);
  assert.equal(resolveAgentEnabled(config, 'tester', { classification: 'MICRO' }), false);
});

test('shouldRunForTrigger combines trigger + enabled + skip-on-micro budget', () => {
  const config = buildDefaultVerificationConfig();

  // qa runs per-phase on SMALL...
  assert.equal(shouldRunForTrigger(config, 'qa', { trigger: 'per-phase', classification: 'SMALL' }), true);
  // ...but per-phase is suppressed on MICRO to save tokens (skip_on_micro)
  assert.equal(shouldRunForTrigger(config, 'qa', { trigger: 'per-phase', classification: 'MICRO' }), false);
  // qa has no sensitive-surface trigger
  assert.equal(shouldRunForTrigger(config, 'qa', { trigger: 'sensitive-surface' }), false);
  // pentester runs on a sensitive surface only
  assert.equal(shouldRunForTrigger(config, 'pentester', { trigger: 'sensitive-surface', sensitiveSurface: true }), true);
  assert.equal(shouldRunForTrigger(config, 'pentester', { trigger: 'sensitive-surface', sensitiveSurface: false }), false);
});

test('user overrides are preserved and missing fields filled from defaults', async () => {
  const dir = await makeTmpDir();
  await writeConfig(dir, {
    version: '1.0',
    agents: {
      qa: { dispatch: { claude: { model: 'haiku-4.5' } } } // only override the claude model
    }
  });
  const config = await readVerificationConfig(dir);

  // override honored
  assert.equal(config.agents.qa.dispatch.claude.model, 'haiku-4.5');
  // missing mode filled from default
  assert.equal(config.agents.qa.dispatch.claude.mode, 'native');
  // missing enabled filled from default (qa => true)
  assert.equal(config.agents.qa.enabled, true);
  // untouched agents still present with their defaults
  assert.equal(config.agents.validator.dispatch.claude.model, 'opus-4.8');
});

test('malformed JSON degrades to defaults instead of throwing', async () => {
  const dir = await makeTmpDir();
  const configDir = path.join(dir, '.aioson', 'config');
  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(path.join(configDir, 'verification.json'), '{ not valid json', 'utf8');

  const config = await readVerificationConfig(dir);
  assert.deepEqual(config, buildDefaultVerificationConfig());
});

test('cross_check is normalized only for validator and reports resolve {slug}', async () => {
  const config = buildDefaultVerificationConfig();

  // validator carries a disabled external cross-check by default
  assert.deepEqual(getCrossCheck(config, 'validator'), {
    enabled: false, mode: 'external', tool: 'codex', model: 'configured-default'
  });
  // qa has no cross-check
  assert.equal(getCrossCheck(config, 'qa'), null);

  // report templates resolve the {slug} placeholder
  assert.equal(resolveAgentReportPath(config, 'qa', 'local-neural-tts'), 'qa-report-local-neural-tts.md');
  assert.equal(resolveAgentReportPath(config, 'pentester', 'checkout'), 'security-findings-checkout.json');

  // sanity on triggers + budget + unknown agent
  assert.equal(agentHasTrigger(config, 'qa', 'per-phase'), true);
  assert.equal(agentHasTrigger(config, 'validator', 'per-phase'), false);
  assert.equal(getBudget(config).max_subagents_per_phase, 1);
  assert.equal(getAgentConfig(config, 'nope'), null);
});

test('phase_loop normalizes overrides and fills gaps from defaults', async () => {
  const dir = await makeTmpDir();
  await writeConfig(dir, { phase_loop: { auto_continue: false, max_fix_retries_per_phase: -5 } });
  const config = await readVerificationConfig(dir);

  // explicit boolean honored
  assert.equal(config.phase_loop.auto_continue, false);
  // invalid retries fall back to the default (2)
  assert.equal(config.phase_loop.max_fix_retries_per_phase, 2);
  // unset field filled from default
  assert.equal(config.phase_loop.compact_between_phases, true);
  // getter mirrors the normalized block
  assert.deepEqual(getPhaseLoop(config), config.phase_loop);
});

test('getAuditCodePolicy: defaults to advisory/changed and normalizes valid + invalid values', () => {
  // default (no config) — advisory, changed
  assert.deepEqual(getAuditCodePolicy(null), { tracked_gate: 'advisory', scope: 'changed' });
  assert.deepEqual(getAuditCodePolicy(buildDefaultVerificationConfig()), { tracked_gate: 'advisory', scope: 'changed' });
  // valid overrides honored (case-insensitive)
  assert.deepEqual(getAuditCodePolicy({ audit_code: { tracked_gate: 'BLOCK', scope: 'full' } }), { tracked_gate: 'block', scope: 'full' });
  assert.equal(getAuditCodePolicy({ audit_code: { tracked_gate: 'off' } }).tracked_gate, 'off');
  // invalid values fall back to defaults
  assert.deepEqual(getAuditCodePolicy({ audit_code: { tracked_gate: 'nonsense', scope: 'galaxy' } }), { tracked_gate: 'advisory', scope: 'changed' });
});

test('audit_code round-trips through writeConfig/readVerificationConfig', async () => {
  const dir = await makeTmpDir();
  await writeConfig(dir, { audit_code: { tracked_gate: 'block', scope: 'full' } });
  const config = await readVerificationConfig(dir);
  assert.deepEqual(config.audit_code, { tracked_gate: 'block', scope: 'full' });
});
