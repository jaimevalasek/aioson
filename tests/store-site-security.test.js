'use strict';

// Site, token e caminhos vindos do servidor (revisão da Loja): o que login,
// logout, publish e install recusam antes de qualquer pedido ou escrita, e como
// o config.json guarda os tokens.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const t = (key, params = {}) => `${key} ${JSON.stringify(params)}`;
const quiet = { log: () => {} };

const COMMANDS = {
  config: 'config',
  auth: 'auth',
  system: 'store-system',
  skill: 'store-skill',
  squad: 'store-squad',
  genome: 'store-genome',
};

// Instâncias novas dos comandos com um HOME temporário (o config.json mora
// nele), AIOSON_BASE_URL fora durante o teste e um fetch falso que registra os
// pedidos e responde o que `answer` mandar.
async function loadCommands(ctx, account) {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-site-home-'));
  ctx.after(() => fs.rm(home, { recursive: true, force: true }));
  const configFile = path.join(home, '.aioson', 'config.json');
  if (account) {
    await fs.mkdir(path.dirname(configFile), { recursive: true });
    await fs.writeFile(configFile, JSON.stringify(account), 'utf8');
  }

  const paths = Object.values(COMMANDS).map((name) => require.resolve(`../src/commands/${name}`));
  const savedCache = paths.map((p) => require.cache[p]);
  const savedEnv = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
  for (const p of paths) delete require.cache[p];
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  const fresh = {};
  try {
    for (const [key, name] of Object.entries(COMMANDS)) fresh[key] = require(`../src/commands/${name}`);
  } finally {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    paths.forEach((p, i) => { require.cache[p] = savedCache[i]; });
  }
  const savedBaseUrl = process.env.AIOSON_BASE_URL;
  delete process.env.AIOSON_BASE_URL;
  ctx.after(() => {
    if (savedBaseUrl === undefined) delete process.env.AIOSON_BASE_URL;
    else process.env.AIOSON_BASE_URL = savedBaseUrl;
  });

  const requests = [];
  let answer = () => ({ status: 200, body: { ok: true } });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    requests.push({ url: String(url), authorization: init.headers && init.headers.authorization });
    const { status = 200, body = { ok: true } } = answer(String(url)) || {};
    return { ok: status < 400, status, statusText: String(status), text: async () => JSON.stringify(body), json: async () => body };
  };
  ctx.after(() => { globalThis.fetch = originalFetch; });

  return {
    ...fresh,
    configFile,
    requests,
    answer: (fn) => { answer = fn; },
    readSaved: async () => JSON.parse(await fs.readFile(configFile, 'utf8')),
  };
}

async function writeTree(ctx, prefix, layout) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  ctx.after(() => fs.rm(dir, { recursive: true, force: true }));
  for (const [rel, content] of Object.entries(layout)) {
    await fs.mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
    await fs.writeFile(path.join(dir, rel), content, 'utf8');
  }
  return dir;
}

const makeApp = (ctx) => writeTree(ctx, 'aioson-site-app-', {
  'system.json': JSON.stringify({ slug: 'site-probe', version: '1.0.0', name: 'Site Probe' }),
  'package.json': JSON.stringify({ name: 'site-probe', version: '1.0.0', scripts: { start: 'node index.js' } }),
  'index.js': 'module.exports = 1;\n',
});

// ── installs da loja com slug/caminhos do servidor (ST-15) ──────────────────

// Tudo o que existe sob `dir`, relativo e ordenado: o retrato antes/depois.
async function listTree(dir) {
  return (await fs.readdir(dir, { recursive: true })).sort();
}

