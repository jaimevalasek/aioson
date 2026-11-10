'use strict';

// What setup, setup:context and the agent-prompt sync overwrite is backed up
// first under .aioson/backups/<stamp>/<relative path>; what they would rewrite
// byte for byte is neither rewritten nor backed up; and the saved install
// profile decides which agent prompts are written at all.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createTranslator } = require('../src/i18n');
const { installTemplate, TEMPLATE_DIR } = require('../src/installer');
const { applyAgentLocale } = require('../src/locales');
const { saveProjectContext, describeContextChanges } = require('../src/context-writer');
const { runSetupContext } = require('../src/commands/setup-context');

const { t } = createTranslator('en');
const DEV_PROFILE = { tools: ['claude'], uses: ['development'], design: 'none', locale: 'en' };

async function makeTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-setup-backups-'));
}

function collectLogger() {
  const lines = [];
  return { lines, log: (line) => lines.push(String(line)), error: (line) => lines.push(String(line)) };
}

function backupFolders(dir) {
  try {
    return fsSync.readdirSync(path.join(dir, '.aioson', 'backups'));
  } catch {
    return [];
  }
}

const CONTEXT = (name, stamp) => [
  '---',
  `project_name: "${name}"`,
  `generated_at: "${stamp}"`,
  '---',
  '',
  '# Project Context',
  ''
].join('\n');

