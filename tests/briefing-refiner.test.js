'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { getAgentDefinition } = require('../src/agents');
const { MANAGED_FILES } = require('../src/constants');
const {
  listRefinableBriefings,
  parseConfigFrontmatter,
  readBriefingRegistry,
  writeBriefingRegistry
} = require('../src/lib/briefing-refiner/briefing-registry');
const { hashText, parseBriefingSections, serializeBriefingSections } = require('../src/lib/briefing-refiner/briefing-sections');
const { buildInitialFeedback, validateFeedback } = require('../src/lib/briefing-refiner/feedback-schema');
const { assertSafeSlug, resolveBriefingPath } = require('../src/lib/briefing-refiner/briefing-paths');
const { writeReviewArtifacts } = require('../src/lib/briefing-refiner/review-html');
const { applyConfirmedFeedback, applyDeclinedFeedback } = require('../src/lib/briefing-refiner/apply-feedback');
const { runBriefingApprove, runBriefingUnapprove } = require('../src/commands/briefing');
const { isCanonicalAgent } = require('../src/dossier/schema');

const ROOT = path.resolve(__dirname, '..');

const BRIEFING = `# Briefing

## Context
Original context.

## Problem
Original problem.

## Proposed solution
Original solution.

## Themes
- Theme one

## Risks
- Risk one

## Identified gaps
- Gap one

## Sources
- Source one

## Open questions
- Question one
`;

async function makeProject() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-briefing-refiner-'));
  await fs.mkdir(path.join(dir, '.aioson', 'briefings', 'idea-one'), { recursive: true });
  await fs.writeFile(path.join(dir, '.aioson', 'briefings', 'idea-one', 'briefings.md'), BRIEFING, 'utf8');
  await writeBriefingRegistry(dir, {
    updated_at: '2026-06-08',
    briefings: [
      {
        slug: 'idea-one',
        status: 'approved',
        source_plans: ['plans/idea.md'],
        created_at: '2026-06-08',
        approved_at: '2026-06-08',
        prd_generated: null
      },
      {
        slug: 'idea-two',
        status: 'draft',
        source_plans: [],
        created_at: '2026-06-08',
        approved_at: null,
        prd_generated: null
      },
      {
        slug: 'idea-three',
        status: 'approved',
        source_plans: [],
        created_at: '2026-06-08',
        approved_at: '2026-06-08',
        prd_generated: '.aioson/context/prd-idea-three.md'
      },
      {
        slug: 'idea-four',
        status: 'implemented',
        source_plans: [],
        created_at: '2026-06-08',
        approved_at: null,
        prd_generated: null
      }
    ]
  });
  return dir;
}

test('briefing-refiner agent is registered as official but not workflow-mandatory', async () => {
  const agent = getAgentDefinition('briefing-refiner');
  assert.equal(agent.id, 'briefing-refiner');
  assert.equal(MANAGED_FILES.includes('.aioson/agents/briefing-refiner.md'), true);

  const templatePrompt = await fs.readFile(path.join(ROOT, 'template/.aioson/agents/briefing-refiner.md'), 'utf8');
  const workspacePrompt = await fs.readFile(path.join(ROOT, '.aioson/agents/briefing-refiner.md'), 'utf8');
  assert.equal(templatePrompt, workspacePrompt);

  for (const token of ['LANGUAGE BOUNDARY', '## Mission', '## Required input', '## Hard constraints', 'pulse:update', 'agent:done']) {
    assert.equal(templatePrompt.includes(token), true, `missing prompt token: ${token}`);
  }

  const agentsCommand = await fs.readFile(path.join(ROOT, 'src/commands/agents.js'), 'utf8');
  assert.equal(agentsCommand.includes("'briefing-refiner'"), false);
  assert.equal(isCanonicalAgent('briefing-refiner'), true);
});

test('registry parser lists only refinable briefings and preserves refinement metadata', async () => {
  const content = `---
updated_at: 2026-06-08
briefings:
  - slug: alpha
    status: draft
    source_plans: ["plans/a.md"]
    created_at: "2026-06-08"
    approved_at: null
    prd_generated: null
    refinement_status: "review_generated"
---
`;
  const data = parseConfigFrontmatter(content);
  assert.equal(data.briefings[0].refinement_status, 'review_generated');

  const refinable = listRefinableBriefings({
    briefings: [
      { slug: 'draft-one', status: 'draft', prd_generated: null },
      { slug: 'approved-one', status: 'approved', prd_generated: null },
      { slug: 'prd-one', status: 'approved', prd_generated: '.aioson/context/prd-prd-one.md' },
      { slug: 'done-one', status: 'implemented', prd_generated: null }
    ]
  });
  assert.deepEqual(refinable.map((item) => item.slug), ['draft-one', 'approved-one']);
});

