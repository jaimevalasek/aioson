'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createRecoveryController } = require('../src/execution-dashboard/recovery');
const { createExecutionDashboard, presentRecovery } = require('../src/execution-dashboard/server');

test('recovery banner follows the live engine instead of a stale recovery failure', () => {
  const run = { run_id: 'run-1', status: 'running' };
  const failed = { busy: false, phase: 'failed', message: 'Falha antiga.' };
  assert.equal(presentRecovery({ run, engine: { alive: true } }, failed).visible, false);
  assert.equal(presentRecovery({ run, engine: { alive: false } }, failed).visible, true);
  assert.equal(presentRecovery({ run: { ...run, status: 'completed' }, engine: { alive: false } }, failed).visible, false);
  assert.equal(presentRecovery({ run, engine: { alive: false }, archived: true }, failed).visible, false);
});

test('recovery uses only retry, binds the run, serializes clicks and waits for remaining decisions', async () => {
  const calls = [], launches = [];
  let pending = [{ unit: 'backend' }, { unit: 'frontend' }], finish;
  const controller = createRecoveryController('/project', {
    status: async () => ({ run: { run_id: 'run-1', status: 'decision_required' }, engine: { alive: false }, decisions_pending: pending }),
    decide: async args => { calls.push(args); pending = pending.filter(row => row.unit !== args.unit); return { ok: true }; },
    launch: async args => { launches.push(args); finish = args.onFinish; return { pid: 123 }; }
  });
  assert.equal((await controller.recover('feature', { run_id: 'old' })).code, 409);
  assert.equal((await controller.recover('feature', { run_id: 'run-1', choice: 'skip' })).code, 400);
  assert.equal(calls.length, 0);
  assert.equal((await controller.recover('feature', { run_id: 'run-1', unit: 'backend' })).data.status, 'other_decisions_pending');
  assert.equal(launches.length, 0);
  const result = await controller.recover('feature', { run_id: 'run-1' });
  assert.equal(result.code, 202);
  assert.equal(result.data.status, 'starting');
  assert.equal(launches[0].runId, 'run-1');
  assert.ok(calls.every(call => call.choice === 'retry' && call.expectedRunId === 'run-1'));
  assert.equal((await controller.recover('feature', { run_id: 'run-1' })).code, 409);
  finish(1);
  assert.equal(controller.status('feature', { run: { run_id: 'run-1' } }).busy, false);
  assert.equal(controller.status('feature', { run: { run_id: 'run-1' } }).phase, 'failed');
  assert.deepEqual(controller.status('feature', { run: { run_id: 'run-1' }, engine: { alive: true } }), { busy: false }, 'a live engine clears a stale finished recovery job');
});

test('active/finished runs and refused decisions cannot launch a recovery', async () => {
  for (const mode of ['active', 'completed', 'decision_refused']) {
    let launched = false;
    const controller = createRecoveryController('/project', {
      status: async () => ({ run: { run_id: 'run-1', status: mode === 'completed' ? 'completed' : 'decision_required' }, engine: { alive: mode === 'active' }, decisions_pending: [{ unit: 'unit' }] }),
      decide: async () => ({ ok: false, reason: 'run_changed' }),
      launch: async () => { launched = true; }
    });
    assert.equal((await controller.recover('feature', { run_id: 'run-1' })).code, 409);
    assert.equal(launched, false);
  }
});

test('supervisor maintenance is visible while its lease is live and cannot launch a competing executor', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dashboard-maintenance-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const lock = path.join(dir, '.aioson/context/agent-execution-state-example.json.lock');
  await fs.mkdir(path.dirname(lock), { recursive: true });
  const snapshot = { run: { run_id: 'run-1', status: 'paused', reason: 'supervisor_contract_repair' }, engine: { alive: false }, decisions_pending: [] };
  let launches = 0;
  const controller = createRecoveryController(dir, { status: async () => snapshot, launch: async () => { launches++; return { pid: 123 }; } });
  await fs.writeFile(lock, JSON.stringify({ owner: 'maintenance-owner', expires_at: Date.now() + 30000 }));
  assert.equal(controller.status('example', snapshot).phase, 'maintenance');
  assert.match(controller.status('example', snapshot).message, /nenhuma confirmação/);
  assert.equal((await controller.recover('example', { run_id: 'run-1' })).code, 409);
  assert.equal(launches, 0);
  await fs.writeFile(lock, JSON.stringify({ owner: 'maintenance-owner', expires_at: 0 }));
  assert.equal(controller.status('example', snapshot).busy, false);
  assert.equal((await controller.recover('example', { run_id: 'run-1' })).code, 202);
  assert.equal(launches, 1);
});

