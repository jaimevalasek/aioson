'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const fssync = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { runFeatureArchive } = require('../../src/commands/feature-archive');

let root;
let prevCwd;

function silentLogger() {
  return { log: () => {}, error: () => {}, warn: () => {} };
}

beforeEach(async () => {
  prevCwd = process.cwd();
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-archive-dossier-'));
  await fs.mkdir(path.join(root, '.aioson', 'context'), { recursive: true });
  process.chdir(root);
});

afterEach(async () => {
  process.chdir(prevCwd);
  await fs.rm(root, { recursive: true, force: true });
});

async function seedFeaturesMd(status = 'done') {
  await fs.writeFile(
    path.join(root, '.aioson', 'context', 'features.md'),
    [
      '# Features',
      '',
      '| slug | status | started | completed |',
      '|------|--------|---------|-----------|',
      `| feature-x | ${status} | 2026-04-01 | 2026-04-28 |`,
      ''
    ].join('\n')
  );
}

async function seedDossierDir(slug = 'feature-x') {
  const dir = path.join(root, '.aioson', 'context', 'features', slug);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'dossier.md'), '---\nfeature_slug: ' + slug + '\n---\n# x\n');
  await fs.writeFile(path.join(dir, 'revisions.json'), '[]');
}

async function seedRootArtifacts(slug = 'feature-x') {
  const ctx = path.join(root, '.aioson', 'context');
  await fs.writeFile(path.join(ctx, `prd-${slug}.md`), '## Vision\nA thing.\n');
  await fs.writeFile(path.join(ctx, `spec-${slug}.md`), '# spec\n');
}

describe('feature:archive — dossier dir extension (AC-F1-08)', () => {
  beforeEach(async () => {
    prevCwd = process.cwd();
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-archive-dossier-'));
    await fs.mkdir(path.join(root, '.aioson', 'context'), { recursive: true });
    process.chdir(root);
  });
  afterEach(async () => {
    process.chdir(prevCwd);
    await fs.rm(root, { recursive: true, force: true });
  });

  it('moves features/{slug}/ → done/{slug}/dossier/', async () => {
    await seedFeaturesMd('done');
    await seedRootArtifacts();
    await seedDossierDir();

    const result = await runFeatureArchive({
      args: ['.'], options: { feature: 'feature-x', json: true }, logger: silentLogger()
    });

    assert.equal(result.ok, true);
    assert.equal(result.dossier?.action, 'moved');
    assert.equal(
      fssync.existsSync(path.join(root, '.aioson', 'context', 'features', 'feature-x')),
      false
    );
    const archivedDossier = path.join(root, '.aioson', 'context', 'done', 'feature-x', 'dossier', 'dossier.md');
    assert.equal(fssync.existsSync(archivedDossier), true);
  });

  it('cleans up empty .aioson/context/features/ parent after move', async () => {
    await seedFeaturesMd('done');
    await seedRootArtifacts();
    await seedDossierDir();
    await runFeatureArchive({
      args: ['.'], options: { feature: 'feature-x', json: true }, logger: silentLogger()
    });
    assert.equal(
      fssync.existsSync(path.join(root, '.aioson', 'context', 'features')),
      false
    );
  });

  it('keeps features/ parent when other features still exist', async () => {
    await seedFeaturesMd('done');
    await seedRootArtifacts();
    await seedDossierDir('feature-x');
    await seedDossierDir('other-feature');
    await runFeatureArchive({
      args: ['.'], options: { feature: 'feature-x', json: true }, logger: silentLogger()
    });
    assert.equal(
      fssync.existsSync(path.join(root, '.aioson', 'context', 'features', 'other-feature')),
      true
    );
  });

  it('archives the dossier dir even when there are no root artifacts', async () => {
    await seedFeaturesMd('done');
    await seedDossierDir();

    const result = await runFeatureArchive({
      args: ['.'], options: { feature: 'feature-x', json: true }, logger: silentLogger()
    });

    assert.equal(result.ok, true);
    assert.equal(result.dossier?.action, 'moved');
    assert.notEqual(result.noop, true);
  });

  it('AC-F1-10 backwards-compat: legacy flow when no features/{slug}/ exists', async () => {
    await seedFeaturesMd('done');
    await seedRootArtifacts();
    // no seedDossierDir() — this is the legacy path

    const result = await runFeatureArchive({
      args: ['.'], options: { feature: 'feature-x', json: true }, logger: silentLogger()
    });
    assert.equal(result.ok, true);
    assert.equal(result.dossier, null);
    assert.ok(Array.isArray(result.moved) && result.moved.length > 0);
  });

  it('reports noop when neither root files nor features/{slug}/ exist', async () => {
    await seedFeaturesMd('done');
    const result = await runFeatureArchive({
      args: ['.'], options: { feature: 'feature-x', json: true }, logger: silentLogger()
    });
    assert.equal(result.ok, true);
    assert.equal(result.noop, true);
  });

  it('skips dossier dir when target already archived', async () => {
    await seedFeaturesMd('done');
    await seedDossierDir();
    // pre-seed an existing archived dossier
    const archivedDir = path.join(root, '.aioson', 'context', 'done', 'feature-x', 'dossier');
    await fs.mkdir(archivedDir, { recursive: true });
    await fs.writeFile(path.join(archivedDir, 'dossier.md'), '# preexisting\n');

    const result = await runFeatureArchive({
      args: ['.'], options: { feature: 'feature-x', json: true }, logger: silentLogger()
    });
    assert.equal(result.ok, true);
    assert.equal(result.dossier?.action, 'skipped');
    // source dir still present (we did not overwrite)
    assert.equal(
      fssync.existsSync(path.join(root, '.aioson', 'context', 'features', 'feature-x')),
      true
    );
  });

  it('dry-run reports planned dossier move', async () => {
    await seedFeaturesMd('done');
    await seedRootArtifacts();
    await seedDossierDir();
    const result = await runFeatureArchive({
      args: ['.'], options: { feature: 'feature-x', 'dry-run': true, json: true }, logger: silentLogger()
    });
    assert.equal(result.ok, true);
    assert.equal(result.dryRun, true);
    assert.equal(result.dossier?.action, 'move');
    // dir was NOT moved
    assert.equal(
      fssync.existsSync(path.join(root, '.aioson', 'context', 'features', 'feature-x')),
      true
    );
  });
});

