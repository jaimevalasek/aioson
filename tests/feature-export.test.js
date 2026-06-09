'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { runFeatureExport } = require('../src/commands/feature-export');

const RM = { recursive: true, force: true, maxRetries: 5, retryDelay: 50 };

function silentLogger() {
  const lines = [];
  return { lines, log: (m) => lines.push(m), error: (m) => lines.push(m) };
}

async function write(file, content) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content, 'utf8');
}

// Build a project with an active feature `checkout`, a sibling `checkout-v2`
// (collision bait), and an already-archived feature `legacy-thing`.
async function makeProject() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-fexport-'));
  const ctx = path.join(dir, '.aioson', 'context');

  await write(path.join(ctx, 'features.md'),
    '# Features\n\n| slug | status | started | completed |\n' +
    '|------|--------|---------|-----------|\n' +
    '| checkout | in_progress | 2026-05-01 | — |\n' +
    '| checkout-v2 | in_progress | 2026-05-02 | — |\n' +
    '| legacy-thing | done | 2026-04-01 | 2026-04-20 |\n');

  // Global file (must never be exported even though it lives in context/)
  await write(path.join(ctx, 'project-pulse.md'), '# Pulse\n');

  // Active feature `checkout` — root files + 3 slug dirs
  await write(path.join(ctx, 'prd-checkout.md'), '# PRD checkout\n');
  await write(path.join(ctx, 'spec-checkout.md'), '# Spec checkout\n');
  await write(path.join(ctx, 'requirements-checkout.md'), '# Reqs checkout\n');
  // Collision bait: belongs to checkout-v2, must NOT leak into checkout export
  await write(path.join(ctx, 'prd-checkout-v2.md'), '# PRD checkout-v2\n');

  await write(path.join(ctx, 'features', 'checkout', 'dossier.md'), '# Dossier\n');
  await write(path.join(dir, '.aioson', 'plans', 'checkout', 'manifest.md'), '# Plan manifest\n');
  await write(path.join(dir, '.aioson', 'plans', 'checkout', 'plan-phase-1.md'), '# Phase 1\n');
  await write(path.join(dir, '.aioson', 'briefings', 'checkout', 'briefing.md'), '# Briefing\n');

  // Archived feature `legacy-thing` — only under context/done/
  await write(path.join(ctx, 'done', 'legacy-thing', 'prd-legacy-thing.md'), '# PRD legacy\n');
  await write(path.join(ctx, 'done', 'legacy-thing', 'dossier', 'dossier.md'), '# Legacy dossier\n');

  return dir;
}

test('feature:export — mirrored copy of all artefacts, source untouched, INDEX written', async () => {
  const dir = await makeProject();
  try {
    const out = path.join(dir, 'export-out');
    const result = await runFeatureExport({
      args: [dir],
      options: { feature: 'checkout', out, json: true }
    });

    assert.equal(result.ok, true);
    assert.equal(result.index, true);

    const copied = new Set(result.copied);
    // root files
    assert.ok(copied.has('prd-checkout.md'));
    assert.ok(copied.has('spec-checkout.md'));
    assert.ok(copied.has('requirements-checkout.md'));
    // mirrored subdirs
    assert.ok(copied.has('dossier/dossier.md'));
    assert.ok(copied.has('plans/manifest.md'));
    assert.ok(copied.has('plans/plan-phase-1.md'));
    assert.ok(copied.has('briefings/briefing.md'));

    // collision guard: checkout-v2 artefact must NOT be exported
    assert.ok(!copied.has('prd-checkout-v2.md'), 'sibling slug leaked into export');
    // global file must never be exported
    assert.ok(!copied.has('project-pulse.md'), 'global file leaked into export');

    // files physically exist at the mirrored paths
    await fs.access(path.join(out, 'prd-checkout.md'));
    await fs.access(path.join(out, 'plans', 'plan-phase-1.md'));
    await fs.access(path.join(out, 'INDEX.md'));

    // INDEX lists the exported files
    const index = await fs.readFile(path.join(out, 'INDEX.md'), 'utf8');
    assert.match(index, /Feature Export — checkout/);
    assert.match(index, /plans\/plan-phase-1\.md/);

    // source tree untouched (non-destructive)
    await fs.access(path.join(dir, '.aioson', 'context', 'prd-checkout.md'));
    await fs.access(path.join(dir, '.aioson', 'plans', 'checkout', 'manifest.md'));
    await fs.access(path.join(dir, '.aioson', 'briefings', 'checkout', 'briefing.md'));
  } finally {
    await fs.rm(dir, RM);
  }
});

