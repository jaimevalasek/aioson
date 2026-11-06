'use strict';

// The owner takes the recommended option in 95% of the review answers, so recommending
// scope is deciding it. One review recommended three improvements while its own text
// said "no promise of yours behind them" and "the simplest base is to include none",
// and all three went in. An idea stays on the card; only a promise can recommend it.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { runBriefingReview } = require('../src/commands/briefing');
const { writeBriefingRegistry } = require('../src/lib/refiner/briefing-registry');
const { briefingPromiseIds } = require('../src/lib/feature-source-lineage');
const { normalizeFinding, validateFindingsInput } = require('../src/lib/refiner/feedback-schema');

const option = (id, extra = {}) => ({ id, label: id, description: `${id} description`, impact: `${id} impact`, recommended: false, evidence_refs: [], ...extra });

function suggestion(options, extra = {}) {
  return {
    id: 'F24', section_id: 'themes', category: 'scope-suggestion', severity: 'low', blocking: false,
    text: 'The scout found improvements beyond the request.', question: 'Which ones?', selection_mode: 'multiple',
    options, selected_option_ids: [], rationale: '', evidence_refs: [], ...extra
  };
}

const known = new Set(['PROM-001', 'PROM-camera']);
const check = (finding, promiseIds = known) => validateFindingsInput([finding], { promiseIds });

test('a recommended idea with no promise behind it is refused, and the error says how to fix it', () => {
  const result = check(suggestion([option('checklist', { recommended: true }), option('preview')]));
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /finding F24 recommends scope with no promise behind it \(checklist\)/);
  assert.match(result.errors[0], /cite a PROM-\*/);
  assert.match(result.errors[0], /defers: true/);
  assert.match(result.errors[0], /drop the recommendation/);
});

test('every recommended option answers for itself', () => {
  const result = check(suggestion([
    option('a', { recommended: true }),
    option('b', { recommended: true, evidence_refs: ['PROM-001'] }),
    option('c', { recommended: true })
  ], { selection_mode: 'multiple' }));
  assert.equal(result.errors.length, 2);
  assert.match(result.errors[0], /\(a\)/);
  assert.match(result.errors[1], /\(c\)/);
});

test('the idea itself stays on the card, with no recommendation', () => {
  assert.deepEqual(check(suggestion([option('a'), option('b')])), { ok: true, errors: [] });
});

test('a promise the briefing holds can recommend, when the option itself cites it', () => {
  const places = [
    suggestion([option('a', { recommended: true, evidence_refs: ['PROM-001'] }), option('b')]),
    suggestion([option('a', { recommended: true, description: 'Delivers PROM-camera in full.' }), option('b')]),
    suggestion([option('a', { recommended: true, impact: 'Closes PROM-001.' }), option('b')])
  ];
  for (const finding of places) assert.deepEqual(check(finding), { ok: true, errors: [] }, JSON.stringify(finding));
});

test('the text of the finding backs no option: it may name a promise to deny it', () => {
  const denied = suggestion([option('a', { recommended: true }), option('b', { recommended: true }), option('c')], { text: 'PROM-001 says nothing about this, no promise of yours.' });
  assert.equal(check(denied).errors.length, 2);
  assert.equal(check(suggestion([option('a', { recommended: true }), option('b')], { evidence_refs: ['PROM-001'] })).ok, false);
  assert.equal(check(suggestion([option('a', { recommended: true, evidence_refs: ['PROM-camera'] }), option('b', { recommended: true })])).ok, false, 'one citation does not lend itself to the other option');
});

test('a promise the briefing does not hold recommends nothing', () => {
  const finding = suggestion([option('a', { recommended: true, evidence_refs: ['PROM-999'] }), option('b')]);
  assert.equal(check(finding).ok, false);
  assert.equal(check(finding, new Set()).ok, false);
  // With no map to compare, a caller can only ask that one is cited.
  assert.equal(check(finding, null).ok, true);
  assert.equal(check(suggestion([option('a', { recommended: true }), option('b')]), null).ok, false);
});

test('recommending to leave the scope as it is needs no promise', () => {
  const finding = suggestion([option('later', { recommended: true, defers: true }), option('now')], { selection_mode: 'single' });
  assert.deepEqual(check(finding), { ok: true, errors: [] });
  assert.equal(normalizeFinding(finding, 0).options[0].defers, true);
  assert.equal(normalizeFinding(finding, 0).options[1].defers, false);

  const wrongType = check(suggestion([option('later', { recommended: true, defers: 'yes' }), option('now')]));
  assert.equal(wrongType.ok, false);
  assert.ok(wrongType.errors.some((error) => /defers must be a boolean/.test(error)));
});

