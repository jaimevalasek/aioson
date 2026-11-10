'use strict';

// install, update and setup all regenerate the native permission files. A run
// whose output equals what is on disk must not rewrite them nor open a backup
// folder: rollback retention keeps only the newest few folders, so no-op runs
// used to evict the backup that held a real edit.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { generatePermissions } = require('../src/permissions-generator');
const { installTemplate } = require('../src/installer');

const PROTOCOL = {
  version: '1.1',
  tiers: {
    tier1_silent: { shell_patterns: ['git status'], aioson_commands: ['preflight'] },
    tier3_blocking: { shell_patterns: ['git push *'], aioson_commands: ['cloud:publish:*'] }
  },
  tools: {
    claude: { mode: 'trusted', derived_from_tiers: ['tier1_silent'] },
    codex: { mode: 'trusted', derived_from_tiers: ['tier1_silent'] },
    opencode: { mode: 'guarded', derived_from_tiers: ['tier1_silent'], requires_tty: true }
  }
};
const OUTPUTS = ['.claude/settings.json', '.codex/permissions.json', '.opencode/permissions.yaml'];

async function makeProject() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-perm-churn-'));
  await fs.mkdir(path.join(dir, '.aioson', 'config'), { recursive: true });
  await fs.writeFile(
    path.join(dir, '.aioson', 'config', 'autonomy-protocol.json'),
    JSON.stringify(PROTOCOL, null, 2),
    'utf8'
  );
  return dir;
}

function backupFolders(dir) {
  try {
    return fsSync.readdirSync(path.join(dir, '.aioson', 'backups'));
  } catch {
    return [];
  }
}

test('generatePermissions leaves byte-identical outputs alone and opens no backup folder', async () => {
  const dir = await makeProject();
  const first = await generatePermissions(dir);
  assert.deepEqual(first.written.sort(), [...OUTPUTS].sort());
  assert.deepEqual(first.backedUp, [], 'nothing existed to back up');

  const second = await generatePermissions(dir);

  assert.deepEqual(second.written, []);
  assert.deepEqual(second.unchanged.sort(), [...OUTPUTS].sort());
  assert.deepEqual(second.backedUp, []);
  assert.deepEqual(backupFolders(dir), []);
});

test('generatePermissions backs up and rewrites only the output that changed', async () => {
  const dir = await makeProject();
  await generatePermissions(dir);
  const codexPath = path.join(dir, '.codex', 'permissions.json');
  await fs.writeFile(codexPath, '{ "hand": "edited" }\n', 'utf8');

  const result = await generatePermissions(dir);

  assert.deepEqual(result.written, ['.codex/permissions.json']);
  assert.equal(result.backedUp.length, 1);
  assert.equal(await fs.readFile(path.join(dir, result.backedUp[0]), 'utf8'), '{ "hand": "edited" }\n');
  assert.deepEqual(result.unchanged.sort(), ['.claude/settings.json', '.opencode/permissions.yaml']);
});

test('generatePermissions re-stamps an identical output older than the protocol without a backup', async () => {
  const dir = await makeProject();
  await generatePermissions(dir);
  const past = new Date(Date.now() - 60_000);
  const claudePath = path.join(dir, '.claude', 'settings.json');
  await fs.utimes(claudePath, past, past);
  const protocolMtime = (await fs.stat(path.join(dir, '.aioson', 'config', 'autonomy-protocol.json'))).mtimeMs;

  const result = await generatePermissions(dir);

  assert.deepEqual(result.written, ['.claude/settings.json']);
  assert.deepEqual(result.backedUp, [], 'same bytes: nothing to keep');
  assert.ok((await fs.stat(claudePath)).mtimeMs >= protocolMtime, 'no longer reads as drift');
  assert.deepEqual(backupFolders(dir), []);
});

test('generatePermissions in dry-run reports identical outputs as unchanged', async () => {
  const dir = await makeProject();
  await generatePermissions(dir);

  const result = await generatePermissions(dir, { dryRun: true });

  assert.deepEqual(result.written, []);
  assert.equal(result.unchanged.length, OUTPUTS.length);
});

test('generatePermissions reads a protocol saved with a BOM', async () => {
  const dir = await makeProject();
  const protocolPath = path.join(dir, '.aioson', 'config', 'autonomy-protocol.json');
  await fs.writeFile(protocolPath, String.fromCharCode(0xfeff) + JSON.stringify(PROTOCOL, null, 2), 'utf8');

  const result = await generatePermissions(dir);

  assert.equal(result.missing, false);
  assert.deepEqual(result.written.sort(), [...OUTPUTS].sort());
});

test('a repeated install keeps the permission files without a new backup folder', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-perm-churn-install-'));
  await installTemplate(dir, { mode: 'install' });
  const before = backupFolders(dir);

  const again = await installTemplate(dir, { mode: 'install' });

  assert.deepEqual(again.permissions.written, []);
  assert.ok(again.permissions.unchanged.length > 0);
  assert.deepEqual(backupFolders(dir), before);
});
