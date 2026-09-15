'use strict';

// The first real orchestrated run (six units, four waves, two lanes) showed
// one pattern under seven findings: the engine asked for the right thing and
// the pieces around it did not deliver, and when something went wrong the
// message did not say where the exit was. This file holds each of those to a
// machine check:
//   - the sandbox translation belongs to the registry, and every adapter
//     consumes it (one adapter's own `--sandbox workspace-write` left a lane
//     asking for approval all night with nothing in the log);
//   - a host that cannot honor a mode is refused, never run with default power;
//   - a lane worker runs unattended, always (the provider sandbox was measured
//     and never ran unattended); legacy `unit_timeout_ms` is accepted and ignored;
//   - the roles digest the plan binds to ignores that retired field;
//   - a lease nobody renews is waited out, a live one is never deleted;
//   - "no writes" is measured on its own, however talkative the worker;
//   - a duplicated canonical section refuses the compile;
//   - the signature probes the unattended write, not only the login.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { TOOL_CAPS, resolveSandboxArgs, listExecutionHosts, LANE_WORKER_MODE } = require('../src/lib/tool-capabilities');
const { createAdapter } = require('../src/agent-execution/adapters/base');
const { validateExecutionRoles, readExecutionRoles, rolesBindingDigest, UNLIMITED_UNIT_TIMEOUT_MS } = require('../src/lib/execution-roles');
const { acquireLease, renewLease, releaseLease, leasePath } = require('../src/agent-execution/dispatcher');
const { acquireLeaseWaiting, createStallWatch, describeMs, DEFAULT_UNIT_TIMEOUT_MS, scanWritePaths, measureTarget } = require('../src/agent-execution/execution-run');
const { duplicateSections, duplicatePhaseSections, PLAN_CANONICAL_SECTIONS, PRD_CANONICAL_SECTIONS, readExecutionPlan, verifyExecutionPlan } = require('../src/agent-execution/execution-plan');
const { probeHostSignature, signatureKey, writeSignatures, readSignatures, UNATTENDED_PROBE_FILE } = require('../src/lib/host-signature');
const { runHostSignature } = require('../src/commands/host-signature');
const { runExecution: runCommand } = require('../src/commands/execution');

const ROOT = path.resolve(__dirname, '..');
const logger = { log() {}, error() {}, warn() {} };
const SLUG = 'orders';
const HOSTS = listExecutionHosts();

const adapterFor = (host) => require(`../src/agent-execution/adapters/${host}`);
const buildInput = (extra = {}) => ({ mode: 'external', model: 'configured-default', cwd: process.cwd(), prompt_text: 'x', ...extra });

// ───────────────────────── adapters × registry ─────────────────────────

test('every execution adapter runs workspace-write with exactly the registry\'s unattended flag — the one translation no adapter may diverge from', () => {
  for (const host of HOSTS) {
    const caps = TOOL_CAPS[host];
    const built = adapterFor(host).build(buildInput({ sandbox_mode: 'workspace-write' }));
    if (caps.supports_yolo && Array.isArray(caps.yolo_args)) {
      assert.equal(built.ok, true, `${host}: ${JSON.stringify(built)}`);
      for (const flag of caps.yolo_args) assert.ok(built.args.includes(flag), `${host} argv carries ${flag}: ${built.args.join(' ')}`);
      assert.equal(built.args.includes('workspace-write'), false, `${host} never runs a lane worker under the provider's approval-routed sandbox by default`);
    } else {
      assert.equal(built.ok, false, `${host} has no unattended flag and must refuse, not run with default permissions`);
      assert.equal(built.reason, 'permission_mode_unsupported');
      assert.equal(built.host, host);
    }
  }
});

test('every dispatchable host registers an unattended flag — a lane worker never lands on a host that would ask; adding a harness is one registry entry with its flag', () => {
  for (const host of HOSTS) {
    const caps = TOOL_CAPS[host];
    assert.equal(caps.supports_yolo, true, `${host} is dispatchable and must run unattended`);
    assert.ok(Array.isArray(caps.yolo_args) && caps.yolo_args.length > 0, `${host}.yolo_args`);
    assert.equal(resolveSandboxArgs(host, 'workspace-write').ok, true, host);
  }
  for (const [tool, caps] of Object.entries(TOOL_CAPS)) {
    assert.equal(caps.supports_yolo, true, `${tool}: every registered harness declares how it runs without prompts`);
  }
});

