'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { installTemplate } = require('../src/installer');
const { createTranslator } = require('../src/i18n');
const { runUpdate } = require('../src/commands/update');

async function makeTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-update-'));
}

async function readRepoTemplate(relPath) {
  return fs.readFile(path.resolve(__dirname, '..', 'template', relPath), 'utf8');
}

// Every real (non-dry-run) runUpdate below passes 'no-hooks': true — the
// default hooks install would otherwise write machine-global AI tool settings
// during the test run.
function createQuietLogger() {
  return {
    log() {},
    error() {}
  };
}

test('update reapplies canonical prompts from project context language', async () => {
  const dir = await makeTempDir();
  await installTemplate(dir, { mode: 'install' });

  const contextPath = path.join(dir, '.aioson/context/project.context.md');
  const contextContent = `---
project_name: "demo"
project_type: "web_app"
profile: "developer"
framework: "Node"
framework_installed: true
classification: "MICRO"
interaction_language: "es"
conversation_language: "es"
aioson_version: "0.1.8"
---

# Project Context
`;
  await fs.writeFile(contextPath, contextContent, 'utf8');

  const { t } = createTranslator('en');
  const logger = createQuietLogger();
  const result = await runUpdate({
    args: [dir],
    options: { 'no-hooks': true },
    logger,
    t
  });

  assert.equal(result.ok, true);
  assert.equal(Boolean(result.localeSync), true);
  assert.equal(result.localeSync.locale, 'es');
  assert.equal(result.localeSync.promptLocale, 'en');
  assert.equal(
    await fs.readFile(path.join(dir, '.aioson/agents/setup.md'), 'utf8'),
    await readRepoTemplate('.aioson/agents/setup.md')
  );
});

test('update honors explicit --lang override for canonical prompt synchronization', async () => {
  const dir = await makeTempDir();
  await installTemplate(dir, { mode: 'install' });

  const contextPath = path.join(dir, '.aioson/context/project.context.md');
  const contextContent = `---
project_name: "demo"
project_type: "web_app"
profile: "developer"
framework: "Node"
framework_installed: true
classification: "MICRO"
interaction_language: "es"
conversation_language: "es"
aioson_version: "0.1.9"
---

# Project Context
`;
  await fs.writeFile(contextPath, contextContent, 'utf8');

  const { t } = createTranslator('en');
  const logger = createQuietLogger();
  const result = await runUpdate({
    args: [dir],
    options: { lang: 'fr', 'no-hooks': true },
    logger,
    t
  });

  assert.equal(result.ok, true);
  assert.equal(Boolean(result.localeSync), true);
  assert.equal(result.localeSync.locale, 'fr');
  assert.equal(result.localeSync.promptLocale, 'en');
  assert.equal(
    await fs.readFile(path.join(dir, '.aioson/agents/setup.md'), 'utf8'),
    await readRepoTemplate('.aioson/agents/setup.md')
  );
});

test('update --dry-run with --lang plans locale sync without mutating files', async () => {
  const dir = await makeTempDir();
  await installTemplate(dir, { mode: 'install' });

  const contextPath = path.join(dir, '.aioson/context/project.context.md');
  const contextContent = `---
project_name: "demo"
project_type: "web_app"
profile: "developer"
framework: "Node"
framework_installed: true
classification: "MICRO"
interaction_language: "en"
conversation_language: "en"
aioson_version: "0.1.9"
---

# Project Context
`;
  await fs.writeFile(contextPath, contextContent, 'utf8');

  const setupPath = path.join(dir, '.aioson/agents/setup.md');
  const before = await fs.readFile(setupPath, 'utf8');

  const { t } = createTranslator('en');
  const logger = createQuietLogger();
  const result = await runUpdate({
    args: [dir],
    options: { 'dry-run': true, lang: 'pt-BR' },
    logger,
    t
  });

  assert.equal(result.ok, true);
  assert.equal(Boolean(result.localeSync), true);
  assert.equal(result.localeSync.locale, 'pt-BR');
  assert.equal(result.localeSync.promptLocale, 'en');
  assert.equal(result.localeSync.dryRun, true);

  const after = await fs.readFile(setupPath, 'utf8');
  assert.equal(after, before);
});

