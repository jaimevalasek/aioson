'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
  collectSystemFiles,
  createZipBuffer,
  runSystemPublish,
  publishAccessNotice,
  obfuscateJs,
  protectRuntimeTypeScript,
  rawSourceError,
  resolveProtectionLevel,
  loadAppObfuscator,
  unprotectedJsError,
  MAX_OBFUSCATION_OPTIONS,
  readBuildOutputDirs,
  startEntryProblems,
  stripSourceMapComments
} = require('../src/commands/store-system');

const canStripTypes = typeof require('node:module').stripTypeScriptTypes === 'function';
const t = (key, params = {}) => `${key} ${JSON.stringify(params)}`;

async function makeApp(ctx, layout) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-system-build-'));
  ctx.after(() => fs.rm(dir, { recursive: true, force: true }));
  for (const [rel, content] of Object.entries(layout)) {
    const full = path.join(dir, rel);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content, 'utf8');
  }
  return dir;
}

const TYPED_SERVER = [
  'interface Options { port: number; }',
  'enum Mode { Fast = 1, Safe = 2 }',
  'export function boot(options: Options): string {',
  '  const chosenMode: Mode = Mode.Safe; // comment that must not ship',
  '  return `${options.port}:${chosenMode}`;',
  '}',
  ''
].join('\n');

test('build packages keep the server runtime under its .ts path but strip types, comments and locals', { skip: !canStripTypes && 'Node without module.stripTypeScriptTypes' }, async (ctx) => {
  const dir = await makeApp(ctx, {
    'server/server.ts': TYPED_SERVER,
    'server/types.d.ts': 'export interface Secret { key: string }',
    'src/main.ts': 'export {}',
    'node_modules/tsx/index.js': 'module.exports = {}'
  });

  const { files, rawSource, protectedTs } = await collectSystemFiles(dir, { buildMode: true });

  const shipped = files['server/server.ts'];
  assert.equal(typeof shipped, 'string');
  assert.match(shipped, /export function boot/);
  assert.doesNotMatch(shipped, /interface Options|: Options|: string|enum Mode/);
  assert.doesNotMatch(shipped, /comment that must not ship/);
  assert.doesNotMatch(shipped, /chosenMode/);
  assert.equal(files['server/types.d.ts'], undefined);
  assert.equal(files['src/main.ts'], undefined);
  assert.equal(files['node_modules/tsx/index.js'], undefined);
  assert.deepEqual(rawSource, []);
  assert.equal(protectedTs, 1);
});

test('runtime TypeScript that cannot be protected is reported and blocks publish unless explicitly allowed', async (ctx) => {
  const dir = await makeApp(ctx, { 'server/broken.ts': 'export const = ;' });

  const { files, rawSource, protectedTs } = await collectSystemFiles(dir, { buildMode: true });

  assert.deepEqual(rawSource, ['server/broken.ts']);
  assert.equal(files['server/broken.ts'], 'export const = ;');
  assert.equal(protectedTs, 0);

  const error = rawSourceError(rawSource, {}, t);
  assert.match(error.message, /system\.error_raw_source/);
  assert.match(error.message, /server\/broken\.ts/);
  assert.equal(rawSourceError(rawSource, { 'allow-raw-source': true }, t), null);
  assert.equal(rawSourceError([], {}, t), null);
});

test('protectRuntimeTypeScript strips types and returns null for syntax it cannot protect', { skip: !canStripTypes && 'Node without module.stripTypeScriptTypes' }, async () => {
  const protectedCode = await protectRuntimeTypeScript('export const port: number = 3210;\n');
  assert.equal(typeof protectedCode, 'string');
  assert.doesNotMatch(protectedCode, /: number/);
  assert.match(protectedCode, /3210/);

  assert.equal(await protectRuntimeTypeScript('export const View = () => <div />;\n'), null);
});

test('dev-only folders and QA reports never ship; runtime scripts, prisma and build output do', async (ctx) => {
  const dir = await makeApp(ctx, {
    'reports/index.html': '<html></html>',
    '.opencode/permissions.yaml': 'x: 1',
    '.qwen/settings.json': '{}',
    'aios-qa-report.json': '{}',
    'aios-qa.config.json': '{}',
    'tests/helper.js': 'module.exports = 1;',
    '.github/workflows/ci.yml': 'on: push',
    'scripts/migrate.mjs': 'export const run = () => 1;',
    'prisma/schema.prisma': 'datasource db {}',
    'dist/index.html': '<html></html>',
    'package.json': '{"name":"x"}',
    'system.json': '{"slug":"x","version":"1.0.0","name":"X"}'
  });

  const build = await collectSystemFiles(dir, { buildMode: true });
  for (const gone of [
    'reports/index.html', '.opencode/permissions.yaml', '.qwen/settings.json',
    'aios-qa-report.json', 'aios-qa.config.json', 'tests/helper.js', '.github/workflows/ci.yml'
  ]) {
    assert.equal(build.files[gone], undefined, `${gone} must not ship in --build`);
  }
  for (const kept of ['scripts/migrate.mjs', 'prisma/schema.prisma', 'dist/index.html', 'package.json', 'system.json']) {
    assert.equal(typeof build.files[kept], 'string', `${kept} must ship in --build`);
  }

  const source = await collectSystemFiles(dir, { buildMode: false });
  assert.equal(source.files['reports/index.html'], undefined);
  assert.equal(source.files['.opencode/permissions.yaml'], undefined);
  assert.equal(source.files['aios-qa-report.json'], undefined);
  // A source package is a boilerplate: its tests travel with it.
  assert.equal(typeof source.files['tests/helper.js'], 'string');
});

test('store packaging uses the supported Archiver v8 API and produces a ZIP buffer', async () => {
  const archive = await createZipBuffer({
    'index.js': 'module.exports = 42;\n',
    'docs/readme.md': '# Package\n'
  });

  assert.equal(archive.subarray(0, 2).toString('ascii'), 'PK');
  assert.equal(archive.length > 50, true);
});