// Install com respostas do servidor que tentam sair da pasta de instalação:
// cada uma é recusada e nada muda no disco (nem fora do projeto, nem dentro).
// As respostas seguras instalam só dentro de `.aioson/`; devolve o que ficou lá.
async function checkInstallContainment(ctx, run, unsafe, safeAnswers) {
  const env = await loadCommands(ctx, { aiosonToken: 'prod-token' });
  const base = await writeTree(ctx, 'aioson-install-', { 'proj/.aioson/.keep': '', 'victim/keep.md': 'keep' });
  const project = path.join(base, 'proj');
  const install = (body) => {
    env.answer(() => ({ body }));
    return run(env)({ args: [project], options: { slug: 'demo' }, logger: quiet, t });
  };
  const before = await listTree(base);
  for (const [body, expected] of unsafe) {
    await assert.rejects(install(body), expected, JSON.stringify(body));
  }
  assert.deepEqual(await listTree(base), before, 'a refused install writes, moves and deletes nothing');

  const results = [];
  for (const body of safeAnswers) results.push(await install(body));
  const outside = (entries) => entries.filter((entry) => !entry.startsWith(path.join('proj', '.aioson') + path.sep));
  assert.deepEqual(outside(await listTree(base)), outside(before), 'a safe install writes only under .aioson/');
  return { project, results, installed: await listTree(path.join(project, '.aioson')) };
}

test('ST-15: system:install refuses a slug or file path from the site that would land outside the package folder, before deleting, copying or writing', async (ctx) => {
  const { project, results, installed } = await checkInstallContainment(ctx, (env) => env.system.runSystemInstall, [
    [{ manifest: { slug: '../x' }, files: { 'a.md': 'x' } }, /store\.error_install_unsafe_slug/],
    [{ manifest: { slug: '../../../victim' }, files: { 'a.md': 'x' } }, /store\.error_install_unsafe_slug/],
    [{ manifest: { slug: '..' }, files: { 'a.md': 'x' } }, /store\.error_install_unsafe_slug/],
    [{ manifest: { slug: 'demo' }, files: { 'ok.md': 'x', '../x.md': 'x' } }, /store\.error_install_unsafe_path/],
    [{ manifest: { slug: 'demo' }, files: { '../../../escaped.md': 'x' } }, /store\.error_install_unsafe_path/],
    [{ manifest: { slug: 'demo' }, files: { [path.join(os.tmpdir(), 'aioson-absolute.md')]: 'x' } }, /store\.error_install_unsafe_path/],
  ], [{ manifest: { slug: 'demo', version: '1.0.0' }, files: { 'system.json': '{}', 'src/a.js': 'x' } }]);

  assert.equal(results[0].path, path.join(project, '.aioson', 'system-packages', 'demo'));
  assert.ok(installed.includes(path.join('system-packages', 'demo', 'src', 'a.js')), installed.join('\n'));
});

test('squad:install refuses a slug or file path from the site that would land outside its folders, including bundled skill/genome paths', async (ctx) => {
  const { installed } = await checkInstallContainment(ctx, (env) => env.squad.runSquadInstall, [
    [{ manifest: { slug: '../x' }, files: { 'squad/squad.md': '# s' } }, /store\.error_install_unsafe_slug/],
    [{ manifest: { slug: 'demo' }, files: { 'squad/squad.md': '# s', 'squad/../../x.md': 'x' } }, /store\.error_install_unsafe_path/],
    [{ manifest: { slug: 'demo' }, files: { 'agents/../../../x.md': 'x' } }, /store\.error_install_unsafe_path/],
    [{ manifest: { slug: 'demo' }, files: { 'skills/../x.md': 'x' } }, /store\.error_install_unsafe_slug/],
    [{ manifest: { slug: 'demo' }, files: { 'skills/tool/../../x.md': 'x' } }, /store\.error_install_unsafe_path/],
    [{ manifest: { slug: 'demo' }, files: { 'genomes/../x.md': 'x' } }, /store\.error_install_unsafe_path/],
  ], [{
    manifest: { slug: 'demo', version: '1.0.0' },
    files: { 'squad/squad.md': '# s', 'agents/a.md': '# a', 'skills/tool/SKILL.md': '# t', 'genomes/g.md': '# g' },
  }]);

  for (const file of [['squads', 'demo', 'squad.md'], ['squads', 'demo', 'agents', 'a.md'], ['installed-skills', 'tool', 'SKILL.md'], ['genomes', 'g.md']]) {
    assert.ok(installed.includes(path.join(...file)), `${file.join('/')}\n${installed.join('\n')}`);
  }
});

