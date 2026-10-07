'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const fssync = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { runFeatureArchive, runFeatureSweep } = require('../../src/commands/feature-archive');
const { runFeatureRegister } = require('../../src/commands/feature-registry');
const { isDocumentation, pruneToDocumentation } = require('../../src/lib/archive-documentation');

let root;
let ctx;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-archive-docs-'));
  ctx = path.join(root, '.aioson', 'context');
  await fs.mkdir(ctx, { recursive: true });
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 25 });
});

async function write(rel, content = 'x') {
  const full = path.join(root, rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content);
}

function exists(rel) {
  return fssync.existsSync(path.join(root, rel));
}

async function seedFeatures(rows) {
  await write('.aioson/context/features.md', [
    '# Features',
    '',
    '| slug | status | started | completed |',
    '|------|--------|---------|-----------|',
    ...rows.map(([slug, status]) => `| ${slug} | ${status} | 2026-09-01 | ${status === 'done' || status === 'abandoned' ? '2026-09-10' : '—'} |`),
    ''
  ].join('\n'));
}

// One closed feature as the agents leave it: documents plus the test and
// analysis output produced while it was built.
async function seedFeatureFiles(slug) {
  await write(`.aioson/context/prd-${slug}.md`, '## Vision\nA thing.\n');
  await write(`.aioson/context/qa-report-${slug}.md`, '# QA\nPASS\n');
  await write(`.aioson/context/conformance-${slug}.yaml`, 'ac: []\n');
  await write(`.aioson/context/security-findings-${slug}.json`, '{"findings":[]}');
  await write(`.aioson/context/spec-analyze-${slug}.json`, '{}');
  await write(`.aioson/context/features/${slug}/dossier.md`, '# dossier\n');
  await write(`.aioson/context/features/${slug}/qa-smoke.stdout.log`, 'log');
  await write(`.aioson/context/features/${slug}/phase2-panel.png`, 'png');
  await write(`.aioson/context/features/${slug}/visual-evidence.json`, '{}');
  await write(`.aioson/context/features/${slug}/reviews/packets/a.json`, '{}');
  await write(`.aioson/plans/${slug}/manifest.md`, '# plan\n');
  await write(`.aioson/plans/${slug}/progress.json`, '{}');
  await write(`.aioson/plans/${slug}/validator-prompt.txt`, 'prompt');
  await write(`.aioson/plans/${slug}/qa/smoke.mjs`, 'run()');
  await write(`.aioson/plans/${slug}/evidence/notes.md`, 'raw notes');
  await write(`.aioson/briefings/${slug}/briefings.md`, '# briefing\n');
  await write(`.aioson/briefings/${slug}/prototype.html`, '<html></html>');
  await write(`.aioson/briefings/${slug}/review.html`, '<html></html>');
  await write(`.aioson/briefings/${slug}/walkthrough.json`, '{}');
}

function assertDocumentationOnly(base, slug) {
  for (const kept of [
    `prd-${slug}.md`, `qa-report-${slug}.md`, `conformance-${slug}.yaml`, `security-findings-${slug}.json`,
    'dossier/dossier.md', 'plans/manifest.md', 'briefings/briefings.md', 'briefings/prototype.html'
  ]) {
    assert.equal(exists(`${base}/${kept}`), true, `${kept} should be kept`);
  }
  for (const dropped of [
    `spec-analyze-${slug}.json`, 'dossier/qa-smoke.stdout.log', 'dossier/phase2-panel.png', 'dossier/visual-evidence.json',
    'dossier/reviews', 'plans/progress.json', 'plans/validator-prompt.txt', 'plans/qa', 'plans/evidence',
    'briefings/review.html', 'briefings/walkthrough.json'
  ]) {
    assert.equal(exists(`${base}/${dropped}`), false, `${dropped} should be removed`);
  }
}

describe('archive keeps documentation only', () => {
  it('classifies documents and analysis output', () => {
    assert.equal(isDocumentation('prd-x.md'), true);
    assert.equal(isDocumentation('conformance-x.yaml'), true);
    assert.equal(isDocumentation('briefings/prototype.html'), true);
    assert.equal(isDocumentation('security-findings-x.json'), true);
    assert.equal(isDocumentation('force-bypass-findings.json'), true);
    assert.equal(isDocumentation('dossier/visual-evidence.json'), false);
    assert.equal(isDocumentation('briefings/browser/run.md'), false);
    assert.equal(isDocumentation('plans/validator-prompt.txt'), false);
    assert.equal(isDocumentation('dossier/shot.png'), false);
  });

  it('feature:archive drops test and analysis files after the move', async () => {
    await seedFeatures([['feature-x', 'done']]);
    await seedFeatureFiles('feature-x');

    const result = await runFeatureArchive({ args: [root], options: { feature: 'feature-x', json: true } });

    assert.equal(result.ok, true);
    assert.ok(result.evidence_pruned.files >= 10);
    assertDocumentationOnly('.aioson/context/done/feature-x', 'feature-x');
    assert.equal(exists('.aioson/context/features/feature-x'), false);
  });

  it('--keep-evidence archives everything untouched', async () => {
    await seedFeatures([['feature-x', 'done']]);
    await seedFeatureFiles('feature-x');

    const result = await runFeatureArchive({ args: [root], options: { feature: 'feature-x', json: true, 'keep-evidence': true } });

    assert.equal(result.ok, true);
    assert.equal(result.evidence_pruned, undefined);
    assert.equal(exists('.aioson/context/done/feature-x/dossier/phase2-panel.png'), true);
    assert.equal(exists('.aioson/context/done/feature-x/plans/qa/smoke.mjs'), true);
  });

  it('never follows a link out of the archive', async () => {
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-outside-'));
    try {
      await fs.writeFile(path.join(outside, 'precious.png'), 'keep me');
      await write('.aioson/context/done/feature-x/prd-feature-x.md', '# prd');
      fssync.symlinkSync(outside, path.join(ctx, 'done', 'feature-x', 'linked'), 'junction');
      pruneToDocumentation(path.join(ctx, 'done', 'feature-x'), { root: path.join(root, '.aioson') });
      assert.equal(fssync.existsSync(path.join(outside, 'precious.png')), true);
    } finally {
      await fs.rm(outside, { recursive: true, force: true });
    }
  });
});

