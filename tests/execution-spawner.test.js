'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const { runExecution: runCommand } = require('../src/commands/execution');
const { runStatePath } = require('../src/agent-execution/execution-run');
const { parseResponse } = require('../src/agent-execution/adapters/spawner');
const { signatureKey, writeSignatures } = require('../src/lib/host-signature');
const { validateExecutionRoles, parseSpawnerCommand, resolveSpawner, SPAWNER_ENV } = require('../src/lib/execution-roles');

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

const PRD = [
  '# Orders',
  '',
  '## Acceptance Criteria',
  '| AC | CAP | Observable behavior | Evidence |',
  '|---|---|---|---|',
  '| AC-orders-01 | CAP-orders-api | POST /orders creates an order | api test |',
  '| AC-orders-02 | CAP-orders-ui | Orders screen lists orders | ui test |',
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

const catalogLoader = async () => ({
  available: true,
  source: 'fixture',
  fetched_at: '2026-08-25',
  models: [{ slug: 'gpt-5.6', display_name: 'GPT-5.6', supported_efforts: ['medium', 'high'] }]
});

/**
 * A fake supervising client. `fake-spawner.js` receives one envelope on stdin
 * (like cockpitctl would), logs it, and either refuses, crashes, or opens a
 * detached "terminal" (`fake-worker.js`) that reads the prompt file, parses
 * the execution contract the engine appended and writes the bound report a
 * little later — exactly what a real terminal session does, minus the model.
 */
const SPAWNER_SCRIPT = String.raw`'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const dir = __dirname;
const config = JSON.parse(fs.readFileSync(path.join(dir, 'fake-spawner-config.json'), 'utf8'));
let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { raw += chunk; });
process.stdin.on('end', () => {
  const envelope = JSON.parse(raw);
  fs.appendFileSync(path.join(dir, 'spawner.log'), JSON.stringify(envelope) + '\n');
  if (envelope.action === 'close') { process.stdout.write(JSON.stringify({ ok: true }) + '\n'); return; }
  const key = envelope.unit + ':' + envelope.role;
  if ((config.fail || []).includes(key)) { process.stdout.write(JSON.stringify({ ok: false, error: 'no free terminal slot' }) + '\n'); return; }
  if ((config.crash || []).includes(key)) { process.stderr.write('boom\n'); process.exitCode = 3; return; }
  const envelopeFile = path.join(dir, 'envelope-' + envelope.unit + '-' + envelope.role + '-' + envelope.attempt_id + '.json');
  fs.writeFileSync(envelopeFile, JSON.stringify(envelope));
  const child = spawn(process.execPath, [path.join(dir, 'fake-worker.js'), envelopeFile], { detached: true, stdio: 'ignore', windowsHide: true });
  child.unref();
  process.stdout.write('opening terminal for ' + key + '\n' + JSON.stringify({ ok: true, session_id: 'sess-' + key, pid: child.pid }) + '\n');
});
`;

const WORKER_SCRIPT = String.raw`'use strict';
const fs = require('fs');
const path = require('path');
const dir = __dirname;
const envelope = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const config = JSON.parse(fs.readFileSync(path.join(dir, 'fake-spawner-config.json'), 'utf8'));
const key = envelope.unit + ':' + envelope.role;
setTimeout(() => {
  if ((config.skip_report || []).includes(key)) return;
  const prompt = fs.readFileSync(path.join(envelope.cwd, envelope.prompt_path), 'utf8');
  const contract = prompt.slice(prompt.indexOf('AIOSON EXECUTION CONTRACT'));
  const get = (name) => { const m = contract.match(new RegExp(name + '=([^,\\n]+)')); return m ? m[1].trim() : undefined; };
  const writableRoots = JSON.parse((contract.match(/writable_roots=(\[[^\n]*\]), started_at/) || [])[1] || '[]');
  const writePaths = JSON.parse((contract.match(/write_paths=(\[[^\n]*?\])\./) || [])[1] || '[]');
  for (const rel of (config.touch && config.touch[key]) || []) {
    const file = path.join(envelope.cwd, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, '// ' + key + '\n');
  }
  const report = {
    version: 1, feature: get('feature'), run_id: get('run_id'), attempt_id: get('attempt_id'), agent: get('agent'), host: get('host'),
    model_requested: get('model_requested'), model_resolved: get('model_resolved'), model_resolution_strategy: get('model_resolution_strategy'),
    manifest_digest: get('manifest_digest'), writable_roots: writableRoots, lane: get('lane'), write_paths: writePaths,
    started_at: new Date().toISOString(), finished_at: new Date().toISOString(), verdict: 'PASS', findings: [], evidence: [key + ' done in a terminal']
  };
  const effort = get('reasoning_effort');
  if (effort && effort !== 'null') report.reasoning_effort = effort;
  const file = path.join(envelope.cwd, envelope.report_path);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(report, null, 2));
}, config.delay_ms || 80);
`;

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

async function setup(t, { roles = ROLES, config = {} } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-execution-spawner-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }).catch(() => {}));
  for (const rel of ['.aioson/context', '.aioson/config', '.aioson/agents', 'src/api', 'src/ui', 'client']) await fs.mkdir(path.join(dir, ...rel.split('/')), { recursive: true });
  await fs.writeFile(path.join(dir, '.aioson', 'context', `implementation-plan-${SLUG}.md`), PLAN, 'utf8');
  await fs.writeFile(path.join(dir, '.aioson', 'context', `prd-${SLUG}.md`), PRD, 'utf8');
  await fs.writeFile(path.join(dir, '.aioson', 'config', 'execution-roles.json'), JSON.stringify(roles, null, 2), 'utf8');
  await fs.copyFile(path.join(ROOT, 'template', '.aioson', 'agents', 'dev.md'), path.join(dir, '.aioson', 'agents', 'dev.md'));
  await fs.copyFile(path.join(ROOT, 'template', '.aioson', 'agents', 'qa.md'), path.join(dir, '.aioson', 'agents', 'qa.md'));
  await fs.writeFile(path.join(dir, 'src', 'app.ts'), 'export const app = 1;\n', 'utf8');
  const client = path.join(dir, 'client');
  await fs.writeFile(path.join(client, 'fake-spawner.js'), SPAWNER_SCRIPT, 'utf8');
  await fs.writeFile(path.join(client, 'fake-worker.js'), WORKER_SCRIPT, 'utf8');
  await fs.writeFile(path.join(client, 'fake-spawner-config.json'), JSON.stringify(config), 'utf8');
  const binDir = path.join(dir, 'fake-bin');
  await fs.mkdir(binDir, { recursive: true });
  for (const bin of ['codex', 'kimi', 'claude']) await fs.writeFile(path.join(binDir, `${bin}.exe`), '', 'utf8');
  const env = { ...process.env, AIOSON_HOST_SIGNATURES: path.join(dir, 'signatures.json') };
  delete env.AIOSON_PLAY;
  delete env[SPAWNER_ENV];
  await writeSignatures({ signatures: ALL_SIGNED }, { env });
  const resolverOptions = { env: { PATH: binDir, Path: binDir }, platform: 'win32' };
  const compiled = await runCommand({ args: [dir], options: { sub: 'compile', feature: SLUG, json: true }, logger, env });
  assert.equal(compiled.ok, true, JSON.stringify(compiled.errors));
  const spawnerCommand = `"${process.execPath}" "${path.join(client, 'fake-spawner.js')}"`;
  return { dir, env, binDir, resolverOptions, client, spawnerCommand, setConfig: (next) => fs.writeFile(path.join(client, 'fake-spawner-config.json'), JSON.stringify(next), 'utf8') };
}

