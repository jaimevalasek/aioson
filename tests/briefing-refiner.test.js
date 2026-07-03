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
const { buildInitialFeedback, validateFeedback, validateFindingsInput } = require('../src/lib/briefing-refiner/feedback-schema');
const { assertSafeSlug, resolveBriefingPath } = require('../src/lib/briefing-refiner/briefing-paths');
const { writeReviewArtifacts } = require('../src/lib/briefing-refiner/review-html');
const { applyConfirmedFeedback, applyDeclinedFeedback } = require('../src/lib/briefing-refiner/apply-feedback');
const { runBriefingApprove, runBriefingUnapprove, runBriefingReview, runBriefingApplyFeedback } = require('../src/commands/briefing');
const { runVerifyArtifact } = require('../src/commands/verify-artifact');
const { AGENT_ARTIFACT_KIND, verifyAgentArtifact } = require('../src/artifact-kinds');
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
  assert.equal(report.includes('Next action: collect_feedback'), true);
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

// ─── briefing:review / briefing:apply-feedback (the CLI-owned surface) ────────

const FINDINGS = [
  { section_id: 'problem', category: 'gap', severity: 'high', blocking: true, text: 'Success criteria are vague', recommendation: 'Adopt a measurable smoke scenario' },
  { section_id: 'risks', category: 'risk', severity: 'medium', text: 'Provider swap needs a versioned shape' }
];

test('schema v1.1 carries findings and round; validateFindingsInput is strict', () => {
  const parsed = parseBriefingSections(BRIEFING, '.aioson/briefings/idea-one/briefings.md');
  const feedback = buildInitialFeedback({
    slug: 'idea-one',
    sourcePath: '.aioson/briefings/idea-one/briefings.md',
    sourceHash: parsed.source_hash,
    sections: parsed.sections,
    findings: FINDINGS,
    round: 2
  });
  assert.equal(feedback.schema_version, '1.1');
  assert.equal(feedback.round, 2);
  assert.equal(feedback.findings.length, 2);
  assert.equal(feedback.findings[0].id, 'F1');
  assert.equal(feedback.findings[0].status, 'pending');
  assert.equal(validateFeedback(feedback, { slug: 'idea-one', currentSourceHash: parsed.source_hash }).ok, true);

  // a 1.0 payload (no findings) still validates
  const legacy = { ...feedback, schema_version: '1.0' };
  delete legacy.findings;
  assert.equal(validateFeedback(legacy, { slug: 'idea-one', currentSourceHash: parsed.source_hash }).ok, true);

  // strict input validation for the agent-supplied findings file
  const sectionIds = parsed.sections.map((section) => section.id);
  assert.equal(validateFindingsInput(FINDINGS, { sectionIds }).ok, true);
  assert.equal(validateFindingsInput([{ section_id: 'problem', category: 'nope', text: 'x' }], { sectionIds }).ok, false);
  assert.equal(validateFindingsInput([{ section_id: 'ghost', category: 'gap', text: 'x' }], { sectionIds }).ok, false);
  assert.equal(validateFindingsInput([{ section_id: 'problem', category: 'gap', text: '' }], { sectionIds }).ok, false);
});

