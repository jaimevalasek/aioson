'use strict';

// The owner took the recommended option in 97 of 102 review answers, and half of the
// conversation in this stage was "I answered the review" and "I confirm". A saved page
// with no note and no other choice is the confirmation. Anything the agent had to
// interpret still gets its dry-run and its question.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { runBriefingApplyFeedback, runBriefingReview } = require('../src/commands/briefing');
const { writeBriefingRegistry } = require('../src/lib/refiner/briefing-registry');
const { assessRoundConfirmation, describeConfirmationReasons } = require('../src/lib/refiner/clean-round');

const CLI = path.join(__dirname, '..', 'bin', 'aioson.js');
const SLUG = 'idea-one';
const quiet = { log() {}, error() {} };

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

const FINDINGS = [
  {
    id: 'F1', section_id: 'proposed-solution', category: 'pending-decision', severity: 'high', blocking: true,
    text: 'Where does the sale start?', question: 'Where?', selection_mode: 'single',
    options: [
      { id: 'desktop', label: 'Desktop', description: 'First on desktop.', impact: 'Smaller.', recommended: true, evidence_refs: [] },
      { id: 'web', label: 'Web', description: 'First on the web.', impact: 'Larger.', recommended: false, evidence_refs: [] }
    ],
    selected_option_ids: [], rationale: '', evidence_refs: []
  },
  { id: 'F2', section_id: 'risks', category: 'gap', severity: 'low', blocking: false, text: 'No rollback is named.', recommendation: 'Name a rollback.' }
];

async function makeProject(t, findings = FINDINGS, briefing = BRIEFING) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-clean-round-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const base = path.join(dir, '.aioson', 'briefings', SLUG);
  await fs.mkdir(base, { recursive: true });
  await fs.writeFile(path.join(base, 'briefings.md'), briefing, 'utf8');
  await fs.writeFile(path.join(base, 'refinement-findings.json'), JSON.stringify(findings), 'utf8');
  await writeBriefingRegistry(dir, {
    updated_at: '2026-11-06',
    briefings: [{ slug: SLUG, status: 'draft', source_plans: [], created_at: '2026-11-06', approved_at: null, prd_generated: null }]
  });
  const review = await runBriefingReview({ args: [dir], options: { slug: SLUG }, logger: quiet });
  assert.equal(review.ok, true, JSON.stringify(review));
  return { dir, base, feedbackPath: path.join(base, 'refinement-feedback.json') };
}

/** What the page and the agent leave after a round the owner accepted as recommended. */
async function saveCleanRound({ feedbackPath }, change = () => {}, { rewrite = true } = {}) {
  const feedback = JSON.parse(await fs.readFile(feedbackPath, 'utf8'));
  feedback.export_method = 'file-system-access';
  feedback.findings[0].status = 'accepted';
  feedback.findings[0].selected_option_ids = ['desktop'];
  feedback.findings[1].status = 'accepted';
  if (rewrite) {
    const solution = feedback.sections.find((section) => section.id === 'proposed-solution');
    solution.status = 'change_requested';
    solution.current_text = 'The sale starts on desktop.';
  }
  change(feedback);
  await fs.writeFile(feedbackPath, JSON.stringify(feedback, null, 2), 'utf8');
  return feedback;
}

const fullOption = (id, recommended) => ({ id, label: id, description: `${id} text`, impact: `${id} impact`, recommended, evidence_refs: [] });

function cleanFeedback() {
  return {
    export_method: 'file-system-access',
    comments: [],
    decisions: [],
    blocking_items: [],
    sections: [
      { id: 'proposed-solution', status: 'change_requested', original_text: 'a', current_text: 'b' },
      { id: 'open-questions', status: 'change_requested', original_text: 'a', current_text: 'b' },
      { id: 'problem', status: 'unchanged', original_text: 'a', current_text: 'a' }
    ],
    findings: [
      {
        id: 'F1', section_id: 'proposed-solution', category: 'pending-decision', blocking: true, status: 'accepted', note: '', rationale: '', text: 'Which?', selection_mode: 'single',
        options: [fullOption('yes', true), fullOption('no', false)], selected_option_ids: ['yes']
      },
      { id: 'F2', section_id: 'risks', category: 'gap', blocking: false, status: 'accepted', note: '', rationale: '', text: 'A gap.', recommendation: 'Name it.', options: [], selected_option_ids: [] }
    ]
  };
}

