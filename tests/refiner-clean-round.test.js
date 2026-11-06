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
const { hashText, parseBriefingSections } = require('../src/lib/refiner/briefing-sections');
const { findBriefing, readBriefingRegistry, writeBriefingRegistry } = require('../src/lib/refiner/briefing-registry');
const { assessRoundConfirmation, describeConfirmationReasons } = require('../src/lib/refiner/clean-round');
const { buildInitialFeedback } = require('../src/lib/refiner/feedback-schema');

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

// A file with room for what a fold can do to it.
const RICH = `# Briefing

## Context
Original context.

## Problem
Original problem, behind PROM-001.

## Proposed solution
Original solution.
More of it.
And more.

## Themes
- Theme one

## Risks
- Risk one
- Risk two
- Risk three

## Identified gaps
- Gap one
- Gap two

## Sources
- Source one (SRC-001)

### Source Promise Map

| PROM | Source | Locator | Approved intent | State |
|---|---|---|---|---|
| PROM-001 | SRC-001 | Item 1 | Charge 3% | required |

## Open questions
- Question one
- Question two
- Question three

## Additional files
- File one
`;

const sec = (feedback, id) => feedback.sections.find((section) => section.id === id);

function rewrite(section, text) {
  section.status = 'change_requested';
  section.current_text = text;
}

/** A round as recommended: the agent folded F1 where it points and closed one question. */
function cleanFeedback(briefing = RICH) {
  const feedback = {
    export_method: 'file-system-access',
    arrived_decided: [],
    comments: [],
    decisions: [],
    blocking_items: [],
    sections: parseBriefingSections(briefing).sections,
    findings: [
      {
        id: 'F1', section_id: 'proposed-solution', category: 'pending-decision', blocking: true, status: 'accepted', note: '', rationale: '', text: 'Which?', selection_mode: 'single',
        options: [fullOption('yes', true), fullOption('no', false)], selected_option_ids: ['yes']
      },
      { id: 'F2', section_id: 'risks', category: 'gap', blocking: false, status: 'accepted', note: '', rationale: '', text: 'A gap.', recommendation: 'Name it.', options: [], selected_option_ids: [] }
    ]
  };
  rewrite(sec(feedback, 'proposed-solution'), 'Original solution.\nMore of it.\nDecided: yes.');
  rewrite(sec(feedback, 'open-questions'), '- Question two\n- Question three');
  return feedback;
}

const judge = (feedback, options) => assessRoundConfirmation(feedback, { briefing: RICH, ...options });
const codes = (feedback, options) => judge(feedback, options).reasons.map((reason) => reason.code);

test('a saved page with no note and the recommended options needs no second yes', () => {
  assert.deepEqual(judge(cleanFeedback()), { required: false, reasons: [] });
  for (const method of ['download', 'copy-paste', 'file-system-access']) {
    assert.equal(judge({ ...cleanFeedback(), export_method: method }).required, false, method);
  }
});

