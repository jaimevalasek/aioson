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
