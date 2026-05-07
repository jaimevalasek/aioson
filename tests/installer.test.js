'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { installTemplate, detectExistingInstall, ensureGitGuardBaseline, GIT_GUARD_BASELINE_BLOCK_PATHS } = require('../src/installer');

async function makeTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-installer-'));
}

test('installTemplate creates base installation', async () => {
  const dir = await makeTempDir();
  const result = await installTemplate(dir, { mode: 'install' });

  assert.equal(result.copied.length > 0, true);
  assert.equal(await detectExistingInstall(dir), true);
  assert.equal(await fileExists(path.join(dir, 'CLAUDE.md')), true);
  assert.equal(await fileExists(path.join(dir, '.aioson/config.md')), true);
  assert.equal(await fileExists(path.join(dir, '.aioson/context/.gitkeep')), true);
  assert.equal(await fileExists(path.join(dir, '.aioson/runtime/aios.sqlite')), true);
  assert.equal(result.runtime && result.runtime.dbPath.endsWith(path.join('.aioson', 'runtime', 'aios.sqlite')), true);
});

test('update mode creates backups for managed files', async () => {
  const dir = await makeTempDir();
  await installTemplate(dir, { mode: 'install' });

  const target = path.join(dir, 'AGENTS.md');
  await fs.writeFile(target, '# custom\n', 'utf8');

  const result = await installTemplate(dir, {
    mode: 'update',
    overwrite: true,
    backupOnOverwrite: true
  });

  assert.equal(result.backedUp.length > 0, true);

  const backupsDir = path.join(dir, '.aioson/backups');
  assert.equal(await fileExists(backupsDir), true);
});

test('context folder is preserved during update', async () => {
  const dir = await makeTempDir();
  await installTemplate(dir, { mode: 'install' });

  const contextFile = path.join(dir, '.aioson/context/project.context.md');
  const customContext = 'custom-context';
  await fs.writeFile(contextFile, customContext, 'utf8');

  await installTemplate(dir, {
    mode: 'update',
    overwrite: true,
    backupOnOverwrite: true
  });

  const readBack = await fs.readFile(contextFile, 'utf8');
  assert.equal(readBack, customContext);
});

test('project-local models config is preserved during update', async () => {
  const dir = await makeTempDir();
  await installTemplate(dir, { mode: 'install' });

  const configPath = path.join(dir, 'aioson-models.json');
  const customConfig = `${JSON.stringify({
    preferred_scan_provider: 'deepseek',
    providers: {
      deepseek: {
        api_key: 'sk-custom',
        model: 'deepseek-chat',
        base_url: 'https://api.deepseek.com/v1'
      }
    }
  }, null, 2)}\n`;
  await fs.writeFile(configPath, customConfig, 'utf8');

  await installTemplate(dir, {
    mode: 'update',
    overwrite: true,
    backupOnOverwrite: true
  });

  const readBack = await fs.readFile(configPath, 'utf8');
  assert.equal(readBack, customConfig);
});

test('installTemplate writes Forge metadata and gitignore entry', async () => {
  const dir = await makeTempDir();

  await installTemplate(dir, { mode: 'install' });

  const installMeta = JSON.parse(
    await fs.readFile(path.join(dir, '.aioson', 'install.json'), 'utf8')
  );
  const gitignore = await fs.readFile(path.join(dir, '.gitignore'), 'utf8');

  assert.equal(installMeta.managed_by, 'aioson');
  assert.equal(typeof installMeta.template_version, 'string');
  assert.equal(gitignore.includes('aioson-models.json'), true);
  assert.equal(gitignore.includes('!AGENTS.md'), true);
  assert.equal(gitignore.includes('!.claude/**'), true);
  assert.equal(gitignore.includes('!.gemini/**'), true);
  assert.equal(gitignore.includes('!.aioson/**'), true);
  assert.equal(gitignore.includes('.aioson/agents/'), false, 'agents/ must NOT be gitignored (Codex @ resolution)');
  assert.equal(gitignore.includes('.aioson/locales/'), true);
  assert.equal(gitignore.includes('.aioson/skills/'), true);
  assert.equal(gitignore.includes('.aioson/config.md'), true);
  assert.equal(gitignore.includes('.aioson/runtime/'), true);
  assert.equal(gitignore.includes('.aioson/cloud-imports/'), true);
  assert.equal(gitignore.includes('.aioson/mcp/servers.local.json'), true);
});