test('skill:install refuses a slug or file path from the site that would land outside installed-skills/<slug>/', async (ctx) => {
  const { installed } = await checkInstallContainment(ctx, (env) => env.skill.runSkillInstallStore, [
    [{ slug: '../x', files: { 'SKILL.md': '# s' } }, /store\.error_install_unsafe_slug/],
    [{ slug: 'demo', files: { 'SKILL.md': '# s', '../x.md': 'x' } }, /store\.error_install_unsafe_path/],
    [{ slug: 'demo', files: { '../../../../x.md': 'x' } }, /store\.error_install_unsafe_path/],
  ], [{ slug: 'demo', files: { 'SKILL.md': '# s', 'refs/a.md': 'x' } }]);

  assert.ok(installed.includes(path.join('installed-skills', 'demo', 'refs', 'a.md')), installed.join('\n'));
});

test('genome:install refuses a slug or file path from the site that would land outside .aioson/genomes/<slug>, in both formats', async (ctx) => {
  const { installed } = await checkInstallContainment(ctx, (env) => env.genome.runGenomeInstallStore, [
    [{ slug: '../x', format: 'folder', files: { 'SKILL.md': '# g' } }, /store\.error_install_unsafe_slug/],
    [{ slug: '../x', format: 'single-file', content: '# g' }, /store\.error_install_unsafe_slug/],
    [{ slug: 'demo', format: 'folder', files: { 'SKILL.md': '# g', '../x.md': 'x' } }, /store\.error_install_unsafe_path/],
    [{ slug: 'demo', format: 'single-file', content: '# g', refs: { '../x.md': 'x' } }, /store\.error_install_unsafe_path/],
  ], [
    { slug: 'demo', format: 'folder', files: { 'SKILL.md': '# g', 'references/a.md': 'x' } },
    { slug: 'solo', format: 'single-file', content: '# g', meta: { name: 'Solo' }, refs: { 'a.md': 'x' } },
  ]);

  for (const file of [['genomes', 'demo', 'references', 'a.md'], ['genomes', 'solo.md'], ['genomes', 'solo.meta.json'], ['genomes', 'solo.refs', 'a.md']]) {
    assert.ok(installed.includes(path.join(...file)), `${file.join('/')}\n${installed.join('\n')}`);
  }
});

test('squad:install writes every file of a new bundled skill and skips an already installed skill whole (no --force)', async (ctx) => {
  const env = await loadCommands(ctx, { aiosonToken: 'prod-token' });
  const project = await writeTree(ctx, 'aioson-squad-deps-', { '.aioson/installed-skills/old/SKILL.md': '# old, kept' });
  env.answer(() => ({ body: {
    manifest: { slug: 'demo', version: '1.0.0' },
    files: {
      'squad/squad.md': '# s',
      'skills/fresh/SKILL.md': '# fresh',
      'skills/fresh/refs/a.md': 'a',
      'skills/fresh/refs/b.md': 'b',
      'skills/old/SKILL.md': '# old, new version',
      'skills/old/refs/c.md': 'c',
    },
  } }));
  const lines = [];

  await env.squad.runSquadInstall({ args: [project], options: { slug: 'demo' }, logger: { log: (line) => lines.push(line) }, t });

  const skills = path.join(project, '.aioson', 'installed-skills');
  assert.deepEqual(await listTree(path.join(skills, 'fresh')), ['SKILL.md', 'refs', path.join('refs', 'a.md'), path.join('refs', 'b.md')]);
  assert.deepEqual(await listTree(path.join(skills, 'old')), ['SKILL.md']);
  assert.equal(await fs.readFile(path.join(skills, 'old', 'SKILL.md'), 'utf8'), '# old, kept');
  assert.deepEqual(lines.filter((line) => line.startsWith('store.install_squad_dep_skip')), [
    t('store.install_squad_dep_skip', { type: 'skill', slug: 'old' }),
  ]);
});

test('the unsafe-slug message fits every store install (no "system" in any locale)', () => {
  const { createTranslator } = require('../src/i18n');
  for (const locale of ['en', 'pt-BR', 'es', 'fr']) {
    const text = createTranslator(locale).t('store.error_install_unsafe_slug', { slug: '../x' });
    assert.ok(text.includes('"../x"'), `${locale}: ${text}`);
    assert.doesNotMatch(text, /system|sistema|système/i, locale);
  }
});

