'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { runWorkflowNext, buildExecutionActivationContext, inspectExecutionGate } = require('../src/commands/workflow-next');
const { createTranslator } = require('../src/i18n');
const { runExecution: runCommand } = require('../src/commands/execution');
const { signatureKey, writeSignatures } = require('../src/lib/host-signature');
const { runStatePath } = require('../src/agent-execution/execution-run');
const { defaults, writeManifest } = require('../src/agent-execution/manifest');
const { approveAndSealSheldonReview } = require('./helpers/feature-evidence');

const ROOT = path.resolve(__dirname, '..');
const logger = { log() {}, error() {}, warn() {} };
const { t } = createTranslator('en');
const SLUG = 'orders';

const PRD = [
  '---',
  'classification: SMALL',
  'product_scope: approved',
  'prd_ready: approved',
  'sheldon_review: pending',
  '---',
  '# Orders',
  '',
  '## Feature Capability Map',
  '',
  '| CAP | Promised outcome | Actor / trigger | Scope decision | Rationale |',
  '|---|---|---|---|---|',
  '| CAP-orders-api | Orders API stores orders | User submits | required | Core promise |',
  '| CAP-orders-ui | Orders screen lists orders | User opens | required | Core promise |',
  '| CAP-orders-wire | Screen wired to the API | User opens | required | Core promise |',
  '',
  '## Acceptance Criteria',
  '',
  '| AC | CAP | Observable behavior | Evidence |',
  '|---|---|---|---|',
  '| AC-orders-01 | CAP-orders-api | POST /orders creates an order | api test |',
  '| AC-orders-02 | CAP-orders-ui | Orders screen lists orders | ui test |',
  '| AC-orders-03 | CAP-orders-wire | The screen shows API orders | e2e |',
  ''
].join('\n');

const PLAN = [
  '---',
  'status: approved',
  '---',
  '# Plan',
  '',
  '## Capability Delivery Plan',
  '',
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

function signed(host, model, effort) {
  return { host, model, reasoning_effort: effort, status: 'valid', reason: null, checked_at: '2026-08-25T10:00:00.000Z', expires_at: '2999-01-01T00:00:00.000Z' };
}

const ALL_SIGNED = {
  [signatureKey('codex', 'gpt-5.6', 'high')]: signed('codex', 'gpt-5.6', 'high'),
  [signatureKey('kimi', 'kimi-k3', null)]: signed('kimi', 'kimi-k3', null),
  [signatureKey('claude', 'claude-sonnet-5', null)]: signed('claude', 'claude-sonnet-5', null)
};

async function write(root, rel, body) {
  const file = path.join(root, ...rel.split('/'));
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, body, 'utf8');
}

function stateAt(stage, { current = false } = {}) {
  const sequence = ['product', 'sheldon', 'planner', 'dev', 'qa'];
  return JSON.stringify({
    version: 1,
    mode: 'feature',
    classification: 'SMALL',
    sequence,
    current: current ? stage : null,
    next: current ? null : stage,
    completed: sequence.slice(0, sequence.indexOf(stage)),
    skipped: [],
    featureSlug: SLUG,
    detour: null,
    updatedAt: new Date().toISOString()
  });
}

// `planStatus: 'draft'` keeps the planner stage OPEN (an approved plan is
// inferred as a completed planner stage by the stale-state recovery and the
// activation advances to DEV); `current: true` marks the stage active so
// `--complete=<stage>` runs its gates.
async function project(t, { stage, roles = null, signatures = null, planStatus = 'approved', current = false } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-execution-routing-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  await write(dir, '.aioson/context/project.context.md', [
    '---', 'project_name: demo', 'project_type: web_app', 'profile: developer', 'framework: Node.js',
    'framework_installed: true', 'classification: SMALL', 'interaction_language: en', 'conversation_language: en',
    'aioson_version: 1.60.0', '---', '# Context', ''
  ].join('\n'));
  await write(dir, '.aioson/context/features.md', `| slug | status | started | completed |\n|---|---|---|---|\n| ${SLUG} | in_progress | 2026-08-25 | |\n`);
  await write(dir, `.aioson/context/prd-${SLUG}.md`, PRD);
  await approveAndSealSheldonReview(dir, SLUG);
  await write(dir, `.aioson/context/implementation-plan-${SLUG}.md`, PLAN.replace('status: approved', `status: ${planStatus}`));
  await write(dir, '.aioson/context/workflow.state.json', stateAt(stage, { current }));
  await fs.copyFile(path.join(ROOT, 'template', '.aioson', 'agents', 'dev.md'), path.join(dir, '.aioson', 'agents', 'dev.md'));
  await fs.copyFile(path.join(ROOT, 'template', '.aioson', 'agents', 'qa.md'), path.join(dir, '.aioson', 'agents', 'qa.md'));
  if (roles) await write(dir, '.aioson/config/execution-roles.json', JSON.stringify(roles, null, 2));
  const previous = process.env.AIOSON_HOST_SIGNATURES;
  process.env.AIOSON_HOST_SIGNATURES = path.join(dir, 'signatures.json');
  t.after(() => {
    if (previous === undefined) delete process.env.AIOSON_HOST_SIGNATURES;
    else process.env.AIOSON_HOST_SIGNATURES = previous;
  });
  if (signatures) await writeSignatures({ signatures }, { env: process.env });
  return dir;
}