test('briefing approve and unapprove still round-trip through shared registry', async () => {
  const dir = await makeProject();
  const logger = { log() {}, error() {} };

  const approve = await runBriefingApprove({ args: [dir], options: { slug: 'idea-two' }, logger });
  assert.deepEqual(approve, { ok: true, approved: 'idea-two' });

  let registry = await readBriefingRegistry(dir);
  let entry = registry.briefings.find((item) => item.slug === 'idea-two');
  assert.equal(entry.status, 'approved');
  assert.equal(Boolean(entry.approved_at), true);

  const unapprove = await runBriefingUnapprove({ args: [dir], options: { slug: 'idea-two' }, logger });
  assert.deepEqual(unapprove, { ok: true, unapproved: ['idea-two'] });

  registry = await readBriefingRegistry(dir);
  entry = registry.briefings.find((item) => item.slug === 'idea-two');
  assert.equal(entry.status, 'draft');
  assert.equal(entry.approved_at, null);
});

test('briefing:unapprove refuses an approved briefing that already generated a PRD', async () => {
  const dir = await makeProject();
  const logger = { log() {}, error() {} };

  // idea-three is approved AND prd_generated — it must not be unapprovable.
  const result = await runBriefingUnapprove({ args: [dir], options: { slug: 'idea-three' }, logger });
  assert.deepEqual(result, { ok: false, error: 'slug_not_found' });

  const registry = await readBriefingRegistry(dir);
  const entry = registry.briefings.find((item) => item.slug === 'idea-three');
  assert.equal(entry.status, 'approved'); // untouched
  assert.equal(entry.prd_generated, '.aioson/context/prd-idea-three.md');
});

test('review artifact generation writes html, feedback json, and report', async () => {
  const dir = await makeProject();
  const parsed = parseBriefingSections(BRIEFING, '.aioson/briefings/idea-one/briefings.md');
  await writeReviewArtifacts(dir, {
    slug: 'idea-one',
    sourceMarkdown: BRIEFING,
    sections: parsed.sections,
    sourceHash: parsed.source_hash
  });

  const html = await fs.readFile(path.join(dir, '.aioson/briefings/idea-one/review.html'), 'utf8');
  const feedback = JSON.parse(await fs.readFile(path.join(dir, '.aioson/briefings/idea-one/refinement-feedback.json'), 'utf8'));
  const report = await fs.readFile(path.join(dir, '.aioson/briefings/idea-one/refinement-report.md'), 'utf8');

  assert.equal(html.includes('contenteditable="plaintext-only"'), true);
  assert.equal(html.includes('Download JSON'), true);
  assert.equal(html.includes('Copy JSON'), true);
  assert.equal(feedback.sections.length, 8);
  assert.equal(report.includes('Next action: rerun_review'), true);
});

test('feedback validation rejects cross-slug and stale feedback', () => {
  const parsed = parseBriefingSections(BRIEFING, '.aioson/briefings/idea-one/briefings.md');
  const feedback = buildInitialFeedback({
    slug: 'idea-one',
    sourcePath: '.aioson/briefings/idea-one/briefings.md',
    sourceHash: parsed.source_hash,
    sections: parsed.sections
  });

  assert.equal(validateFeedback(feedback, { slug: 'other', currentSourceHash: parsed.source_hash }).ok, false);
  assert.equal(validateFeedback(feedback, { slug: 'idea-one', currentSourceHash: hashText(`${BRIEFING}\nchanged`) }).ok, false);
});

test('confirmed feedback applies markdown changes and returns approved briefing to draft', async () => {
  const dir = await makeProject();
  const parsed = parseBriefingSections(BRIEFING, '.aioson/briefings/idea-one/briefings.md');
  const feedback = buildInitialFeedback({
    slug: 'idea-one',
    sourcePath: '.aioson/briefings/idea-one/briefings.md',
    sourceHash: parsed.source_hash,
    sections: parsed.sections
  });
  const problem = feedback.sections.find((section) => section.title === 'Problem');
  problem.status = 'change_requested';
  problem.current_text = 'Refined problem.';

  const result = await applyConfirmedFeedback(dir, 'idea-one', feedback, { confirmed: true });
  assert.equal(result.ok, true);
  assert.equal(result.returnedToDraft, true);

  const markdown = await fs.readFile(path.join(dir, '.aioson/briefings/idea-one/briefings.md'), 'utf8');
  assert.equal(markdown.includes('## Problem\nRefined problem.'), true);
  for (const title of ['Context', 'Problem', 'Proposed solution', 'Themes', 'Risks', 'Identified gaps', 'Sources', 'Open questions']) {
    assert.equal(markdown.includes(`## ${title}`), true);
  }

  const registry = await readBriefingRegistry(dir);
  const entry = registry.briefings.find((item) => item.slug === 'idea-one');
  assert.equal(entry.status, 'draft');
  assert.equal(entry.approved_at, null);
  assert.equal(entry.refinement_status, 'applied');
});

