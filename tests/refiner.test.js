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
} = require('../src/lib/refiner/briefing-registry');
const { hashText, parseBriefingSections, serializeBriefingSections } = require('../src/lib/refiner/briefing-sections');
const {
  buildInitialFeedback,
  collectApprovedReviewDecisions,
  DECISION_LIMITS,
  validateFeedback,
  validateFindingsInput
} = require('../src/lib/refiner/feedback-schema');
const { renderSafeMarkdown } = require('../src/lib/refiner/safe-markdown');
const { assertSafeSlug, resolveBriefingPath } = require('../src/lib/refiner/briefing-paths');
const { writeReviewArtifacts } = require('../src/lib/refiner/review-html');
const { applyConfirmedFeedback, applyDeclinedFeedback } = require('../src/lib/refiner/apply-feedback');
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
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-refiner-'));
  await fs.mkdir(path.join(dir, '.aioson', 'briefings', 'idea-one'), { recursive: true });
  await fs.mkdir(path.join(dir, '.aioson', 'briefings', 'idea-two'), { recursive: true });
  await fs.writeFile(path.join(dir, '.aioson', 'briefings', 'idea-one', 'briefings.md'), BRIEFING, 'utf8');
  await fs.writeFile(
    path.join(dir, '.aioson', 'briefings', 'idea-two', 'briefings.md'),
    '---\nprototype: not_applicable\n---\n\n# Nonvisual briefing\n',
    'utf8'
  );
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

