'use strict';

// A user's .aioson/config/*.json saved with a UTF-8 BOM (Notepad, Windows
// PowerShell 5) is still the user's valid config: it merges like any other.
// One that truly fails to parse is replaced only after a backup, in every
// mode — `install` opens no backup folder of its own, so the merge does.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { mergeConfigFile } = require('../src/installer-config-merge');
const { installTemplate } = require('../src/installer');

const REL = '.aioson/config/learning-loop.json';
const BOM = String.fromCharCode(0xfeff);

async function makeProject(templateData) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-config-bom-'));
  await fs.mkdir(path.join(dir, '.aioson', 'config'), { recursive: true });
  const templatePath = path.join(dir, 'template.json');
  await fs.writeFile(templatePath, `${JSON.stringify(templateData, null, 2)}\n`, 'utf8');
  return { dir, templatePath, destPath: path.join(dir, REL) };
}

function backupFolders(dir) {
  try {
    return fsSync.readdirSync(path.join(dir, '.aioson', 'backups'));
  } catch {
    return [];
  }
}

test('a config with a BOM merges and keeps the user keys', async () => {
  const { dir, templatePath, destPath } = await makeProject({ version: '1.1', enabled: true, new_key: 'x' });
  await fs.writeFile(destPath, `${BOM}${JSON.stringify({ version: '1.0', enabled: false, mine: 'KEEP' }, null, 2)}\n`, 'utf8');

  const result = await mergeConfigFile({ templatePath, targetDir: dir, relPath: REL });

  assert.equal(result.action, 'merged');
  const merged = JSON.parse(await fs.readFile(destPath, 'utf8'));
  assert.equal(merged.mine, 'KEEP');
  assert.equal(merged.enabled, false, 'user value wins');
  assert.equal(merged.new_key, 'x', 'template key added');
  assert.equal(merged.version, '1.1');
});

test('a config whose only difference is a BOM is left exactly as saved', async () => {
  const data = { version: '1.1', enabled: true };
  const { dir, templatePath, destPath } = await makeProject(data);
  const saved = `${BOM}${JSON.stringify(data, null, 2)}\n`;
  await fs.writeFile(destPath, saved, 'utf8');

  const result = await mergeConfigFile({ templatePath, targetDir: dir, relPath: REL });

  assert.equal(result.action, 'unchanged');
  assert.equal(await fs.readFile(destPath, 'utf8'), saved);
  assert.deepEqual(backupFolders(dir), []);
});

test('a config that differs from the merge result only in formatting is a no-op', async () => {
  const data = { version: '1.1', skip_on_classification: ['MICRO'], dispatch: { claude: { mode: 'native' } } };
  const { dir, templatePath, destPath } = await makeProject(data);
  // The shape a fresh install copies verbatim from the template: compact
  // arrays and objects that JSON.stringify(..., 2) would expand.
  const compact = '{\n  "version": "1.1",\n  "skip_on_classification": ["MICRO"],\n  "dispatch": { "claude": { "mode": "native" } }\n}\n';
  await fs.writeFile(destPath, compact, 'utf8');
  const backupRoot = path.join(dir, '.aioson', 'backups', '2026-01-01T00-00-00');

  const result = await mergeConfigFile({ templatePath, targetDir: dir, relPath: REL, backupRoot });

  assert.equal(result.action, 'unchanged');
  assert.equal(result.backupPath, null);
  assert.equal(await fs.readFile(destPath, 'utf8'), compact);
  assert.deepEqual(backupFolders(dir), []);
});

test('a fresh install followed by update takes no config backup', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-config-reflow-'));
  await installTemplate(dir, { mode: 'install' });

  const update = await installTemplate(dir, { mode: 'update' });

  const configBackups = update.backedUp.filter((rel) => rel.includes('.aioson/config/'));
  assert.deepEqual(configBackups, []);
  assert.deepEqual(update.mergedConfigs.filter((entry) => entry.path.startsWith('.aioson/config/')), []);
});

test('an unparseable config is backed up before replacement even without a backup folder', async () => {
  const { dir, templatePath, destPath } = await makeProject({ version: '1.1', enabled: true });
  await fs.writeFile(destPath, '{ "broken": MY-EDIT ', 'utf8');

  const result = await mergeConfigFile({ templatePath, targetDir: dir, relPath: REL, backupRoot: null });

  assert.equal(result.action, 'invalid_current');
  assert.ok(result.backupPath, 'a backup was taken');
  const rel = path.relative(dir, result.backupPath).split(path.sep).join('/');
  assert.match(rel, /^\.aioson\/backups\/\d{4}-\d{2}-\d{2}T[^/]+\/\.aioson\/config\/learning-loop\.json$/);
  assert.equal(await fs.readFile(result.backupPath, 'utf8'), '{ "broken": MY-EDIT ');
  assert.equal(JSON.parse(await fs.readFile(destPath, 'utf8')).enabled, true);
});

test('an unparseable config in dry-run reports the backup and touches nothing', async () => {
  const { dir, templatePath, destPath } = await makeProject({ version: '1.1' });
  await fs.writeFile(destPath, 'not json', 'utf8');

  const result = await mergeConfigFile({ templatePath, targetDir: dir, relPath: REL, dryRun: true });

  assert.equal(result.action, 'invalid_current');
  assert.ok(result.backupPath);
  assert.equal(await fs.readFile(destPath, 'utf8'), 'not json');
  assert.deepEqual(backupFolders(dir), []);
});

test('install backs up an unparseable config and merges a BOM config', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-config-bom-install-'));
  await installTemplate(dir, { mode: 'install' });
  const configDir = path.join(dir, '.aioson', 'config');
  const [bomFile, badFile] = fsSync.readdirSync(configDir).filter((name) => name.endsWith('.json')).sort();
  const bomData = JSON.parse(await fs.readFile(path.join(configDir, bomFile), 'utf8'));
  bomData.user_custom_key = 'KEEP-ME';
  await fs.writeFile(path.join(configDir, bomFile), `${BOM}${JSON.stringify(bomData, null, 2)}\n`, 'utf8');
  await fs.writeFile(path.join(configDir, badFile), '{ "broken": INSTALL-EDIT ', 'utf8');

  const result = await installTemplate(dir, { mode: 'install' });

  const bomAfter = JSON.parse((await fs.readFile(path.join(configDir, bomFile), 'utf8')).replace(BOM, ''));
  assert.equal(bomAfter.user_custom_key, 'KEEP-ME');
  const badRel = `.aioson/config/${badFile}`;
  const backup = result.backedUp.find((rel) => rel.endsWith(badRel));
  assert.ok(backup, `install reports the backup of ${badRel}`);
  assert.equal(await fs.readFile(path.join(dir, backup), 'utf8'), '{ "broken": INSTALL-EDIT ');
});
