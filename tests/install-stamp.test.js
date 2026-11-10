'use strict';

// `aioson install` defects a read-only review reproduced:
//   - a plain install (no --force) skipped every existing managed file yet
//     stamped the running CLI's version as template_version, silencing the
//     "template is outdated" warning over old agents;
//   - an explicit --tool was ignored when a saved install profile left it out;
//   - "Existing project detected (N files)" counted the files install had
//     just written, and the scan hint named `--folder=src` to every project;
//   - --dry-run created the missing target directory it reported on.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { installTemplate, readInstallProfile, profileWithTool } = require('../src/installer');
const { runInstall } = require('../src/commands/install');
const { inspectTemplateVersion } = require('../src/template-version-status');
const { getCliVersion } = require('../src/version');
const { createTranslator } = require('../src/i18n');

const { t } = createTranslator('en');
const CODEX_ONLY = { tools: ['codex'], uses: ['development'], design: 'none', locale: 'en' };

async function tmp(t, prefix) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));
  return dir;
}

function collectLogger() {
  const lines = [];
  return { lines, log(line) { lines.push(String(line)); }, error(line) { lines.push(String(line)); }, warn() {} };
}

async function install(dir, options = {}) {
  const logger = collectLogger();
  const result = await runInstall({ args: [dir], options: { 'no-interactive': true, 'no-hooks': true, ...options }, logger, t });
  return { result, output: logger.lines.join('\n') };
}

async function readMeta(dir) {
  return JSON.parse(await fs.readFile(path.join(dir, '.aioson', 'install.json'), 'utf8'));
}

async function patchMeta(dir, patch) {
  await fs.writeFile(path.join(dir, '.aioson', 'install.json'), JSON.stringify({ ...(await readMeta(dir)), ...patch }, null, 2), 'utf8');
}

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

test('a plain install over older managed files keeps the template version it found', async (t) => {
  const dir = await tmp(t, 'aioson-stamp-kept-');
  await installTemplate(dir, { mode: 'install' });
  await patchMeta(dir, { template_version: '1.70.0', template_git_sha: 'abc1234', template_git_date: '2026-01-01' });
  const dev = path.join(dir, '.aioson', 'agents', 'dev.md');
  await fs.writeFile(dev, '# old dev body\n', 'utf8');

  const { result, output } = await install(dir);

  const meta = await readMeta(dir);
  assert.equal(meta.template_version, '1.70.0', 'the old agents are still on disk');
  assert.equal(meta.template_git_sha, 'abc1234');
  assert.equal(meta.template_git_date, '2026-01-01');
  assert.equal(await fs.readFile(dev, 'utf8'), '# old dev body\n');
  assert.equal((await inspectTemplateVersion(dir)).outdated, true, 'preflight and workflow:next keep warning');
  assert.equal(result.templateStampKept, true);
  assert.deepEqual(result.keptManagedFiles, ['.aioson/agents/dev.md']);
  assert.match(output, /1 managed file\(s\) already in the project differ from the AIOSON .* template and were kept as they are/);
});

test('install --force refreshes the template, stamps the CLI version and keeps a rollback copy', async (t) => {
  const dir = await tmp(t, 'aioson-stamp-force-');
  await installTemplate(dir, { mode: 'install' });
  await patchMeta(dir, { template_version: '1.70.0' });
  const dev = path.join(dir, '.aioson', 'agents', 'dev.md');
  await fs.writeFile(dev, '# old dev body\n', 'utf8');

  const { result, output } = await install(dir, { force: true });

  assert.equal((await readMeta(dir)).template_version, await getCliVersion());
  assert.equal(result.templateStampKept, false);
  const backup = result.backedUp.find((rel) => rel.endsWith('.aioson/agents/dev.md'));
  assert.ok(backup, 'the overwritten agent has a rollback copy');
  assert.equal(await fs.readFile(path.join(dir, backup), 'utf8'), '# old dev body\n');
  assert.notEqual(await fs.readFile(dev, 'utf8'), '# old dev body\n');
  assert.match(output, new RegExp(`Backups created: ${result.backedUp.length}`));
});

test('a plain install whose managed files already hold this template stamps the CLI version, line endings aside', async (t) => {
  const dir = await tmp(t, 'aioson-stamp-clone-');
  await installTemplate(dir, { mode: 'install' });
  // A fresh clone: install.json is gitignored, and core.autocrlf turned the
  // committed agents into CRLF without changing a word of them.
  await fs.rm(path.join(dir, '.aioson', 'install.json'));
  const dev = path.join(dir, '.aioson', 'agents', 'dev.md');
  await fs.writeFile(dev, (await fs.readFile(dev, 'utf8')).replace(/\r?\n/g, '\r\n'), 'utf8');

  const { result } = await install(dir);

  assert.deepEqual(result.keptManagedFiles, []);
  assert.equal((await readMeta(dir)).template_version, await getCliVersion());
});