function codes(feedback, options) {
  return assessRoundConfirmation(feedback, options).reasons.map((reason) => reason.code);
}

test('a saved page with no note and the recommended options needs no second yes', () => {
  assert.deepEqual(assessRoundConfirmation(cleanFeedback()), { required: false, reasons: [] });
  for (const method of ['download', 'copy-paste', 'file-system-access']) {
    assert.equal(assessRoundConfirmation({ ...cleanFeedback(), export_method: method }).required, false, method);
  }
});

test('every reason to ask again is named, with the ids behind it', () => {
  const cases = [
    ['not_saved_by_the_owner', (f) => { f.export_method = 'manual-save'; }],
    ['notes', (f) => { f.findings[0].note = 'also add a coupon'; }],
    ['notes', (f) => { f.findings[1].rationale = 'because of the refund'; }],
    ['other_choice', (f) => { f.findings[0].selected_option_ids = ['no']; }],
    ['other_choice', (f) => { f.findings[0].selected_option_ids = ['yes', 'no']; }],
    ['unresolved', (f) => { f.findings[1].status = 'rejected'; }],
    ['unresolved', (f) => { f.findings[1].status = 'deferred'; }],
    ['unresolved', (f) => { f.findings[0].status = 'pending'; f.findings[0].selected_option_ids = []; }],
    ['section_notes', (f) => { f.comments.push({ id: 'comment-problem', note: 'wrong' }); }],
    ['decisions', (f) => { f.decisions.push({ id: 'D1' }); }],
    ['blocking_items', (f) => { f.blocking_items.push({ id: 'block-problem' }); }],
    ['section_action', (f) => { f.sections[2].status = 'remove_requested'; }],
    ['section_action', (f) => { f.sections[2].status = 'blocked'; }],
    ['section_action', (f) => { f.sections[2].status = 'change_requested'; }],
    ['text_outside_findings', (f) => { f.sections[2].current_text = 'rewritten'; }],
    ['ids_dropped', (f) => { f.sections[1].original_text = '| PROM-001 | a |'; }],
    ['ids_dropped', (f) => { f.sections[1].original_text = '| SRC-001 | a |'; }],
    ['markup_stripped', (f) => { f.sections[0].current_text = 'Returns Map<string, User> here.'; }]
  ];
  for (const [code, change] of cases) {
    const feedback = cleanFeedback();
    change(feedback);
    const result = assessRoundConfirmation(feedback);
    assert.equal(result.required, true, code);
    assert.ok(result.reasons.some((reason) => reason.code === code), `${code}: ${JSON.stringify(result.reasons)}`);
  }
  const noted = cleanFeedback();
  noted.findings[0].note = 'x';
  assert.deepEqual(assessRoundConfirmation(noted).reasons, [{ code: 'notes', ids: ['F1'] }]);
  assert.equal(describeConfirmationReasons(assessRoundConfirmation(noted).reasons), 'notes (F1)');
  assert.equal(describeConfirmationReasons([{ code: 'stale', ids: [] }]), 'stale');
  assert.deepEqual(codes(cleanFeedback(), { stale: true }), ['stale']);
});

test('a page section marked for change with nothing done is a request, and a rewrite carries the mark', () => {
  const asked = cleanFeedback();
  asked.sections[2].status = 'change_requested';
  assert.deepEqual(assessRoundConfirmation(asked).reasons, [{ code: 'section_action', ids: ['problem'] }]);
  assert.equal(assessRoundConfirmation(cleanFeedback()).required, false, 'the sections the agent rewrote carry it too');
});