// ── ST-1: --base-url vazio e token recusado no login ────────────────────────

test('ST-1: a present but blank or non-string --base-url is a usage error in publish, login and logout — no request, config untouched', async (ctx) => {
  const account = { aiosonToken: 'prod-token', aiosonTokens: { 'https://aioson.com': 'prod-token', 'http://localhost:3000': 'local-token' } };
  const env = await loadCommands(ctx, account);
  const dir = await makeApp(ctx);

  for (const value of ['', '   ', true]) {
    const options = { 'base-url': value };
    await assert.rejects(env.system.runSystemPublish({ args: [dir], options, logger: quiet, t }), /auth\.error_base_url_blank/);
    await assert.rejects(env.auth.runAuthLogin({ args: [], options: { ...options, token: 'dev-token' }, logger: quiet, t }), /auth\.error_base_url_blank/);
    await assert.rejects(env.auth.runAuthLogout({ args: [], options, logger: quiet, t }), /auth\.error_base_url_blank/);
  }
  assert.equal(env.requests.length, 0);
  assert.deepEqual(await env.readSaved(), account);
});

test('ST-1: auth:login does not save a token the site answers 401/403 for; an unreachable site keeps "could not verify"', async (ctx) => {
  const account = { aiosonToken: 'prod-token', aiosonTokens: { 'https://aioson.com': 'prod-token' } };
  const env = await loadCommands(ctx, account);

  for (const status of [401, 403]) {
    env.answer(() => ({ status, body: { error: 'Authentication required.' } }));
    const lines = [];
    const result = await env.auth.runAuthLogin({ args: [], options: { token: 'dev-token' }, logger: { log: (line) => lines.push(line) }, t });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'token_rejected');
    assert.ok(lines.includes(t('auth.login_rejected', { url: 'https://aioson.com' })), lines.join('\n'));
    assert.deepEqual(await env.readSaved(), account);
  }

  env.answer(() => ({ status: 503, body: {} }));
  const lines = [];
  const offline = await env.auth.runAuthLogin({ args: [], options: { token: 'new-token' }, logger: { log: (line) => lines.push(line) }, t });
  assert.equal(offline.ok, true);
  assert.ok(lines.some((line) => line.startsWith('auth.login_saved')));
  assert.equal((await env.readSaved()).aiosonToken, 'new-token');
});

// ── ST-2: skill/squad/genome:publish no site escolhido ──────────────────────

test('ST-2: skill:publish, squad:publish and genome:publish go to the site chosen like system:publish', async (ctx) => {
  const env = await loadCommands(ctx, { aiosonToken: 'prod-token', aiosonTokens: { 'http://localhost:3000': 'local-token' } });
  const project = await writeTree(ctx, 'aioson-site-project-', {
    '.aioson/skills/demo/SKILL.md': '# Demo skill\n\nSays hello.\n',
    '.aioson/squads/demo/squad.md': '# Demo squad\n',
    '.aioson/squads/demo/agents/demo-agent.md': '# Demo agent\n',
    '.aioson/genomes/demo.md': '# Demo genome\n\nHeuristics.\n',
  });
  const publishAll = async (options) => {
    for (const run of [env.skill.runSkillPublish, env.squad.runSquadPublish, env.genome.runGenomePublish]) {
      await run({ args: [project], options: { slug: 'demo', force: true, ...options }, logger: quiet, t });
    }
  };
  const sent = () => env.requests.map((r) => `${r.authorization} ${r.url}`);
  const local = [
    'Bearer local-token http://localhost:3000/api/store/skills/publish',
    'Bearer local-token http://localhost:3000/api/store/squads/publish',
    'Bearer local-token http://localhost:3000/api/store/genomes/publish',
  ];

  await publishAll({ 'base-url': 'http://localhost:3000/' });
  assert.deepEqual(sent(), local);

  env.requests.length = 0;
  process.env.AIOSON_BASE_URL = 'http://localhost:3000';
  await publishAll({});
  delete process.env.AIOSON_BASE_URL;
  assert.deepEqual(sent(), local);

  env.requests.length = 0;
  for (const run of [env.skill.runSkillPublish, env.squad.runSquadPublish, env.genome.runGenomePublish]) {
    await assert.rejects(
      run({ args: [project], options: { slug: 'demo', force: true, 'base-url': 'http://localhost:4000' }, logger: quiet, t }),
      /store\.error_not_authenticated_site \{"url":"http:\/\/localhost:4000"\}/
    );
  }
  assert.equal(env.requests.length, 0, 'a site without its own login gets nothing');

  await publishAll({});
  assert.deepEqual(sent(), [
    'Bearer prod-token https://aioson.com/api/store/skills/publish',
    'Bearer prod-token https://aioson.com/api/store/squads/publish',
    'Bearer prod-token https://aioson.com/api/store/genomes/publish',
  ]);
});

