'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  mergeJsonAdditive,
  mergeArrayUnion,
  isConfigMergePath,
  isPlainObject,
  mergeConfigFile,
  TEMPLATE_OWNED_KEYS
} = require('../src/installer-config-merge');
const { installTemplate } = require('../src/installer');

async function makeTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-config-merge-'));
}

async function fileExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function readJson(p) {
  return JSON.parse(await fs.readFile(p, 'utf8'));
}

test('mergeJsonAdditive: adds missing keys from template, preserves user values', () => {
  const template = { version: '1.1', global_mode: 'guarded', new_field: 'x' };
  const current = { version: '1.0', global_mode: 'strict' };
  const merged = mergeJsonAdditive(template, current);
  assert.equal(merged.version, '1.1');           // template-owned
  assert.equal(merged.global_mode, 'strict');    // user-preserved
  assert.equal(merged.new_field, 'x');           // newly added
});

test('mergeJsonAdditive: deeply merges nested objects', () => {
  const template = {
    tiers: {
      tier1_silent: { aioson_commands: ['a', 'b'] },
      tier3_blocking: { description: 'new tier' }
    }
  };
  const current = {
    tiers: {
      tier1_silent: { aioson_commands: ['a', 'my-cmd'], description: 'user override' }
    }
  };
  const merged = mergeJsonAdditive(template, current);
  assert.deepEqual(merged.tiers.tier1_silent.aioson_commands.sort(), ['a', 'b', 'my-cmd'].sort());
  assert.equal(merged.tiers.tier1_silent.description, 'user override');
  assert.equal(merged.tiers.tier3_blocking.description, 'new tier');
});

test('mergeArrayUnion: dedups primitives preserving user order', () => {
  const merged = mergeArrayUnion(['user-1', 'shared', 'user-2'], ['shared', 'template-1', 'template-2']);
  assert.deepEqual(merged, ['user-1', 'shared', 'user-2', 'template-1', 'template-2']);
});

test('mergeArrayUnion: handles arrays of objects via structural equality', () => {
  const merged = mergeArrayUnion(
    [{ id: 1 }, { id: 2 }],
    [{ id: 2 }, { id: 3 }]
  );
  assert.deepEqual(merged, [{ id: 1 }, { id: 2 }, { id: 3 }]);
});

test('mergeJsonAdditive: type mismatch — user value wins', () => {
  // User changed a string field to an array (or vice versa) — respect them.
  const template = { mode: 'guarded' };
  const current = { mode: ['custom1', 'custom2'] };
  const merged = mergeJsonAdditive(template, current);
  assert.deepEqual(merged.mode, ['custom1', 'custom2']);
});

test('TEMPLATE_OWNED_KEYS includes version and $schema', () => {
  assert.equal(TEMPLATE_OWNED_KEYS.has('version'), true);
  assert.equal(TEMPLATE_OWNED_KEYS.has('$schema'), true);
});

test('isConfigMergePath identifies .aioson/config/*.json only', () => {
  assert.equal(isConfigMergePath('.aioson/config/autonomy-protocol.json'), true);
  assert.equal(isConfigMergePath('.aioson/config/learning-loop.json'), true);
  assert.equal(isConfigMergePath('.aioson/config/scout-engine.json'), true);
  assert.equal(isConfigMergePath('.aioson/config/nested/deep.json'), false);
  assert.equal(isConfigMergePath('.aioson/config.md'), false);
  assert.equal(isConfigMergePath('.aioson/agents/dev.md'), false);
  assert.equal(isConfigMergePath('aioson-models.json'), false);
});

test('isPlainObject distinguishes objects from arrays and null', () => {
  assert.equal(isPlainObject({}), true);
  assert.equal(isPlainObject({ a: 1 }), true);
  assert.equal(isPlainObject([]), false);
  assert.equal(isPlainObject(null), false);
  assert.equal(isPlainObject('str'), false);
  assert.equal(isPlainObject(42), false);
});