test('confirmed feedback on an already-draft briefing reports returnedToDraft false', async () => {
  const dir = await makeProject();
  // idea-two is a draft — give it a briefings.md to refine.
  await fs.mkdir(path.join(dir, '.aioson', 'briefings', 'idea-two'), { recursive: true });
  await fs.writeFile(path.join(dir, '.aioson', 'briefings', 'idea-two', 'briefings.md'), BRIEFING, 'utf8');

  const parsed = parseBriefingSections(BRIEFING, '.aioson/briefings/idea-two/briefings.md');
  const feedback = buildInitialFeedback({
    slug: 'idea-two',
    sourcePath: '.aioson/briefings/idea-two/briefings.md',
    sourceHash: parsed.source_hash,
    sections: parsed.sections
  });
  const problem = feedback.sections.find((section) => section.title === 'Problem');
  problem.status = 'change_requested';
  problem.current_text = 'Refined draft problem.';

  const result = await applyConfirmedFeedback(dir, 'idea-two', feedback, { confirmed: true });
  assert.equal(result.ok, true);
  assert.equal(result.returnedToDraft, false); // it was already draft — nothing reverted

  const registry = await readBriefingRegistry(dir);
  const entry = registry.briefings.find((item) => item.slug === 'idea-two');
  assert.equal(entry.status, 'draft');
});

test('declined feedback leaves briefing unchanged and records skipped changes', async () => {
  const dir = await makeProject();
  const originalMarkdown = await fs.readFile(path.join(dir, '.aioson/briefings/idea-one/briefings.md'), 'utf8');
  const parsed = parseBriefingSections(originalMarkdown, '.aioson/briefings/idea-one/briefings.md');
  const feedback = buildInitialFeedback({
    slug: 'idea-one',
    sourcePath: '.aioson/briefings/idea-one/briefings.md',
    sourceHash: parsed.source_hash,
    sections: parsed.sections
  });
  const problem = feedback.sections.find((section) => section.title === 'Problem');
  problem.status = 'change_requested';
  problem.current_text = 'Declined problem edit.';

  const result = await applyDeclinedFeedback(dir, 'idea-one', feedback);
  assert.equal(result.ok, true);
  assert.equal(result.skippedChanges.length, 1);

  const markdown = await fs.readFile(path.join(dir, '.aioson/briefings/idea-one/briefings.md'), 'utf8');
  assert.equal(markdown, originalMarkdown);

  const report = await fs.readFile(path.join(dir, '.aioson/briefings/idea-one/refinement-report.md'), 'utf8');
  assert.equal(report.includes('Status: declined'), true);
  assert.equal(report.includes('## Skipped Changes'), true);
  assert.equal(report.includes('problem: declined by user: text changed'), true);
  assert.equal(report.includes('Next action: rerun_review'), true);
});

test('confirmed feedback with blockers reports resolve_blockers instead of product-ready handoff', async () => {
  const dir = await makeProject();
  const parsed = parseBriefingSections(BRIEFING, '.aioson/briefings/idea-one/briefings.md');
  const feedback = buildInitialFeedback({
    slug: 'idea-one',
    sourcePath: '.aioson/briefings/idea-one/briefings.md',
    sourceHash: parsed.source_hash,
    sections: parsed.sections
  });
  feedback.blocking_items.push({ id: 'block-problem', section_id: 'problem', note: 'Decision missing', resolved: false });

  const result = await applyConfirmedFeedback(dir, 'idea-one', feedback, { confirmed: true });
  assert.equal(result.ok, true);
  assert.equal(result.nextAction, 'resolve_blockers');

  const report = await fs.readFile(path.join(dir, '.aioson/briefings/idea-one/refinement-report.md'), 'utf8');
  assert.equal(report.includes('Next action: resolve_blockers'), true);
});

// ─── Security regressions (pentester findings SF-01..SF-06) ──────────────────