test('every reason to ask again is named, with the ids behind it', () => {
  const cases = [
    ['not_saved_by_the_owner', (f) => { f.export_method = 'manual-save'; }],
    ['arrived_decided', (f) => { f.arrived_decided = ['F1']; }],
    ['arrived_decided', (f) => { delete f.arrived_decided; }],
    ['notes', (f) => { f.findings[0].note = 'also add a coupon'; }],
    ['notes', (f) => { f.findings[1].rationale = 'because of the refund'; }],
    ['other_choice', (f) => { f.findings[0].selected_option_ids = ['no']; }],
    ['other_choice', (f) => { f.findings[0].selected_option_ids = ['yes', 'no']; }],
    ['other_choice', (f) => { f.findings[0].selected_option_ids = ['yes', 'yes']; }],
    ['unresolved', (f) => { f.findings[1].status = 'rejected'; }],
    ['unresolved', (f) => { f.findings[1].status = 'deferred'; }],
    ['unresolved', (f) => { f.findings[0].status = 'pending'; f.findings[0].selected_option_ids = []; }],
    ['section_notes', (f) => { f.comments.push({ id: 'comment-problem', note: 'wrong' }); }],
    ['decisions', (f) => { f.decisions.push({ id: 'D1' }); }],
    ['blocking_items', (f) => { f.blocking_items.push({ id: 'block-problem' }); }],
    ['section_action', (f) => { sec(f, 'problem').status = 'remove_requested'; }],
    ['section_action', (f) => { sec(f, 'problem').status = 'blocked'; }],
    ['section_action', (f) => { sec(f, 'problem').status = 'change_requested'; }],
    ['section_action', (f) => { sec(f, 'problem').current_text = ''; }],
    ['text_outside_findings', (f) => { sec(f, 'problem').current_text = 'rewritten'; }],
    ['ids_dropped', (f) => { sec(f, 'problem').current_text = 'Original problem.'; }],
    ['ids_dropped', (f) => { rewrite(sec(f, 'sources'), sec(f, 'sources').current_text.replace(/SRC-001/g, 'conversational')); }],
    ['markup_stripped', (f) => { sec(f, 'proposed-solution').current_text = 'Returns Map<string, User> here.'; }],
    ['markup_stripped', (f) => { sec(f, 'problem').current_text = sec(f, 'problem').current_text.replace('Original', 'Original<b>'); }],
    ['promises_changed', (f) => { rewrite(sec(f, 'sources'), sec(f, 'sources').current_text.replace('Charge 3%', 'Charge 30%')); }],
    ['promises_changed', (f) => { rewrite(sec(f, 'sources'), sec(f, 'sources').current_text.replace('required', 'not_applicable')); }],
    ['promises_changed', (f) => { rewrite(sec(f, 'sources'), sec(f, 'sources').current_text.replace(/\n\| PROM-001.*/, '\n\nDropped: PROM-001.')); }],
    ['promises_changed', (f) => { rewrite(sec(f, 'sources'), `${sec(f, 'sources').current_text}\n| PROM-900 | chat | now | Add a billing module | required |`); }],
    ['promises_changed', (f) => { rewrite(sec(f, 'proposed-solution'), 'Original solution.\nMore of it.\nAnd PROM-900 too.'); }],
    ['unwritable', (f) => { rewrite(sec(f, 'risks'), '- Risk one\n\n## Open questions\nNone.'); }]
  ];
  for (const [code, change] of cases) {
    const feedback = cleanFeedback();
    change(feedback);
    const result = judge(feedback);
    assert.equal(result.required, true, code);
    assert.ok(result.reasons.some((reason) => reason.code === code), `${code}: ${JSON.stringify(result.reasons)}`);
  }
  const noted = cleanFeedback();
  noted.findings[0].note = 'x';
  assert.deepEqual(judge(noted).reasons, [{ code: 'notes', ids: ['F1'] }]);
  assert.equal(describeConfirmationReasons(judge(noted).reasons), 'notes (F1)');
  assert.equal(describeConfirmationReasons([{ code: 'stale', ids: [] }]), 'stale');
  assert.deepEqual(codes(cleanFeedback(), { stale: true }), ['stale']);
});

test('a page section marked for change with nothing done is a request, and a rewrite carries the mark', () => {
  const asked = cleanFeedback();
  sec(asked, 'problem').status = 'change_requested';
  assert.deepEqual(judge(asked).reasons, [{ code: 'section_action', ids: ['problem'] }]);
  assert.equal(judge(cleanFeedback()).required, false, 'the sections the agent rewrote carry it too');
});

test('only an accepted decision covers a rewritten section', () => {
  const rejected = cleanFeedback();
  rejected.findings.push({ id: 'F3', section_id: 'problem', category: 'gap', status: 'rejected', note: '', options: [], selected_option_ids: [] });
  sec(rejected, 'problem').current_text = 'rewritten, PROM-001';
  assert.deepEqual(codes(rejected), ['unresolved', 'text_outside_findings']);

  // Accepted, but with no recommendation there is no decision to apply.
  const empty = cleanFeedback();
  empty.findings.push({ id: 'F3', section_id: 'problem', category: 'gap', status: 'accepted', note: '', text: 'x', recommendation: '', options: [], selected_option_ids: [] });
  sec(empty, 'problem').current_text = 'rewritten, PROM-001';
  assert.deepEqual(codes(empty), ['text_outside_findings']);

  for (const other of ['context', 'themes', 'risks']) {
    const feedback = cleanFeedback();
    feedback.findings = feedback.findings.filter((finding) => finding.section_id !== other);
    rewrite(sec(feedback, other), 'b');
    assert.ok(codes(feedback).includes('text_outside_findings'), other);
  }
});

