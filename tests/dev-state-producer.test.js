'use strict';

// dev-state-producer feature — synthetic E2E test for the upstream→@dev handoff
// contract. Verifies that `aioson dev:state:write` (alias of state:save)
// produces a dev-state.md that @dev's session-start protocol can consume
// without prompting the user for cold-start context.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  runStateSave,
  CONTEXT_TYPE_MAP,
  MAX_CONTEXT,
  parseContextFlag
} = require('../src/commands/state-save');

function silentLogger() {
  return { log: () => {}, warn: () => {}, error: () => {} };
}

async function makeFeatureProject({ slug, withFiles = [] } = {}) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'aios-dsp-'));
  const ctxDir = path.join(dir, '.aioson', 'context');
  fs.mkdirSync(ctxDir, { recursive: true });
  fs.writeFileSync(
    path.join(ctxDir, 'project.context.md'),
    '---\nproject_name: "dsp-fixture"\nclassification: MICRO\n---\n'
  );
  fs.writeFileSync(
    path.join(ctxDir, 'features.md'),
    `# Features\n\n| slug | status | started | completed |\n|------|--------|---------|-----------|\n| ${slug} | in_progress | 2026-05-17 | — |\n`
  );
  for (const file of withFiles) {
    const fullPath = file.includes('/')
      ? path.join(ctxDir, file)
      : path.join(ctxDir, file);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, `# ${file}\n\nfixture content\n`);
  }
  return dir;
}

// ─── parseContextFlag (pure) ───────────────────────────────────────────────

test('parseContextFlag handles comma-separated tokens with whitespace', () => {
  assert.deepEqual(parseContextFlag('spec,requirements, impl-plan'), ['spec', 'requirements', 'impl-plan']);
});

test('parseContextFlag returns null for empty / undefined input', () => {
  assert.equal(parseContextFlag(''), null);
  assert.equal(parseContextFlag(undefined), null);
  assert.equal(parseContextFlag(null), null);
});

test('parseContextFlag filters out empty entries from trailing/double commas', () => {
  assert.deepEqual(parseContextFlag('spec,,,requirements,'), ['spec', 'requirements']);
});

// ─── CONTEXT_TYPE_MAP shape ────────────────────────────────────────────────

test('CONTEXT_TYPE_MAP defines all canonical tokens declared for dev-state handoff', () => {
  const expected = ['prd', 'requirements', 'spec', 'architecture', 'impl-plan', 'sheldon', 'design-doc', 'readiness', 'dossier', 'simple-plan'];
  for (const k of expected) {
    assert.ok(CONTEXT_TYPE_MAP[k], `missing token: ${k}`);
    assert.equal(typeof CONTEXT_TYPE_MAP[k].rel, 'function', `${k}.rel must be a function`);
  }
});

test('CONTEXT_TYPE_MAP.spec resolves to feature-scoped path', () => {
  assert.equal(CONTEXT_TYPE_MAP.spec.rel('checkout'), 'spec-checkout.md');
});

test('CONTEXT_TYPE_MAP.architecture is slug-independent', () => {
  assert.equal(CONTEXT_TYPE_MAP.architecture.rel('checkout'), 'architecture.md');
});

test('CONTEXT_TYPE_MAP.design-doc declares a fallback', () => {
  assert.equal(typeof CONTEXT_TYPE_MAP['design-doc'].fallback, 'function');
  assert.equal(CONTEXT_TYPE_MAP['design-doc'].fallback(), 'design-doc.md');
});

test('CONTEXT_TYPE_MAP.readiness declares a fallback', () => {
  assert.equal(CONTEXT_TYPE_MAP.readiness.rel('checkout'), 'readiness-checkout.md');
  assert.equal(typeof CONTEXT_TYPE_MAP.readiness.fallback, 'function');
  assert.equal(CONTEXT_TYPE_MAP.readiness.fallback(), 'readiness.md');
});

test('CONTEXT_TYPE_MAP.simple-plan resolves to the simple-plans directory', () => {
  assert.equal(CONTEXT_TYPE_MAP['simple-plan'].rel('tiny-fix'), 'simple-plans/tiny-fix.md');
});

// ─── runStateSave with --context (the producer contract) ───────────────────