test('SF-01/SF-02: assertSafeSlug and resolveBriefingPath block path traversal', () => {
  assert.equal(assertSafeSlug('idea-one'), 'idea-one');
  for (const bad of ['../escape', '..', 'a/b', 'a\\b', '.hidden', '/abs', 'UP', '']) {
    assert.throws(() => assertSafeSlug(bad), (e) => e.code === 'invalid_slug', `should reject ${JSON.stringify(bad)}`);
  }
  const root = path.join(os.tmpdir(), 'aioson-resolve-check');
  assert.equal(
    resolveBriefingPath(root, 'idea-one', 'briefings.md'),
    path.resolve(root, '.aioson', 'briefings', 'idea-one', 'briefings.md')
  );
  assert.throws(() => resolveBriefingPath(root, '../../escape', 'briefings.md'), (e) => e.code === 'invalid_slug');
  assert.throws(() => resolveBriefingPath(root, 'idea-one', '../../../escape.md'), (e) => e.code === 'path_escape');
});

test('SF-01: writeReviewArtifacts rejects a path-traversal slug', async () => {
  const dir = await makeProject();
  const parsed = parseBriefingSections(BRIEFING, '.aioson/briefings/idea-one/briefings.md');
  await assert.rejects(
    writeReviewArtifacts(dir, {
      slug: '../../../../escape',
      sourceMarkdown: BRIEFING,
      sections: parsed.sections,
      sourceHash: parsed.source_hash
    }),
    (e) => e.code === 'invalid_slug'
  );
});

test('SF-01: applyConfirmedFeedback rejects a path-traversal slug before any write', async () => {
  const dir = await makeProject();
  const victimDir = path.join(dir, '.aioson', 'VICTIM');
  await fs.mkdir(victimDir, { recursive: true });
  await fs.writeFile(path.join(victimDir, 'briefings.md'), BRIEFING, 'utf8');

  const parsed = parseBriefingSections(BRIEFING, '.aioson/briefings/idea-one/briefings.md');
  const feedback = buildInitialFeedback({
    slug: 'idea-one',
    sourcePath: '.aioson/briefings/idea-one/briefings.md',
    sourceHash: parsed.source_hash,
    sections: parsed.sections
  });
  const problem = feedback.sections.find((section) => section.title === 'Problem');
  problem.status = 'change_requested';
  problem.current_text = 'SHOULD NOT BE WRITTEN';

  await assert.rejects(
    applyConfirmedFeedback(dir, '../VICTIM', feedback, { confirmed: true, allowStale: true }),
    (e) => e.code === 'invalid_slug'
  );
  const victim = await fs.readFile(path.join(victimDir, 'briefings.md'), 'utf8');
  assert.equal(victim, BRIEFING); // untouched
});

test('SF-02: validateFeedback rejects out-of-tree source path with matching suffix', () => {
  const parsed = parseBriefingSections(BRIEFING, '.aioson/briefings/idea-one/briefings.md');
  const feedback = buildInitialFeedback({
    slug: 'idea-one',
    sourcePath: '/etc/evil/.aioson/briefings/idea-one/briefings.md',
    sourceHash: parsed.source_hash,
    sections: parsed.sections
  });
  const result = validateFeedback(feedback, { slug: 'idea-one', currentSourceHash: parsed.source_hash });
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((e) => e.includes('source_briefing_path')), true);
});

test('SF-04: serializeBriefingSections rejects injected duplicate section headers', () => {
  const injected = BRIEFING.replace('Original context.', 'Original context.\n\n## Sources\ninjected');
  const parsed = parseBriefingSections(BRIEFING, '.aioson/briefings/idea-one/briefings.md');
  assert.throws(() => serializeBriefingSections(injected, parsed.sections), (e) => e.code === 'duplicate_sections');
});

test('SF-06: registry serialization neutralizes scalar injection and validates slug', async () => {
  const dir = await makeProject();
  await writeBriefingRegistry(dir, {
    updated_at: '2026-06-08',
    briefings: [{
      slug: 'idea-x',
      status: 'draft',
      source_plans: [],
      created_at: '2026-06-08"\n  - slug: injected',
      approved_at: null,
      prd_generated: null
    }]
  });
  const data = await readBriefingRegistry(dir);
  assert.equal(data.briefings.length, 1); // injection did not spawn a second entry
  assert.equal(data.briefings[0].slug, 'idea-x');

  await assert.rejects(
    writeBriefingRegistry(dir, {
      updated_at: '2026-06-08',
      briefings: [{ slug: '../evil', status: 'draft', source_plans: [], created_at: '2026-06-08', approved_at: null, prd_generated: null }]
    }),
    (e) => e.code === 'invalid_slug'
  );
});