test('only an accepted decision covers a rewritten section', () => {
  const rejected = cleanFeedback();
  rejected.findings.push({ id: 'F3', section_id: 'problem', category: 'gap', status: 'rejected', note: '', options: [], selected_option_ids: [] });
  rejected.sections[2].current_text = 'rewritten';
  assert.deepEqual(codes(rejected), ['unresolved', 'text_outside_findings']);

  // Accepted, but with no recommendation there is no decision to apply.
  const empty = cleanFeedback();
  empty.findings.push({ id: 'F3', section_id: 'problem', category: 'gap', status: 'accepted', note: '', text: 'x', recommendation: '', options: [], selected_option_ids: [] });
  empty.sections[2].current_text = 'rewritten';
  assert.deepEqual(codes(empty), ['text_outside_findings']);

  for (const other of ['context', 'problem', 'themes', 'risks']) {
    const feedback = cleanFeedback();
    feedback.findings = feedback.findings.filter((finding) => finding.section_id !== other);
    feedback.sections.push({ id: other, status: 'change_requested', original_text: 'a', current_text: 'b' });
    assert.ok(codes(feedback).includes('text_outside_findings'), other);
  }
});

test('bookkeeping follows a decision, and keeps every promise and source', () => {
  for (const bookkeeping of ['open-questions', 'sources', 'identified-gaps', 'additional-files']) {
    const feedback = cleanFeedback();
    feedback.sections.push({ id: bookkeeping, status: 'change_requested', original_text: 'a', current_text: 'b' });
    assert.equal(assessRoundConfirmation(feedback).required, false, bookkeeping);
  }

  const noDecision = cleanFeedback();
  noDecision.findings = [];
  noDecision.sections = [{ id: 'sources', status: 'change_requested', original_text: 'a', current_text: 'b' }];
  assert.deepEqual(codes(noDecision), ['text_outside_findings']);

  const dropped = cleanFeedback();
  dropped.sections[1] = { id: 'sources', status: 'change_requested', original_text: '| PROM-001 | x |\n| SRC-001 | y |', current_text: '| SRC-001 | y |' };
  assert.deepEqual(assessRoundConfirmation(dropped).reasons, [{ code: 'ids_dropped', ids: ['sources'] }]);

  const kept = cleanFeedback();
  kept.sections[1] = { id: 'sources', status: 'change_requested', original_text: '| PROM-001 | x |', current_text: '| PROM-001 | x |\n| PROM-002 | new |' };
  assert.equal(assessRoundConfirmation(kept).required, false);
});

test('a change is measured against the file, not the copy the JSON carries', () => {
  const edited = cleanFeedback();
  edited.findings = edited.findings.filter((finding) => finding.id !== 'F1');
  edited.sections = [{ id: 'problem', status: 'unchanged', original_text: 'edited in both', current_text: 'edited in both' }];
  assert.equal(assessRoundConfirmation(edited).required, false, 'the copy alone cannot tell');
  const file = new Map([['problem', 'what the file holds']]);
  assert.deepEqual(codes(edited, { briefingSections: file }), ['text_outside_findings']);
  assert.equal(assessRoundConfirmation(edited, { briefingSections: new Map([['problem', 'edited in both']]) }).required, false);

  const markup = cleanFeedback();
  markup.findings = markup.findings.filter((finding) => finding.id !== 'F1');
  markup.sections = [{ id: 'problem', status: 'unchanged', original_text: 'Returns Map here.', current_text: 'Returns Map here.' }];
  assert.equal(assessRoundConfirmation(markup, { briefingSections: new Map([['problem', 'Returns Map<string> here.']]) }).required, false, 'the review shows it sanitized, and that is no change');
});

test('what the agent wrote already decided is not the owner\'s act on this page', () => {
  assert.deepEqual(assessRoundConfirmation(cleanFeedback(), { inputFindings: [{ id: 'F1', status: 'accepted' }, { id: 'F2', status: 'pending' }] }).reasons, [{ code: 'arrived_decided', ids: ['F1'] }]);
  assert.deepEqual(assessRoundConfirmation(cleanFeedback(), { inputFindings: { findings: [{ id: 'F2', selected_option_ids: ['x'] }] } }).reasons, [{ code: 'arrived_decided', ids: ['F2'] }]);
  assert.equal(assessRoundConfirmation(cleanFeedback(), { inputFindings: [{ id: 'F1' }, { id: 'F2', status: 'pending', selected_option_ids: [] }] }).required, false);
  assert.equal(assessRoundConfirmation(cleanFeedback(), { inputFindings: null }).required, false);
});