test('an option that leaves the scope as it is licenses no text', () => {
  const round = (selected) => {
    const feedback = cleanFeedback();
    feedback.findings.push({
      id: 'F3', section_id: 'themes', category: 'scope-suggestion', blocking: false, status: 'accepted', note: '', rationale: '', text: 'An idea.', selection_mode: 'single',
      options: [{ ...fullOption('later', true), defers: true }, fullOption('now', false)], selected_option_ids: [selected]
    });
    return feedback;
  };
  const deferred = round('later');
  assert.equal(judge(deferred).required, false, 'taken and left alone');
  rewrite(sec(deferred, 'themes'), '- Theme one\n- Billing module, in scope.');
  assert.deepEqual(codes(deferred), ['text_outside_findings']);

  const taken = round('now');
  rewrite(sec(taken, 'themes'), '- Theme one\n- Billing module, in scope.');
  assert.deepEqual(codes(taken), ['other_choice'], 'the choice is what asks here, and the text follows from it');
});

test('bookkeeping follows a decision, a line for a decision, and keeps every promise and source', () => {
  for (const bookkeeping of ['open-questions', 'sources', 'identified-gaps', 'additional-files']) {
    const feedback = cleanFeedback();
    rewrite(sec(feedback, bookkeeping), `${sec(feedback, bookkeeping).current_text}\n- One more line.`);
    assert.equal(judge(feedback).required, false, bookkeeping);
  }

  const noDecision = cleanFeedback();
  noDecision.findings = [];
  sec(noDecision, 'proposed-solution').current_text = sec(noDecision, 'proposed-solution').original_text;
  sec(noDecision, 'proposed-solution').status = 'unchanged';
  assert.deepEqual(judge(noDecision).reasons, [{ code: 'text_outside_findings', ids: ['open-questions'] }]);

  const onlyAdded = cleanFeedback();
  onlyAdded.findings = [];
  for (const section of onlyAdded.sections) {
    section.status = 'unchanged';
    section.current_text = section.original_text;
  }
  rewrite(sec(onlyAdded, 'sources'), `${sec(onlyAdded, 'sources').current_text}\n- One more line.`);
  assert.deepEqual(judge(onlyAdded).reasons, [{ code: 'text_outside_findings', ids: ['sources'] }], 'with no decision there is nothing to keep');

  const twoLost = cleanFeedback();
  rewrite(sec(twoLost, 'open-questions'), '- Question three\n- Closed by the decisions.');
  assert.equal(judge(twoLost).required, false, 'two decisions close two questions');

  const threeLost = cleanFeedback();
  rewrite(sec(threeLost, 'open-questions'), '- Something else\n- And something else.');
  assert.deepEqual(judge(threeLost).reasons, [{ code: 'text_outside_findings', ids: ['open-questions'] }]);

  const gains = (lines) => {
    const feedback = cleanFeedback();
    rewrite(sec(feedback, 'identified-gaps'), `${sec(feedback, 'identified-gaps').current_text}\n${Array.from({ length: lines }, (_, index) => `- New gap ${index}`).join('\n')}`);
    return judge(feedback).reasons;
  };
  assert.deepEqual(gains(4), [], 'two decisions add four lines at most');
  assert.deepEqual(gains(5), [{ code: 'text_outside_findings', ids: ['identified-gaps'] }]);

  const newPromise = cleanFeedback();
  rewrite(sec(newPromise, 'sources'), `${sec(newPromise, 'sources').current_text}\n| PROM-002 | SRC-001 | Item 2 | Refund in 7 days | required |`);
  assert.deepEqual(judge(newPromise).reasons, [{ code: 'promises_changed', ids: ['PROM-002'] }], 'it would back scope in the next round');

  const newLocator = cleanFeedback();
  rewrite(sec(newLocator, 'sources'), sec(newLocator, 'sources').current_text.replace('Item 1', 'Item one, second paragraph'));
  assert.equal(judge(newLocator).required, false, 'where a promise was found is not what it promises');
});

