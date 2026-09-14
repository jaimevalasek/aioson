'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawnSync, spawn } = require('node:child_process');
const { currentActivity, observeExecution } = require('../src/agent-execution/execution-observation');
const { renderMonitor } = require('../src/agent-execution/execution-terminal');
const { createStallWatch } = require('../src/agent-execution/execution-run');
const { createExecutionDashboard, snapshot, readReport, listFeatures } = require('../src/execution-dashboard/server');
const { runExecution } = require('../src/commands/execution');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));


test('automatic dashboard port avoids collision while an explicit port remains strict', async t => {
  const dir = await temporary(t);
  const first = createExecutionDashboard(dir, { port: 0 });
  const started = await first.start();
  t.after(() => first.stop());
  const second = createExecutionDashboard(dir, { port: started.port, autoPort: true });
  const next = await second.start();
  t.after(() => second.stop());
  assert.notEqual(next.port, started.port);
  const explicit = createExecutionDashboard(dir, { port: started.port });
  await assert.rejects(explicit.start(), { code: 'EADDRINUSE' });
  assert.equal((await fetch(next.url)).status, 200);
});

test('archived orchestration stays discoverable without reviving its engine or changing files', async t => {
  const ctx = await fixture(t);
  const archive = path.join(ctx.context, 'done/example');
  await fs.mkdir(archive, { recursive: true });
  for (const prefix of ['execution-plan', 'execution-state']) await fs.rename(path.join(ctx.context, `${prefix}-example.json`), path.join(archive, `${prefix}-example.json`));
  const before = await fs.readFile(path.join(archive, 'execution-state-example.json'), 'utf8');
  const rows = await listFeatures(ctx.dir);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].archived, true);
  const historical = await snapshot(ctx.dir, 'example');
  assert.equal(historical.archived, true);
  assert.equal(historical.engine.alive, false);
  assert.deepEqual(historical.running, []);
  assert.equal(historical.resume_command, null);
  assert.equal((await snapshot(ctx.dir, 'example')).metrics.agent_ms, historical.metrics.agent_ms, 'archived running timestamps stay frozen');
  assert.equal(await fs.readFile(path.join(archive, 'execution-state-example.json'), 'utf8'), before);
});

test('dashboards isolate two projects with the same feature identifier', async t => {
  const first = await fixture(t);
  const second = await fixture(t);
  first.state.run_id = 'project-a-run';
  second.state.run_id = 'project-b-run';
  await fs.writeFile(first.file, JSON.stringify(first.state));
  await fs.writeFile(second.file, JSON.stringify(second.state));
  const a = createExecutionDashboard(first.dir, { port: 0 });
  const b = createExecutionDashboard(second.dir, { port: 0 });
  t.after(() => a.stop());
  t.after(() => b.stop());
  const one = await a.start();
  const two = await b.start();
  assert.notEqual(one.port, two.port);
  const read = async (base, endpoint) => (await fetch(new URL(endpoint, base))).json();
  assert.equal((await read(one.url, '/api/features/example/status')).run.run_id, 'project-a-run');
  assert.equal((await read(two.url, '/api/features/example/status')).run.run_id, 'project-b-run');
  await fs.unlink(first.file);
  assert.equal((await read(one.url, '/api/features/example/status')).run, null);
  assert.equal((await read(two.url, '/api/features/example/status')).run.run_id, 'project-b-run');
});

