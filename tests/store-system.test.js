'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
  collectSystemFiles,
  createZipBuffer,
  obfuscateJs,
  protectRuntimeTypeScript,
  rawSourceError,
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

test('build protection uses the existing Terser boundary without the vulnerable obfuscator chain', async () => {
  const source = 'function add(first, second) { return first + second; }\nmodule.exports = add;\n';
  const protectedSource = await obfuscateJs(source);

  assert.equal(typeof protectedSource, 'string');
  assert.equal(protectedSource.length < source.length, true);
  assert.match(protectedSource, /module\.exports/);
});