test('a suggestion nobody recommended, left alone, is not an unresolved answer', () => {
  const suggestion = (status, extra = {}) => ({
    id: 'F9', section_id: 'themes', category: 'scope-suggestion', blocking: false, status, note: '', rationale: '', text: 'x', selection_mode: 'single',
    options: [fullOption('a', false), fullOption('b', false)], selected_option_ids: [], ...extra
  });
  for (const status of ['pending', 'deferred']) {
    const feedback = cleanFeedback();
    feedback.findings.push(suggestion(status));
    assert.equal(assessRoundConfirmation(feedback).required, false, status);
  }
  const blocking = cleanFeedback();
  blocking.findings.push(suggestion('pending', { blocking: true }));
  assert.deepEqual(codes(blocking), ['unresolved']);

  const recommended = cleanFeedback();
  recommended.findings.push(suggestion('pending', { options: [fullOption('a', true), fullOption('b', false)] }));
  assert.deepEqual(codes(recommended), ['unresolved'], 'a promise backed it and the owner did not take it');

  const legacy = cleanFeedback();
  legacy.findings.push(suggestion('pending', { options: [], selection_mode: null, recommendation: 'Add it for PROM-001.' }));
  assert.deepEqual(codes(legacy), ['unresolved']);

  const chosen = cleanFeedback();
  chosen.findings.push(suggestion('accepted', { selected_option_ids: ['a'] }));
  assert.deepEqual(codes(chosen), ['other_choice']);

  const otherCategory = cleanFeedback();
  otherCategory.findings.push(suggestion('pending', { category: 'gap' }));
  assert.deepEqual(codes(otherCategory), ['unresolved']);
});

test('nothing in the file means nothing was saved', () => {
  assert.deepEqual(codes(null), ['not_saved_by_the_owner']);
  assert.deepEqual(codes({ export_method: 'download' }), []);
});

test('--confirm-if-clean applies a clean round and archives it as --confirm does', async (t) => {
  const project = await makeProject(t);
  await saveCleanRound(project);
  const lines = [];
  const applied = await runBriefingApplyFeedback({
    args: [project.dir], options: { slug: SLUG, 'confirm-if-clean': true }, logger: { log: (line) => lines.push(line), error() {} }
  });
  assert.equal(applied.ok, true);
  assert.equal(applied.mode, 'apply');
  assert.equal(applied.applied_without_confirmation, true);
  assert.equal(applied.archived, `.aioson/briefings/${SLUG}/refinement-feedback.applied-round1.json`);
  assert.match(await fs.readFile(path.join(project.base, 'briefings.md'), 'utf8'), /The sale starts on desktop\./);
  await assert.rejects(fs.access(project.feedbackPath));
  assert.match(await fs.readFile(path.join(project.base, 'refinement-report.md'), 'utf8'), /- Confirmation: saved page, clean round/);
  assert.ok(lines.some((line) => /saving was the confirmation/.test(line)), lines.join('\n'));
  assert.ok(lines.some((line) => /clean round/.test(line)), lines.join('\n'));
});