test('declared build output dirs ship even when gitignored; unsafe entries are dropped', async (ctx) => {
  const dir = await makeApp(ctx, {
    '.gitignore': 'dist-server/\n',
    'dist-server/index.js': 'export const answer = 42;\n',
    'dist-server/migrations/001.sql': 'create table t (id int);',
    'package.json': '{"name":"x"}'
  });

  const outputDirs = readBuildOutputDirs({ build_output_dirs: ['./dist-server/', '../escape', 'C:/abs', '/root', 7] });
  assert.deepEqual([...outputDirs], ['dist-server']);

  const declared = await collectSystemFiles(dir, { buildMode: true, outputDirs });
  assert.equal(typeof declared.files['dist-server/index.js'], 'string');
  assert.equal(typeof declared.files['dist-server/migrations/001.sql'], 'string');

  const undeclared = await collectSystemFiles(dir, { buildMode: true });
  assert.equal(undeclared.files['dist-server/index.js'], undefined);
});

test('build packages drop sourceMappingURL comments from JS and CSS, minified bundles included', async (ctx) => {
  const minifiedBundle = `${'var a=1;'.repeat(5000)}\n//# sourceMappingURL=index-abc.js.map\n`;
  const dir = await makeApp(ctx, {
    'dist/assets/index.js': minifiedBundle,
    'dist/assets/index.css': 'body{color:red}\n/*# sourceMappingURL=index.css.map */\n'
  });

  const { files } = await collectSystemFiles(dir, { buildMode: true });
  assert.doesNotMatch(files['dist/assets/index.js'], /sourceMappingURL/);
  assert.doesNotMatch(files['dist/assets/index.css'], /sourceMappingURL/);
  assert.equal(stripSourceMapComments('const x = 1;\n//@ sourceMappingURL=x.map'), 'const x = 1;\n');
});