const activate = (dir, options = {}) => runWorkflowNext({ args: [dir], options: { tool: 'codex', ...options }, logger, t });
const compile = (dir) => runCommand({ args: [dir], options: { sub: 'compile', feature: SLUG, json: true }, logger, env: process.env });
const normalize = (prompt, dir) => String(prompt || '').split(dir).join('<dir>').split(dir.replace(/\\/g, '/')).join('<dir>');

function decisionState() {
  const unit = (id, lane, wave, extra) => ({ id, lane, wave, owner: 'lane', status: 'passed', override: {}, pending_decision: null, dev: { status: 'passed' }, qa: { status: 'passed' }, ...extra });
  return {
    version: 1, feature: SLUG, run_id: 'run-1', plan_path: `.aioson/context/execution-plan-${SLUG}.json`, plan_digest: 'x', manifest_digest: 'y',
    status: 'decision_required', reason: 'decision_pending', started_at: '2026-08-25T10:00:00.000Z', updated_at: '2026-08-25T10:05:00.000Z', finished_at: null,
    current_wave: 1, parallel: { max_concurrent_lanes: 2 }, on_unavailable: 'ask',
    waves: [{ wave: 1, status: 'decision_required', units: ['phase-1', 'phase-2'] }, { wave: 2, status: 'pending', units: ['phase-3'] }],
    units: {
      'phase-1': unit('phase-1', 'backend', 1, {}),
      'phase-2': unit('phase-2', 'frontend', 1, {
        status: 'decision_required',
        dev: { status: 'unavailable', reason: 'capacity', host: 'kimi', model: 'kimi-k3' },
        qa: { status: 'pending' },
        pending_decision: { stage: 'dev', kind: 'unavailable', reason: 'capacity', host: 'kimi', model: 'kimi-k3', reasoning_effort: null, candidates: [], asked_at: '2026-08-25T10:04:00.000Z', choices: ['retry', 'fallback:<host>/<model>[/<effort>]', 'skip', 'abort'], on_unavailable: 'ask' }
      }),
      'phase-3': { id: 'phase-3', lane: null, wave: 2, owner: 'integration', status: 'integration', override: {}, pending_decision: null, dev: { status: 'pending' }, qa: { status: 'not_applicable' } }
    },
    decisions: [], findings: [], scope: { measured: null, waves: {} },
    integration: { owner: 'dev', units: ['phase-3'], role: null, status: 'pending' }
  };
}

// ───────────────────────── planner ─────────────────────────

test('planner activation is byte-identical without the unlock file, with it disabled, and with unsigned roles — the orchestrated option does not exist outside the supervising client', async (t) => {
  const none = await project(t, { stage: 'planner', planStatus: 'draft' });
  const disabled = await project(t, { stage: 'planner', planStatus: 'draft', roles: { ...ROLES, enabled: false } });
  const unsigned = await project(t, { stage: 'planner', planStatus: 'draft', roles: ROLES });
  const prompts = [];
  for (const dir of [none, disabled, unsigned]) {
    const result = await activate(dir);
    assert.equal(result.agent, 'planner');
    prompts.push(normalize(result.prompt, dir));
  }
  assert.equal(prompts[0], prompts[1]);
  assert.equal(prompts[0], prompts[2]);
  assert.doesNotMatch(prompts[0], /Orchestrated execution/);
  assert.equal(await buildExecutionActivationContext(none, { mode: 'feature', featureSlug: SLUG }, 'planner'), '');
});