test('an explicit --tool joins a saved profile that leaves it out, so its files are installed and recorded', async (t) => {
  const dir = await tmp(t, 'aioson-tool-profile-');
  await installTemplate(dir, { mode: 'install', installProfile: CODEX_ONLY });
  assert.equal(await exists(path.join(dir, 'CLAUDE.md')), false);

  const { result, output } = await install(dir, { tool: 'claude' });

  assert.equal(await exists(path.join(dir, 'CLAUDE.md')), true);
  assert.equal(await exists(path.join(dir, '.claude', 'commands')), true);
  assert.equal(await exists(path.join(dir, 'AGENTS.md')), true, 'the saved tool keeps its files');
  assert.deepEqual((await readMeta(dir)).install_profile.tools, ['codex', 'claude']);
  assert.deepEqual((await readInstallProfile(dir)).tools, ['codex', 'claude'], 'a later update keeps the claude files');
  assert.deepEqual(result.installProfile.tools, ['codex', 'claude']);
  assert.match(output, /--tool=claude/);
});

test('profileWithTool leaves a profile-less install, a listed tool and an unknown tool alone', () => {
  assert.equal(profileWithTool(null, 'claude'), null);
  assert.equal(profileWithTool(CODEX_ONLY, 'codex'), CODEX_ONLY);
  assert.equal(profileWithTool(CODEX_ONLY, 'gemini'), CODEX_ONLY);
  assert.equal(profileWithTool(CODEX_ONLY, undefined), CODEX_ONLY);
  assert.deepEqual(profileWithTool(CODEX_ONLY, ' Claude ').tools, ['codex', 'claude']);
  assert.deepEqual(CODEX_ONLY.tools, ['codex'], 'the saved profile object is not mutated');
});

test('the existing-project count leaves out what install writes', async (t) => {
  const dir = await tmp(t, 'aioson-count-own-');
  await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: 'demo', dependencies: { express: '^4.0.0' } }), 'utf8');

  const first = await installTemplate(dir, { mode: 'install', frameworkDetection: 'Express' });
  assert.equal(first.projectFileCount, 1);
  assert.ok(!first.isExistingProject);

  const again = await installTemplate(dir, { mode: 'install', frameworkDetection: 'Express' });
  assert.equal(again.projectFileCount, 1, 'a re-install does not count the files the first one wrote');
});

test('the scan hint names a folder the project has, or a placeholder when it has none', async (t) => {
  const laravel = await tmp(t, 'aioson-scan-app-');
  await fs.mkdir(path.join(laravel, 'app', 'Models'), { recursive: true });
  await fs.writeFile(path.join(laravel, 'composer.json'), JSON.stringify({ require: { 'laravel/framework': '^11.0' } }), 'utf8');
  await fs.writeFile(path.join(laravel, 'artisan'), '', 'utf8');
  for (let i = 0; i < 25; i += 1) await fs.writeFile(path.join(laravel, 'app', 'Models', `M${i}.php`), '<?php\n', 'utf8');

  const { result, output } = await install(laravel);
  assert.equal(result.projectFileCount, 27);
  assert.ok(result.isExistingProject);
  assert.equal(result.scanFolder, 'app');
  assert.match(output, /Existing project detected \(27 files\)/);
  assert.match(output, /aioson scan:project \. --folder=app --with-llm/);
  assert.doesNotMatch(output, /--folder=src/);

  const flat = await tmp(t, 'aioson-scan-flat-');
  await fs.writeFile(path.join(flat, 'package.json'), JSON.stringify({ dependencies: { express: '^4.0.0' } }), 'utf8');
  for (let i = 0; i < 22; i += 1) await fs.writeFile(path.join(flat, `f${i}.js`), '', 'utf8');
  const flatRun = await install(flat);
  assert.equal(flatRun.result.scanFolder, null);
  assert.match(flatRun.output, /--folder=<folder>/);

  const withSrc = await tmp(t, 'aioson-scan-src-');
  await fs.mkdir(path.join(withSrc, 'src'));
  await fs.mkdir(path.join(withSrc, 'lib'));
  await fs.writeFile(path.join(withSrc, 'src', 'index.js'), '', 'utf8');
  for (let i = 0; i < 5; i += 1) await fs.writeFile(path.join(withSrc, 'lib', `l${i}.js`), '', 'utf8');
  assert.equal((await installTemplate(withSrc, { mode: 'install', dryRun: true })).scanFolder, 'src');
});

test('install --dry-run leaves a missing target directory missing', async (t) => {
  const parent = await tmp(t, 'aioson-dry-missing-');
  const dir = path.join(parent, 'not-yet');

  const { result, output } = await install(dir, { 'dry-run': true });

  assert.ok(result.copied.length > 0, 'the dry run still reports what it would copy');
  assert.match(output, /DRY RUN/);
  assert.equal(await exists(dir), false);
});
