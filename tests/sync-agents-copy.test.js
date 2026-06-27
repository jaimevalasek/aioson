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

test('syncAgentsCopy refreshes an existing AIOSON-managed gateway block instead of clobbering it', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-sync-gw-'));
  try {
    const tpl = path.join(root, 'template');
    await fs.mkdir(tpl, { recursive: true });
    await fs.writeFile(path.join(tpl, 'AGENTS.md'), '# AIOSON\nNEW template body line\n');
    const existing = [
      '# My project notes (keep me)',
      '',
      '<!-- AIOSON:BEGIN -->',
      '> Managed by AIOSON — edits inside this block will be overwritten on `aioson update`. Put project-specific rules above or below this block.',
      '',
      '# AIOSON',
      'OLD template body line',
      '<!-- AIOSON:END -->',
      '',
      '# My footer notes (keep me too)',
      ''
    ].join('\n');
    await fs.writeFile(path.join(root, 'AGENTS.md'), existing);

    await syncAgentsCopy(root);

    const after = await fs.readFile(path.join(root, 'AGENTS.md'), 'utf8');
    assert.ok(after.includes('<!-- AIOSON:BEGIN -->'), 'BEGIN marker preserved');
    assert.ok(after.includes('<!-- AIOSON:END -->'), 'END marker preserved');
    assert.ok(after.includes('# My project notes (keep me)'), 'content above block preserved');
    assert.ok(after.includes('# My footer notes (keep me too)'), 'content below block preserved');
    assert.ok(after.includes('NEW template body line'), 'block body refreshed from template');
    assert.ok(!after.includes('OLD template body line'), 'stale block body replaced');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('syncAgentsCopy is idempotent for managed gateway trailing blank lines', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-sync-gw-'));
  try {
    const tpl = path.join(root, 'template');
    await fs.mkdir(tpl, { recursive: true });
    await fs.writeFile(path.join(tpl, 'OPENCODE.md'), '# AIOSON\nstable body\n');
    const existing = [
      '<!-- AIOSON:BEGIN -->',
      '> Managed by AIOSON — edits inside this block will be overwritten on `aioson update`. Put project-specific rules above or below this block.',
      '',
      '# AIOSON',
      'old body',
      '<!-- AIOSON:END -->',
      '',
      ''
    ].join('\n');
    await fs.writeFile(path.join(root, 'OPENCODE.md'), existing);

    await syncAgentsCopy(root);
    const first = await fs.readFile(path.join(root, 'OPENCODE.md'), 'utf8');
    await syncAgentsCopy(root);
    const second = await fs.readFile(path.join(root, 'OPENCODE.md'), 'utf8');

    assert.equal(second, first);
    assert.ok(!second.endsWith('\n\n'), 'managed gateway should not accumulate blank lines at EOF');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('syncAgentsCopy plain-copies a gateway file that has no managed block (raw, no block added)', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-sync-gw-'));
  try {
    const tpl = path.join(root, 'template');
    await fs.mkdir(tpl, { recursive: true });
    await fs.writeFile(path.join(tpl, 'CLAUDE.md'), '# AIOSON\nraw body\n');
    await fs.writeFile(path.join(root, 'CLAUDE.md'), '# AIOSON\nold raw\n'); // no managed block
    await syncAgentsCopy(root);
    const after = await fs.readFile(path.join(root, 'CLAUDE.md'), 'utf8');
    assert.equal(after, '# AIOSON\nraw body\n', 'raw gateway file mirrored verbatim — no block injected');
    assert.ok(!after.includes('AIOSON:BEGIN'), 'no managed block added to a previously-unmanaged file');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