test('update default brings new template files into projects on older versions', async () => {
  const dir = await makeTempDir();
  await installTemplate(dir, { mode: 'install' });

  const contextPath = path.join(dir, '.aioson/context/project.context.md');
  await fs.writeFile(contextPath, `---
project_name: "demo"
project_type: "web_app"
profile: "developer"
framework: "Node"
framework_installed: true
classification: "MICRO"
interaction_language: "en"
conversation_language: "en"
aioson_version: "1.8.0"
---

# Project Context
`, 'utf8');

  // Simulate a project that was installed on an older release that did not
  // yet ship briefing.md (the cypher → briefing rebrand in 0d40a4b).
  const briefingAgent = path.join(dir, '.aioson/agents/briefing.md');
  const briefingCmd = path.join(dir, '.claude/commands/aioson/agent/briefing.md');
  await fs.unlink(briefingAgent);
  await fs.unlink(briefingCmd);

  const { t } = createTranslator('en');
  const result = await runUpdate({
    args: [dir],
    options: { 'no-hooks': true },
    logger: createQuietLogger(),
    t
  });

  assert.equal(result.ok, true);
  assert.equal(await fileExists(briefingAgent), true, 'briefing agent prompt must be restored by default update');
  assert.equal(await fileExists(briefingCmd), true, 'briefing slash command must be restored by default update');
});

test('update --selective preserves the legacy conservative mode (new files are skipped)', async () => {
  const dir = await makeTempDir();
  await installTemplate(dir, { mode: 'install' });

  const contextPath = path.join(dir, '.aioson/context/project.context.md');
  await fs.writeFile(contextPath, `---
project_name: "demo"
project_type: "web_app"
profile: "developer"
framework: "Node"
framework_installed: true
classification: "MICRO"
interaction_language: "en"
conversation_language: "en"
aioson_version: "1.8.0"
---

# Project Context
`, 'utf8');

  const briefingAgent = path.join(dir, '.aioson/agents/briefing.md');
  await fs.unlink(briefingAgent);

  const { t } = createTranslator('en');
  const result = await runUpdate({
    args: [dir],
    options: { selective: true, 'no-hooks': true },
    logger: createQuietLogger(),
    t
  });

  assert.equal(result.ok, true);
  assert.equal(await fileExists(briefingAgent), false, 'selective update must preserve legacy skip behavior for absent files');
});

test('update refreshes framework integration docs and preserves project-owned integration docs', async () => {
  const dir = await makeTempDir();
  await installTemplate(dir, { mode: 'install' });

  const officialRel = '.aioson/docs/integrations/dashboard-app-form-publish-mapping.md';
  const officialPath = path.join(dir, officialRel);
  const projectOwnedPath = path.join(dir, '.aioson/docs/integrations/project-owned-connector.md');
  const projectOwnedContent = '# Project connector\n\nKeep this local integration note.\n';

  await fs.writeFile(officialPath, '# Old framework integration doc\n', 'utf8');
  await fs.writeFile(projectOwnedPath, projectOwnedContent, 'utf8');

  const { t } = createTranslator('en');
  const result = await runUpdate({
    args: [dir],
    options: { 'no-hooks': true },
    logger: createQuietLogger(),
    t
  });

  assert.equal(result.ok, true);
  assert.equal(await fs.readFile(officialPath, 'utf8'), await readRepoTemplate(officialRel));
  assert.equal(await fs.readFile(projectOwnedPath, 'utf8'), projectOwnedContent);
  assert.equal(
    result.backedUp.some((file) => file.endsWith(officialRel)),
    true,
    'managed framework integration doc should be backed up before overwrite'
  );
});

async function fileExists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

// ─── Downgrade guard ─────────────────────────────────────────────────────────
// The template copy comes from the installed CLI's own bundle, so a stale
// global CLI running `update` on a newer project would mass-downgrade every
// managed file. install.json's template_version is the project side of the
// comparison.

