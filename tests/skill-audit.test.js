'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { runSkillAudit } = require('../src/commands/skill-audit');

const mockLogger = { log: () => {}, error: () => {}, warn: () => {} };

async function writeFileEnsured(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
}

describe('skill-audit.js — runSkillAudit', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-audit-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('returns no_files when no skill markdown exists', async () => {
    const result = await runSkillAudit({
      args: [tmpDir],
      options: { json: true },
      logger: mockLogger
    });

    assert.equal(result.ok, false);
    assert.equal(result.reason, 'no_files');
  });

  it('reports builtin, installed, and template skill costs', async () => {
    await writeFileEnsured(path.join(tmpDir, '.aioson', 'skills', 'process', 'alpha', 'SKILL.md'), '# Alpha\n');
    await writeFileEnsured(path.join(tmpDir, '.aioson', 'skills', 'process', 'alpha', 'references', 'deep.md'), 'A'.repeat(80));
    await writeFileEnsured(path.join(tmpDir, '.aioson', 'installed-skills', 'beta', 'SKILL.md'), '# Beta\n');
    await writeFileEnsured(path.join(tmpDir, 'template', '.aioson', 'skills', 'static', 'gamma.md'), '# Gamma\n');

    const result = await runSkillAudit({
      args: [tmpDir],
      options: { json: true },
      logger: mockLogger
    });

    assert.equal(result.ok, true);
    assert.equal(result.totals.files, 4);
    assert.equal(result.totals.routers, 2);
    assert.equal(result.totals.references, 1);
    assert.equal(result.totals.support, 1);
    assert.ok(result.totals.tokens > 0);
    assert.ok(result.files.some((file) => file.category === 'builtin_skill' && file.kind === 'router'));
    assert.ok(result.files.some((file) => file.category === 'installed_skill'));
    assert.ok(result.files.some((file) => file.category === 'template_skill'));
    assert.ok(result.files.some((file) => file.file.endsWith('references/deep.md') && file.kind === 'reference'));
  });
});