test('watchdog resumes only a previously observed continuous run after its exact engine process dies', async () => {
  let snapshot = { run: { run_id: 'run-1', status: 'running' }, until_complete: true, engine: { alive: false, pid: 123 }, decisions_pending: [] };
  const launches = [];
  let alive = false;
  const controller = createRecoveryController('/project', { status: async () => snapshot, isProcessAlive: () => alive, launch: async args => { launches.push(args); return { pid: 456 }; } });
  await controller.observe('example', snapshot);
  assert.equal(launches.length, 0, 'opening history does not execute it');
  snapshot.engine.alive = true;
  await controller.observe('example', snapshot);
  snapshot.engine.alive = false;
  alive = true;
  await controller.observe('example', snapshot);
  assert.equal(launches.length, 0, 'a slow live engine is not killed or duplicated');
  alive = false;
  const result = await controller.observe('example', snapshot);
  assert.equal(result.code, 202);
  assert.equal(launches[0].runId, 'run-1');
  await controller.observe('example', snapshot);
  assert.equal(launches.length, 1, 'starting recovery is serialized');
});

test('watchdog preserves explicit pauses, bounded runs, decisions, changed runs and archived history', async () => {
  for (const change of [{ run: { run_id: 'run-1', status: 'paused' } }, { until_complete: false }, { decisions_pending: [{ unit: 'backend', reason: 'capacity' }] }, { run: { run_id: 'run-2', status: 'running' } }, { archived: true }, { engine: { alive: false, pid: 999 } }]) {
    const live = { run: { run_id: 'run-1', status: 'running' }, until_complete: true, engine: { alive: true, pid: 123 }, decisions_pending: [] };
    const controller = createRecoveryController('/project', { isProcessAlive: () => false, launch: async () => assert.fail('unexpected launch') });
    await controller.observe('example', live);
    assert.equal(await controller.observe('example', { ...live, engine: { alive: false, pid: 123 }, ...change }), undefined);
  }
});

test('dashboard watches an active approved run and requests crash recovery without a browser click', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dashboard-watchdog-'));
  const context = path.join(dir, '.aioson/context');
  await fs.mkdir(context, { recursive: true });
  const file = path.join(context, 'execution-state-example.json');
  const state = { version: 1, feature: 'example', run_id: 'run-1', status: 'running', until_complete: true, units: {}, waves: [], findings: [], decisions: [], engine: { pid: 123, heartbeat_ms: 15000, heartbeat_at: new Date().toISOString() } };
  await fs.writeFile(file, JSON.stringify(state));
  const launches = [];
  const controller = createRecoveryController(dir, { isProcessAlive: () => false, launch: async args => { launches.push(args); return { pid: 456 }; } });
  let observations = 0;
  const original = controller.observe.bind(controller);
  controller.observe = async (...args) => { await original(...args); observations++; };
  const dashboard = createExecutionDashboard(dir, { port: 0, recoveryController: controller, recoveryPollMs: 250 });
  t.after(async () => { await dashboard.stop(); await fs.rm(dir, { recursive: true, force: true }); });
  await dashboard.start();
  const waitFor = async predicate => { for (let i = 0; i < 100 && !predicate(); i++) await new Promise(resolve => setTimeout(resolve, 25)); assert.ok(predicate()); };
  await waitFor(() => observations > 0);
  assert.equal(launches.length, 0);
  state.engine.heartbeat_at = '2020-01-01T00:00:00.000Z';
  await fs.writeFile(file, JSON.stringify(state));
  await waitFor(() => launches.length === 1);
  assert.equal(launches[0].runId, 'run-1');
  await dashboard.stop();
  const stoppedAt = observations;
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.equal(observations, stoppedAt);
});

