'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { loadJevConfig } = require('../src/lib/jev-config');
const { requestJev } = require('../src/lib/jev-client');

async function project(t, apiKey) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-jev-key-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, 'aioson-models.json'), JSON.stringify({
    providers: { openrouter: { api_key: apiKey } },
    jev: { enabled: true, route: 'openrouter' }
  }));
  return root;
}

test('an environment variable name in api_key is read from the environment, never sent as the key', async (t) => {
  for (const written of ['OPENROUTER_API_KEY', '$OPENROUTER_API_KEY', '${OPENROUTER_API_KEY}']) {
    const root = await project(t, written);
    const unset = loadJevConfig(root, {});
    assert.equal(unset.status, 'invalid', written);
    assert.equal(unset.reason, 'api_key_env_unset');
    assert.equal(unset.apiKeyEnv, 'OPENROUTER_API_KEY');
    assert.equal(unset.apiKey, null);
    const set = loadJevConfig(root, { OPENROUTER_API_KEY: 'sk-or-v1-synthetic' });
    assert.equal(set.status, 'ready');
    assert.equal(set.apiKey, 'sk-or-v1-synthetic');
  }
});

test('a variable other than the route default can be referenced; a real key is used as written', async (t) => {
  const named = await project(t, '${TEAM_OPENROUTER_KEY}');
  assert.equal(loadJevConfig(named, {}).reason, 'api_key_env_unset');
  assert.equal(loadJevConfig(named, { TEAM_OPENROUTER_KEY: 'sk-or-v1-team' }).apiKey, 'sk-or-v1-team');
  const literal = await project(t, 'sk-or-v1-synthetic-literal');
  assert.equal(loadJevConfig(literal, {}).apiKey, 'sk-or-v1-synthetic-literal');
  const placeholder = await project(t, 'YOUR_OPENROUTER_API_KEY');
  assert.equal(loadJevConfig(placeholder, {}).reason, 'missing_api_key');
});

test('the key may live in the project .env; the OS environment wins and process.env is never touched', async (t) => {
  const root = await project(t, 'OPENROUTER_API_KEY');
  await fs.writeFile(path.join(root, '.env'), 'DATABASE_URL=mysql://x\nOPENROUTER_API_KEY="sk-or-v1-from-dotenv"\n');
  const fromDotEnv = loadJevConfig(root, {});
  assert.equal(fromDotEnv.status, 'ready');
  assert.equal(fromDotEnv.apiKey, 'sk-or-v1-from-dotenv');
  assert.equal(loadJevConfig(root, { OPENROUTER_API_KEY: 'sk-or-v1-from-os' }).apiKey, 'sk-or-v1-from-os');
  assert.equal(process.env.OPENROUTER_API_KEY === 'sk-or-v1-from-dotenv', false, 'workers spawned later never inherit the Jev key');

  const placeholder = await project(t, 'YOUR_OPENROUTER_API_KEY');
  await fs.writeFile(path.join(placeholder, '.env'), 'OPENROUTER_API_KEY=sk-or-v1-from-dotenv\n');
  assert.equal(loadJevConfig(placeholder, {}).apiKey, 'sk-or-v1-from-dotenv', 'a placeholder in the file defers to .env');

  const custom = await project(t, '${TEAM_OPENROUTER_KEY}');
  await fs.writeFile(path.join(custom, '.env'), 'TEAM_OPENROUTER_KEY=sk-or-v1-team-dotenv\n');
  assert.equal(loadJevConfig(custom, {}).apiKey, 'sk-or-v1-team-dotenv', 'a referenced variable resolves from .env too');
});

const { runJevJudge } = require('../src/commands/jev-judge');

test('jev:judge --check names where the key came from and proves it with one uncached answer', async (t) => {
  const root = await project(t, 'OPENROUTER_API_KEY');
  await fs.writeFile(path.join(root, '.env'), 'OPENROUTER_API_KEY=sk-or-v1-from-dotenv\n');
  const bodies = [];
  const fetchImpl = async (url, init) => {
    bodies.push(JSON.parse(init.body));
    assert.equal(init.headers.authorization, 'Bearer sk-or-v1-from-dotenv');
    return { ok: true, status: 200, json: async () => ({ answers: { true_statement: { type: 'noul', noul: 0.97 } }, model: 'typesafe/jev-1.13' }) };
  };
  const first = await runJevJudge({ args: [root], options: { check: true, json: true }, fetchImpl, env: {} });
  assert.equal(first.ok, true, JSON.stringify(first));
  assert.equal(first.key_source, 'project .env');
  assert.equal(first.key_name, 'OPENROUTER_API_KEY');
  assert.equal(JSON.stringify(first).includes('sk-or-v1-from-dotenv'), false, 'the key value never appears in the report');
  await runJevJudge({ args: [root], options: { check: true, json: true }, fetchImpl, env: {} });
  assert.equal(bodies.length, 2, 'every check reaches the provider');
  assert.notDeepEqual(bodies[0].state, bodies[1].state);

  const missing = await project(t, 'OPENROUTER_API_KEY');
  const failed = await runJevJudge({ args: [missing], options: { check: true, json: true }, fetchImpl: async () => assert.fail('no request without a key'), env: {} });
  assert.deepEqual([failed.ok, failed.config_reason, failed.exitCode], [false, 'api_key_env_unset', 1]);
});

test('jev:judge --example=<one> --dry-run validates the example against this project', async (t) => {
  const root = await project(t, 'OPENROUTER_API_KEY');
  const result = await runJevJudge({ args: [root], options: { example: 'select', 'dry-run': true, json: true }, env: {} });
  assert.equal(result.status, 'dry_run');
  assert.equal(result.config_status, 'invalid');
  assert.equal(result.config_reason, 'api_key_env_unset');
  assert.equal(result.example, 'select');
});

test('a rejected key is auth_failed with the fix, and is not retried', async () => {
  const config = { enabled: true, status: 'ready', route: 'openrouter', model: 'typesafe/jev-1.13', endpoint: 'https://example.invalid', apiKey: 'sk-or-v1-synthetic', apiKeyEnv: 'OPENROUTER_API_KEY' };
  let calls = 0;
  const result = await requestJev({
    config,
    state: 'x',
    questions: {},
    retries: 2,
    sleepImpl: async () => {},
    fetchImpl: async () => { calls += 1; return { ok: false, status: 401, headers: { get: () => null }, json: async () => ({ error: { message: 'Missing Authentication header' } }) }; }
  });
  assert.equal(calls, 1);
  assert.equal(result.status, 'auth_failed');
  assert.equal(result.http_status, 401);
  assert.match(result.reason, /rejected the OPENROUTER_API_KEY key \(HTTP 401: Missing Authentication header\) — fix the key/);
  assert.doesNotMatch(result.reason, /sk-or-v1-synthetic/);
});