test('saveProjectContext backs up a different context before replacing it', async () => {
  const dir = await makeTempDir();
  await saveProjectContext(dir, `${CONTEXT('orig', '2026-01-01')}\n## My notes\n`);

  const result = await saveProjectContext(dir, CONTEXT('outro', '2026-02-02'));

  assert.equal(result.action, 'updated');
  assert.match(result.backupPath, /^\.aioson\/backups\/[^/]+\/\.aioson\/context\/project\.context\.md$/);
  const backup = await fs.readFile(path.join(dir, result.backupPath), 'utf8');
  assert.match(backup, /## My notes/);
  assert.deepEqual(result.changes.fields, [{ field: 'project_name', from: '"orig"', to: '"outro"' }]);
  assert.equal(result.changes.bodyChanged, true);
  assert.match(await fs.readFile(result.filePath, 'utf8'), /project_name: "outro"/);
});

test('saveProjectContext leaves a context that differs only in generated_at untouched', async () => {
  const dir = await makeTempDir();
  const first = await saveProjectContext(dir, CONTEXT('same', '2026-01-01'));
  assert.equal(first.action, 'created');
  assert.equal(first.backupPath, null);

  const second = await saveProjectContext(dir, CONTEXT('same', '2026-03-03'));

  assert.equal(second.action, 'unchanged');
  assert.equal(second.backupPath, null);
  assert.match(await fs.readFile(second.filePath, 'utf8'), /generated_at: "2026-01-01"/);
  assert.deepEqual(backupFolders(dir), []);
});

test('saveProjectContext in dry-run reports the backup it would take and writes nothing', async () => {
  const dir = await makeTempDir();
  await saveProjectContext(dir, CONTEXT('orig', '2026-01-01'));

  const result = await saveProjectContext(dir, CONTEXT('outro', '2026-02-02'), { dryRun: true });

  assert.equal(result.action, 'updated');
  assert.ok(result.backupPath);
  assert.equal(fsSync.existsSync(path.join(dir, result.backupPath)), false);
  assert.match(await fs.readFile(result.filePath, 'utf8'), /project_name: "orig"/);
  assert.deepEqual(backupFolders(dir), []);
});

test('describeContextChanges ignores generated_at and an identical body', () => {
  const changes = describeContextChanges(CONTEXT('a', '1'), CONTEXT('a', '2'));
  assert.deepEqual(changes, { fields: [], bodyChanged: false });
});

test('applyAgentLocale backs up an edited prompt and leaves canonical ones alone', async () => {
  const dir = await makeTempDir();
  await installTemplate(dir, { mode: 'install' });
  const devPath = path.join(dir, '.aioson', 'agents', 'dev.md');
  await fs.appendFile(devPath, '\n## MY-EDIT\n');

  const result = await applyAgentLocale(dir, 'pt-BR');

  assert.deepEqual(result.written.map((entry) => entry.target), ['.aioson/agents/dev.md']);
  assert.equal(result.backedUp.length, 1);
  assert.match(result.backedUp[0], /^\.aioson\/backups\/[^/]+\/\.aioson\/agents\/dev\.md$/);
  assert.match(await fs.readFile(path.join(dir, result.backedUp[0]), 'utf8'), /## MY-EDIT/);
  assert.equal(
    await fs.readFile(devPath, 'utf8'),
    await fs.readFile(path.join(TEMPLATE_DIR, '.aioson', 'agents', 'dev.md'), 'utf8')
  );
  assert.ok(result.unchanged.length > 0, 'canonical prompts reported unchanged');
  assert.equal(result.copied.length, result.written.length + result.unchanged.length);

  const again = await applyAgentLocale(dir, 'pt-BR');
  assert.deepEqual(again.written, []);
  assert.deepEqual(again.backedUp, []);
  assert.equal(backupFolders(dir).length, 1, 'a no-op run adds no backup folder');
});

test('applyAgentLocale in dry-run neither backs up nor overwrites an edited prompt', async () => {
  const dir = await makeTempDir();
  await installTemplate(dir, { mode: 'install' });
  const devPath = path.join(dir, '.aioson', 'agents', 'dev.md');
  await fs.appendFile(devPath, '\n## MY-EDIT\n');
  const before = await fs.readFile(devPath, 'utf8');

  const result = await applyAgentLocale(dir, 'en', { dryRun: true });

  assert.equal(result.backedUp.length, 1);
  assert.equal(await fs.readFile(devPath, 'utf8'), before);
  assert.deepEqual(backupFolders(dir), []);
});

test('applyAgentLocale honors the saved install profile', async () => {
  const dir = await makeTempDir();
  await installTemplate(dir, { mode: 'install', installProfile: DEV_PROFILE });
  const squadPath = path.join(dir, '.aioson', 'agents', 'squad.md');
  assert.equal(fsSync.existsSync(squadPath), false, 'the profile left squads out');

  const result = await applyAgentLocale(dir, 'pt-BR');

  for (const agent of ['squad', 'orache', 'genome', 'profiler-forge']) {
    assert.equal(fsSync.existsSync(path.join(dir, '.aioson', 'agents', `${agent}.md`)), false, `${agent}.md not written back`);
    assert.ok(
      result.skipped.some((entry) => entry.target === `.aioson/agents/${agent}.md` && entry.reason === 'not-in-profile'),
      `${agent}.md reported as outside the profile`
    );
  }

  const unfiltered = await applyAgentLocale(dir, 'en', { installProfile: null });
  assert.ok(unfiltered.written.some((entry) => entry.target === '.aioson/agents/squad.md'), 'an explicit null profile means every agent');
});

test('a plain install whose saved profile names a locale backs up an edited agent prompt', async () => {
  const { runInstall } = require('../src/commands/install');
  const dir = await makeTempDir();
  await installTemplate(dir, { mode: 'install', installProfile: { ...DEV_PROFILE, locale: 'pt-BR' } });
  const qaPath = path.join(dir, '.aioson', 'agents', 'qa.md');
  await fs.appendFile(qaPath, '\n## MY-QA-EDIT\n');

  const result = await runInstall({
    args: [dir],
    options: { 'no-interactive': true, 'no-hooks': true },
    logger: collectLogger(),
    t
  });

  assert.deepEqual(result.localeApply.written.map((entry) => entry.target), ['.aioson/agents/qa.md']);
  assert.equal(result.localeApply.backedUp.length, 1);
  assert.match(await fs.readFile(path.join(dir, result.localeApply.backedUp[0]), 'utf8'), /## MY-QA-EDIT/);
  assert.equal(fsSync.existsSync(path.join(dir, '.aioson', 'agents', 'squad.md')), false, 'profile still honored');
});

test('setup:context --defaults twice backs up the edited context once and nothing on the identical re-run', async () => {
  const dir = await makeTempDir();
  await installTemplate(dir, { mode: 'install' });
  await runSetupContext({ args: [dir], options: { defaults: true }, logger: collectLogger(), t });
  const contextPath = path.join(dir, '.aioson', 'context', 'project.context.md');
  await fs.appendFile(contextPath, '\n## Refined by @setup\n');

  const logger = collectLogger();
  const second = await runSetupContext({ args: [dir], options: { defaults: true }, logger, t });

  assert.equal(second.contextWrite.action, 'updated');
  assert.match(await fs.readFile(path.join(dir, second.contextWrite.backupPath), 'utf8'), /## Refined by @setup/);
  assert.ok(logger.lines.some((line) => line.startsWith('Previous context file backed up to: .aioson/backups/')));
  const folders = backupFolders(dir);
  assert.equal(folders.length, 1);

  const third = await runSetupContext({ args: [dir], options: { defaults: true }, logger: collectLogger(), t });

  assert.equal(third.contextWrite.action, 'unchanged');
  assert.deepEqual(third.localeApplyResult.written, []);
  assert.deepEqual(backupFolders(dir), folders, 'an identical re-run takes no backup');
});