test('planner activation pins the offer when every role is signed; a compiled plan is named fresh or stale', async (t) => {
  const dir = await project(t, { stage: 'planner', planStatus: 'draft', roles: ROLES, signatures: ALL_SIGNED });
  let result = await activate(dir);
  assert.equal(result.agent, 'planner');
  assert.match(result.prompt, /Orchestrated execution: AVAILABLE \(roles signed on this machine: backend_dev=codex\/gpt-5\.6\/high, frontend_dev=kimi\/kimi-k3, qa=claude\/claude-sonnet-5\)\./);
  assert.match(result.prompt, /Ask the user once \(AskUserQuestion\): single DEV \(recommended default\) or orchestrated lanes/);
  assert.match(result.prompt, /ask model AND effort per role in the main monitoring chat/);
  assert.match(result.prompt, /aioson execution:compile \. --feature=orders/);
  assert.doesNotMatch(result.prompt, /Compiled execution plan/);

  assert.equal((await compile(dir)).ok, true);
  result = await activate(dir);
  assert.match(result.prompt, /Compiled execution plan: fresh \(3 units, 2 waves\)\. Editing the plan tables requires recompiling\./);

  await fs.appendFile(path.join(dir, '.aioson', 'context', `implementation-plan-${SLUG}.md`), '\nedited after compile\n');
  result = await activate(dir);
  assert.match(result.prompt, /Compiled execution plan: STALE — plan_digest_stale/);
});

test('the engine blocks planner completion on a stale compiled plan when orchestrated execution is selected; single mode never gates', async (t) => {
  const dir = await project(t, { stage: 'planner', current: true, roles: ROLES, signatures: ALL_SIGNED });
  const state = { mode: 'feature', featureSlug: SLUG };
  // No manifest at all → no gate.
  assert.deepEqual(await inspectExecutionGate(dir, SLUG, 'planner'), { blocking: false, advisory: false });
  // A single-mode manifest → no gate, no output.
  await writeManifest(dir, SLUG, defaults(SLUG, 'codex'));
  assert.deepEqual(await inspectExecutionGate(dir, SLUG, 'planner'), { blocking: false, advisory: false });
  assert.deepEqual(await inspectExecutionGate(dir, SLUG, 'dev'), { blocking: false, advisory: false });
  assert.equal(await buildExecutionActivationContext(dir, state, 'dev'), '');

  assert.equal((await compile(dir)).ok, true);
  let gate = await inspectExecutionGate(dir, SLUG, 'planner');
  assert.deepEqual(gate, { blocking: false, advisory: false, mode: 'orchestrated', plan: 'fresh' });

  await fs.appendFile(path.join(dir, '.aioson', 'context', `implementation-plan-${SLUG}.md`), '\nedited after compile\n');
  gate = await inspectExecutionGate(dir, SLUG, 'planner');
  assert.equal(gate.blocking, true);
  assert.match(gate.message, /\[Execution Plan BLOCKED\] orchestrated execution is selected for "orders" but the compiled plan is missing or stale: plan_digest_stale/);
  assert.match(gate.message, /aioson execution:compile \. --feature=orders/);
  await assert.rejects(activate(dir, { complete: 'planner' }), /\[Execution Plan BLOCKED\]/);
  // Recompile heals it: the engine gate passes (whatever the rest of the handoff contract says about this minimal fixture).
  assert.equal((await compile(dir)).ok, true);
  assert.equal((await inspectExecutionGate(dir, SLUG, 'planner')).blocking, false);
});

// ───────────────────────── dev ─────────────────────────

