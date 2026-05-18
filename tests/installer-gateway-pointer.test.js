'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { installTemplate } = require('../src/installer');
const { MARKER_BEGIN, MARKER_END, BLOCK_NOTICE } = require('../src/gateway-pointer-merge');

async function makeTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-gateway-'));
}

async function fileExists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

test('fresh install wraps CLAUDE.md template in AIOSON markers', async () => {
  const dir = await makeTempDir();
  await installTemplate(dir, { mode: 'install' });

  const content = await fs.readFile(path.join(dir, 'CLAUDE.md'), 'utf8');
  assert.ok(content.includes(MARKER_BEGIN), 'BEGIN marker missing');
  assert.ok(content.includes(MARKER_END), 'END marker missing');
  assert.ok(content.includes('You operate as AIOSON.'), 'template body missing');
});

test('install into existing CLAUDE.md preserves user content and appends managed block', async () => {
  const dir = await makeTempDir();
  const userContent = '# My Project\n\nProject-specific notes only the user wrote.\n';
  await fs.writeFile(path.join(dir, 'CLAUDE.md'), userContent, 'utf8');

  await installTemplate(dir, { mode: 'install' });

  const content = await fs.readFile(path.join(dir, 'CLAUDE.md'), 'utf8');
  assert.ok(content.startsWith('# My Project'), 'user content was clobbered');
  assert.ok(content.includes('Project-specific notes only the user wrote.'));
  assert.ok(content.includes(MARKER_BEGIN));
  assert.ok(content.includes(MARKER_END));
  assert.ok(content.includes('You operate as AIOSON.'));
});

test('re-install replaces the AIOSON block in place without duplicating it', async () => {
  const dir = await makeTempDir();
  await installTemplate(dir, { mode: 'install' });

  const target = path.join(dir, 'CLAUDE.md');
  const original = await fs.readFile(target, 'utf8');
  const tampered = original.replace('You operate as AIOSON.', 'You operate as STALE-VERSION.');
  await fs.writeFile(target, `# User header above\n\n${tampered}`, 'utf8');

  await installTemplate(dir, { mode: 'update', overwrite: true, backupOnOverwrite: true });

  const content = await fs.readFile(target, 'utf8');
  assert.ok(content.startsWith('# User header above'), 'user content above block was lost');
  assert.equal(content.match(new RegExp(MARKER_BEGIN, 'g')).length, 1, 'block was duplicated instead of replaced');
  assert.ok(!content.includes('STALE-VERSION'), 'old block content survived the update');
  assert.ok(content.includes('You operate as AIOSON.'), 'fresh template body missing');
});

test('managed block carries an explicit warning that edits inside will be overwritten', async () => {
  const dir = await makeTempDir();
  await installTemplate(dir, { mode: 'install' });

  for (const rel of ['CLAUDE.md', 'AGENTS.md', 'OPENCODE.md', '.gemini/GEMINI.md']) {
    const content = await fs.readFile(path.join(dir, rel), 'utf8');
    const beginIdx = content.indexOf(MARKER_BEGIN);
    const endIdx = content.indexOf(MARKER_END);
    assert.ok(beginIdx !== -1 && endIdx !== -1, `${rel} missing markers`);
    const block = content.slice(beginIdx, endIdx);
    assert.ok(block.includes(BLOCK_NOTICE), `${rel} missing the managed-block warning`);
    assert.ok(block.indexOf(BLOCK_NOTICE) < block.indexOf('# AIOSON'), `${rel} warning must appear before the template body`);
  }
});

test('all four gateway pointers receive the managed block on fresh install', async () => {
  const dir = await makeTempDir();
  await installTemplate(dir, { mode: 'install' });

  for (const rel of ['CLAUDE.md', 'AGENTS.md', 'OPENCODE.md', '.gemini/GEMINI.md']) {
    const p = path.join(dir, rel);
    assert.equal(await fileExists(p), true, `${rel} not created`);
    const content = await fs.readFile(p, 'utf8');
    assert.ok(content.includes(MARKER_BEGIN), `${rel} missing BEGIN marker`);
    assert.ok(content.includes(MARKER_END), `${rel} missing END marker`);
  }
});
