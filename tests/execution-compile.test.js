'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { runExecution } = require('../src/commands/execution');
const { verifyExecutionPlan, readExecutionPlan, rulesDigest } = require('../src/agent-execution/execution-plan');
const { validateExecutionRoles, offerExecution, laneRoleKey } = require('../src/lib/execution-roles');
const { signatureKey, writeSignatures } = require('../src/lib/host-signature');
const { verifyAgentArtifact } = require('../src/artifact-kinds');
const { runVerifyArtifact } = require('../src/commands/verify-artifact');
const { validateManifest } = require('../src/agent-execution/schema');
const { loadManifest, resolveExecutionMode, defaults, writeManifest } = require('../src/agent-execution/manifest');
const { parseDevelopmentLanes } = require('../src/harness/plan-waves');

const ROOT = path.resolve(__dirname, '..');
const BIN = path.join(ROOT, 'bin', 'aioson.js');
const logger = { log() {}, error() {}, warn() {} };
const SLUG = 'orders';

const PLAN = [
  '---',
  'feature: orders',
  'status: approved',
  '---',
  '# Implementation Plan — orders',
  '',
  '## Implementation Delta',
  '| CAP | Action | Existing evidence | Exact paths | Required change |',
  '|---|---|---|---|---|',
  '| CAP-orders-api | create | none | src/api/orders.ts, tests/api/orders.test.ts | order endpoints |',
  '| CAP-orders-ui | create | none | src/ui/Orders.tsx, tests/ui/Orders.test.tsx | orders screen |',
  '| CAP-orders-wire | modify | src/app.ts | src/app.ts | wire the screen to the endpoints |',
  '',
  '## Capability Delivery Plan',
  '| CAP | Phase | Files | Verification |',
  '|---|---|---|---|',
  '| CAP-orders-api | 1 | src/api/orders.ts, tests/api/orders.test.ts | npm test -- orders.api |',
  '| CAP-orders-ui | 2 | src/ui/Orders.tsx, tests/ui/Orders.test.tsx | npm test -- orders.ui |',
  '| CAP-orders-wire | 3 | src/app.ts | npm test -- app |',
  '',
  '## Development execution lanes',
  '| Lane | Host | Model | Exact write paths | Integration owner |',
  '|---|---|---|---|---|',
  '| backend | codex | gpt-5.6 | src/api/**, tests/api/** | dev |',
  '| frontend | kimi | kimi-k3 | src/ui/**, tests/ui/** | dev |',
  '',
  '## Execution Sequence',
  '| Phase | Wave | Files | Scope | Done when |',
  '|---|---|---|---|---|',
  '| 1 | 1 | src/api/orders.ts, tests/api/orders.test.ts | CAP-orders-api | npm test -- orders.api passes |',
  '| 2 | 1 | src/ui/Orders.tsx, tests/ui/Orders.test.tsx | CAP-orders-ui | npm test -- orders.ui passes |',
  '| 3 | 2 | src/app.ts | CAP-orders-wire | npm test -- app passes |',
  ''
].join('\n');

const PRD = [
  '# Orders',
  '',
  '## Goal',
  'Ship orders end to end.',
  '',
  '## Feature Capability Map',
  '| CAP | Capability | Required |',
  '|---|---|---|',
  '| CAP-orders-api | Orders API | yes |',
  '| CAP-orders-ui | Orders screen | yes |',
  '| CAP-orders-wire | Screen wired to the API | yes |',
  '',
  '## Acceptance Criteria',
  '| AC | CAP | Observable behavior | Evidence |',
  '|---|---|---|---|',
  '| AC-orders-01 | CAP-orders-api | POST /orders creates an order | api test |',
  '| AC-orders-02 | CAP-orders-ui | Orders screen lists orders | ui test |',
  '| AC-orders-03 | CAP-orders-wire | The screen shows API orders | e2e |',
  ''
].join('\n');

const ROLES = {
  version: 1,
  source: 'test-client',
  enabled: true,
  roles: {
    backend_dev: { host: 'codex', model: 'gpt-5.6', reasoning_effort: 'high' },
    frontend_dev: { host: 'kimi', model: 'kimi-k3', reasoning_effort: null },
    qa: { host: 'claude', model: 'claude-sonnet-5' }
  },
  parallel: { max_concurrent_lanes: 2 },
  on_unavailable: 'ask'
};

function signed(host, model, effort, { expired = false } = {}) {
  return {
    host, model, reasoning_effort: effort, status: 'valid', reason: null,
    checked_at: '2026-08-25T10:00:00.000Z',
    expires_at: expired ? '2026-08-25T11:00:00.000Z' : '2999-01-01T00:00:00.000Z'
  };
}

const ALL_SIGNED = {
  [signatureKey('codex', 'gpt-5.6', 'high')]: signed('codex', 'gpt-5.6', 'high'),
  [signatureKey('kimi', 'kimi-k3', null)]: signed('kimi', 'kimi-k3', null),
  [signatureKey('claude', 'claude-sonnet-5', null)]: signed('claude', 'claude-sonnet-5', null)
};

async function setup(t, { plan = PLAN, prd = PRD, roles = ROLES, signatures = ALL_SIGNED, kernel = true } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-execution-compile-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  await fs.mkdir(path.join(dir, '.aioson', 'context'), { recursive: true });
  await fs.mkdir(path.join(dir, '.aioson', 'config'), { recursive: true });
  await fs.mkdir(path.join(dir, '.aioson', 'agents'), { recursive: true });
  if (plan !== null) await fs.writeFile(path.join(dir, '.aioson', 'context', `implementation-plan-${SLUG}.md`), plan, 'utf8');
  if (prd !== null) await fs.writeFile(path.join(dir, '.aioson', 'context', `prd-${SLUG}.md`), prd, 'utf8');
  if (roles !== null) await fs.writeFile(path.join(dir, '.aioson', 'config', 'execution-roles.json'), JSON.stringify(roles, null, 2), 'utf8');
  if (kernel) await fs.copyFile(path.join(ROOT, 'template', '.aioson', 'agents', 'dev.md'), path.join(dir, '.aioson', 'agents', 'dev.md'));
  const env = { ...process.env, AIOSON_HOST_SIGNATURES: path.join(dir, 'signatures.json') };
  delete env.AIOSON_PLAY;
  if (signatures) await writeSignatures({ signatures }, { env });
  return { dir, env };
}

function compile(dir, env, extra = {}) {
  return runExecution({ args: [dir], options: { sub: 'compile', feature: SLUG, json: true, ...extra }, logger, env });
}

function offer(dir, env, extra = {}) {
  return runExecution({ args: [dir], options: { sub: 'offer', json: true, ...extra }, logger, env });
}

function checks(result) {
  return (result.errors || []).map((error) => error.check).sort();
}

// ───────────────────────── roles file ─────────────────────────

