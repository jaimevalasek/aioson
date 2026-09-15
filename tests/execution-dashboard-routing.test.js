'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { routingConfiguration, updateRoutingConfiguration, validateRoutingConfiguration } = require('../src/execution-dashboard/routing-config');
const { createExecutionDashboard } = require('../src/execution-dashboard/server');
const { signatureKey, writeSignatures } = require('../src/lib/host-signature');

const ROLES = {
  version: 1,
  source: 'test',
  enabled: true,
  active_profile: 'primary',
  profiles: {
    primary: { enabled: true, fallback_use: true, fallback_profiles: ['reserve'], roles: { backend_dev: { host: 'codex', model: 'gpt-a', reasoning_effort: 'medium' }, qa: { host: 'codex', model: 'gpt-q', reasoning_effort: 'high' } } },
    reserve: { enabled: true, fallback_use: false, fallback_profiles: [], roles: { backend_dev: { host: 'opencode', model: 'reserve' }, qa: { host: 'codex', model: 'gpt-q', reasoning_effort: 'high' } } }
  },
  parallel: { max_concurrent_lanes: 2 },
  on_unavailable: 'ask'
};

async function project(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-dashboard-routing-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  await fs.mkdir(path.join(dir, '.aioson/config'), { recursive: true });
  await fs.writeFile(path.join(dir, '.aioson/config/execution-roles.json'), JSON.stringify(ROLES, null, 2));
  return dir;
}

test('routing editor exposes cached validation and atomically saves live profile changes', async t => {
  const dir = await project(t);
  const env = { ...process.env, AIOSON_HOST_SIGNATURES: path.join(dir, 'signatures.json') };
  const signed = (host, model, effort) => ({ host, model, reasoning_effort: effort || null, status: 'valid', checked_at: '2026-01-01T00:00:00.000Z', expires_at: '2999-01-01T00:00:00.000Z', unattended: { yolo: { state: 'verified' } } });
  await writeSignatures({ signatures: { [signatureKey('codex', 'gpt-a', 'medium')]: signed('codex', 'gpt-a', 'medium') } }, { env });
  const opened = await routingConfiguration(dir, { env });
  assert.equal(opened.ok, true);
  assert.equal(opened.options.signatures.find(item => item.model === 'gpt-a').state, 'valid');
  assert.ok(opened.options.models.codex.includes('gpt-a'));

  const changed = JSON.parse(JSON.stringify(opened.config));
  changed.active_profile = 'reserve';
  const saved = await updateRoutingConfiguration(dir, { expected_digest: opened.digest, config: changed }, { env, activeRun: true });
  assert.equal(saved.code, 200, JSON.stringify(saved.data));
  assert.equal(saved.data.config.active_profile, 'reserve');
  assert.equal((await updateRoutingConfiguration(dir, { expected_digest: opened.digest, config: ROLES }, { env })).code, 409, 'a stale editor never overwrites a newer choice');

  const structural = JSON.parse(JSON.stringify(saved.data.config));
  structural.parallel.max_concurrent_lanes = 3;
  const liveCapacity = await updateRoutingConfiguration(dir, { expected_digest: saved.data.digest, config: structural }, { env, activeRun: true });
  assert.equal(liveCapacity.code, 200);
  assert.equal(liveCapacity.data.config.parallel.max_concurrent_lanes, 3, 'the saved worker pool is live runtime configuration');
});

test('routing validation accepts a signed fallback without saving or starting a model', async t => {
  const dir = await project(t);
  const env = { ...process.env, AIOSON_HOST_SIGNATURES: path.join(dir, 'signatures.json') };
  const signed = (host, model, effort = null) => ({ host, model, reasoning_effort: effort, status: 'valid', checked_at: '2026-01-01T00:00:00.000Z', expires_at: '2999-01-01T00:00:00.000Z', unattended: { yolo: { state: 'verified' } } });
  await writeSignatures({ signatures: {
    [signatureKey('opencode', 'reserve', null)]: signed('opencode', 'reserve'),
    [signatureKey('codex', 'gpt-q', 'high')]: signed('codex', 'gpt-q', 'high')
  } }, { env });
  const config = JSON.parse(JSON.stringify(ROLES));
  const result = await validateRoutingConfiguration(config, { env });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.checks.find(item => item.role === 'backend_dev').fallback_used, true);
  assert.equal(result.checks.find(item => item.role === 'backend_dev').effective.profile, 'reserve');
  assert.deepEqual(result.commands, []);
});

