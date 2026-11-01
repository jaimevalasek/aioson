'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const { runSystemPackage } = require('../src/commands/store-system');
const { collectSystemFiles, runtimeSourceFingerprint } = require('../src/lib/system-runtime-package');

const logger = { log() {} };
const t = (key, values = {}) => `${key} ${JSON.stringify(values)}`;

async function app() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-runtime-artifact-'));
  const manifest = { slug: 'runtime-probe', name: 'Runtime Probe', version: '1.0.0', build_command: 'node build.cjs' };
  const files = {
    'system.json': JSON.stringify(manifest),
    'manifest.json': JSON.stringify({ ...manifest, compatibility: { min_play_version: '0.1.98', min_runtime_version: '1.0.0', max_runtime_version: '1.x', sidecar_contract: 'ndjson-v1', schema_version: 1, requires_migration: false } }),
    'package.json': JSON.stringify({ name: manifest.slug, version: manifest.version, scripts: { start: 'node dist/index.cjs' } }),
    'build.cjs': "const fs = require('node:fs'); fs.mkdirSync('dist', {recursive:true}); fs.writeFileSync('dist/index.cjs', 'const runtimeProbeValue = 42; console.log(runtimeProbeValue);'); console.log('BUILD_OUTPUT_SENTINEL');",
    'src/development.ts': 'const developmentSourceSentinel = true;',
    '.env': 'LOCAL_SECRET_SENTINEL=never-publish',
    'dist/source.js.map': '{"sourcesContent":["never-publish"]}',
    'uploads/customer.json': '{"privateStateSentinel":true}',
    'data/customer.db': 'privateDatabaseSentinel'
  };
  for (const [name, content] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(dir, name)), { recursive: true });
    await fs.writeFile(path.join(dir, name), content);
  }
  const binary = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0xff, 0xfe, 0x80, 0x00]);
  await fs.writeFile(path.join(dir, 'dist/asset.png'), binary);
  return { dir, binary };
}

test('AC-012/014: compiled assets retain binary bytes and exclude local state', async () => {
  const { dir, binary } = await app();
  const result = await collectSystemFiles(dir, { buildMode: true });
  assert.deepEqual(result.files['dist/asset.png'], binary);
  for (const forbidden of ['src/development.ts', '.env', 'dist/source.js.map', 'uploads/customer.json', 'data/customer.db']) {
    assert.equal(result.files[forbidden], undefined, forbidden);
    assert.ok(result.excluded.some((item) => forbidden === item.path || forbidden.startsWith(item.path + '/')), forbidden);
  }
});

test('AC-015: runtime capabilities probe reports the installed engine without a project or login', () => {
  const result = spawnSync(process.execPath, [path.resolve('bin/aioson.js'), 'system:package', '--capabilities', '--json'], { encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.protocolVersion, 1);
  assert.equal(output.capabilities.typeScript, typeof require('node:module').stripTypeScriptTypes === 'function');
  assert.equal(output.capabilities.binaryAssets, true);
  assert.equal(output.node, process.versions.node);
});

test('AC-007/011/015/016: staged version is explicit, source changes invalidate review, and build credentials are absent', async () => {
  const { dir } = await app();
  await fs.writeFile(path.join(dir, 'build.cjs'), "const fs = require('node:fs'); fs.mkdirSync('dist',{recursive:true}); fs.writeFileSync('dist/index.cjs','console.log(42)'); fs.writeFileSync('dist/build-env.json',JSON.stringify({hasToken:!!process.env.AIOSON_TOKEN,hasNodeOptions:!!process.env.NODE_OPTIONS}));");
  const result = spawnSync(process.execPath, [path.resolve('bin/aioson.js'), 'system:package', dir, '--build', '--json', '--runtime-version', '1.2.3'], {
    encoding: 'utf8', timeout: 30000, env: { ...process.env, AIOSON_TOKEN: 'PUBLISH_SECRET_SENTINEL', NODE_OPTIONS: '' }
  });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.manifest.version, '1.2.3');
  assert.equal(JSON.parse(await fs.readFile(path.join(dir, 'manifest.json'), 'utf8')).version, '1.0.0');
  assert.equal(output.inventory.find(file => file.path === 'dist/build-env.json').sha256,
    crypto.createHash('sha256').update(JSON.stringify({ hasToken: false, hasNodeOptions: false })).digest('hex'));
  assert.equal(await fs.access(path.join(dir, 'dist/build-env.json')).then(() => true, () => false), false);
  assert.equal(output.sourceFingerprint, await runtimeSourceFingerprint(dir));
  await fs.writeFile(path.join(dir, 'src/development.ts'), 'const changedBuildInput = true;');
  assert.notEqual(output.sourceFingerprint, await runtimeSourceFingerprint(dir));
});