test('a promise the map cannot read has to stay word for word', () => {
  const SECOND = '\n\n| PROM | Source | Locator | Approved intent | State |\n|---|---|---|---|---|\n| PROM-002 | SRC-001 | Item 2 | Refund in 7 days | required |\n\n## Open questions';
  const shapes = {
    'a short delimiter': [(text) => text.replace('|---|---|---|---|---|', '|--|--|--|--|--|'), 'PROM-001'],
    'another state header': [(text) => text.replace('| State |', '| Status |'), 'PROM-001'],
    'a heading the map does not know': [(text) => text.replace('### Source Promise Map', '### Mapa de Promessas'), 'PROM-001'],
    'a row with a stray pipe': [(text) => text.replace('Charge 3%', 'Charge 3% | 5%'), 'PROM-001'],
    'a second table': [(text) => text.replace('\n\n## Open questions', SECOND), 'PROM-002']
  };
  for (const [label, [shape, id]] of Object.entries(shapes)) {
    const briefing = shape(RICH);
    assert.equal(judge(cleanFeedback(briefing), { briefing }).required, false, `${label}: left alone`);
    const flipped = cleanFeedback(briefing);
    const row = sec(flipped, 'sources').current_text.split('\n').find((line) => line.includes(id));
    rewrite(sec(flipped, 'sources'), sec(flipped, 'sources').current_text.replace(row, row.replace('required', 'not_applicable')));
    assert.deepEqual(judge(flipped, { briefing }).reasons, [{ code: 'promises_changed', ids: [id] }], label);
  }
});

test('a fold never leaves a named section with a line, nor starts another section', () => {
  for (const text of ['None.', '- Risk one']) {
    const feedback = cleanFeedback();
    rewrite(sec(feedback, 'risks'), text);
    assert.deepEqual(judge(feedback).reasons, [{ code: 'text_outside_findings', ids: ['risks'] }], text);
  }
  const briefing = RICH.replace('- Risk three', '- Risk three\n- Risk four\n- Risk five');
  const half = (lines) => {
    const feedback = cleanFeedback(briefing);
    rewrite(sec(feedback, 'risks'), lines.join('\n'));
    return judge(feedback, { briefing }).required;
  };
  assert.equal(half(['- One', '- Two']), true, 'five lines down to two');
  assert.equal(half(['- One', '- Two', '- Three']), false);

  const twoLines = cleanFeedback();
  rewrite(sec(twoLines, 'risks'), '- Risk one\n- A rollback is named.');
  assert.equal(judge(twoLines).required, false);

  const short = cleanFeedback();
  rewrite(sec(short, 'themes'), 'Replaced.');
  short.findings.push({ id: 'F3', section_id: 'themes', category: 'gap', blocking: false, status: 'accepted', note: '', rationale: '', text: 'x', recommendation: 'Name it.', options: [], selected_option_ids: [] });
  assert.equal(judge(short).required, false, 'a section of one line was never more than that');

  const heading = cleanFeedback();
  rewrite(sec(heading, 'risks'), '- Risk one\n- Risk two\n\n## Billing\nBuild the billing module.');
  assert.deepEqual(judge(heading).reasons, [{ code: 'text_outside_findings', ids: ['risks'] }]);

  const subheading = cleanFeedback();
  rewrite(sec(subheading, 'risks'), '- Risk one\n- Risk two\n\n### Billing\nSomething.');
  assert.equal(judge(subheading).required, false);
});

test('a change is measured against the file, not the copy the JSON carries', () => {
  const edited = cleanFeedback();
  sec(edited, 'problem').original_text = 'edited in both, PROM-001';
  sec(edited, 'problem').current_text = 'edited in both, PROM-001';
  assert.deepEqual(codes(edited), ['text_outside_findings']);

  const briefing = RICH.replace('Original problem, behind', 'Returns Map<string> here, behind');
  const markup = cleanFeedback();
  sec(markup, 'problem').original_text = 'Returns Map here, behind PROM-001.';
  sec(markup, 'problem').current_text = 'Returns Map here, behind PROM-001.';
  assert.equal(judge(markup, { briefing }).required, false, 'the review shows it sanitized, and that is no change');
});