// ── ST-3: config show --json ────────────────────────────────────────────────

test('ST-3: config show --json carries the same masked tokens as the human output', async (ctx) => {
  const env = await loadCommands(ctx, {
    aiosonToken: 'PROD-SECRET-TOKEN-123456',
    aiosonTokens: { 'https://aioson.com': 'PROD-SECRET-TOKEN-123456', 'http://localhost:3000': 'LOCAL-SECRET-TOKEN-999' },
    aiosonUsername: 'jaime',
  });
  const lines = [];

  const result = await env.config.runConfig({ args: ['show'], options: { json: true }, logger: { log: (line) => lines.push(line) }, t });

  assert.ok(!JSON.stringify(result).includes('SECRET-TOKEN'), JSON.stringify(result));
  assert.equal(result.config.aiosonUsername, 'jaime');
  for (const key of ['aiosonToken', 'aiosonTokens']) {
    assert.ok(lines.includes(t('config.show_line', { key, value: result.config[key] })), key);
  }
});

// ── ST-4: login nunca perde token; endereço canônico; loopback ──────────────

test('ST-4: a login never loses a token — the previous default keeps its token when another site becomes the default', async (ctx) => {
  // config.json de antes dos logins por site: só `aiosonToken`.
  const env = await loadCommands(ctx, { aiosonToken: 'prod-token', aiosonUsername: 'jaime' });
  env.answer(() => ({ body: { username: 'dev' } }));

  await env.auth.runAuthLogin({ args: [], options: { token: 'lan-token', 'base-url': 'http://192.168.0.10:3000' }, logger: quiet, t });

  const saved = await env.readSaved();
  assert.equal(saved.aiosonBaseUrl, 'http://192.168.0.10:3000');
  assert.deepEqual(saved.aiosonTokens, { 'https://aioson.com': 'prod-token', 'http://192.168.0.10:3000': 'lan-token' });

  env.requests.length = 0;
  env.answer(() => ({ body: { ok: true } }));
  await env.system.runSystemPublish({ args: [await makeApp(ctx)], options: { 'base-url': 'https://aioson.com' }, logger: quiet, t });
  assert.equal(env.requests[0].url, 'https://aioson.com/api/store/systems/publish');
  assert.equal(env.requests[0].authorization, 'Bearer prod-token');
});

test('ST-4: site URLs are normalized, scheme-less or credentialed ones refused, and loopback dev hosts never take over the default', async (ctx) => {
  const env = await loadCommands(ctx, { aiosonToken: 'prod-token' });
  const site = (url) => env.config.resolveSite({}, { 'base-url': url }, t).baseUrl;

  assert.equal(site('HTTPS://AIOSON.com:443/'), 'https://aioson.com');
  assert.equal(site(' https://aioson.com/store/ '), 'https://aioson.com/store');
  assert.equal(site('http://LOCALHOST:3000/'), 'http://localhost:3000');
  for (const bad of ['localhost:3000', 'aioson.com', 'https://aioson.com@evil.example', 'ftp://aioson.com']) {
    assert.throws(() => site(bad), /auth\.error_base_url_invalid/, bad);
  }

  env.answer(() => ({ body: { username: 'dev' } }));
  for (const url of ['http://localhost.:3000', 'http://app.localhost:3000', 'http://127.0.0.2:3000', 'http://0.0.0.0:3000', 'http://[::1]:3000']) {
    await env.auth.runAuthLogin({ args: [], options: { token: 'dev-token', 'base-url': url }, logger: quiet, t });
    const saved = await env.readSaved();
    assert.equal(saved.aiosonToken, 'prod-token', url);
    assert.equal(saved.aiosonBaseUrl, undefined, url);
  }
});