test('build protection transforms long-line JS instead of trusting its layout', async (ctx) => {
  const source = 'function readableBusinessRule(value) { return value + 1; } module.exports = readableBusinessRule; /*' +
    'x'.repeat(31000) + '*/';
  const dir = await makeApp(ctx, { 'server/rules.js': source });

  const standard = await collectSystemFiles(dir, { buildMode: true });
  assert.doesNotMatch(standard.files['server/rules.js'], /readableBusinessRule|\/\*x{100}/);
  assert.deepEqual(standard.unprotectedJs, []);

  const max = await collectSystemFiles(dir, {
    buildMode: true,
    protection: { level: 'max', obfuscator: fakeObfuscator }
  });
  assert.match(max.files['server/rules.js'], /^\/\*obfuscated:rc4\*\//);
  assert.deepEqual(max.unprotectedJs, []);
});

test('build protects runtime JSX and Vite config code or names unprotectable files', { skip: !canStripTypes && 'Node without module.stripTypeScriptTypes' }, async (ctx) => {
  const dir = await makeApp(ctx, {
    'server/plain.jsx': 'function readableHandler(value) { return value + 1; } module.exports = readableHandler;',
    'server/view.jsx': 'export const View = () => <main>private logic</main>;',
    'vite.config.ts': 'const readablePort: number = 4173; // private comment\nexport default { server: { port: readablePort } };',
    'vite.config.js': 'function readableConfig() { return { server: { port: 4173 } }; } module.exports = readableConfig;'
  });

  const result = await collectSystemFiles(dir, { buildMode: true });
  assert.doesNotMatch(result.files['server/plain.jsx'], /readableHandler/);
  assert.doesNotMatch(result.files['vite.config.ts'], /readablePort|: number|private comment/);
  assert.doesNotMatch(result.files['vite.config.js'], /readableConfig/);
  assert.deepEqual(result.rawSource, []);
  assert.deepEqual(result.unprotectedJs, ['server/view.jsx']);
  assert.match(unprotectedJsError(result.unprotectedJs, {}, t).message, /server\/view\.jsx/);
});

test('forced build output never restores known credential files', async (ctx) => {
  const dir = await makeApp(ctx, {
    '.gitignore': 'dist/\n',
    'dist/index.js': 'module.exports = 1;',
    'dist/aioson-models.json': '{"apiKey":"placeholder"}',
    'dist/AIOSON-MODELS.JSON': '{"apiKey":"placeholder"}',
    '.aioson/squads/demo/aioson-models.json': '{"apiKey":"placeholder"}'
  });
  const result = await collectSystemFiles(dir, { buildMode: true });
  assert.equal(result.files['dist/aioson-models.json'], undefined);
  assert.equal(result.files['dist/AIOSON-MODELS.JSON'], undefined);
  assert.equal(result.files['.aioson/squads/demo/aioson-models.json'], undefined);
  assert.equal(typeof result.files['dist/index.js'], 'string');
});

test('build rejects recognized secrets inside otherwise allowed runtime data', async (ctx) => {
  const dir = await makeApp(ctx, {
    'dist/runtime.json': '{"accessKey":"AKIA1234567890ABCDEF"}'
  });
  const result = await collectSystemFiles(dir, { buildMode: true });
  assert.equal(result.files['dist/runtime.json'], undefined);
  assert.ok(result.errors.some((error) => error.includes('dist/runtime.json') && error.includes('aws_access_key')));
});

test('publish dry-run lists unsafe build files and returns a failing result without an account token', async (ctx) => {
  const dir = await makeApp(ctx, {
    'system.json': JSON.stringify({ slug: 'probe', version: '1.0.0', name: 'Probe', build_command: 'node -e 0' }),
    'package.json': JSON.stringify({ name: 'probe', scripts: { start: 'node dist/index.js' } }),
    'dist/index.js': 'module.exports = 1;',
    'server/view.jsx': 'export const View = () => <main>private logic</main>;'
  });
  const lines = [];
  const result = await runSystemPublish({
    args: [dir],
    options: { build: true, 'dry-run': true },
    logger: { log: (line) => lines.push(line) },
    t
  });
  assert.equal(result.ok, false);
  assert.equal(result.dryRun, true);
  assert.deepEqual(result.unprotectedJs, ['server/view.jsx']);
  assert.ok(lines.some((line) => line.includes('server/view.jsx')));

  await fs.rm(path.join(dir, 'server/view.jsx'));
  const safe = await runSystemPublish({
    args: [dir],
    options: { build: true, 'dry-run': true },
    logger: { log: () => undefined },
    t
  });
  assert.equal(safe.ok, true);
  assert.deepEqual(safe.unprotectedJs, []);
});

test('start entry check flags a missing start script and entries that did not ship', () => {
  const pkg = (scripts) => JSON.stringify({ scripts });

  assert.deepEqual(startEntryProblems({ 'package.json': pkg({}) }), { missingScript: true, missing: [] });
  assert.deepEqual(
    startEntryProblems({ 'package.json': pkg({ start: 'node --enable-source-maps dist-server/index.js' }) }),
    { missingScript: false, missing: ['dist-server/index.js'] }
  );
  assert.deepEqual(
    startEntryProblems({
      'package.json': pkg({ start: 'node ./scripts/start.mjs && vite preview' }),
      'scripts/start.mjs': 'export {}'
    }),
    { missingScript: false, missing: [] }
  );
  assert.deepEqual(startEntryProblems({ 'package.json': pkg({ start: 'vite preview' }) }), { missingScript: false, missing: [] });
});

function runCommonJs(code) {
  const module = { exports: {} };
  new Function('module', 'exports', code)(module, module.exports);
  return module.exports;
}

const fakeObfuscator = {
  obfuscate: (code, options) => ({ getObfuscatedCode: () => `/*obfuscated:${options.stringArrayEncoding}*/${code}` })
};

test('standard protection renames top-level names in modules and keeps runtime behavior', async () => {
  const cjs = 'function addNumbers(first, second) { return first + second; }\nmodule.exports = addNumbers;\n';
  const protectedCjs = await obfuscateJs(cjs);
  assert.doesNotMatch(protectedCjs, /addNumbers/);
  assert.match(protectedCjs, /module\.exports/);
  assert.equal(runCommonJs(protectedCjs)(2, 3), 5);

  const esm = 'function secretPricing(value) { return value * 2; }\nexport function price(value) { return secretPricing(value); }\n';
  const protectedEsm = await obfuscateJs(esm);
  assert.doesNotMatch(protectedEsm, /secretPricing/);
  assert.match(protectedEsm, /export/);
  assert.match(protectedEsm, /price/);

  const compactEsm = 'function secretPricing(value){return value*2}function publicPrice(value){return secretPricing(value)}export{publicPrice as price}';
  const protectedCompactEsm = await obfuscateJs(compactEsm);
  assert.doesNotMatch(protectedCompactEsm, /secretPricing|publicPrice/);
  assert.match(protectedCompactEsm, /export\{.* as price\}/);

  const script = 'function globalHelper() { return 1; }\n';
  assert.match(await obfuscateJs(script), /globalHelper/);

  const errorClass = 'class LicenseError extends Error {}\nmodule.exports = LicenseError;\n';
  assert.equal(runCommonJs(await obfuscateJs(errorClass)).name, 'LicenseError');
});

test('max protection runs the app obfuscator on frontend and server bundles', async (ctx) => {
  const frontendBundle = `${'var a=1;'.repeat(5000)}\n`;
  const serverBundle = `import{join as j}from"node:path";${'var b=1;'.repeat(5000)}\n`;
  const dir = await makeApp(ctx, {
    'dist/assets/index.js': frontendBundle,
    'dist-server/index.js': serverBundle,
    'server/app.js': 'function hidden() { return 1; }\nmodule.exports = hidden;\n'
  });

  const { files, protectedJs, unprotectedJs } = await collectSystemFiles(dir, {
    buildMode: true,
    outputDirs: new Set(['dist-server']),
    protection: { level: 'max', obfuscator: fakeObfuscator }
  });

  assert.match(files['dist/assets/index.js'], /^\/\*obfuscated:rc4\*\//);
  assert.match(files['dist-server/index.js'], /^\/\*obfuscated:rc4\*\//);
  assert.match(files['server/app.js'], /^\/\*obfuscated:rc4\*\//);
  assert.doesNotMatch(files['server/app.js'], /hidden/);
  assert.equal(protectedJs, 3);
  assert.deepEqual(unprotectedJs, []);
});

test('files the obfuscator rejects are reported and block max publishes unless explicitly allowed', async (ctx) => {
  const dir = await makeApp(ctx, { 'server/app.js': 'module.exports = 1;\n' });
  const broken = { obfuscate: () => { throw new Error('boom'); } };

  const { files, unprotectedJs } = await collectSystemFiles(dir, {
    buildMode: true,
    protection: { level: 'max', obfuscator: broken }
  });

  assert.deepEqual(unprotectedJs, ['server/app.js']);
  assert.equal(files['server/app.js'], 'module.exports = 1;\n');
  assert.match(unprotectedJsError(unprotectedJs, {}, t).message, /system\.error_unprotected_js/);
  assert.equal(unprotectedJsError(unprotectedJs, { 'allow-raw-source': true }, t), null);
});

test('protection level comes from --protection, then system.json build_protection, then standard', () => {
  assert.equal(resolveProtectionLevel({}, {}, t), 'standard');
  assert.equal(resolveProtectionLevel({}, { build_protection: 'MAX' }, t), 'max');
  assert.equal(resolveProtectionLevel({ protection: 'standard' }, { build_protection: 'max' }, t), 'standard');
  assert.throws(() => resolveProtectionLevel({ protection: 'ultra' }, {}, t), /system\.error_protection_level/);
  assert.throws(() => resolveProtectionLevel({ protection: true }, {}, t), /system\.error_protection_level/);
});

test('the obfuscator is loaded only from the app, pinned to an exact version', async (ctx) => {
  const fakeModule = 'module.exports = { obfuscate: (code) => ({ getObfuscatedCode: () => "obf:" + code }) };';

  const undeclared = await makeApp(ctx, { 'package.json': '{"name":"x"}' });
  assert.throws(() => loadAppObfuscator(undeclared, t), /system\.error_obfuscator_missing/);

  const unpinned = await makeApp(ctx, {
    'package.json': '{"name":"x","devDependencies":{"javascript-obfuscator":"^5.8.0"}}',
    'node_modules/javascript-obfuscator/package.json': '{"name":"javascript-obfuscator","main":"index.js"}',
    'node_modules/javascript-obfuscator/index.js': fakeModule
  });
  assert.throws(() => loadAppObfuscator(unpinned, t), /system\.error_obfuscator_unpinned/);

  const notInstalled = await makeApp(ctx, {
    'package.json': '{"name":"x","devDependencies":{"javascript-obfuscator":"5.8.0"}}'
  });
  assert.throws(() => loadAppObfuscator(notInstalled, t), /system\.error_obfuscator_missing/);

  const pinned = await makeApp(ctx, {
    'package.json': '{"name":"x","devDependencies":{"javascript-obfuscator":"5.8.0"}}',
    'node_modules/javascript-obfuscator/package.json': '{"name":"javascript-obfuscator","main":"index.js"}',
    'node_modules/javascript-obfuscator/index.js': fakeModule
  });
  const api = loadAppObfuscator(pinned, t);
  assert.equal(api.obfuscate('x').getObfuscatedCode(), 'obf:x');
});

test('max obfuscation options keep runtime-safe switches off', () => {
  assert.equal(MAX_OBFUSCATION_OPTIONS.renameGlobals, false);
  assert.equal(MAX_OBFUSCATION_OPTIONS.selfDefending, false);
  assert.equal(MAX_OBFUSCATION_OPTIONS.debugProtection, false);
  assert.equal(MAX_OBFUSCATION_OPTIONS.transformObjectKeys, false);
  assert.equal(MAX_OBFUSCATION_OPTIONS.sourceMap, false);
  assert.equal(Object.isFrozen(MAX_OBFUSCATION_OPTIONS), true);
});

// ── app-access-plans: o publish só publica (CAP-aap-publish-only) ───────────

const PUBLISH_APP = {
  'system.json': JSON.stringify({ slug: 'access-probe', version: '1.2.0', name: 'Access Probe' }),
  'package.json': JSON.stringify({ name: 'access-probe', version: '1.2.0', scripts: { start: 'node index.js' } }),
  'index.js': 'module.exports = 1;\n'
};

// Carrega uma instância nova do comando com um HOME temporário logado, e troca
// o fetch por um servidor falso que devolve `responseBody`.
async function loadPublishWithAccount(ctx, responseBody, account = { aiosonToken: 'test-token', aiosonBaseUrl: 'https://store.test' }) {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-publish-home-'));
  ctx.after(() => fs.rm(home, { recursive: true, force: true }));
  await fs.mkdir(path.join(home, '.aioson'), { recursive: true });
  await fs.writeFile(
    path.join(home, '.aioson', 'config.json'),
    JSON.stringify(account),
    'utf8'
  );

  const configPath = require.resolve('../src/commands/config');
  const storePath = require.resolve('../src/commands/store-system');
  const savedCache = { config: require.cache[configPath], store: require.cache[storePath] };
  const savedEnv = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
  delete require.cache[configPath];
  delete require.cache[storePath];
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  let fresh;
  try {
    fresh = require('../src/commands/store-system');
  } finally {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    require.cache[configPath] = savedCache.config;
    require.cache[storePath] = savedCache.store;
  }
  // AIOSON_BASE_URL exportado na sessão do dev (a receita sugere) não muda o
  // site destes testes: sai durante o teste e volta no fim.
  const savedBaseUrl = process.env.AIOSON_BASE_URL;
  delete process.env.AIOSON_BASE_URL;
  ctx.after(() => {
    if (savedBaseUrl === undefined) delete process.env.AIOSON_BASE_URL;
    else process.env.AIOSON_BASE_URL = savedBaseUrl;
  });

  const requests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), body: JSON.parse(init.body), authorization: init.headers.authorization });
    return { ok: true, status: 200, statusText: 'OK', text: async () => JSON.stringify(responseBody) };
  };
  ctx.after(() => { globalThis.fetch = originalFetch; });
  return { runSystemPublish: fresh.runSystemPublish, requests, home };
}