test('read-only is the registry\'s too: hosts with a read-only flag get it, a host without one refuses instead of running with write access', () => {
  for (const host of HOSTS) {
    const caps = TOOL_CAPS[host];
    const built = adapterFor(host).build(buildInput({ sandbox_mode: 'read-only' }));
    if (Array.isArray(caps.read_only_args)) {
      assert.equal(built.ok, true, host);
      for (const flag of caps.read_only_args) assert.ok(built.args.includes(flag), `${host} read-only argv carries ${flag}`);
    } else {
      assert.equal(built.ok, false, host);
      assert.equal(built.reason, 'sandbox_mode_unsupported');
    }
  }
  // OpenCode is the concrete case: three lines that ignored sandbox_mode entirely.
  const opencode = adapterFor('opencode').build(buildInput({ sandbox_mode: 'read-only' }));
  assert.equal(opencode.reason, 'sandbox_mode_unsupported');
  assert.match(opencode.error, /no read-only mode registered/);
  // Without a sandbox_mode nothing changes for any adapter.
  assert.equal(adapterFor('opencode').build(buildInput()).ok, true);
});

test('a lane worker is unattended, always: the provider sandbox is never an argv (measured: Codex under --sandbox workspace-write answered DONE after 96 s without writing); unknown modes never pass', () => {
  // No registered host carries a sandboxed-write translation, and no caller
  // input can select one — the registry has exactly two modes.
  for (const host of HOSTS) assert.equal(Object.hasOwn(TOOL_CAPS[host], 'sandbox_write_args'), false, host);
  const codex = adapterFor('codex').build(buildInput({ sandbox_mode: 'workspace-write', permission_mode: 'sandbox' }));
  assert.equal(codex.ok, true);
  assert.deepEqual(codex.args.slice(0, 3), ['exec', '--skip-git-repo-check', '--dangerously-bypass-approvals-and-sandbox']);
  assert.equal(codex.args.includes('workspace-write'), false, 'a stray permission_mode in the input changes nothing');
  assert.equal(LANE_WORKER_MODE, 'yolo');
  assert.equal(resolveSandboxArgs('codex', 'workspace-write').permission_mode, 'yolo');
  assert.equal(resolveSandboxArgs('codex', 'full-access').reason, 'sandbox_mode_unknown');
  assert.deepEqual(resolveSandboxArgs('codex', null), { ok: true, args: [], sandbox_mode: null });
  assert.equal(resolveSandboxArgs('gemini', 'workspace-write').reason, 'permission_mode_unsupported', 'an unregistered host has no flag to run unattended with');
  // The adapter receives the translation, never computes it: a custom adapter
  // for a registered host gets the same argv the engine would.
  const custom = createAdapter('kimi', (input) => ['--custom', ...(input.sandbox_args || [])]);
  assert.deepEqual(custom.build(buildInput({ sandbox_mode: 'workspace-write' })).args, ['--custom', '--auto']);
});

// ───────────────────────── roles: no permission knob, legacy timeout ignored, binding digest ─────────────────────────

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

test('execution-roles: there is no per-role permission knob or active unit time limit', () => {
  const withMode = validateExecutionRoles({ ...ROLES, roles: { ...ROLES.roles, backend_dev: { ...ROLES.roles.backend_dev, permission_mode: 'sandbox' } } });
  assert.equal(withMode.ok, false);
  assert.match(withMode.errors.find((e) => e.path === '$.roles.backend_dev.permission_mode').message, /unknown field/);

  assert.equal(validateExecutionRoles({ ...ROLES, execution: { unit_timeout_ms: UNLIMITED_UNIT_TIMEOUT_MS } }).ok, true, 'the old no-limit value still loads');
  const tooSmall = validateExecutionRoles({ ...ROLES, execution: { unit_timeout_ms: 5 } });
  assert.equal(tooSmall.ok, true, 'legacy values are ignored instead of arming or blocking a process');
  assert.equal(DEFAULT_UNIT_TIMEOUT_MS, 0, 'orchestrated workers have no AIOSON wall-clock deadline');
  assert.equal(describeMs(0), 'no limit');
  assert.equal(describeMs(600000), '10 min');
  assert.equal(describeMs(DEFAULT_UNIT_TIMEOUT_MS), 'no limit');
});

