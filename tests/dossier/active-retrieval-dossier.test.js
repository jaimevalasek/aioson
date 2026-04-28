'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

const { createContextPack } = require('../../src/context-memory');

const ACTIVE_DOSSIER = [
  '---',
  'feature_slug: active-feat',
  'schema_version: "1.0"',
  'created_by: dossier-init',
  'created_at: 2026-04-28T10:00:00Z',
  'status: active',
  'classification: MEDIUM',
  'last_updated_by: dev',
  'last_updated_at: 2026-04-28T12:00:00Z',
  '---',
  '',
  '## Why',
  '',
  'Active feature dossier.',
  '',
  '## What',
  '',
  'Implementation scope.',
  '',
  '## Code Map',
  '',
  '```yaml',
  'files: []',
  'modules: []',
  'patterns: []',
  '```',
  '',
  '## Rules & Design-Docs aplicáveis',
  '',
  '_(vazio)_',
  '',
  '## Agent Trail',
  '',
  '_(vazio)_',
  '',
  '## Revision Requests',
  '',
  '_(vazio)_',
  ''
].join('\n');

const CLOSED_DOSSIER = ACTIVE_DOSSIER.replace('status: active', 'status: closed');

async function makeProject() {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'active-retrieval-test-'));
  const ctxDir = path.join(tmp, '.aioson', 'context');
  await fs.mkdir(ctxDir, { recursive: true });
  // Minimal project.context.md
  await fs.writeFile(path.join(ctxDir, 'project.context.md'), [
    'project_name: test',
    'project_type: script',
    'framework: Node.js',
    'framework_installed: true',
    'classification: MEDIUM',
    'interaction_language: en',
    'conversation_language: en',
    'aioson_version: 1.0'
  ].join('\n'), 'utf8');
  return { tmp, ctxDir };
}

describe('active-retrieval — context:pack includes active dossiers', () => {
  let tmp, ctxDir;

  beforeEach(async () => {
    ({ tmp, ctxDir } = await makeProject());
  });
  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('includes active dossier as ranked source', async () => {
    const dossierDir = path.join(ctxDir, 'features', 'active-feat');
    await fs.mkdir(dossierDir, { recursive: true });
    await fs.writeFile(path.join(dossierDir, 'dossier.md'), ACTIVE_DOSSIER, 'utf8');

    const output = await createContextPack({ targetDir: tmp, agent: 'dev', goal: 'implement active-feat', maxFiles: 10 });
    const paths = output.selectedFiles.map(f => f.path);
    const hasDossier = paths.some(p => p.includes('active-feat') && p.includes('dossier.md'));
    assert.ok(hasDossier, `Expected active-feat/dossier.md in pack, got: ${paths.join(', ')}`);
  });

  it('does NOT include closed dossier', async () => {
    const dossierDir = path.join(ctxDir, 'features', 'closed-feat');
    await fs.mkdir(dossierDir, { recursive: true });
    await fs.writeFile(path.join(dossierDir, 'dossier.md'), CLOSED_DOSSIER, 'utf8');

    const output = await createContextPack({ targetDir: tmp, agent: 'dev', goal: 'implement something', maxFiles: 10 });
    const paths = output.selectedFiles.map(f => f.path);
    const hasClosed = paths.some(p => p.includes('closed-feat') && p.includes('dossier.md'));
    assert.equal(hasClosed, false, 'Closed dossier should not appear in context pack');
  });

  it('completes in < 500ms with multiple active features', async () => {
    for (let i = 0; i < 5; i++) {
      const slug = `feat-${i}`;
      const dir = path.join(ctxDir, 'features', slug);
      await fs.mkdir(dir, { recursive: true });
      const dossier = ACTIVE_DOSSIER.replace('active-feat', slug).replace('active-feat', slug);
      await fs.writeFile(path.join(dir, 'dossier.md'), dossier, 'utf8');
    }

    const start = Date.now();
    await createContextPack({ targetDir: tmp, agent: 'dev', goal: 'work', maxFiles: 10 });
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 500, `context:pack took ${elapsed}ms — should be < 500ms`);
  });
});
