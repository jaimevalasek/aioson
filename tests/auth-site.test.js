'use strict';

// auth:login guarda um token por site; login no site local não vira o padrão
// quando já existe login em outro site.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const t = (key, params = {}) => `${key} ${JSON.stringify(params)}`;

async function loadAuthWithConfig(ctx, initial) {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-auth-home-'));
  ctx.after(() => fs.rm(home, { recursive: true, force: true }));
  const configFile = path.join(home, '.aioson', 'config.json');
  await fs.mkdir(path.dirname(configFile), { recursive: true });
  await fs.writeFile(configFile, JSON.stringify(initial), 'utf8');

  const configPath = require.resolve('../src/commands/config');
  const authPath = require.resolve('../src/commands/auth');
  const savedCache = { config: require.cache[configPath], auth: require.cache[authPath] };
  const savedEnv = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
  delete require.cache[configPath];
  delete require.cache[authPath];
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  let fresh;
  try {
    fresh = require('../src/commands/auth');
  } finally {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    require.cache[configPath] = savedCache.config;
    require.cache[authPath] = savedCache.auth;
  }

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ username: 'dev' }), text: async () => '{"username":"dev"}' });
  ctx.after(() => { globalThis.fetch = originalFetch; });

  return { auth: fresh, readSaved: async () => JSON.parse(await fs.readFile(configFile, 'utf8')) };
}

test('login on localhost keeps the existing default site and stores a side token', async (ctx) => {
  const { auth, readSaved } = await loadAuthWithConfig(ctx, { aiosonToken: 'prod-token', aiosonUsername: 'jaime' });
  const lines = [];

  await auth.runAuthLogin({ args: [], options: { token: 'local-token', 'base-url': 'http://localhost:3000' }, logger: { log: (l) => lines.push(l) }, t });

  const saved = await readSaved();
  assert.equal(saved.aiosonToken, 'prod-token');
  assert.equal(saved.aiosonBaseUrl, undefined);
  assert.equal(saved.aiosonTokens['http://localhost:3000'], 'local-token');
  assert.ok(lines.some((l) => l.startsWith('auth.login_side_site')));
});

test('login on the default site after a local default resets the base url', async (ctx) => {
  const { auth, readSaved } = await loadAuthWithConfig(ctx, { aiosonToken: 'local-token', aiosonBaseUrl: 'http://localhost:3000' });

  await auth.runAuthLogin({ args: [], options: { token: 'prod-token', 'base-url': 'https://aioson.com' }, logger: { log: () => {} }, t });

  const saved = await readSaved();
  assert.equal(saved.aiosonToken, 'prod-token');
  assert.equal(saved.aiosonBaseUrl, undefined);
  assert.equal(saved.aiosonTokens['https://aioson.com'], 'prod-token');
});

test('logout --base-url drops only that site token', async (ctx) => {
  const { auth, readSaved } = await loadAuthWithConfig(ctx, {
    aiosonToken: 'prod-token',
    aiosonTokens: { 'http://localhost:3000': 'local-token' }
  });

  await auth.runAuthLogout({ args: [], options: { 'base-url': 'http://localhost:3000' }, logger: { log: () => {} }, t });

  const saved = await readSaved();
  assert.equal(saved.aiosonToken, 'prod-token');
  assert.equal(saved.aiosonTokens, undefined);
});
