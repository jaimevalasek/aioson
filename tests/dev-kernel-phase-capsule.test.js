'use strict';

/**
 * The dev kernel read the briefing, the Sheldon review, the whole PRD and the
 * whole plan before its first edit — 190 to 640 KB on real features, re-sent on
 * every later call. It now reads the phase capsule first and opens the full
 * documents only for a conflict, a capsule error or an omitted detail. That cut
 * is safe only while the capsule carries every id the phase cites: this test
 * names the expected ids by hand (never with the capsule's own parser) for each
 * phase of a fixture plan and checks each one reaches the capsule with its PRD
 * row, plus the pointers to the full sources.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { buildPhaseCapsule } = require('../src/lib/phase-capsule');

const SLUG = 'billing-export';

const PLAN = [
  '---',
  `feature: ${SLUG}`,
  'status: approved',
  '---',
  '',
  `# Implementation Plan — ${SLUG}`,
  '',
  '## Implementation Delta',
  '',
  '| Path | Change | Phase |',
  '|---|---|---|',
  '| src/billing/export.ts | new exporter | 1 |',
  '| src/billing/schedule.ts | scheduler | 3 |',
  '',
  '## Engineering Controls',
  '',
  '| Control | Verification | Phase |',
  '|---|---|---|',
  '| idempotent export | rerun test | 1 |',
  '| retry with backoff | fault test | 3 |',
  '',
  '## Phase 1 — CSV export',
  '',
  'Deliver CAP-1 through AC-1 and AC-2; respect BR-1 and NFR-1.',
  '',
  '## Phase 2 — Filters',
  '',
  'Deliver AC-3 a AC-5 (CAP-2) and REQ-4.',
  '',
  '## Phase 3 — Scheduled export',
  '',
  'Deliver CAP-3 only: its criteria come from the PRD table.',
  ''
].join('\n');

const appendix = Array.from({ length: 60 }, (_, i) => `Background paragraph ${i}: long rationale the phase does not need, kept in the PRD appendix for the record.`).join('\n\n');
const PRD = [
  `# PRD — ${SLUG}`,
  '',
  '## Capabilities',
  '',
  '| CAP | Capability |',
  '|---|---|',
  '| CAP-1 | Export invoices as CSV |',
  '| CAP-2 | Filter the export |',
  '| CAP-3 | Schedule the export |',
  '',
  '## Acceptance criteria',
  '',
  '| AC | CAP | Criterion |',
  '|---|---|---|',
  '| AC-1 | CAP-1 | The CSV has one row per invoice |',
  '| AC-2 | CAP-1 | Amounts keep two decimals |',
  '| AC-3 | CAP-2 | Filter by status |',
  '| AC-4 | CAP-2 | Filter by date range |',
  '| AC-5 | CAP-2 | Filters combine |',
  '| AC-6 | CAP-3 | A schedule runs daily |',
  '| AC-7 | CAP-3 | A failed run retries |',
  '',
  '## Business rules',
  '',
  '| ID | Rule |',
  '|---|---|',
  '| BR-1 | A void invoice is exported with status void |',
  '| REQ-4 | Filters persist per user |',
  '| NFR-1 | 10k invoices export in under 5 s |',
  '',
  '## Appendix',
  '',
  appendix,
  ''
].join('\n');

// Written by hand from the plan above: what each phase owes.
const EXPECTED = {
  1: ['CAP-1', 'AC-1', 'AC-2', 'BR-1', 'NFR-1'],
  2: ['AC-3', 'AC-4', 'AC-5', 'CAP-2', 'REQ-4'],
  3: ['CAP-3', 'AC-6', 'AC-7']
};
const ALL_ROWS = ['CAP-1', 'CAP-2', 'CAP-3', 'AC-1', 'AC-2', 'AC-3', 'AC-4', 'AC-5', 'AC-6', 'AC-7', 'BR-1', 'REQ-4', 'NFR-1'];
const rowOf = (id) => PRD.split('\n').find((line) => line.startsWith(`| ${id} |`));

test('each phase capsule carries every id its phase cites, with the PRD row, and nothing it does not', () => {
  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-capsule-complete-'));
  for (const [phase, ids] of Object.entries(EXPECTED)) {
    const result = buildPhaseCapsule({ targetDir, slug: SLUG, phaseId: phase, plan: PLAN, prd: PRD });
    assert.equal(result.ok, true, `phase ${phase}`);
    for (const id of ids) assert.ok(result.capsule.includes(rowOf(id)), `phase ${phase} capsule lacks the PRD row of ${id}`);
    for (const id of ALL_ROWS.filter((item) => !ids.includes(item))) {
      assert.ok(!result.capsule.includes(rowOf(id)), `phase ${phase} capsule carries ${id}, which it does not cite`);
    }
    assert.deepEqual(result.acs.missing, [], `phase ${phase}: no cited AC without its row`);
    assert.ok(result.capsule.includes(`.aioson/context/implementation-plan-${SLUG}.md`) && result.capsule.includes(`.aioson/context/prd-${SLUG}.md`), 'drill-down pointers to both full sources');
    assert.ok(result.bytes.capsule < 0.35 * result.bytes.plan_and_prd, `phase ${phase}: ${result.bytes.capsule} B of ${result.bytes.plan_and_prd} B`);
    assert.doesNotMatch(result.capsule, /Background paragraph/, 'the appendix stays in the PRD');
  }
  const phaseOne = buildPhaseCapsule({ targetDir, slug: SLUG, phaseId: 1, plan: PLAN, prd: PRD }).capsule;
  assert.match(phaseOne, /idempotent export/, 'the phase\'s engineering control is kept');
  assert.doesNotMatch(phaseOne, /retry with backoff/, 'another phase\'s control is cut');
});

test('a cited AC the PRD lacks is reported missing, never dropped in silence', () => {
  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-capsule-missing-'));
  const plan = PLAN.replace('Deliver AC-3 a AC-5 (CAP-2) and REQ-4.', 'Deliver AC-3 a AC-5, AC-9 (CAP-2) and REQ-4.');
  const result = buildPhaseCapsule({ targetDir, slug: SLUG, phaseId: 2, plan, prd: PRD });
  assert.deepEqual(result.acs.missing, ['AC-9']);
});

test('the dev kernel reads the capsule first and keeps the full documents for a conflict or a gap', () => {
  for (const file of ['template/.aioson/agents/dev.md', '.aioson/agents/dev.md']) {
    const kernel = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    const step = kernel.split('\n').find((line) => line.startsWith('2. Resolve the active feature'));
    assert.ok(step, `${file}: Required input step 2`);
    assert.match(step, /per phase, read its capsule first: `aioson dev:resume-data \. --feature=\{slug\} --phase=\{n\} --capsule`/);
    assert.match(step, /approved briefing\/refinement, hash-bound Sheldon review, `prd-\{slug\}\.md` \(source coverage\) or `implementation-plan-\{slug\}\.md` in full only for a conflict, a capsule error, or a detail it omits/);
    assert.match(kernel, /If PRD and plan conflict, stop and report the exact conflict/, 'the conflict stop stays binding');
  }
});
