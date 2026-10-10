'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { runDossierAddFinding } = require('../src/commands/dossier');

async function project(t, { prd = true } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dossier-add-finding-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const ctxDir = path.join(dir, '.aioson', 'context');
  await fs.mkdir(ctxDir, { recursive: true });
  await fs.writeFile(path.join(ctxDir, 'project.context.md'), '---\nclassification: "MEDIUM"\n---\n');
  if (prd) await fs.writeFile(path.join(ctxDir, 'prd-live-feat.md'), '# PRD — live-feat\n\n## Problem\n\nThe trail must not vanish.\n');
  return { dir, ctxDir };
}

const finding = (dir, slug) => runDossierAddFinding({
  args: [dir],
  options: { slug, agent: 'dev', section: 'Agent Trail', content: 'Phase 1 preflight recorded', json: true }
});

test('the first trail line of a feature with a PRD bootstraps its dossier instead of vanishing', async (t) => {
  const { dir, ctxDir } = await project(t);
  const result = await finding(dir, 'live-feat');
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.bootstrapped, true);
  assert.equal(result.added, true);
  const dossier = await fs.readFile(path.join(ctxDir, 'features', 'live-feat', 'dossier.md'), 'utf8');
  assert.match(dossier, /Phase 1 preflight recorded/);

  const again = await finding(dir, 'live-feat');
  assert.equal(again.bootstrapped, false, 'an existing dossier is written, never re-bootstrapped');
  assert.equal(again.added, false, 'the same line stays idempotent');
});

test('a slug without its own PRD is still not_found — a typo never creates a dossier', async (t) => {
  const { dir, ctxDir } = await project(t, { prd: false });
  const result = await finding(dir, 'live-feat');
  assert.deepEqual(result, { ok: false, reason: 'not_found', slug: 'live-feat' });
  await assert.rejects(fs.access(path.join(ctxDir, 'features', 'live-feat')));
});