test('AC-aap-03: publish --paid without a price in system.json completes and warns that access is set in the admin', async (ctx) => {
  const dir = await makeApp(ctx, PUBLISH_APP);
  const { runSystemPublish: publish, requests } = await loadPublishWithAccount(ctx, {
    ok: true, slug: 'access-probe', version: '1.2.0', quarantined: false,
    accessManagedInAdmin: true, created: true
  });
  const lines = [];

  const result = await publish({ args: [dir], options: { paid: true }, logger: { log: (line) => lines.push(line) }, t });

  assert.equal(result.ok, true);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://store.test/api/store/systems/publish');
  assert.equal(requests[0].body.slug, 'access-probe');
  const warning = lines.find((line) => line.includes('--paid'));
  assert.ok(warning, 'the --paid warning is printed');
  assert.match(warning, /não tem efeito/);
  assert.match(warning, /admin do aioson\.com \(Apps da loja\)/);
  assert.ok(!lines.some((line) => /exige preço/.test(line)));
  assert.ok(lines.some((line) => /App novo publicado como Privado/.test(line)));
});

test('AC-aap-03: publish --paid dry-run without a price no longer fails', async (ctx) => {
  const dir = await makeApp(ctx, PUBLISH_APP);
  const lines = [];
  const result = await runSystemPublish({
    args: [dir], options: { paid: true, 'dry-run': true }, logger: { log: (line) => lines.push(line) }, t
  });
  assert.equal(result.ok, true);
  assert.ok(lines.some((line) => line.includes('--paid') && line.includes('admin do aioson.com')));
});

test('AC-aap-03: publish --private warns, --invite still sends the emails, and an old server response does not crash', async (ctx) => {
  const dir = await makeApp(ctx, PUBLISH_APP);
  const { runSystemPublish: publish, requests } = await loadPublishWithAccount(ctx, {
    ok: true, slug: 'access-probe', version: '1.2.0', quarantined: false, inviteeCount: 1
  });
  const lines = [];

  const result = await publish({
    args: [dir],
    options: { private: true, invite: 'Cliente@Empresa.com' },
    logger: { log: (line) => lines.push(line) },
    t
  });

  assert.equal(result.ok, true);
  assert.deepEqual(requests[0].body.authorizedEmails, ['cliente@empresa.com']);
  const warning = lines.find((line) => line.includes('--private'));
  assert.ok(warning, 'the --private warning is printed');
  assert.match(warning, /admin do aioson\.com \(Apps da loja\)/);
  assert.ok(!lines.some((line) => /App novo publicado como Privado/.test(line)));
  assert.ok(!lines.some((line) => line.includes('--paid')));
});