test('the roles digest binds compile-time policy while live model routing and process budgets remain editable', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-roles-digest-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  await fs.mkdir(path.join(dir, '.aioson', 'config'), { recursive: true });
  const write = (roles) => fs.writeFile(path.join(dir, '.aioson', 'config', 'execution-roles.json'), JSON.stringify(roles, null, 2));
  await write(ROLES);
  const base = await readExecutionRoles(dir);
  assert.equal(base.ok, true);
  assert.equal(base.digest, rolesBindingDigest(base.roles));
  assert.notEqual(base.digest, base.file_digest, 'binding digest and file digest are two facts');

  await write({ ...ROLES, execution: { unit_timeout_ms: 0, spawner: { command: 'cockpitctl', args: ['unit', 'spawn'] } } });
  const budget = await readExecutionRoles(dir);
  assert.equal(budget.digest, base.digest, 'raising or removing the budget, or setting a spawner, never invalidates a compiled plan');
  assert.notEqual(budget.file_digest, base.file_digest);
  assert.equal(Object.hasOwn(budget.roles.execution, 'unit_timeout_ms'), false, 'the legacy field is discarded during normalization');

  for (const [label, roles] of [
    ['a role model', { ...ROLES, roles: { ...ROLES.roles, qa: { host: 'claude', model: 'claude-opus-5' } } }],
    ['a role effort', { ...ROLES, roles: { ...ROLES.roles, backend_dev: { ...ROLES.roles.backend_dev, reasoning_effort: 'medium' } } }]
  ]) {
    await write(roles);
    assert.equal((await readExecutionRoles(dir)).digest, base.digest, `${label} is reloaded before dispatch and does not stale the compiled graph`);
  }
  for (const [label, roles] of [
    ['the parallelism', { ...ROLES, parallel: { max_concurrent_lanes: 1 } }],
    ['the independent-review rule', { ...ROLES, execution: { require_independent_qa: true } }]
  ]) {
    await write(roles);
    assert.notEqual((await readExecutionRoles(dir)).digest, base.digest, `${label} shapes the units and changes the binding digest`);
  }
});

// ───────────────────────── lease: wait out the dead, never delete the live ─────────────────────────

test('a lease nobody renews is waited out and acquired; a lease a live run keeps renewing is refused as alive — the lock is never deleted by hand', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-lease-wait-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  const file = leasePath(dir, SLUG);
  await fs.mkdir(path.dirname(file), { recursive: true });

  // Dead: a lock with 400 ms of validity left and no one renewing it.
  await fs.writeFile(file, JSON.stringify({ owner: 'dead-run', expires_at: Date.now() + 400 }));
  const waits = [];
  const started = Date.now();
  const dead = await acquireLeaseWaiting(dir, SLUG, { maxWaitMs: 5000, pollMs: 50, onWait: (info) => waits.push(info) });
  assert.ok(dead.lease, 'acquired once the dead lease expired');
  assert.ok(dead.waited_ms >= 300 && Date.now() - started < 4000, `waited for the expiry, not the budget: ${dead.waited_ms}`);
  assert.equal(waits.length, 1);
  assert.ok(waits[0].expires_in_ms > 0 && waits[0].expires_in_ms <= 400);
  assert.match(waits[0].path, /agent-execution-state-orders\.json\.lock$/);
  await releaseLease(dead.lease);

  // Alive: another holder renews every 60 ms — refused as soon as a renewal is seen, lock intact.
  const live = await acquireLease(dir, SLUG);
  const renewing = setInterval(() => { renewLease(live).catch(() => {}); }, 60);
  try {
    const refused = await acquireLeaseWaiting(dir, SLUG, { maxWaitMs: 5000, pollMs: 50 });
    assert.equal(refused.lease, null);
    assert.equal(refused.lease_info.alive, true);
    assert.match(refused.message, /live execution run/);
    assert.match(refused.message, /never delete the lock by hand/);
    assert.ok(refused.waited_ms < 4000, 'a live holder is recognized long before the budget');
    assert.equal(JSON.parse(await fs.readFile(file, 'utf8')).owner, live.owner, 'the live lock was not touched');
  } finally {
    clearInterval(renewing);
    await releaseLease(live);
  }

  // No budget: refuse at once, naming the remaining time and the safe exit.
  await fs.writeFile(file, JSON.stringify({ owner: 'x', expires_at: Date.now() + 20000 }));
  const immediate = await acquireLeaseWaiting(dir, SLUG, { maxWaitMs: 0 });
  assert.equal(immediate.lease, null);
  assert.equal(immediate.lease_info.alive, null);
  assert.ok(immediate.lease_info.expires_in_ms > 15000);
  assert.match(immediate.message, /expires in \d+s/);
  assert.match(immediate.message, /run the same command again once it expires/);
});