test('installTemplate appends keep rules for shared AIOS files even when project already ignores broad folders', async () => {
  const dir = await makeTempDir();
  await fs.writeFile(
    path.join(dir, '.gitignore'),
    '.aioson/\n.claude/\n.gemini/\nAGENTS.md\nCLAUDE.md\nOPENCODE.md\n',
    'utf8'
  );

  await installTemplate(dir, { mode: 'install' });

  const gitignore = await fs.readFile(path.join(dir, '.gitignore'), 'utf8');
  assert.equal(gitignore.includes('.aioson/\n'), true);
  assert.equal(gitignore.includes('!.aioson/**'), true);
  assert.equal(gitignore.includes('.aioson/agents/'), false, 'agents/ must NOT be gitignored (Codex @ resolution)');
  assert.equal(gitignore.includes('.aioson/locales/'), true);
  assert.equal(gitignore.includes('!.claude/**'), true);
  assert.equal(gitignore.includes('!.gemini/**'), true);
  assert.equal(gitignore.includes('!AGENTS.md'), true);
  assert.equal(gitignore.includes('!CLAUDE.md'), true);
  assert.equal(gitignore.includes('!OPENCODE.md'), true);
});

test('design-doc.md is copied to new projects on fresh install', async () => {
  const dir = await makeTempDir();
  const result = await installTemplate(dir, { mode: 'install' });

  const designDoc = path.join(dir, '.aioson/context/design-doc.md');
  assert.equal(await fileExists(designDoc), true, 'design-doc.md must be created on fresh install');
  assert.equal(result.copied.includes('.aioson/context/design-doc.md'), true);
  assert.equal(result.skipped.some(s => s.path === '.aioson/context/design-doc.md'), false);
});

test('git-guard.json is copied to new projects on fresh install', async () => {
  const dir = await makeTempDir();
  const result = await installTemplate(dir, { mode: 'install' });

  const guardConfig = path.join(dir, '.aioson/git-guard.json');
  assert.equal(await fileExists(guardConfig), true, 'git-guard.json must be created on fresh install');
  assert.equal(result.copied.includes('.aioson/git-guard.json'), true);
  assert.equal(result.skipped.some(s => s.path === '.aioson/git-guard.json'), false);
});

test('design-doc.md is preserved on update (not overwritten)', async () => {
  const dir = await makeTempDir();
  await installTemplate(dir, { mode: 'install' });

  const designDoc = path.join(dir, '.aioson/context/design-doc.md');
  const customContent = '# My custom design rules\n';
  await fs.writeFile(designDoc, customContent, 'utf8');

  const result = await installTemplate(dir, {
    mode: 'update',
    overwrite: true,
    backupOnOverwrite: true
  });

  const readBack = await fs.readFile(designDoc, 'utf8');
  assert.equal(readBack, customContent, 'design-doc.md must not be overwritten on update');
  assert.equal(result.skipped.some(s => s.path === '.aioson/context/design-doc.md' && s.reason === 'project-local'), true);
});

test('design governance docs are copied on install and preserved on update', async () => {
  const dir = await makeTempDir();
  const installResult = await installTemplate(dir, { mode: 'install' });

  const governanceRel = '.aioson/design-docs/file-size.md';
  const governancePath = path.join(dir, governanceRel);
  assert.equal(await fileExists(governancePath), true, 'design governance doc must be created on fresh install');
  assert.equal(installResult.copied.includes(governanceRel), true);

  const customContent = '# Custom file size rules\n';
  await fs.writeFile(governancePath, customContent, 'utf8');

  const updateResult = await installTemplate(dir, {
    mode: 'update',
    overwrite: true,
    backupOnOverwrite: true
  });

  const readBack = await fs.readFile(governancePath, 'utf8');
  assert.equal(readBack, customContent, 'design governance docs must not be overwritten on update');
  assert.equal(updateResult.skipped.some(s => s.path === governanceRel && s.reason === 'project-local'), true);
});