test('HTTP recovery requires same origin, action token, JSON and bounded payload; other writes remain forbidden', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dashboard-recovery-'));
  let calls = 0;
  const recoveryController = { status: () => ({ busy: false }), recover: async (feature, data) => { calls++; assert.equal(feature, 'example'); assert.equal(data.run_id, 'run-1'); return { code: 202, data: { status: 'starting' } }; } };
  const dashboard = createExecutionDashboard(dir, { port: 0, recoveryController });
  t.after(async () => { await dashboard.stop(); await fs.rm(dir, { recursive: true, force: true }); });
  const info = await dashboard.start(), base = new URL(info.url).origin;
  const token = (await (await fetch(base + '/api/features')).json()).action_token;
  const post = (headers, body = '{"run_id":"run-1"}', suffix = 'example/recover') => fetch(`${base}/api/features/${suffix}`, { method: 'POST', headers, body });
  const valid = { Origin: base, 'Content-Type': 'application/json', 'X-Aioson-Action': token };
  assert.equal((await post({ ...valid, Origin: 'https://attacker.example' })).status, 403);
  assert.equal((await post({ ...valid, 'X-Aioson-Action': 'wrong' })).status, 403);
  assert.equal((await post({ ...valid, 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await post(valid, 'x'.repeat(5000))).status, 413);
  assert.equal((await post(valid, '{')).status, 400);
  assert.equal((await post(valid, '{}', '%2e%2e%2fsecret/recover')).status, 400);
  assert.equal(calls, 0);
  assert.equal((await post(valid)).status, 202);
  assert.equal(calls, 1);
  assert.equal((await post(valid, '{}', 'example/status')).status, 405);
});

test('browser recovery click sends one bound request, disables duplicate actions and displays later failure', { skip: !process.env.AIOSON_TEST_BROWSER_PROJECT }, async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dashboard-recovery-browser-'));
  const context = path.join(dir, '.aioson/context');
  await fs.mkdir(context, { recursive: true });
  const at = new Date().toISOString();
  const unit = { id: 'backend', lane: 'backend', wave: 1, status: 'decision_required', dev: { status: 'crashed', reason: 'report_binding_invalid' }, qa: { status: 'pending' }, pending_decision: { stage: 'dev', reason: 'report_binding_invalid', kind: 'crashed', choices: ['retry'] } };
  const state = { version: 1, run_id: 'run-1', status: 'decision_required', current_wave: 1, started_at: at, updated_at: at, units: { backend: unit }, findings: [], decisions: [], waves: [{ wave: 1, status: 'decision_required', units: ['backend'] }], integration: { owner: 'dev', units: [] } };
  const plan = { lanes: { backend: { dev: { host: 'codex', model: 'gpt-5.6-sol' }, qa: { host: 'codex', model: 'gpt-6-astra' } } }, parallel: { max_concurrent_lanes: 2 }, units: [{ id: 'backend', lane: 'backend', wave: 1, depends_on: [] }] };
  await fs.writeFile(path.join(context, 'execution-state-example.json'), JSON.stringify(state));
  await fs.writeFile(path.join(context, 'execution-plan-example.json'), JSON.stringify(plan));
  let requests = 0, job = { busy: false };
  const controller = {
    status: () => job,
    recover: async (feature, payload) => {
      requests++; assert.equal(feature, 'example'); assert.deepEqual(payload, { run_id: 'run-1' });
      job = { busy: true, phase: 'starting', message: 'Executor iniciado; aguardando atividade.' };
      return { code: 202, data: { status: 'starting', message: job.message } };
    }
  };
  const dashboard = createExecutionDashboard(dir, { port: 0, feature: 'example', recoveryController: controller });
  const info = await dashboard.start();
  const { openBrowser } = require('../src/lib/browser-session');
  const browser = await openBrowser({ projectDir: process.env.AIOSON_TEST_BROWSER_PROJECT, env: {}, config: {}, channel: 'msedge', headless: true, viewport: { width: 1280, height: 900 } });
  t.after(async () => { if (browser.ok) await browser.close(); await dashboard.stop(); await fs.rm(dir, { recursive: true, force: true }); });
  assert.ok(browser.ok);
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(info.url);
  await page.locator('#recover-run').waitFor({ state: 'visible' });
  assert.match(await page.locator('#recovery-title').textContent(), /Execução interrompida/);
  const actionStyle = await page.locator('#recover-run').evaluate(node => ({ height: node.getBoundingClientRect().height, background: globalThis.getComputedStyle(node).backgroundColor }));
  assert.ok(actionStyle.height >= 48);
  assert.equal(actionStyle.background, 'rgb(245, 185, 66)');
  await page.locator('#recover-run').click();
  await page.waitForFunction(() => globalThis.document.querySelector('#recovery-feedback').textContent.includes('Executor iniciado'));
  assert.equal(requests, 1);
  assert.equal(await page.locator('#recover-run').isDisabled(), true);
  job = { busy: false, phase: 'failed', message: 'Falha posterior: confira as pendências.' };
  await page.locator('#refresh').click();
  await page.waitForFunction(() => globalThis.document.querySelector('#recovery-feedback').textContent.includes('Falha posterior'));
  assert.equal(await page.locator('#recover-run').isEnabled(), true);
  assert.equal(requests, 1);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => globalThis.document.documentElement.scrollWidth > globalThis.innerWidth + 1), false);
  assert.deepEqual(errors, []);
});