test('execution-roles: the unlock file is validated strictly — hosts from the registry, effort only where the host accepts it, no secrets', () => {
  assert.equal(validateExecutionRoles(ROLES).ok, true);
  const bad = validateExecutionRoles({
    version: 2,
    enabled: 'yes',
    roles: {
      backend_dev: { host: 'muse', model: 'muse-1' },
      frontend_dev: { host: 'kimi', model: 'kimi-k3', reasoning_effort: 'high' },
      'Bad-Key': { host: 'claude', model: '' },
      qa: { host: 'claude', model: 'claude-sonnet-5', api_key: 'x' }
    },
    parallel: { max_concurrent_lanes: 9 },
    on_unavailable: 'retry',
    token: 'nope'
  });
  assert.equal(bad.ok, false);
  const byPath = Object.fromEntries(bad.errors.map((error) => [error.path, error.message]));
  assert.match(byPath['$.version'], /must equal 1/);
  assert.match(byPath['$.enabled'], /boolean/);
  assert.match(byPath['$.roles.backend_dev.host'], /must be one of antigravity, claude, codex, grok, kimi, opencode, qwen/);
  assert.match(byPath['$.roles.frontend_dev.reasoning_effort'], /effort_unsupported_by_host/);
  assert.match(byPath['$.roles.Bad-Key'], /snake_case/);
  assert.match(byPath['$.roles.qa.api_key'], /secret fields are forbidden/);
  assert.match(byPath['$.token'], /secret fields are forbidden/);
  assert.match(byPath['$.parallel.max_concurrent_lanes'], /between 1 and 8/);
  assert.match(byPath['$.on_unavailable'], /ask, fallback, pause/);
  assert.equal(laneRoleKey('mobile-app', 'qa'), 'mobile_app_qa');

  const profiled = {
    version: 1, enabled: true, active_profile: 'economy',
    profiles: {
      economy: { enabled: true, fallback_use: true, fallback_profiles: ['reserve'], roles: ROLES.roles },
      reserve: { enabled: true, roles: ROLES.roles },
      disabled: { enabled: false, roles: ROLES.roles }
    },
    parallel: { max_concurrent_lanes: 2 }, on_unavailable: 'ask'
  };
  assert.equal(validateExecutionRoles(profiled).ok, true);
  assert.match(validateExecutionRoles({ ...profiled, active_profile: 'disabled' }).errors.find(error => error.path === '$.active_profile').message, /enabled profile/);
  assert.match(validateExecutionRoles({ ...profiled, roles: ROLES.roles }).errors.find(error => error.path === '$').message, /exactly one/);
  assert.match(validateExecutionRoles({ ...profiled, profiles: { ...profiled.profiles, economy: { ...profiled.profiles.economy, fallback_profiles: ['missing'] } } }).errors.find(error => error.path.endsWith('fallback_profiles')).message, /missing profile/);
  assert.match(validateExecutionRoles({ ...profiled, profiles: { ...profiled.profiles, economy: { ...profiled.profiles.economy, fallback_profiles: ['economy'] } } }).errors.find(error => error.path.endsWith('fallback_profiles')).message, /own profile/);
});

test('execution:offer — unavailable without the unlock file, when disabled, when invalid, when a role is unsigned; available only when every role is signed', async (t) => {
  const missing = await setup(t, { roles: null });
  let result = await offer(missing.dir, missing.env);
  assert.equal(result.ok, true);
  assert.equal(result.exitCode, 0);
  assert.equal(result.available, false);
  assert.equal(result.reason, 'roles_file_missing');
  assert.equal(result.inside_play, false);

  const disabled = await setup(t, { roles: { ...ROLES, enabled: false } });
  result = await offer(disabled.dir, disabled.env);
  assert.equal(result.available, false);
  assert.equal(result.reason, 'roles_disabled');

  const invalid = await setup(t, { roles: { ...ROLES, roles: { ...ROLES.roles, qa: { host: 'muse', model: 'muse-1' } } } });
  result = await offer(invalid.dir, invalid.env);
  assert.equal(result.available, false);
  assert.equal(result.reason, 'roles_invalid');
  assert.equal(result.errors[0].path, '$.roles.qa.host');

  const unsigned = await setup(t, { signatures: { [signatureKey('codex', 'gpt-5.6', 'high')]: signed('codex', 'gpt-5.6', 'high') } });
  result = await offer(unsigned.dir, unsigned.env);
  assert.equal(result.available, false);
  assert.equal(result.reason, 'signature_missing');
  assert.deepEqual(result.missing.map((item) => item.role).sort(), ['frontend_dev', 'qa']);
  assert.equal(result.missing.find((item) => item.role === 'frontend_dev').hint, 'aioson host:signature . --host=kimi --model=kimi-k3');

  const expired = await setup(t, { signatures: { ...ALL_SIGNED, [signatureKey('kimi', 'kimi-k3', null)]: signed('kimi', 'kimi-k3', null, { expired: true }) } });
  result = await offer(expired.dir, expired.env);
  assert.equal(result.available, false);
  assert.equal(result.reason, 'signature_expired');

  const ready = await setup(t);
  result = await offer(ready.dir, { ...ready.env, AIOSON_PLAY: '1' }, { feature: SLUG });
  assert.equal(result.available, true);
  assert.equal(result.reason, 'ok');
  assert.equal(result.inside_play, true);
  assert.equal(result.signatures.roles.backend_dev.state, 'valid');
  assert.equal(result.plan.exists, true);
  assert.equal(result.plan.lanes_table, true);
  assert.equal(result.plan.execution_sequence, true);
  assert.equal(result.plan.compiled.exists, false);
});

// ───────────────────────── refusals ─────────────────────────

test('execution:compile refuses with named findings — missing tables, mixed ownership, wave overlap, integration before lanes', async (t) => {
  const noLanes = await setup(t, { plan: PLAN.replace('## Development execution lanes', '## Lanes (not a recognised heading)') });
  let result = await compile(noLanes.dir, noLanes.env);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'compile_refused');
  assert.ok(checks(result).includes('lanes_table_missing'), checks(result).join(','));

  const noWave = await setup(t, { plan: PLAN.replace('| Phase | Wave | Files | Scope | Done when |', '| Phase | Files | Scope | Done when |').replace(/^\| (\d) \| \d \| /gm, '| $1 | ') });
  result = await compile(noWave.dir, noWave.env);
  assert.ok(checks(result).includes('no_wave_column'), checks(result).join(','));

  const mixed = await setup(t, { plan: PLAN.replace('| 1 | 1 | src/api/orders.ts, tests/api/orders.test.ts |', '| 1 | 1 | src/api/orders.ts, src/ui/Shared.tsx |') });
  result = await compile(mixed.dir, mixed.env);
  assert.ok(checks(result).includes('phase_mixed_ownership'), checks(result).join(','));
  assert.match(result.errors.find((e) => e.check === 'phase_mixed_ownership').message, /src\/ui\/Shared\.tsx: frontend/);

  const overlap = await setup(t, { plan: PLAN.replace('| 2 | 1 | src/ui/Orders.tsx, tests/ui/Orders.test.tsx |', '| 2 | 1 | src/api/orders.ts |') });
  result = await compile(overlap.dir, overlap.env);
  assert.ok(checks(result).includes('wave_file_overlap'), checks(result).join(','));

  const early = await setup(t, { plan: PLAN.replace('| 3 | 2 | src/app.ts |', '| 3 | 1 | src/app.ts |') });
  result = await compile(early.dir, early.env);
  assert.ok(checks(result).includes('integration_before_lanes'), checks(result).join(','));

  const laneOverlap = await setup(t, { plan: PLAN.replace('| backend | codex | gpt-5.6 | src/api/**, tests/api/** | dev |', '| backend | codex | gpt-5.6 | src/**, tests/api/** | dev |') });
  result = await compile(laneOverlap.dir, laneOverlap.env);
  assert.ok(checks(result).includes('lane_write_paths_overlap'), checks(result).join(','));

  const unsafe = await setup(t, { plan: PLAN.replace('| frontend | kimi | kimi-k3 | src/ui/**, tests/ui/** | dev |', '| frontend | kimi | kimi-k3 | ../elsewhere/**, tests/ui/** | dev |') });
  result = await compile(unsafe.dir, unsafe.env);
  assert.ok(checks(result).includes('unsafe_path'), checks(result).join(','));
});