test('mergeConfigFile: creates file when destination is absent', async () => {
  const dir = await makeTempDir();
  const templatePath = path.join(dir, 'template-autonomy.json');
  await fs.writeFile(templatePath, JSON.stringify({ version: '1.1', new_field: 'x' }, null, 2), 'utf8');

  const result = await mergeConfigFile({
    templatePath,
    targetDir: dir,
    relPath: '.aioson/config/autonomy-protocol.json',
    backupRoot: path.join(dir, '.aioson/backups/ts1')
  });

  assert.equal(result.action, 'created');
  assert.equal(result.backupPath, null);
  const written = await readJson(path.join(dir, '.aioson/config/autonomy-protocol.json'));
  assert.equal(written.version, '1.1');
  assert.equal(written.new_field, 'x');
});

test('mergeConfigFile: merges user customizations with new template defaults', async () => {
  const dir = await makeTempDir();
  const relPath = '.aioson/config/autonomy-protocol.json';
  const destPath = path.join(dir, relPath);
  await fs.mkdir(path.dirname(destPath), { recursive: true });

  await fs.writeFile(destPath, JSON.stringify({
    version: '1.0',
    global_mode: 'strict',
    tiers: { tier1_silent: { aioson_commands: ['my-cmd'] } }
  }, null, 2) + '\n', 'utf8');

  const templatePath = path.join(dir, 'template.json');
  await fs.writeFile(templatePath, JSON.stringify({
    version: '1.1',
    global_mode: 'guarded',
    tiers: {
      tier1_silent: { aioson_commands: ['ctx:load', 'memory:status'] },
      tier3_blocking: { shell_patterns: ['git push *'] }
    }
  }, null, 2), 'utf8');

  const result = await mergeConfigFile({
    templatePath,
    targetDir: dir,
    relPath,
    backupRoot: path.join(dir, '.aioson/backups/ts1')
  });

  assert.equal(result.action, 'merged');
  assert.ok(result.backupPath, 'backup path should be set');

  const merged = await readJson(destPath);
  assert.equal(merged.version, '1.1');                              // template-owned key
  assert.equal(merged.global_mode, 'strict');                       // user-preserved
  assert.ok(merged.tiers.tier1_silent.aioson_commands.includes('my-cmd'));
  assert.ok(merged.tiers.tier1_silent.aioson_commands.includes('ctx:load'));
  assert.ok(merged.tiers.tier3_blocking);                           // new tier added

  // backup was created
  const backupPath = path.join(dir, '.aioson/backups/ts1', relPath);
  assert.equal(await fileExists(backupPath), true);
  const backup = await readJson(backupPath);
  assert.equal(backup.version, '1.0');                              // original preserved in backup
  assert.equal(backup.global_mode, 'strict');
});

test('mergeConfigFile: no-op when current already matches merged output', async () => {
  const dir = await makeTempDir();
  const relPath = '.aioson/config/scout-engine.json';
  const destPath = path.join(dir, relPath);
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  await fs.writeFile(destPath, '{}\n', 'utf8');

  const templatePath = path.join(dir, 'template-scout.json');
  await fs.writeFile(templatePath, '{}\n', 'utf8');

  const result = await mergeConfigFile({
    templatePath,
    targetDir: dir,
    relPath,
    backupRoot: path.join(dir, '.aioson/backups/ts2')
  });

  assert.equal(result.action, 'unchanged');
  assert.equal(result.backupPath, null);
});

test('mergeConfigFile: corrupted current is backed up and replaced', async () => {
  const dir = await makeTempDir();
  const relPath = '.aioson/config/learning-loop.json';
  const destPath = path.join(dir, relPath);
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  await fs.writeFile(destPath, '{ this is :: not valid json', 'utf8');

  const templatePath = path.join(dir, 'template-ll.json');
  const templateContent = JSON.stringify({ enabled: true, timeout_ms: 5000 }, null, 2);
  await fs.writeFile(templatePath, templateContent, 'utf8');

  const result = await mergeConfigFile({
    templatePath,
    targetDir: dir,
    relPath,
    backupRoot: path.join(dir, '.aioson/backups/ts3')
  });

  assert.equal(result.action, 'invalid_current');
  assert.ok(result.backupPath);
  const written = await readJson(destPath);
  assert.equal(written.enabled, true);
});

