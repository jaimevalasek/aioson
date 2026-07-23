'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { runFeatureClose } = require('../src/commands/feature-close');
const { activateStage } = require('../src/commands/workflow-next');

function makeLogger() {
  const lines = [];
  return {
    log: (m = '') => lines.push(String(m)),
    error: (m = '') => lines.push(String(m)),
    warn: (m = '') => lines.push(String(m)),
    lines
  };
}

async function makeProject() {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-acc-phase3-'));
  await fs.mkdir(path.join(tmp, '.aioson', 'context'), { recursive: true });
  await fs.writeFile(
    path.join(tmp, '.aioson', 'context', 'project.context.md'),
    '---\nclassification: MEDIUM\n---\n# context',
    'utf8'
  );
  return tmp;
}

async function writePrd(tmp, slug, classification = 'MEDIUM') {
  await fs.writeFile(
    path.join(tmp, '.aioson', 'context', `prd-${slug}.md`),
    `---\nclassification: "${classification}"\n---\n\n# PRD\n\n## Why\nbecause\n\n## Escopo do MVP\nthings\n`,
    'utf8'
  );
}

async function writeFeaturesMd(tmp, rows) {
  const lines = ['# Features', '', '| slug | status | started | completed |', '|------|--------|---------|-----------|'];
  for (const r of rows) {
    lines.push(`| ${r.slug} | ${r.status} | ${r.started || '—'} | ${r.completed || '—'} |`);
  }
  await fs.writeFile(path.join(tmp, '.aioson', 'context', 'features.md'), lines.join('\n') + '\n', 'utf8');
}