test('refiner agent is registered as official but not workflow-mandatory', async () => {
  const agent = getAgentDefinition('refiner');
  assert.equal(agent.id, 'refiner');
  assert.equal(MANAGED_FILES.includes('.aioson/agents/refiner.md'), true);

  const templatePrompt = await fs.readFile(path.join(ROOT, 'template/.aioson/agents/refiner.md'), 'utf8');
  const workspacePrompt = await fs.readFile(path.join(ROOT, '.aioson/agents/refiner.md'), 'utf8');
  assert.equal(templatePrompt, workspacePrompt);

  for (const token of [
    'LANGUAGE BOUNDARY',
    '## Mission',
    '## Required input',
    '### Explicit model delegation (user-requested only)',
    '.aioson/docs/model-delegation.md',
    'bounded premium quality pass',
    '## Hard constraints',
    'pulse:update',
    'agent:done'
  ]) {
    assert.equal(templatePrompt.includes(token), true, `missing prompt token: ${token}`);
  }

  const agentsCommand = await fs.readFile(path.join(ROOT, 'src/commands/agents.js'), 'utf8');
  assert.equal(agentsCommand.includes("'refiner'"), false);
  assert.equal(isCanonicalAgent('refiner'), true);
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

test('briefing approval freezes an owned prototype and unapproval returns it to draft', async () => {
  const dir = await makeProject();
  const logger = { log() {}, error() {} };
  const briefingDir = path.join(dir, '.aioson', 'briefings', 'idea-two');
  await fs.writeFile(path.join(briefingDir, 'briefings.md'), '# Visual briefing\n\nA decision workspace for saved orders.\n', 'utf8');
  const filler = Array.from({ length: 40 }, (_, index) => `.f${index}{padding:var(--s);margin:var(--s);color:var(--fg);background:var(--bg)}`).join('\n');
  await fs.writeFile(path.join(briefingDir, 'prototype.html'), `<!doctype html><style>
    :root{--s:8px;--fg:#111;--bg:#fff}body{font-family:Georgia,serif;color:var(--fg);background:var(--bg)}
    button:focus-visible{outline:2px solid var(--fg)}${filler}
  </style><main id="main"><h1>Saved orders</h1><button>Save</button><table><thead><tr><th>Order</th><th>Status</th><th>Owner</th></tr></thead><tbody><tr><td>41</td><td>Ready</td><td>Ana</td></tr></tbody></table></main>\n`, 'utf8');
  await fs.writeFile(
    path.join(briefingDir, 'prototype-manifest.md'),
    `---
feature: idea-two
status: draft
approved_at: null
identity: none
---

# Prototype

## Visual direction
- register: technical editorial
- thesis: saved orders form one continuous decision ledger with evidence beside each action.
- anti-goals: generic card dashboard, decorative gradient hero.
- composition signature: a numbered ledger spine anchors every saved order and its next decision.

## Runtime matrix
- entry: #main

## Quality evidence
- verdict: pass
- evidence: .aioson/context/features/idea-two/visual-evidence.json
- craft: 0/5
- runtime: waived — owner explicitly accepted static-only evidence for this fixture
- routes: 0
`,
    'utf8'
  );

  const measured = await runVerifyArtifact({
    args: [dir],
    options: { kind: 'visual', slug: 'idea-two', advisory: true, json: true, suppressExitCode: true },
    logger
  });
  assert.equal(measured.verdict, 'pass');

  const incompleteMatrix = await runBriefingApprove({
    args: [dir],
    options: { slug: 'idea-two' },
    logger
  });
  assert.equal(incompleteMatrix.error, 'prototype_runtime_matrix_missing');

  const manifestPath = path.join(briefingDir, 'prototype-manifest.md');
  const completeManifest = (await fs.readFile(manifestPath, 'utf8')).replace(
    '- entry: #main',
    '- entry: #main\n- loading: #loading | state=loading\n- empty: #empty | state=empty'
  );
  await fs.writeFile(manifestPath, completeManifest, 'utf8');
  const refreshed = await runVerifyArtifact({
    args: [dir],
    options: { kind: 'visual', slug: 'idea-two', advisory: true, json: true, suppressExitCode: true },
    logger
  });
  assert.equal(refreshed.verdict, 'pass');

  assert.equal((await runBriefingApprove({
    args: [dir],
    options: { slug: 'idea-two' },
    logger
  })).ok, true);
  let manifest = await fs.readFile(path.join(briefingDir, 'prototype-manifest.md'), 'utf8');
  assert.match(manifest, /^status: approved$/m);
  assert.doesNotMatch(manifest, /^approved_at: null$/m);

  assert.equal((await runBriefingUnapprove({
    args: [dir],
    options: { slug: 'idea-two' },
    logger
  })).ok, true);
  manifest = await fs.readFile(path.join(briefingDir, 'prototype-manifest.md'), 'utf8');
  assert.match(manifest, /^status: draft$/m);
  assert.match(manifest, /^approved_at: null$/m);
});

test('briefing approval blocks an unresolved visual/prototype decision with an actionable message', async () => {
  const dir = await makeProject();
  const lines = [];
  const logger = { log: (m = '') => lines.push(String(m)), error: (m = '') => lines.push(String(m)) };
  await fs.writeFile(
    path.join(dir, '.aioson', 'briefings', 'idea-two', 'briefings.md'),
    '# Briefing without prototype resolution\n',
    'utf8'
  );
  const result = await runBriefingApprove({
    args: [dir],
    options: { slug: 'idea-two' },
    logger
  });
  assert.deepEqual(result, {
    ok: false,
    error: 'prototype_resolution_missing',
    slug: 'idea-two'
  });
  // The refusal must name the expected path and both exits, not just the code.
  const output = lines.join('\n');
  assert.match(output, /prototype_resolution_missing/);
  assert.match(output, /\.aioson\/briefings\/idea-two\/prototype\.html/);
  assert.match(output, /@refiner/);
  assert.match(output, /prototype: not_applicable/);
});

test('briefing approval names the manifest problem when prototype.html exists', async () => {
  const dir = await makeProject();
  const lines = [];
  const logger = { log: (m = '') => lines.push(String(m)), error: (m = '') => lines.push(String(m)) };
  const briefingDir = path.join(dir, '.aioson', 'briefings', 'idea-two');
  await fs.writeFile(path.join(briefingDir, 'briefings.md'), '# Visual briefing\n', 'utf8');
  await fs.writeFile(path.join(briefingDir, 'prototype.html'), '<button>Save</button>\n', 'utf8');

  // The gate speaks the project's interaction_language (LANGUAGE BOUNDARY):
  // this fixture pins the pt-BR projection; without a context file the gate
  // falls back to the canonical English catalog.
  await fs.mkdir(path.join(dir, '.aioson', 'context'), { recursive: true });
  await fs.writeFile(
    path.join(dir, '.aioson', 'context', 'project.context.md'),
    '---\nproject_name: "t"\nproject_type: "script"\nprofile: "developer"\nframework: "Node.js"\nframework_installed: true\nclassification: "MICRO"\ninteraction_language: "pt-BR"\naioson_version: "0.0.0"\n---\n',
    'utf8'
  );

  // No manifest at all → the message names the expected file and owner fields.
  const missing = await runBriefingApprove({ args: [dir], options: { slug: 'idea-two' }, logger });
  assert.equal(missing.error, 'prototype_manifest_missing');
  assert.match(lines.join('\n'), /prototype-manifest\.md com `feature: idea-two`/);

  // A manifest owned by another feature → the mismatch names both slugs.
  lines.length = 0;
  await fs.writeFile(
    path.join(briefingDir, 'prototype-manifest.md'),
    '---\nfeature: someone-else\nstatus: draft\n---\n\n# Prototype\n',
    'utf8'
  );
  const mismatch = await runBriefingApprove({ args: [dir], options: { slug: 'idea-two' }, logger });
  assert.equal(mismatch.error, 'prototype_manifest_owner_mismatch');
  assert.match(lines.join('\n'), /"someone-else", esperado "idea-two"/);
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

const STRUCTURED_FINDINGS = [
  {
    id: 'F-choice',
    section_id: 'problem',
    category: 'pending-decision',
    severity: 'high',
    blocking: true,
    text: 'Choose the review flow',
    question: 'How should material decisions be reviewed?',
    selection_mode: 'single',
    options: [
      {
        id: 'guided',
        label: 'Guided decisions',
        description: 'Review one material choice at a time.',
        impact: 'Fastest path with explicit authority.',
        recommended: true,
        evidence_refs: ['researchs/open-design-refiner-2026/summary.md']
      },
      {
        id: 'document',
        label: 'Document only',
        description: 'Keep the current long-form editor.',
        impact: 'Lowest change but weak comparison.',
        recommended: false,
        evidence_refs: []
      }
    ],
    selected_option_ids: [],
    rationale: '',
    evidence_refs: ['.aioson/context/prd-briefing-review-decision-room.md']
  }
];

test('schema v1.2 carries findings and round while legacy v1.0/v1.1 stays valid', () => {
  const parsed = parseBriefingSections(BRIEFING, '.aioson/briefings/idea-one/briefings.md');
  const feedback = buildInitialFeedback({
    slug: 'idea-one',
    sourcePath: '.aioson/briefings/idea-one/briefings.md',
    sourceHash: parsed.source_hash,
    sections: parsed.sections,
    findings: FINDINGS,
    round: 2
  });
  assert.equal(feedback.schema_version, '1.2');
  assert.equal(feedback.round, 2);
  assert.equal(feedback.findings.length, 2);
  assert.equal(feedback.findings[0].id, 'F1');
  assert.equal(feedback.findings[0].status, 'pending');
  assert.equal(validateFeedback(feedback, { slug: 'idea-one', currentSourceHash: parsed.source_hash }).ok, true);

  // a 1.0 payload (no findings) still validates
  const legacy = { ...feedback, schema_version: '1.0' };
  delete legacy.findings;
  assert.equal(validateFeedback(legacy, { slug: 'idea-one', currentSourceHash: parsed.source_hash }).ok, true);
  const v11 = { ...feedback, schema_version: '1.1', findings: feedback.findings.map((finding) => {
    const {
      question,
      selection_mode,
      options,
      selected_option_ids,
      rationale,
      evidence_refs,
      ...legacyFinding
    } = finding;
    return legacyFinding;
  }) };
  assert.equal(validateFeedback(v11, { slug: 'idea-one', currentSourceHash: parsed.source_hash }).ok, true);

  // strict input validation for the agent-supplied findings file
  const sectionIds = parsed.sections.map((section) => section.id);
  assert.equal(validateFindingsInput(FINDINGS, { sectionIds }).ok, true);
  assert.equal(validateFindingsInput([{ section_id: 'problem', category: 'nope', text: 'x' }], { sectionIds }).ok, false);
  assert.equal(validateFindingsInput([{ section_id: 'ghost', category: 'gap', text: 'x' }], { sectionIds }).ok, false);
  assert.equal(validateFindingsInput([{ section_id: 'problem', category: 'gap', text: '' }], { sectionIds }).ok, false);
});

test('AC-BRDR-05: structured choices enforce limits, unique ids, and accepted cardinality', () => {
  const parsed = parseBriefingSections(BRIEFING, '.aioson/briefings/idea-one/briefings.md');
  const sectionIds = parsed.sections.map((section) => section.id);
  assert.equal(validateFindingsInput(STRUCTURED_FINDINGS, { sectionIds }).ok, true);

  const overflow = structuredClone(STRUCTURED_FINDINGS);
  overflow[0].options[0].label = 'x'.repeat(DECISION_LIMITS.label + 1);
  assert.match(validateFindingsInput(overflow, { sectionIds }).errors.join('\n'), /exceeds 120 characters/);

  const duplicate = structuredClone(STRUCTURED_FINDINGS);
  duplicate[0].options[1].id = 'guided';
  assert.match(validateFindingsInput(duplicate, { sectionIds }).errors.join('\n'), /duplicate id/);

  const wrongType = structuredClone(STRUCTURED_FINDINGS);
  wrongType[0].rationale = ['not text'];
  assert.match(validateFindingsInput(wrongType, { sectionIds }).errors.join('\n'), /rationale must be a string/);

  const feedback = buildInitialFeedback({
    slug: 'idea-one',
    sourcePath: '.aioson/briefings/idea-one/briefings.md',
    sourceHash: parsed.source_hash,
    sections: parsed.sections,
    findings: STRUCTURED_FINDINGS
  });
  feedback.findings[0].status = 'accepted';
  assert.match(
    validateFeedback(feedback, { slug: 'idea-one', currentSourceHash: parsed.source_hash }).errors.join('\n'),
    /requires exactly one selected option/
  );
  feedback.findings[0].selected_option_ids = ['unknown'];
  assert.match(
    validateFeedback(feedback, { slug: 'idea-one', currentSourceHash: parsed.source_hash }).errors.join('\n'),
    /unknown option/
  );
  feedback.findings[0].selected_option_ids = ['guided'];
  assert.equal(validateFeedback(feedback, { slug: 'idea-one', currentSourceHash: parsed.source_hash }).ok, true);
});

test('AC-BRDR-06: only valid accepted selections or legacy recommendations become authority', () => {
  const structured = structuredClone(STRUCTURED_FINDINGS[0]);
  structured.status = 'accepted';
  structured.selected_option_ids = ['guided'];
  structured.rationale = 'It makes approval explicit.';
  const legacyApproved = {
    id: 'F-legacy',
    section_id: 'risks',
    category: 'risk',
    severity: 'medium',
    status: 'accepted',
    text: 'Name the compatibility rule',
    recommendation: 'Preserve schema 1.0 and 1.1'
  };
  const ignored = [
    { ...legacyApproved, id: 'F-pending', status: 'pending' },
    { ...legacyApproved, id: 'F-rejected', status: 'rejected' },
    { ...legacyApproved, id: 'F-empty', recommendation: '' }
  ];
  const approved = collectApprovedReviewDecisions([structured, legacyApproved, ...ignored]);
  assert.deepEqual(approved.map((decision) => decision.id), ['F-choice', 'F-legacy']);
  assert.equal(approved[0].selected_options[0].id, 'guided');
  assert.equal(approved[0].rationale, 'It makes approval explicit.');
  assert.equal(approved[1].kind, 'legacy_recommendation');
});

test('AC-BRDR-03 AC-BRDR-09: safe Markdown renders the supported subset and keeps HTML inert', () => {
  const rendered = renderSafeMarkdown('# Title\n\n- **Choice**\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n<script>alert(1)</script>');
  assert.match(rendered, /<h1>Title<\/h1>/);
  assert.match(rendered, /<ul><li><strong>Choice<\/strong><\/li><\/ul>/);
  assert.match(rendered, /<table>/);
  assert.doesNotMatch(rendered, /<script>/);
  assert.match(rendered, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test('AC-BRDR-03 AC-BRDR-04 AC-BRDR-09 AC-BRDR-10: review HTML preserves reading, editing, restore, accessibility, and save fallbacks', async () => {
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

  assert.equal(html.includes('aioson:review schema=1.2'), true);
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
  assert.equal(html.includes('data-view-target="decisions"'), true);
  assert.equal(html.includes('data-view-target="document"'), true);
  assert.equal(html.includes('data-view-target="summary"'), true);
  assert.equal(html.includes('data-set-f-status="accepted"'), true);
  assert.equal(html.includes('<select data-role="f-status">'), false);
  assert.equal(html.includes('data-edit-section'), true);
  assert.match(html, /class="reader markdown-body" data-role="reader"/);
  assert.match(html, /class="editor" data-role="editor" contenteditable="plaintext-only"[^>]+hidden/);
  assert.match(html, /reader\.innerHTML = renderSafeMarkdown\(text\)/);
  // localized surface
  assert.equal(html.includes('Sala de Decisões do Briefing'), true);
  assert.equal(html.includes('Baixar JSON'), true);
  assert.match(html, /input:focus-visible \+ \.option-control/);
  assert.match(html, /@media \(max-width: 520px\)/);
  // fully self-contained
  assert.equal(/\bsrc=["']https?:|<link[^>]+href=["']https?:/.test(html), false);
});

test('AC-BRDR-01 AC-BRDR-02: structured findings render guided native single and multiple choices', async () => {
  const dir = await makeProject();
  const parsed = parseBriefingSections(BRIEFING, '.aioson/briefings/idea-one/briefings.md');
  const findings = structuredClone(STRUCTURED_FINDINGS);
  findings.push({
    ...structuredClone(STRUCTURED_FINDINGS[0]),
    id: 'F-multiple',
    question: 'Which supporting contexts should be included?',
    selection_mode: 'multiple'
  });
  await writeReviewArtifacts(dir, {
    slug: 'idea-one',
    sourceMarkdown: BRIEFING,
    sections: parsed.sections,
    sourceHash: parsed.source_hash,
    findings,
    locale: 'pt-BR'
  });
  const html = await fs.readFile(path.join(dir, '.aioson/briefings/idea-one/review.html'), 'utf8');
  assert.match(html, /type="radio" name="choice-F-choice" value="guided"/);
  assert.match(html, /type="checkbox" name="choice-F-multiple" value="guided"/);
  assert.match(html, /class="badge badge-recommended">Recomendado/);
  assert.match(html, /data-role="f-rationale"/);
  assert.match(html, /selected_option_ids = selectedOptionIds/);
  assert.match(html, /restoreDraft/);
  assert.match(html, /renderSafeMarkdown/);
  assert.match(html, /@media \(max-width: 920px\)/);
  assert.doesNotMatch(html, /\bsrc=["']https?:|<link[^>]+href=["']https?:/);
  const inlineScript = html.match(/<script>([\s\S]+)<\/script>/);
  assert.ok(inlineScript, 'generated review must include its self-contained runtime');
  assert.doesNotThrow(() => new Function(inlineScript[1]), 'generated review runtime must parse');
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

  // confirm: applies, archives the consumed feedback + findings. idea-one has
  // neither a prototype nor a non-visual declaration, so the next action is
  // build_prototype — approve would refuse.
  const applied = await runBriefingApplyFeedback({ args: [dir], options: { slug: 'idea-one', confirm: true }, logger });
  assert.equal(applied.ok, true);
  assert.equal(applied.nextAction, 'build_prototype');
  assert.equal(applied.archived, '.aioson/briefings/idea-one/refinement-feedback.applied-round1.json');
  const markdown = await fs.readFile(path.join(dir, '.aioson/briefings/idea-one/briefings.md'), 'utf8');
  const appliedReport = await fs.readFile(path.join(dir, '.aioson/briefings/idea-one/refinement-report.md'), 'utf8');
  assert.equal(markdown.includes('Refined problem via CLI.'), true);
  assert.match(appliedReport, /Feedback: \.aioson\/briefings\/idea-one\/refinement-feedback\.applied-round1\.json/);
  assert.match(appliedReport, /Next action: build_prototype/);
  assert.match(appliedReport, /Approved review authority: binding/);
  assert.match(appliedReport, /F1 \[legacy_recommendation\].*Adopt a measurable smoke scenario/);
  assert.doesNotMatch(appliedReport, /F2 \[(?:structured_selection|legacy_recommendation)\]/);
  await assert.rejects(fs.access(feedbackPath));
  await assert.rejects(fs.access(path.join(dir, '.aioson/briefings/idea-one/refinement-findings.json')));
  await fs.access(path.join(dir, '.aioson/briefings/idea-one/refinement-findings.applied-round1.json'));

  // the next round continues the counter (and carries no stale findings)
  const next = await runBriefingReview({ args: [dir], options: { slug: 'idea-one' }, logger });
  assert.equal(next.ok, true);
  assert.equal(next.round, 2);
  assert.equal(next.findings, 0);
});

test('briefing:apply-feedback next action is prototype-aware', async () => {
  const dir = await makeProject();
  const logger = { log() {}, error() {} };
  const briefingDir = path.join(dir, '.aioson/briefings/idea-one');
  const feedbackPath = path.join(briefingDir, 'refinement-feedback.json');

  async function exportAndApply(sectionId, text, applyLogger = logger) {
    const feedback = JSON.parse(await fs.readFile(feedbackPath, 'utf8'));
    feedback.export_method = 'download';
    const section = feedback.sections.find((s) => s.id === sectionId);
    section.status = 'change_requested';
    section.current_text = text;
    await fs.writeFile(feedbackPath, JSON.stringify(feedback, null, 2), 'utf8');
    return runBriefingApplyFeedback({ args: [dir], options: { slug: 'idea-one', confirm: true }, logger: applyLogger });
  }

  // Round 1: no prototype, no non-visual declaration → build_prototype, and the
  // CLI must NOT send the user to briefing:approve (which would refuse).
  await runBriefingReview({ args: [dir], options: { slug: 'idea-one' }, logger });
  const lines = [];
  const capture = { log: (m = '') => lines.push(String(m)), error: (m = '') => lines.push(String(m)) };
  const first = await exportAndApply('problem', 'Problem v2.', capture);
  assert.equal(first.ok, true);
  assert.equal(first.nextAction, 'build_prototype');
  const report = await fs.readFile(path.join(briefingDir, 'refinement-report.md'), 'utf8');
  assert.match(report, /Next action: build_prototype/);
  const output = lines.join('\n');
  assert.match(output, /prototype is unresolved/);
  assert.match(output, /@refiner/);
  assert.doesNotMatch(output, /approve with/);

  // Round 2: prototype built → approve_briefing returns.
  await fs.writeFile(path.join(briefingDir, 'prototype.html'), '<button>Go</button>\n', 'utf8');
  await runBriefingReview({ args: [dir], options: { slug: 'idea-one' }, logger });
  const second = await exportAndApply('context', 'Context v2.');
  assert.equal(second.ok, true);
  assert.equal(second.nextAction, 'approve_briefing');
  const secondReport = await fs.readFile(path.join(briefingDir, 'refinement-report.md'), 'utf8');
  assert.match(secondReport, /Next action: approve_briefing/);

  // A non-visual declaration is the other legitimate exit: idea-two declares
  // prototype: not_applicable, so its confirmed apply keeps approve_briefing.
  await fs.writeFile(
    path.join(dir, '.aioson/briefings/idea-two/briefings.md'),
    `---\nprototype: not_applicable\n---\n\n${BRIEFING}`,
    'utf8'
  );
  await runBriefingReview({ args: [dir], options: { slug: 'idea-two' }, logger });
  const ideaTwoFeedbackPath = path.join(dir, '.aioson/briefings/idea-two/refinement-feedback.json');
  const ideaTwoFeedback = JSON.parse(await fs.readFile(ideaTwoFeedbackPath, 'utf8'));
  ideaTwoFeedback.export_method = 'download';
  await fs.writeFile(ideaTwoFeedbackPath, JSON.stringify(ideaTwoFeedback, null, 2), 'utf8');
  const nonVisual = await runBriefingApplyFeedback({ args: [dir], options: { slug: 'idea-two', confirm: true }, logger });
  assert.equal(nonVisual.ok, true);
  assert.equal(nonVisual.nextAction, 'approve_briefing');
});

test('AC-BRDR-06: confirmed structured selection is recorded with rationale, evidence, hashes, and exact archive', async () => {
  const dir = await makeProject();
  const logger = { log() {}, error() {} };
  await fs.writeFile(
    path.join(dir, '.aioson/briefings/idea-one/refinement-findings.json'),
    JSON.stringify(STRUCTURED_FINDINGS),
    'utf8'
  );
  await runBriefingReview({ args: [dir], options: { slug: 'idea-one' }, logger });
  const feedbackPath = path.join(dir, '.aioson/briefings/idea-one/refinement-feedback.json');
  const feedback = JSON.parse(await fs.readFile(feedbackPath, 'utf8'));
  feedback.export_method = 'download';
  feedback.findings[0].status = 'accepted';
  feedback.findings[0].selected_option_ids = ['guided'];
  feedback.findings[0].rationale = 'Explicit approval is easier to audit.';
  await fs.writeFile(feedbackPath, JSON.stringify(feedback, null, 2), 'utf8');

  const applied = await runBriefingApplyFeedback({
    args: [dir],
    options: { slug: 'idea-one', confirm: true },
    logger
  });
  assert.equal(applied.ok, true);
  assert.equal(applied.archived, '.aioson/briefings/idea-one/refinement-feedback.applied-round1.json');
  const report = await fs.readFile(path.join(dir, '.aioson/briefings/idea-one/refinement-report.md'), 'utf8');
  assert.match(report, /Approved review authority: binding/);
  assert.match(report, /F-choice \[structured_selection\] problem: guided — Guided decisions/);
  assert.match(report, /rationale: Explicit approval is easier to audit\./);
  assert.match(report, /researchs\/open-design-refiner-2026\/summary\.md/);
  assert.match(report, /Source hash: [a-f0-9]{64}/);
  assert.match(report, /Applied hash: [a-f0-9]{64}/);
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

test('game enrichment stays optional and only the chosen baseline reaches confirmed authority', async (t) => {
  const dir = await makeProject();
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const logger = { log() {}, error() {} };
  const base = path.join(dir, '.aioson/briefings/idea-one');
  const idea = BRIEFING.replace('Original solution.', 'A local kart time trial with restart.');
  await fs.writeFile(path.join(base, 'briefings.md'), idea);
  const choice = {
    id: 'F-rivals', section_id: 'proposed-solution', category: 'scope-suggestion',
    severity: 'low', blocking: false,
    text: 'A rival may create racing tension but adds behavior and collision testing.',
    question: 'Keep the time trial or introduce a rival?', selection_mode: 'single',
    options: [
      { id: 'rival', label: 'One rival', description: 'Race a simulated rival.',
        impact: 'More tension; more balancing and testing.', recommended: true, evidence_refs: [] },
      { id: 'baseline', label: 'Keep time trial', description: 'Race against the clock.',
        impact: 'Smaller scope; focus on driving and replay.', recommended: false, evidence_refs: [] }
    ], selected_option_ids: [], rationale: '', evidence_refs: []
  };
  const findings = [choice, ...['pending', 'rejected', 'deferred'].map((state) => ({
    ...structuredClone(choice), id: `F-${state}`
  }))];
  await fs.writeFile(path.join(base, 'refinement-findings.json'), JSON.stringify(findings));
  const review = await runBriefingReview({ args: [dir], options: { slug: 'idea-one' }, logger });
  assert.equal(review.ok, true);
  const feedbackPath = path.join(base, 'refinement-feedback.json');
  const feedback = JSON.parse(await fs.readFile(feedbackPath, 'utf8'));
  assert.deepEqual(collectApprovedReviewDecisions(feedback.findings), []);
  assert.ok(feedback.findings.every((f) => f.status === 'pending' && f.selected_option_ids.length === 0));
  assert.equal(await fs.readFile(path.join(base, 'briefings.md'), 'utf8'), idea);

  // Exported owner feedback selects the non-recommended, smaller option.
  feedback.export_method = 'download';
  feedback.findings[0].status = 'accepted';
  feedback.findings[0].selected_option_ids = ['baseline'];
  feedback.findings[0].rationale = 'Focus on handling first.';
  for (const state of ['pending', 'rejected', 'deferred']) {
    feedback.findings.find((f) => f.id === `F-${state}`).status = state;
  }
  const solution = feedback.sections.find((s) => s.id === 'proposed-solution');
  solution.status = 'change_requested';
  solution.current_text = 'A local kart time trial with restart. Keep the clock challenge; no rival.';
  await fs.writeFile(feedbackPath, JSON.stringify(feedback));
  const dry = await runBriefingApplyFeedback({ args: [dir], options: { slug: 'idea-one' }, logger });
  assert.equal(dry.ok, true);
  assert.equal(dry.pending_confirmation, true);
  assert.equal(await fs.readFile(path.join(base, 'briefings.md'), 'utf8'), idea);
  const applied = await runBriefingApplyFeedback({ args: [dir], options: { slug: 'idea-one', confirm: true }, logger });
  assert.equal(applied.ok, true);
  assert.equal(applied.pendingBlockingFindings, 0);
  assert.equal(applied.nextAction, 'build_prototype');
  const authority = collectApprovedReviewDecisions(feedback.findings);
  assert.deepEqual(authority.map((d) => d.id), ['F-rivals']);
  assert.deepEqual(authority[0].selected_options.map((o) => o.id), ['baseline']);
  const report = await fs.readFile(path.join(base, 'refinement-report.md'), 'utf8');
  assert.match(report, /F-rivals \[structured_selection\] proposed-solution: baseline/);
  assert.doesNotMatch(report, /F-(pending|rejected|deferred) \[structured_selection\]/);
  assert.match(await fs.readFile(path.join(base, 'briefings.md'), 'utf8'), /Keep the clock challenge; no rival/);
});

test('briefing:apply-feedback --declined archives the feedback so the loop never dead-ends', async () => {
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
  feedback.export_method = 'download';
  feedback.sections.find((section) => section.id === 'problem').status = 'change_requested';
  await fs.writeFile(feedbackPath, JSON.stringify(feedback, null, 2), 'utf8');

  const declined = await runBriefingApplyFeedback({ args: [dir], options: { slug: 'idea-one', declined: true }, logger });
  assert.equal(declined.ok, true);
  assert.equal(declined.archived, '.aioson/briefings/idea-one/refinement-feedback.declined-round1.json');
  await assert.rejects(fs.access(feedbackPath));
  // findings survive a decline — the briefing text did not change
  await fs.access(path.join(dir, '.aioson/briefings/idea-one/refinement-findings.json'));

  // regenerating does NOT dead-end on pending_feedback, and the declined round
  // still counts toward the round counter
  const regen = await runBriefingReview({ args: [dir], options: { slug: 'idea-one' }, logger });
  assert.equal(regen.ok, true);
  assert.equal(regen.round, 2);

  // declining stale feedback (briefing edited after export) must also work:
  // decline writes nothing, so the hash guard does not apply
  const staleFeedback = JSON.parse(await fs.readFile(feedbackPath, 'utf8'));
  staleFeedback.export_method = 'copy-paste';
  await fs.writeFile(feedbackPath, JSON.stringify(staleFeedback, null, 2), 'utf8');
  await fs.appendFile(path.join(dir, '.aioson/briefings/idea-one/briefings.md'), '\nedited later\n');
  const staleDecline = await runBriefingApplyFeedback({ args: [dir], options: { slug: 'idea-one', declined: true }, logger });
  assert.equal(staleDecline.ok, true);
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

test('refiner auto-fires the review gate at agent:done', async () => {
  const mapping = AGENT_ARTIFACT_KIND['refiner'];
  assert.equal(mapping.kind, 'review');
  assert.equal(mapping.needs, 'slug');
  assert.equal(mapping.featureSlugged, true);
  // The prototype's craft fires at the same session end (skipped when the
  // feature has no prototype.html — see verify-artifact-gate.test.js).
  assert.deepEqual(mapping.also.map((entry) => entry.kind), ['visual']);

  const dir = await makeProject();
  const logger = { log() {}, error() {} };
  await runBriefingReview({ args: [dir], options: { slug: 'idea-one' }, logger });

  const fired = await verifyAgentArtifact({ targetDir: dir, agent: 'refiner', options: { slug: 'idea-one' } });
  assert.equal(fired.kind, 'review');
  assert.equal(fired.ok, true);
  assert.equal(fired.skipped, false);

  const skipped = await verifyAgentArtifact({ targetDir: dir, agent: 'refiner', options: {} });
  assert.equal(skipped.skipped, true);
  assert.equal(skipped.reason.includes('--kind=review'), true);
});