test('a section is found by title, the way the write finds it', () => {
  const swapped = cleanFeedback();
  sec(swapped, 'problem').title = 'Themes';
  sec(swapped, 'themes').title = 'Problem';
  assert.deepEqual(judge(swapped).reasons.slice(0, 1), [{ code: 'text_outside_findings', ids: ['problem', 'themes'] }]);

  const renamed = cleanFeedback();
  sec(renamed, 'problem').id = 'problem-x';
  sec(renamed, 'problem-x').current_text = 'rewritten, PROM-001';
  assert.deepEqual(codes(renamed), ['text_outside_findings']);

  const wrongId = cleanFeedback();
  const themes = sec(wrongId, 'themes');
  themes.id = 'risks';
  rewrite(themes, '- Replaced.');
  assert.deepEqual(judge(wrongId).reasons, [{ code: 'text_outside_findings', ids: ['risks'] }], 'F2 names the section with that title, not the id on this one');

  const homeless = cleanFeedback();
  homeless.sections.push({ id: 'ghost', title: 'Ghost', status: 'unchanged', original_text: 'x', current_text: 'x' });
  assert.deepEqual(judge(homeless).reasons, [{ code: 'section_action', ids: ['ghost'] }]);

  const missing = cleanFeedback();
  missing.sections = missing.sections.filter((section) => section.id !== 'problem');
  assert.deepEqual(judge(missing).reasons, [{ code: 'unwritable', ids: ['missing_sections'] }]);
});

test('headings that normalize alike keep their own ids, so a decision licenses only its own', () => {
  const ids = (titles) => parseBriefingSections(titles.map((title) => `## ${title}\nx\n`).join('\n')).sections.map((section) => section.id);
  assert.deepEqual(ids(['Risks', 'RISKS', 'Risks!']), ['risks', 'risks-2', 'risks-3']);
  assert.deepEqual(ids(['Risks 2', 'Risks', 'RISKS']), ['risks-2', 'risks', 'risks-3']);
  assert.deepEqual(ids(['概要', '詳細']), ['section', 'section-2']);

  const briefing = RICH.replace('## Identified gaps', '## RISKS\n- Another risk\n\n## Identified gaps');
  const other = cleanFeedback(briefing);
  const second = sec(other, 'risks-2');
  rewrite(second, '- Rewritten.');
  assert.deepEqual(judge(other, { briefing }).reasons, [{ code: 'text_outside_findings', ids: ['risks-2'] }], 'F2 names the first of them');
});

test('a section the review shows empty stays clean while nobody writes in it', () => {
  const briefing = RICH.replace('- Theme one', '<!-- filled in later -->');
  const feedback = cleanFeedback(briefing);
  sec(feedback, 'themes').original_text = '';
  sec(feedback, 'themes').current_text = '';
  assert.equal(judge(feedback, { briefing }).required, false);
});

test('the generator stamps what arrives decided, and a page with no stamp cannot say', () => {
  const seeded = buildInitialFeedback({
    slug: SLUG, sourcePath: 'x', sourceHash: 'y', sections: [],
    findings: [{ id: 'F1', status: 'accepted' }, { id: 'F2', selected_option_ids: ['x'] }, { id: 'F3', status: 'pending' }, { id: 'F4' }]
  });
  assert.deepEqual(seeded.arrived_decided, ['F1', 'F2']);

  const stamped = cleanFeedback();
  stamped.arrived_decided = ['F1'];
  assert.deepEqual(judge(stamped).reasons, [{ code: 'arrived_decided', ids: ['F1'] }]);
  const unstamped = cleanFeedback();
  delete unstamped.arrived_decided;
  assert.deepEqual(judge(unstamped).reasons, [{ code: 'arrived_decided', ids: [] }]);
});