describe('Phase 3.1 — feature:close dossier guarantee', () => {
  it('synthesizes dossier from existing PRD when missing on close', async () => {
    const tmp = await makeProject();
    try {
      await writePrd(tmp, 'feat-from-existing');
      await writeFeaturesMd(tmp, [{ slug: 'feat-from-existing', status: 'in_progress', started: '2026-05-01' }]);

      const result = await runFeatureClose({
        args: [tmp],
        options: { feature: 'feat-from-existing', verdict: 'PASS', json: true, 'no-archive': true },
        logger: makeLogger()
      });
      assert.equal(result.ok, true);
      const dossierPath = path.join(tmp, '.aioson', 'context', 'features', 'feat-from-existing', 'dossier.md');
      const exists = await fs.access(dossierPath).then(() => true).catch(() => false);
      assert.ok(exists, 'dossier should exist after close');
      const synthesizedUpdate = result.updates.find((u) => u.startsWith('dossier:'));
      assert.match(synthesizedUpdate, /synthesized from existing artifacts/);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('writes minimal-fallback dossier when no source artifacts exist (EBOOTSTRAPEMPTY)', async () => {
    const tmp = await makeProject();
    try {
      await writeFeaturesMd(tmp, [{ slug: 'feat-empty', status: 'in_progress', started: '2026-05-01' }]);

      const result = await runFeatureClose({
        args: [tmp],
        options: { feature: 'feat-empty', verdict: 'PASS', json: true, 'no-archive': true },
        logger: makeLogger()
      });
      assert.equal(result.ok, true);
      const dossierPath = path.join(tmp, '.aioson', 'context', 'features', 'feat-empty', 'dossier.md');
      const dossier = await fs.readFile(dossierPath, 'utf8');
      assert.match(dossier, /no source artifacts found at close time/);
      const synthesizedUpdate = result.updates.find((u) => u.startsWith('dossier:'));
      assert.match(synthesizedUpdate, /minimal fallback/);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('is idempotent — does not overwrite existing dossier', async () => {
    const tmp = await makeProject();
    try {
      await writePrd(tmp, 'feat-existing');
      await writeFeaturesMd(tmp, [{ slug: 'feat-existing', status: 'in_progress', started: '2026-05-01' }]);
      const featDir = path.join(tmp, '.aioson', 'context', 'features', 'feat-existing');
      await fs.mkdir(featDir, { recursive: true });
      const SENTINEL = 'SENTINEL_PRE_EXISTING_DOSSIER';
      await fs.writeFile(path.join(featDir, 'dossier.md'), SENTINEL, 'utf8');

      const result = await runFeatureClose({
        args: [tmp],
        options: { feature: 'feat-existing', verdict: 'PASS', json: true, 'no-archive': true },
        logger: makeLogger()
      });
      assert.equal(result.ok, true);
      const after = await fs.readFile(path.join(featDir, 'dossier.md'), 'utf8');
      assert.equal(after, SENTINEL, 'pre-existing dossier must be untouched');
      const synthesizedUpdate = result.updates.find((u) => u.startsWith('dossier:'));
      assert.equal(synthesizedUpdate, undefined, 'no dossier update line when already present');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('runs the guarantee on FAIL verdict (verdict-agnostic)', async () => {
    const tmp = await makeProject();
    try {
      await writePrd(tmp, 'feat-fail');
      await writeFeaturesMd(tmp, [{ slug: 'feat-fail', status: 'in_progress', started: '2026-05-01' }]);

      const result = await runFeatureClose({
        args: [tmp],
        options: { feature: 'feat-fail', verdict: 'FAIL', json: true, 'no-archive': true },
        logger: makeLogger()
      });
      assert.equal(result.ok, true);
      const dossierPath = path.join(tmp, '.aioson', 'context', 'features', 'feat-fail', 'dossier.md');
      const exists = await fs.access(dossierPath).then(() => true).catch(() => false);
      assert.ok(exists, 'guarantee must run even on FAIL verdict');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});

describe('Phase 3.2 — workflow:next pre-stage hook (ensureFeatureDossier)', () => {
  it('auto-inits dossier for SMALL/MEDIUM features when activating a stage', async () => {
    const tmp = await makeProject();
    try {
      await writePrd(tmp, 'feat-medium', 'MEDIUM');
      const dossierPath = path.join(tmp, '.aioson', 'context', 'features', 'feat-medium', 'dossier.md');

      let existsBefore = await fs.access(dossierPath).then(() => true).catch(() => false);
      assert.equal(existsBefore, false);

      await activateStage(
        tmp,
        { mode: 'feature', classification: 'MEDIUM', featureSlug: 'feat-medium', current: null, next: 'product' },
        'en',
        'codex',
        'product',
        null
      );

      const existsAfter = await fs.access(dossierPath).then(() => true).catch(() => false);
      assert.ok(existsAfter, 'dossier should exist after activateStage for MEDIUM feature');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('auto-inits the same non-blocking dossier context cache for MICRO features', async () => {
    const tmp = await makeProject();
    try {
      await writePrd(tmp, 'feat-micro', 'MICRO');

      await activateStage(
        tmp,
        { mode: 'feature', classification: 'MICRO', featureSlug: 'feat-micro', current: null, next: 'product' },
        'en',
        'codex',
        'product',
        null
      );

      const dossierPath = path.join(tmp, '.aioson', 'context', 'features', 'feat-micro', 'dossier.md');
      const exists = await fs.access(dossierPath).then(() => true).catch(() => false);
      assert.equal(exists, true, 'MICRO should receive the same lightweight context memory');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('is idempotent — does not overwrite existing dossier', async () => {
    const tmp = await makeProject();
    try {
      const featDir = path.join(tmp, '.aioson', 'context', 'features', 'feat-existing');
      await fs.mkdir(featDir, { recursive: true });
      const SENTINEL = 'SENTINEL_PRE_EXISTING';
      const dossierPath = path.join(featDir, 'dossier.md');
      await fs.writeFile(dossierPath, SENTINEL, 'utf8');

      await activateStage(
        tmp,
        { mode: 'feature', classification: 'SMALL', featureSlug: 'feat-existing', current: null, next: 'product' },
        'en',
        'codex',
        'product',
        null
      );

      const after = await fs.readFile(dossierPath, 'utf8');
      assert.equal(after, SENTINEL, 'existing dossier must be untouched');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('skips when mode is project (no featureSlug)', async () => {
    const tmp = await makeProject();
    try {
      await activateStage(
        tmp,
        { mode: 'project', classification: 'MEDIUM', featureSlug: null, current: null, next: 'product' },
        'en',
        'codex',
        'product',
        null
      );
      // No assertion needed — just must not throw
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('writes minimal fallback dossier when no source artifacts exist (EBOOTSTRAPEMPTY)', async () => {
    const tmp = await makeProject();
    try {
      const dossierPath = path.join(tmp, '.aioson', 'context', 'features', 'feat-empty', 'dossier.md');

      await activateStage(
        tmp,
        { mode: 'feature', classification: 'MEDIUM', featureSlug: 'feat-empty', current: null, next: 'product' },
        'en',
        'codex',
        'product',
        null
      );

      const exists = await fs.access(dossierPath).then(() => true).catch(() => false);
      assert.ok(exists, 'minimal-fallback dossier must be written when no artifacts');
      const dossier = await fs.readFile(dossierPath, 'utf8');
      assert.match(dossier, /lightweight workflow context cache/);
      assert.match(dossier, /populated as evidence becomes available/);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});