test('archive refuses project escapes and only serves ledger-bound archived reports', async t => {
  const ctx = await fixture(t);
  const archive = path.join(ctx.context, 'done/example');
  await fs.mkdir(path.join(archive, 'reports'), { recursive: true });
  ctx.state.units.catalog.qa.report = '.aioson/context/done/example/reports/qa.json';
  await fs.writeFile(ctx.file, JSON.stringify(ctx.state));
  await fs.writeFile(path.join(archive, 'reports/qa.json'), JSON.stringify({ verdict: 'FAIL' }));
  for (const prefix of ['execution-plan', 'execution-state']) await fs.rename(path.join(ctx.context, `${prefix}-example.json`), path.join(archive, `${prefix}-example.json`));
  assert.equal((await readReport(ctx.dir, 'example', 'catalog', 'qa')).code, 200);
  const outside = await temporary(t);
  await fs.writeFile(path.join(outside, 'execution-plan-escape.json'), '{}');
  await fs.symlink(outside, path.join(ctx.context, 'done/escape'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(snapshot(ctx.dir, 'escape'), /outside the project/);
});

async function temporary(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-monitor-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}

async function fixture(t) {
  const dir = await temporary(t);
  const context = path.join(dir, '.aioson/context');
  await fs.mkdir(context, { recursive: true });
  const at = new Date().toISOString();
  const units = {
    catalog: { id: 'catalog', owner: 'lane', wave: 1, lane: 'backend', status: 'passed', dev: { status: 'passed', host: 'antigravity', model: 'gemini', started_at: at, finished_at: at }, qa: { status: 'failed', host: 'codex', model: 'astra', started_at: at, finished_at: at, findings: [{ severity: 'high', summary: '<img src=x onerror=alert(1)> Evidence' }] } },
    layers: { id: 'layers', owner: 'lane', wave: 1, lane: 'backend', status: 'running', dev: { status: 'running', host: 'antigravity', model: 'gemini', started_at: at }, qa: { status: 'pending' } },
    frontend: { id: 'frontend', owner: 'lane', wave: 1, lane: 'frontend', status: 'pending', dev: { status: 'pending' }, qa: { status: 'pending' } },
    later: { id: 'later', owner: 'lane', wave: 2, lane: 'frontend', status: 'pending', dev: { status: 'pending' }, qa: { status: 'pending' }, invalidations: [{ at, producer: 'catalog', consumer: 'later', paths: ['src/catalog.js'] }] }
  };
  const state = { version: 1, run_id: 'run-1', status: 'running', current_wave: 1, started_at: at, updated_at: at, units, findings: [], decisions: [], waves: [{ wave: 1, status: 'running', units: ['catalog', 'layers', 'frontend'] }, { wave: 2, status: 'pending', units: ['later'] }], engine: { heartbeat_at: at, heartbeat_ms: 15000, pid: process.pid }, integration: { owner: 'dev', units: [] } };
  const plan = { lanes: { backend: { dev: { host: 'antigravity', model: 'gemini' }, qa: { host: 'codex', model: 'astra' } }, frontend: { dev: { host: 'codex', model: 'sol' }, qa: { host: 'codex', model: 'astra' } } }, parallel: { max_concurrent_lanes: 2 }, units: Object.values(units).map((unit, index) => ({ id: unit.id, phase: `${index + 1}-${unit.id}`, phase_number: String(index + 1), lane: unit.lane, owner: unit.owner, scope: `Escopo ${unit.id}`, files: [`src/${unit.id}.js`], depends_on: [] })) };
  const file = path.join(context, 'execution-state-example.json');
  await fs.writeFile(file, JSON.stringify(state));
  await fs.writeFile(path.join(context, 'execution-plan-example.json'), JSON.stringify(plan));
  return { dir, context, file, state, plan };
}

test('read-only observation distinguishes DEV success, QA failure, queue capacity and wave dependencies', async t => {
  const ctx = await fixture(t);
  const before = await fs.readFile(ctx.file, 'utf8');
  const status = await snapshot(ctx.dir, 'example');
  assert.equal(status.observation.counts.dev_passed, 1);
  assert.equal(status.observation.counts.accepted, 0);
  assert.equal(status.observation.counts.qa_failed, 1);
  assert.equal(status.observation.counts.findings, 1);
  assert.equal(status.observation.waiting.find(item => item.unit === 'frontend').reason, 'capacity');
  assert.equal(status.observation.waiting.find(item => item.unit === 'later').reason, 'previous_wave');
  assert.deepEqual(status.running.map(item => item.unit), ['layers']);
  assert.equal(status.observation.assignments[0].active[0].matches, true);
  assert.equal(status.units.find(unit => unit.id === 'catalog').phase, '1-catalog');
  assert.equal(status.units.find(unit => unit.id === 'catalog').scope, 'Escopo catalog');
  assert.deepEqual(status.units.find(unit => unit.id === 'later').invalidation, { count: 1, at: ctx.state.units.later.invalidations[0].at, producer: 'catalog', consumer: 'later', paths: ['src/catalog.js'] });
  assert.equal(status.metrics.waves[0].units.find(unit => unit.id === 'catalog').file_count, 1);
  const changed = structuredClone(status);
  changed.running[0].model = 'fallback-model';
  assert.equal(observeExecution(changed, ctx.plan).assignments[0].active[0].matches, false);
  changed.engine.alive = false;
  assert.equal(observeExecution(changed, ctx.plan).waiting[0].reason, 'engine_missing');
  assert.equal(await fs.readFile(ctx.file, 'utf8'), before);
  assert.deepEqual((await fs.readdir(path.join(ctx.dir, '.aioson'))).sort(), ['context'], 'monitor never creates a runtime database or lock');
});

test('paused and stale engines do not count interrupted worker records as active processes', async t => {
  const ctx = await fixture(t);
  for (const mode of ['paused', 'stale']) {
    ctx.state.status = mode === 'paused' ? 'paused' : 'running';
    ctx.state.engine.heartbeat_at = mode === 'paused' ? new Date().toISOString() : '2020-01-01T00:00:00.000Z';
    await fs.writeFile(ctx.file, JSON.stringify(ctx.state));
    const status = await snapshot(ctx.dir, 'example');
    assert.deepEqual(status.running, []);
    assert.equal(status.observation.concurrency.active, 0);
    assert.ok(status.observation.assignments.every(role => role.active.length === 0));
    assert.equal(status.units.find(unit => unit.id === 'layers').dev.status, 'running', 'historical record stays available for official resume');
  }
});

test('terminal fits narrow windows, omits active-engine resume, and makes failed QA visible', async t => {
  const ctx = await fixture(t);
  const status = await snapshot(ctx.dir, 'example');
  status.units[1].id = 'long-'.repeat(40);
  for (const columns of [32, 65, 80, 120]) {
    const lines = renderMonitor(status, { columns });
    assert.ok(lines.every(line => Array.from(line).length <= columns), lines.join('\n'));
    assert.match(lines.join('\n'), /reprovad/);
    assert.doesNotMatch(lines.join('\n'), /Retomar:/);
  }
  const logs = [];
  const result = await runExecution({ args: [ctx.dir], options: { sub: 'status', feature: 'example', format: 'table' }, logger: { log: line => logs.push(line) }, engineOptions: { columns: 80 } });
  assert.equal(result.run.status, 'running');
  assert.match(logs.join('\n'), /AIOSON \/ EXECUÇÃO/);
});

test('legacy flags recover with a measured recent write and unread measurements do not claim a stall', () => {
  const now = Date.now();
  const live = { heartbeat_at: new Date(now - 5000).toISOString(), measured: true, stalled: true, unproductive: true, last_write_age_ms: 1000, last_output_age_ms: 600000 };
  const result = currentActivity(live, now);
  assert.equal(result.last_write_age_ms, 6000);
  assert.equal(result.stalled, false);
  assert.equal(result.unproductive, false);
  assert.equal(live.stalled, true, 'projection does not rewrite the engine ledger');
  assert.equal(currentActivity({ ...live, measured: false, last_write_age_ms: null }, now).stalled, false);
  assert.equal(currentActivity({ ...live, last_write_age_ms: 1000000 }, now).stalled, true);
});

test('engine stall and unproductive indicators recover after writes; stdout only recovers stall', async t => {
  const dir = await temporary(t);
  let now = Date.now();
  const file = path.join(dir, 'work.txt');
  await fs.writeFile(file, 'before');
  let events = 0;
  const watch = createStallWatch({ projectDir: dir, writePaths: ['work.txt'], stallMs: 100, unproductiveMs: 200, checkMs: 5, now: () => now, onStalled: () => events++ });
  t.after(() => watch.stop());
  now += 1000;
  for (let i = 0; i < 100 && !watch.unproductive; i++) await sleep(10);
  assert.equal(watch.stalled, true); assert.equal(watch.unproductive, true);
  watch.touch();
  assert.equal(watch.stalled, false); assert.equal(watch.unproductive, true);
  await fs.writeFile(file, 'recovered');
  await fs.utimes(file, new Date(now), new Date(now));
  for (let i = 0; i < 100 && watch.unproductive; i++) await sleep(10);
  assert.equal(watch.unproductive, false); assert.equal(watch.stalled, false);
  now += 1000;
  for (let i = 0; i < 100 && !watch.stalled; i++) await sleep(10);
  assert.equal(watch.stalled, true); assert.equal(events, 2, 'a new inactivity episode can be observed');
});

test('dashboard serves local assets and live changes, refuses writes and foreign origins, closes cleanly', async t => {
  const ctx = await fixture(t);
  const dashboard = createExecutionDashboard(ctx.dir, { port: 0, feature: 'example' });
  const info = await dashboard.start();
  t.after(() => dashboard.stop());
  const base = `http://127.0.0.1:${info.port}`;
  assert.equal(dashboard.server.address().address, '127.0.0.1');
  const home = await fetch(base);
  assert.match(home.headers.get('content-security-policy'), /script-src 'self'/);
  assert.match(await home.text(), /tokens\.css/);
  assert.equal((await fetch(`${base}/app.js`)).status, 200);
  const list = await (await fetch(`${base}/api/features`)).json();
  assert.equal(list.features[0].feature, 'example');
  assert.equal(list.initial_feature, 'example');
  ctx.state.status = 'paused';
  await fs.writeFile(ctx.file, JSON.stringify(ctx.state));
  const status = await (await fetch(`${base}/api/features/example/status`)).json();
  assert.equal(status.run.status, 'paused');
  assert.equal((await fetch(`${base}/api/features`, { method: 'POST' })).status, 405);
  assert.equal((await fetch(`${base}/api/features`, { headers: { 'sec-fetch-site': 'cross-site' } })).status, 403);
  assert.equal((await fetch(`${base}/api/features/%2e%2e%2fsecret/status`)).status, 400);
  const foreignHost = await new Promise((resolve, reject) => {
    http.get(`${base}/api/features`, { headers: { Host: 'attacker.example' } }, res => { res.resume(); resolve(res.statusCode); }).on('error', reject);
  });
  assert.equal(foreignHost, 403);
  assert.equal((await fetch(`${base}/.aioson/config/execution-roles.json`)).status, 404);
});

test('reports are bounded to a unit and feature, including real paths; empty and corrupt projects are visible', async t => {
  const ctx = await fixture(t);
  const root = path.join(ctx.context, 'reports/example/run-1');
  await fs.mkdir(root, { recursive: true });
  const report = { verdict: 'FAIL', summary: 'review evidence' };
  await fs.writeFile(path.join(root, 'catalog.json'), JSON.stringify(report));
  ctx.state.units.catalog.qa.report = '.aioson/context/reports/example/run-1/catalog.json';
  await fs.writeFile(ctx.file, JSON.stringify(ctx.state));
  assert.deepEqual((await readReport(ctx.dir, 'example', 'catalog', 'qa')).data, report);
  assert.equal((await readReport(ctx.dir, 'example', 'other', 'qa')).code, 404);
  ctx.state.units.catalog.qa.report = '.aioson/context/execution-plan-example.json';
  await fs.writeFile(ctx.file, JSON.stringify(ctx.state));
  assert.equal((await readReport(ctx.dir, 'example', 'catalog', 'qa')).code, 403);
  const other = path.join(ctx.dir, 'outside-reports');
  await fs.mkdir(other);
  await fs.writeFile(path.join(other, 'secret.json'), '{}');
  await fs.symlink(other, path.join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  ctx.state.units.catalog.qa.report = '.aioson/context/reports/example/run-1/linked/secret.json';
  await fs.writeFile(ctx.file, JSON.stringify(ctx.state));
  assert.equal((await readReport(ctx.dir, 'example', 'catalog', 'qa')).code, 403);
  assert.equal((await snapshot(ctx.dir, 'absent')).run, null);
  await fs.writeFile(ctx.file, '{broken');
  assert.ok((await snapshot(ctx.dir, 'example')).state_corrupt);
});

test('CLI exposes dashboard and table help, validates its port, and preserves machine status', async t => {
  const ctx = await fixture(t);
  const bin = path.join(__dirname, '../bin/aioson.js');
  const command = args => spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8' });
  const help = command(['--help']);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /execution:dashboard/);
  assert.match(help.stdout, /format=table\|full\|line/);
  const invalid = command(['execution:dashboard', ctx.dir, '--port=0', '--json']);
  assert.equal(invalid.status, 1, invalid.stderr);
  assert.equal(JSON.parse(invalid.stdout).reason, 'invalid_port');
  const status = command(['execution:status', ctx.dir, '--feature=example', '--json']);
  assert.equal(status.status, 0, status.stderr);
  assert.equal(JSON.parse(status.stdout).observation.counts.qa_failed, 1);
});

test('CLI JSON dashboard announces its URL before shutdown and reports occupied ports', async t => {
  const ctx = await fixture(t);
  const reservation = createExecutionDashboard(ctx.dir, { port: 0 });
  const info = await reservation.start();
  const bin = path.join(__dirname, '../bin/aioson.js');
  const args = [bin, 'execution:dashboard', ctx.dir, `--port=${info.port}`, '--json'];
  const occupied = spawnSync(process.execPath, args, { encoding: 'utf8' });
  assert.equal(occupied.status, 1);
  assert.equal(JSON.parse(occupied.stdout).reason, 'port_in_use');
  await reservation.stop();
  const child = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(async () => { if (child.exitCode === null) { child.kill(); await new Promise(resolve => child.once('exit', resolve)); } });
  const start = await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('no startup JSON')), 5000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.stdout.on('data', chunk => {
      output += chunk;
      if (output.includes('\n')) { clearTimeout(timer); try { resolve(JSON.parse(output.split('\n')[0])); } catch (error) { reject(error); } }
    });
  });
  assert.equal(start.status, 'listening');
  assert.equal(start.read_only, false);
  assert.deepEqual(start.actions, ['retry_and_resume', 'configure_routing']);
  assert.equal((await fetch(start.url)).status, 200);
});