test('review.html carries findings UI, filters, autosave, and the save fallback chain', async () => {
  const dir = await makeProject();
  const parsed = parseBriefingSections(BRIEFING, '.aioson/briefings/idea-one/briefings.md');
  await writeReviewArtifacts(dir, {
    slug: 'idea-one',
    sourceMarkdown: BRIEFING,
    sections: parsed.sections,
    sourceHash: parsed.source_hash,
    findings: FINDINGS,
    round: 1,
    locale: 'pt-BR'
  });
  const html = await fs.readFile(path.join(dir, '.aioson/briefings/idea-one/review.html'), 'utf8');

  assert.equal(html.includes('aioson:review schema=1.1'), true);
  assert.equal(html.includes(`source_hash=${parsed.source_hash}`), true);
  // export fallback chain: download + copy always present, FSA degrades to download
  assert.equal(html.includes('id="download"'), true);
  assert.equal(html.includes('id="copy"'), true);
  assert.equal(html.includes('id="save"'), true);
  assert.equal(html.includes("error.name === 'AbortError'"), true);
  assert.equal(html.includes('sandbox_fallback'), true);
  // localStorage autosave + restore
  assert.equal(html.includes('localStorage.setItem'), true);
  assert.equal(html.includes('restoreDraft'), true);
  // findings rendered per section with working category filters
  assert.equal(html.includes('data-finding="F1"'), true);
  assert.equal(html.includes('data-cat="pending-decision"'), true);
  assert.equal(html.includes("getElementById('filters').addEventListener"), true);
  // localized surface
  assert.equal(html.includes('Baixar JSON'), true);
  // fully self-contained
  assert.equal(/\bsrc=["']https?:|<link[^>]+href=["']https?:/.test(html), false);
});

test('briefing:review generates artifacts from findings and protects pending feedback', async () => {
  const dir = await makeProject();
  const logger = { log() {}, error() {} };
  await fs.writeFile(
    path.join(dir, '.aioson/briefings/idea-one/refinement-findings.json'),
    JSON.stringify(FINDINGS),
    'utf8'
  );

  const first = await runBriefingReview({ args: [dir], options: { slug: 'idea-one' }, logger });
  assert.equal(first.ok, true);
  assert.equal(first.round, 1);
  assert.equal(first.sections, 8);
  assert.equal(first.findings, 2);

  const registry = await readBriefingRegistry(dir);
  assert.equal(registry.briefings.find((b) => b.slug === 'idea-one').refinement_status, 'review_generated');

  // regenerating over the agent-written initial feedback is fine (round bumps)
  const second = await runBriefingReview({ args: [dir], options: { slug: 'idea-one' }, logger });
  assert.equal(second.ok, true);
  assert.equal(second.round, 2);

  // once the USER exported feedback for the current text, refuse without --force
  const feedbackPath = path.join(dir, '.aioson/briefings/idea-one/refinement-feedback.json');
  const exported = JSON.parse(await fs.readFile(feedbackPath, 'utf8'));
  exported.export_method = 'download';
  await fs.writeFile(feedbackPath, JSON.stringify(exported, null, 2), 'utf8');
  const refused = await runBriefingReview({ args: [dir], options: { slug: 'idea-one' }, logger });
  assert.equal(refused.ok, false);
  assert.equal(refused.error, 'pending_feedback');
  const forced = await runBriefingReview({ args: [dir], options: { slug: 'idea-one', force: true }, logger });
  assert.equal(forced.ok, true);
});

test('briefing:review rejects invalid findings and resolves slugs strictly', async () => {
  const dir = await makeProject();
  const logger = { log() {}, error() {} };

  // two refinable briefings (idea-one, idea-two) → no-slug is ambiguous
  const ambiguous = await runBriefingReview({ args: [dir], options: {}, logger });
  assert.equal(ambiguous.ok, false);
  assert.equal(ambiguous.error, 'ambiguous_slug');
  assert.deepEqual(ambiguous.candidates.sort(), ['idea-one', 'idea-two']);

  // a non-refinable slug is refused
  const notRefinable = await runBriefingReview({ args: [dir], options: { slug: 'idea-three' }, logger });
  assert.equal(notRefinable.ok, false);
  assert.equal(notRefinable.error, 'slug_not_refinable');

  // invalid findings fail closed
  await fs.writeFile(
    path.join(dir, '.aioson/briefings/idea-one/refinement-findings.json'),
    JSON.stringify([{ section_id: 'ghost', category: 'nope', text: '' }]),
    'utf8'
  );
  const invalid = await runBriefingReview({ args: [dir], options: { slug: 'idea-one' }, logger });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.error, 'invalid_findings');
});

test('briefing:apply-feedback dry-runs, applies with --confirm, archives, and keeps the round', async () => {
  const dir = await makeProject();
  const logger = { log() {}, error() {} };
  await fs.writeFile(
    path.join(dir, '.aioson/briefings/idea-one/refinement-findings.json'),
    JSON.stringify(FINDINGS),
    'utf8'
  );
  await runBriefingReview({ args: [dir], options: { slug: 'idea-one' }, logger });

  // simulate the user's exported feedback
  const feedbackPath = path.join(dir, '.aioson/briefings/idea-one/refinement-feedback.json');
  const feedback = JSON.parse(await fs.readFile(feedbackPath, 'utf8'));
  feedback.export_method = 'download';
  const problem = feedback.sections.find((section) => section.id === 'problem');
  problem.status = 'change_requested';
  problem.current_text = 'Refined problem via CLI.';
  feedback.findings.find((f) => f.id === 'F1').status = 'accepted';
  feedback.findings.find((f) => f.id === 'F2').status = 'deferred';
  await fs.writeFile(feedbackPath, JSON.stringify(feedback, null, 2), 'utf8');

  // dry-run: summary only, no write
  const dry = await runBriefingApplyFeedback({ args: [dir], options: { slug: 'idea-one' }, logger });
  assert.equal(dry.ok, true);
  assert.equal(dry.mode, 'dry-run');
  assert.equal(dry.pending_confirmation, true);
  assert.deepEqual(dry.summary.changed_sections.map((c) => c.id), ['problem']);
  const untouched = await fs.readFile(path.join(dir, '.aioson/briefings/idea-one/briefings.md'), 'utf8');
  assert.equal(untouched.includes('Refined problem via CLI.'), false);

  // confirm: applies, archives the consumed feedback + findings
  const applied = await runBriefingApplyFeedback({ args: [dir], options: { slug: 'idea-one', confirm: true }, logger });
  assert.equal(applied.ok, true);
  assert.equal(applied.nextAction, 'approve_briefing');
  assert.equal(applied.archived, '.aioson/briefings/idea-one/refinement-feedback.applied-round1.json');
  const markdown = await fs.readFile(path.join(dir, '.aioson/briefings/idea-one/briefings.md'), 'utf8');
  assert.equal(markdown.includes('Refined problem via CLI.'), true);
  await assert.rejects(fs.access(feedbackPath));
  await assert.rejects(fs.access(path.join(dir, '.aioson/briefings/idea-one/refinement-findings.json')));
  await fs.access(path.join(dir, '.aioson/briefings/idea-one/refinement-findings.applied-round1.json'));

  // the next round continues the counter (and carries no stale findings)
  const next = await runBriefingReview({ args: [dir], options: { slug: 'idea-one' }, logger });
  assert.equal(next.ok, true);
  assert.equal(next.round, 2);
  assert.equal(next.findings, 0);
});

test('briefing:apply-feedback treats a pending blocking finding as a blocker', async () => {
  const dir = await makeProject();
  const logger = { log() {}, error() {} };
  await fs.writeFile(
    path.join(dir, '.aioson/briefings/idea-one/refinement-findings.json'),
    JSON.stringify(FINDINGS),
    'utf8'
  );
  await runBriefingReview({ args: [dir], options: { slug: 'idea-one' }, logger });

  const feedbackPath = path.join(dir, '.aioson/briefings/idea-one/refinement-feedback.json');
  const feedback = JSON.parse(await fs.readFile(feedbackPath, 'utf8'));
  feedback.export_method = 'copy-paste';
  const context = feedback.sections.find((section) => section.id === 'context');
  context.status = 'change_requested';
  context.current_text = 'Sharper context.';
  // F1 is blocking and stays pending; blocking_items deliberately left empty
  await fs.writeFile(feedbackPath, JSON.stringify(feedback, null, 2), 'utf8');

  const applied = await runBriefingApplyFeedback({ args: [dir], options: { slug: 'idea-one', confirm: true }, logger });
  assert.equal(applied.ok, true);
  assert.equal(applied.nextAction, 'resolve_blockers');
  assert.equal(applied.pendingBlockingFindings, 1);

  const registry = await readBriefingRegistry(dir);
  assert.equal(registry.briefings.find((b) => b.slug === 'idea-one').refinement_status, 'blocked');
});

test('verify:artifact kind=review proves the canonical surface and rejects a hand-rolled one', async () => {
  const dir = await makeProject();
  const logger = { log() {}, error() {} };
  await runBriefingReview({ args: [dir], options: { slug: 'idea-one' }, logger });

  const silent = { log() {}, error() {}, warn() {} };
  const good = await runVerifyArtifact({ args: [dir], options: { kind: 'review', slug: 'idea-one', json: true, suppressExitCode: true }, logger: silent });
  assert.equal(good.ok, true);

  // editing briefings.md after generation → stale warning, not a failure
  await fs.appendFile(path.join(dir, '.aioson/briefings/idea-one/briefings.md'), '\nmore\n');
  const stale = await runVerifyArtifact({ args: [dir], options: { kind: 'review', slug: 'idea-one', json: true, suppressExitCode: true }, logger: silent });
  assert.equal(stale.ok, true);
  assert.equal(stale.warnings.length >= 1, true);

  // a hand-rolled surface without marker/fallbacks fails closed
  await fs.writeFile(
    path.join(dir, '.aioson/briefings/idea-one/review.html'),
    '<html><body><script src="https://cdn.example/x.js"></script><button id="btn-fs">save</button></body></html>',
    'utf8'
  );
  const bad = await runVerifyArtifact({ args: [dir], options: { kind: 'review', slug: 'idea-one', json: true, suppressExitCode: true, advisory: true }, logger: silent });
  assert.equal(bad.ok, false);
  assert.equal(bad.issues.some((issue) => issue.includes('aioson:review marker')), true);
  assert.equal(bad.issues.some((issue) => issue.includes('external resources')), true);
});

test('briefing-refiner auto-fires the review gate at agent:done', async () => {
  assert.deepEqual(AGENT_ARTIFACT_KIND['briefing-refiner'], { kind: 'review', needs: 'slug' });

  const dir = await makeProject();
  const logger = { log() {}, error() {} };
  await runBriefingReview({ args: [dir], options: { slug: 'idea-one' }, logger });

  const fired = await verifyAgentArtifact({ targetDir: dir, agent: 'briefing-refiner', options: { slug: 'idea-one' } });
  assert.equal(fired.kind, 'review');
  assert.equal(fired.ok, true);
  assert.equal(fired.skipped, false);

  const skipped = await verifyAgentArtifact({ targetDir: dir, agent: 'briefing-refiner', options: {} });
  assert.equal(skipped.skipped, true);
  assert.equal(skipped.reason.includes('--kind=review'), true);
});