// ───────────────────────── stall vs unproductive ─────────────────────────

test('unproductive is measured on the disk alone: a worker that keeps talking and never writes is named; one that writes is not', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-stall-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  await fs.mkdir(path.join(dir, 'src', 'api'), { recursive: true });
  const events = [];
  const watch = createStallWatch({ projectDir: dir, writePaths: ['src/api/**'], stallMs: 2000, unproductiveMs: 150, checkMs: 20, now: () => Date.now(), onStalled: (e) => events.push({ type: 'stalled', ...e }), onUnproductive: (e) => events.push({ type: 'unproductive', ...e }) });
  const chatter = setInterval(() => watch.touch(), 25);
  try {
    await new Promise((resolve) => setTimeout(resolve, 450));
  } finally {
    clearInterval(chatter);
    watch.stop();
  }
  assert.equal(watch.unproductive, true);
  assert.equal(watch.stalled, false, 'output kept the silence detector quiet — the old chained check never reached the disk');
  const fired = events.find((e) => e.type === 'unproductive');
  assert.ok(fired && fired.since_ms >= 150 && fired.silent_ms < 2000, JSON.stringify(events));

  // A worker that writes is productive whatever its output.
  const writing = createStallWatch({ projectDir: dir, writePaths: ['src/api/**'], stallMs: 2000, unproductiveMs: 150, checkMs: 20, now: () => Date.now(), onUnproductive: (e) => events.push({ type: 'unproductive-2', ...e }) });
  const writer = setInterval(() => { fs.writeFile(path.join(dir, 'src', 'api', 'orders.ts'), String(Date.now())).catch(() => {}); }, 40);
  try {
    await new Promise((resolve) => setTimeout(resolve, 400));
  } finally {
    clearInterval(writer);
    writing.stop();
  }
  assert.equal(writing.unproductive, false);
  assert.equal(events.some((e) => e.type === 'unproductive-2'), false);
});

test('the disk measurement never counts the engine\'s own files: under a root-level glob the state rewritten on every beat is skipped, so a worker that never writes is still named unproductive', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-scan-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  await fs.mkdir(path.join(dir, '.aioson', 'context'), { recursive: true });
  await fs.mkdir(path.join(dir, 'src'), { recursive: true });
  const stateFile = path.join(dir, '.aioson', 'context', 'execution-state-orders.json');
  // Linux stamps files from a coarse clock (a jiffy behind Date.now()), so a
  // write a millisecond after `since` can carry an earlier mtime — the window
  // opens two seconds back. The engine's files are excluded by path, not time.
  const since = Date.now() - 2000;
  await fs.writeFile(stateFile, '{}');
  const engineOnly = await scanWritePaths(dir, ['**'], { since });
  assert.deepEqual(engineOnly, { newest: 0, newest_path: null, files_changed: 0, measured: true });
  assert.deepEqual((await scanWritePaths(dir, ['.aioson/**'], { since })).files_changed, 0, 'a target inside .aioson/ is never measured');
  await fs.writeFile(path.join(dir, 'src', 'a.ts'), 'x');
  const owned = await scanWritePaths(dir, ['**'], { since });
  assert.equal(owned.files_changed, 1);
  assert.equal(owned.newest_path, 'src/a.ts');
  assert.equal((await scanWritePaths(dir, ['src/*.css'], { since })).files_changed, 0, 'only files the paths own count');

  // The engine keeps rewriting its state (every 15 s in a run; every 20 ms here): not a write of the unit.
  const events = [];
  const watch = createStallWatch({ projectDir: dir, writePaths: ['**'], stallMs: 5000, unproductiveMs: 150, checkMs: 20, now: () => Date.now(), onUnproductive: (e) => events.push(e) });
  const beat = setInterval(() => { fs.writeFile(stateFile, String(Date.now())).catch(() => {}); }, 20);
  try {
    await new Promise((resolve) => setTimeout(resolve, 450));
  } finally {
    clearInterval(beat);
    watch.stop();
  }
  assert.equal(watch.unproductive, true, JSON.stringify(events));
});

