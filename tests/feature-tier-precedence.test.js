'use strict';

// dev:resume-data, @dev's first call, reported `classification: MICRO` for a
// feature whose PRD said MEDIUM: Product's dossier:add-finding bootstrapped the
// dossier from project.context.md's tier, and dev-resume preferred the
// dossier's copy over the PRD that classify --apply writes.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { buildDevResumeData } = require('../src/lib/dev-resume');
const { initFromExisting } = require('../src/dossier/dossier-bootstrap');

const SLUG = 'due-dates';

async function project() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-tier-'));
  const ctx = path.join(dir, '.aioson', 'context');
  await fs.mkdir(ctx, { recursive: true });
  await fs.writeFile(path.join(ctx, 'project.context.md'), '---\nclassification: "MICRO"\n---\n', 'utf8');
  await fs.writeFile(path.join(ctx, `prd-${SLUG}.md`), `---\nfeature: ${SLUG}\nclassification: MEDIUM\n---\n\n# PRD\n\n## Problem\n\nDeadlines are forgotten.\n`, 'utf8');
  await fs.writeFile(path.join(ctx, 'features.md'), `# Features\n\n| slug | status | started | completed |\n|---|---|---|---|\n| ${SLUG} | in_progress | 2026-10-20 | — |\n`, 'utf8');
  await fs.writeFile(path.join(ctx, 'last-handoff.json'), JSON.stringify({ feature_slug: SLUG }), 'utf8');
  return { dir, ctx };
}

test('a dossier bootstrapped from the feature artifacts takes the PRD tier, not the project tier', async () => {
  const { dir, ctx } = await project();
  const result = await initFromExisting({ slug: SLUG, contextDir: ctx, targetDir: dir });
  assert.equal(result.classification, 'MEDIUM');
});

test('dev:resume-data reports the PRD tier even when the dossier holds a stale copy', async () => {
  const { dir, ctx } = await project();
  await fs.mkdir(path.join(ctx, 'features', SLUG), { recursive: true });
  await fs.writeFile(path.join(ctx, 'features', SLUG, 'dossier.md'), `---\nfeature_slug: ${SLUG}\nclassification: MICRO\n---\n\n## Agent Trail\n`, 'utf8');
  const resume = await buildDevResumeData(dir);
  assert.equal(resume.classification, 'MEDIUM');
});
