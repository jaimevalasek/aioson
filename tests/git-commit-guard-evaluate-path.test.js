'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { evaluatePathRules } = require('../src/lib/git-commit-guard');

function blockedIds(result) {
  return result.blocked.map((b) => b.id).sort();
}
function warnedIds(result) {
  return result.warned.map((w) => w.id).sort();
}

// ────────────────────────────────────────────────────────────────────────────
// Default block rules — IDE configs, build artifacts, language caches

test('evaluatePathRules: blocks node_modules (existing dependency_dir rule)', () => {
  assert.deepEqual(blockedIds(evaluatePathRules('node_modules/lodash/index.js')), ['dependency_dir']);
  assert.deepEqual(blockedIds(evaluatePathRules('apps/web/node_modules/foo')), ['dependency_dir']);
});

test('evaluatePathRules: blocks .idea (new ide_config rule)', () => {
  assert.deepEqual(blockedIds(evaluatePathRules('.idea/workspace.xml')), ['ide_config']);
  assert.deepEqual(blockedIds(evaluatePathRules('packages/foo/.idea/runConfigurations/x.xml')), ['ide_config']);
});

test('evaluatePathRules: blocks .vscode (new ide_config rule)', () => {
  assert.deepEqual(blockedIds(evaluatePathRules('.vscode/settings.json')), ['ide_config']);
});

test('evaluatePathRules: blocks .fleet, .cursor, .zed, .vs', () => {
  for (const ide of ['.fleet', '.cursor', '.zed', '.vs']) {
    const r = evaluatePathRules(`${ide}/conf.toml`);
    assert.deepEqual(blockedIds(r), ['ide_config'], `should block ${ide}/`);
  }
});

test('evaluatePathRules: blocks Python caches (lang_cache rule)', () => {
  for (const dir of ['__pycache__', '.pytest_cache', '.mypy_cache', '.ruff_cache', '.tox', '.venv']) {
    const r = evaluatePathRules(`${dir}/foo.bin`);
    assert.deepEqual(blockedIds(r), ['lang_cache'], `should block ${dir}/`);
  }
});

test('evaluatePathRules: blocks Java/Rust target dir (lang_cache)', () => {
  assert.deepEqual(blockedIds(evaluatePathRules('target/release/foo.rs')), ['lang_cache']);
  assert.deepEqual(blockedIds(evaluatePathRules('target/classes/Foo.class')), ['lang_cache']);
});

test('evaluatePathRules: blocks .terraform/ and .serverless/', () => {
  assert.deepEqual(blockedIds(evaluatePathRules('.terraform/state.tf')), ['lang_cache']);
  assert.deepEqual(blockedIds(evaluatePathRules('.serverless/foo.yml')), ['lang_cache']);
});

test('evaluatePathRules: blocks .gradle and .mvn/wrapper', () => {
  assert.deepEqual(blockedIds(evaluatePathRules('.gradle/caches/foo')), ['lang_cache']);
  assert.deepEqual(blockedIds(evaluatePathRules('.mvn/wrapper/maven-wrapper.jar')), ['lang_cache']);
});

test('evaluatePathRules: blocks .NET bin/obj Debug/Release (dotnet_build)', () => {
  assert.deepEqual(blockedIds(evaluatePathRules('bin/Debug/foo.exe')), ['dotnet_build']);
  assert.deepEqual(blockedIds(evaluatePathRules('bin/Release/foo.dll')), ['dotnet_build']);
  assert.deepEqual(blockedIds(evaluatePathRules('obj/Debug/foo.pdb')), ['dotnet_build']);
  assert.deepEqual(blockedIds(evaluatePathRules('src/MyProject/bin/Release/x.dll')), ['dotnet_build']);
});

test('evaluatePathRules: does NOT block plain bin/scripts (dotnet rule scoped to Debug/Release)', () => {
  assert.deepEqual(blockedIds(evaluatePathRules('bin/scripts/foo.sh')), []);
});

test('evaluatePathRules: blocks chat-sessions (new session_artifact entry)', () => {
  assert.deepEqual(blockedIds(evaluatePathRules('chat-sessions/abc.json')), ['session_artifact']);
});

test('evaluatePathRules: scopes media/output blocking to AIOSON runtime artifacts', () => {
  assert.deepEqual(blockedIds(evaluatePathRules('media/assets/logo.png')), []);
  assert.deepEqual(blockedIds(evaluatePathRules('output/renderer.js')), []);
  assert.deepEqual(blockedIds(evaluatePathRules('.aioson/media/capture.png')), ['session_artifact']);
  assert.deepEqual(blockedIds(evaluatePathRules('.aioson/output/session.json')), ['session_artifact']);
});

