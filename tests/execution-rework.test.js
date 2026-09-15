'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const { runExecution: runCommand } = require('../src/commands/execution');
const { runStatePath } = require('../src/agent-execution/execution-run');
const { decideExecution } = require('../src/agent-execution/execution-run');
const { readExecutionPlan } = require('../src/agent-execution/execution-plan');
const { validateManifest } = require('../src/agent-execution/schema');
const { defaults } = require('../src/agent-execution/manifest');
const { signatureKey, writeSignatures } = require('../src/lib/host-signature');

const ROOT = path.resolve(__dirname, '..');
const logger = { log() {}, error() {}, warn() {} };
const SLUG = 'orders';

const PLAN = [
  '---',
  'feature: orders',
  'status: approved',
  '---',
  '# Implementation Plan — orders',
  '',
  '## Capability Delivery Plan',
  '| CAP | Phase | Files | Verification |',
  '|---|---|---|---|',
  '| CAP-orders-api | 1 | src/api/orders.ts | npm test -- orders.api |',
  '| CAP-orders-ui | 2 | src/ui/Orders.tsx | npm test -- orders.ui |',
  '| CAP-orders-wire | 3 | src/app.ts | npm test -- app |',
  '',
  '## Development execution lanes',
  '| Lane | Host | Model | Exact write paths | Integration owner |',
  '|---|---|---|---|---|',
  '| backend | codex | gpt-5.6 | src/api/** | dev |',
  '| frontend | kimi | kimi-k3 | src/ui/** | dev |',
  '',
  '## Execution Sequence',
  '| Phase | Wave | Files | Scope | Done when |',
  '|---|---|---|---|---|',
  '| 1 | 1 | src/api/orders.ts | CAP-orders-api | npm test -- orders.api passes |',
  '| 2 | 1 | src/ui/Orders.tsx | CAP-orders-ui | npm test -- orders.ui passes |',
  '| 3 | 2 | src/app.ts | CAP-orders-wire | npm test -- app passes |',
  ''
].join('\n');

const PRD = '# Orders\n\n## Acceptance Criteria\n| AC | CAP | Observable behavior | Evidence |\n|---|---|---|---|\n| AC-orders-01 | CAP-orders-api | POST /orders creates an order | api test |\n| AC-orders-02 | CAP-orders-ui | Orders screen lists orders | ui test |\n';

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

const catalogLoader = async () => ({ available: true, source: 'fixture', fetched_at: '2026-08-25', models: [{ slug: 'gpt-5.6', display_name: 'GPT-5.6', supported_efforts: ['medium', 'high'] }] });