test('mergeConfigFile: dry-run produces no filesystem mutations', async () => {
  const dir = await makeTempDir();
  const relPath = '.aioson/config/autonomy-protocol.json';
  const destPath = path.join(dir, relPath);
  await fs.mkdir(path.dirname(destPath), { recursive: true });

  const original = JSON.stringify({ version: '1.0', custom: 'value' }, null, 2) + '\n';
  await fs.writeFile(destPath, original, 'utf8');

  const templatePath = path.join(dir, 'template.json');
  await fs.writeFile(templatePath, JSON.stringify({ version: '1.1', new_thing: 'x' }, null, 2), 'utf8');

  const backupRoot = path.join(dir, '.aioson/backups/ts4');
  const result = await mergeConfigFile({
    templatePath,
    targetDir: dir,
    relPath,
    backupRoot,
    dryRun: true
  });

  assert.equal(result.action, 'merged');
  const afterDryRun = await fs.readFile(destPath, 'utf8');
  assert.equal(afterDryRun, original);                              // unchanged on disk
  assert.equal(await fileExists(backupRoot), false);                // no backup written
});

test('installTemplate (fresh install): config files are created via merge path', async () => {
  const dir = await makeTempDir();
  const result = await installTemplate(dir, { mode: 'install' });

  assert.equal(Array.isArray(result.mergedConfigs), true);
  const autonomyEntry = result.mergedConfigs.find((m) => m.path === '.aioson/config/autonomy-protocol.json');
  assert.ok(autonomyEntry, 'autonomy-protocol.json should appear in mergedConfigs');
  assert.equal(autonomyEntry.action, 'created');
  assert.equal(await fileExists(path.join(dir, '.aioson/config/autonomy-protocol.json')), true);
});

test('installTemplate (update): preserves user customization in autonomy-protocol.json', async () => {
  const dir = await makeTempDir();
  await installTemplate(dir, { mode: 'install' });

  const configPath = path.join(dir, '.aioson/config/autonomy-protocol.json');
  const current = await readJson(configPath);
  current.global_mode = 'strict';
  current.tiers.tier1_silent.aioson_commands.push('user-only-cmd');
  await fs.writeFile(configPath, JSON.stringify(current, null, 2) + '\n', 'utf8');

  const result = await installTemplate(dir, {
    mode: 'update',
    overwrite: true,
    backupOnOverwrite: true
  });

  const after = await readJson(configPath);
  assert.equal(after.global_mode, 'strict', 'user override of global_mode must survive');
  assert.ok(
    after.tiers.tier1_silent.aioson_commands.includes('user-only-cmd'),
    'user-added command must survive'
  );
  assert.ok(
    after.tiers.tier1_silent.aioson_commands.length >= current.tiers.tier1_silent.aioson_commands.length,
    'merge must not drop user entries'
  );

  // The current template == new template in this test, so user customization
  // is a fixed point of the merge — action lands as 'unchanged'. The key
  // contract under test is that customizations survive, not the action label.
  assert.equal(Array.isArray(result.mergedConfigs), true);
  const merged = result.mergedConfigs.find((m) => m.path === '.aioson/config/autonomy-protocol.json');
  const skippedAsUnchanged = result.skipped.find(
    (s) => s.path === '.aioson/config/autonomy-protocol.json' && s.reason === 'unchanged'
  );
  assert.ok(merged || skippedAsUnchanged, 'config must be tracked as merged or unchanged');
});

test('installTemplate (update): config files bypass selectiveUpdate (new configs are created)', async () => {
  const dir = await makeTempDir();
  await installTemplate(dir, { mode: 'install' });

  // Simulate an older project state by deleting one of the new configs.
  const newConfigPath = path.join(dir, '.aioson/config/learning-loop.json');
  await fs.unlink(newConfigPath);
  assert.equal(await fileExists(newConfigPath), false);

  // Update with selectiveUpdate=true (legacy mode, opt-in via `aioson update --selective` since 1.9.2).
  await installTemplate(dir, {
    mode: 'update',
    overwrite: true,
    backupOnOverwrite: true,
    selectiveUpdate: true
  });

  // The new config should have been recreated regardless of selectiveUpdate.
  assert.equal(await fileExists(newConfigPath), true, 'learning-loop.json must be created even with selectiveUpdate=true');
  const lc = await readJson(newConfigPath);
  assert.equal(typeof lc, 'object');
});