test('git-guard.json custom entries are preserved on update (baseline entries are merged in)', async () => {
  const dir = await makeTempDir();
  await installTemplate(dir, { mode: 'install' });

  const guardConfig = path.join(dir, '.aioson/git-guard.json');
  await fs.writeFile(guardConfig, JSON.stringify({
    version: 1,
    allowPaths: ['fixtures/**'],
    blockPaths: ['drafts/**'],
    allowExtensions: [],
    blockExtensions: []
  }, null, 2) + '\n', 'utf8');

  const result = await installTemplate(dir, {
    mode: 'update',
    overwrite: true,
    backupOnOverwrite: true
  });

  const config = JSON.parse(await fs.readFile(guardConfig, 'utf8'));
  // Custom entries must be preserved
  assert.ok(config.allowPaths.includes('fixtures/**'), 'custom allowPaths preserved');
  assert.ok(config.blockPaths.includes('drafts/**'), 'custom blockPaths preserved');
  // Baseline entries must be merged in
  for (const baseline of GIT_GUARD_BASELINE_BLOCK_PATHS) {
    assert.ok(config.blockPaths.includes(baseline), `baseline "${baseline}" must be merged in on update`);
  }
  // File must not have been replaced by the template copy (skipped as project-local)
  assert.equal(result.skipped.some(s => s.path === '.aioson/git-guard.json' && s.reason === 'project-local'), true);
});

test('git-guard.json deleted before update is NOT restored from template', async () => {
  const dir = await makeTempDir();
  await installTemplate(dir, { mode: 'install' });

  const guardConfig = path.join(dir, '.aioson/git-guard.json');
  await fs.unlink(guardConfig);

  const result = await installTemplate(dir, {
    mode: 'update',
    overwrite: true,
    backupOnOverwrite: true
  });

  assert.equal(await fileExists(guardConfig), false, 'git-guard.json must not be restored from template on update');
  assert.equal(result.skipped.some(s => s.path === '.aioson/git-guard.json' && s.reason === 'project-local'), true);
});

test('ensureGitGuardBaseline merges missing baseline blockPaths without removing custom ones', async () => {
  const dir = await makeTempDir();
  const guardPath = path.join(dir, '.aioson/git-guard.json');
  await fs.mkdir(path.join(dir, '.aioson'), { recursive: true });
  await fs.writeFile(guardPath, JSON.stringify({
    version: 1,
    blockPaths: ['done/**', 'references/**']
  }, null, 2) + '\n', 'utf8');

  const added = await ensureGitGuardBaseline(dir);

  const result = JSON.parse(await fs.readFile(guardPath, 'utf8'));
  assert.ok(added > 0, 'should have added missing baseline entries');
  assert.ok(result.blockPaths.includes('done/**'), 'custom entry preserved');
  assert.ok(result.blockPaths.includes('references/**'), 'custom entry preserved');
  for (const baseline of GIT_GUARD_BASELINE_BLOCK_PATHS) {
    assert.ok(result.blockPaths.includes(baseline), `baseline entry "${baseline}" must be present`);
  }
});

test('ensureGitGuardBaseline is idempotent when baseline and full schema already present', async () => {
  const dir = await makeTempDir();
  const guardPath = path.join(dir, '.aioson/git-guard.json');
  await fs.mkdir(path.join(dir, '.aioson'), { recursive: true });
  await fs.writeFile(guardPath, JSON.stringify({
    version: 1,
    allowPaths: [],
    contentAllowPaths: [],
    blockPaths: [...GIT_GUARD_BASELINE_BLOCK_PATHS, 'done/**'],
    allowExtensions: [],
    blockExtensions: []
  }, null, 2) + '\n', 'utf8');

  const added = await ensureGitGuardBaseline(dir);
  assert.equal(added, 0, 'nothing should be added when baseline and all schema fields are already present');
  const result = JSON.parse(await fs.readFile(guardPath, 'utf8'));
  assert.equal(result.blockPaths.length, GIT_GUARD_BASELINE_BLOCK_PATHS.length + 1, 'no duplicate entries');
});