test('evaluatePathRules: existing rules still fire (dist, .next, aioson-logs)', () => {
  assert.deepEqual(blockedIds(evaluatePathRules('dist/main.js')), ['build_output']);
  assert.deepEqual(blockedIds(evaluatePathRules('.next/server/foo.js')), ['build_output']);
  // aioson-logs/run-1.log matches BOTH session_artifact (dir) AND log_file (extension)
  // — both should fire since git-guard reports all matching rules.
  const ids = blockedIds(evaluatePathRules('aioson-logs/run-1.log'));
  assert.ok(ids.includes('session_artifact'));
  assert.ok(ids.includes('log_file'));
});

test('evaluatePathRules: env files', () => {
  assert.deepEqual(blockedIds(evaluatePathRules('.env')), ['env_file']);
  assert.deepEqual(blockedIds(evaluatePathRules('.env.local')), ['env_file']);
  assert.deepEqual(blockedIds(evaluatePathRules('.env.production')), ['env_file']);
  // Examples/templates excluded
  assert.deepEqual(blockedIds(evaluatePathRules('.env.example')), []);
  assert.deepEqual(blockedIds(evaluatePathRules('.env.sample')), []);
  assert.deepEqual(blockedIds(evaluatePathRules('.env.template')), []);
});

test('evaluatePathRules: secret files (pem/key/p12/pfx/p8/keystore/...)', () => {
  for (const ext of ['pem', 'key', 'p12', 'pfx', 'p8', 'keystore']) {
    assert.deepEqual(blockedIds(evaluatePathRules(`secrets/server.${ext}`)), ['secret_file']);
  }
});

// ────────────────────────────────────────────────────────────────────────────
// Warning rules — should not block, only warn

test('evaluatePathRules: backup_suffix is a warning, not a block', () => {
  const r = evaluatePathRules('foo.bak');
  assert.equal(r.blocked.length, 0);
  assert.deepEqual(warnedIds(r), ['backup_suffix']);
});

test('evaluatePathRules: scratch_name is a warning', () => {
  const r = evaluatePathRules('draft-feature.md');
  assert.equal(r.blocked.length, 0);
  assert.deepEqual(warnedIds(r), ['scratch_name']);
});

test('evaluatePathRules: local_database is a warning (sqlite/db/dump)', () => {
  for (const ext of ['sqlite', 'sqlite3', 'db', 'dump']) {
    const r = evaluatePathRules(`data.${ext}`);
    assert.deepEqual(warnedIds(r), ['local_database'], `should warn on .${ext}`);
  }
});

// ────────────────────────────────────────────────────────────────────────────
// Safe paths

test('evaluatePathRules: clean source files return no findings', () => {
  for (const p of ['src/foo.js', 'tests/bar.test.js', 'README.md', 'docs/intro.md']) {
    const r = evaluatePathRules(p);
    assert.deepEqual(r.blocked, [], `${p} should not be blocked`);
    assert.deepEqual(r.warned, [], `${p} should not be warned`);
  }
});

// ────────────────────────────────────────────────────────────────────────────
// Project allowPaths override

test('evaluatePathRules: allowPaths suppresses both block and warning rules', () => {
  const cfg = { allowPaths: ['src/foo/keep-this/**'] };
  const r = evaluatePathRules('src/foo/keep-this/.idea/workspace.xml', cfg);
  // Even though .idea matches ide_config, the project allowPaths wins
  assert.deepEqual(r.blocked, []);
  assert.deepEqual(r.warned, []);
});

test('evaluatePathRules: project blockPaths add to blocked', () => {
  const cfg = { blockPaths: ['secrets/**'] };
  const r = evaluatePathRules('secrets/internal.txt', cfg);
  const ids = blockedIds(r);
  assert.ok(ids.includes('project_block_path'));
});

test('evaluatePathRules: project blockExtensions add to blocked', () => {
  const cfg = { blockExtensions: ['.iml'] };
  const r = evaluatePathRules('module.iml', cfg);
  const ids = blockedIds(r);
  assert.ok(ids.includes('project_block_extension'));
});

// ────────────────────────────────────────────────────────────────────────────
// Path normalization

test('evaluatePathRules: normalizes Windows-style backslashes', () => {
  const r = evaluatePathRules('node_modules\\lodash\\index.js');
  assert.deepEqual(blockedIds(r), ['dependency_dir']);
});

test('evaluatePathRules: normalizes leading "./" prefix', () => {
  const r = evaluatePathRules('./node_modules/foo');
  assert.deepEqual(blockedIds(r), ['dependency_dir']);
});
