'use strict';

// Regression tests for `aioson memory:reflect-commit --dry-run`.
//
// Bug (pre-fix): the command never read `--dry-run`, so a "dry run" performed
// the full destructive commit — it WROTE the bootstrap files AND unlinked the
// manifest, leaving the flow unrecoverable on the next call (`missing_manifest`).
// These tests pin the contract: dry-run validates but never mutates; a real
// commit consumes the single-use manifest.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

const { BOOTSTRAP_FILES } = require('../src/memory-reflect-engine');
const { runMemoryReflectPrepare, REFLECT_PROMPT_RELATIVE } = require('../src/commands/memory-reflect-prepare');
const { runMemoryReflectCommit } = require('../src/commands/memory-reflect-commit');

function makeLogger() {
  const lines = [];
  return { lines, log(line = '') { lines.push(String(line)); }, error(line = '') { lines.push(String(line)); } };
}

async function git(dir, args) {
  await execFileAsync('git', args, { cwd: dir });
}

// Builds a temp project with a seeded bootstrap/ and a pending reflect manifest
// (via reflect-prepare --force, so it works regardless of the git diff).
async function makeProjectWithManifest() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-reflect-dryrun-'));
  await git(dir, ['init', '-q']);
  await git(dir, ['config', 'user.email', 'test@example.com']);
  await git(dir, ['config', 'user.name', 'test']);
  await git(dir, ['config', 'commit.gpgsign', 'false']);

  const bootstrapDir = path.join(dir, '.aioson', 'context', 'bootstrap');
  await fs.mkdir(bootstrapDir, { recursive: true });
  for (const name of BOOTSTRAP_FILES) {
    await fs.writeFile(
      path.join(bootstrapDir, name),
      `---\nname: ${name}\ngenerated_at: 2024-01-01T00:00:00Z\n---\n# ${name}\n\nSeed content.\n`,
      'utf8'
    );
  }
  await fs.writeFile(path.join(dir, 'README.md'), '# project\n', 'utf8');
  await git(dir, ['add', '-A']);
  await git(dir, ['commit', '-q', '-m', 'seed']);

  const prep = await runMemoryReflectPrepare({
    args: [dir],
    options: { agent: 'dev', force: true, json: true },
    logger: makeLogger()
  });
  assert.ok(prep.ok, 'prepare should write a manifest');

  const manifestPath = path.join(dir, REFLECT_PROMPT_RELATIVE);
  await fs.access(manifestPath);
  return { dir, manifestPath };
}

// Plain ASCII content (no HTML comments / zero-width chars so it survives
// stripInjectionChars unchanged) with a bumped generated_at.
function newContentFor(name) {
  return `---\nname: ${name}\ngenerated_at: 2026-05-28T12:00:00Z\n---\n# ${name}\n\nUpdated content for dry-run test.\n`;
}

async function buildFilesPayload(manifestPath) {
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const files = {};
  for (const rel of manifest.validation_rules.allowed_paths) {
    files[rel] = newContentFor(path.posix.basename(rel));
  }
  return files;
}

async function readBootstrap(dir) {
  const snap = {};
  for (const name of BOOTSTRAP_FILES) {
    snap[name] = await fs.readFile(path.join(dir, '.aioson/context/bootstrap', name), 'utf8');
  }
  return snap;
}

test('reflect-commit --dry-run validates but writes nothing and preserves the manifest', async () => {
  const { dir, manifestPath } = await makeProjectWithManifest();
  const files = await buildFilesPayload(manifestPath);
  const before = await readBootstrap(dir);

  const res = await runMemoryReflectCommit({
    args: [dir],
    options: { agent: 'dev', files, 'dry-run': true, json: true },
    logger: makeLogger()
  });

  assert.equal(res.ok, true);
  assert.equal(res.dryRun, true);
  assert.ok(Array.isArray(res.would_write) && res.would_write.length > 0);
  assert.equal(res.written, undefined, 'dry-run must not report written files');

  // manifest must survive
  await fs.access(manifestPath);

  // bootstrap must be byte-identical
  const after = await readBootstrap(dir);
  for (const name of BOOTSTRAP_FILES) {
    assert.equal(after[name], before[name], `${name} must be untouched by dry-run`);
  }
});

test('reflect-commit (real) writes files and consumes the manifest; re-run fails missing_manifest', async () => {
  const { dir, manifestPath } = await makeProjectWithManifest();
  const files = await buildFilesPayload(manifestPath);

  const res = await runMemoryReflectCommit({
    args: [dir],
    options: { agent: 'dev', files, json: true },
    logger: makeLogger()
  });
  assert.equal(res.ok, true);
  assert.ok(Array.isArray(res.written) && res.written.length > 0);
  assert.equal(res.dryRun, undefined);

  // a target file actually changed on disk
  const onDisk = await fs.readFile(path.join(dir, res.written[0]), 'utf8');
  assert.match(onDisk, /Updated content for dry-run test\./);

  // manifest consumed
  await assert.rejects(fs.access(manifestPath));

  // re-running the real commit now fails because the manifest is gone
  const again = await runMemoryReflectCommit({
    args: [dir],
    options: { agent: 'dev', files, json: true },
    logger: makeLogger()
  });
  assert.equal(again.ok, false);
  assert.equal(again.error, 'missing_manifest');
  assert.match(again.message, /consumed by a previous successful reflect-commit/);
});

test('reflect-commit --dry-run followed by a real commit both succeed', async () => {
  const { dir, manifestPath } = await makeProjectWithManifest();
  const files = await buildFilesPayload(manifestPath);

  const dry = await runMemoryReflectCommit({
    args: [dir],
    options: { agent: 'dev', files, 'dry-run': true, json: true },
    logger: makeLogger()
  });
  assert.equal(dry.ok, true);
  assert.equal(dry.dryRun, true);

  // because the dry-run preserved the manifest, the real commit works
  const real = await runMemoryReflectCommit({
    args: [dir],
    options: { agent: 'dev', files, json: true },
    logger: makeLogger()
  });
  assert.equal(real.ok, true);
  assert.ok(real.written.length > 0);
  await assert.rejects(fs.access(manifestPath));
});