function run(ctx, { events = [], extra = {}, engine = {}, env = {} } = {}) {
  return runCommand({
    args: [ctx.dir],
    options: { sub: 'run', feature: SLUG, json: true, 'bounded-recovery': true, ...extra },
    logger,
    env: { ...ctx.env, [SPAWNER_ENV]: ctx.spawnerCommand, ...env },
    engineOptions: { catalogLoader, resolverOptions: ctx.resolverOptions, gitBaseline: fakeBaseline, progress: (event) => events.push(event), stallMs: 60000, stallCheckMs: 30000, spawnerOptions: { pollMs: 25 }, timeout: 8000, ...engine }
  });
}

async function spawnerLog(ctx) {
  try {
    return (await fs.readFile(path.join(ctx.client, 'spawner.log'), 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

// ───────────────────────── configuration ─────────────────────────

test('execution-roles: the optional execution block (spawner + unit timeout) is validated strictly; the environment spawner wins over the file', () => {
  const ok = validateExecutionRoles({ ...ROLES, execution: { spawner: { command: 'cockpitctl', args: ['unit', 'spawn'] }, unit_timeout_ms: 1800000 } });
  assert.deepEqual(ok, { ok: true, errors: [] });
  const bad = validateExecutionRoles({ ...ROLES, execution: { spawner: { command: '', args: 'unit spawn', token: 'x' }, unit_timeout_ms: 5, extra: true } });
  const byPath = Object.fromEntries(bad.errors.map((error) => [error.path, error.message]));
  assert.match(byPath['$.execution.spawner.command'], /non-empty command/);
  assert.match(byPath['$.execution.spawner.args'], /array of at most 16 strings/);
  assert.match(byPath['$.execution.spawner.token'], /secret fields are forbidden/);
  assert.match(byPath['$.execution.unit_timeout_ms'], /between 60000 and 14400000/);
  assert.match(byPath['$.execution.extra'], /unknown field/);
  assert.match(validateExecutionRoles({ ...ROLES, execution: 'cockpitctl' }).errors[0].message, /must be an object/);

  assert.deepEqual(parseSpawnerCommand('"C:\\Program Files\\cockpit\\cockpitctl.exe" unit spawn'), { command: 'C:\\Program Files\\cockpit\\cockpitctl.exe', args: ['unit', 'spawn'] });
  assert.deepEqual(parseSpawnerCommand('  cockpitctl   unit "spawn now" '), { command: 'cockpitctl', args: ['unit', 'spawn now'] });
  assert.equal(parseSpawnerCommand(''), null);
  assert.equal(parseSpawnerCommand('   '), null);
  const roles = { execution: { spawner: { command: 'cockpitctl', args: ['unit', 'spawn'] }, unit_timeout_ms: null } };
  assert.deepEqual(resolveSpawner({ roles, env: {} }), { command: 'cockpitctl', args: ['unit', 'spawn'], source: 'roles' });
  assert.deepEqual(resolveSpawner({ roles, env: { [SPAWNER_ENV]: 'play-spawn --tab' } }), { command: 'play-spawn', args: ['--tab'], source: 'env' });
  assert.equal(resolveSpawner({ roles: { execution: { spawner: null } }, env: {} }), null);
  assert.equal(resolveSpawner({ roles: null, env: {} }), null);
  assert.deepEqual(parseResponse('opening terminal\n{"ok":true,"session_id":"s1"}\n'), { ok: true, session_id: 's1' });
  assert.equal(parseResponse('nothing structured'), null);
});

test('execution:offer reports the client seam — spawner_supported, the spawner in force and its source', async (t) => {
  const ctx = await setup(t, { roles: { ...ROLES, execution: { spawner: { command: 'cockpitctl', args: ['unit', 'spawn'] }, unit_timeout_ms: 900000 } } });
  let offer = await runCommand({ args: [ctx.dir], options: { sub: 'offer', json: true }, logger, env: ctx.env });
  assert.equal(offer.available, true);
  assert.deepEqual(offer.execution, { spawner_supported: true, spawner: { configured: true, source: 'roles', command: 'cockpitctl', args: ['unit', 'spawn'] }, unit_timeout_ms: 900000 });
  offer = await runCommand({ args: [ctx.dir], options: { sub: 'offer', json: true }, logger, env: { ...ctx.env, [SPAWNER_ENV]: '"C:\\cockpit\\cockpitctl.exe" unit spawn' } });
  assert.deepEqual(offer.execution.spawner, { configured: true, source: 'env', command: 'C:\\cockpit\\cockpitctl.exe', args: ['unit', 'spawn'] });
  const plain = await setup(t);
  offer = await runCommand({ args: [plain.dir], options: { sub: 'offer', json: true }, logger, env: plain.env });
  assert.deepEqual(offer.execution, { spawner_supported: true, spawner: { configured: false, source: null, command: null, args: [] }, unit_timeout_ms: null });
});

// ───────────────────────── the seam at work ─────────────────────────

test('with a spawner in force the engine hands every unit to the client as an envelope, waits for the bound report the client\'s terminal writes, and records the session per unit', async (t) => {
  const ctx = await setup(t, { config: { delay_ms: 60, touch: { 'phase-1:dev': ['src/api/orders.ts'], 'phase-2:dev': ['src/ui/Orders.tsx'] } } });
  const events = [];
  const result = await run(ctx, { events });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.status, 'completed');
  assert.deepEqual(result.summary.units, { total: 3, lane: 2, integration: 1, passed: 2, pending: 0, running: 0, skipped: 0, decision_required: 0, qa_passed: 2, qa_failed: 0, qa_skipped: 0 });

  const log = await spawnerLog(ctx);
  const spawns = log.filter((e) => e.action === 'spawn');
  assert.deepEqual(spawns.map((e) => `${e.unit}:${e.role}`).sort(), ['phase-1:dev', 'phase-1:qa', 'phase-2:dev', 'phase-2:qa']);
  assert.equal(log.filter((e) => e.action === 'close').length, 0, 'a unit that reported is never closed by the engine');
  const backendDev = spawns.find((e) => e.unit === 'phase-1' && e.role === 'dev');
  assert.equal(backendDev.version, 1);
  assert.equal(backendDev.feature, SLUG);
  assert.equal(backendDev.run_id, result.run_id);
  assert.match(backendDev.attempt_id, /^[0-9a-f-]{36}$/);
  assert.equal(backendDev.lane, 'backend');
  assert.equal(backendDev.wave, 1);
  assert.equal(backendDev.host, 'codex');
  assert.equal(backendDev.model, 'gpt-5.6');
  assert.equal(backendDev.reasoning_effort, 'high');
  assert.equal(backendDev.cwd, ctx.dir);
  assert.equal(backendDev.prompt_path, `.aioson/context/reports/${SLUG}/${result.run_id}/phase-1.prompt.md`);
  assert.equal(backendDev.report_path, `.aioson/context/reports/${SLUG}/${result.run_id}/phase-1.json`);
  assert.deepEqual(backendDev.write_paths, ['src/api/**']);
  assert.equal(backendDev.command, 'codex', 'the argv the engine would have used is the reference for a client that prefers a non-interactive run');
  // The reference argv is the unattended one the registry declares for the
  // host — never the provider's sandboxed write that asks for approvals.
  assert.ok(Array.isArray(backendDev.args) && backendDev.args.includes('--dangerously-bypass-approvals-and-sandbox'));
  assert.equal(backendDev.args.includes('workspace-write'), false);
  assert.equal(typeof backendDev.prompt_stdin, 'boolean');
  assert.equal(backendDev.timeout_ms, 8000);
  assert.equal(backendDev.sandbox_mode, 'workspace-write');
  for (const key of Object.keys(backendDev)) assert.doesNotMatch(key, /token|secret|password/i);
  const qaSpawn = spawns.find((e) => e.unit === 'phase-1' && e.role === 'qa');
  assert.equal(qaSpawn.host, 'claude');
  assert.equal(qaSpawn.report_path, `.aioson/context/reports/${SLUG}/${result.run_id}/phase-1-qa.json`);
  assert.equal(qaSpawn.prompt_path, `.aioson/context/reports/${SLUG}/${result.run_id}/phase-1-qa.prompt.md`);

  const prompt = await fs.readFile(path.join(ctx.dir, backendDev.prompt_path), 'utf8');
  assert.match(prompt, /# Unit contract — orders \/ phase-1/);
  assert.match(prompt, /AIOSON EXECUTION CONTRACT/);
  const qaPrompt = await fs.readFile(path.join(ctx.dir, qaSpawn.prompt_path), 'utf8');
  assert.match(qaPrompt, /# Unit under review — orders \/ phase-1/);

  const state = JSON.parse(await fs.readFile(runStatePath(ctx.dir, SLUG), 'utf8'));
  assert.deepEqual(state.spawner, { command: process.execPath, args: [path.join(ctx.client, 'fake-spawner.js')], source: 'env', unit_timeout_ms: 8000 });
  assert.equal(state.units['phase-1'].dev.session_id, 'sess-phase-1:dev');
  assert.equal(state.units['phase-1'].qa.session_id, 'sess-phase-1:qa');
  assert.equal(state.units['phase-2'].dev.session_id, 'sess-phase-2:dev');
  assert.equal(state.units['phase-1'].dev.verdict, 'PASS');
  const report = JSON.parse(await fs.readFile(path.join(ctx.dir, backendDev.report_path), 'utf8'));
  assert.equal(report.attempt_id, backendDev.attempt_id, 'the report the terminal wrote is bound to the attempt the envelope named');
  assert.deepEqual(state.findings, [], 'the files the terminals touched belong to their units');

  const status = await runCommand({ args: [ctx.dir], options: { sub: 'status', feature: SLUG, json: true }, logger, env: ctx.env });
  assert.equal(status.spawner.source, 'env');
  assert.equal(status.units.find((u) => u.id === 'phase-2').dev.session_id, 'sess-phase-2:dev');
  const started = events.find((e) => e.type === 'run' && e.status === 'started');
  assert.equal(started.spawner, process.execPath);
});

test('a client that refuses, crashes or never reports leaves the same decision_required as a host that cannot run; the engine asks the client to close a timed-out session; retry after a fix resumes through the seam', async (t) => {
  const ctx = await setup(t, { config: { delay_ms: 40, fail: ['phase-2:dev'], crash: ['phase-1:qa'] } });
  let result = await run(ctx);
  assert.equal(result.status, 'decision_required');
  const reasons = Object.fromEntries(result.decisions_pending.map((d) => [`${d.unit}:${d.stage}`, d.reason]));
  assert.deepEqual(reasons, { 'phase-1:qa': 'spawner_failed', 'phase-2:dev': 'spawner_failed' });
  let state = JSON.parse(await fs.readFile(runStatePath(ctx.dir, SLUG), 'utf8'));
  assert.match(state.units['phase-2'].dev.error, /no free terminal slot/);
  assert.match(state.units['phase-1'].qa.error, /boom/);
  assert.equal(state.units['phase-1'].dev.verdict, 'PASS', 'the implementer terminal finished before its reviewer was refused');

  await ctx.setConfig({ delay_ms: 40 });
  assert.equal((await runCommand({ args: [ctx.dir], options: { sub: 'decide', feature: SLUG, unit: 'phase-2', choice: 'retry', json: true }, logger, env: ctx.env })).ok, true);
  assert.equal((await runCommand({ args: [ctx.dir], options: { sub: 'decide', feature: SLUG, unit: 'phase-1', choice: 'retry', json: true }, logger, env: ctx.env })).ok, true);
  result = await run(ctx, { extra: { resume: true } });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.status, 'completed');
  const spawns = (await spawnerLog(ctx)).filter((e) => e.action === 'spawn');
  assert.equal(spawns.filter((e) => e.unit === 'phase-2' && e.role === 'dev').length, 2, 'the retried unit was handed to the client again with a new attempt');
  assert.equal(spawns.filter((e) => e.unit === 'phase-1' && e.role === 'dev').length, 1, 'a passed implementer is never re-spawned');
  state = JSON.parse(await fs.readFile(runStatePath(ctx.dir, SLUG), 'utf8'));
  assert.equal(state.units['phase-2'].qa.status, 'passed');

  // Never reporting: the unit budget elapses, the engine records a timeout and asks the client to close that session.
  const silent = await setup(t, { config: { delay_ms: 40, skip_report: ['phase-1:dev'] } });
  result = await run(silent, { engine: { timeout: 400 } });
  assert.equal(result.status, 'decision_required');
  assert.deepEqual(result.decisions_pending.map((d) => [d.unit, d.stage, d.reason]), [['phase-1', 'dev', 'timeout']]);
  const log = await spawnerLog(silent);
  const closed = log.find((e) => e.action === 'close');
  assert.ok(closed, 'the engine asked the client to close the session');
  assert.equal(closed.reason, 'timeout');
  assert.equal(closed.session_id, 'sess-phase-1:dev');
  assert.equal(closed.unit, 'phase-1');
  assert.equal(closed.role, 'dev');
  state = JSON.parse(await fs.readFile(runStatePath(silent.dir, SLUG), 'utf8'));
  assert.equal(state.units['phase-1'].dev.session_id, 'sess-phase-1:dev');
  assert.equal(state.units['phase-2'].qa.status, 'passed', 'the other unit went through its terminal');
});

test('preflight refuses a spawner that is not resolvable, and the roles file is the project default when the environment says nothing', async (t) => {
  const ctx = await setup(t);
  let result = await run(ctx, { extra: { preflight: true }, env: { [SPAWNER_ENV]: '"C:\\nowhere\\cockpitctl.exe" unit spawn' } });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'preflight_failed');
  assert.match(result.preflight.issues.join('\n'), /spawner: spawner_not_found/);
  assert.deepEqual(result.preflight.spawner, { command: 'C:\\nowhere\\cockpitctl.exe', source: 'env' });

  result = await run(ctx, { extra: { preflight: true } });
  assert.equal(result.ok, true, JSON.stringify(result.preflight));
  assert.deepEqual(result.preflight.checks.map((c) => c.id), ['plan', 'manifest', 'host:claude', 'host:codex', 'host:kimi', 'units', 'spawner']);
  assert.equal(result.preflight.spawner.source, 'env');

  const viaRoles = await setup(t, { roles: { ...ROLES, execution: { spawner: { command: process.execPath, args: [path.join(ctx.client, 'fake-spawner.js')] }, unit_timeout_ms: 120000 } } });
  await fs.writeFile(path.join(viaRoles.client, 'fake-spawner-config.json'), JSON.stringify({ delay_ms: 40 }));
  await fs.copyFile(path.join(viaRoles.client, 'fake-spawner.js'), path.join(ctx.client, 'fake-spawner.js'));
  result = await runCommand({
    args: [viaRoles.dir],
    options: { sub: 'run', feature: SLUG, json: true, preflight: true },
    logger,
    env: viaRoles.env,
    engineOptions: { catalogLoader, resolverOptions: viaRoles.resolverOptions }
  });
  assert.equal(result.ok, true, JSON.stringify(result.preflight));
  assert.equal(result.preflight.spawner.source, 'roles');

  const plain = await run(ctx, { extra: { preflight: true }, env: { [SPAWNER_ENV]: '' } });
  assert.deepEqual(plain.preflight.checks.map((c) => c.id), ['plan', 'manifest', 'host:claude', 'host:codex', 'host:kimi', 'units'], 'no spawner, no check — the engine spawns the hosts itself');
  assert.equal(plain.preflight.spawner, null);
});

test('a client that cannot even be launched reports the real cause, not a dead-zone ReferenceError', async () => {
  // A sandbox that refuses to create the process makes `spawn` throw
  // synchronously — before any timeout exists. The failure has to arrive as
  // `spawner_failed` carrying the launcher's own message.
  const { runSpawner } = require('../src/agent-execution/adapters/spawner');
  const spawnImpl = () => { throw new Error('EPERM: sandbox refused to create the process'); };
  const result = await runSpawner(
    { command: process.execPath, args: [] },
    { version: 1, action: 'spawn' },
    { cwd: process.cwd(), spawnImpl }
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'spawner_failed');
  assert.match(result.error, /sandbox refused to create the process/);
  assert.doesNotMatch(result.error, /before initialization/);
});