test('execution:compile refuses when the roles or signatures are not there — the "does not run without models per role" gate is the engine, not a prompt', async (t) => {
  const noRoles = await setup(t, { roles: null });
  let result = await compile(noRoles.dir, noRoles.env);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'roles_unavailable');
  assert.equal(result.roles_reason, 'roles_file_missing');

  const noFrontend = await setup(t, { roles: { ...ROLES, roles: { backend_dev: ROLES.roles.backend_dev, qa: ROLES.roles.qa } } });
  result = await compile(noFrontend.dir, noFrontend.env);
  assert.equal(result.reason, 'compile_refused');
  const laneError = result.errors.find((e) => e.check === 'lane_without_role');
  assert.equal(laneError.lane, 'frontend');
  assert.equal(laneError.role, 'frontend_dev');

  const noQa = await setup(t, { roles: { ...ROLES, roles: { backend_dev: ROLES.roles.backend_dev, frontend_dev: ROLES.roles.frontend_dev } } });
  result = await compile(noQa.dir, noQa.env);
  assert.deepEqual([...new Set(checks(result))], ['qa_role_missing']);

  const unsigned = await setup(t, { signatures: { ...ALL_SIGNED, [signatureKey('kimi', 'kimi-k3', null)]: undefined } });
  result = await compile(unsigned.dir, unsigned.env);
  const sig = result.errors.find((e) => e.check === 'role_signature_missing');
  assert.equal(sig.role, 'frontend_dev');
  assert.equal(sig.hint, 'aioson host:signature . --host=kimi --model=kimi-k3');

  const expired = await setup(t, { signatures: { ...ALL_SIGNED, [signatureKey('codex', 'gpt-5.6', 'high')]: signed('codex', 'gpt-5.6', 'high', { expired: true }) } });
  result = await compile(expired.dir, expired.env);
  assert.equal(result.errors.find((e) => e.check === 'role_signature_expired').hint, 'aioson host:signature . --host=codex --model=gpt-5.6 --effort=high');

  const noKernel = await setup(t, { kernel: false });
  result = await compile(noKernel.dir, noKernel.env);
  assert.ok(checks(result).includes('dev_kernel_missing'), checks(result).join(','));

  // Nothing was written by any refusal.
  for (const { dir } of [noRoles, noFrontend, noQa, unsigned, expired, noKernel]) {
    assert.equal((await readExecutionPlan(dir, SLUG)).exists, false);
    assert.equal((await loadManifest(dir, SLUG)).exists, false);
  }
});

// ───────────────────────── compilation ─────────────────────────

test('initial source footprint refuses a large read before writing compiled artifacts', async t => {
  const { dir, env } = await setup(t);
  await fs.mkdir(path.join(dir, 'src/api'), { recursive: true });
  await fs.writeFile(path.join(dir, 'src/api/orders.ts'), 'x'.repeat(200000));
  const result = await compile(dir, env);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(item => item.check === 'unit_initial_context_over_budget'));
  await assert.rejects(fs.stat(path.join(dir, `.aioson/context/execution-plan-${SLUG}.json`)), { code: 'ENOENT' });
});

test('recompiling an active run honors its explicit no-context-limit choice without changing default quality or QA policy', async t => {
  const { dir, env } = await setup(t);
  await fs.mkdir(path.join(dir, 'src/api'), { recursive: true });
  await fs.writeFile(path.join(dir, 'src/api/orders.ts'), 'x'.repeat(200000));
  const file = path.join(dir, `.aioson/context/execution-state-${SLUG}.json`);
  const state = { feature: SLUG, run_id: 'active-run', status: 'paused', context_limit_enabled: false };
  await fs.writeFile(file, JSON.stringify(state));
  const result = await compile(dir, env);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.ok(result.warnings.some(item => item.check === 'unit_initial_context_over_budget' && /advisory/.test(item.message)));
  assert.equal(result.plan.policy.qa.require_pass, true);
  assert.equal(result.plan.policy.context.max_tokens, 80000);
  assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')), state);
  for (const change of [{ status: 'completed' }, { status: 'paused', context_limit_enabled: true }, { feature: 'another-feature', context_limit_enabled: false }]) {
    await fs.writeFile(file, JSON.stringify({ ...state, ...change }));
    assert.equal((await compile(dir, env)).ok, false);
  }
});