test('a suggestion nobody recommended, left alone, is not an unresolved answer', () => {
  const suggestion = (status, extra = {}) => ({
    id: 'F9', section_id: 'themes', category: 'scope-suggestion', blocking: false, status, note: '', rationale: '', text: 'x', selection_mode: 'single',
    options: [fullOption('a', false), fullOption('b', false)], selected_option_ids: [], ...extra
  });
  for (const status of ['pending', 'deferred']) {
    const feedback = cleanFeedback();
    feedback.findings.push(suggestion(status));
    assert.equal(judge(feedback).required, false, status);
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

test('nothing in the file means nothing was saved, and nothing to write asks too', () => {
  assert.ok(codes(null).includes('not_saved_by_the_owner'));
  assert.deepEqual(codes({ export_method: 'download', arrived_decided: [] }), ['unwritable']);
  assert.equal(assessRoundConfirmation(cleanFeedback()).required, true, 'no file to measure against');
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
  const listed = result.summary.changed_sections.find((section) => section.id === 'problem');
  assert.equal(listed && listed.text_changed, true, 'the dry-run lists it too');
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

const applyClean = (project) => runBriefingApplyFeedback({ args: [project.dir], options: { slug: SLUG, 'confirm-if-clean': true }, logger: quiet });
const applyConfirmed = (project) => runBriefingApplyFeedback({ args: [project.dir], options: { slug: SLUG, confirm: true }, logger: quiet });
const fileOf = (project) => fs.readFile(path.join(project.base, 'briefings.md'), 'utf8');

test('a fold keeps the bytes of every line nobody changed, even inside the section it rewrites', async (t) => {
  const briefing = BRIEFING.replace('- Risk one', '- Returns Map<string, User> today.\n- Keep <A> here\n- Keep <B> here\n- Ends in a <tag>');
  const folds = [
    [(text) => `${text}\n\n- A rollback is named.`, /- Returns Map<string, User> today\.\n- Keep <A> here\n- Keep <B> here\n- Ends in a <tag>\n\n- A rollback is named\./],
    [(text) => `- A rollback is named.\n${text}`, /- A rollback is named\.\n- Returns Map<string, User> today\.\n- Keep <A> here\n- Keep <B> here\n- Ends in a <tag>\n/]
  ];
  for (const [fold, expected] of folds) {
    const project = await makeProject(t, FINDINGS, briefing);
    await saveCleanRound(project, (feedback) => {
      const risks = feedback.sections.find((section) => section.id === 'risks');
      risks.status = 'change_requested';
      risks.current_text = fold(risks.current_text);
    }, { rewrite: false });
    const applied = await applyClean(project);
    assert.equal(applied.applied_without_confirmation, true, JSON.stringify(applied.confirmation));
    assert.match(await fileOf(project), expected);
  }
});

test('a rewrite that changes a line holding markup asks first, for the agent never saw it', async (t) => {
  const held = {
    'a typed line': ['- Returns Map<string, User> today.', (text) => text.replace('today.', 'today, decided.')],
    'a tag spanning two lines': ['- If a < b\n- and c > d the sale fails.', (text) => `${text}\n- A rollback is named.`],
    'a tag alone on its line': ['- Risk one\n<br>', (text) => `${text}\n- A rollback is named.`]
  };
  for (const [label, [lines, change]] of Object.entries(held)) {
    const briefing = BRIEFING.replace('- Risk one', lines);
    const project = await makeProject(t, FINDINGS, briefing);
    await saveCleanRound(project, (feedback) => {
      const risks = feedback.sections.find((section) => section.id === 'risks');
      risks.status = 'change_requested';
      risks.current_text = change(risks.current_text);
    }, { rewrite: false });
    const dry = await applyClean(project);
    assert.equal(dry.mode, 'dry-run', label);
    assert.deepEqual(dry.confirmation.reasons, [{ code: 'markup_stripped', ids: ['risks'] }], label);
    assert.equal(await fileOf(project), briefing, label);
  }
});

test('a round that changes no text leaves the file as it was', async (t) => {
  const briefing = BRIEFING
    .replace('Original problem.', 'Text:\n```\na\n\n\n\nb\n```\nLine   ')
    .replace('- Risk one', '- Risk one\n- Ends in a <tag>')
    .replace(/\n/g, '\r\n');
  for (const apply of [applyClean, applyConfirmed]) {
    const project = await makeProject(t, FINDINGS, briefing);
    await saveCleanRound(project, () => {}, { rewrite: false });
    const applied = await apply(project);
    assert.equal(applied.ok, true);
    assert.deepEqual(applied.appliedChanges, []);
    assert.equal(applied.appliedHash, hashText(briefing));
    assert.equal(await fileOf(project), briefing);
  }
});

test('a tag the owner typed never reaches the file, so the round asks instead of dropping it', async (t) => {
  const project = await makeProject(t);
  await saveCleanRound(project, (feedback) => {
    const problem = feedback.sections.find((section) => section.id === 'problem');
    problem.current_text = 'Original<b> problem.';
  }, { rewrite: false });
  const dry = await applyClean(project);
  assert.equal(dry.mode, 'dry-run');
  assert.deepEqual(dry.confirmation.reasons, [{ code: 'markup_stripped', ids: ['problem'] }]);
  assert.equal(await fileOf(project), BRIEFING);
});

test('blank space at the end of a section is no change, whatever the section ends with', async (t) => {
  const briefing = BRIEFING.replace('- Risk one', '- Risk one\n- Ends in a <tag>');
  const project = await makeProject(t, FINDINGS, briefing);
  await saveCleanRound(project, (feedback) => {
    const risks = feedback.sections.find((section) => section.id === 'risks');
    risks.current_text = `${risks.current_text}\n\n`;
  }, { rewrite: false });
  const applied = await applyClean(project);
  assert.equal(applied.applied_without_confirmation, true, JSON.stringify(applied.confirmation));
  assert.deepEqual(applied.appliedChanges, []);
  assert.equal(await fileOf(project), briefing);
});

test('a repeated heading is refused before anything is written, so the next round can still read the file', async (t) => {
  const project = await makeProject(t);
  const repeat = (feedback) => {
    const risks = feedback.sections.find((section) => section.id === 'risks');
    risks.status = 'change_requested';
    risks.current_text = '- Risk one\n\n## Open questions\nNone.';
  };
  await saveCleanRound(project, repeat, { rewrite: false });
  const dry = await applyClean(project);
  assert.equal(dry.mode, 'dry-run');
  assert.ok(dry.confirmation.reasons.some((reason) => reason.code === 'unwritable'), JSON.stringify(dry.confirmation.reasons));
  await assert.rejects(applyConfirmed(project), { code: 'duplicate_sections' });
  assert.equal(await fileOf(project), BRIEFING);
});

test('what was applied is measured on the file, so an approved briefing returns to draft', async (t) => {
  const project = await makeProject(t);
  const registry = await readBriefingRegistry(project.dir);
  findBriefing(registry, SLUG).status = 'approved';
  await writeBriefingRegistry(project.dir, registry);
  await saveCleanRound(project, (feedback) => {
    const risks = feedback.sections.find((section) => section.id === 'risks');
    risks.original_text = 'Rewritten behind the review.';
    risks.current_text = 'Rewritten behind the review.';
  }, { rewrite: false });
  const applied = await applyClean(project);
  assert.deepEqual(applied.appliedChanges.map((change) => [change.section_id, change.summary]), [['risks', 'text changed']]);
  assert.equal(applied.returnedToDraft, true);
  assert.equal(findBriefing(await readBriefingRegistry(project.dir), SLUG).status, 'draft');
});

test('a section the file has no heading for is reported as nothing written', async (t) => {
  const project = await makeProject(t);
  await saveCleanRound(project, (feedback) => {
    feedback.sections.push({ id: 'ghost', title: 'Ghost', source_path: 'x', original_hash: 'x', status: 'change_requested', comments_count: 0, original_text: 'x', current_text: 'y' });
  }, { rewrite: false });
  const dry = await applyClean(project);
  assert.deepEqual(dry.confirmation.reasons, [{ code: 'section_action', ids: ['ghost'] }]);
  const applied = await applyConfirmed(project);
  assert.deepEqual(applied.appliedChanges, []);
  assert.equal(await fileOf(project), BRIEFING);
});

test('the page says who decided, whatever became of the findings file or wherever it came from', async (t) => {
  const seeded = [{ ...FINDINGS[0], status: 'accepted', selected_option_ids: ['desktop'] }, { ...FINDINGS[1] }];
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-clean-round-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const base = path.join(dir, '.aioson', 'briefings', SLUG);
  await fs.mkdir(base, { recursive: true });
  await fs.writeFile(path.join(base, 'briefings.md'), BRIEFING, 'utf8');
  await fs.writeFile(path.join(dir, 'seed.json'), JSON.stringify(seeded), 'utf8');
  await writeBriefingRegistry(dir, {
    updated_at: '2026-11-06',
    briefings: [{ slug: SLUG, status: 'draft', source_plans: [], created_at: '2026-11-06', approved_at: null, prd_generated: null }]
  });
  const review = await runBriefingReview({ args: [dir], options: { slug: SLUG, findings: 'seed.json' }, logger: quiet });
  assert.equal(review.ok, true, JSON.stringify(review));
  await fs.rm(path.join(base, 'refinement-findings.json'), { force: true });
  const project = { dir, base, feedbackPath: path.join(base, 'refinement-feedback.json') };
  await saveCleanRound(project, () => {}, { rewrite: false });
  const dry = await applyClean(project);
  assert.equal(dry.mode, 'dry-run');
  assert.deepEqual(dry.confirmation.reasons, [{ code: 'arrived_decided', ids: ['F1'] }]);
});
