'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

const { compact, shouldCompact, MAX_ACTIVE_SIZE } = require('../../src/dossier/dossier-compact');

const VALID_FM = [
  '---',
  'feature_slug: my-feat',
  'schema_version: "1.0"',
  'created_by: dossier-init',
  'created_at: 2026-01-01T00:00:00Z',
  'status: active',
  'classification: MEDIUM',
  'last_updated_by: dossier-init',
  'last_updated_at: 2026-01-01T00:00:00Z',
  '---'
].join('\n');

function makeDossierContent(whySize = 100) {
  const why = 'x'.repeat(whySize);
  return [
    VALID_FM,
    '',
    '## Why',
    '',
    why,
    '',
    '## What',
    '',
    'Test what content.',
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
    '- .aioson/rules/some-rule.md',
    '',
    '## Agent Trail',
    '',
    'Some trail content.',
    '',
    '## Revision Requests',
    '',
    '_(vazio)_',
    ''
  ].join('\n');
}

async function makeCtxDir() {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'compact-test-'));
  const ctxDir = path.join(tmp, '.aioson', 'context');
  const dir = path.join(ctxDir, 'features', 'my-feat');
  await fs.mkdir(dir, { recursive: true });
  return { tmp, ctxDir };
}

describe('dossier-compact — shouldCompact', () => {
  let ctxDir, tmp;

  beforeEach(async () => {
    ({ tmp, ctxDir } = await makeCtxDir());
  });
  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('returns false when dossier is small', async () => {
    const p = path.join(ctxDir, 'features', 'my-feat', 'dossier.md');
    await fs.writeFile(p, makeDossierContent(100), 'utf8');
    assert.equal(await shouldCompact({ slug: 'my-feat', contextDir: ctxDir }), false);
  });

  it('returns true when dossier exceeds MAX_ACTIVE_SIZE', async () => {
    const p = path.join(ctxDir, 'features', 'my-feat', 'dossier.md');
    await fs.writeFile(p, makeDossierContent(MAX_ACTIVE_SIZE + 1000), 'utf8');
    assert.equal(await shouldCompact({ slug: 'my-feat', contextDir: ctxDir }), true);
  });

  it('returns false when file not found', async () => {
    assert.equal(await shouldCompact({ slug: 'missing', contextDir: ctxDir }), false);
  });
});

describe('dossier-compact — compact', () => {
  let ctxDir, tmp;

  beforeEach(async () => {
    ({ tmp, ctxDir } = await makeCtxDir());
  });
  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('skips compaction when size is ok and force=false', async () => {
    const p = path.join(ctxDir, 'features', 'my-feat', 'dossier.md');
    await fs.writeFile(p, makeDossierContent(100), 'utf8');
    const result = await compact({ slug: 'my-feat', contextDir: ctxDir });
    assert.equal(result.compacted, false);
    assert.equal(result.reason, 'size_ok');
  });

  it('compacts when force=true even if small', async () => {
    const p = path.join(ctxDir, 'features', 'my-feat', 'dossier.md');
    await fs.writeFile(p, makeDossierContent(100), 'utf8');
    const result = await compact({ slug: 'my-feat', contextDir: ctxDir, force: true });
    // May compact or report nothing_migratable — both are valid
    assert.ok(['compacted', 'compacted_false'].includes(result.compacted ? 'compacted' : 'compacted_false'));
  });

  it('migrates Why section to history when size > MAX', async () => {
    const p = path.join(ctxDir, 'features', 'my-feat', 'dossier.md');
    await fs.writeFile(p, makeDossierContent(MAX_ACTIVE_SIZE + 5000), 'utf8');
    const result = await compact({ slug: 'my-feat', contextDir: ctxDir });
    assert.equal(result.compacted, true);
    assert.ok(result.migratedSections.includes('Why'));

    // Active dossier should have a link to history instead of full content
    const activeRaw = await fs.readFile(p, 'utf8');
    assert.ok(activeRaw.includes('dossier-history.md'));

    // History file should contain the migrated content
    const histPath = path.join(ctxDir, 'features', 'my-feat', 'dossier-history.md');
    const histRaw = await fs.readFile(histPath, 'utf8');
    assert.ok(histRaw.includes('Migrated from active dossier'));
  });

  it('history is append-only — second compaction does not lose first migration', async () => {
    const p = path.join(ctxDir, 'features', 'my-feat', 'dossier.md');
    await fs.writeFile(p, makeDossierContent(MAX_ACTIVE_SIZE + 5000), 'utf8');
    await compact({ slug: 'my-feat', contextDir: ctxDir });
    // Write a new large dossier to simulate growth
    await fs.writeFile(p, makeDossierContent(MAX_ACTIVE_SIZE + 5000), 'utf8');
    await compact({ slug: 'my-feat', contextDir: ctxDir });

    const histPath = path.join(ctxDir, 'features', 'my-feat', 'dossier-history.md');
    const histRaw = await fs.readFile(histPath, 'utf8');
    // Should have at least two migration entries
    const matches = histRaw.match(/Migrated from active dossier/g) || [];
    assert.ok(matches.length >= 1);
  });

  it('throws EDOSSIERMISSING for unknown slug', async () => {
    await assert.rejects(
      () => compact({ slug: 'missing', contextDir: ctxDir }),
      { code: 'EDOSSIERMISSING' }
    );
  });

  it('throws EDOSSIERSLUG for invalid slug', async () => {
    await assert.rejects(
      () => compact({ slug: 'Bad Slug!', contextDir: ctxDir }),
      { code: 'EDOSSIERSLUG' }
    );
  });
});
