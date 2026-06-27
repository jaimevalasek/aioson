'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { isExcluded, syncAgentsCopy } = require('../src/commands/sync-agents-copy');

test('isExcluded matches rsync excludes + live project-state files', () => {
  // rsync-parity excludes
  assert.equal(isExcluded(path.join('.aioson', 'config.md')), true);
  assert.equal(isExcluded(path.join('.aioson', 'runtime')), true);
  assert.equal(isExcluded(path.join('.aioson', 'runtime', 'state.json')), true);
  assert.equal(isExcluded(path.join('.aioson', 'backups', 'x', 'y.md')), true);
  assert.equal(isExcluded(path.join('.aioson', 'mcp', 'servers.local.json')), true);
  // live project-state — owned by the workspace, never clobbered by template seeds
  assert.equal(isExcluded(path.join('.aioson', 'context', 'project-pulse.md')), true);
  assert.equal(isExcluded(path.join('.aioson', 'context', 'project-map.md')), true);
  assert.equal(isExcluded(path.join('.aioson', 'config', 'learning-loop.json')), true);
  assert.equal(isExcluded(path.join('.aioson', 'git-guard.json')), true);
  // NOT excluded (must still sync)
  assert.equal(isExcluded(path.join('.aioson', 'agents', 'dev.md')), false);
  assert.equal(isExcluded('CLAUDE.md'), false);
  assert.equal(isExcluded('AGENTS.md'), false);
  assert.equal(isExcluded(path.join('.aioson', 'context', 'features.md')), false);
  assert.equal(isExcluded(path.join('.aioson', 'mcp', 'servers.json')), false);
  assert.equal(isExcluded(path.join('.aioson', 'docs', 'config.md.bak')), false);
});

test('syncAgentsCopy mirrors template/ into root, honoring excludes', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-sync-copy-'));
  try {
    const tpl = path.join(root, 'template');
    await fs.mkdir(path.join(tpl, '.aioson', 'agents'), { recursive: true });
    await fs.mkdir(path.join(tpl, '.aioson', 'runtime'), { recursive: true });
    await fs.mkdir(path.join(tpl, '.aioson', 'backups'), { recursive: true });
    await fs.mkdir(path.join(tpl, '.aioson', 'mcp'), { recursive: true });
    await fs.writeFile(path.join(tpl, '.aioson', 'agents', 'dev.md'), 'dev');
    await fs.writeFile(path.join(tpl, '.aioson', 'config.md'), 'cfg');
    await fs.writeFile(path.join(tpl, '.aioson', 'runtime', 'state.json'), '{}');
    await fs.writeFile(path.join(tpl, '.aioson', 'backups', 'old.md'), 'old');
    await fs.writeFile(path.join(tpl, '.aioson', 'mcp', 'servers.local.json'), '{}');
    await fs.writeFile(path.join(tpl, '.aioson', 'mcp', 'servers.json'), '{}');
    await fs.writeFile(path.join(tpl, 'CLAUDE.md'), 'claude');

    const { copied } = await syncAgentsCopy(root);

    const present = async (p) => fs.access(path.join(root, p)).then(() => true, () => false);
    assert.equal(await present(path.join('.aioson', 'agents', 'dev.md')), true);
    assert.equal(await present('CLAUDE.md'), true);
    assert.equal(await present(path.join('.aioson', 'mcp', 'servers.json')), true);
    // excluded
    assert.equal(await present(path.join('.aioson', 'config.md')), false);
    assert.equal(await present(path.join('.aioson', 'runtime', 'state.json')), false);
    assert.equal(await present(path.join('.aioson', 'backups', 'old.md')), false);
    assert.equal(await present(path.join('.aioson', 'mcp', 'servers.local.json')), false);
    assert.ok(copied >= 3, `expected >=3 files copied, got ${copied}`);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