test('routing HTTP writes require the local action token and validate the complete document', async t => {
  const dir = await project(t);
  const dashboard = createExecutionDashboard(dir, { port: 0 });
  t.after(() => dashboard.stop());
  const info = await dashboard.start();
  const base = new URL(info.url).origin;
  const token = (await (await fetch(`${base}/api/features`)).json()).action_token;
  const opened = await (await fetch(`${base}/api/routing`)).json();
  const request = (headers, config = opened.config) => fetch(`${base}/api/routing`, { method: 'POST', headers, body: JSON.stringify({ expected_digest: opened.digest, config }) });
  const headers = { Origin: base, 'Content-Type': 'application/json', 'X-Aioson-Action': token };
  assert.equal((await request({ ...headers, 'X-Aioson-Action': 'wrong' })).status, 403);
  const invalid = JSON.parse(JSON.stringify(opened.config));
  invalid.profiles.primary.roles.backend_dev.host = 'unknown';
  assert.equal((await request(headers, invalid)).status, 422);
  const valid = JSON.parse(JSON.stringify(opened.config));
  valid.active_profile = 'reserve';
  assert.equal((await request(headers, valid)).status, 200);
  assert.equal((await fetch(`${base}/api/routing/validate`, { method: 'POST', headers: { ...headers, 'X-Aioson-Action': 'wrong' }, body: JSON.stringify({ config: valid }) })).status, 403);
  const validation = await fetch(`${base}/api/routing/validate`, { method: 'POST', headers, body: JSON.stringify({ config: valid }) });
  assert.equal(validation.status, 200);
  assert.equal(Array.isArray((await validation.json()).checks), true);
});

test('browser routing editor switches profiles, renders autocomplete fields and saves the next dispatch choice', { skip: !process.env.AIOSON_TEST_BROWSER_PROJECT }, async t => {
  const dir = await project(t);
  const dashboard = createExecutionDashboard(dir, { port: 0 });
  const info = await dashboard.start();
  const { openBrowser } = require('../src/lib/browser-session');
  const browser = await openBrowser({ projectDir: process.env.AIOSON_TEST_BROWSER_PROJECT, env: {}, config: {}, channel: process.platform === 'win32' ? 'msedge' : undefined, headless: true, viewport: { width: 1100, height: 850 } });
  t.after(async () => { if (browser.ok) await browser.close(); await dashboard.stop(); });
  assert.equal(browser.ok, true, JSON.stringify({ error: browser.error, detail: browser.detail }));
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(info.url);
  await page.evaluate(() => globalThis.document.getElementById('edit-routing').click());
  await page.locator('#save-routing:not([disabled])').waitFor();
  await page.locator('#duplicate-profile').click();
  assert.equal(await page.locator('#routing-active-profile').inputValue(), 'primary_copy');
  assert.equal(await page.locator('#routing-profile-name').inputValue(), 'primary_copy');
  await page.locator('#routing-active-profile').selectOption('reserve');
  assert.equal(await page.locator('#routing-role-fields input').first().inputValue(), 'reserve');
  assert.ok(await page.locator('#routing-role-fields datalist').count() >= 2);
  const validated = page.waitForResponse(response => response.url().endsWith('/api/routing/validate') && response.request().method() === 'POST');
  await page.locator('#validate-routing').click();
  assert.equal((await validated).status(), 200);
  await page.locator('#routing-validation:not([hidden])').waitFor();
  assert.match(await page.locator('#routing-validation').textContent(), /Esta conferência usa assinaturas locais em cache/);
  const saved = page.waitForResponse(response => response.url().endsWith('/api/routing') && response.request().method() === 'POST');
  await page.locator('#save-routing').click();
  assert.equal((await saved).status(), 200);
  await page.waitForFunction(() => globalThis.document.getElementById('routing-feedback').textContent.includes('Configuração salva'));
  assert.equal(JSON.parse(await fs.readFile(path.join(dir, '.aioson/config/execution-roles.json'), 'utf8')).active_profile, 'reserve');
  assert.ok(JSON.parse(await fs.readFile(path.join(dir, '.aioson/config/execution-roles.json'), 'utf8')).profiles.primary_copy);
  await page.locator('#delete-profile').click();
  await page.locator('#confirm-profile-delete[open]').waitFor();
  assert.match(await page.locator('#confirm-profile-delete').textContent(), /Excluir reserve\?/);
  await page.locator('#cancel-profile-delete').click();
  assert.equal(await page.locator('#routing-active-profile').inputValue(), 'reserve');
  await page.locator('#delete-profile').click();
  await page.locator('#apply-profile-delete').click();
  assert.equal(await page.locator('#routing-active-profile').inputValue(), 'primary');
  assert.equal(await page.locator('#routing-active-profile option[value="reserve"]').count(), 0);
  assert.equal(JSON.parse(await fs.readFile(path.join(dir, '.aioson/config/execution-roles.json'), 'utf8')).active_profile, 'reserve', 'confirmed removal still waits for Save');
  assert.deepEqual(errors, []);
});