test('--confirm-if-clean writes nothing when the agent had to interpret something', async (t) => {
  const project = await makeProject(t);
  await saveCleanRound(project, (feedback) => {
    feedback.findings[0].note = 'Also let the seller pick a trial.';
    feedback.findings[0].rationale = feedback.findings[0].note;
  });
  const lines = [];
  const result = await runBriefingApplyFeedback({
    args: [project.dir], options: { slug: SLUG, 'confirm-if-clean': true }, logger: { log: (line) => lines.push(line), error() {} }
  });
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'dry-run');
  assert.equal(result.pending_confirmation, true);
  assert.deepEqual(result.confirmation.reasons, [{ code: 'notes', ids: ['F1'] }]);
  assert.equal(await fs.readFile(path.join(project.base, 'briefings.md'), 'utf8'), BRIEFING);
  await fs.access(project.feedbackPath);
  assert.ok(lines.some((line) => /needs the owner's confirmation: notes \(F1\)/.test(line)), lines.join('\n'));
});

test('findings the agent wrote already decided still ask, through the command', async (t) => {
  const seeded = [{ ...FINDINGS[0], status: 'accepted', selected_option_ids: ['desktop'] }, { ...FINDINGS[1], status: 'accepted' }];
  const project = await makeProject(t, seeded);
  const feedback = JSON.parse(await fs.readFile(project.feedbackPath, 'utf8'));
  assert.equal(feedback.findings[0].status, 'accepted', 'a later round carries earlier decisions this way');
  feedback.export_method = 'file-system-access';
  await fs.writeFile(project.feedbackPath, JSON.stringify(feedback), 'utf8');
  const result = await runBriefingApplyFeedback({ args: [project.dir], options: { slug: SLUG, 'confirm-if-clean': true }, logger: quiet });
  assert.equal(result.mode, 'dry-run');
  assert.deepEqual(result.confirmation.reasons, [{ code: 'arrived_decided', ids: ['F1', 'F2'] }]);
  assert.equal(await fs.readFile(path.join(project.base, 'briefings.md'), 'utf8'), BRIEFING);
});

test('both copies edited in the JSON still count as a change to the file', async (t) => {
  const project = await makeProject(t);
  await saveCleanRound(project, (feedback) => {
    const problem = feedback.sections.find((section) => section.id === 'problem');
    problem.original_text = 'Rewritten behind the review.';
    problem.current_text = 'Rewritten behind the review.';
  });
  const result = await runBriefingApplyFeedback({ args: [project.dir], options: { slug: SLUG, 'confirm-if-clean': true }, logger: quiet });
  assert.equal(result.mode, 'dry-run');
  assert.deepEqual(result.confirmation.reasons, [{ code: 'text_outside_findings', ids: ['problem'] }]);
});

test('a file the agent filled is no saved page, and the owner\'s words still reach --confirm', async (t) => {
  const project = await makeProject(t);
  await saveCleanRound(project, (feedback) => { feedback.export_method = 'manual-save'; });
  const dry = await runBriefingApplyFeedback({ args: [project.dir], options: { slug: SLUG, 'confirm-if-clean': true }, logger: quiet });
  assert.equal(dry.mode, 'dry-run');
  assert.deepEqual(dry.confirmation.reasons, [{ code: 'not_saved_by_the_owner', ids: [] }]);
  assert.equal(await fs.readFile(path.join(project.base, 'briefings.md'), 'utf8'), BRIEFING);

  const confirmed = await runBriefingApplyFeedback({ args: [project.dir], options: { slug: SLUG, confirm: true }, logger: quiet });
  assert.equal(confirmed.ok, true);
  assert.equal(confirmed.mode, 'apply');
  assert.equal(confirmed.applied_without_confirmation, false);
  assert.match(await fs.readFile(path.join(project.base, 'refinement-report.md'), 'utf8'), /- Confirmation: explicit/);
});

test('a plain run stays a dry-run that says whether the round is clean', async (t) => {
  const project = await makeProject(t);
  await saveCleanRound(project);
  const dry = await runBriefingApplyFeedback({ args: [project.dir], options: { slug: SLUG }, logger: quiet });
  assert.equal(dry.mode, 'dry-run');
  assert.equal(dry.confirmation.required, false);
  assert.equal(await fs.readFile(path.join(project.base, 'briefings.md'), 'utf8'), BRIEFING);
});

test('a stale round never applies on its own, even with --allow-stale', async (t) => {
  const project = await makeProject(t);
  await saveCleanRound(project);
  await fs.writeFile(path.join(project.base, 'briefings.md'), `${BRIEFING}\nEdited after the review.\n`, 'utf8');

  const refused = await runBriefingApplyFeedback({ args: [project.dir], options: { slug: SLUG, 'confirm-if-clean': true }, logger: quiet });
  assert.equal(refused.ok, false);
  assert.equal(refused.error, 'invalid_feedback');

  const allowed = await runBriefingApplyFeedback({ args: [project.dir], options: { slug: SLUG, 'confirm-if-clean': true, 'allow-stale': true }, logger: quiet });
  assert.equal(allowed.mode, 'dry-run');
  assert.ok(allowed.confirmation.reasons.some((reason) => reason.code === 'stale'), JSON.stringify(allowed.confirmation.reasons));
  assert.match(await fs.readFile(path.join(project.base, 'briefings.md'), 'utf8'), /Edited after the review/);
});

test('a section nobody changed keeps its bytes, whatever the review shows of it', async (t) => {
  const briefing = BRIEFING
    .replace('Original context.', 'Returns `Map<string, User>` when a < b and c > d.')
    .replace('- Risk one', '- Risk <one> stays');
  const project = await makeProject(t, FINDINGS, briefing);
  await saveCleanRound(project, () => {}, { rewrite: false });
  const applied = await runBriefingApplyFeedback({ args: [project.dir], options: { slug: SLUG, 'confirm-if-clean': true }, logger: quiet });
  assert.equal(applied.applied_without_confirmation, true, JSON.stringify(applied.confirmation));
  assert.deepEqual(applied.appliedChanges, []);
  const after = await fs.readFile(path.join(project.base, 'briefings.md'), 'utf8');
  assert.equal(after, briefing);
});

test('a rewritten section that would lose markup asks first, and the others still keep theirs', async (t) => {
  const briefing = BRIEFING.replace('Original context.', 'Returns `Map<string, User>`.');
  const project = await makeProject(t, FINDINGS, briefing);
  await saveCleanRound(project, (feedback) => {
    feedback.sections.find((section) => section.id === 'proposed-solution').current_text = 'Keep the Map<K, V> type.';
  });
  const dry = await runBriefingApplyFeedback({ args: [project.dir], options: { slug: SLUG, 'confirm-if-clean': true }, logger: quiet });
  assert.deepEqual(dry.confirmation.reasons, [{ code: 'markup_stripped', ids: ['proposed-solution'] }]);
  const applied = await runBriefingApplyFeedback({ args: [project.dir], options: { slug: SLUG, confirm: true }, logger: quiet });
  assert.equal(applied.ok, true);
  assert.deepEqual(applied.appliedChanges.map((change) => change.section_id), ['proposed-solution']);
  assert.match(await fs.readFile(path.join(project.base, 'briefings.md'), 'utf8'), /Returns `Map<string, User>`\./);
});

test('the report says how the round was confirmed, wherever the feedback came from', async (t) => {
  const project = await makeProject(t);
  await saveCleanRound(project);
  const other = path.join(project.base, 'exported.json');
  await fs.copyFile(project.feedbackPath, other);
  const applied = await runBriefingApplyFeedback({
    args: [project.dir], options: { slug: SLUG, 'confirm-if-clean': true, feedback: `.aioson/briefings/${SLUG}/exported.json` }, logger: quiet
  });
  assert.equal(applied.applied_without_confirmation, true);
  assert.equal(applied.archived, undefined);
  assert.match(await fs.readFile(path.join(project.base, 'refinement-report.md'), 'utf8'), /- Confirmation: saved page, clean round/);
});

test('the flag does not swallow the project path, and the page says what saving does', async (t) => {
  const project = await makeProject(t);
  const html = await fs.readFile(path.join(project.base, 'review.html'), 'utf8');
  assert.match(html, /Saved with no note and the recommended options, the round applies with no other question/);
  await saveCleanRound(project);
  const result = spawnSync(process.execPath, [CLI, 'briefing:apply-feedback', '--confirm-if-clean', project.dir, `--slug=${SLUG}`, '--json'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const answer = JSON.parse(result.stdout);
  assert.equal(answer.mode, 'apply');
  assert.equal(answer.applied_without_confirmation, true);
});