describe('feature:archive --restore — dossier dir', () => {
  it('restores done/{slug}/dossier/ → features/{slug}/', async () => {
    await seedFeaturesMd('done');
    await seedRootArtifacts();
    await seedDossierDir();
    await runFeatureArchive({
      args: ['.'], options: { feature: 'feature-x', json: true }, logger: silentLogger()
    });

    const restore = await runFeatureArchive({
      args: ['.'], options: { feature: 'feature-x', restore: true, json: true }, logger: silentLogger()
    });

    assert.equal(restore.ok, true);
    assert.equal(
      fssync.existsSync(path.join(root, '.aioson', 'context', 'features', 'feature-x', 'dossier.md')),
      true
    );
    assert.equal(
      fssync.existsSync(path.join(root, '.aioson', 'context', 'done', 'feature-x')),
      false
    );
  });

  it('refuses restore when features/{slug}/ already exists', async () => {
    await seedFeaturesMd('done');
    await seedDossierDir();
    await runFeatureArchive({
      args: ['.'], options: { feature: 'feature-x', json: true }, logger: silentLogger()
    });
    // re-create source as a conflict
    await seedDossierDir();

    const restore = await runFeatureArchive({
      args: ['.'], options: { feature: 'feature-x', restore: true, json: true }, logger: silentLogger()
    });
    assert.equal(restore.ok, false);
    assert.equal(restore.reason, 'restore_conflict');
    assert.ok(restore.conflicts.includes('features/feature-x/'));
  });
});

describe('feature:archive — status enforcement', () => {
  it('blocks in_progress feature without --force', async () => {
    await seedFeaturesMd('in_progress');
    await seedRootArtifacts();
    await seedDossierDir();

    const result = await runFeatureArchive({
      args: ['.'], options: { feature: 'feature-x', json: true }, logger: silentLogger()
    });

    assert.equal(result.ok, false);
    assert.equal(result.reason, 'not_done');
    assert.equal(result.status, 'in_progress');
  });

  it('allows non-done feature with --force', async () => {
    await seedFeaturesMd('in_progress');
    await seedRootArtifacts();
    await seedDossierDir();

    const result = await runFeatureArchive({
      args: ['.'], options: { feature: 'feature-x', json: true, force: true }, logger: silentLogger()
    });

    assert.equal(result.ok, true);
  });
});

describe('feature:archive — restore dry-run', () => {
  it('dry-run restore reports planned actions without filesystem changes', async () => {
    await seedFeaturesMd('done');
    await seedRootArtifacts();
    await seedDossierDir();
    await runFeatureArchive({
      args: ['.'], options: { feature: 'feature-x', json: true }, logger: silentLogger()
    });

    const result = await runFeatureArchive({
      args: ['.'], options: { feature: 'feature-x', restore: true, 'dry-run': true, json: true }, logger: silentLogger()
    });

    assert.equal(result.ok, true);
    assert.equal(result.dryRun, true);
    assert.ok(Array.isArray(result.restore));
    // Source should still be in archive
    assert.equal(
      fssync.existsSync(path.join(root, '.aioson', 'context', 'done', 'feature-x')),
      true
    );
    // Target should NOT exist
    assert.equal(
      fssync.existsSync(path.join(root, '.aioson', 'context', 'features', 'feature-x')),
      false
    );
  });
});

describe('feature:archive — belongsToOtherSlug collision', () => {
  it('excludes files belonging to a longer slug prefix', async () => {
    // features.md contains both feature-x and feature-x-addon
    await fs.writeFile(
      path.join(root, '.aioson', 'context', 'features.md'),
      [
        '# Features',
        '',
        '| slug | status | started | completed |',
        '|------|--------|---------|-----------|',
        '| feature-x | done | 2026-04-01 | 2026-04-28 |',
        '| feature-x-addon | done | 2026-04-01 | 2026-04-28 |',
        ''
      ].join('\n')
    );
    // Create files that could match both slugs
    await fs.writeFile(path.join(root, '.aioson', 'context', 'prd-feature-x.md'), '## Vision\nA thing.\n');
    await fs.writeFile(path.join(root, '.aioson', 'context', 'prd-feature-x-addon.md'), '## Vision\nAddon.\n');
    await seedDossierDir();

    const result = await runFeatureArchive({
      args: ['.'], options: { feature: 'feature-x', json: true }, logger: silentLogger()
    });

    assert.equal(result.ok, true);
    // prd-feature-x should be moved
    assert.ok(result.moved.includes('prd-feature-x.md'), 'should move prd-feature-x.md');
    // prd-feature-x-addon should NOT be moved (belongs to other slug)
    assert.ok(!result.moved.includes('prd-feature-x-addon.md'), 'should NOT move prd-feature-x-addon.md');
    // prd-feature-x-addon should remain in context root
    assert.equal(
      fssync.existsSync(path.join(root, '.aioson', 'context', 'prd-feature-x-addon.md')),
      true
    );
  });
});
