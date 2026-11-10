'use strict';

// `aioson init` defects a read-only review reproduced:
//   - `init --force` skipped the downgrade guard `install --force` enforces
//     and kept no rollback copy of the files it overwrote;
//   - init resolved its target with path.resolve, so a path inside `.aioson/`
//     scaffolded a whole nested project in the framework's own storage;
//   - `init --dry-run` created the directory it reported on.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { runInit } = require('../src/commands/init');
const { runInstall } = require('../src/commands/install');
const { getCliVersion } = require('../src/version');
const { createTranslator } = require('../src/i18n');

const { t: translate } = createTranslator('en');
const quiet = { log() {}, error() {}, warn() {} };
const BASE = { 'no-interactive': true, 'no-hooks': true };

async function tmp(t, prefix) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));
  return dir;
}

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function readMeta(dir) {
  return JSON.parse(await fs.readFile(path.join(dir, '.aioson', 'install.json'), 'utf8'));
}

// A project a newer CLI updated, with an agent the user edited since.
async function newerProject(t) {
  const parent = await tmp(t, 'aioson-init-guard-');
  const dir = path.join(parent, 'app');
  await runInit({ args: [dir], options: BASE, logger: quiet, t: translate });
  const meta = await readMeta(dir);
  await fs.writeFile(path.join(dir, '.aioson', 'install.json'), JSON.stringify({ ...meta, template_version: '9.9.9' }), 'utf8');
  const qa = path.join(dir, '.aioson', 'agents', 'qa.md');
  await fs.writeFile(qa, '# user-edited qa\n', 'utf8');
  return { dir, qa };
}

test('init --force refuses a downgrade with the same message install --force gives', async (t) => {
  const { dir, qa } = await newerProject(t);

  const installError = await runInstall({ args: [dir], options: { ...BASE, force: true }, logger: quiet, t: translate }).then(() => null, (error) => error);
  const initError = await runInit({ args: [dir], options: { ...BASE, force: true }, logger: quiet, t: translate }).then(() => null, (error) => error);

  assert.ok(installError, 'install --force refuses');
  assert.ok(initError, 'init --force refuses');
  assert.equal(initError.message, installError.message);
  assert.match(initError.message, /9\.9\.9/);
  assert.equal(await fs.readFile(qa, 'utf8'), '# user-edited qa\n');
  assert.equal((await readMeta(dir)).template_version, '9.9.9');
});

test('init --force --allow-downgrade overwrites only after keeping a rollback copy', async (t) => {
  const { dir, qa } = await newerProject(t);
  const logger = { lines: [], log(line) { this.lines.push(String(line)); }, error() {}, warn() {} };

  const result = await runInit({ args: [dir], options: { ...BASE, force: true, 'allow-downgrade': true }, logger, t: translate });

  const backup = result.backedUp.find((rel) => rel.endsWith('.aioson/agents/qa.md'));
  assert.ok(backup, 'the edited agent has a rollback copy');
  assert.equal(await fs.readFile(path.join(dir, backup), 'utf8'), '# user-edited qa\n');
  assert.notEqual(await fs.readFile(qa, 'utf8'), '# user-edited qa\n');
  assert.equal((await readMeta(dir)).template_version, await getCliVersion());
  assert.ok(logger.lines.some((line) => line === `Backups created: ${result.backedUp.length}`));
});

test('init into a path inside .aioson resolves to the project that owns it instead of nesting one', async (t) => {
  const parent = await tmp(t, 'aioson-init-nested-');
  const owner = path.join(parent, 'meu app');
  await runInit({ args: [owner], options: BASE, logger: quiet, t: translate });
  const inside = path.join(owner, '.aioson', 'context', 'novo');

  await assert.rejects(
    runInit({ args: [inside], options: BASE, logger: quiet, t: translate }),
    (error) => error.message.includes(translate('init.non_empty_dir', { targetDir: owner }))
  );
  assert.equal(await exists(inside), false);
  assert.equal(await exists(path.join(inside, '.aioson')), false);
});

test('init --dry-run leaves the directory it reports on uncreated', async (t) => {
  const parent = await tmp(t, 'aioson-init-dry-');
  const dir = path.join(parent, 'ghost');

  const result = await runInit({ args: [dir], options: { ...BASE, 'dry-run': true }, logger: quiet, t: translate });

  assert.ok(result.copied.length > 0, 'the dry run still reports what it would copy');
  assert.equal(await exists(dir), false);
});