test('execution:compile — units per phase × lane, waves, per-unit prompts with PRD/plan excerpts, manifest lanes + qa + execution mode; verify passes; recompile is idempotent', async (t) => {
  const { dir, env } = await setup(t);
  const result = await compile(dir, env);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.path, `.aioson/context/execution-plan-${SLUG}.json`);
  assert.deepEqual(result.warnings, []);
  const { context_bytes_max: contextBytesMax, ...summary } = result.summary;
  assert.deepEqual(summary, { lanes: 2, units: 3, lane_units: 2, integration_units: 1, waves: 2, edges: 0, processes: 4, parallelism: { max_concurrent_units: 2, serial_chain: 1, critical_path_processes: 2, serial: false }, ceiling: { max_files: 10, max_acs: 6 } });
  assert.ok(contextBytesMax > 0, 'the largest unit context is measured in bytes');

  const { plan } = await readExecutionPlan(dir, SLUG);
  assert.equal(plan.version, 2);
  assert.equal(plan.feature, SLUG);
  assert.equal(plan.scheduling, 'waves');
  assert.deepEqual(plan.edges, []);
  assert.deepEqual(plan.lanes.backend.dev, {
    role: 'backend_dev', host: 'codex', model: 'gpt-5.6', reasoning_effort: 'high',
    signature: { state: 'valid', checked_at: '2026-08-25T10:00:00.000Z', expires_at: '2999-01-01T00:00:00.000Z' }
  });
  assert.equal(plan.lanes.frontend.qa.role, 'qa');
  assert.equal(plan.lanes.frontend.qa.inherited, true);
  assert.equal(plan.lanes.frontend.qa.max_fix_files, 3);
  assert.deepEqual(plan.lanes.backend.write_paths, ['src/api/**', 'tests/api/**']);
  assert.deepEqual(plan.waves, [
    { wave: 1, units: ['phase-1', 'phase-2'], lane_units: 2, integration_units: 0 },
    { wave: 2, units: ['phase-3'], lane_units: 0, integration_units: 1 }
  ]);
  const [u1, u2, u3] = plan.units;
  assert.equal(u1.owner, 'lane');
  assert.equal(u1.lane, 'backend');
  assert.deepEqual(u1.caps, ['CAP-orders-api']);
  assert.deepEqual(u1.acs, ['AC-orders-01']);
  assert.deepEqual(u1.verification, [{ cap: null, command: 'npm test -- orders.api passes' }]);
  assert.deepEqual(u1.integration_verification, [{ cap: 'CAP-orders-api', command: 'npm test -- orders.api' }]);
  assert.deepEqual(u1.depends_on, []);
  assert.equal(u1.prompt, `.aioson/context/execution-prompts/${SLUG}/phase-1.md`);
  assert.equal(u1.report, `.aioson/context/reports/${SLUG}/{run_id}/phase-1.json`);
  assert.equal(u1.qa_report, `.aioson/context/reports/${SLUG}/{run_id}/phase-1-qa.json`);
  assert.equal(u2.lane, 'frontend');
  assert.equal(u3.owner, 'integration');
  assert.equal(u3.lane, null);
  assert.equal(u3.prompt, undefined, 'integration units get no lane prompt — the session DEV runs them');
  assert.deepEqual({ ...plan.integration, verification: undefined }, { owner: 'dev', units: ['phase-3'], role: null, verification: undefined });
  assert.ok(plan.integration.verification.some(item => item.cap === 'CAP-orders-api'));
  assert.deepEqual(plan.parallel, { max_concurrent_lanes: 2 });
  assert.equal(plan.on_unavailable, 'ask');
  assert.equal(plan.source.plan, `.aioson/context/implementation-plan-${SLUG}.md`);
  assert.match(plan.source.plan_digest, /^[0-9a-f]{64}$/);
  assert.equal(plan.source.roles, '.aioson/config/execution-roles.json');
  assert.deepEqual(plan.source.dev_profile.sections, ['implementation-strategy', 'execution-invariants']);

  // Unit prompt: profile (from dev.md) + contract + excerpts, token-lean.
  const prompt = await fs.readFile(path.join(dir, u1.prompt), 'utf8');
  assert.match(prompt, /^# AIOSON dev-lane profile/);
  assert.match(prompt, /## Implementation strategy/);
  assert.match(prompt, /## Execution invariants/);
  assert.match(prompt, /Never run stage-ownership or publishing commands: workflow:next, dev:state:write, pulse:update, agent:done/);
  assert.match(prompt, /Use Git only for read-only inspection in this shared worktree/);
  assert.match(prompt, /Compare baselines with git show without replacing working files/);
  assert.match(prompt, /# Unit contract — orders \/ phase-1/);
  assert.match(prompt, /- Lane: backend \(write paths: src\/api\/\*\*, tests\/api\/\*\*\)/);
  assert.match(prompt, /- Phase: 1 — wave 1 of 2/);
  assert.match(prompt, /  - src\/api\/orders\.ts\n  - tests\/api\/orders\.test\.ts/);
  assert.match(prompt, /- Done when: npm test -- orders\.api passes/);
  assert.match(prompt, /  - npm test -- orders\.api passes/);
  assert.match(prompt, /\| AC-orders-01 \| CAP-orders-api \| POST \/orders creates an order \| api test \|/);
  assert.doesNotMatch(prompt, /AC-orders-02/, 'another lane\'s acceptance criteria stay out of this unit');
  assert.match(prompt, /\| CAP-orders-api \| create \| src\/api\/orders\.ts, tests\/api\/orders\.test\.ts \| order endpoints \|/);
  assert.doesNotMatch(prompt, /Ship orders end to end/, 'the PRD goal prose is not copied — excerpts only');
  const lanePrompt = await fs.readFile(path.join(dir, plan.lanes.backend.prompt), 'utf8');
  assert.match(lanePrompt, /# Lane contract — orders \/ backend/);
  assert.match(lanePrompt, /phase-1: phase 1, wave 1/);
  assert.equal(await fs.readFile(path.join(dir, plan.lanes.backend.prompt), 'utf8').then(Boolean), true);
  assert.deepEqual((await fs.readdir(path.join(dir, '.aioson', 'context', 'execution-prompts', SLUG))).sort(), ['backend.md', 'frontend.md', 'phase-1.md', 'phase-2.md']);

  // Manifest: created, ONLY lanes + execution mode touched, valid.
  const loaded = await loadManifest(dir, SLUG);
  assert.equal(loaded.ok, true, JSON.stringify(loaded.errors));
  const manifest = loaded.manifest;
  assert.equal(result.manifest.created, true);
  assert.equal(manifest.development_lanes.strategy, 'split');
  assert.equal(manifest.development_lanes.integration_owner, 'dev');
  const backend = manifest.development_lanes.lanes.backend;
  assert.equal(backend.enabled, true);
  assert.equal(backend.host, 'codex');
  assert.equal(backend.model, 'gpt-5.6');
  assert.equal(backend.reasoning_effort, 'high');
  assert.equal(backend.mode, 'external');
  assert.deepEqual(backend.write_paths, ['src/api/**', 'tests/api/**']);
  assert.equal(backend.prompt, `.aioson/context/execution-prompts/${SLUG}/backend.md`);
  assert.equal(backend.report, `.aioson/context/reports/${SLUG}/{run_id}/dev-backend.json`);
  assert.deepEqual(backend.qa, { host: 'claude', model: 'claude-sonnet-5', report: `.aioson/context/reports/${SLUG}/{run_id}/qa-backend.json`, max_fix_files: 3, max_rework_rounds: 1 });
  const frontend = manifest.development_lanes.lanes.frontend;
  assert.equal(frontend.host, 'kimi');
  assert.equal(Object.hasOwn(frontend, 'reasoning_effort'), false);
  assert.equal(manifest.orchestration.execution, 'orchestrated');
  assert.equal(resolveExecutionMode(manifest), 'orchestrated');
  assert.equal(manifest.orchestration.mode, 'autopilot', 'the rest of the orchestration block keeps its defaults');
  assert.equal(manifest.agents.dev.enabled, true, 'session agents are untouched');
  assert.equal(validateManifest(manifest, SLUG).ok, true);
  assert.equal(plan.source.manifest_digest, loaded.digest);

  // Verify: fresh.
  const verified = await verifyExecutionPlan(dir, SLUG, { env });
  assert.equal(verified.ok, true, JSON.stringify(verified.issues));
  assert.deepEqual(verified.issues, []);
  assert.deepEqual(verified.checks.map((c) => c.id), ['execution-plan:present', 'execution-plan:plan-digest', 'execution-plan:roles', 'execution-plan:dev-profile', 'execution-plan:manifest', 'execution-plan:signatures', 'execution-plan:fallback-signatures', 'execution-plan:prompts', 'execution-plan:waves', 'execution-plan:edges']);
  assert.ok(verified.checks.every((c) => c.ok));
  assert.deepEqual(verified.metrics, result.summary);

  // Recompile: same plan, same digests, still fresh; offer reports it.
  const again = await compile(dir, env);
  assert.equal(again.ok, true);
  assert.equal(again.manifest.created, false);
  const second = (await readExecutionPlan(dir, SLUG)).plan;
  assert.deepEqual(second.units, plan.units);
  assert.equal(second.source.manifest_digest, plan.source.manifest_digest);
  const offered = await offer(dir, env, { feature: SLUG });
  assert.equal(offered.plan.compiled.exists, true);
  assert.equal(offered.plan.compiled.fresh, true);
});

test('execution:compile preserves what it does not own in an existing manifest and disables lanes that left the plan', async (t) => {
  const { dir, env } = await setup(t);
  const manifest = defaults(SLUG, 'claude');
  manifest.capacity_policy = { strategy: 'retry', max_attempts: 2, backoff_ms: 10 };
  manifest.development_lanes.strategy = 'split';
  manifest.development_lanes.lanes.backend.enabled = true;
  manifest.development_lanes.lanes.backend.write_paths = ['src/legacy/**'];
  manifest.development_lanes.lanes.backend.fallbacks = [{ host: 'opencode', model: 'configured-default', on: ['unavailable'] }];
  manifest.development_lanes.lanes.backend.qa = { host: 'claude', model: 'old', report: `.aioson/context/reports/${SLUG}/{run_id}/custom-qa.json`, max_fix_files: 5 };
  manifest.development_lanes.lanes.mobile = { ...manifest.development_lanes.lanes.frontend, enabled: true, write_paths: ['src/mobile/**'], prompt: `.aioson/context/execution-prompts/${SLUG}/mobile.md` };
  await writeManifest(dir, SLUG, manifest);

  const result = await compile(dir, env);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.manifest.created, false);
  const next = (await loadManifest(dir, SLUG)).manifest;
  assert.equal(next.host, 'claude');
  assert.equal(next.agents.dev.host, 'claude');
  assert.deepEqual(next.capacity_policy, { strategy: 'retry', max_attempts: 2, backoff_ms: 10 });
  assert.deepEqual(next.development_lanes.lanes.backend.fallbacks, [{ host: 'opencode', model: 'configured-default', on: ['unavailable'] }]);
  assert.deepEqual(next.development_lanes.lanes.backend.write_paths, ['src/api/**', 'tests/api/**'], 'write paths come from the plan');
  assert.equal(next.development_lanes.lanes.backend.qa.report, `.aioson/context/reports/${SLUG}/{run_id}/custom-qa.json`, 'a custom report path is kept');
  assert.equal(next.development_lanes.lanes.backend.qa.max_fix_files, 5, 'the operator\'s fix cap is kept');
  assert.equal(next.development_lanes.lanes.backend.qa.model, 'claude-sonnet-5', 'host/model come from the roles');
  assert.equal(next.development_lanes.lanes.mobile.enabled, false, 'a lane the plan no longer declares is disabled, not deleted');
  assert.equal(validateManifest(next, SLUG).ok, true);
  assert.equal((await verifyExecutionPlan(dir, SLUG, { env })).ok, true);
});

test('execution:compile --dry-run computes the plan and writes nothing', async (t) => {
  const { dir, env } = await setup(t);
  const result = await compile(dir, env, { 'dry-run': true });
  assert.equal(result.ok, true);
  assert.equal(result.dry_run, true);
  assert.equal(result.plan.summary.units, 3);
  assert.equal(result.manifest.would_create, true);
  assert.equal((await readExecutionPlan(dir, SLUG)).exists, false);
  assert.equal((await loadManifest(dir, SLUG)).exists, false);
  await assert.rejects(fs.access(path.join(dir, '.aioson', 'context', 'execution-prompts')));
});

test('execution:compile warnings — table/role mismatch, self-review with the same model, CAP without unit, missing PRD', async (t) => {
  const plan = PLAN
    .replace('| backend | codex | gpt-5.6 | src/api/**, tests/api/** | dev |', '| backend | opencode | some/other | src/api/**, tests/api/** | @dev |')
    .replace('| CAP-orders-wire | 3 | src/app.ts | npm test -- app |', '| CAP-orders-wire | 3 | src/app.ts | npm test -- app |\n| CAP-orders-extra | 4 | src/extra.ts | npm test -- extra |');
  const roles = { ...ROLES, roles: { ...ROLES.roles, backend_qa: { host: 'codex', model: 'gpt-5.6', reasoning_effort: 'high' } } };
  const { dir, env } = await setup(t, { plan, prd: null, roles });
  const result = await compile(dir, env);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  const warnings = Object.fromEntries(result.warnings.map((w) => [w.check, w.message]));
  assert.match(warnings.lane_role_mismatch, /opencode\/some\/other .* codex\/gpt-5.6/);
  assert.match(warnings.self_review_same_model, /lane "backend"/);
  assert.match(warnings.cap_without_unit, /CAP-orders-extra/);
  assert.match(warnings.prd_missing, /prd-orders\.md not found/);
  const { plan: compiled } = await readExecutionPlan(dir, SLUG);
  assert.equal(compiled.lanes.backend.qa.role, 'backend_qa');
  assert.equal(compiled.lanes.backend.qa.inherited, false);
  assert.equal(compiled.lanes.backend.plan_host, 'opencode');
  assert.deepEqual(compiled.warnings.map((w) => w.check).sort(), ['cap_without_unit', 'lane_role_mismatch', 'prd_missing', 'self_review_same_model']);
});

test('units without an explicit CAP inherit it from the delivery plan phase or the implementation delta paths', async (t) => {
  const plan = PLAN.replace('| CAP-orders-api | npm test -- orders.api passes |', '| data layer | npm test -- orders.api passes |');
  const { dir, env } = await setup(t, { plan });
  const result = await compile(dir, env);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  const { plan: compiled } = await readExecutionPlan(dir, SLUG);
  assert.deepEqual(compiled.units[0].caps, ['CAP-orders-api']);
  assert.deepEqual(compiled.units[0].acs, ['AC-orders-01']);
  assert.deepEqual(result.warnings, []);
});

// ───────────────────────── staleness (verify:artifact kind=execution-plan) ─────────────────────────

test('verify:artifact keeps runtime role routing hot while plan edits, manifest drift, unsigned compiled hosts and hand-edited prompts are caught', async (t) => {
  const { dir, env } = await setup(t);
  assert.equal((await compile(dir, env)).ok, true);
  const planFile = path.join(dir, '.aioson', 'context', `implementation-plan-${SLUG}.md`);
  const rolesFile = path.join(dir, '.aioson', 'config', 'execution-roles.json');
  const manifestFile = path.join(dir, '.aioson', 'context', `agent-execution-${SLUG}.json`);
  const promptFile = path.join(dir, '.aioson', 'context', 'execution-prompts', SLUG, 'phase-1.md');

  const issueChecks = (verified) => verified.checks.filter((c) => !c.ok).map((c) => c.id);

  await fs.appendFile(planFile, '\nSomeone edited the plan after compiling.\n');
  let verified = await verifyExecutionPlan(dir, SLUG, { env });
  assert.equal(verified.ok, false);
  assert.deepEqual(issueChecks(verified), ['execution-plan:plan-digest']);
  assert.match(verified.issues[0], /plan_digest_stale/);
  await fs.writeFile(planFile, PLAN, 'utf8');

  await fs.writeFile(rolesFile, JSON.stringify({ ...ROLES, roles: { ...ROLES.roles, qa: { host: 'kimi', model: 'kimi-k3' } } }, null, 2));
  verified = await verifyExecutionPlan(dir, SLUG, { env });
  assert.deepEqual(issueChecks(verified), [], 'host/model changes are selected again at stage dispatch');
  await fs.writeFile(rolesFile, JSON.stringify(ROLES, null, 2));

  const manifest = JSON.parse(await fs.readFile(manifestFile, 'utf8'));
  manifest.development_lanes.lanes.frontend.model = 'kimi-k2';
  await fs.writeFile(manifestFile, JSON.stringify(manifest, null, 2));
  verified = await verifyExecutionPlan(dir, SLUG, { env });
  assert.deepEqual(issueChecks(verified), ['execution-plan:manifest']);
  assert.match(verified.issues[0], /manifest_lanes_diverged: lane frontend: model differ/);
  assert.equal((await compile(dir, env)).ok, true, 'recompiling heals the divergence');
  assert.equal((await verifyExecutionPlan(dir, SLUG, { env })).ok, true);

  await writeSignatures({ signatures: { ...ALL_SIGNED, [signatureKey('kimi', 'kimi-k3', null)]: undefined } }, { env });
  verified = await verifyExecutionPlan(dir, SLUG, { env });
  assert.deepEqual(issueChecks(verified), ['execution-plan:signatures']);
  assert.match(verified.issues[0], /frontend\.dev kimi\/kimi-k3 \(missing\)/);
  await writeSignatures({ signatures: ALL_SIGNED }, { env });

  await fs.appendFile(promptFile, '\nAlso do this.\n');
  verified = await verifyExecutionPlan(dir, SLUG, { env });
  assert.deepEqual(issueChecks(verified), ['execution-plan:prompts']);
  assert.match(verified.issues[0], /prompt_stale: phase-1: edited/);
  await fs.rm(promptFile);
  verified = await verifyExecutionPlan(dir, SLUG, { env });
  assert.match(verified.issues[0], /phase-1: missing/);

  // The dev kernel changing is a warning (prompts carry the previous discipline), not a block.
  assert.equal((await compile(dir, env)).ok, true);
  const kernelFile = path.join(dir, '.aioson', 'agents', 'dev.md');
  const kernel = await fs.readFile(kernelFile, 'utf8');
  assert.match(kernel, /## Execution invariants\r?\n/);
  await fs.writeFile(kernelFile, kernel.replace(/## Execution invariants(\r?\n)/, '## Execution invariants$1$10. One more invariant.$1'), 'utf8');
  verified = await verifyExecutionPlan(dir, SLUG, { env });
  assert.equal(verified.ok, true);
  assert.match(verified.warnings[0], /dev_profile_stale/);
});

test('verify:artifact --kind=execution-plan runs through the command and auto-fires at the planner session end, silent for single-DEV features', async (t) => {
  const { dir, env } = await setup(t);
  // Not compiled: the planner's done-gate skips, never nags.
  const quiet = await verifyAgentArtifact({ targetDir: dir, agent: 'planner', options: { feature: SLUG } });
  assert.equal(quiet.kind, 'execution-plan');
  assert.equal(quiet.skipped, true);
  assert.match(quiet.reason, /execution-plan-orders\.json not present/);

  assert.equal((await compile(dir, env)).ok, true);
  const previousEnv = process.env.AIOSON_HOST_SIGNATURES;
  process.env.AIOSON_HOST_SIGNATURES = env.AIOSON_HOST_SIGNATURES;
  t.after(() => {
    if (previousEnv === undefined) delete process.env.AIOSON_HOST_SIGNATURES;
    else process.env.AIOSON_HOST_SIGNATURES = previousEnv;
  });
  const report = await runVerifyArtifact({ args: [dir], options: { kind: 'execution-plan', slug: SLUG, json: true, suppressExitCode: true, 'no-persist': true }, logger });
  assert.equal(report.ok, true, JSON.stringify(report.issues));
  assert.equal(report.kind, 'execution-plan');
  assert.equal(report.verdict, 'pass');
  assert.equal(report.exitCode, 0);
  const { context_bytes_max: metricsContextBytes, ...metrics } = report.metrics;
  assert.deepEqual(metrics, { lanes: 2, units: 3, lane_units: 2, integration_units: 1, waves: 2, edges: 0, processes: 4, parallelism: { max_concurrent_units: 2, serial_chain: 1, critical_path_processes: 2, serial: false }, ceiling: { max_files: 10, max_acs: 6 } });
  assert.ok(metricsContextBytes > 0);

  const fired = await verifyAgentArtifact({ targetDir: dir, agent: 'planner', options: { feature: SLUG } });
  assert.equal(fired.skipped, false);
  assert.equal(fired.ok, true);

  await fs.appendFile(path.join(dir, '.aioson', 'context', `implementation-plan-${SLUG}.md`), '\nedited\n');
  const stale = await verifyAgentArtifact({ targetDir: dir, agent: 'planner', options: { feature: SLUG } });
  assert.equal(stale.ok, false);
  assert.match(stale.reason, /plan_digest_stale/);

  const missingSlug = await runVerifyArtifact({ args: [dir], options: { kind: 'execution-plan', json: true, suppressExitCode: true, 'no-persist': true }, logger });
  assert.equal(missingSlug.ok, false);
  assert.equal(missingSlug.error, 'missing_slug');
});

// ───────────────────────── schema (additive) ─────────────────────────

test('manifest schema accepts the lane qa block and orchestration.execution, rejects their unknown fields and bad values', () => {
  const manifest = defaults('demo', 'codex');
  assert.equal(validateManifest(manifest, 'demo').ok, true, 'defaults carry neither field');
  manifest.orchestration.execution = 'orchestrated';
  manifest.development_lanes.lanes.backend.qa = { host: 'claude', model: 'claude-sonnet-5', report: '.aioson/context/reports/demo/{run_id}/qa-backend.json', max_fix_files: 3, fallbacks: [] };
  assert.equal(validateManifest(manifest, 'demo').ok, true);

  manifest.orchestration.execution = 'parallel';
  manifest.development_lanes.lanes.backend.qa.max_fix_files = 99;
  manifest.development_lanes.lanes.backend.qa.token = 'x';
  manifest.development_lanes.lanes.backend.qa.report = 'no-run-id.json';
  // A secret key is reported by the qa validator AND the manifest-wide secret scan (same as agent entries) — dedupe paths.
  const errors = [...new Set(validateManifest(manifest, 'demo').errors.map((e) => e.path))].sort();
  assert.deepEqual(errors, [
    '$.development_lanes.lanes.backend.qa.max_fix_files',
    '$.development_lanes.lanes.backend.qa.report',
    '$.development_lanes.lanes.backend.qa.token',
    '$.orchestration.execution'
  ]);
  assert.equal(resolveExecutionMode(defaults('demo', 'codex')), 'single');
  assert.equal(resolveExecutionMode({}), 'single');
});

test('plan-waves: the lanes table parser keeps glob write paths intact and reports malformed rows; absent section is null', () => {
  const parsed = parseDevelopmentLanes(PLAN);
  assert.deepEqual(parsed.rows.map((row) => [row.lane, row.host, row.model, row.write_paths, row.integration_owner]), [
    ['backend', 'codex', 'gpt-5.6', ['src/api/**', 'tests/api/**'], 'dev'],
    ['frontend', 'kimi', 'kimi-k3', ['src/ui/**', 'tests/ui/**'], 'dev']
  ]);
  assert.equal(parseDevelopmentLanes('# plan\n\n## Execution Sequence\n| Phase | Wave | Files |\n|---|---|---|\n| 1 | 1 | a.ts |'), null);
  const malformed = parseDevelopmentLanes('## Development execution lanes\n| Lane | Exact write paths |\n|---|---|\n| backend | src/** |\n| broken |\n');
  assert.deepEqual(malformed.malformed, [{ row: 2, cells: 1 }]);
  assert.equal(malformed.rows.length, 1);
});

// ───────────────────────── CLI ─────────────────────────

test('CLI: execution:offer exits 0 whether or not the path is available; execution:compile exits 1 on refusal and 0 on success', async (t) => {
  const { dir, env } = await setup(t);
  const run = (args) => spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8', env });

  const offered = run(['execution:offer', dir, '--json']);
  assert.equal(offered.status, 0, offered.stderr);
  assert.equal(JSON.parse(offered.stdout).available, true);

  const refused = run(['execution:compile', dir, '--feature=missing-feature', '--json']);
  assert.equal(refused.status, 1);
  assert.equal(JSON.parse(refused.stdout).reason, 'plan_not_found');

  const compiled = run(['execution-compile', dir, `--feature=${SLUG}`, '--json']);
  assert.equal(compiled.status, 0, compiled.stderr);
  const payload = JSON.parse(compiled.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.summary.processes, 4);

  const human = run(['execution:compile', dir, `--feature=${SLUG}`]);
  assert.equal(human.status, 0, human.stderr);
  assert.match(human.stdout, /Execution plan compiled: \.aioson\/context\/execution-plan-orders\.json/);
  assert.match(human.stdout, /lanes 2 \| units 3 \(lane 2, integration 1\) \| waves 2 \| processes 4/);
  assert.match(human.stdout, /Verify: aioson verify:artifact \. --kind=execution-plan --slug=orders/);

  const verified = run(['verify:artifact', dir, '--kind=execution-plan', `--slug=${SLUG}`, '--json', '--no-persist']);
  assert.equal(verified.status, 0, verified.stderr);
  assert.equal(JSON.parse(verified.stdout).verdict, 'pass');

  const help = run(['--help']);
  assert.match(help.stdout, /aioson execution:offer \[path\] \[--feature=<slug>\]/);
  assert.match(help.stdout, /aioson execution:compile \[path\] --feature=<slug> \[--dry-run\]/);
  assert.match(help.stdout, /aioson host:signature \[path\]/);
});

// ───────────────────────── graph engineering: `Depends on` → edges ─────────────────────────

const { parseDependsCell } = require('../src/harness/plan-waves');

const PLAN_DEPS = PLAN.replace(
  [
    '## Execution Sequence',
    '| Phase | Wave | Files | Scope | Done when |',
    '|---|---|---|---|---|',
    '| 1 | 1 | src/api/orders.ts, tests/api/orders.test.ts | CAP-orders-api | npm test -- orders.api passes |',
    '| 2 | 1 | src/ui/Orders.tsx, tests/ui/Orders.test.tsx | CAP-orders-ui | npm test -- orders.ui passes |',
    '| 3 | 2 | src/app.ts | CAP-orders-wire | npm test -- app passes |'
  ].join('\n'),
  [
    '## Execution Sequence',
    '| Phase | Wave | Files | Scope | Done when | Depends on |',
    '|---|---|---|---|---|---|',
    '| 1 | 1 | src/api/orders.ts, tests/api/orders.test.ts | CAP-orders-api | npm test -- orders.api passes | |',
    '| 2 | 1 | src/ui/Orders.tsx, tests/ui/Orders.test.tsx | CAP-orders-ui | npm test -- orders.ui passes | - |',
    '| 3 | 2 | src/ui/OrdersList.tsx | CAP-orders-ui | npm test -- orders.ui passes | 2 (dev) |',
    '| 4 | 2 | src/api/orders-report.ts | CAP-orders-api | npm test -- orders.api passes | 1, Phase 2 |',
    '| 5 | 3 | src/app.ts | CAP-orders-wire | npm test -- app passes | |'
  ].join('\n')
);

test('plan-waves: the optional Depends on cell parses phase names with their gates; absent column yields no edges', () => {
  assert.deepEqual(parseDependsCell('1, Phase 2 (dev); `3` (qa), -, none, (implemented) 4'), [
    { phase: '1', gate: 'after_qa' },
    { phase: 'Phase 2', gate: 'after_dev' },
    { phase: '3', gate: 'after_qa' },
    { phase: '(implemented) 4', gate: 'after_qa' }
  ]);
  assert.deepEqual(parseDependsCell(''), []);
  assert.deepEqual(parseDependsCell('—'), []);
  const { parseExecutionWaves } = require('../src/harness/plan-waves');
  const rows = parseExecutionWaves(PLAN_DEPS);
  assert.deepEqual(rows.map((row) => row.depends), [[], [], [{ phase: '2', gate: 'after_dev' }], [{ phase: '1', gate: 'after_qa' }, { phase: 'Phase 2', gate: 'after_qa' }], []]);
  assert.equal(rows[2].depends_raw, '2 (dev)');
  assert.deepEqual(parseExecutionWaves(PLAN).map((row) => row.depends), [[], [], []]);
});

test('execution:compile — Depends on becomes typed edges: depends_on per unit, edges[], scheduling, prompts name them; the cross-lane edge warns without an Interface Contract and is silent with one', async (t) => {
  const { dir, env } = await setup(t, { plan: PLAN_DEPS });
  const result = await compile(dir, env);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  const { context_bytes_max: depsContextBytes, ...depsSummary } = result.summary;
  assert.deepEqual(depsSummary, { lanes: 2, units: 5, lane_units: 4, integration_units: 1, waves: 3, edges: 3, processes: 8, parallelism: { max_concurrent_units: 2, serial_chain: 2, critical_path_processes: 4, serial: false }, ceiling: { max_files: 10, max_acs: 6 } });
  assert.ok(depsContextBytes > 0);
  assert.deepEqual(result.warnings.map((w) => w.check), ['dependency_cross_lane_without_contract']);
  assert.match(result.warnings[0].message, /"4" \(backend\) depends on "2" \(frontend\)/);

  const { plan } = await readExecutionPlan(dir, SLUG);
  assert.equal(plan.version, 2);
  assert.equal(plan.scheduling, 'dependencies');
  assert.deepEqual(plan.edges, [
    { from: 'phase-2', to: 'phase-3', gate: 'after_dev' },
    { from: 'phase-1', to: 'phase-4', gate: 'after_qa' },
    { from: 'phase-2', to: 'phase-4', gate: 'after_qa' }
  ]);
  const byId = Object.fromEntries(plan.units.map((unit) => [unit.id, unit]));
  assert.deepEqual(byId['phase-3'].depends_on, [{ unit: 'phase-2', gate: 'after_dev' }]);
  assert.deepEqual(byId['phase-4'].depends_on, [{ unit: 'phase-1', gate: 'after_qa' }, { unit: 'phase-2', gate: 'after_qa' }]);
  assert.deepEqual(byId['phase-1'].depends_on, []);
  assert.equal(byId['phase-5'].owner, 'integration');

  const prompt3 = await fs.readFile(path.join(dir, byId['phase-3'].prompt), 'utf8');
  assert.match(prompt3, /- Depends on: phase-2 \(after its implementation\) — their files are done work you build on, never files you edit/);
  const prompt1 = await fs.readFile(path.join(dir, byId['phase-1'].prompt), 'utf8');
  assert.doesNotMatch(prompt1, /Depends on/, 'a unit without edges keeps the wave contract only');
  const lanePrompt = await fs.readFile(path.join(dir, plan.lanes.backend.prompt), 'utf8');
  assert.match(lanePrompt, /phase-4: phase 4, wave 2 — src\/api\/orders-report\.ts \(depends on phase-1 after its review, phase-2 after its review\)/);

  const verified = await verifyExecutionPlan(dir, SLUG, { env });
  assert.equal(verified.ok, true, JSON.stringify(verified.issues));
  assert.ok(verified.checks.find((c) => c.id === 'execution-plan:edges').ok);

  // A hand-edited edge (gate, direction) is caught by the freshness gate.
  const planFile = path.join(dir, `.aioson/context/execution-plan-${SLUG}.json`);
  const edited = JSON.parse(await fs.readFile(planFile, 'utf8'));
  edited.edges[0] = { from: 'phase-3', to: 'phase-2', gate: 'after_dev' };
  await fs.writeFile(planFile, JSON.stringify(edited, null, 2));
  const stale = await verifyExecutionPlan(dir, SLUG, { env });
  assert.equal(stale.ok, false);
  assert.match(stale.issues.join('\n'), /edges_inconsistent: .*does not move to a later wave.*phase-3 depends on phase-2 \(after_dev\) but no such edge is compiled/);

  // With an Interface Contract in the PRD the cross-lane edge is a declared boundary — no warning.
  const contracted = await setup(t, { plan: PLAN_DEPS, prd: `${PRD}\n## Interface Contract\n| Producer | Consumer | Contract |\n|---|---|---|\n| backend | frontend | GET /orders → Order[] |\n` });
  const quiet = await compile(contracted.dir, contracted.env);
  assert.equal(quiet.ok, true);
  assert.deepEqual(quiet.warnings, []);
});

test('execution:compile refuses a broken graph with named findings — unknown phase, self-dependency, same-or-later wave, integration dependency, cycle', async (t) => {
  const unknown = await setup(t, { plan: PLAN_DEPS.replace('| 2 (dev) |', '| 9 |') });
  let result = await compile(unknown.dir, unknown.env);
  assert.equal(result.reason, 'compile_refused');
  assert.ok(checks(result).includes('dependency_unknown'), checks(result).join(','));
  assert.match(result.errors.find((e) => e.check === 'dependency_unknown').message, /phase "3" depends on "9"/);

  const self = await setup(t, { plan: PLAN_DEPS.replace('| 2 (dev) |', '| 3 |') });
  result = await compile(self.dir, self.env);
  assert.ok(checks(result).includes('dependency_self'), checks(result).join(','));

  const sameWave = await setup(t, { plan: PLAN_DEPS.replace('| 1, Phase 2 |', '| 3 |') });
  result = await compile(sameWave.dir, sameWave.env);
  assert.ok(checks(result).includes('dependency_wave_violation'), checks(result).join(','));
  assert.match(result.errors.find((e) => e.check === 'dependency_wave_violation').message, /phase "4" \(wave 2\) depends on "3" \(wave 2\)/);

  const cycle = await setup(t, { plan: PLAN_DEPS.replace('| 1, Phase 2 |', '| 3 |').replace('| 2 (dev) |', '| 4 |') });
  result = await compile(cycle.dir, cycle.env);
  assert.ok(checks(result).includes('cycle_detected'), checks(result).join(','));
  assert.match(result.errors.find((e) => e.check === 'cycle_detected').message, /phase-3, phase-4/);

  const onIntegration = await setup(t, { plan: PLAN_DEPS.replace('| 5 | 3 | src/app.ts | CAP-orders-wire | npm test -- app passes | |', '| 5 | 3 | src/app.ts | CAP-orders-wire | npm test -- app passes | |\n| 6 | 4 | src/ui/Extra.tsx | CAP-orders-ui | npm test -- orders.ui passes | 5 |') });
  result = await compile(onIntegration.dir, onIntegration.env);
  assert.ok(checks(result).includes('dependency_on_integration'), checks(result).join(','));

  for (const { dir } of [unknown, self, sameWave, cycle, onIntegration]) assert.equal((await readExecutionPlan(dir, SLUG)).exists, false, 'a refused compile writes nothing');
});

// ───────────────────────── judge ≠ producer ─────────────────────────

test('execution.require_independent_qa turns the self-review warning into a refusal — the judge must differ from the producer', async (t) => {
  // Validation: a boolean, nothing else.
  const badType = validateExecutionRoles({ ...ROLES, execution: { require_independent_qa: 'yes' } });
  assert.equal(badType.ok, false);
  assert.match(badType.errors.find((e) => e.path === '$.execution.require_independent_qa').message, /must be a boolean/);
  assert.equal(validateExecutionRoles({ ...ROLES, execution: { require_independent_qa: true } }).ok, true);

  // Same host/model for the backend lane's dev and qa, flag on: refused, nothing written.
  const sameModel = { ...ROLES, roles: { ...ROLES.roles, backend_qa: { host: 'codex', model: 'gpt-5.6', reasoning_effort: 'high' } }, execution: { require_independent_qa: true } };
  const refused = await setup(t, { roles: sameModel });
  const result = await compile(refused.dir, refused.env);
  assert.equal(result.ok, false);
  assert.deepEqual(checks(result), ['self_review_same_model']);
  const refusal = result.errors[0];
  assert.match(refusal.message, /lane "backend": dev and qa run the same host\/model \(codex\/gpt-5\.6\)/);
  assert.match(refusal.message, /execution\.require_independent_qa is on — declare "backend_qa" \(or "qa"\) on a different host or model/);
  assert.equal(refusal.role, 'backend_qa');
  assert.equal((await readExecutionPlan(refused.dir, SLUG)).exists, false, 'a refused compile writes nothing');

  // Same roles, flag off (default): the warning the compile always had, plan written.
  const warned = await setup(t, { roles: { ...sameModel, execution: {} } });
  const lenient = await compile(warned.dir, warned.env);
  assert.equal(lenient.ok, true, JSON.stringify(lenient.errors));
  assert.ok(lenient.warnings.some((w) => w.check === 'self_review_same_model' && /lane "backend"/.test(w.message)));
  assert.equal((await readExecutionPlan(warned.dir, SLUG)).exists, true);

  // Flag on with an independent reviewer (the shared qa role on another host): clean compile, no warning.
  const independent = await setup(t, { roles: { ...ROLES, execution: { require_independent_qa: true } } });
  const clean = await compile(independent.dir, independent.env);
  assert.equal(clean.ok, true, JSON.stringify(clean.errors));
  assert.equal(clean.warnings.some((w) => w.check === 'self_review_same_model'), false);
  const { plan: compiled } = await readExecutionPlan(independent.dir, SLUG);
  assert.equal(compiled.lanes.backend.dev.host, 'codex');
  assert.equal(compiled.lanes.backend.qa.host, 'claude');
});

// ───────────────────────── rules + prd drift after compilation ─────────────────────────

test('the compiled plan pins the binding rules: a rule added or edited after compilation is a named warning, never invisible — and PRD drift stays the warning it was', async (t) => {
  const { dir, env } = await setup(t);
  assert.equal((await compile(dir, env)).ok, true);
  let { plan } = await readExecutionPlan(dir, SLUG);
  assert.equal(plan.source.rules, '.aioson/rules');
  assert.equal(plan.source.rules_digest, null, 'no rules directory → nothing pinned');
  assert.equal(plan.source.rules_files, 0);
  let verified = await verifyExecutionPlan(dir, SLUG, { env });
  assert.equal(verified.ok, true, JSON.stringify(verified.issues));
  assert.deepEqual(verified.warnings, []);

  // A client writes its first rule mid-flight.
  const rulesDir = path.join(dir, '.aioson', 'rules');
  await fs.mkdir(path.join(rulesDir, '_archived'), { recursive: true });
  await fs.writeFile(path.join(rulesDir, 'README.md'), '# not a rule\n', 'utf8');
  await fs.writeFile(path.join(rulesDir, '_archived', 'old.md'), '---\nname: old\n---\n# archived\n', 'utf8');
  await fs.writeFile(path.join(rulesDir, 'money.md'), '---\nname: money\n---\n# Money\n- Never store money as float.\n', 'utf8');
  verified = await verifyExecutionPlan(dir, SLUG, { env });
  assert.equal(verified.ok, true, 'rule drift is advisory — the finished units are not thrown away');
  assert.equal(verified.warnings.length, 1);
  assert.match(verified.warnings[0], /^rules_changed: \.aioson\/rules changed after compilation \(0 → 1 binding rule file\(s\)\)/);
  assert.match(verified.warnings[0], /run rules:check at integration and recompile to refresh/);

  // Recompiled: the digest covers the rule, README and _archived stay out of it.
  assert.equal((await compile(dir, env)).ok, true);
  ({ plan } = await readExecutionPlan(dir, SLUG));
  assert.match(plan.source.rules_digest, /^[0-9a-f]{64}$/);
  assert.equal(plan.source.rules_files, 1);
  const pinned = plan.source.rules_digest;
  await fs.writeFile(path.join(rulesDir, 'README.md'), '# still not a rule\n', 'utf8');
  await fs.writeFile(path.join(rulesDir, '_archived', 'older.md'), '# archived too\n', 'utf8');
  verified = await verifyExecutionPlan(dir, SLUG, { env });
  assert.deepEqual(verified.warnings, [], 'README and _archived are not binding');
  assert.equal((await rulesDigest(dir)).digest, pinned);

  // An edit to the binding rule is the drift.
  await fs.appendFile(path.join(rulesDir, 'money.md'), '- Round at the boundary only.\n');
  verified = await verifyExecutionPlan(dir, SLUG, { env });
  assert.equal(verified.ok, true);
  assert.match(verified.warnings[0], /^rules_changed: .* \(1 → 1 binding rule file\(s\)\)/);
  assert.notEqual((await rulesDigest(dir)).digest, pinned);

  // PRD drift: warning, not a refusal — the gap that had no test.
  assert.equal((await compile(dir, env)).ok, true);
  await fs.appendFile(path.join(dir, '.aioson', 'context', `prd-${SLUG}.md`), '\n| AC-orders-03 | CAP-orders-ui | Orders can be filtered | ui test |\n');
  verified = await verifyExecutionPlan(dir, SLUG, { env });
  assert.equal(verified.ok, true);
  assert.deepEqual(verified.warnings.map((w) => w.split(':')[0]), ['prd_digest_stale']);
  assert.match(verified.warnings[0], /unit prompts carry its previous acceptance criteria; recompile to refresh/);

  // A plan compiled before the rules digest existed carries no key and is never warned about it.
  const planFile = path.join(dir, '.aioson', 'context', `execution-plan-${SLUG}.json`);
  const legacy = JSON.parse(await fs.readFile(planFile, 'utf8'));
  delete legacy.source.rules_digest;
  delete legacy.source.rules_files;
  await fs.writeFile(planFile, JSON.stringify(legacy, null, 2), 'utf8');
  await fs.appendFile(path.join(rulesDir, 'money.md'), '- Another edit.\n');
  verified = await verifyExecutionPlan(dir, SLUG, { env });
  assert.equal(verified.warnings.some((w) => w.startsWith('rules_changed')), false);
});