test('AC-aap-03: a new-app response with accessManagedInAdmin prints the Privado notice; a new version only confirms the version', () => {
  const created = publishAccessNotice({ ok: true, accessManagedInAdmin: true, created: true }, '1.0.0');
  assert.match(created, /App novo publicado como Privado/);
  assert.match(created, /admin do aioson\.com \(Apps da loja\)/);
  assert.match(publishAccessNotice({ accessManagedInAdmin: true, isNew: true }, '1.0.0'), /Privado/);
  assert.match(publishAccessNotice({ accessManagedInAdmin: true, isUpdate: false }, '1.0.0'), /Privado/);

  const update = publishAccessNotice({ ok: true, accessManagedInAdmin: true, created: false }, '1.2.0');
  assert.equal(update, 'Nova versão 1.2.0 publicada.');
  assert.equal(publishAccessNotice({ accessManagedInAdmin: true, isUpdate: true }, '1.2.0'), 'Nova versão 1.2.0 publicada.');

  // Servidor que não diz se o app é novo: aviso neutro, sem afirmar mudança de acesso.
  assert.match(publishAccessNotice({ accessManagedInAdmin: true }, '1.0.0'), /App novo entra como Privado/);
  // Servidor antigo: nenhum aviso, nenhum erro.
  assert.equal(publishAccessNotice({ ok: true, quarantined: false }, '1.0.0'), null);
  assert.equal(publishAccessNotice(null, '1.0.0'), null);
  assert.equal(publishAccessNotice({ created: true, visibility: 'FREE' }, '1.0.0'), null);
});

// ── publish num site escolhido (--base-url / AIOSON_BASE_URL) ───────────────

const PUBLISH_OK = { ok: true, slug: 'access-probe', version: '1.2.0', quarantined: false, accessManagedInAdmin: true, created: false };

test('publish --base-url sends to that site with that site token, leaving the default alone', async (ctx) => {
  const dir = await makeApp(ctx, PUBLISH_APP);
  const { runSystemPublish: publish, requests } = await loadPublishWithAccount(ctx, PUBLISH_OK, {
    aiosonToken: 'prod-token',
    aiosonTokens: { 'http://localhost:3000': 'local-token' }
  });
  const lines = [];

  const result = await publish({ args: [dir], options: { 'base-url': 'http://localhost:3000/' }, logger: { log: (line) => lines.push(line) }, t });

  assert.equal(result.ok, true);
  assert.equal(requests[0].url, 'http://localhost:3000/api/store/systems/publish');
  assert.equal(requests[0].authorization, 'Bearer local-token');
  assert.ok(lines.some((line) => line.startsWith("system.publish_target") && line.includes("http://localhost:3000")));
});

test('AIOSON_BASE_URL picks the site when no flag is given', async (ctx) => {
  const dir = await makeApp(ctx, PUBLISH_APP);
  const { runSystemPublish: publish, requests } = await loadPublishWithAccount(ctx, PUBLISH_OK, {
    aiosonToken: 'prod-token',
    aiosonTokens: { 'http://localhost:3000': 'local-token' }
  });
  const saved = process.env.AIOSON_BASE_URL;
  process.env.AIOSON_BASE_URL = 'http://localhost:3000';
  ctx.after(() => { if (saved === undefined) delete process.env.AIOSON_BASE_URL; else process.env.AIOSON_BASE_URL = saved; });

  await publish({ args: [dir], options: {}, logger: { log: () => {} }, t });

  assert.equal(requests[0].url, 'http://localhost:3000/api/store/systems/publish');
  assert.equal(requests[0].authorization, 'Bearer local-token');
});

test('publish to a site without its own login refuses instead of reusing the default token', async (ctx) => {
  const dir = await makeApp(ctx, PUBLISH_APP);
  const { runSystemPublish: publish, requests } = await loadPublishWithAccount(ctx, PUBLISH_OK, { aiosonToken: 'prod-token' });

  await assert.rejects(
    publish({ args: [dir], options: { 'base-url': 'http://localhost:3000' }, logger: { log: () => {} }, t }),
    /store\.error_not_authenticated_site \{"url":"http:\/\/localhost:3000"\}/
  );
  assert.equal(requests.length, 0);
});

test('publish without --base-url keeps going to the default site', async (ctx) => {
  const dir = await makeApp(ctx, PUBLISH_APP);
  const { runSystemPublish: publish, requests } = await loadPublishWithAccount(ctx, PUBLISH_OK, {
    aiosonToken: 'prod-token',
    aiosonTokens: { 'http://localhost:3000': 'local-token' }
  });

  await publish({ args: [dir], options: {}, logger: { log: () => {} }, t });

  assert.equal(requests[0].url, 'https://aioson.com/api/store/systems/publish');
  assert.equal(requests[0].authorization, 'Bearer prod-token');
});

// ── store-showcase: capa, galeria e novidades pelo system:publish ───────────

const { readImageSize } = require('../src/commands/store-listing-images');

function pngOfSize(width, height, totalBytes = 64) {
  const bytes = Buffer.alloc(Math.max(totalBytes, 33));
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write('IHDR', 12, 'ascii');
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

function jpegOfSize(width, height) {
  return Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x03,
    ...Buffer.alloc(16),
  ]);
}

async function makeListingApp(ctx, manifestExtra, images = {}) {
  const dir = await makeApp(ctx, {
    ...PUBLISH_APP,
    'system.json': JSON.stringify({ slug: 'access-probe', version: '1.2.0', name: 'Access Probe', ...manifestExtra }),
  });
  for (const [rel, bytes] of Object.entries(images)) {
    await fs.mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
    await fs.writeFile(path.join(dir, rel), bytes);
  }
  return dir;
}