// ── ST-5: http:// só na máquina ou na rede local ────────────────────────────

test('ST-5: plain http:// is refused for a public host before any request, accepted for this machine and the local network', async (ctx) => {
  const env = await loadCommands(ctx, { aiosonToken: 'prod-token', aiosonTokens: { 'http://aioson.com': 'typo-token' } });

  await assert.rejects(
    env.auth.runAuthLogin({ args: [], options: { token: 'prod-token', 'base-url': 'http://aioson.com' }, logger: quiet, t }),
    /auth\.error_base_url_insecure \{"url":"http:\/\/aioson\.com","https":"https:\/\/aioson\.com"\}/
  );
  await assert.rejects(
    env.system.runSystemPublish({ args: [await makeApp(ctx)], options: { 'base-url': 'http://aioson.com' }, logger: quiet, t }),
    /auth\.error_base_url_insecure/
  );
  assert.equal(env.requests.length, 0);

  const resolve = (url) => env.config.resolveSite({}, { 'base-url': url }, t);
  for (const url of ['https://aioson.com', 'http://localhost:3000', 'http://10.0.0.5:3000', 'http://172.16.0.2', 'http://172.31.255.1:8080', 'http://192.168.1.20:3000', 'http://nas.local:3000']) {
    assert.doesNotThrow(() => resolve(url), url);
  }
  for (const url of ['http://example.com', 'http://11.0.0.1', 'http://172.32.0.1', 'http://192.169.0.1']) {
    assert.throws(() => resolve(url), /auth\.error_base_url_insecure/, url);
  }
});

// ── ST-6: logout nomeia o site ──────────────────────────────────────────────

test('ST-6: auth:logout names the site it logged out of', async (ctx) => {
  const env = await loadCommands(ctx, {
    aiosonToken: 'prod-token',
    aiosonTokens: { 'https://aioson.com': 'prod-token', 'http://localhost:3000': 'local-token', 'http://aioson.com': 'typo-token' },
  });
  const lines = [];

  process.env.AIOSON_BASE_URL = 'http://localhost:3000';
  await env.auth.runAuthLogout({ args: [], options: {}, logger: { log: (line) => lines.push(line) }, t });
  delete process.env.AIOSON_BASE_URL;
  // Logout não manda nada pela rede: até o token de um login antigo em http:// sai.
  await env.auth.runAuthLogout({ args: [], options: { 'base-url': 'http://aioson.com' }, logger: { log: (line) => lines.push(line) }, t });

  assert.deepEqual(lines, [
    t('auth.logout_ok', { url: 'http://localhost:3000' }),
    t('auth.logout_ok', { url: 'http://aioson.com' }),
  ]);
  const saved = await env.readSaved();
  assert.equal(saved.aiosonToken, 'prod-token');
  assert.deepEqual(saved.aiosonTokens, { 'https://aioson.com': 'prod-token' });
});

// ── ST-7: permissões do config.json (POSIX) ─────────────────────────────────

test('ST-7: config.json is written 0600 in a new 0700 folder, and an old 0644 file is closed on the next write', { skip: process.platform === 'win32' && 'POSIX permissions' }, async (ctx) => {
  const fresh = await loadCommands(ctx, null);
  await fresh.config.writeConfig({ aiosonToken: 'prod-token' });
  assert.equal((await fs.stat(fresh.configFile)).mode & 0o777, 0o600);
  assert.equal((await fs.stat(path.dirname(fresh.configFile))).mode & 0o777, 0o700);

  const old = await loadCommands(ctx, { aiosonToken: 'prod-token' });
  await fs.chmod(old.configFile, 0o644);
  await old.config.writeConfig({ aiosonToken: 'prod-token' });
  assert.equal((await fs.stat(old.configFile)).mode & 0o777, 0o600);
});