test('ensureGitGuardBaseline initializes missing schema array fields without removing existing data', async () => {
  const dir = await makeTempDir();
  const guardPath = path.join(dir, '.aioson/git-guard.json');
  await fs.mkdir(path.join(dir, '.aioson'), { recursive: true });
  // Older config missing contentAllowPaths and other schema fields — simulates downgrade scenario.
  await fs.writeFile(guardPath, JSON.stringify({
    version: 1,
    blockPaths: ['custom/**']
  }, null, 2) + '\n', 'utf8');

  const added = await ensureGitGuardBaseline(dir);
  assert.ok(added > 0, 'should report mutations when schema fields are missing');

  const result = JSON.parse(await fs.readFile(guardPath, 'utf8'));
  assert.deepEqual(result.allowPaths, [], 'allowPaths must be initialized as []');
  assert.deepEqual(result.contentAllowPaths, [], 'contentAllowPaths must be initialized as []');
  assert.deepEqual(result.allowExtensions, [], 'allowExtensions must be initialized as []');
  assert.deepEqual(result.blockExtensions, [], 'blockExtensions must be initialized as []');
  assert.ok(result.blockPaths.includes('custom/**'), 'existing blockPaths entries must be preserved');
});

test('ensureGitGuardBaseline is called during installTemplate and baseline is present after install', async () => {
  const dir = await makeTempDir();
  await installTemplate(dir, { mode: 'install' });

  const guardPath = path.join(dir, '.aioson/git-guard.json');
  const config = JSON.parse(await fs.readFile(guardPath, 'utf8'));
  for (const baseline of GIT_GUARD_BASELINE_BLOCK_PATHS) {
    assert.ok(config.blockPaths.includes(baseline), `baseline "${baseline}" must be in git-guard after install`);
  }
});

test('detectExistingInstall returns true when only committed markers (no config.md) are present — fresh-clone scenario', async () => {
  const dir = await makeTempDir();
  // Simulate a freshly-cloned project: agents/dev.md committed, config.md gitignored and absent.
  await fs.mkdir(path.join(dir, '.aioson/agents'), { recursive: true });
  await fs.writeFile(path.join(dir, '.aioson/agents/dev.md'), '# dev agent\n', 'utf8');

  assert.equal(await detectExistingInstall(dir), true, 'install must be detected via committed markers even without config.md');
});

test('detectExistingInstall returns false on empty directory', async () => {
  const dir = await makeTempDir();
  assert.equal(await detectExistingInstall(dir), false);
});

test('failed backup during update is recorded in failedBackups but does not block the operation', async () => {
  const dir = await makeTempDir();
  await installTemplate(dir, { mode: 'install' });

  // Force a backup target to a path that cannot be written: replace nowStamp with a colon-bearing
  // value via monkey-patching is intrusive; instead, place a regular file where the backup root
  // would be a directory. The backup will fail on ensureDir(path.dirname(dest)).
  const claudePath = path.join(dir, 'CLAUDE.md');
  await fs.writeFile(claudePath, '# custom\n', 'utf8');

  // Pre-create a regular FILE at .aioson/backups so the next nowStamp() subdir creation under it fails.
  const backupsRoot = path.join(dir, '.aioson/backups');
  await fs.rm(backupsRoot, { recursive: true, force: true }).catch(() => {});
  await fs.writeFile(backupsRoot, 'not a dir', 'utf8');

  // Suppress expected console.warn during the test
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (msg) => warnings.push(msg);

  let result;
  try {
    result = await installTemplate(dir, {
      mode: 'update',
      overwrite: true,
      backupOnOverwrite: true
    });
  } finally {
    console.warn = originalWarn;
  }

  assert.ok(Array.isArray(result.failedBackups), 'result must include failedBackups array');
  assert.ok(result.failedBackups.length > 0, 'at least one backup should have failed');
  assert.ok(result.copied.length > 0, 'update must still proceed and copy files');
  assert.ok(warnings.some((m) => typeof m === 'string' && m.includes('backup of') && m.includes('failed')), 'console.warn must be emitted for at least one failed backup');
});

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