// Servidor falso que entende o publish (JSON), o envio de imagem (bytes crus)
// e o commit. `failImageAt` faz o N-ésimo envio de imagem responder 413.
function useStoreServer(ctx, { failImageAt = null } = {}) {
  const requests = [];
  let imageCount = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const target = String(url);
    const isImage = /\/images$/.test(target);
    requests.push({
      url: target,
      contentType: init.headers['content-type'],
      authorization: init.headers.authorization,
      body: isImage ? Buffer.from(init.body) : JSON.parse(init.body),
    });
    const reply = (status, body) => ({ ok: status < 400, status, statusText: String(status), text: async () => JSON.stringify(body) });
    if (isImage) {
      imageCount += 1;
      if (imageCount === failImageAt) return reply(413, { error: 'Request Entity Too Large' });
      return reply(200, { ok: true, id: `0000000${imageCount}-0000-4000-8000-000000000000.png` });
    }
    if (/\/images\/commit$/.test(target)) return reply(200, { ok: true });
    return reply(200, PUBLISH_OK);
  };
  ctx.after(() => { globalThis.fetch = originalFetch; });
  return requests;
}

test('AC-store-showcase-01: cover and gallery files are sent after the version is accepted and committed in the declared order', async (ctx) => {
  const dir = await makeListingApp(ctx, { cover: 'media/cover.png', gallery: ['media/b.png', 'media/a.jpg'] }, {
    'media/cover.png': pngOfSize(1920, 1080),
    'media/b.png': pngOfSize(1600, 900),
    'media/a.jpg': jpegOfSize(1280, 720),
  });
  const { runSystemPublish: publish } = await loadPublishWithAccount(ctx, PUBLISH_OK);
  const requests = useStoreServer(ctx);
  const lines = [];

  const result = await publish({ args: [dir], options: {}, logger: { log: (line) => lines.push(line) }, t });

  assert.equal(result.ok, true);
  assert.equal(result.imagesFailed, false);
  assert.deepEqual(requests.map((r) => r.url.replace('https://store.test', '')), [
    '/api/store/systems/publish',
    '/api/store/systems/access-probe/images',
    '/api/store/systems/access-probe/images',
    '/api/store/systems/access-probe/images',
    '/api/store/systems/access-probe/images/commit',
  ]);
  assert.equal(requests[1].contentType, 'image/png');
  assert.equal(requests[3].contentType, 'image/jpeg');
  assert.equal(requests[1].authorization, 'Bearer test-token');
  assert.deepEqual(requests[1].body, pngOfSize(1920, 1080));
  assert.deepEqual(requests[4].body, {
    cover: '00000001-0000-4000-8000-000000000000.png',
    gallery: ['00000002-0000-4000-8000-000000000000.png', '00000003-0000-4000-8000-000000000000.png'],
  });
  assert.ok(lines.some((line) => line.startsWith('system.images_sent') && line.includes('"count":3')));
  assert.ok(lines.some((line) => line.includes('system.images_sent_gallery') && line.includes('media/a.jpg')));
  // Imagens nunca viajam dentro do pacote.
  assert.equal(requests[0].body.files['media/cover.png'], undefined);
  assert.ok(!lines.some((line) => line.includes('[WARN]')));
});

test('AC-store-showcase-01: a full gallery of 10 images of 2 MB does not grow the package', async (ctx) => {
  const gallery = Array.from({ length: 10 }, (_, index) => `shots/${index}.png`);
  const images = Object.fromEntries(gallery.map((file) => [file, pngOfSize(1600, 900, 2 * 1024 * 1024)]));
  const dir = await makeListingApp(ctx, { gallery }, images);
  const { runSystemPublish: publish } = await loadPublishWithAccount(ctx, PUBLISH_OK);
  const requests = useStoreServer(ctx);

  const result = await publish({ args: [dir], options: {}, logger: { log: () => {} }, t });

  assert.equal(result.ok, true);
  assert.ok(requests[0].body.zipBase64.length < 64 * 1024, 'the ZIP stays small: images are not packaged');
  assert.equal(requests.filter((r) => r.url.endsWith('/images')).length, 10);
});

test('AC-store-showcase-02: files outside the app, missing, wrong format, above 2 MB or more than 10 are refused before publishing', async (ctx) => {
  const cases = [
    [{ cover: '../segredo.png' }, {}, /system\.error_listing_image_outside.*segredo\.png/],
    [{ cover: 'media/nao-existe.png' }, {}, /system\.error_listing_image_missing.*nao-existe\.png/],
    [{ gallery: ['media/anim.gif'] }, { 'media/anim.gif': Buffer.from('GIF89a') }, /system\.error_listing_image_format.*anim\.gif/],
    [{ gallery: ['media/fake.png'] }, { 'media/fake.png': Buffer.from('<html>not an image</html>') }, /system\.error_listing_image_format.*fake\.png/],
    [{ cover: 'media/big.png' }, { 'media/big.png': pngOfSize(1920, 1080, 2 * 1024 * 1024 + 1) }, /system\.error_listing_image_too_large.*big\.png/],
    [{ gallery: Array.from({ length: 11 }, (_, i) => `g${i}.png`) }, {}, /system\.error_listing_gallery_limit \{"max":10,"count":11\}/],
  ];
  for (const [manifestExtra, images, expected] of cases) {
    const dir = await makeListingApp(ctx, manifestExtra, images);
    const { runSystemPublish: publish } = await loadPublishWithAccount(ctx, PUBLISH_OK);
    const requests = useStoreServer(ctx);

    await assert.rejects(publish({ args: [dir], options: {}, logger: { log: () => {} }, t }), expected);
    assert.equal(requests.length, 0, `no version is created for ${JSON.stringify(manifestExtra)}`);
  }
});

test('AC-store-showcase-03: a cover off 16:9 or below 1280x720 and a gallery wider than 1920 px warn and still publish', async (ctx) => {
  const dir = await makeListingApp(ctx, { cover: 'cover.png', gallery: ['wide.jpg'] }, {
    'cover.png': pngOfSize(1000, 1000),
    'wide.jpg': jpegOfSize(2400, 1350),
  });
  const { runSystemPublish: publish } = await loadPublishWithAccount(ctx, PUBLISH_OK);
  const requests = useStoreServer(ctx);
  const lines = [];

  const result = await publish({ args: [dir], options: {}, logger: { log: (line) => lines.push(line) }, t });

  assert.equal(result.ok, true);
  assert.ok(lines.some((line) => line.includes('[WARN] system.warn_listing_cover_ratio') && line.includes('cover.png')));
  assert.ok(lines.some((line) => line.includes('[WARN] system.warn_listing_cover_small')));
  assert.ok(lines.some((line) => line.includes('[WARN] system.warn_listing_gallery_wide') && line.includes('2400')));
  assert.equal(requests.at(-1).url, 'https://store.test/api/store/systems/access-probe/images/commit');
});

