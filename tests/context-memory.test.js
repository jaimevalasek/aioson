'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {
  buildModuleMemoryRelativePath,
  buildSpecCurrentMarkdown,
  buildSpecHistoryMarkdown,
  buildMemoryIndexMarkdown,
  collectContextCatalog
} = require('../src/context-memory');

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

describe('context-memory.js — buildModuleMemoryRelativePath', () => {
  it('sanitizes folder names with kebab-case', () => {
    assert.equal(buildModuleMemoryRelativePath('src/commands'), '.aioson/context/module-src-commands.md');
    assert.equal(buildModuleMemoryRelativePath('squad/dashboard'), '.aioson/context/module-squad-dashboard.md');
  });

  it('handles empty or unsafe input', () => {
    assert.equal(buildModuleMemoryRelativePath(''), '.aioson/context/module-module.md');
    assert.equal(buildModuleMemoryRelativePath('../../etc'), '.aioson/context/module-etc.md');
  });
});

describe('context-memory.js — buildSpecCurrentMarkdown', () => {
  it('extracts sections from spec content', () => {
    const spec = `---
status: active
---

# Spec

## Stack
Node.js, SQLite

## Current state
Implementing feature X

## In progress
- Task A
- Task B

## Planned
- Task C

## Open decisions
Should we use Redis?

## Notes
Be careful with migrations
`;
    const result = buildSpecCurrentMarkdown(spec, '2026-04-17');
    assert.ok(result.includes('# Spec Current'));
    assert.ok(result.includes('Node.js, SQLite'));
    assert.ok(result.includes('Implementing feature X'));
    assert.ok(result.includes('- Task A'));
    assert.ok(result.includes('- Task C'));
    assert.ok(result.includes('Should we use Redis?'));
    assert.ok(result.includes('Be careful with migrations'));
    assert.ok(result.includes('_Generated from spec.md'));
  });

  it('returns null for empty spec', () => {
    assert.equal(buildSpecCurrentMarkdown('', '2026-04-17'), null);
    assert.equal(buildSpecCurrentMarkdown(null, '2026-04-17'), null);
  });

  it('uses fallback for missing sections', () => {
    const spec = '# Spec\n\n## Stack\nNode.js\n';
    const result = buildSpecCurrentMarkdown(spec, '2026-04-17');
    assert.ok(result.includes('_Not captured in spec.md_'));
  });
});

describe('context-memory.js — buildSpecHistoryMarkdown', () => {
  it('extracts done and decided sections', () => {
    const spec = `---
status: active
---

# Spec

## Done
- Implemented auth
- Added tests

## Decisions taken
Use SQLite over PostgreSQL

## Notes
Migration completed
`;
    const result = buildSpecHistoryMarkdown(spec, '2026-04-17');
    assert.ok(result.includes('# Spec History'));
    assert.ok(result.includes('- Implemented auth'));
    assert.ok(result.includes('Use SQLite over PostgreSQL'));
    assert.ok(result.includes('Migration completed'));
  });

  it('returns null for empty spec', () => {
    assert.equal(buildSpecHistoryMarkdown('', '2026-04-17'), null);
  });
});

describe('context-memory.js — buildMemoryIndexMarkdown', () => {
  it('generates memory index with grouped docs', () => {
    const catalog = [
      { relPath: '.aioson/context/project.context.md', group: 'foundation', readWhen: 'stack info', exists: true },
      { relPath: '.aioson/context/discovery.md', group: 'system', readWhen: 'domain info', exists: true },
      { relPath: '.aioson/context/prd.md', group: 'scope', readWhen: 'product info', exists: false }
    ];
    const result = buildMemoryIndexMarkdown({ generatedAt: '2026-04-17', catalog });
    assert.ok(result.includes('# Memory Index'));
    assert.ok(result.includes('project.context.md'));
    assert.ok(result.includes('discovery.md'));
    assert.ok(result.includes('Foundation Docs'));
    assert.ok(result.includes('System Memory'));
    assert.ok(result.includes('context:brief'));
    assert.ok(!result.includes('full project memory pair'));
    assert.ok(!result.includes('readiness.md'), 'missing legacy artifacts must not be prescribed');
    // prd.md exists=false, so it should not appear in a group table row
    const lines = result.split('\n');
    const tableLines = lines.filter((l) => l.startsWith('| ') && l.includes('.md'));
    assert.ok(tableLines.some((l) => l.includes('project.context.md')));
    assert.ok(tableLines.some((l) => l.includes('discovery.md')));
    assert.ok(!tableLines.some((l) => l.includes('prd.md')), 'non-existent doc should not be in table rows');
  });

  it('handles empty catalog', () => {
    const result = buildMemoryIndexMarkdown({ generatedAt: '2026-04-17', catalog: [] });
    assert.ok(result.includes('_No context documents detected yet_'));
  });
});

describe('context-memory.js — collectContextCatalog (filesystem)', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'context-memory-test-'));
    await ensureDir(path.join(tmpDir, '.aioson', 'context'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('collects static and dynamic docs', async () => {
    await fs.writeFile(path.join(tmpDir, '.aioson', 'context', 'project.context.md'), '---\nname: test\n---\n');
    await fs.writeFile(path.join(tmpDir, '.aioson', 'context', 'discovery.md'), '# Discovery\n');
    await fs.writeFile(path.join(tmpDir, '.aioson', 'context', 'module-auth.md'), '# Module Memory: auth\n');
    await fs.writeFile(path.join(tmpDir, '.aioson', 'context', 'scan-src.md'), '# Folder Scan: src\n');
    await fs.writeFile(path.join(tmpDir, '.aioson', 'context', 'prd-auth.md'), '# PRD Auth\n');
    await fs.writeFile(path.join(tmpDir, '.aioson', 'context', 'spec-auth.md'), '# Spec Auth\n');
    await fs.writeFile(path.join(tmpDir, '.aioson', 'context', 'requirements-auth.md'), '# Requirements\n');

    const catalog = await collectContextCatalog(tmpDir);
    assert.ok(catalog.length > 0);

    const paths = catalog.map((d) => d.relPath);
    assert.ok(paths.includes('.aioson/context/project.context.md'));
    assert.ok(paths.includes('.aioson/context/discovery.md'));
    assert.ok(paths.includes('.aioson/context/module-auth.md'));
    assert.ok(paths.includes('.aioson/context/scan-src.md'));
    assert.ok(paths.includes('.aioson/context/prd-auth.md'));
    assert.ok(paths.includes('.aioson/context/spec-auth.md'));
    assert.ok(paths.includes('.aioson/context/requirements-auth.md'));

    const moduleDoc = catalog.find((d) => d.relPath === '.aioson/context/module-auth.md');
    assert.equal(moduleDoc.group, 'modules');

    const scanDoc = catalog.find((d) => d.relPath === '.aioson/context/scan-src.md');
    assert.equal(scanDoc.group, 'scan');
  });

  it('returns static docs even when files do not exist', async () => {
    const catalog = await collectContextCatalog(tmpDir);
    assert.ok(catalog.length > 0);
    const projectContext = catalog.find((d) => d.relPath === '.aioson/context/project.context.md');
    assert.ok(projectContext);
    assert.equal(projectContext.exists, false);
  });
});
