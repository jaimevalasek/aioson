'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

const { initFromExisting } = require('../../src/dossier/dossier-bootstrap');

async function makeCtxDir() {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'bootstrap-test-'));
  const ctxDir = path.join(tmp, '.aioson', 'context');
  await fs.mkdir(ctxDir, { recursive: true });
  return { tmp, ctxDir };
}

const PRD_CONTENT = [
  '# PRD — test-feat',
  '',
  '## Problem',
  '',
  'Users need a better way to track features.',
  '',
  '## Escopo do MVP',
  '',
  'Implement feature dossier MVP.'
].join('\n');

const SPEC_CONTENT = [
  '---',
  'feature: test-feat',
  'status: in_progress',
  '---',
  '',
  '# Spec — test-feat',
  '',
  '## Key decisions',
  '',
  '- Use YAML embedded in dossier.md'
].join('\n');

describe('dossier-bootstrap — initFromExisting', () => {
  let ctxDir, tmp;

  beforeEach(async () => {
    ({ tmp, ctxDir } = await makeCtxDir());
  });
  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('creates dossier from prd + spec artifacts', async () => {
    await fs.writeFile(path.join(ctxDir, 'prd-test-feat.md'), PRD_CONTENT, 'utf8');
    await fs.writeFile(path.join(ctxDir, 'spec-test-feat.md'), SPEC_CONTENT, 'utf8');

    const result = await initFromExisting({ slug: 'test-feat', contextDir: ctxDir, targetDir: tmp });
    assert.equal(result.created, true);
    assert.ok(result.path.includes('dossier.md'));
    assert.ok(result.artifactsFound.includes('prd'));
    assert.ok(result.artifactsFound.includes('spec'));

    const raw = await fs.readFile(result.path, 'utf8');
    assert.ok(raw.includes('Users need a better way'));
    assert.ok(raw.includes('feature_slug: test-feat'));
    assert.ok(raw.includes('created_by: dossier-init'));
  });

  it('creates dossier from spec only (no prd)', async () => {
    await fs.writeFile(path.join(ctxDir, 'spec-test-feat.md'), SPEC_CONTENT, 'utf8');

    const result = await initFromExisting({ slug: 'test-feat', contextDir: ctxDir, targetDir: tmp });
    assert.equal(result.created, true);
    assert.ok(result.artifactsFound.includes('spec'));

    const raw = await fs.readFile(result.path, 'utf8');
    assert.ok(raw.includes('feature_slug: test-feat'));
  });

  it('uses global prd.md fallback when no per-slug prd', async () => {
    await fs.writeFile(path.join(ctxDir, 'prd.md'), PRD_CONTENT, 'utf8');

    const result = await initFromExisting({ slug: 'test-feat', contextDir: ctxDir, targetDir: tmp });
    assert.equal(result.created, true);
    assert.ok(result.artifactsFound.includes('prdGlobal'));
  });

  it('sets status=closed for done/ feature', async () => {
    await fs.writeFile(path.join(ctxDir, 'spec-test-feat.md'), SPEC_CONTENT, 'utf8');
    const doneDir = path.join(ctxDir, 'done', 'test-feat');
    await fs.mkdir(doneDir, { recursive: true });

    const result = await initFromExisting({ slug: 'test-feat', contextDir: ctxDir, targetDir: tmp });
    assert.equal(result.created, true);
    const raw = await fs.readFile(result.path, 'utf8');
    assert.ok(raw.includes('status: closed'));
  });

  it('throws EBOOTSTRAPEMPTY when no artifacts found', async () => {
    await assert.rejects(
      () => initFromExisting({ slug: 'empty-feat', contextDir: ctxDir, targetDir: tmp }),
      { code: 'EBOOTSTRAPEMPTY' }
    );
  });

  it('is idempotent — returns unchanged when artifacts have not changed', async () => {
    await fs.writeFile(path.join(ctxDir, 'prd-test-feat.md'), PRD_CONTENT, 'utf8');
    await initFromExisting({ slug: 'test-feat', contextDir: ctxDir, targetDir: tmp });
    const result = await initFromExisting({ slug: 'test-feat', contextDir: ctxDir, targetDir: tmp });
    assert.equal(result.created, false);
    assert.equal(result.reason, 'unchanged');
  });

  it('throws EDOSSIEREXISTS when dossier exists and artifacts changed', async () => {
    await fs.writeFile(path.join(ctxDir, 'prd-test-feat.md'), PRD_CONTENT, 'utf8');
    await initFromExisting({ slug: 'test-feat', contextDir: ctxDir, targetDir: tmp });
    // Change artifact to trigger hash mismatch
    await fs.writeFile(path.join(ctxDir, 'prd-test-feat.md'), PRD_CONTENT + '\n\n## Extra\n\nAdditional content that changes the artifact hash significantly for detection.', 'utf8');
    await assert.rejects(
      () => initFromExisting({ slug: 'test-feat', contextDir: ctxDir, targetDir: tmp }),
      { code: 'EDOSSIEREXISTS' }
    );
  });

  it('throws EDOSSIERSLUG for invalid slug', async () => {
    await assert.rejects(
      () => initFromExisting({ slug: 'Bad Slug!', contextDir: ctxDir, targetDir: tmp }),
      { code: 'EDOSSIERSLUG' }
    );
  });

  it('includes bootstrap_hash in frontmatter', async () => {
    await fs.writeFile(path.join(ctxDir, 'prd-test-feat.md'), PRD_CONTENT, 'utf8');
    const result = await initFromExisting({ slug: 'test-feat', contextDir: ctxDir, targetDir: tmp });
    const raw = await fs.readFile(result.path, 'utf8');
    assert.ok(raw.includes('bootstrap_hash:'));
  });

  it('reads classification from project.context.md', async () => {
    await fs.writeFile(path.join(ctxDir, 'prd-test-feat.md'), PRD_CONTENT, 'utf8');
    await fs.writeFile(path.join(ctxDir, 'project.context.md'), 'classification: SMALL\n', 'utf8');
    const result = await initFromExisting({ slug: 'test-feat', contextDir: ctxDir, targetDir: tmp });
    assert.equal(result.classification, 'SMALL');
  });

  it('respects explicit classification override', async () => {
    await fs.writeFile(path.join(ctxDir, 'prd-test-feat.md'), PRD_CONTENT, 'utf8');
    const result = await initFromExisting({ slug: 'test-feat', contextDir: ctxDir, classification: 'MICRO', targetDir: tmp });
    assert.equal(result.classification, 'MICRO');
  });
});