test('browser: filters, feature switching, reports, untrusted text, themes, offline recovery and mobile', { skip: !process.env.AIOSON_TEST_BROWSER_PROJECT }, async t => {
  const ctx = await fixture(t);
  await fs.writeFile(path.join(ctx.context, 'execution-plan-empty.json'), JSON.stringify(ctx.plan));
  const reportRoot = path.join(ctx.context, 'reports/example/run-1');
  await fs.mkdir(reportRoot, { recursive: true });
  await fs.writeFile(path.join(reportRoot, 'qa.json'), JSON.stringify({ verdict: 'FAIL', summary: '<script>alert(1)</script>' }));
  ctx.state.units.catalog.qa.report = '.aioson/context/reports/example/run-1/qa.json';
  ctx.state.units.layers.rework = { rounds: 2 };
  ctx.state.units.layers.dev.live = { measured: true, files_changed: 0, last_write_age_ms: null };
  ctx.state.attempts = [{ id: 'measured', role_attempt_id: 'measured', unit: 'catalog', stage: 'dev', wave: 1, started_at: ctx.state.started_at, finished_at: ctx.state.updated_at, usage: { input_tokens: 1200, cache_read_tokens: 200, cache_write_tokens: 0, output_tokens: 30, complete: true }, cost: { usd: 0.0123, complete: true } }];
  await fs.writeFile(ctx.file, JSON.stringify(ctx.state));
  const dashboard = createExecutionDashboard(ctx.dir, { port: 0, feature: 'example' });
  const info = await dashboard.start();
  t.after(() => dashboard.stop());
  const { openBrowser } = require('../src/lib/browser-session');
  const browser = await openBrowser({ projectDir: process.env.AIOSON_TEST_BROWSER_PROJECT, env: {}, config: {}, channel: process.platform === 'win32' ? 'msedge' : undefined, headless: true, viewport: { width: 1440, height: 1050 } });
  assert.equal(browser.ok, true, JSON.stringify({ error: browser.error, detail: browser.detail }));
  t.after(() => browser.close());
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(info.url);
  await page.locator('#units tr').first().waitFor();
  assert.match(await page.locator('#usage-waves').innerText(), /1\.200/);
  assert.match(await page.locator('#usage-waves').innerText(), /\$0\.0123/);
  assert.doesNotMatch(await page.locator('#usage-note').innerText(), /\[object Object\]/);
  const waveToggle = page.locator('[data-usage-wave="1"]');
  await waveToggle.focus();
  await page.keyboard.press('Enter');
  assert.equal(await waveToggle.getAttribute('aria-expanded'), 'true');
  const waveDetail = page.locator('#wave-usage-detail-0');
  assert.match(await waveDetail.innerText(), /Backend \/ DEV/);
  assert.match(await waveDetail.innerText(), /1\.230/);
  assert.match(await waveDetail.innerText(), /Maior consumo registrado/);
  assert.match(await waveDetail.innerText(), /Fases e unidades desta onda \(3\)/);
  assert.match(await waveDetail.innerText(), /Fase 1 · Catalog/);
  const refreshed = page.waitForResponse(response => response.url().endsWith('/example/status'));
  await page.locator('#refresh').click();
  await refreshed;
  assert.equal(await waveToggle.getAttribute('aria-expanded'), 'true', 'refresh preserves expansion');
  assert.equal(await page.locator('#units tr').count(), 3, 'current wave is focused by default');
  await page.locator('[data-filter=running]').click();
  assert.equal(await page.locator('#units tr').count(), 1);
  assert.match(await page.locator('#units').innerText(), /Correção 2/);
  assert.match(await page.locator('#units').innerText(), /Layers \/ DEV/);
  assert.match(await page.locator('#units').innerText(), /FASE 2 · LAYERS/);
  assert.match(await page.locator('#units').innerText(), /DEV · Correção 2/);
  await page.locator('[data-filter=attention]').click();
  assert.equal(await page.locator('#units tr').count(), 1);
  await page.locator('.unit-name').first().click();
  await page.getByRole('button', { name: 'Ler relatório QA', exact: true }).click();
  await page.locator('#report pre').waitFor();
  assert.match(await page.locator('#report pre').innerText(), /<script>/);
  await page.locator('#close-detail').click();
  await page.locator('#findings summary').first().click();
  assert.match(await page.locator('#findings').innerText(), /<img src=x onerror/);
  assert.equal(await page.locator('#findings img').count(), 0);
  await page.locator('#theme').click();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => globalThis.document.documentElement.scrollWidth > globalThis.innerWidth), false);
  await page.locator('[data-feature=empty]').click();
  await page.waitForFunction(() => globalThis.document.getElementById('run-status').textContent === 'Não iniciado');
  await page.locator('[data-feature=example]').click();
  await page.waitForFunction(() => globalThis.document.getElementById('run-status').textContent === 'Executando');
  await page.route('**/api/features', route => route.abort());
  await page.locator('#refresh').click();
  await page.locator('#connection.offline').waitFor();
  assert.ok(await page.locator('#units tr').count(), 'last successful view survives connection loss');
  await page.unroute('**/api/features');
  await page.locator('#refresh').click();
  await page.waitForFunction(() => !globalThis.document.getElementById('connection').classList.contains('offline'));
  ctx.state.status = 'paused';
  await fs.writeFile(ctx.file, JSON.stringify(ctx.state));
  await page.locator('#refresh').click();
  await page.waitForFunction(() => globalThis.document.getElementById('run-status').textContent === 'Pausado');
  await page.locator('[data-filter=attention]').click();
  assert.match(await page.locator('#units').innerText(), /Interrompido/);
  assert.match(await page.locator('#units').innerText(), /Execução interrompida/);
  assert.match(await page.locator('#metrics').innerText(), /0\/2/);
  assert.equal(await page.locator('#recover-run').isEnabled(), true);
  ctx.state.status = 'completed';
  await fs.writeFile(ctx.file, JSON.stringify(ctx.state));
  await page.locator('#refresh').click();
  await page.waitForFunction(() => globalThis.document.getElementById('run-status').textContent === 'Concluído');
  assert.deepEqual(errors, []);
});