test('a walk that reaches its entry cap reports measured:false and the detectors give no verdict; a unit is measured on its own files, the lane write paths only as a labelled fallback', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-scan-cap-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  await fs.mkdir(path.join(dir, 'src', 'api'), { recursive: true });
  for (let i = 0; i < 12; i += 1) await fs.writeFile(path.join(dir, 'src', 'api', `f${i}.ts`), 'x');
  const partial = await scanWritePaths(dir, ['src/api/**'], { cap: 5, since: 1 });
  assert.equal(partial.measured, false, 'part of the disk is never reported as the whole');
  assert.equal((await scanWritePaths(dir, ['src/api/**'], { cap: 100, since: 1 })).measured, true);

  const verdicts = [];
  const capped = createStallWatch({ projectDir: dir, writePaths: ['src/api/**'], stallMs: 60, unproductiveMs: 60, checkMs: 15, now: () => Date.now(), cap: 5, onStalled: (e) => verdicts.push(['stalled', e]), onUnproductive: (e) => verdicts.push(['unproductive', e]) });
  try {
    await new Promise((resolve) => setTimeout(resolve, 300));
  } finally {
    capped.stop();
  }
  assert.deepEqual(verdicts, [], 'no stalled/unproductive verdict from half a walk');

  assert.deepEqual(measureTarget({ files: ['src/api/a.ts', 'tests/api/a.test.ts'] }, { write_paths: ['src/api/**', 'tests/api/**'] }), { measured_on: 'unit_files', paths: ['src/api/a.ts', 'tests/api/a.test.ts'] });
  assert.deepEqual(measureTarget({ files: [] }, { write_paths: ['src/api/**'] }), { measured_on: 'lane_write_paths', paths: ['src/api/**'] });
});

// ───────────────────────── duplicated canonical sections ─────────────────────────

const PLAN_LINES = [
  '---', 'feature: orders', 'status: draft', '---',
  '# Implementation Plan — orders', '',
  '## Capability Delivery Plan',
  '| CAP | Phase | Files | Verification |', '|---|---|---|---|',
  '| CAP-orders-api | 1 | src/api/orders.ts | npm test |', '',
  '## Phase 1 — api', 'Build the api.', '',
  '## Development execution lanes',
  '| Lane | Host | Model | Exact write paths | Integration owner |', '|---|---|---|---|---|',
  '| backend | codex | gpt-5.6 | src/api/** | dev |', '',
  '## Execution Sequence',
  '| Phase | Wave | Files | Scope | Done when |', '|---|---|---|---|---|',
  '| 1 | 1 | src/api/orders.ts | CAP-orders-api | npm test passes |', ''
];

test('duplicateSections mirrors the readers: any canonical heading twice, or the same phase opened twice at the top level — nested sub-headings never count', () => {
  const clean = PLAN_LINES.join('\n');
  assert.deepEqual(duplicateSections(clean, PLAN_CANONICAL_SECTIONS), []);
  assert.deepEqual(duplicatePhaseSections(clean), []);

  const twice = [...PLAN_LINES, ...PLAN_LINES.slice(11)].join('\n');
  const dups = duplicateSections(twice, PLAN_CANONICAL_SECTIONS);
  assert.deepEqual(dups.map((d) => d.id), ['execution-sequence', 'development-execution-lanes']);
  assert.deepEqual(dups[0].lines.length, 2);
  assert.deepEqual(duplicatePhaseSections(twice).map((d) => d.id), ['phase-1']);

  const nested = [...PLAN_LINES.slice(0, 13), '### Phase 1 notes', 'more', ...PLAN_LINES.slice(13)].join('\n');
  assert.deepEqual(duplicatePhaseSections(nested), [], 'a deeper "Phase 1 notes" inside Phase 1 is part of the section');

  const pt = PLAN_LINES.map((line) => line.replace('## Execution Sequence', '## Sequência de Execução')).join('\n') + '\n## Sequencia de Execucao\n| Phase | Wave |\n|---|---|\n';
  assert.deepEqual(duplicateSections(pt, PLAN_CANONICAL_SECTIONS).map((d) => d.id), ['execution-sequence'], 'aliases fold accents and language');
  assert.deepEqual(duplicateSections('## Acceptance Criteria\n\n## Critérios de Aceite\n', PRD_CANONICAL_SECTIONS).map((d) => d.id), ['acceptance-criteria']);
});