test('image sizes are read from png, jpeg and webp headers', () => {
  assert.deepEqual(readImageSize(pngOfSize(1280, 720), 'image/png'), { width: 1280, height: 720 });
  assert.deepEqual(readImageSize(jpegOfSize(1920, 1080), 'image/jpeg'), { width: 1920, height: 1080 });
  const webp = Buffer.alloc(40);
  webp.write('RIFF', 0, 'ascii');
  webp.write('WEBP', 8, 'ascii');
  webp.write('VP8X', 12, 'ascii');
  webp.writeUIntLE(1599, 24, 3);
  webp.writeUIntLE(899, 27, 3);
  assert.deepEqual(readImageSize(webp, 'image/webp'), { width: 1600, height: 900 });
});

test('AC-store-showcase-05: icon and screenshots as external URLs keep publishing as before, with no image upload', async (ctx) => {
  const dir = await makeListingApp(ctx, {
    icon: 'https://cdn.test/icon.png',
    screenshots: ['https://cdn.test/1.png', 'https://cdn.test/2.png'],
  });
  const { runSystemPublish: publish } = await loadPublishWithAccount(ctx, PUBLISH_OK);
  const requests = useStoreServer(ctx);

  const result = await publish({ args: [dir], options: {}, logger: { log: () => {} }, t });

  assert.equal(result.ok, true);
  assert.equal(result.images, null);
  // Sem capa/galeria nada além do publish sai — o site mantém as imagens atuais.
  assert.equal(requests.length, 1);
  assert.equal(requests[0].body.manifest.icon, 'https://cdn.test/icon.png');
  assert.deepEqual(requests[0].body.manifest.screenshots, ['https://cdn.test/1.png', 'https://cdn.test/2.png']);
});

test('AC-store-showcase-06: release_notes goes in the manifest; above 5000 characters is refused naming the limit', async (ctx) => {
  const notes = 'Novo painel\n<script>alert(1)</script>';
  const dir = await makeListingApp(ctx, { release_notes: notes });
  const { runSystemPublish: publish } = await loadPublishWithAccount(ctx, PUBLISH_OK);
  const requests = useStoreServer(ctx);

  await publish({ args: [dir], options: {}, logger: { log: () => {} }, t });
  assert.equal(requests[0].body.manifest.release_notes, notes);

  const longDir = await makeListingApp(ctx, { release_notes: 'x'.repeat(5001) });
  await assert.rejects(
    publish({ args: [longDir], options: {}, logger: { log: () => {} }, t }),
    /system\.error_release_notes_too_long \{"max":5000,"count":5001\}/
  );
  assert.equal(requests.length, 1);
});

test('AC-store-showcase-20: an image failing after the version is accepted names it, skips the commit and --images-only resends without a new version', async (ctx) => {
  const dir = await makeListingApp(ctx, { cover: 'cover.png', gallery: ['shot.png'] }, {
    'cover.png': pngOfSize(1920, 1080),
    'shot.png': pngOfSize(1600, 900),
  });
  const { runSystemPublish: publish } = await loadPublishWithAccount(ctx, PUBLISH_OK);
  const requests = useStoreServer(ctx, { failImageAt: 2 });
  const lines = [];

  const result = await publish({ args: [dir], options: {}, logger: { log: (line) => lines.push(line) }, t });

  assert.equal(result.ok, true, 'the version stays published');
  assert.equal(result.imagesFailed, true);
  assert.ok(!requests.some((r) => r.url.endsWith('/commit')), 'no commit: the site keeps the previous set');
  const warning = lines.find((line) => line.includes('system.images_failed'));
  assert.ok(warning);
  assert.match(warning, /shot\.png/);
  assert.match(warning, /HTTP 413/);
  assert.match(warning, /aioson system:publish .* --images-only/);

  requests.length = 0;
  const resend = await publish({ args: [dir], options: { 'images-only': true }, logger: { log: () => {} }, t });

  assert.equal(resend.ok, true);
  assert.equal(resend.imagesOnly, true);
  assert.ok(!requests.some((r) => r.url.endsWith('/publish')), 'no package and no new version');
  assert.deepEqual(requests.map((r) => r.url.split('/').slice(-2).join('/')), [
    'access-probe/images', 'access-probe/images', 'images/commit',
  ]);
});

test('--images-only without cover or gallery in system.json refuses', async (ctx) => {
  const dir = await makeListingApp(ctx, {});
  const { runSystemPublish: publish } = await loadPublishWithAccount(ctx, PUBLISH_OK);
  const requests = useStoreServer(ctx);

  await assert.rejects(
    publish({ args: [dir], options: { 'images-only': true }, logger: { log: () => {} }, t }),
    /system\.error_images_only_nothing/
  );
  assert.equal(requests.length, 0);
});

// ── revisão da Loja: capa/galeria, linhas do publish, saída 3 ───────────────

test('ST-13: a file named "..cover.png" inside the app is accepted; "../x.png" stays outside', async (ctx) => {
  const dir = await makeListingApp(ctx, { cover: '..cover.png', gallery: ['shot.png'] }, {
    '..cover.png': pngOfSize(1920, 1080),
    'shot.png': pngOfSize(1600, 900),
  });
  const { runSystemPublish: publish } = await loadPublishWithAccount(ctx, PUBLISH_OK);
  const requests = useStoreServer(ctx);

  const result = await publish({ args: [dir], options: {}, logger: { log: () => {} }, t });

  assert.equal(result.ok, true);
  assert.equal(result.imagesFailed, false);
  assert.equal(requests.filter((r) => r.url.endsWith('/images')).length, 2);
  const outside = await makeListingApp(ctx, { cover: '../x.png' });
  await assert.rejects(publish({ args: [outside], options: {}, logger: { log: () => {} }, t }), /system\.error_listing_image_outside/);
});