async function stampTemplateVersion(dir, version) {
  const metaPath = path.join(dir, '.aioson/install.json');
  const data = JSON.parse(await fs.readFile(metaPath, 'utf8'));
  data.template_version = version;
  await fs.writeFile(metaPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

test('update blocks when the project template is newer than the CLI', async () => {
  const dir = await makeTempDir();
  await installTemplate(dir, { mode: 'install' });
  await stampTemplateVersion(dir, '999.0.0');

  const { t } = createTranslator('en');
  await assert.rejects(
    () => runUpdate({ args: [dir], options: { 'no-hooks': true }, logger: createQuietLogger(), t }),
    (err) => {
      assert.match(err.message, /999\.0\.0/);
      assert.match(err.message, /--allow-downgrade/);
      return true;
    }
  );
});

test('update --allow-downgrade proceeds past the downgrade guard', async () => {
  const dir = await makeTempDir();
  await installTemplate(dir, { mode: 'install' });
  await stampTemplateVersion(dir, '999.0.0');

  const { t } = createTranslator('en');
  const result = await runUpdate({
    args: [dir],
    options: { 'no-hooks': true, 'allow-downgrade': true },
    logger: createQuietLogger(),
    t
  });
  assert.equal(result.ok, true);
});

test('update proceeds when template_version is absent or unparseable', async () => {
  const dir = await makeTempDir();
  await installTemplate(dir, { mode: 'install' });
  await stampTemplateVersion(dir, 'not-a-version');

  const { t } = createTranslator('en');
  const result = await runUpdate({
    args: [dir],
    options: { 'no-hooks': true },
    logger: createQuietLogger(),
    t
  });
  assert.equal(result.ok, true, 'unknown project version must not block the update');
});

test('a fresh clone (no install.json) still refuses a CLI older than the committed project context', async () => {
  // install.json is gitignored: every clone and CI checkout lacked the stamp,
  // the guard switched off, and an older CLI rewrote the committed agents.
  const dir = await makeTempDir();
  await installTemplate(dir, { mode: 'install' });
  await fs.rm(path.join(dir, '.aioson/install.json'));
  const contextPath = path.join(dir, '.aioson/context/project.context.md');
  await fs.mkdir(path.dirname(contextPath), { recursive: true });
  await fs.writeFile(contextPath, '---\nproject_name: "x"\naioson_version: "999.0.0"\n---\n', 'utf8');

  const { t } = createTranslator('en');
  await assert.rejects(
    () => runUpdate({ args: [dir], options: { 'no-hooks': true }, logger: createQuietLogger(), t }),
    (err) => {
      assert.match(err.message, /AIOSON 999\.0\.0 \(\.aioson\/context\/project\.context\.md\)/);
      assert.equal(err.jsonCode, 'downgrade_blocked');
      assert.equal(err.jsonDetails.project_version, '999.0.0');
      return true;
    }
  );
});

test('the refusal names the running copy of the CLI, and a `v`-prefixed stamp is still a version', async () => {
  // Several copies of the CLI coexist (global, npm link, an app's bundled
  // copy); "update the CLI" meant nothing to someone whose global was current.
  const dir = await makeTempDir();
  await installTemplate(dir, { mode: 'install' });
  await stampTemplateVersion(dir, 'v999.0.0');
  const { t } = createTranslator('en');
  const repoRoot = path.join(__dirname, '..');
  await assert.rejects(
    () => runUpdate({ args: [dir], options: { 'no-hooks': true }, logger: createQuietLogger(), t }),
    (err) => {
      assert.ok(err.message.includes(`(${repoRoot})`), err.message);
      assert.equal(err.jsonDetails.cli_root, repoRoot);
      assert.equal(err.jsonDetails.project_version_source, '.aioson/install.json');
      return true;
    }
  );
});

test('update reports the version it moved the project from, to, and with which CLI', async () => {
  const { getCliVersionSync } = require('../src/version');
  const dir = await makeTempDir();
  await installTemplate(dir, { mode: 'install' });
  await stampTemplateVersion(dir, '0.1.0');
  const lines = [];
  const { t } = createTranslator('en');
  const result = await runUpdate({
    args: [dir],
    options: { 'no-hooks': true },
    logger: { log: (line) => lines.push(String(line)), error() {} },
    t
  });
  assert.equal(result.templateVersionBefore, '0.1.0');
  assert.equal(result.templateVersionAfter, getCliVersionSync());
  assert.equal(result.cliRoot, path.join(__dirname, '..'));
  assert.ok(lines.some((line) => /^Template version applied: .+ \(was 0\.1\.0; CLI at .+\)$/.test(line)), lines.join('\n'));

  const preview = [];
  await runUpdate({
    args: [dir],
    options: { 'no-hooks': true, 'dry-run': true },
    logger: { log: (line) => preview.push(String(line)), error() {} },
    t
  });
  assert.ok(preview.some((line) => line.startsWith('Update preview (dry run, nothing written)')), preview.join('\n'));
  assert.ok(!preview.some((line) => line.startsWith('Template version applied')), 'a dry run applies nothing');
});

test('--json: the downgrade refusal is a machine-readable code with both versions', () => {
  const { spawnSync } = require('node:child_process');
  const fsSync = require('node:fs');
  const dir = fsSync.mkdtempSync(path.join(os.tmpdir(), 'aioson-update-json-'));
  fsSync.mkdirSync(path.join(dir, '.aioson'), { recursive: true });
  fsSync.writeFileSync(path.join(dir, '.aioson/install.json'), JSON.stringify({ managed_by: 'aioson', template_version: '999.0.0' }));
  fsSync.mkdirSync(path.join(dir, '.aioson/agents'), { recursive: true });
  fsSync.writeFileSync(path.join(dir, '.aioson/agents/dev.md'), '# dev\n');
  const cli = path.join(__dirname, '..', 'bin', 'aioson.js');
  const res = spawnSync(process.execPath, [cli, 'update', dir, '--json', '--no-hooks'], { encoding: 'utf8' });
  assert.equal(res.status, 1, res.stderr);
  const out = JSON.parse(res.stdout);
  assert.equal(out.error.code, 'downgrade_blocked');
  assert.equal(out.error.details.project_version, '999.0.0');
  assert.match(out.error.details.cli_version, /^\d+\.\d+\.\d+/);
});

test('install --force hits the same downgrade guard (no backups in install mode)', async () => {
  const { runInstall } = require('../src/commands/install');
  const dir = await makeTempDir();
  await installTemplate(dir, { mode: 'install' });
  await stampTemplateVersion(dir, '999.0.0');

  const { t } = createTranslator('en');
  await assert.rejects(
    () => runInstall({
      args: [dir],
      options: { force: true, 'no-hooks': true, 'no-interactive': true },
      logger: createQuietLogger(),
      t
    }),
    /--allow-downgrade/
  );

  // Without overwrite the guard stays out of the way — plain install on an
  // existing project only fills gaps and must keep working from any CLI.
  const result = await runInstall({
    args: [dir],
    options: { 'no-hooks': true, 'no-interactive': true },
    logger: createQuietLogger(),
    t
  });
  assert.ok(result, 'non-overwrite install proceeds');
});

test('update measures framework-managed files still tracked despite the gitignore policy and names the remedy', async () => {
  const { execFileSync } = require('node:child_process');
  const dir = await makeTempDir();
  await installTemplate(dir, { mode: 'install' });
  const git = (args) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
  git(['init']);
  git(['config', 'user.email', 'test@example.com']);
  git(['config', 'user.name', 'Test User']);
  // A project that committed managed files before the policy line existed.
  git(['add', '-f', '--', '.aioson/tasks/squad-create.md', '.aioson/agents/dev.md']);
  git(['commit', '-q', '-m', 'legacy']);

  const lines = [];
  const { t } = createTranslator('en');
  const result = await runUpdate({
    args: [dir],
    options: { 'no-hooks': true },
    logger: { log: (line) => lines.push(String(line)), error() {} },
    t
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.trackedIgnored, ['.aioson/tasks/squad-create.md']);
  assert.ok(lines.some((line) => /1 framework-managed file\(s\) are still tracked/.test(line)), lines.join('\n'));
  assert.ok(lines.some((line) => line.includes('git rm -r --cached -- .aioson/tasks')), lines.join('\n'));
});