/** Fake host adapter: `script[key]` may be a function of the call index — a reviewer that fails, then passes. */
function fakeAdapter(host, { script = {}, prompts = {}, calls = {} } = {}) {
  return {
    host,
    build: () => ({ ok: true }),
    async execute(input) {
      const marker = 'AIOSON EXECUTION CONTRACT';
      const contract = input.prompt_text.slice(input.prompt_text.indexOf(marker));
      const get = (name) => contract.match(new RegExp(`${name}=([^,\\n]+)`))?.[1].trim();
      const reportRel = contract.match(/report to: ([^\n]+)/)?.[1].trim();
      const role = get('agent');
      const unit = (input.prompt_text.match(/# Unit (?:contract|under review) — [a-z0-9-]+ \/ ([a-z0-9-]+)/) || [])[1];
      const key = `${role}:${unit}`;
      calls[key] = (calls[key] || 0) + 1;
      prompts[key] = [...(prompts[key] || []), input.prompt_text];
      const behaviour = typeof script[key] === 'function' ? script[key](calls[key]) : (script[key] || {});
      if (behaviour.locked) return { ok: false, reason: 'crash', error: 'database is locked' };
      await new Promise((resolve) => setTimeout(resolve, 15));
      const report = {
        version: 1,
        feature: get('feature'),
        run_id: get('run_id'),
        attempt_id: get('attempt_id'),
        agent: role,
        host: get('host'),
        model_requested: get('model_requested'),
        model_resolved: get('model_resolved'),
        model_resolution_strategy: get('model_resolution_strategy'),
        manifest_digest: get('manifest_digest'),
        writable_roots: JSON.parse(contract.match(/writable_roots=(\[[^\n]*\]), started_at/)?.[1] || '[]'),
        lane: get('lane'),
        write_paths: JSON.parse(contract.match(/write_paths=(\[[^\n]*?\])\./)?.[1] || '[]'),
        started_at: '2026-08-25T10:00:00.000Z',
        finished_at: '2026-08-25T10:01:00.000Z',
        verdict: behaviour.verdict || 'PASS',
        findings: behaviour.findings || [],
        messages: behaviour.messages || [],
        evidence: [`${key} #${calls[key]}`]
      };
      const effort = get('reasoning_effort');
      if (behaviour.missing_run_id) delete report.run_id;
      if (effort && effort !== 'null') report.reasoning_effort = effort;
      const reportFile = path.resolve(input.cwd, reportRel);
      await fs.mkdir(path.dirname(reportFile), { recursive: true });
      await fs.writeFile(reportFile, JSON.stringify(report, null, 2), 'utf8');
      return { ok: true, code: 0 };
    }
  };
}

async function fakeBaseline(dir) {
  const paths = [];
  const hashes = {};
  const walk = async (rel) => {
    let entries;
    try {
      entries = await fs.readdir(path.join(dir, rel), { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(childRel);
      else {
        paths.push(childRel);
        hashes[childRel] = crypto.createHash('sha256').update(await fs.readFile(path.join(dir, childRel))).digest('hex');
      }
    }
  };
  await walk('src');
  return { ok: true, baseline: { captured_at: new Date().toISOString(), head: 'fake', dirty_paths: paths.sort(), dirty_hashes: hashes } };
}

async function setup(t, { reworkRounds = null, autopilot = false } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-execution-rework-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }).catch(() => {}));
  for (const rel of ['.aioson/context', '.aioson/config', '.aioson/agents', 'src/api', 'src/ui']) await fs.mkdir(path.join(dir, ...rel.split('/')), { recursive: true });
  await fs.writeFile(path.join(dir, '.aioson', 'context', `implementation-plan-${SLUG}.md`), PLAN, 'utf8');
  await fs.writeFile(path.join(dir, '.aioson', 'context', `prd-${SLUG}.md`), PRD, 'utf8');
  await fs.writeFile(path.join(dir, '.aioson', 'config', 'execution-roles.json'), JSON.stringify(ROLES, null, 2), 'utf8');
  await fs.copyFile(path.join(ROOT, 'template', '.aioson', 'agents', 'dev.md'), path.join(dir, '.aioson', 'agents', 'dev.md'));
  await fs.copyFile(path.join(ROOT, 'template', '.aioson', 'agents', 'qa.md'), path.join(dir, '.aioson', 'agents', 'qa.md'));
  await fs.writeFile(path.join(dir, 'src', 'app.ts'), 'export const app = 1;\n', 'utf8');
  const binDir = path.join(dir, 'fake-bin');
  await fs.mkdir(binDir, { recursive: true });
  for (const bin of ['codex', 'kimi', 'claude']) await fs.writeFile(path.join(binDir, `${bin}.exe`), '', 'utf8');
  const env = { ...process.env, AIOSON_HOST_SIGNATURES: path.join(dir, 'signatures.json') };
  delete env.AIOSON_PLAY;
  delete env.AIOSON_EXECUTION_SPAWNER;
  await writeSignatures({ signatures: {
    [signatureKey('codex', 'gpt-5.6', 'high')]: signed('codex', 'gpt-5.6', 'high'),
    [signatureKey('kimi', 'kimi-k3', null)]: signed('kimi', 'kimi-k3', null),
    [signatureKey('claude', 'claude-sonnet-5', null)]: signed('claude', 'claude-sonnet-5', null)
  } }, { env });
  const resolverOptions = { env: { PATH: binDir, Path: binDir }, platform: 'win32' };
  const compile = () => runCommand({ args: [dir], options: { sub: 'compile', feature: SLUG, json: true }, logger, env });
  assert.equal((await compile()).ok, true);
  if (reworkRounds !== null || autopilot) {
    // The operator's rework budget lives in the manifest lane; the compiled plan carries it — recompile to pick it up.
    const manifestFile = path.join(dir, '.aioson', 'context', `agent-execution-${SLUG}.json`);
    const manifest = JSON.parse(await fs.readFile(manifestFile, 'utf8'));
    if (reworkRounds !== null) manifest.development_lanes.lanes.frontend.qa.max_rework_rounds = reworkRounds;
    if (autopilot) manifest.orchestration.mode = 'autopilot';
    await fs.writeFile(manifestFile, JSON.stringify(manifest, null, 2));
    const compiled = await compile();
    assert.equal(compiled.ok, true, JSON.stringify(compiled.errors));
  }
  return { dir, env, resolverOptions };
}

function run(ctx, { registry, events = [], extra = {} }) {
  return runCommand({
    args: [ctx.dir],
    options: { sub: 'run', feature: SLUG, json: true, 'bounded-recovery': true, ...extra },
    logger,
    env: ctx.env,
    engineOptions: { adapterRegistry: registry, catalogLoader, resolverOptions: ctx.resolverOptions, gitBaseline: fakeBaseline, progress: (event) => events.push(event), stallMs: 60000, stallCheckMs: 30000, recoveryDelayMs: 0 }
  });
}

async function compileTransitivePlan(ctx) {
  const transitivePlan = PLAN
    .replace('| Scope | Done when |', '| Scope | Done when | Depends on |')
    .replace('|---|---|---|---|---|', '|---|---|---|---|---|---|')
    .replace('| 1 | 1 | src/api/orders.ts | CAP-orders-api | npm test -- orders.api passes |', '| 1 | 1 | src/api/orders.ts | CAP-orders-api | npm test -- orders.api passes | |')
    .replace('| 2 | 1 | src/ui/Orders.tsx | CAP-orders-ui | npm test -- orders.ui passes |', '| 2 | 2 | src/api/export.ts | CAP-orders-wire | npm test -- export passes | 1 |')
    .replace('| 3 | 2 | src/app.ts | CAP-orders-wire | npm test -- app passes |', '| 3 | 3 | src/ui/Orders.tsx | CAP-orders-ui | npm test -- orders.ui passes | 2 |');
  await fs.writeFile(path.join(ctx.dir, '.aioson', 'context', `implementation-plan-${SLUG}.md`), transitivePlan, 'utf8');
  const compiled = await runCommand({ args: [ctx.dir], options: { sub: 'compile', feature: SLUG, json: true }, logger, env: ctx.env });
  assert.equal(compiled.ok, true, JSON.stringify(compiled.errors));
}

function crossUnitFailure(n) {
  return n === 1 ? {
    verdict: 'FAIL',
    findings: [{ severity: 'high', path: 'src/ui/Orders.tsx:20', summary: 'The API producer drops timing fields' }],
    messages: [{ to: 'lane:backend', kind: 'note', text: 'Repair the API producer', paths: ['src/api/orders.ts', 'src/ui/Orders.tsx'] }]
  } : {};
}

test('Autopilot defaults to continuous QA recovery past its local budget until independent approval', async t => {
  const ctx = await setup(t, { reworkRounds: 1, autopilot: true });
  const calls = {}, prompts = {}, events = [];
  const script = { 'qa:phase-2': n => n < 3 ? { verdict: 'FAIL', findings: [{ severity: 'high', summary: `History regression ${n}` }] } : {} };
  const registry = Object.fromEntries(['codex', 'kimi', 'claude'].map(host => [host, fakeAdapter(host, { script, calls, prompts })]));
  const result = await run(ctx, { registry, events, extra: { 'bounded-recovery': false } });
  assert.equal(result.status, 'completed');
  assert.equal(calls['qa:phase-2'], 3);
  assert.equal(calls['dev:phase-2'], 3);
  assert.ok(events.some(event => event.reason === 'continuous_recovery'));
  assert.equal(events.some(event => event.type === 'decision_required'), false);
  assert.match(prompts['dev:phase-2'].at(-1), /History regression 1/);
  assert.match(prompts['dev:phase-2'].at(-1), /shared root cause/);
  assert.match(prompts['qa:phase-2'].at(-1), /Use Git only for read-only inspection in this shared worktree/);
  assert.match(prompts['qa:phase-2'].at(-1), /incomplete baseline comparison does not prove a failure is pre-existing/);
  assert.match(prompts['qa:phase-2'].at(-1), /previous rounds do not consume it/);
  const state = JSON.parse(await fs.readFile(runStatePath(ctx.dir, SLUG), 'utf8'));
  assert.equal(state.until_complete, true);
  assert.equal(state.units['phase-2'].qa.status, 'passed');
  assert.equal(state.units['phase-2'].rework.rounds, 2);
  assert.equal(state.findings.some(f => f.check === 'rework_exhausted'), false);
});

test('continuous recovery opens a circuit before an unchanged failure can loop indefinitely', async t => {
  const ctx = await setup(t, { reworkRounds: 1, autopilot: true });
  const calls = {};
  const script = { 'qa:phase-2': () => ({ verdict: 'FAIL', findings: [{ severity: 'high', path: 'src/ui/Orders.tsx:42', summary: 'The unchanged button still loses the saved order' }] }) };
  const registry = Object.fromEntries(['codex', 'kimi', 'claude'].map(host => [host, fakeAdapter(host, { script, calls })]));
  const result = await run(ctx, { registry, extra: { 'bounded-recovery': false } });
  assert.equal(result.status, 'decision_required');
  assert.equal(result.decisions_pending[0].reason, 'recovery_no_progress');
  assert.equal(calls['dev:phase-2'], 3);
  assert.equal(calls['qa:phase-2'], 3);
  const state = JSON.parse(await fs.readFile(runStatePath(ctx.dir, SLUG), 'utf8'));
  assert.equal(state.units['phase-2'].recovery.attempts, 1);
  assert.equal(state.units['phase-2'].recovery.circuit_breaker.consecutive, 2);
  assert.match(state.units['phase-2'].pending_decision.detail, /equivalent failures/);
});

test('continuous recovery never sends one unit through more than five QA to DEV returns', async t => {
  const ctx = await setup(t, { reworkRounds: 1, autopilot: true });
  const calls = {};
  // Distinct evidence avoids the identical-failure circuit so this fixture
  // reaches the independent QA→DEV convergence cap itself.
  const defects = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot'];
  const script = { 'qa:phase-2': n => ({ verdict: 'FAIL', findings: [{ severity: 'high', path: 'src/ui/Orders.tsx', summary: `Distinct unresolved defect ${defects[n - 1]}` }] }) };
  const registry = Object.fromEntries(['codex', 'kimi', 'claude'].map(host => [host, fakeAdapter(host, { script, calls })]));
  const result = await run(ctx, { registry, extra: { 'bounded-recovery': false } });
  assert.equal(result.status, 'decision_required');
  assert.equal(result.decisions_pending[0].reason, 'dev_qa_cycle_limit');
  assert.equal(calls['dev:phase-2'], 6, 'initial delivery plus five QA-requested rework rounds');
  assert.equal(calls['qa:phase-2'], 6);
  const state = JSON.parse(await fs.readFile(runStatePath(ctx.dir, SLUG), 'utf8'));
  assert.equal(state.units['phase-2'].rework.rounds, 5);
  assert.equal(state.units['phase-2'].recovery.circuit_breaker.max_rounds, 5);
  assert.match(state.units['phase-2'].pending_decision.detail, /maximum 5/);
});

test('continuous recovery retries a live lane configuration error on the same stage', () => {
  const { queueRecovery, recoveryAction } = require('../src/agent-execution/execution-recovery');
  const unit = { id: 'phase-1', status: 'decision_required', dev: { status: 'crashed', error: 'invalid active profile' }, qa: { status: 'pending' } };
  const outcome = { kind: 'crashed', reason: 'lane_config_invalid', error: 'invalid active profile' };

  assert.equal(recoveryAction('dev', outcome), 'dev');
  assert.equal(queueRecovery(unit, 'dev', outcome, 1), true);
  assert.equal(unit.status, 'pending');
  assert.equal(unit.dev.status, 'pending');
  assert.equal(unit.retry_context.dev.error, 'invalid active profile');
  assert.equal(unit.technical_retries.dev, 1);
});

test('continuous autopilot reroutes a failed consumer to a transitive producer and revalidates passed descendants', async t => {
  const ctx = await setup(t, { reworkRounds: 1, autopilot: true });
  await compileTransitivePlan(ctx);
  const calls = {}, prompts = {}, events = [];
  const script = { 'dev:phase-3': crossUnitFailure };
  const registry = Object.fromEntries(['codex', 'kimi', 'claude'].map(host => [host, fakeAdapter(host, { script, calls, prompts })]));
  const result = await run(ctx, { registry, events, extra: { 'bounded-recovery': false } });
  assert.equal(result.status, 'completed', JSON.stringify(result));
  assert.equal(calls['dev:phase-1'], 2);
  assert.equal(calls['qa:phase-1'], 2);
  assert.equal(calls['dev:phase-2'], 2);
  assert.equal(calls['qa:phase-2'], 2);
  assert.equal(calls['dev:phase-3'], 2);
  assert.equal(calls['qa:phase-3'], 1);
  assert.ok(events.some(event => event.type === 'contract_repair' && event.producer === 'phase-1' && event.consumer === 'phase-3'));
  const state = JSON.parse(await fs.readFile(runStatePath(ctx.dir, SLUG), 'utf8'));
  assert.deepEqual(state.contract_repairs[0].affected, ['phase-1', 'phase-2', 'phase-3']);
  assert.equal(state.units['phase-1'].contract_repairs, 1);
  assert.equal(state.units['phase-2'].invalidations.length, 1);
  assert.equal(state.units['phase-3'].invalidations.length, 1);
  assert.match(prompts['dev:phase-1'][1], /API producer drops timing fields/);
});

test('continuous resume consumes persisted cross-unit evidence before repeating the interrupted consumer', async t => {
  const ctx = await setup(t, { reworkRounds: 1, autopilot: true });
  await compileTransitivePlan(ctx);
  const calls = {}, events = [];
  const script = { 'dev:phase-3': crossUnitFailure };
  const registry = Object.fromEntries(['codex', 'kimi', 'claude'].map(host => [host, fakeAdapter(host, { script, calls })]));
  const paused = await run(ctx, { registry, extra: { step: true } });
  assert.equal(paused.status, 'decision_required');
  assert.equal(calls['dev:phase-3'], 1);
  const result = await run(ctx, { registry, events, extra: { resume: true, 'bounded-recovery': false, 'until-complete': true } });
  assert.equal(result.status, 'completed', JSON.stringify(result));
  assert.equal(calls['dev:phase-1'], 2);
  assert.equal(calls['dev:phase-2'], 2);
  assert.equal(calls['dev:phase-3'], 2, 'resume routes the persisted evidence before another consumer dispatch');
  assert.ok(events.some(event => event.type === 'contract_repair' && event.producer === 'phase-1'));
  const state = JSON.parse(await fs.readFile(runStatePath(ctx.dir, SLUG), 'utf8'));
  assert.equal(state.decisions.some(decision => decision.source === 'automatic_contract_repair_resume' && decision.target === 'phase-1'), true);
});

test('a contradictory QA PASS with critical/high findings returns to DEV until a clean review', async t => {
  const ctx = await setup(t, { reworkRounds: 0, autopilot: true });
  const calls = {}, prompts = {};
  const script = { 'qa:phase-2': n => ({ findings: [{ severity: n === 1 ? 'high' : n === 2 ? ' Critical ' : 'low', summary: `Unresolved production issue ${n}` }] }) };
  const registry = Object.fromEntries(['codex', 'kimi', 'claude'].map(host => [host, fakeAdapter(host, { script, calls, prompts })]));
  assert.equal((await run(ctx, { registry, extra: { 'bounded-recovery': false } })).status, 'completed');
  assert.equal(calls['dev:phase-2'], 3);
  assert.equal(calls['qa:phase-2'], 3);
  assert.match(prompts['dev:phase-2'][1], /Unresolved production issue 1/);
  const state = JSON.parse(await fs.readFile(runStatePath(ctx.dir, SLUG), 'utf8'));
  assert.equal(state.units['phase-2'].qa.status, 'passed');
  assert.equal(state.units['phase-2'].rework.history[0].qa.verdict, 'PASS');
  assert.equal(state.units['phase-2'].rework.history[0].qa.status, 'failed');
});

test('bounded recovery also refuses a contradictory QA PASS without waiving acceptance', async t => {
  const ctx = await setup(t, { reworkRounds: 0, autopilot: true });
  const calls = {};
  const script = { 'qa:phase-2': { findings: [{ severity: 'critical', summary: 'Export silently discards user content' }] } };
  const registry = Object.fromEntries(['codex', 'kimi', 'claude'].map(host => [host, fakeAdapter(host, { script, calls })]));
  const result = await run(ctx, { registry });
  assert.equal(result.status, 'decision_required');
  assert.equal(result.decisions_pending[0].reason, 'qa_acceptance_failed');
  assert.equal(calls['dev:phase-2'], 1);
  const state = JSON.parse(await fs.readFile(runStatePath(ctx.dir, SLUG), 'utf8'));
  assert.equal(state.units['phase-2'].qa.verdict, 'PASS');
  assert.equal(state.units['phase-2'].qa.status, 'failed');
  assert.notEqual(state.units['phase-3'].status, 'passed');
});

test('continuous QA process retries use new report paths and never rerun an approved DEV', async t => {
  const ctx = await setup(t, { autopilot: true });
  const calls = {}, prompts = {};
  const script = { 'qa:phase-2': n => ({ missing_run_id: n < 3 }) };
  const registry = Object.fromEntries(['codex', 'kimi', 'claude'].map(host => [host, fakeAdapter(host, { script, calls, prompts })]));
  assert.equal((await run(ctx, { registry, extra: { 'bounded-recovery': false } })).status, 'completed');
  assert.equal(calls['dev:phase-2'], 1);
  assert.equal(calls['qa:phase-2'], 3);
  const reports = prompts['qa:phase-2'].map(prompt => prompt.match(/report to: ([^\n]+)/)[1]);
  assert.equal(new Set(reports).size, 3);
  assert.match(reports[2], /report2/);
});

test('technical retry preserves QA evidence and regression history; capacity and auth are not invented approvals', () => {
  const { queueRecovery, recoveryAction } = require('../src/agent-execution/execution-recovery');
  const findings = [{ summary: 'Two undos diverge', path: 'src/history.ts' }];
  const unit = { dev: { status: 'crashed', error: 'spawn ENAMETOOLONG' }, qa: { status: 'pending' }, rework: { rounds: 4, max: 3, history: [{ findings }] }, retry_context: { dev: { findings, evidence: ['real HTTP reproduction'] } } };
  assert.equal(queueRecovery(unit, 'dev', { kind: 'crashed', reason: 'engine_error' }, 3), true);
  assert.deepEqual(unit.retry_context.dev.findings, findings);
  assert.deepEqual(unit.retry_context.dev.evidence, ['real HTTP reproduction']);
  assert.equal(unit.rework.rounds, 4);
  assert.equal(unit.technical_retries.dev, 1);
  assert.equal(recoveryAction('qa', { kind: 'unavailable', reason: 'auth_required' }), null);
  assert.equal(recoveryAction('dev', { kind: 'aborted', reason: 'lease_lost' }), null);
});

test('resume in continuous mode recovers an existing QA decision with prior evidence and preserves approved units', async t => {
  const ctx = await setup(t, { reworkRounds: 1, autopilot: true });
  const calls = {}, prompts = {};
  const script = { 'qa:phase-2': n => n < 3 ? { verdict: 'FAIL', findings: [{ severity: 'high', summary: 'Persisted undo mismatch' }] } : {} };
  const registry = Object.fromEntries(['codex', 'kimi', 'claude'].map(host => [host, fakeAdapter(host, { script, calls, prompts })]));
  assert.equal((await run(ctx, { registry })).status, 'decision_required');
  const before = JSON.parse(await fs.readFile(runStatePath(ctx.dir, SLUG), 'utf8'));
  const result = await run(ctx, { registry, extra: { resume: true, 'bounded-recovery': false, 'until-complete': true } });
  assert.equal(result.status, 'completed');
  const after = JSON.parse(await fs.readFile(runStatePath(ctx.dir, SLUG), 'utf8'));
  assert.equal(after.run_id, before.run_id);
  assert.deepEqual(after.units['phase-1'], before.units['phase-1']);
  assert.equal(after.decisions.at(-1).source, 'continuous_recovery');
  assert.equal(calls['qa:phase-2'], 3);
  assert.match(prompts['dev:phase-2'].at(-1), /Persisted undo mismatch/);
});

test('autopilot retries blocked implementation with findings, fresh reports and independent QA; step preserves the decision', async (t) => {
  for (const step of [false, true]) {
    const ctx = await setup(t, { reworkRounds: 2, autopilot: true });
    const calls = {}, prompts = {};
    const script = { 'dev:phase-2': n => n === 1 ? { verdict: 'BLOCKED', findings: [{ severity: 'high', summary: 'Repair the existing UI command mapping', path: 'src/ui/Orders.tsx' }] } : {} };
    const registry = Object.fromEntries(['codex', 'kimi', 'claude'].map(host => [host, fakeAdapter(host, { script, calls, prompts })]));
    const result = await run(ctx, { registry, extra: { step } });
    assert.equal(result.status, step ? 'decision_required' : 'completed', JSON.stringify(result));
    assert.equal(calls['dev:phase-2'], step ? 1 : 2);
    if (!step) {
      assert.match(prompts['dev:phase-2'][1], /Repair the existing UI command mapping/);
      assert.match(prompts['dev:phase-2'][0], /Autopilot authorization/);
      assert.equal(calls['qa:phase-2'], 1);
    }
  }
});

test('autopilot recovers a transient harness database lock on the same model', async (t) => {
  const ctx = await setup(t, { reworkRounds: 2, autopilot: true });
  const calls = {}, prompts = {};
  const script = { 'dev:phase-2': n => n === 1 ? { locked: true } : {} };
  const registry = Object.fromEntries(['codex', 'kimi', 'claude'].map(host => [host, fakeAdapter(host, { script, calls, prompts })]));
  const result = await run(ctx, { registry });
  assert.equal(result.status, 'completed', JSON.stringify(result));
  assert.equal(calls['dev:phase-2'], 2);
  assert.match(prompts['dev:phase-2'][1], /do not modify application storage/);
  assert.equal(calls['qa:phase-2'], 1);
});

test('autopilot stops after its repair budget and never marks blocked work approved', async (t) => {
  const ctx = await setup(t, { reworkRounds: 2, autopilot: true });
  const calls = {};
  const script = { 'dev:phase-2': { verdict: 'BLOCKED', findings: [{ summary: 'Still broken', severity: 'high' }] } };
  const registry = Object.fromEntries(['codex', 'kimi', 'claude'].map(host => [host, fakeAdapter(host, { script, calls })]));
  const result = await run(ctx, { registry });
  assert.equal(result.status, 'decision_required');
  assert.equal(calls['dev:phase-2'], 3);
  assert.equal(calls['qa:phase-2'], undefined);
});

test('explicit acceptance retry sends preserved QA findings to DEV for one additional cycle, then stops again on failure', async t => {
  for (const fixed of [true, false]) {
    const ctx = await setup(t, { reworkRounds: 1, autopilot: true });
    const calls = {}, prompts = {};
    const script = { 'qa:phase-2': n => fixed && n > 2 ? {} : { verdict: 'FAIL', findings: [{ severity: 'high', summary: 'undo destroys the saved asset' }] } };
    const registry = Object.fromEntries(['codex', 'kimi', 'claude'].map(host => [host, fakeAdapter(host, { script, calls, prompts })]));
    assert.equal((await run(ctx, { registry })).status, 'decision_required');
    const before = JSON.parse(await fs.readFile(runStatePath(ctx.dir, SLUG), 'utf8'));
    const report = before.units['phase-2'].qa.report;
    const originalReport = await fs.readFile(path.join(ctx.dir, report), 'utf8');
    const decision = await decideExecution({ projectDir: ctx.dir, feature: SLUG, unit: 'phase-2', choice: 'retry', expectedRunId: before.run_id, env: ctx.env });
    assert.equal(decision.ok, true);
    assert.equal(decision.unit_status, 'pending');
    assert.equal(await fs.readFile(path.join(ctx.dir, report), 'utf8'), originalReport);
    const result = await run(ctx, { registry, extra: { resume: true } });
    assert.equal(result.status, fixed ? 'completed' : 'decision_required');
    assert.equal(calls['dev:phase-2'], 3);
    assert.equal(calls['qa:phase-2'], 3);
    assert.match(prompts['dev:phase-2'][2], /undo destroys the saved asset/);
    const after = JSON.parse(await fs.readFile(runStatePath(ctx.dir, SLUG), 'utf8'));
    assert.deepEqual(after.units['phase-1'], before.units['phase-1']);
    assert.equal(after.units['phase-2'].rework.history.at(-1).source, 'operator_acceptance_repair');
    assert.equal(after.units['phase-2'].rework.max, 1);
    assert.equal(after.findings.some(finding => finding.check === 'rework_exhausted' && finding.unit === 'phase-2'), !fixed);
  }
});

test('autopilot rejects a malformed DEV report then requests a fresh bound report before independent QA', async t => {
  const ctx = await setup(t, { reworkRounds: 2 });
  const prompts = {}, calls = {};
  const script = { 'dev:phase-2': n => ({ missing_run_id: n === 1 }) };
  const registry = Object.fromEntries(['codex', 'kimi', 'claude'].map(host => [host, fakeAdapter(host, { script, prompts, calls })]));
  const result = await run(ctx, { registry });
  assert.equal(result.status, 'completed');
  assert.equal(calls['dev:phase-2'], 2);
  assert.equal(calls['qa:phase-2'], 1);
  assert.match(prompts['dev:phase-2'][1], /previous report was rejected \(report_binding_invalid\)/);
  assert.match(prompts['dev:phase-2'][1], /\$\.run_id/);
  const state = JSON.parse(await fs.readFile(runStatePath(ctx.dir, SLUG), 'utf8'));
  assert.equal(state.units['phase-2'].qa.status, 'passed');
  assert.equal(state.units['phase-2'].rework, undefined);
  assert.equal(state.units['phase-2'].report_repair.rounds, 1);
  assert.equal(state.units['phase-2'].report_repair.pending, false);
});

test('autopilot repairs a rejected QA report without rerunning DEV or accepting the stale attempt', async t => {
  const ctx = await setup(t, { reworkRounds: 2 });
  const prompts = {}, calls = {};
  const script = { 'qa:phase-2': n => ({ missing_run_id: n === 1 }) };
  const registry = Object.fromEntries(['codex', 'kimi', 'claude'].map(host => [host, fakeAdapter(host, { script, prompts, calls })]));
  const result = await run(ctx, { registry });
  assert.equal(result.status, 'completed', JSON.stringify(result));
  assert.equal(calls['dev:phase-2'], 1);
  assert.equal(calls['qa:phase-2'], 2);
  assert.match(prompts['qa:phase-2'][1], /Repair only the rejected QA delivery report/);
  assert.match(prompts['qa:phase-2'][1], /\$\.run_id/);
  const state = JSON.parse(await fs.readFile(runStatePath(ctx.dir, SLUG), 'utf8'));
  assert.equal(state.units['phase-2'].qa.status, 'passed');
  assert.equal(state.units['phase-2'].qa_report_repair.rounds, 1);
  assert.equal(state.units['phase-2'].qa_report_repair.pending, false);
  const reports = await fs.readdir(path.dirname(path.join(ctx.dir, state.units['phase-2'].qa.report)));
  assert.ok(reports.some(name => /phase-2-qa.*\.rejected-.*\.json$/.test(name)));
});

test('manifest schema: qa.max_rework_rounds is bounded (0–3); new compiled plans default to one rework', async (t) => {
  const manifest = defaults('demo', 'codex');
  manifest.development_lanes.lanes.backend.qa = { host: 'claude', model: 'claude-sonnet-5', report: '.aioson/context/reports/demo/{run_id}/qa-backend.json', max_fix_files: 3, max_rework_rounds: 2 };
  assert.equal(validateManifest(manifest, 'demo').ok, true);
  manifest.development_lanes.lanes.backend.qa.max_rework_rounds = 4;
  assert.deepEqual(validateManifest(manifest, 'demo').errors.map((e) => e.path), ['$.development_lanes.lanes.backend.qa.max_rework_rounds']);
  manifest.development_lanes.lanes.backend.qa.max_rework_rounds = -1;
  assert.equal(validateManifest(manifest, 'demo').ok, false);

  const plain = await setup(t);
  const { plan } = await readExecutionPlan(plain.dir, SLUG);
  assert.equal(plan.lanes.frontend.qa.max_rework_rounds, 1);
  const budgeted = await setup(t, { reworkRounds: 2 });
  const compiled = (await readExecutionPlan(budgeted.dir, SLUG)).plan;
  assert.equal(compiled.lanes.frontend.qa.max_rework_rounds, 2);
  assert.equal(compiled.lanes.backend.qa.max_rework_rounds, 1);
});

test('report repair still runs after QA consumed the code-rework budget and cannot loop indefinitely', async t => {
  for (const stubborn of [false, true]) {
    const ctx = await setup(t, { reworkRounds: 1 });
    const calls = {}, prompts = {};
    const script = {
      'dev:phase-2': n => ({ missing_run_id: n >= 2 && (stubborn || n === 2) }),
      'qa:phase-2': n => n === 1 ? { verdict: 'FAIL', findings: [{ severity: 'high', summary: 'Fix the UI defect' }] } : {}
    };
    const registry = Object.fromEntries(['codex', 'kimi', 'claude'].map(host => [host, fakeAdapter(host, { script, prompts, calls })]));
    const result = await run(ctx, { registry });
    assert.equal(result.status, stubborn ? 'decision_required' : 'completed');
    assert.equal(calls['dev:phase-2'], stubborn ? 4 : 3);
    assert.equal(calls['qa:phase-2'], stubborn ? 1 : 2);
    assert.match(prompts['dev:phase-2'][2], /Repair only the rejected delivery report/);
    const state = JSON.parse(await fs.readFile(runStatePath(ctx.dir, SLUG), 'utf8'));
    assert.equal(state.units['phase-2'].rework.rounds, 1);
    assert.equal(state.units['phase-2'].report_repair.rounds, stubborn ? 2 : 1);
  }
});

test('blocked consumer returns a declared backend defect to its owner and waits for renewed QA', async t => {
  const ctx = await setup(t, { reworkRounds: 2 });
  const plan = PLAN.replace('| Scope | Done when |', '| Scope | Done when | Depends on |')
    .replace('| 2 | 1 | src/ui/Orders.tsx | CAP-orders-ui | npm test -- orders.ui passes |', '| 2 | 2 | src/ui/Orders.tsx | CAP-orders-ui | npm test -- orders.ui passes | 1 |')
    .replace('| 3 | 2 | src/app.ts', '| 3 | 3 | src/app.ts');
  await fs.writeFile(path.join(ctx.dir, '.aioson/context/implementation-plan-orders.md'), plan);
  const compiled = await runCommand({ args: [ctx.dir], options: { sub: 'compile', feature: SLUG, json: true }, logger, env: ctx.env });
  assert.equal(compiled.ok, true, JSON.stringify(compiled.errors));
  const calls = {}, prompts = {};
  const script = { 'dev:phase-2': n => n === 1 ? { verdict: 'BLOCKED', findings: [{ severity: 'high', path: 'src/api/orders.ts:10', summary: 'API discards timing fields' }], messages: [{ to: 'integration', kind: 'contract_change', text: 'Persist timing fields in the declared API', paths: ['src/api/orders.ts'] }] } : {} };
  const registry = Object.fromEntries(['codex', 'kimi', 'claude'].map(host => [host, fakeAdapter(host, { script, prompts, calls })]));
  const result = await run(ctx, { registry });
  assert.equal(result.status, 'completed');
  assert.equal(calls['dev:phase-1'], 2);
  assert.equal(calls['qa:phase-1'], 2);
  assert.equal(calls['dev:phase-2'], 2);
  assert.equal(calls['qa:phase-2'], 1);
  assert.match(prompts['dev:phase-1'][1], /API discards timing fields/);
  const state = JSON.parse(await fs.readFile(runStatePath(ctx.dir, SLUG), 'utf8'));
  assert.equal(state.units['phase-1'].contract_repairs, 1);
  assert.equal(state.units['phase-2'].rework, undefined);
});

test('a failed lane review sends the unit back to its implementer with the findings, up to the budget; reports per round; the ledger counts the rounds; the budget spent leaves rework_exhausted', async (t) => {
  const ctx = await setup(t, { reworkRounds: 2 });
  const prompts = {};
  const calls = {};
  const script = {
    'qa:phase-2': (n) => (n === 1 ? { verdict: 'FAIL', findings: [{ severity: 'high', summary: 'screen never calls the API', path: 'src/ui/Orders.tsx' }] } : {})
  };
  const registry = { codex: fakeAdapter('codex', { script, prompts, calls }), kimi: fakeAdapter('kimi', { script, prompts, calls }), claude: fakeAdapter('claude', { script, prompts, calls }) };
  const events = [];
  const result = await run(ctx, { registry, events });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.status, 'completed');
  assert.equal(calls['dev:phase-2'], 2, 'the implementer ran again');
  assert.equal(calls['qa:phase-2'], 2, 'the reviewer ran again');
  assert.equal(calls['dev:phase-1'], 1);
  assert.equal(calls['qa:phase-1'], 1);
  assert.doesNotMatch(prompts['dev:phase-2'][0], /Reviewer findings/);
  assert.match(prompts['dev:phase-2'][1], /## Reviewer findings — rework round 1 of 2 \(fix these inside your unit files, re-run the verification, report again\)\n\n- \{"severity":"high","summary":"screen never calls the API","path":"src\/ui\/Orders\.tsx"\}/);
  assert.ok(prompts['dev:phase-2'][1].indexOf('## Reviewer findings') < prompts['dev:phase-2'][1].indexOf('AIOSON EXECUTION CONTRACT'));

  const state = JSON.parse(await fs.readFile(runStatePath(ctx.dir, SLUG), 'utf8'));
  const unit = state.units['phase-2'];
  assert.equal(unit.status, 'passed');
  assert.equal(unit.qa.status, 'passed');
  assert.deepEqual({ rounds: unit.rework.rounds, max: unit.rework.max }, { rounds: 1, max: 2 });
  assert.equal(unit.rework.history.length, 1);
  assert.equal(unit.rework.history[0].findings[0].summary, 'screen never calls the API');
  assert.equal(unit.rework.history[0].dev.report, `.aioson/context/reports/${SLUG}/${state.run_id}/phase-2.json`);
  assert.equal(unit.rework.history[0].qa.report, `.aioson/context/reports/${SLUG}/${state.run_id}/phase-2-qa.json`);
  assert.equal(unit.dev.report, `.aioson/context/reports/${SLUG}/${state.run_id}/phase-2.r1.json`);
  assert.equal(unit.qa.report, `.aioson/context/reports/${SLUG}/${state.run_id}/phase-2-qa.r1.json`);
  for (const rel of [unit.rework.history[0].dev.report, unit.rework.history[0].qa.report, unit.dev.report, unit.qa.report]) await fs.access(path.join(ctx.dir, rel));
  assert.equal(state.units['phase-1'].rework, undefined);
  assert.deepEqual(state.findings, [], 'a review that passes after rework leaves nothing for integration');
  assert.deepEqual(result.summary.rework, { units: 1, rounds: 1 });
  assert.ok(events.some((e) => e.type === 'unit' && e.role === 'qa' && e.status === 'rework' && e.unit === 'phase-2' && e.round === 1 && e.max === 2));

  const status = await runCommand({ args: [ctx.dir], options: { sub: 'status', feature: SLUG, json: true }, logger, env: ctx.env });
  assert.deepEqual(status.units.find((u) => u.id === 'phase-2').rework, { rounds: 1, max: 2 });
  assert.equal(status.units.find((u) => u.id === 'phase-1').rework, null);

  // Budget spent: failed acceptance pauses the unit with its findings intact.
  const stubborn = await setup(t, { reworkRounds: 1 });
  const alwaysFail = { 'qa:phase-2': () => ({ verdict: 'FAIL', findings: [{ severity: 'high', summary: 'still wrong' }] }) };
  const calls2 = {};
  const registry2 = { codex: fakeAdapter('codex', { script: alwaysFail, calls: calls2 }), kimi: fakeAdapter('kimi', { script: alwaysFail, calls: calls2 }), claude: fakeAdapter('claude', { script: alwaysFail, calls: calls2 }) };
  const exhausted = await run(stubborn, { registry: registry2 });
  assert.equal(exhausted.status, 'decision_required');
  assert.equal(exhausted.decisions_pending[0].reason, 'qa_acceptance_failed');
  assert.equal(calls2['dev:phase-2'], 2);
  assert.equal(calls2['qa:phase-2'], 2);
  const state2 = JSON.parse(await fs.readFile(runStatePath(stubborn.dir, SLUG), 'utf8'));
  assert.equal(state2.units['phase-2'].qa.status, 'failed');
  assert.equal(state2.units['phase-2'].rework.rounds, 1);
  assert.deepEqual(state2.findings.map((f) => f.check), ['rework_exhausted']);
  assert.match(state2.findings[0].message, /still fails after 1 rework round\(s\)/);
  assert.equal(exhausted.summary.units.qa_failed, 1);

  // Default budget is one bounded retry, then an explicit acceptance decision.
  const plain = await setup(t);
  const calls3 = {};
  const registry3 = { codex: fakeAdapter('codex', { script: alwaysFail, calls: calls3 }), kimi: fakeAdapter('kimi', { script: alwaysFail, calls: calls3 }), claude: fakeAdapter('claude', { script: alwaysFail, calls: calls3 }) };
  const once = await run(plain, { registry: registry3 });
  assert.equal(once.status, 'decision_required');
  assert.equal(calls3['dev:phase-2'], 2);
  assert.equal(calls3['qa:phase-2'], 2);
  assert.deepEqual(once.summary.rework, { units: 1, rounds: 1 });
  const state3 = JSON.parse(await fs.readFile(runStatePath(plain.dir, SLUG), 'utf8'));
  assert.equal(state3.units['phase-2'].rework.rounds, 1);
  assert.deepEqual(state3.findings.map(finding => finding.check), ['rework_exhausted']);
});
