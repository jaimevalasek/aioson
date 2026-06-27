'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { runReviewFeature } = require('../src/commands/review-feature');

async function makeTmp() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-review-feature-'));
}

async function writeFile(dir, rel, content) {
  const full = path.join(dir, rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, 'utf8');
}

function makeLogger() {
  const lines = [];
  return { lines, log: (m = '') => lines.push(String(m)), error: (m = '') => lines.push(String(m)) };
}

const mockT = () => undefined;

async function writeFeatureArtifacts(dir, slug) {
  await writeFile(dir, `.aioson/context/prd-${slug}.md`, '---\nclassification: SMALL\n---\n# PRD\n');
  await writeFile(dir, `.aioson/context/spec-${slug}.md`, `---\nfeature: ${slug}\n---\n# Spec\n`);
}

test('review:feature runs the audit and prepares both agent prompts (tester prompt carries the slug)', async () => {
  const dir = await makeTmp();
  const slug = 'checkout';
  await writeFeatureArtifacts(dir, slug);

  const result = await runReviewFeature({
    args: [dir],
    options: { feature: slug, json: true },
    logger: makeLogger(),
    t: mockT
  });

  assert.equal(result.ok, true);
  assert.equal(result.slug, slug);
  assert.equal(result.slug_source, 'explicit');
  assert.ok(result.audit, 'audit should have run');
  assert.ok(result.audit.summary, 'audit should carry a summary');
  assert.ok(typeof result.prompts.pentester === 'string' && result.prompts.pentester.length > 0);
  assert.ok(typeof result.prompts.tester === 'string' && result.prompts.tester.length > 0);
  // The new tester activation context must pin the slug so a post-close pass
  // does not fall back to project mode.
  assert.ok(result.prompts.tester.includes(slug), 'tester prompt must mention the slug');
  assert.match(result.commands.pentester, /agent:prompt pentester/);
  assert.match(result.commands.tester, /--feature=checkout/);
});

test('review:feature --scope produces an app_target pentester prompt that names feature + scope', async () => {
  const dir = await makeTmp();
  const slug = 'billing';
  await writeFeatureArtifacts(dir, slug);

  const result = await runReviewFeature({
    args: [dir],
    options: { feature: slug, scope: 'src/api/billing', json: true },
    logger: makeLogger(),
    t: mockT
  });

  assert.equal(result.ok, true);
  assert.ok(result.prompts.pentester.includes(slug));
  assert.ok(result.prompts.pentester.includes('src/api/billing'));
});

test('review:feature --skip-audit skips the audit but still prepares prompts', async () => {
  const dir = await makeTmp();
  const slug = 'profile';
  await writeFeatureArtifacts(dir, slug);

  const result = await runReviewFeature({
    args: [dir],
    options: { feature: slug, 'skip-audit': true, json: true },
    logger: makeLogger(),
    t: mockT
  });

  assert.equal(result.ok, true);
  assert.equal(result.audit, null);
  assert.ok(typeof result.prompts.tester === 'string');
});

test('review:feature --out-dir persists the prompts to files', async () => {
  const dir = await makeTmp();
  const slug = 'search';
  await writeFeatureArtifacts(dir, slug);

  const result = await runReviewFeature({
    args: [dir],
    options: { feature: slug, 'skip-audit': true, 'out-dir': '.aioson/reviews', json: true },
    logger: makeLogger(),
    t: mockT
  });

  assert.ok(result.saved.tester && result.saved.pentester);
  const testerContent = await fs.readFile(result.saved.tester, 'utf8');
  assert.ok(testerContent.includes(slug));
});

test('review:feature errors clearly when no feature is active and none is passed', async () => {
  const dir = await makeTmp();
  const result = await runReviewFeature({
    args: [dir],
    options: { json: true },
    logger: makeLogger(),
    t: mockT
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing_feature');
});

test('review:feature reports ambiguity when several features are in_progress', async () => {
  const dir = await makeTmp();
  await writeFile(
    dir,
    '.aioson/context/features.md',
    '# Features\n\n| slug | status | started | completed |\n|------|--------|---------|-----------|\n| alpha | in_progress | 2026-05-01 | — |\n| beta | in_progress | 2026-05-01 | — |\n'
  );

  const result = await runReviewFeature({
    args: [dir],
    options: { json: true },
    logger: makeLogger(),
    t: mockT
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'ambiguous_feature');
  assert.deepEqual(result.candidates.sort(), ['alpha', 'beta']);
});