describe('abandoned features leave the live context', () => {
  it('feature:archive moves an abandoned feature into abandoned/ with its own manifest', async () => {
    await seedFeatures([['old-idea', 'abandoned']]);
    await seedFeatureFiles('old-idea');

    const result = await runFeatureArchive({ args: [root], options: { feature: 'old-idea', json: true } });

    assert.equal(result.ok, true);
    assert.equal(result.bucket, 'abandoned');
    assertDocumentationOnly('.aioson/context/abandoned/old-idea', 'old-idea');
    assert.equal(exists('.aioson/context/done/old-idea'), false);
    const manifest = await fs.readFile(path.join(ctx, 'abandoned', 'MANIFEST.md'), 'utf8');
    assert.match(manifest, /# Abandoned Features Manifest/);
    assert.match(manifest, /\| old-idea \| 2026-09-10 \|/);
  });

  it('feature:register --status=abandoned archives right away', async () => {
    await seedFeatures([['old-idea', 'in_progress']]);
    await seedFeatureFiles('old-idea');

    const result = await runFeatureRegister({ args: [root], options: { feature: 'old-idea', status: 'abandoned', json: true } });

    assert.equal(result.ok, true);
    assert.equal(result.archive.ok, true);
    assert.equal(exists('.aioson/context/prd-old-idea.md'), false);
    assert.equal(exists('.aioson/context/abandoned/old-idea/prd-old-idea.md'), true);
  });

  it('feature:register --status=abandoned --no-archive leaves the files', async () => {
    await seedFeatures([['old-idea', 'in_progress']]);
    await seedFeatureFiles('old-idea');

    await runFeatureRegister({ args: [root], options: { feature: 'old-idea', status: 'abandoned', 'no-archive': true, json: true } });

    assert.equal(exists('.aioson/context/prd-old-idea.md'), true);
  });
});

describe('feature:sweep heals closures that skipped feature:close', () => {
  it('archives hand-closed and abandoned features, stragglers of archived ones, and prunes old archives', async () => {
    await seedFeatures([
      ['hand-closed', 'done'],
      ['archived-before', 'done'],
      ['dropped', 'abandoned'],
      ['live-work', 'in_progress']
    ]);
    await seedFeatureFiles('hand-closed');
    await seedFeatureFiles('dropped');
    await seedFeatureFiles('live-work');
    // Archived long ago with its evidence, then an agent wrote two more files.
    await write('.aioson/context/done/MANIFEST.md', '| slug | completed | files | summary |\n|---|---|---|---|\n| archived-before | 2026-08-01 | 1 | — |\n');
    await write('.aioson/context/done/archived-before/prd-archived-before.md', '## Vision\nOld.\n');
    await write('.aioson/context/done/archived-before/plans/evidence/shot.png', 'png');
    await write('.aioson/context/test-plan-archived-before.md', '# late test plan\n');
    await write('.aioson/context/prd-archived-before.md', '## Vision\nOld.\n');

    const preview = await runFeatureSweep({ args: [root], options: { 'dry-run': true, json: true } });
    assert.deepEqual(preview.pending.sort(), ['archived-before', 'dropped', 'hand-closed']);
    assert.ok(preview.evidence.some((e) => e.slug === 'archived-before'));
    assert.equal(exists('.aioson/context/prd-hand-closed.md'), true, 'dry-run touches nothing');

    const result = await runFeatureSweep({ args: [root], options: { json: true } });

    assert.equal(result.failed, undefined);
    assertDocumentationOnly('.aioson/context/done/hand-closed', 'hand-closed');
    assertDocumentationOnly('.aioson/context/abandoned/dropped', 'dropped');
    assert.equal(exists('.aioson/context/done/archived-before/test-plan-archived-before.md'), true);
    assert.equal(exists('.aioson/context/prd-archived-before.md'), false, 'identical straggler removed');
    assert.equal(exists('.aioson/context/done/archived-before/plans/evidence'), false);
    // Work in motion stays exactly where it is.
    assert.equal(exists('.aioson/context/prd-live-work.md'), true);
    assert.equal(exists('.aioson/context/features/live-work/phase2-panel.png'), true);

    const again = await runFeatureSweep({ args: [root], options: { 'dry-run': true, json: true } });
    assert.deepEqual(again.pending, []);
    assert.deepEqual(again.evidence, []);
  });

  it('reports a divergent straggler instead of overwriting the archive', async () => {
    await seedFeatures([['archived-before', 'done']]);
    await write('.aioson/context/done/archived-before/prd-archived-before.md', 'archived text');
    await write('.aioson/context/prd-archived-before.md', 'edited later');

    const result = await runFeatureSweep({ args: [root], options: { json: true } });

    assert.equal(result.failed.length, 1);
    assert.equal(result.failed[0].errors[0].code, 'archive_merge_conflict');
    assert.equal(await fs.readFile(path.join(ctx, 'done', 'archived-before', 'prd-archived-before.md'), 'utf8'), 'archived text');
    assert.equal(exists('.aioson/context/prd-archived-before.md'), true);
  });
});