test('dev activation pins the orchestrated run state only when the manifest selects it — compiled, decisions pending, completed', async (t) => {
  const plain = await project(t, { stage: 'dev' });
  const baseline = await activate(plain);
  assert.equal(baseline.agent, 'dev');
  assert.doesNotMatch(baseline.prompt, /Orchestrated execution/);
  // `orchestration.mode: inherit` keeps the autopilot signal where it was (a
  // v2 manifest's default `autopilot` mode legitimately changes the prompt on
  // its own — that is the pre-existing seeded-scheme behaviour, not this pin).
  const singleManifest = defaults(SLUG, 'codex');
  singleManifest.orchestration.mode = 'inherit';
  await writeManifest(plain, SLUG, singleManifest);
  const single = await activate(plain);
  assert.equal(normalize(single.prompt, plain), normalize(baseline.prompt, plain), 'a single-mode manifest changes nothing in the DEV prompt');

  const dir = await project(t, { stage: 'dev', roles: ROLES, signatures: ALL_SIGNED });
  assert.equal((await compile(dir)).ok, true);
  let result = await activate(dir);
  assert.equal(result.agent, 'dev');
  assert.match(result.prompt, /Orchestrated execution: this feature's lanes run as external processes — follow `\.aioson\/docs\/dev\/execution-lanes\.md` § Compiled orchestrated execution\./);
  assert.match(result.prompt, /Run state: compiled, not started\./);
  assert.match(result.prompt, /aioson execution:run \. --feature=orders --preflight --json/);
  assert.match(result.prompt, /integrate from aioson execution:status \. --feature=orders --json/);

  await fs.writeFile(runStatePath(dir, SLUG), JSON.stringify(decisionState(), null, 2), 'utf8');
  result = await activate(dir);
  assert.match(result.prompt, /Run state: decision_required \(decision_pending\) — lane units passed 1\/2, qa passed 1, findings 0, decisions pending 1\./);
  assert.match(result.prompt, /Decision pending: phase-2 \[dev\] capacity → aioson execution:decide \. --feature=orders --unit=phase-2 --choice=/);
  assert.match(result.prompt, /Resume: aioson execution:run \. --feature=orders --resume/);

  const completed = decisionState();
  completed.status = 'completed';
  completed.reason = null;
  completed.units['phase-2'].status = 'passed';
  completed.units['phase-2'].pending_decision = null;
  completed.units['phase-2'].dev = { status: 'passed' };
  completed.units['phase-2'].qa = { status: 'passed' };
  completed.waves = [{ wave: 1, status: 'completed', units: ['phase-1', 'phase-2'] }, { wave: 2, status: 'integration', units: ['phase-3'] }];
  await fs.writeFile(runStatePath(dir, SLUG), JSON.stringify(completed, null, 2), 'utf8');
  result = await activate(dir);
  assert.match(result.prompt, /Run state: completed — lane units passed 2\/2, qa passed 2/);
  assert.match(result.prompt, /Integration units for dev: phase-3; resolve every finding in the ledger before completing DEV\./);
  assert.doesNotMatch(result.prompt, /Resume:/);
});

test('dev completion is advisory under orchestrated execution: not started or paused runs are named, a completed run is silent', async (t) => {
  const dir = await project(t, { stage: 'dev', roles: ROLES, signatures: ALL_SIGNED });
  assert.equal((await compile(dir)).ok, true);
  let gate = await inspectExecutionGate(dir, SLUG, 'dev');
  assert.equal(gate.blocking, false);
  assert.equal(gate.advisory, true);
  assert.equal(gate.run, 'not_started');
  assert.match(gate.message, /orchestrated execution is selected but the run is not_started — DEV is completing without the compiled lanes/);

  await fs.writeFile(runStatePath(dir, SLUG), JSON.stringify(decisionState(), null, 2), 'utf8');
  gate = await inspectExecutionGate(dir, SLUG, 'dev');
  assert.equal(gate.advisory, true);
  assert.equal(gate.run, 'decision_required');
  assert.deepEqual(gate.decisions_pending, ['phase-2']);

  const completed = decisionState();
  completed.status = 'completed';
  completed.units['phase-2'].status = 'passed';
  completed.units['phase-2'].pending_decision = null;
  await fs.writeFile(runStatePath(dir, SLUG), JSON.stringify(completed, null, 2), 'utf8');
  gate = await inspectExecutionGate(dir, SLUG, 'dev');
  assert.deepEqual(gate, { blocking: false, advisory: false, mode: 'orchestrated', plan: 'fresh', run: 'completed', findings: 0 });

  // Stages outside the gate never see it.
  assert.deepEqual(await inspectExecutionGate(dir, SLUG, 'qa'), { blocking: false, advisory: false });
  assert.deepEqual(await inspectExecutionGate(dir, SLUG, 'sheldon'), { blocking: false, advisory: false });
});

test('the orchestrator detour receives the same run-state pin as DEV', async (t) => {
  const dir = await project(t, { stage: 'dev', roles: ROLES, signatures: ALL_SIGNED });
  assert.equal((await compile(dir)).ok, true);
  const pin = await buildExecutionActivationContext(dir, { mode: 'feature', featureSlug: SLUG }, 'orchestrator');
  assert.match(pin, /Orchestrated execution: this feature's lanes run as external processes/);
  assert.match(pin, /Run state: compiled, not started\./);
  assert.equal(await buildExecutionActivationContext(dir, { mode: 'feature', featureSlug: SLUG }, 'qa'), '');
  assert.equal(await buildExecutionActivationContext(dir, { mode: 'project' }, 'dev'), '');
});