test('the legacy shape answers the same way', () => {
  const legacy = (extra) => ({ id: 'F9', section_id: 'themes', category: 'scope-suggestion', text: 'An optional idea.', ...extra });
  assert.equal(check(legacy({ recommendation: 'Add a checklist.' })).ok, false);
  assert.equal(check(legacy({ recommendation: 'Add a checklist for PROM-001.' })).ok, true);
  assert.equal(check(legacy({ recommendation: 'Add a checklist.', evidence_refs: ['PROM-001'] })).ok, true);
  assert.equal(check(legacy({ recommendation: 'Add a checklist.', text: 'PROM-001 does not ask for it.' })).ok, false);
  assert.equal(check(legacy({})).ok, true);
});

test('the rule is about scope: other categories recommend freely', () => {
  for (const category of ['pending-decision', 'gap', 'risk', 'ambiguity', 'redundancy']) {
    const finding = suggestion([option('a', { recommended: true }), option('b')], { category });
    assert.deepEqual(check(finding), { ok: true, errors: [] }, category);
  }
});

test('the promises of a briefing are read as the validator reads its map', () => {
  const map = (...rows) => ['## Sources', '', '### Source Promise Map', '', ...rows, '', '## Open questions', '- None'].join('\n');
  const plain = briefingPromiseIds(map(
    '| PROM | Source | Locator | Approved intent | State |',
    '|---|---|---|---|---|',
    '| PROM-001 | conversational | 1st message | Charge 3% | required |',
    '| PROM-camera | SRC-1 | item 2 | Any angle | deferred |',
    '| PROM-010 | conversational | 1st message | Remove licenses, replaced | not_applicable |',
    '| not-an-id | conversational | 1st message | Some intent | required |',
    '',
    'PROM-777 in prose is no row.'
  ));
  assert.deepEqual([...plain].sort(), ['PROM-001', 'PROM-camera']);

  // The contract allows more columns and other orders, and a state in backticks.
  const extra = briefingPromiseIds(map(
    '| # | PROM | Source | Approved intent | State | Note |',
    '|---|---|---|---|---|---|',
    '| 1 | PROM-001 | conversational | Charge 3% | required | x |',
    '| 2 | PROM-002 | conversational | Replaced | not_applicable | gone |',
    '| 3 | PROM-003 | conversational | Replaced | `not_applicable` | gone |'
  ));
  assert.deepEqual([...extra], ['PROM-001']);

  assert.equal(briefingPromiseIds('').size, 0);
  assert.equal(briefingPromiseIds(undefined).size, 0);
  assert.equal(briefingPromiseIds('## Sources\n\n### Source Promise Map\n\nNo table yet.').size, 0);
  assert.equal(briefingPromiseIds(map('| Other | Column |', '|---|---|', '| a | b |')).size, 0);
});

test('briefing:review refuses the round, writes no page, and accepts it once it cites a promise', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-scope-rule-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const base = path.join(dir, '.aioson', 'briefings', 'idea');
  await fs.mkdir(base, { recursive: true });
  const sections = ['Context', 'Problem', 'Proposed solution', 'Themes', 'Risks', 'Identified gaps', 'Open questions'];
  const body = sections.map((title) => `## ${title}\nText.\n`).join('\n');
  const map = '## Sources\n\n### Source Promise Map\n\n| PROM | Source | Locator | Approved intent | State |\n|---|---|---|---|---|\n| PROM-001 | conversational | 1st | Charge 3% | required |\n';
  await fs.writeFile(path.join(base, 'briefings.md'), `# Briefing\n\n${body}\n${map}`, 'utf8');
  await writeBriefingRegistry(dir, {
    updated_at: '2026-11-06',
    briefings: [{ slug: 'idea', status: 'draft', source_plans: [], created_at: '2026-11-06', approved_at: null, prd_generated: null }]
  });
  const findingsPath = path.join(base, 'refinement-findings.json');
  const errors = [];
  const logger = { log() {}, error: (line) => errors.push(line) };

  await fs.writeFile(findingsPath, JSON.stringify([suggestion([option('checklist', { recommended: true }), option('preview')])]), 'utf8');
  const refused = await runBriefingReview({ args: [dir], options: { slug: 'idea' }, logger });
  assert.equal(refused.ok, false);
  assert.equal(refused.error, 'invalid_findings');
  assert.ok(errors.some((line) => /recommends scope with no promise behind it/.test(line)), errors.join('\n'));
  await assert.rejects(fs.access(path.join(base, 'review.html')));

  await fs.writeFile(findingsPath, JSON.stringify([suggestion([option('checklist', { recommended: true, evidence_refs: ['PROM-999'] }), option('preview')])]), 'utf8');
  const invented = await runBriefingReview({ args: [dir], options: { slug: 'idea' }, logger });
  assert.equal(invented.error, 'invalid_findings', 'a promise the briefing does not hold recommends nothing');

  await fs.writeFile(findingsPath, JSON.stringify([suggestion([option('checklist', { recommended: true, evidence_refs: ['PROM-001'] }), option('preview')])]), 'utf8');
  const accepted = await runBriefingReview({ args: [dir], options: { slug: 'idea' }, logger });
  assert.equal(accepted.ok, true, errors.join('\n'));
  await fs.access(path.join(base, 'review.html'));
});