async function compileProject(t, { planContent, prdContent = '# Orders\n\n## Acceptance Criteria\n| AC | CAP | Observable behavior | Evidence |\n|---|---|---|---|\n| AC-orders-01 | CAP-orders-api | POST /orders creates an order | api test |\n', roles = ROLES }) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-dup-compile-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  for (const rel of ['.aioson/context', '.aioson/config', '.aioson/agents']) await fs.mkdir(path.join(dir, ...rel.split('/')), { recursive: true });
  await fs.writeFile(path.join(dir, '.aioson', 'context', `implementation-plan-${SLUG}.md`), planContent, 'utf8');
  await fs.writeFile(path.join(dir, '.aioson', 'context', `prd-${SLUG}.md`), prdContent, 'utf8');
  await fs.writeFile(path.join(dir, '.aioson', 'config', 'execution-roles.json'), JSON.stringify(roles, null, 2), 'utf8');
  await fs.copyFile(path.join(ROOT, 'template', '.aioson', 'agents', 'dev.md'), path.join(dir, '.aioson', 'agents', 'dev.md'));
  const env = { ...process.env, AIOSON_HOST_SIGNATURES: path.join(dir, 'signatures.json') };
  const signed = (host, model, effort) => ({ host, model, reasoning_effort: effort, status: 'valid', reason: null, checked_at: '2026-08-25T10:00:00.000Z', expires_at: '2999-01-01T00:00:00.000Z' });
  await writeSignatures({ signatures: {
    [signatureKey('codex', 'gpt-5.6', 'high')]: signed('codex', 'gpt-5.6', 'high'),
    [signatureKey('kimi', 'kimi-k3', null)]: signed('kimi', 'kimi-k3', null),
    [signatureKey('claude', 'claude-sonnet-5', null)]: signed('claude', 'claude-sonnet-5', null)
  } }, { env });
  const result = await runCommand({ args: [dir], options: { sub: 'compile', feature: SLUG, json: true }, logger, env });
  return { dir, env, result };
}

test('execution:compile refuses a plan whose canonical block appears twice (duplicate_plan_section) and warns on a duplicated PRD table; the clean plan compiles', async (t) => {
  const clean = await compileProject(t, { planContent: PLAN_LINES.join('\n') });
  assert.equal(clean.result.ok, true, JSON.stringify(clean.result.errors));
  assert.equal(clean.result.warnings.some((w) => w.check === 'duplicate_prd_section'), false);

  // The incident shape: the whole phase block pasted twice, tables included.
  const twice = await compileProject(t, { planContent: [...PLAN_LINES, ...PLAN_LINES.slice(11)].join('\n') });
  assert.equal(twice.result.ok, false);
  const dup = twice.result.errors.filter((e) => e.check === 'duplicate_plan_section');
  assert.deepEqual(dup.map((e) => e.section), ['execution-sequence', 'development-execution-lanes', 'phase-1']);
  assert.match(dup[0].message, /"Execution Sequence" 2 times \(lines \d+, \d+\)/);
  assert.match(dup[0].message, /reads the first copy and ignores the rest/);
  assert.equal((await readExecutionPlan(twice.dir, SLUG)).exists, false, 'a refused compile writes nothing');

  const prdTwice = await compileProject(t, { planContent: PLAN_LINES.join('\n'), prdContent: '# Orders\n\n## Acceptance Criteria\n| AC | CAP | Observable behavior | Evidence |\n|---|---|---|---|\n| AC-orders-01 | CAP-orders-api | creates | test |\n\n## Acceptance Criteria\n| AC | CAP | Observable behavior | Evidence |\n|---|---|---|---|\n| AC-orders-09 | CAP-orders-api | stale | test |\n' });
  assert.equal(prdTwice.result.ok, true, JSON.stringify(prdTwice.result.errors));
  const prdWarning = prdTwice.result.warnings.find((w) => w.check === 'duplicate_prd_section');
  assert.ok(prdWarning, JSON.stringify(prdTwice.result.warnings));
  assert.match(prdWarning.message, /first copy only/);
});