test('ST-8: declaring only "cover" or only "gallery" warns that the other set is left empty on the Store', async (ctx) => {
  const { runSystemPublish: publish } = await loadPublishWithAccount(ctx, PUBLISH_OK);
  useStoreServer(ctx);
  const images = { 'cover.png': pngOfSize(1920, 1080), 'shot.png': pngOfSize(1600, 900) };
  const cases = [
    [{ cover: 'cover.png' }, ['system.warn_listing_gallery_cleared']],
    [{ gallery: ['shot.png'] }, ['system.warn_listing_cover_cleared']],
    [{ cover: 'cover.png', gallery: ['shot.png'] }, []],
  ];
  for (const [manifestExtra, expected] of cases) {
    const dir = await makeListingApp(ctx, manifestExtra, images);
    const lines = [];
    const result = await publish({ args: [dir], options: { 'images-only': true }, logger: { log: (line) => lines.push(line) }, t });
    assert.equal(result.ok, true);
    const cleared = lines.filter((line) => /warn_listing_(gallery|cover)_cleared/.test(line)).map((line) => line.replace(/^ {2}\[WARN\] /, '').split(' ')[0]);
    assert.deepEqual(cleared, expected, JSON.stringify(manifestExtra));
  }
});

test('ST-9: the same image twice (in the gallery, or the cover repeated in it) is refused before publishing', async (ctx) => {
  const { runSystemPublish: publish } = await loadPublishWithAccount(ctx, PUBLISH_OK);
  const requests = useStoreServer(ctx);
  const images = { 'media/cover.png': pngOfSize(1920, 1080), 'media/a.png': pngOfSize(1600, 900) };
  const cases = [
    { gallery: ['media/a.png', 'media/a.png'] },
    { cover: 'media/cover.png', gallery: ['media/a.png', './media/cover.png'] },
    { gallery: ['media/a.png', 'media/../media/a.png'] },
  ];
  for (const manifestExtra of cases) {
    const dir = await makeListingApp(ctx, manifestExtra, images);
    await assert.rejects(publish({ args: [dir], options: {}, logger: { log: () => {} }, t }), /system\.error_listing_image_duplicate/);
  }
  assert.equal(requests.length, 0, 'no version is created');
});

test('ST-12: the publish lines name the site the version went to, in every locale', async (ctx) => {
  const { createTranslator } = require('../src/i18n');
  const dir = await makeApp(ctx, PUBLISH_APP);
  for (const locale of ['en', 'pt-BR', 'es', 'fr']) {
    const { runSystemPublish: publish } = await loadPublishWithAccount(ctx, PUBLISH_OK, {
      aiosonToken: 'prod-token',
      aiosonTokens: { 'http://localhost:3000': 'local-token' }
    });
    const lines = [];
    await publish({ args: [dir], options: { 'base-url': 'http://localhost:3000' }, logger: { log: (line) => lines.push(line) }, t: createTranslator(locale).t });
    const output = lines.join('\n');
    assert.ok(!output.includes('aioson.com'), `${locale}:\n${output}`);
    assert.ok(output.includes('http://localhost:3000/store/systems/access-probe'), locale);
  }
});

test('ST-14: the store image and release-notes messages exist in every locale with the same placeholders', () => {
  const { loadMessages } = require('../src/i18n');
  const messages = loadMessages();
  const keys = Object.keys(messages.en.system).filter((key) => /listing|images_|release_notes|dry_run_image/.test(key));
  assert.ok(keys.length >= 25, `found ${keys.length}`);
  const holes = (text) => [...String(text).matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort().join(',');
  for (const locale of ['pt-br', 'es', 'fr']) {
    for (const key of keys) {
      const value = messages[locale].system[key];
      assert.equal(typeof value, 'string', `${locale}: system.${key}`);
      assert.equal(holes(value), holes(messages.en.system[key]), `${locale}: system.${key}`);
    }
  }
});

test('ST-11: the store-showcase system.json example in the docs is valid JSON', async () => {
  const doc = await fs.readFile(path.join(__dirname, '..', 'docs', 'integrations', 'apps-publish-marketplace.md'), 'utf8');
  const section = doc.slice(doc.indexOf('### Capa, galeria e novidades da Loja'));
  const example = JSON.parse(section.match(/```json\r?\n([\s\S]*?)```/)[1]);
  assert.equal(typeof example.cover, 'string');
  assert.ok(example.release_notes.includes('\n'), 'the notes keep their line break as \\n');
});

test('a publish whose store image fails after the version is accepted exits with code 3 (spawned CLI)', async (ctx) => {
  const http = require('node:http');
  const { spawn } = require('node:child_process');
  const seen = [];
  const server = http.createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      seen.push(`${req.method} ${req.url}`);
      const image = req.url.endsWith('/images');
      res.writeHead(image ? 413 : 200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(image ? { error: 'Request Entity Too Large' } : PUBLISH_OK));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  ctx.after(() => new Promise((resolve) => server.close(resolve)));
  const site = `http://127.0.0.1:${server.address().port}`;

  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-publish-exit-'));
  ctx.after(() => fs.rm(home, { recursive: true, force: true }));
  await fs.mkdir(path.join(home, '.aioson'), { recursive: true });
  await fs.writeFile(path.join(home, '.aioson', 'config.json'), JSON.stringify({ aiosonToken: 'prod-token', aiosonTokens: { [site]: 'local-token' } }), 'utf8');
  const dir = await makeListingApp(ctx, { cover: 'cover.png', gallery: ['shot.png'] }, {
    'cover.png': pngOfSize(1920, 1080),
    'shot.png': pngOfSize(1600, 900),
  });
  const env = { ...process.env, HOME: home, USERPROFILE: home };
  delete env.AIOSON_BASE_URL;

  const cli = await new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(__dirname, '..', 'bin', 'aioson.js'), 'system:publish', dir, `--base-url=${site}`], { cwd: home, env });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.on('close', (code) => resolve({ code, output }));
  });

  assert.equal(cli.code, 3, cli.output);
  assert.ok(seen.includes('POST /api/store/systems/publish'), seen.join('\n'));
  assert.ok(!seen.some((line) => line.endsWith('/images/commit')), 'no commit after a failed image');
});
