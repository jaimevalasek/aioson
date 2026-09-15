'use strict';

/**
 * The first door of the orchestrated path. Before this, the only trigger for
 * the single-DEV/orchestrated question was `execution:offer` answering
 * `available: true` — which needs a roles file nothing in the framework
 * created. These tests pin the three legs that replaced the silence:
 *   - the offer names its unlock step (`onboarding.next`) and the plan's
 *     measured scale (`plan.scale`);
 *   - `execution:seed` writes the roles file disabled, on installed hosts, at
 *     the default model, never over an existing one;
 *   - roles at the default model are confirmed BEFORE signatures are asked
 *     for, the answer sticks until a role changes, chosen models never ask.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { runExecution } = require('../src/commands/execution');
const {
  offerExecution,
  seedExecutionRoles,
  confirmDefaultModels,
  readConfirmation,
  rolesDigest,
  validateExecutionRoles,
  EXECUTION_ROLES_CONFIRMATION_RELATIVE_PATH
} = require('../src/lib/execution-roles');
const { DEFAULT_MODEL } = require('../src/lib/host-signature');

const ROOT = path.resolve(__dirname, '..');
const BIN = path.join(ROOT, 'bin', 'aioson.js');
const logger = { log() {}, error() {}, warn() {} };
const SLUG = 'orders';

const LEGACY_LANES = [
  '| Lane | Host | Model | Exact write paths | Integration owner |',
  '|---|---|---|---|---|',
  '| backend | codex | gpt-5.6 | src/api/**, tests/api/** | dev |',
  '| frontend | kimi | kimi-k3 | src/ui/**, tests/ui/** | dev |'
].join('\n');

const LEAN_LANES = [
  '| Lane | Exact write paths | Integration owner |',
  '|---|---|---|',
  '| backend | src/api/**, tests/api/** | dev |',
  '| frontend | src/ui/**, tests/ui/** | dev |'
].join('\n');

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
  LEGACY_LANES,
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

// A controlled machine: the registry lists these hosts; `locate` decides which binaries are installed.
const HOSTS = ['claude', 'codex', 'kimi'];
const installedOnly = (...binaries) => async (binary) => (binaries.includes(binary) ? `/usr/local/bin/${binary}` : null);

async function setup(t, { plan = PLAN, prd = PRD, roles = ROLES } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-execution-onboarding-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  await fs.mkdir(path.join(dir, '.aioson', 'context'), { recursive: true });
  await fs.mkdir(path.join(dir, '.aioson', 'agents'), { recursive: true });
  if (plan !== null) await fs.writeFile(path.join(dir, '.aioson', 'context', `implementation-plan-${SLUG}.md`), plan, 'utf8');
  if (prd !== null) await fs.writeFile(path.join(dir, '.aioson', 'context', `prd-${SLUG}.md`), prd, 'utf8');
  if (roles !== null) {
    await fs.mkdir(path.join(dir, '.aioson', 'config'), { recursive: true });
    await fs.writeFile(path.join(dir, '.aioson', 'config', 'execution-roles.json'), JSON.stringify(roles, null, 2), 'utf8');
  }
  await fs.copyFile(path.join(ROOT, 'template', '.aioson', 'agents', 'dev.md'), path.join(dir, '.aioson', 'agents', 'dev.md'));
  // An empty signature store: nothing on this machine is signed.
  const env = { ...process.env, AIOSON_HOST_SIGNATURES: path.join(dir, 'signatures.json') };
  delete env.AIOSON_PLAY;
  delete env.AIOSON_EXECUTION_SPLIT_MIN_FILES;
  return { dir, env };
}

const offer = (dir, env, extra = {}) => runExecution({ args: [dir], options: { sub: 'offer', json: true, ...extra }, logger, env });
const compile = (dir, env) => runExecution({ args: [dir], options: { sub: 'compile', feature: SLUG, json: true }, logger, env });
const readRoles = (dir) => fs.readFile(path.join(dir, '.aioson', 'config', 'execution-roles.json'), 'utf8');

test('execution:offer names the unlock step and the measured scale — silence was how a 77-file plan went to one context unasked', async (t) => {
  const { dir, env } = await setup(t, { roles: null });
  const result = await offer(dir, env, { feature: SLUG });
  assert.equal(result.ok, true);
  assert.equal(result.exitCode, 0);
  assert.equal(result.available, false);
  assert.equal(result.reason, 'roles_file_missing');
  assert.equal(result.onboarding.state, 'not_unlocked');
  // The plan declares backend/frontend lanes, so the seed command is complete, not a placeholder.
  assert.equal(result.onboarding.next, `aioson execution:seed . --feature=${SLUG} --lanes=backend,frontend`);
  assert.ok(result.hosts.registered.includes('codex'));
  assert.ok(Array.isArray(result.hosts.installed));
  assert.deepEqual(result.plan.lanes, ['backend', 'frontend']);
  assert.equal(result.plan.execution_choice, 'orchestrated', 'a lanes table is a recorded choice');
  assert.equal(result.plan.scale.files, 5);
  assert.equal(result.plan.scale.phases, 3);
  assert.equal(result.plan.scale.waves, 2);
  assert.equal(result.plan.scale.parallel_phases, 2);
  assert.equal(result.plan.scale.split_candidate, false);
  assert.equal(result.plan.scale.threshold.min_files, 12);

  const withoutFeature = await offer(dir, env);
  assert.equal(withoutFeature.onboarding.next, 'aioson execution:seed . --feature=<slug> --lanes=<lane-a,lane-b>');
  assert.equal(withoutFeature.plan, undefined);

  const disabled = await setup(t, { roles: { ...ROLES, enabled: false } });
  const off = await offer(disabled.dir, disabled.env);
  assert.equal(off.onboarding.state, 'disabled');
  assert.match(off.onboarding.next, /set "enabled": true in \.aioson\/config\/execution-roles\.json/);

  const unsigned = await offer(dir, env, {});
  assert.equal(unsigned.reason, 'roles_file_missing');
  const unsignedRoles = await setup(t);
  const unsignedOffer = await offer(unsignedRoles.dir, unsignedRoles.env);
  assert.equal(unsignedOffer.reason, 'signature_missing');
  assert.equal(unsignedOffer.onboarding.state, 'unsigned');
  assert.equal(unsignedOffer.onboarding.next, 'aioson host:signature . --host=codex --model=gpt-5.6 --effort=high');

  // The floor moves with the environment; the answer says so.
  const low = await offer(dir, { ...env, AIOSON_EXECUTION_SPLIT_MIN_FILES: '5' }, { feature: SLUG });
  assert.equal(low.plan.scale.split_candidate, true);
  assert.equal(low.plan.scale.threshold.min_files, 5);
});

test('execution:offer recommends on the measured scale, never on the lock — the incident: a locked 52-file two-surface plan was presented with "single DEV (Recommended)"', async (t) => {
  // The incident's shape: 38 frontend + 12 backend + 2 shared files in 5
  // phases, no lanes table, no sequence — the state the question is asked in.
  const panel = Array.from({ length: 38 }, (_, i) => `apps/panel/src/S${i}.tsx`);
  const core = Array.from({ length: 12 }, (_, i) => `apps/core/server/m${i}.ts`);
  const shared = ['packages/shared/types.ts', 'packages/shared/contract.ts'];
  const phaseFiles = [core.slice(0, 12), shared, panel.slice(0, 14), panel.slice(14, 28), panel.slice(28)];
  const bigPlan = [
    '---', 'feature: orders', 'status: approved', '---',
    '# Implementation Plan — orders', '',
    '## Implementation Delta',
    '| CAP | Action | Existing evidence | Exact paths | Required change |',
    '|---|---|---|---|---|',
    ...phaseFiles.map((files, i) => `| CAP-orders-p${i + 1} | ${i % 2 ? 'modify' : 'create'} | none | ${files.join(', ')} | refound |`),
    '',
    '## Capability Delivery Plan',
    '| CAP | Phase | Files | Verification |',
    '|---|---|---|---|',
    ...phaseFiles.map((files, i) => `| CAP-orders-p${i + 1} | ${i + 1} | ${files.join(', ')} | npm test |`),
    ''
  ].join('\n');
  const { dir, env } = await setup(t, { plan: bigPlan, roles: null });
  const result = await offer(dir, env, { feature: SLUG });
  assert.equal(result.available, false);
  assert.equal(result.reason, 'roles_file_missing');
  assert.equal(result.plan.scale.files, 52);
  assert.equal(result.plan.scale.phases, 5);
  assert.equal(result.plan.scale.split_candidate, true);
  assert.equal(result.plan.scale.surfaces.two_sided, true);
  // The measured recommendation is orchestrated even though the path is locked.
  assert.equal(result.plan.recommendation.choice, 'orchestrated');
  assert.match(result.plan.recommendation.reasons[0], /52 files ≥ the 12-file floor for one context/);
  assert.ok(result.plan.recommendation.reasons.some((reason) => /two surfaces \(backend 12 · frontend 38\)/.test(reason)));
  assert.equal(result.onboarding.next, `aioson execution:seed . --feature=${SLUG} --lanes=backend,frontend`);

  // The human output prints the recommendation and says the lock never flips it.
  const lines = [];
  await runExecution({ args: [dir], options: { sub: 'offer', feature: SLUG }, logger: { log: (line) => lines.push(line), error() {}, warn() {} }, env });
  const recommendationLine = lines.find((line) => line.includes('recommendation:'));
  assert.ok(recommendationLine, 'the offer prints the recommendation line');
  assert.match(recommendationLine, /recommendation: orchestrated — 52 files/);
  assert.match(recommendationLine, /locked today — that never flips the recommendation; unlock: aioson execution:seed \. --feature=orders --lanes=backend,frontend/);

  // A recorded single choice below any real cut still recommends single — the recommendation is advice, the choice stays the owner's.
  const smallResult = await offer(dir, { ...env, AIOSON_EXECUTION_SPLIT_MIN_FILES: '100' }, { feature: SLUG });
  assert.equal(smallResult.plan.recommendation.choice, 'single');
  assert.match(smallResult.plan.recommendation.reasons[0], /below the 100-file split floor/);
});

test('execution:seed — the roles file is born disabled, valid, on installed hosts, at the default model, naming the planner; the reviewer differs when a second host exists (AC-seed-*, AC-reviewer-differs)', async (t) => {
  const { dir, env } = await setup(t, { roles: null });
  const result = await seedExecutionRoles(dir, { lanes: ['backend', 'frontend'], feature: SLUG, hosts: HOSTS, env, locate: installedOnly('codex', 'claude') });
  assert.equal(result.ok, true);
  assert.equal(result.outcome, 'seeded');
  assert.equal(result.written, true);
  assert.equal(result.enabled, false);
  assert.deepEqual(result.hosts, { registered: HOSTS, installed: ['claude', 'codex'] });
  assert.equal(result.independent_review, true);

  const document = JSON.parse(await readRoles(dir));
  assert.deepEqual(Object.keys(document.roles).sort(), ['backend_dev', 'frontend_dev', 'integration_dev', 'qa'], 'AC-seed-writes');
  assert.equal(document.enabled, false, 'AC-seed-disabled');
  assert.equal(validateExecutionRoles(document, { hosts: HOSTS }).ok, true, 'AC-seed-valid');
  for (const role of Object.values(document.roles)) {
    assert.ok(['claude', 'codex'].includes(role.host), 'AC-seed-installed-host: every role points at an installed host');
    assert.equal(role.model, DEFAULT_MODEL, 'AC-seed-default-model');
    assert.equal(role.reasoning_effort, null);
  }
  assert.equal(document.roles.backend_dev.host, 'claude');
  assert.equal(document.roles.qa.host, 'codex', 'AC-reviewer-differs: the judge is not the producer');
  assert.equal(document.source, 'aioson-planner (feature: orders)', 'AC-seed-source');
  assert.deepEqual(document.parallel, { max_concurrent_lanes: 10 });
  assert.equal(document.on_unavailable, 'ask');
  // Only the root keys the desktop client's reader accepts — a seeded file must open in its panel.
  assert.deepEqual(Object.keys(document).sort(), ['enabled', 'on_unavailable', 'parallel', 'roles', 'source', 'version']);

  // AC-seed-disabled through the offer: the seeded file is never available.
  const offered = await offerExecution(dir, { env, hosts: HOSTS });
  assert.equal(offered.available, false);
  assert.equal(offered.reason, 'roles_disabled');

  // AC-seed-preserves: a second seeding changes nothing and names the roles new lanes would need.
  const before = await readRoles(dir);
  const again = await seedExecutionRoles(dir, { lanes: ['backend', 'mobile-app'], feature: SLUG, hosts: HOSTS, env, locate: installedOnly('codex') });
  assert.equal(again.ok, true);
  assert.equal(again.outcome, 'already_present');
  assert.equal(again.written, false);
  assert.deepEqual(again.missing_roles, ['mobile_app_dev']);
  assert.equal(await readRoles(dir), before);

  // One host only: reviewer = implementer's host, and the seed says the review is not independent.
  const single = await setup(t, { roles: null });
  const one = await seedExecutionRoles(single.dir, { lanes: ['backend'], feature: SLUG, hosts: HOSTS, env: single.env, locate: installedOnly('kimi') });
  assert.equal(one.outcome, 'seeded');
  assert.equal(one.independent_review, false);
  assert.equal(one.roles.backend_dev.host, 'kimi');
  assert.equal(one.roles.qa.host, 'kimi');
  assert.deepEqual(one.hosts.installed, ['kimi']);
  assert.equal(JSON.parse(await readRoles(single.dir)).parallel.max_concurrent_lanes, 10);
});

test('execution:seed refuses with the cause — no installed host (with the install command), a write that fails, missing or malformed lanes; nothing is written (AC-seed-no-host, AC-seed-write-failure)', async (t) => {
  const { dir, env } = await setup(t, { roles: null });
  const none = await seedExecutionRoles(dir, { lanes: ['backend'], feature: SLUG, hosts: HOSTS, env, locate: installedOnly() });
  assert.equal(none.ok, false);
  assert.equal(none.outcome, 'no_execution_host');
  assert.deepEqual(none.hosts, { registered: HOSTS, installed: [] });
  assert.equal(none.install.find((item) => item.host === 'codex').command, 'npm install -g @openai/codex');
  await assert.rejects(readRoles(dir), /ENOENT/, 'nothing written');

  assert.equal((await seedExecutionRoles(dir, { lanes: [], feature: SLUG, hosts: HOSTS, env })).outcome, 'lanes_required');
  assert.equal((await seedExecutionRoles(dir, { lanes: ['Back End'], feature: SLUG, hosts: HOSTS, env })).outcome, 'lane_invalid');
  assert.equal((await seedExecutionRoles(dir, { lanes: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'], feature: SLUG, hosts: HOSTS, env })).outcome, 'too_many_lanes');
  await assert.rejects(readRoles(dir), /ENOENT/);

  // The config directory is a FILE: the write cannot succeed and the failure is named — never silent, never mistaken for "already present".
  const blocked = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-seed-blocked-'));
  t.after(() => fs.rm(blocked, { recursive: true, force: true }));
  await fs.mkdir(path.join(blocked, '.aioson'), { recursive: true });
  await fs.writeFile(path.join(blocked, '.aioson', 'config'), 'not a directory', 'utf8');
  const failed = await seedExecutionRoles(blocked, { lanes: ['backend'], feature: SLUG, hosts: HOSTS, env, locate: installedOnly('codex') });
  assert.equal(failed.ok, false);
  assert.equal(failed.outcome, 'write_failed');
  assert.ok(failed.error, 'the cause travels with the refusal');
});

test('execution:seed through the command: lanes come from --lanes or from the plan\'s lanes table; refusals exit 1, "already present" exits 0', async (t) => {
  const { dir, env } = await setup(t, { roles: null });
  // The fixture plan declares backend/frontend lanes — no --lanes needed with --feature.
  const fromPlan = await runExecution({ args: [dir], options: { sub: 'seed', feature: SLUG, json: true }, logger, env });
  assert.deepEqual(fromPlan.lanes, ['backend', 'frontend']);
  assert.equal(fromPlan.lanes_source, 'plan');
  // Whether it seeded or refused depends on the hosts installed on this machine; both shapes are contractual.
  assert.ok(['seeded', 'no_execution_host'].includes(fromPlan.outcome), fromPlan.outcome);
  if (fromPlan.outcome === 'seeded') {
    assert.equal(fromPlan.exitCode, 0);
    const again = await runExecution({ args: [dir], options: { sub: 'seed', lanes: 'backend,frontend', json: true }, logger, env });
    assert.equal(again.outcome, 'already_present');
    assert.equal(again.exitCode, 0);
    assert.equal(again.lanes_source, 'option');
  } else {
    assert.equal(fromPlan.exitCode, undefined, 'a refusal fails the process');
  }

  const empty = await setup(t, { roles: null, plan: '---\nfeature: orders\nstatus: draft\n---\n# no tables\n' });
  const refused = await runExecution({ args: [empty.dir], options: { sub: 'seed', feature: SLUG, json: true }, logger, env: empty.env });
  assert.equal(refused.ok, false);
  assert.equal(refused.outcome, 'lanes_required');

  const run = (args) => spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8', env: empty.env });
  const cli = run(['execution:seed', empty.dir, '--json']);
  assert.equal(cli.status, 1, cli.stderr);
  assert.equal(JSON.parse(cli.stdout).outcome, 'lanes_required');
  const alias = run(['execution-seed', empty.dir, '--json']);
  assert.equal(alias.status, 1);
  const help = run(['--help']);
  assert.match(help.stdout, /aioson execution:seed \[path\] --lanes=<lane-a,lane-b> \[--feature=<slug>\]/);
  assert.match(help.stdout, /aioson execution:offer \[path\] \[--feature=<slug>\] \[--confirm-defaults\]/);
  // The offer through the binary carries the new blocks and still exits 0.
  const offered = run(['execution:offer', empty.dir, `--feature=${SLUG}`, '--json']);
  assert.equal(offered.status, 0, offered.stderr);
  const payload = JSON.parse(offered.stdout);
  assert.equal(payload.onboarding.state, 'not_unlocked');
  assert.equal(payload.plan.scale.files, 0);
  assert.equal(payload.plan.execution_choice, null);
  const human = run(['execution:offer', empty.dir, `--feature=${SLUG}`]);
  assert.equal(human.status, 0);
  assert.match(human.stdout, /next: aioson execution:seed \. --feature=orders --lanes=<lane-a,lane-b>/);
  assert.match(human.stdout, /scale: 0 file\(s\) in 0 phase\(s\), 0 wave\(s\), 0 in parallel — below the split floor \(12 files\); execution choice not recorded/);
});

test('the offer asks about roles at the default model BEFORE it asks for signatures; the answer sticks until a role changes; roles the owner chose never ask (AC-offer-*, AC-confirm-sticks)', async (t) => {
  const { dir, env } = await setup(t, { roles: null });
  await seedExecutionRoles(dir, { lanes: ['backend', 'frontend'], feature: SLUG, hosts: HOSTS, env, locate: installedOnly('codex', 'claude') });
  const rolesFile = path.join(dir, '.aioson', 'config', 'execution-roles.json');
  const edit = async (mutate) => {
    const document = JSON.parse(await fs.readFile(rolesFile, 'utf8'));
    mutate(document);
    await fs.writeFile(rolesFile, JSON.stringify(document, null, 2), 'utf8');
  };
  await edit((document) => { document.enabled = true; });

  // AC-offer-asks + AC-offer-before-signature: nothing is signed anywhere, yet the pendency comes first.
  let result = await offer(dir, env);
  assert.equal(result.available, false);
  assert.equal(result.reason, 'defaults_unconfirmed');
  assert.deepEqual(result.pending_confirmation, [
    { role: 'backend_dev', host: 'claude', model: DEFAULT_MODEL },
    { role: 'frontend_dev', host: 'claude', model: DEFAULT_MODEL },
    { role: 'integration_dev', host: 'claude', model: DEFAULT_MODEL },
    { role: 'qa', host: 'codex', model: DEFAULT_MODEL }
  ]);
  assert.equal(result.onboarding.state, 'pending_confirmation');
  assert.equal(result.onboarding.next, 'aioson execution:offer . --confirm-defaults');
  assert.equal(result.missing, undefined, 'signatures were not even evaluated');
  assert.equal(result.confirmation, undefined);

  // AC-offer-partial: one chosen model → the pendency names only what is still at the default.
  await edit((document) => { document.roles.backend_dev.model = 'claude-opus-5'; });
  result = await offer(dir, env);
  assert.equal(result.reason, 'defaults_unconfirmed');
  assert.deepEqual(result.pending_confirmation.map((item) => item.role), ['frontend_dev', 'integration_dev', 'qa']);

  // --confirm-defaults records the answer and re-evaluates in the same call: the next blocker is the signature.
  result = await offer(dir, env, { 'confirm-defaults': true });
  assert.equal(result.confirmation.ok, true);
  assert.equal(result.confirmation.path, EXECUTION_ROLES_CONFIRMATION_RELATIVE_PATH);
  assert.deepEqual(result.confirmation.confirmed.map((item) => item.role), ['frontend_dev', 'integration_dev', 'qa']);
  assert.equal(result.reason, 'signature_missing');
  assert.equal(result.onboarding.state, 'unsigned');
  assert.equal(result.onboarding.next, 'aioson host:signature . --host=claude --model=claude-opus-5');
  const stored = await readConfirmation(dir);
  assert.equal(stored.present, true);
  assert.equal(stored.digest, rolesDigest((await offerExecution(dir, { env, hosts: HOSTS })).roles));

  // AC-confirm-sticks: asked again, it does not ask again.
  result = await offer(dir, env);
  assert.equal(result.reason, 'signature_missing');
  assert.equal(result.pending_confirmation, undefined);

  // A role change reopens the question — only for the roles still at the default.
  await edit((document) => { document.roles.qa.host = 'claude'; });
  result = await offer(dir, env);
  assert.equal(result.reason, 'defaults_unconfirmed');
  assert.deepEqual(result.pending_confirmation.map((item) => item.role), ['frontend_dev', 'integration_dev', 'qa']);

  // AC-offer-silent: every model chosen → no pendency, no confirmation needed.
  await edit((document) => { document.roles.frontend_dev.model = 'claude-sonnet-5'; document.roles.integration_dev.model = 'claude-opus-5'; document.roles.qa.model = 'gpt-5.6'; });
  result = await offer(dir, env);
  assert.equal(result.reason, 'signature_missing');
  assert.equal(result.pending_confirmation, undefined);

  // The confirmation lives BESIDE the roles file: the roles document itself never gains a key.
  assert.deepEqual(Object.keys(JSON.parse(await fs.readFile(rolesFile, 'utf8'))).sort(), ['enabled', 'on_unavailable', 'parallel', 'roles', 'source', 'version']);

  // Confirming without a readable roles file is a named refusal.
  const bare = await setup(t, { roles: null });
  const refused = await confirmDefaultModels(bare.dir, { hosts: HOSTS });
  assert.equal(refused.ok, false);
  assert.equal(refused.reason, 'roles_file_missing');
});

test('a lanes table without Host and Model columns compiles — the roles file is the only authority and lane_role_mismatch has nothing left to reconcile; the legacy shape keeps compiling (AC-plan-table, AC-plan-legacy)', async (t) => {
  const { writeSignatures, signatureKey } = require('../src/lib/host-signature');
  const signed = (host, model, effort) => ({ host, model, reasoning_effort: effort, status: 'valid', reason: null, checked_at: '2026-08-25T10:00:00.000Z', expires_at: '2999-01-01T00:00:00.000Z' });
  const signatures = {
    [signatureKey('codex', 'gpt-5.6', 'high')]: signed('codex', 'gpt-5.6', 'high'),
    [signatureKey('kimi', 'kimi-k3', null)]: signed('kimi', 'kimi-k3', null),
    [signatureKey('claude', 'claude-sonnet-5', null)]: signed('claude', 'claude-sonnet-5', null)
  };

  const lean = await setup(t, { plan: PLAN.replace(LEGACY_LANES, LEAN_LANES) });
  await writeSignatures({ signatures }, { env: lean.env });
  const result = await compile(lean.dir, lean.env);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.summary.lanes, 2);
  assert.equal(result.plan.lanes.backend.dev.host, 'codex');
  assert.equal(result.plan.lanes.frontend.dev.host, 'kimi');
  assert.ok(!(result.warnings || []).some((warning) => warning.check === 'lane_role_mismatch'));

  const legacy = await setup(t);
  await writeSignatures({ signatures }, { env: legacy.env });
  assert.equal((await compile(legacy.dir, legacy.env)).ok, true);

  // A missing table names the columns the parser actually requires.
  const missing = await setup(t, { plan: PLAN.replace(`## Development execution lanes\n${LEGACY_LANES}\n\n`, '') });
  await writeSignatures({ signatures }, { env: missing.env });
  const refused = await compile(missing.dir, missing.env);
  assert.equal(refused.ok, false);
  assert.match(refused.errors.find((error) => error.check === 'lanes_table_missing').message, /Lane \| Exact write paths \| Integration owner; host and model come from the roles file/);
});