test('the self-review warning names the knob; budget and role edits keep the graph fresh while live signatures still gate dispatch', async (t) => {
  const sameModel = { ...ROLES, roles: { ...ROLES.roles, qa: { host: 'codex', model: 'gpt-5.6', reasoning_effort: 'high' } } };
  const { dir, env, result } = await compileProject(t, { planContent: PLAN_LINES.join('\n'), roles: sameModel });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  const warning = result.warnings.find((w) => w.check === 'self_review_same_model');
  assert.match(warning.message, /"execution": \{"require_independent_qa": true\} in \.aioson\/config\/execution-roles\.json turns this into a refusal/);

  const rolesFile = path.join(dir, '.aioson', 'config', 'execution-roles.json');
  await fs.writeFile(rolesFile, JSON.stringify({ ...sameModel, execution: { unit_timeout_ms: 0 } }, null, 2));
  let verified = await verifyExecutionPlan(dir, SLUG, { env });
  assert.equal(verified.ok, true, `budget edit: ${verified.issues.join('; ')}`);
  await fs.writeFile(rolesFile, JSON.stringify({ ...sameModel, roles: { ...sameModel.roles, backend_dev: { ...sameModel.roles.backend_dev, reasoning_effort: 'medium' } } }, null, 2));
  verified = await verifyExecutionPlan(dir, SLUG, { env });
  assert.equal(verified.ok, false);
  assert.doesNotMatch(verified.issues.join('\n'), /roles_changed/);
  assert.match(verified.issues.join('\n'), /signature_missing: backend\.dev codex\/gpt-5\.6\/medium/);
});

// ───────────────────────── the signature's unattended write probe ─────────────────────────

function fakeHost(host, { readOnlyScript = 'console.log("OK")', writeScript = 'console.log("OK")' } = {}) {
  const adapter = createAdapter(host, (input) => ['-e', input.sandbox_mode === 'workspace-write' ? writeScript : readOnlyScript]);
  adapter.probe = () => ({ native_subagent: false, fresh_session: false, external_process: true, additional_workspaces: true, model_catalog: false, reasoning_effort: false, executable: process.execPath, source: 'test' });
  return adapter;
}

async function tempStore(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-unattended-sig-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  return { dir, env: { ...process.env, AIOSON_HOST_SIGNATURES: path.join(dir, 'signatures.json') } };
}

const WRITES = `require('fs').writeFileSync(${JSON.stringify(UNATTENDED_PROBE_FILE)}, 'OK'); console.log('DONE')`;