test('feature:export --flatten collapses subdirs into label-prefixed names', async () => {
  const dir = await makeProject();
  try {
    const out = path.join(dir, 'flat-out');
    const result = await runFeatureExport({
      args: [dir],
      options: { feature: 'checkout', out, flatten: true, json: true }
    });
    assert.equal(result.ok, true);
    const copied = new Set(result.copied);
    assert.ok(copied.has('prd-checkout.md'), 'root file keeps bare name');
    assert.ok(copied.has('dossier-dossier.md'), 'nested file flattened with label prefix');
    assert.ok(copied.has('plans-plan-phase-1.md'));
    assert.ok(copied.has('briefings-briefing.md'));
    // no subdirectories created in flatten mode
    const entries = await fs.readdir(out, { withFileTypes: true });
    assert.ok(entries.every((e) => e.isFile()), 'flatten must not create subdirs');
  } finally {
    await fs.rm(dir, RM);
  }
});

test('feature:export --no-index skips INDEX.md', async () => {
  const dir = await makeProject();
  try {
    const out = path.join(dir, 'noidx-out');
    const result = await runFeatureExport({
      args: [dir],
      options: { feature: 'checkout', out, 'no-index': true, json: true }
    });
    assert.equal(result.ok, true);
    assert.equal(result.index, false);
    await assert.rejects(fs.access(path.join(out, 'INDEX.md')), 'INDEX.md should not exist');
  } finally {
    await fs.rm(dir, RM);
  }
});

test('feature:export includes archived artefacts from context/done/{slug}', async () => {
  const dir = await makeProject();
  try {
    const out = path.join(dir, 'done-out');
    const result = await runFeatureExport({
      args: [dir],
      options: { feature: 'legacy-thing', out, json: true }
    });
    assert.equal(result.ok, true);
    const copied = new Set(result.copied);
    assert.ok(copied.has('done/prd-legacy-thing.md'), 'archived root file not exported');
    assert.ok(copied.has('done/dossier/dossier.md'), 'archived dossier not exported');
  } finally {
    await fs.rm(dir, RM);
  }
});

test('feature:export --dry-run does not write anything', async () => {
  const dir = await makeProject();
  try {
    const out = path.join(dir, 'dry-out');
    const result = await runFeatureExport({
      args: [dir],
      options: { feature: 'checkout', out, 'dry-run': true, json: true }
    });
    assert.equal(result.ok, true);
    assert.equal(result.dryRun, true);
    assert.ok(result.count > 0);
    await assert.rejects(fs.access(out), 'dry-run must not create the out dir');
  } finally {
    await fs.rm(dir, RM);
  }
});

test('feature:export — unknown slug with no artefacts returns noop', async () => {
  const dir = await makeProject();
  try {
    const result = await runFeatureExport({
      args: [dir],
      options: { feature: 'nonexistent', out: path.join(dir, 'no-out'), json: true }
    });
    assert.equal(result.ok, true);
    assert.equal(result.noop, true);
  } finally {
    await fs.rm(dir, RM);
  }
});

test('feature:export — validation: missing feature and invalid slug', async () => {
  const dir = await makeProject();
  try {
    const missing = await runFeatureExport({ args: [dir], options: { json: true } });
    assert.equal(missing.ok, false);
    assert.equal(missing.reason, 'missing_feature');

    const invalid = await runFeatureExport({
      args: [dir], options: { feature: 'bad slug!', json: true }
    });
    assert.equal(invalid.ok, false);
    assert.equal(invalid.reason, 'invalid_slug');
  } finally {
    await fs.rm(dir, RM);
  }
});

test('feature:export — default out dir is <target>/{slug}-export', async () => {
  const dir = await makeProject();
  try {
    const result = await runFeatureExport({
      args: [dir],
      options: { feature: 'checkout', json: true }
    });
    assert.equal(result.ok, true);
    assert.equal(result.outDir, 'checkout-export');
    await fs.access(path.join(dir, 'checkout-export', 'prd-checkout.md'));
  } finally {
    await fs.rm(dir, RM);
  }
});
