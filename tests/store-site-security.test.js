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
  workspace: 'workspace',
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

test('ST-3: config show --json masks every credential by name and by shape, keeps each object\'s shape, and matches the human output', async (ctx) => {
  const githubToken = 'gh' + 'p_' + 'A'.repeat(36);
  const env = await loadCommands(ctx, {
    aiosonToken: 'PROD-SECRET-TOKEN-123456',
    aiosonTokens: { 'https://aioson.com': 'PROD-SECRET-TOKEN-123456', 'http://localhost:3000': 'LOCAL-SECRET-TOKEN-999' },
    aiosonUsername: 'jaime',
    aiosonBaseUrl: 'https://aioson.com',
    dbPassword: 'hunter2-plain-password',
    githubPat: 'plain-pat-value-123',
    sessionCookie: 'cookie-value-xyz',
    deployHook: githubToken,
    projectPath: '/home/u/proj',
  });
  const lines = [];

  const result = await env.config.runConfig({ args: ['show'], options: { json: true }, logger: { log: (line) => lines.push(line) }, t });

  const text = JSON.stringify(result);
  for (const secret of ['SECRET-TOKEN', 'hunter2-plain', 'pat-value', 'cookie-value', githubToken]) assert.ok(!text.includes(secret), secret);
  assert.deepEqual(Object.keys(result.config.aiosonTokens), ['https://aioson.com', 'http://localhost:3000'], 'the token map keeps its shape');
  assert.match(result.config.aiosonTokens['https://aioson.com'], /^PROD-S\*+$/);
  assert.equal(result.config.aiosonUsername, 'jaime');
  assert.equal(result.config.aiosonBaseUrl, 'https://aioson.com');
  assert.equal(result.config.projectPath, '/home/u/proj', 'a `path` is no `pat`');
  for (const [key, value] of Object.entries(result.config)) {
    const shown = value && typeof value === 'object' ? JSON.stringify(value) : String(value);
    assert.ok(lines.includes(t('config.show_line', { key, value: shown })), key);
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

// ── ST-16/17: todo comando que manda o token escolhe o site como o publish ──

test('ST-16: installs, lists, grant and workspace:init refuse a plain http:// default site before any request', async (ctx) => {
  // config.json de um login antigo em http:// (a 1.73 gravava qualquer --base-url como padrão).
  const env = await loadCommands(ctx, { aiosonToken: 'LEGACY-TOKEN', aiosonBaseUrl: 'http://aioson.com' });
  const project = await writeTree(ctx, 'aioson-insecure-default-', { '.aioson/config.md': '# p\n' });
  env.answer(() => ({ body: { slug: 'demo', files: { 'SKILL.md': '# s' } } }));
  const call = (run, options = {}, args = [project]) => run({ args, options, logger: quiet, t });
  const commands = {
    'skill:install:store': () => call(env.skill.runSkillInstallStore, { slug: 'demo' }),
    'squad:install': () => call(env.squad.runSquadInstall, { slug: 'demo' }),
    'genome:install:store': () => call(env.genome.runGenomeInstallStore, { slug: 'demo' }),
    'skill:list --remote': () => call(env.skill.runSkillListRemote, { remote: true }),
    'squad:list --remote': () => call(env.squad.runSquadList, { remote: true }),
    'genome:list --remote': () => call(env.genome.runGenomeList, { remote: true }),
    'squad:grant': () => call(env.squad.runSquadGrant, {}, ['CODE', 'friend@example.com']),
    'workspace:init': () => call(env.workspace.runWorkspaceInit),
  };
  for (const [name, run] of Object.entries(commands)) {
    await assert.rejects(run(), /auth\.error_base_url_insecure \{"url":"http:\/\/aioson\.com"/, name);
  }
  assert.deepEqual(env.requests, [], 'the token never left');
  await assert.rejects(fs.access(path.join(project, '.aioson', 'workspace.json')));
});

test('ST-17: installs and lists honor --base-url and AIOSON_BASE_URL with that site\'s token; a blank flag is a usage error', async (ctx) => {
  const env = await loadCommands(ctx, { aiosonToken: 'PROD', aiosonTokens: { 'https://aioson.com': 'PROD', 'http://localhost:3000': 'LOCAL' } });
  const project = await writeTree(ctx, 'aioson-install-site-', { '.aioson/config.md': '# p\n' });
  env.answer((url) => ({ body: url.endsWith('/genomes') ? { genomes: [] } : { slug: 'demo', files: { 'SKILL.md': '# s' } } }));
  const install = (options) => env.skill.runSkillInstallStore({ args: [project], options: { slug: 'demo', ...options }, logger: quiet, t });
  const sent = () => env.requests.map((r) => `${r.authorization} ${r.url}`);

  await install({ 'base-url': 'http://localhost:3000/' });
  process.env.AIOSON_BASE_URL = 'http://localhost:3000';
  try {
    await env.genome.runGenomeList({ args: [project], options: { remote: true }, logger: quiet, t });
  } finally {
    delete process.env.AIOSON_BASE_URL;
  }
  await install({});
  assert.deepEqual(sent(), [
    'Bearer LOCAL http://localhost:3000/api/store/skills/install',
    'Bearer LOCAL http://localhost:3000/api/store/genomes',
    'Bearer PROD https://aioson.com/api/store/skills/install',
  ]);

  env.requests.length = 0;
  await assert.rejects(install({ 'base-url': '' }), /auth\.error_base_url_blank/);
  await assert.rejects(install({ 'base-url': 'http://localhost:4000' }), /store\.error_not_authenticated_site \{"url":"http:\/\/localhost:4000"\}/);
  assert.equal(env.requests.length, 0, 'a blank flag and a site without its own login get nothing');
});

// ── ST-18: genome de arquivo único passa pela mesma revisão do formato pasta ─

test('ST-18: a single-file genome install is previewed and scanned like the folder format, and --inspect writes nothing', async (ctx) => {
  const env = await loadCommands(ctx, { aiosonToken: 'prod-token' });
  const project = await writeTree(ctx, 'aioson-genome-single-', { '.aioson/config.md': '# p\n' });
  const genomes = path.join(project, '.aioson', 'genomes');
  const install = (body, options = {}) => {
    env.answer(() => ({ body }));
    const lines = [];
    return env.genome.runGenomeInstallStore({ args: [project], options: { slug: 'solo', ...options }, logger: { log: (line) => lines.push(line) }, t })
      .then((result) => ({ result, lines }));
  };

  // The folder format refuses a .js file; the single-file refs used to write it unscanned.
  await assert.rejects(install({ slug: 'solo', format: 'single-file', content: '# g', refs: { 'payload.js': 'require("child_process").execSync("x")' } }), /store\.error_install_scan_failed/);
  await assert.rejects(fs.access(genomes), 'a refused package writes nothing');

  const body = { slug: 'solo', format: 'single-file', content: '# g', meta: { version: '1.0.0', name: 'Solo' }, refs: { 'a.md': 'x' }, hash: 'f'.repeat(64), publisher: 'jaime' };
  const inspected = await install(body, { inspect: true });
  assert.equal(inspected.result.inspect, true);
  assert.deepEqual(inspected.result.files.sort(), ['refs/a.md', 'solo.md', 'solo.meta.json']);
  assert.ok(inspected.lines.some((line) => line.startsWith('store.install_preview_header')), inspected.lines.join('\n'));
  await assert.rejects(fs.access(genomes), '--inspect lists and stops');

  // The server returns `meta` with its keys reordered (JSON column): the publish hash is not comparable, so it never blocks.
  const installed = await install(body);
  assert.equal(installed.result.format, 'single-file');
  assert.equal(await fs.readFile(path.join(genomes, 'solo.refs', 'a.md'), 'utf8'), 'x');
});

// ── ST-19/20: contenção no disco e nomes que o Windows reescreve ────────────

test('ST-19: a link or junction already inside the install folder never carries a write outside it', async (ctx) => {
  const env = await loadCommands(ctx, { aiosonToken: 'prod-token' });
  const base = await writeTree(ctx, 'aioson-install-link-', {
    'proj/.aioson/installed-skills/demo/SKILL.md': '# old',
    'proj/.aioson/system-packages/app/system.json': '{}',
    'outside/keep.md': 'keep',
    'shared/SKILL.md': '# shared',
  });
  const project = path.join(base, 'proj');
  const outside = path.join(base, 'outside');
  try {
    await fs.symlink(outside, path.join(project, '.aioson', 'installed-skills', 'demo', 'refs'), 'junction');
    await fs.symlink(outside, path.join(project, '.aioson', 'system-packages', 'app', 'node_modules'), 'junction');
    await fs.symlink(path.join(base, 'shared'), path.join(project, '.aioson', 'installed-skills', 'shared'), 'junction');
  } catch (error) {
    ctx.skip(`links cannot be created here (${error.code})`);
    return;
  }

  env.answer(() => ({ body: { slug: 'demo', files: { 'SKILL.md': '# new', 'refs/escaped.md': 'x' } } }));
  await assert.rejects(env.skill.runSkillInstallStore({ args: [project], options: { slug: 'demo' }, logger: quiet, t }), /store\.error_install_unsafe_path \{"path":"refs\/escaped\.md"\}/);
  env.answer(() => ({ body: { manifest: { slug: 'app', version: '2.0.0' }, files: { 'system.json': '{}', 'node_modules/escaped.js': 'x' } } }));
  await assert.rejects(env.system.runSystemInstall({ args: [project], options: { slug: 'app', force: true }, logger: quiet, t }), /store\.error_install_unsafe_path/);
  assert.deepEqual(await fs.readdir(outside), ['keep.md']);
  assert.equal(await fs.readFile(path.join(project, '.aioson', 'installed-skills', 'demo', 'SKILL.md'), 'utf8'), '# old', 'a refused install writes nothing');

  // The install folder itself may be the owner's link (a skill shared across projects): writes follow it.
  env.answer(() => ({ body: { slug: 'shared', files: { 'SKILL.md': '# shared v2', 'refs/a.md': 'a' } } }));
  await env.skill.runSkillInstallStore({ args: [project], options: { slug: 'shared' }, logger: quiet, t });
  assert.equal(await fs.readFile(path.join(base, 'shared', 'refs', 'a.md'), 'utf8'), 'a');
});

test('ST-20: on Windows a name the system rewrites or reserves is refused — trailing dot or space, a device name, a colon', { skip: process.platform !== 'win32' && 'Windows file names' }, () => {
  const { installTarget, assertInstallSlug } = require('../src/lib/store/install-containment');
  const root = path.join(os.tmpdir(), 'aioson-win32-names', 'root');
  for (const name of ['x.', 'x ', 'a/b./c.md', '.. /x', '... /x', 'CON', 'con.txt', 'NUL.md', 'aux', 'PRN.json', 'COM1', 'com9.md', 'LPT1.txt', 'lpt9', 'ab:stream', 'file.txt::$DATA', 'C:x']) {
    assert.throws(() => installTarget(root, name, t), /store\.error_install_unsafe_path/, name);
  }
  for (const name of ['console.md', 'com10.md', 'lpt.md', 'connect/x.md', 'a/./b.md', 'notes.v2.md']) {
    assert.doesNotThrow(() => installTarget(root, name, t), name);
  }
  for (const slug of ['demo.', 'CON', 'nul.md']) assert.throws(() => assertInstallSlug(slug, t), /store\.error_install_unsafe_slug/, slug);
  assert.equal(assertInstallSlug('demo.v2', t), 'demo.v2');
});