test('producer-contract: dev:state:write writes dev-state.md with feature + next_step + context_package', async () => {
  const slug = 'checkout';
  const dir = await makeFeatureProject({
    slug,
    withFiles: [`spec-${slug}.md`, `requirements-${slug}.md`]
  });
  const result = await runStateSave({
    args: [dir],
    options: {
      feature: slug,
      phase: '1',
      next: 'Implement Phase 1: order schema + checkout endpoint',
      context: 'spec,requirements',
      json: true
    },
    logger: silentLogger()
  });

  assert.equal(result.ok, true);
  assert.equal(result.active_feature, slug);
  assert.equal(result.active_phase, '1');
  assert.deepEqual(result.context_package, [
    'project.context.md',
    'spec-checkout.md',
    'requirements-checkout.md'
  ]);
  assert.deepEqual(result.warnings, []);

  const written = fs.readFileSync(path.join(dir, '.aioson/context/dev-state.md'), 'utf8');
  assert.match(written, /active_feature: checkout/);
  assert.match(written, /active_phase: 1/);
  assert.match(written, /Implement Phase 1: order schema \+ checkout endpoint/);
});

test('producer-contract: missing context files emit warnings (warn-and-skip, never fail)', async () => {
  const slug = 'newfeat';
  const dir = await makeFeatureProject({ slug, withFiles: [] }); // no spec/requirements/prd
  const result = await runStateSave({
    args: [dir],
    options: {
      feature: slug,
      next: 'first slice',
      context: 'spec,requirements,prd',
      json: true
    },
    logger: silentLogger()
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.context_package, ['project.context.md']);
  assert.equal(result.warnings.length, 3);
  assert.ok(result.warnings.every((w) => w.includes('missing')));
});

test('producer-contract: simple-plan context token writes a lightweight implementation plan package', async () => {
  const slug = 'tiny-fix';
  const dir = await makeFeatureProject({
    slug,
    withFiles: [`simple-plans/${slug}.md`]
  });
  const result = await runStateSave({
    args: [dir],
    options: {
      feature: slug,
      next: 'Implement the simple-plan done criteria',
      context: 'simple-plan',
      json: true
    },
    logger: silentLogger()
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.context_package, [
    'project.context.md',
    `simple-plans/${slug}.md`
  ]);
  assert.deepEqual(result.warnings, []);

  const written = fs.readFileSync(path.join(dir, '.aioson/context/dev-state.md'), 'utf8');
  assert.match(written, new RegExp(`2\\. simple-plans/${slug}\\.md`));
});

test('producer-contract: unknown context token warns and skips, does not fail', async () => {
  const slug = 'xfeat';
  const dir = await makeFeatureProject({ slug, withFiles: [`spec-${slug}.md`] });
  const result = await runStateSave({
    args: [dir],
    options: { feature: slug, next: 'go', context: 'spec,unknown-type,nope', json: true },
    logger: silentLogger()
  });

  assert.equal(result.ok, true);
  assert.equal(result.context_package.includes(`spec-${slug}.md`), true);
  assert.equal(result.warnings.some((w) => w.includes('unknown context type "unknown-type"')), true);
  assert.equal(result.warnings.some((w) => w.includes('unknown context type "nope"')), true);
});

test('producer-contract: readiness context token prefers feature-scoped handoff artifact', async () => {
  const slug = 'checkout';
  const dir = await makeFeatureProject({
    slug,
    withFiles: [`readiness-${slug}.md`, 'readiness.md']
  });
  try {
    const result = await runStateSave({
      args: [dir],
      options: { feature: slug, next: 'go', context: 'readiness', json: true },
      logger: silentLogger()
    });

    assert.equal(result.ok, true);
    assert.deepEqual(result.context_package, ['project.context.md', `readiness-${slug}.md`]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('producer-contract: respects 4-entry cap (project.context.md + 3 tokens)', async () => {
  const slug = 'capfeat';
  const dir = await makeFeatureProject({
    slug,
    withFiles: [`prd-${slug}.md`, `spec-${slug}.md`, `requirements-${slug}.md`, 'architecture.md', `implementation-plan-${slug}.md`]
  });
  // Request 5 tokens; cap should clip after MAX_CONTEXT-1 (3) of them
  const result = await runStateSave({
    args: [dir],
    options: {
      feature: slug,
      next: 'all-the-context',
      context: 'prd,spec,requirements,architecture,impl-plan',
      json: true
    },
    logger: silentLogger()
  });

  assert.equal(result.ok, true);
  assert.equal(result.context_package.length, MAX_CONTEXT);
  assert.equal(result.context_package[0], 'project.context.md');
  assert.equal(result.warnings.some((w) => w.includes('cap reached')), true);
});

test('producer-contract: idempotent — running twice produces same state file', async () => {
  const slug = 'idem';
  const dir = await makeFeatureProject({ slug, withFiles: [`spec-${slug}.md`] });
  const optsBase = {
    feature: slug,
    next: 'idempotent slice',
    context: 'spec',
    json: true
  };

  const r1 = await runStateSave({ args: [dir], options: { ...optsBase }, logger: silentLogger() });
  const content1 = fs.readFileSync(path.join(dir, '.aioson/context/dev-state.md'), 'utf8');

  const r2 = await runStateSave({ args: [dir], options: { ...optsBase }, logger: silentLogger() });
  const content2 = fs.readFileSync(path.join(dir, '.aioson/context/dev-state.md'), 'utf8');

  assert.equal(r1.active_feature, r2.active_feature);
  assert.deepEqual(r1.context_package, r2.context_package);
  // Body is rewritten deterministically — same frontmatter, same context block.
  // Only the History section accumulates; that's the intended audit trail.
  const fm1 = content1.match(/^---\n([\s\S]+?)\n---/)[1];
  const fm2 = content2.match(/^---\n([\s\S]+?)\n---/)[1];
  assert.equal(fm1, fm2);
});

test('producer-contract: backward-compat — without --context, falls back to auto-detect', async () => {
  const slug = 'legacy';
  const dir = await makeFeatureProject({
    slug,
    withFiles: [`spec-${slug}.md`, `implementation-plan-${slug}.md`]
  });
  const result = await runStateSave({
    args: [dir],
    options: { feature: slug, next: 'legacy call', json: true },
    logger: silentLogger()
  });

  assert.equal(result.ok, true);
  // Legacy auto-detect path: project.context + spec + impl-plan
  assert.deepEqual(result.context_package, [
    'project.context.md',
    `spec-${slug}.md`,
    `implementation-plan-${slug}.md`
  ]);
});

test('truncation regression: long --next value (1000+ chars) roundtrips intact', async () => {
  const slug = 'longnext';
  const dir = await makeFeatureProject({ slug });
  const longNext = 'A'.repeat(500) + ' STOP=marker ' + 'B'.repeat(500);
  const result = await runStateSave({
    args: [dir],
    options: { feature: slug, next: longNext, json: true },
    logger: silentLogger()
  });

  assert.equal(result.ok, true);
  assert.equal(result.next_step, longNext);
  assert.equal(result.next_step.length, longNext.length);

  const written = fs.readFileSync(path.join(dir, '.aioson/context/dev-state.md'), 'utf8');
  assert.ok(written.includes('STOP=marker'), 'STOP=marker preserved in saved file');
});

// ─── @dev consumer contract — verify dev-state.md is shaped to feed cold-resume

test('@dev consumer contract: dev-state.md frontmatter exposes active_feature + active_phase + next_step + status', async () => {
  const slug = 'consume';
  const dir = await makeFeatureProject({ slug, withFiles: [`spec-${slug}.md`] });
  await runStateSave({
    args: [dir],
    options: { feature: slug, phase: '2', next: 'phase 2 next', context: 'spec', status: 'in_progress', json: true },
    logger: silentLogger()
  });

  const written = fs.readFileSync(path.join(dir, '.aioson/context/dev-state.md'), 'utf8');
  const fmBlock = written.match(/^---\n([\s\S]+?)\n---/);
  assert.ok(fmBlock, 'frontmatter present');
  const fm = fmBlock[1];
  for (const key of ['active_feature', 'active_phase', 'next_step', 'status']) {
    assert.match(fm, new RegExp(`^${key}:`, 'm'), `frontmatter must include ${key}`);
  }
});

test('@dev consumer contract: context package is a numbered list under "## Context package"', async () => {
  const slug = 'consume2';
  const dir = await makeFeatureProject({
    slug,
    withFiles: [`spec-${slug}.md`, `requirements-${slug}.md`]
  });
  await runStateSave({
    args: [dir],
    options: { feature: slug, next: 'go', context: 'spec,requirements', json: true },
    logger: silentLogger()
  });

  const written = fs.readFileSync(path.join(dir, '.aioson/context/dev-state.md'), 'utf8');
  const section = written.match(/## Context package\n\n([\s\S]+?)\n\n##/);
  assert.ok(section, 'Context package section present');
  const lines = section[1].split('\n');
  assert.match(lines[0], /^1\. project\.context\.md$/);
  assert.match(lines[1], new RegExp(`^2\\. spec-${slug}\\.md$`));
  assert.match(lines[2], new RegExp(`^3\\. requirements-${slug}\\.md$`));
});