test('AC-010/011/012/015/016: system:package --build --json is a local protected ZIP with a verifiable inventory and digest', async () => {
  const { dir, binary } = await app();
  const result = spawnSync(process.execPath, [path.resolve('bin/aioson.js'), 'system:package', dir, '--build', '--json'], {
    encoding: 'utf8', timeout: 30000,
    env: { ...process.env, AIOSON_LIVE_SESSION: '', AIOSON_LIVE_SESSION_ID: '' }
  });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.ok, true);
  assert.equal(output.protocolVersion, 1);
  assert.equal(output.runtime.entrypoint, 'node dist/index.cjs');
  const zip = await fs.readFile(output.path);
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  assert.equal(output.sha256, crypto.createHash('sha256').update(zip).digest('hex'));
  assert.equal(output.zipBytes, zip.length);
  assert.equal(output.inventory.find((item) => item.path === 'dist/asset.png').bytes, binary.length);
  assert.ok(output.excluded.some((item) => item.path === 'uploads'));
  assert.ok(!result.stdout.includes('BUILD_OUTPUT_SENTINEL'));
});

test('AC-012, AC-013, AC-015: protection failure cannot be bypassed in runtime packaging', async () => {
  const { dir } = await app();
  await fs.mkdir(path.join(dir, 'server'));
  await fs.writeFile(path.join(dir, 'server/broken.ts'), 'interface Unclosed {');
  await assert.rejects(runSystemPackage({ args: [dir], options: { build: true, 'allow-raw-source': true }, logger, t }), /system.error_raw_source/);
});