test('host:signature probes the unattended write: a host that writes the file is verified, one that answers without writing is unverified (still valid), one that never exits is blocked (invalid: host_not_unattended)', async (t) => {
  const store = await tempStore(t);
  const verified = await probeHostSignature({ host: 'kimi', model: 'kimi-k3', env: store.env, adapterRegistry: { kimi: fakeHost('kimi', { writeScript: WRITES }) } });
  assert.equal(verified.entry.status, 'valid');
  assert.equal(verified.entry.unattended.yolo.state, 'verified');
  assert.equal(verified.entry.unattended.yolo.wrote, true);
  assert.equal(verified.entry.unattended.yolo.mode, 'yolo');

  const unverified = await probeHostSignature({ host: 'qwen', model: 'qwen3-coder', env: store.env, adapterRegistry: { qwen: fakeHost('qwen') } });
  assert.equal(unverified.entry.status, 'valid', 'answering without editing is a warning, never a block');
  assert.equal(unverified.entry.unattended.yolo.state, 'unverified');
  assert.equal(unverified.entry.unattended.yolo.reason, 'no_file_written');

  const blocked = await probeHostSignature({ host: 'claude', model: 'sonnet', timeout: 300, env: store.env, adapterRegistry: { claude: fakeHost('claude', { writeScript: 'setTimeout(() => {}, 5000)' }) } });
  assert.equal(blocked.entry.status, 'invalid');
  assert.equal(blocked.entry.reason, 'host_not_unattended');
  assert.equal(blocked.entry.unattended.yolo.state, 'blocked');
  assert.equal(blocked.entry.unattended.yolo.reason, 'timeout');
  assert.equal(blocked.entry.probe.exit_code, 0, 'the read-only probe passed: login and model were fine, the write mode was not');

  // A host without a read-only flag is probed without the precaution, never
  // kept out of the lanes for it; its unattended write is probed all the same.
  const opencode = await probeHostSignature({ host: 'opencode', model: 'grok-code-fast', env: store.env, adapterRegistry: { opencode: fakeHost('opencode', { writeScript: WRITES }) } });
  assert.equal(opencode.entry.status, 'valid');
  assert.equal(opencode.entry.probe.sandbox, 'none');
  assert.equal(opencode.entry.unattended.yolo.state, 'verified');
  // A host whose registry has no unattended flag never reaches the write probe.
  const saved = { supports_yolo: TOOL_CAPS.qwen.supports_yolo, yolo_args: TOOL_CAPS.qwen.yolo_args };
  Object.assign(TOOL_CAPS.qwen, { supports_yolo: false, yolo_args: null });
  try {
    const noFlag = await probeHostSignature({ host: 'qwen', model: 'qwen3-coder', env: store.env, adapterRegistry: { qwen: fakeHost('qwen') } });
    assert.equal(noFlag.entry.status, 'invalid');
    assert.equal(noFlag.entry.reason, 'permission_mode_unsupported');
  } finally {
    Object.assign(TOOL_CAPS.qwen, saved);
  }

  // Persisted per mode; a later probe of another mode keeps the first.
  const persisted = await readSignatures({ env: store.env });
  assert.equal(persisted.signatures[signatureKey('kimi', 'kimi-k3', null)].unattended.yolo.state, 'verified');
  const again = await probeHostSignature({ host: 'kimi', model: 'kimi-k3', env: store.env, unattendedProbe: false, adapterRegistry: { kimi: fakeHost('kimi') } });
  assert.equal(again.entry.unattended.yolo.state, 'verified', 'skipping the probe keeps what was proven');
});

test('host:signature command: the probe runs by default and is reported, --unattended-probe=false skips it, --status reports what was proven, and the write probe always uses the unattended argv', async (t) => {
  const store = await tempStore(t);
  const lines = { log: [], error: [] };
  const log = { log: (l) => lines.log.push(String(l)), error: (l) => lines.error.push(String(l)) };
  const seen = [];
  const codex = createAdapter('codex', (input) => { seen.push(input.sandbox_args); return ['-e', input.sandbox_mode === 'workspace-write' ? WRITES : 'console.log("OK")']; });
  codex.probe = () => ({ native_subagent: false, fresh_session: false, external_process: true, additional_workspaces: true, model_catalog: false, reasoning_effort: false, executable: process.execPath, source: 'test' });
  const probed = await runHostSignature({ options: { host: 'codex', model: 'gpt-5.6' }, logger: log, env: store.env, adapterRegistry: { codex } });
  assert.equal(probed.ok, true);
  assert.equal(probed.unattended.state, 'verified');
  assert.match(lines.log[0], /unattended write: verified/);
  assert.deepEqual(seen, [['--sandbox', 'read-only'], ['--dangerously-bypass-approvals-and-sandbox']], 'read-only first, then the unattended flag — never the provider sandbox');

  const skipped = await runHostSignature({ options: { host: 'kimi', model: 'kimi-k3', 'unattended-probe': 'false' }, logger: log, env: store.env, adapterRegistry: { kimi: fakeHost('kimi') } });
  assert.equal(skipped.ok, true);
  assert.equal(skipped.unattended, null);
  assert.match(lines.log[1], /unattended write: not probed/);

  const status = await runHostSignature({ options: { host: 'codex', model: 'gpt-5.6', status: true }, logger: log, env: store.env });
  assert.equal(status.signature.unattended.yolo.state, 'verified');
  assert.match(lines.log[2], /unattended write: verified/);
});
