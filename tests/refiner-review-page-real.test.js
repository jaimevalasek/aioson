'use strict';

// The review page, in a real browser. Two old defects of the page stayed harmless while a
// person said "I confirm" after looking at the dry-run. Once a saved page can apply on its
// own they would write text and decisions nobody chose: reopening the tab flattened every
// section to one line, and a draft of an earlier round filled in a new one.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const { runBriefingApplyFeedback, runBriefingReview } = require('../src/commands/briefing');
const { openBrowser, probeBrowsers } = require('../src/lib/browser-session');
const { writeBriefingRegistry } = require('../src/lib/refiner/briefing-registry');

const SLUG = 'idea-one';
const quiet = { log() {}, error() {} };

const BRIEFING = `# Briefing

## Context
One paragraph.

## Problem
One paragraph.

## Proposed solution
One paragraph.

## Themes
One theme.

## Risks
- Risk one
- Risk two

## Identified gaps
- Gap one
- Gap two

## Sources

### Source Promise Map

| PROM | Source | Locator | Approved intent | State |
|---|---|---|---|---|
| PROM-001 | conversational | item 1 | Charge 3% | required |
| PROM-002 | conversational | item 2 | Charge 30% | required |

## Open questions
1. [decision-required] Who approves refunds?
2. [decision-required] Which currency?
`;

const FINDINGS = [
  {
    id: 'F1', section_id: 'proposed-solution', category: 'pending-decision', severity: 'high', blocking: false,
    text: 'Where does the sale start?', question: 'Where?', selection_mode: 'single',
    options: [
      { id: 'desktop', label: 'Desktop', description: 'First on desktop.', impact: 'Smaller.', recommended: true, evidence_refs: [] },
      { id: 'web', label: 'Web', description: 'First on the web.', impact: 'Larger.', recommended: false, evidence_refs: [] }
    ],
    selected_option_ids: [], rationale: '', evidence_refs: []
  }
];

async function makeProject(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-review-page-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const base = path.join(dir, '.aioson', 'briefings', SLUG);
  await fs.mkdir(base, { recursive: true });
  await fs.writeFile(path.join(base, 'briefings.md'), BRIEFING, 'utf8');
  await fs.writeFile(path.join(base, 'refinement-findings.json'), JSON.stringify(FINDINGS), 'utf8');
  await writeBriefingRegistry(dir, {
    updated_at: '2026-11-06',
    briefings: [{ slug: SLUG, status: 'draft', source_plans: [], created_at: '2026-11-06', approved_at: null, prd_generated: null }]
  });
  assert.equal((await runBriefingReview({ args: [dir], options: { slug: SLUG }, logger: quiet })).ok, true);
  return { dir, base, url: pathToFileURL(path.join(base, 'review.html')).href, feedbackPath: path.join(base, 'refinement-feedback.json') };
}

async function withPage(t, run) {
  const probe = await probeBrowsers({ projectDir: process.cwd() });
  if (!probe.available) return t.skip('no browser here');
  const session = await openBrowser({ projectDir: process.cwd() });
  if (!session.ok) return t.skip(`no browser here: ${session.error}`);
  try {
    return await run(await session.newPage());
  } finally {
    await session.close();
  }
}

const approve = (page) => page.evaluate(`(() => {
  const card = document.querySelector('.decision-card[data-finding="F1"]');
  card.querySelector('input[value="desktop"]').checked = true;
  card.querySelector('[data-set-f-status="accepted"]').click();
})()`);
// The page's own save, with the file dialog taken out.
const exported = (page) => page.evaluate("jsonText('file-system-access')");

test('static: the page keys its draft by the review, and restores text as text', async (t) => {
  const project = await makeProject(t);
  const html = await fs.readFile(path.join(project.base, 'review.html'), 'utf8');
  assert.match(html, /const LS_KEY = 'aioson-review:' \+ feedback\.briefing_slug \+ ':' \+ feedback\.source_hash \+ ':' \+ feedback\.review_generated_at;/);
  assert.match(html, /\[data-role="editor"\]'\)\.textContent = draftSection\.current_text;/);
  assert.doesNotMatch(html, /\.innerText = draftSection/);
});

test('real browser: reopening the page leaves every section as it was', async (t) => {
  const project = await makeProject(t);
  await withPage(t, async (page) => {
    await page.goto(project.url);
    const first = JSON.parse(await exported(page));
    assert.deepEqual(first.arrived_decided, [], 'the page carries the stamp through its save');
    await approve(page);
    await page.reload();
    const again = JSON.parse(await exported(page));
    assert.equal(again.findings[0].status, 'accepted', 'the draft came back');
    for (const section of again.sections) {
      assert.equal(section.current_text, section.original_text, section.id);
      assert.equal(section.current_text, first.sections.find((item) => item.id === section.id).current_text, section.id);
    }

    await fs.writeFile(project.feedbackPath, JSON.stringify(again), 'utf8');
    const applied = await runBriefingApplyFeedback({ args: [project.dir], options: { slug: SLUG, 'confirm-if-clean': true }, logger: quiet });
    assert.equal(applied.applied_without_confirmation, true, JSON.stringify(applied.confirmation));
    assert.deepEqual(applied.appliedChanges, []);
    assert.equal(await fs.readFile(path.join(project.base, 'briefings.md'), 'utf8'), BRIEFING);
  });
});

test('real browser: a new review of the same text starts with nothing decided', async (t) => {
  const project = await makeProject(t);
  await withPage(t, async (page) => {
    await page.goto(project.url);
    await approve(page);
    await fs.writeFile(project.feedbackPath, await exported(page), 'utf8');
    assert.equal((await runBriefingApplyFeedback({ args: [project.dir], options: { slug: SLUG, declined: true }, logger: quiet })).ok, true);

    // Same briefing text, same finding ids, a new review.
    await new Promise((resolve) => { setTimeout(resolve, 5); });
    assert.equal((await runBriefingReview({ args: [project.dir], options: { slug: SLUG }, logger: quiet })).ok, true);
    await page.goto(project.url);
    const fresh = JSON.parse(await exported(page));
    assert.equal(fresh.findings[0].status, 'pending');
    assert.deepEqual(fresh.findings[0].selected_option_ids, []);
    assert.equal(await page.locator('#restore-banner').isVisible(), false);
  });
});