test('AC-010/012/014: installed build dependency works through the snapshot without shipping its cache', async () => {
  const { dir } = await app();
  const dependency = path.join(dir, 'node_modules', 'qa-build-dependency');
  await fs.mkdir(dependency, { recursive: true });
  await fs.writeFile(path.join(dependency, 'package.json'), JSON.stringify({ name: 'qa-build-dependency', version: '1.0.0', main: 'index.cjs' }));
  await fs.writeFile(path.join(dependency, 'index.cjs'), 'module.exports = () => 42;');
  await fs.writeFile(path.join(dir, 'build.cjs'), "const fs=require('node:fs'),value=require('qa-build-dependency')();fs.mkdirSync('dist',{recursive:true});fs.writeFileSync('dist/index.cjs','console.log('+value+')');");
  const result = spawnSync(process.execPath, [path.resolve('bin/aioson.js'), 'system:package', dir, '--build', '--json'], { encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, result.stdout || result.stderr);
  const report = JSON.parse(result.stdout);
  const zip = await fs.readFile(report.path);
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(end >= 0);
  let offset = zip.readUInt32LE(end + 16);
  const names = [];
  let compiled;
  // Read the standard central directory independently of the ZIP writer.
  for (let index = 0; index < zip.readUInt16LE(end + 10); index++) {
    assert.equal(zip.readUInt32LE(offset), 0x02014b50);
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const name = zip.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    names.push(name);
    if (name === 'dist/index.cjs') {
      const local = zip.readUInt32LE(offset + 42);
      assert.equal(zip.readUInt32LE(local), 0x04034b50);
      const data = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      const compressed = zip.subarray(data, data + zip.readUInt32LE(offset + 20));
      const method = zip.readUInt16LE(offset + 10);
      assert.ok(method === 0 || method === 8);
      compiled = (method === 0 ? compressed : require('node:zlib').inflateRawSync(compressed)).toString('utf8');
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  assert.ok(!names.some(file => file === 'node_modules' || file.startsWith('node_modules/')));
  assert.ok(report.excluded.some(file => file.path === 'node_modules'));
  assert.equal(typeof compiled, 'string');
  const execution = spawnSync(process.execPath, ['-e', compiled], { encoding: 'utf8' });
  assert.equal(execution.status, 0, execution.stderr);
  assert.equal(execution.stdout.trim(), '42');
});

test('AC-012: build-generated external links remain blocked outside the dependency cache', async () => {
  const { dir } = await app();
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-external-private-'));
  await fs.writeFile(path.join(outside, 'customer.json'), 'PRIVATE_LINK_SENTINEL');
  await fs.writeFile(path.join(dir, 'build.cjs'), `const fs=require('node:fs');fs.mkdirSync('dist',{recursive:true});fs.writeFileSync('dist/index.cjs','console.log(42)');fs.symlinkSync(${JSON.stringify(outside)},'dist/external',${JSON.stringify(process.platform === 'win32' ? 'junction' : 'dir')});`);
  const result = spawnSync(process.execPath, [path.resolve('bin/aioson.js'), 'system:package', dir, '--build', '--json'], { encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.error.code, 'runtime_collection_failed');
  assert.ok(!result.stdout.includes('PRIVATE_LINK_SENTINEL'));
});

test('AC-012: a runtime link outside the project is refused instead of packaging its bytes', async () => {
  const { dir } = await app();
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-private-data-'));
  await fs.writeFile(path.join(outside, 'customer.json'), '{"privateCustomer":true}');
  await fs.symlink(outside, path.join(dir, '.aioson'), process.platform === 'win32' ? 'junction' : 'dir');
  await fs.mkdir(path.join(outside, 'squads'));
  await fs.writeFile(path.join(outside, 'squads/private.json'), '{"privateCustomer":true}');
  await assert.rejects(runSystemPackage({ args: [dir], options: { build: true }, logger, t }), /outside|symlink|link|junction/i);
});

test('AC-014: protection cannot inflate a runtime file beyond its declared limit', async () => {
  const { dir } = await app();
  await fs.writeFile(path.join(dir, 'dist/index.js'), 'module.exports = 42;');
  const result = await collectSystemFiles(dir, {
    buildMode: true,
    protection: { level: 'max', obfuscator: { obfuscate: () => ({ getObfuscatedCode: () => 'x'.repeat(2 * 1024 * 1024 + 1) }) } }
  });
  assert.equal(result.files['dist/index.js'], undefined);
  assert.ok(result.errors.some((item) => item.includes('dist/index.js') && item.includes('size limit')));
});

test('AC-011/012: packaging preserves author package metadata and reports only bounded failed filenames', async () => {
  const { dir } = await app();
  const packagePath = path.join(dir, 'package.json');
  const original = JSON.parse(await fs.readFile(packagePath, 'utf8'));
  original.version = '0.9.0';
  await fs.writeFile(packagePath, JSON.stringify(original));
  const result = spawnSync(process.execPath, [path.resolve('bin/aioson.js'), 'system:package', dir, '--build', '--json'], { encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(await fs.readFile(packagePath, 'utf8')).version, '0.9.0');
  await fs.writeFile(path.join(dir, 'build.cjs'), "const fs=require('node:fs');fs.writeFileSync('dist/index.cjs', 'function { BROKEN_CODE_SECRET_SENTINEL');");
  const failed = spawnSync(process.execPath, [path.resolve('bin/aioson.js'), 'system:package', dir, '--build', '--json'], { encoding: 'utf8', timeout: 30000 });
  assert.notEqual(failed.status, 0);
  const report = JSON.parse(failed.stdout);
  assert.equal(report.error.code, 'runtime_protection_failed');
  assert.deepEqual(report.error.files, ['dist/index.cjs']);
  assert.ok(!failed.stdout.includes('BROKEN_CODE_SECRET_SENTINEL'));
});

test('AC-011/016: editing an input after compilation starts cannot authorize an older artifact', async () => {
  const { dir } = await app();
  const control = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-build-control-'));
  const input = path.join(dir, 'src/input.cjs');
  await fs.writeFile(input, 'console.log("initial-input")');
  const started = path.join(control, 'started');
  const resume = path.join(control, 'resume');
  await fs.writeFile(path.join(dir, 'build.cjs'), `const fs=require('node:fs');fs.mkdirSync('dist',{recursive:true});fs.copyFileSync('src/input.cjs','dist/index.cjs');fs.writeFileSync(${JSON.stringify(started)},'ready');const deadline=Date.now()+10000;while(!fs.existsSync(${JSON.stringify(resume)})){if(Date.now()>deadline)throw Error('test deadline');Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,20);}`);
  const child = spawn(process.execPath, [path.resolve('bin/aioson.js'), 'system:package', dir, '--build', '--json'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = ''; let stderr = '';
  child.stdout.on('data', data => { stdout += data; }); child.stderr.on('data', data => { stderr += data; });
  const exited = new Promise(resolve => child.once('exit', code => resolve(code)));
  try {
    const deadline = Date.now() + 10000;
    while (!await fs.access(started).then(() => true, () => false)) {
      if (Date.now() > deadline) throw Error('Build did not reach its input snapshot');
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    await fs.writeFile(input, 'console.log("changed-input")');
    await fs.writeFile(resume, 'continue');
    assert.equal(await exited, 1, stderr);
    assert.equal(JSON.parse(stdout).error.code, 'runtime_inputs_changed');
  } finally { if (child.exitCode === null) child.kill(); }
});
