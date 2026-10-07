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
  await fs.rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 25 });
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

  it('reconciles a diverged live dossier with the archive instead of freezing it forever', async () => {
    await seedFeaturesMd('done');
    await seedDossierDir();
    // pre-seed an existing archived dossier with DIFFERENT content
    const archivedDir = path.join(root, '.aioson', 'context', 'done', 'feature-x', 'dossier');
    await fs.mkdir(archivedDir, { recursive: true });
    await fs.writeFile(path.join(archivedDir, 'dossier.md'), '# preexisting\n');

    const result = await runFeatureArchive({
      args: ['.'], options: { feature: 'feature-x', json: true, 'keep-evidence': true }, logger: silentLogger()
    });
    // divergente = erro acionável, nunca sobrescrito em silêncio
    assert.equal(result.ok, false);
    assert.equal(result.dossier?.action, 'merge_conflict');
    assert.ok((result.errors || []).some((e) => e.code === 'archive_merge_conflict'));
    assert.equal(
      fssync.existsSync(path.join(root, '.aioson', 'context', 'features', 'feature-x', 'dossier.md')),
      true
    );
    // arquivo ausente no archive foi mesclado; a cópia viva saiu
    assert.equal(
      fssync.existsSync(path.join(root, '.aioson', 'context', 'done', 'feature-x', 'dossier', 'revisions.json')),
      true
    );
    assert.equal(
      fssync.existsSync(path.join(root, '.aioson', 'context', 'features', 'feature-x', 'revisions.json')),
      false
    );
  });

  it('dedups an identical live dossier and prunes the emptied source dir', async () => {
    await seedFeaturesMd('done');
    await seedDossierDir();
    const liveDir = path.join(root, '.aioson', 'context', 'features', 'feature-x');
    const archivedDir = path.join(root, '.aioson', 'context', 'done', 'feature-x', 'dossier');
    await fs.mkdir(archivedDir, { recursive: true });
    for (const name of ['dossier.md', 'revisions.json']) {
      await fs.copyFile(path.join(liveDir, name), path.join(archivedDir, name));
    }

    const result = await runFeatureArchive({
      args: ['.'], options: { feature: 'feature-x', json: true }, logger: silentLogger()
    });
    assert.equal(result.ok, true, JSON.stringify(result.errors));
    assert.equal(result.dossier?.action, 'merged');
    assert.equal(result.dossier?.source_removed, true);
    assert.equal(fssync.existsSync(liveDir), false);
  });

  it('cleans an empty leftover briefings dir when the archive already has content (repro tinta-ouro)', async () => {
    await seedFeaturesMd('done');
    await fs.mkdir(path.join(root, '.aioson', 'briefings', 'feature-x'), { recursive: true });
    const archivedBriefings = path.join(root, '.aioson', 'context', 'done', 'feature-x', 'briefings');
    await fs.mkdir(archivedBriefings, { recursive: true });
    await fs.writeFile(path.join(archivedBriefings, 'prototype.html'), '<html></html>');

    const result = await runFeatureArchive({
      args: ['.'], options: { feature: 'feature-x', json: true }, logger: silentLogger()
    });
    assert.equal(result.ok, true, JSON.stringify(result.errors));
    const briefings = (result.dirs || []).find((d) => d.label === 'briefings');
    assert.equal(briefings?.action, 'cleaned');
    assert.equal(fssync.existsSync(path.join(root, '.aioson', 'briefings', 'feature-x')), false);
  });

  it('archives mappings/{slug} continuity into done/{slug}/mappings/', async () => {
    await seedFeaturesMd('done');
    await seedRootArtifacts();
    const mappingsDir = path.join(root, '.aioson', 'mappings', 'feature-x');
    await fs.mkdir(mappingsDir, { recursive: true });
    await fs.writeFile(path.join(mappingsDir, 'continuity.md'), '# continuity\n');

    const result = await runFeatureArchive({
      args: ['.'], options: { feature: 'feature-x', json: true }, logger: silentLogger()
    });
    assert.equal(result.ok, true, JSON.stringify(result.errors));
    const mappings = (result.dirs || []).find((d) => d.label === 'mappings');
    assert.equal(mappings?.action, 'moved');
    assert.equal(
      fssync.existsSync(path.join(root, '.aioson', 'context', 'done', 'feature-x', 'mappings', 'continuity.md')),
      true
    );
    assert.equal(fssync.existsSync(mappingsDir), false);
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

describe('feature:archive — resiliência a EPERM no Windows (A2/A3)', () => {
  function failRenameFor(prefix, code = 'EPERM') {
    const original = fs.rename;
    fs.rename = async (from, to) => {
      if (String(from).startsWith(prefix)) {
        const err = new Error(`${code}: operation not permitted, rename '${from}' -> '${to}'`);
        err.code = code;
        throw err;
      }
      return original.call(fs, from, to);
    };
    return () => { fs.rename = original; };
  }

  it('EPERM no rename do dossiê cai para copy+remove e o archive completa (ok:true)', async () => {
    await seedFeaturesMd('done');
    await seedRootArtifacts();
    await seedDossierDir();

    const dossierSource = path.join(root, '.aioson', 'context', 'features', 'feature-x');
    const restore = failRenameFor(dossierSource);
    let result;
    try {
      result = await runFeatureArchive({
        args: ['.'], options: { feature: 'feature-x', json: true }, logger: silentLogger()
      });
    } finally {
      restore();
    }

    assert.equal(result.ok, true, JSON.stringify(result.errors || null));
    assert.equal(result.dossier?.action, 'moved');
    assert.equal(result.dossier?.method, 'copy');
    assert.equal(fssync.existsSync(dossierSource), false);
    assert.equal(
      fssync.existsSync(path.join(root, '.aioson', 'context', 'done', 'feature-x', 'dossier', 'dossier.md')),
      true
    );
  });

  it('falha total no dossiê não aborta os demais moves e sai ok:false com errors[]', async () => {
    await seedFeaturesMd('done');
    await seedRootArtifacts();
    await seedDossierDir();

    const dossierSource = path.join(root, '.aioson', 'context', 'features', 'feature-x');
    const restoreRename = failRenameFor(dossierSource);
    const originalCp = fs.cp;
    fs.cp = async (from, ...rest) => {
      if (String(from).startsWith(dossierSource)) {
        const err = new Error('EBUSY: simulated');
        err.code = 'EBUSY';
        throw err;
      }
      return originalCp.call(fs, from, ...rest);
    };
    let result;
    try {
      result = await runFeatureArchive({
        args: ['.'], options: { feature: 'feature-x', json: true }, logger: silentLogger()
      });
    } finally {
      fs.cp = originalCp;
      restoreRename();
    }

    assert.equal(result.ok, false);
    assert.equal(result.reason, 'archive_incomplete');
    assert.ok(result.errors.some((e) => e.kind === 'dir'));
    // os arquivos de raiz moveram mesmo assim
    assert.ok(result.moved.includes('prd-feature-x.md'));
    // a origem do dossiê continua intacta (nem parcial no destino)
    assert.equal(fssync.existsSync(path.join(dossierSource, 'dossier.md')), true);
    assert.equal(
      fssync.existsSync(path.join(root, '.aioson', 'context', 'done', 'feature-x', 'dossier')),
      false
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
