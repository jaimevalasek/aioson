'use strict';

/**
 * The unit is measured, not just owned. An orchestrated plan whose only lane
 * owned every write path ran one whole vertical phase per process — 15 of 28
 * files in one context, four waves in strict series, one model for
 * everything — and every gate stayed green because nothing measured the
 * UNIT: its files, its acceptance criteria, the surfaces it writes, the
 * parallelism the graph actually allows. These tests pin the four legs that
 * replaced that silence:
 *   - `execution:offer` measures the plan per unit and as a graph, names the
 *     surfaces (the axis models are assigned on) and proposes the cut;
 *   - `execution:compile` warns on a unit above the ceiling, a unit writing
 *     both surfaces, and a single lane running one unit per wave;
 *   - the unit prompt carries its own plan section and a context contract
 *     (prototype only for frontend units, rules through context:brief);
 *   - the grid compiles: a phase cut per lane in one wave, a bare phase
 *     number depending on every row of that phase, the Interface Contract
 *     read from the plan.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { runExecution } = require('../src/commands/execution');
const { readExecutionPlan } = require('../src/agent-execution/execution-plan');
const { signatureKey, writeSignatures } = require('../src/lib/host-signature');

const ROOT = path.resolve(__dirname, '..');
const logger = { log() {}, error() {}, warn() {} };
const SLUG = 'rentals';
const PROTOTYPE = `.aioson/briefings/${SLUG}/prototype.html`;

const PHASE_1_FILES = [
  'package.json', 'src/server.js', 'src/http/api.js', 'src/storage/store.js', 'src/storage/catalog-repository.js',
  'src/domain/period.js', 'src/domain/availability.js', 'data/products.json',
  'public/index.html', 'public/styles.css', 'public/app.js', 'tests/catalog.test.js'
];
const PHASE_2_FILES = ['src/domain/pricing.js', 'src/domain/reservation.js', 'src/http/api.js', 'public/app.js', 'tests/reservation.test.js'];
const PHASE_3_FILES = ['src/domain/return.js', 'src/http/api.js', 'tests/return.test.js'];
const PHASE_4_FILES = ['public/index.html', 'public/styles.css', 'public/app.js', 'tests/accessibility.test.js'];

// Two UI capabilities: four criteria on the storefront, three on its states — together the seven the closing phase carries.
const UI_ACS = ['AC-rentals-07', 'AC-rentals-08', 'AC-rentals-09', 'AC-rentals-10'];
const UI_STATE_ACS = ['AC-rentals-11', 'AC-rentals-12', 'AC-rentals-13'];

const HEAD = [
  '---',
  `feature: ${SLUG}`,
  'status: approved',
  `prototype: ${PROTOTYPE}`,
  'prototype_status: current',
  '---',
  `# Implementation Plan — ${SLUG}`,
  '',
  '## Implementation Delta',
  '| CAP | Action | Existing evidence | Exact paths | Required change |',
  '|---|---|---|---|---|',
  '| CAP-rentals-catalog | create | none | package.json, src/server.js, src/http/api.js, src/storage/store.js, src/storage/catalog-repository.js, data/products.json, tests/catalog.test.js | catalog over http |',
  '| CAP-rentals-period | create | none | src/domain/period.js, src/domain/availability.js | civil dates |',
  '| CAP-rentals-reserve | create | none | src/domain/pricing.js, src/domain/reservation.js, tests/reservation.test.js | reservation |',
  '| CAP-rentals-return | create | none | src/domain/return.js, tests/return.test.js | return with fee |',
  '| CAP-rentals-ui | create | none | public/index.html, public/styles.css, public/app.js | the storefront |',
  '| CAP-rentals-ui-states | create | none | tests/accessibility.test.js | the seven states, measured |',
  '',
  '## Capability Delivery Plan',
  '| CAP | Phase | Files | Verification |',
  '|---|---|---|---|',
  '| CAP-rentals-catalog | 1 | package.json, src/server.js, src/http/api.js, src/storage/store.js, src/storage/catalog-repository.js, data/products.json, tests/catalog.test.js | npm test -- catalog |',
  '| CAP-rentals-period | 1 | src/domain/period.js, src/domain/availability.js | npm test -- period |',
  '| CAP-rentals-reserve | 2 | src/domain/pricing.js, src/domain/reservation.js, tests/reservation.test.js | npm test -- reservation |',
  '| CAP-rentals-return | 3 | src/domain/return.js, tests/return.test.js | npm test -- return |',
  '| CAP-rentals-ui | 4 | public/index.html, public/styles.css, public/app.js | npm test -- accessibility |',
  '| CAP-rentals-ui-states | 4 | tests/accessibility.test.js | npm test -- accessibility |',
  ''
];

const PHASE_SECTIONS = [
  '## Phase 1 — Catalog in the browser',
  '- CAP/AC: CAP-rentals-catalog, CAP-rentals-period',
  '- Implementation: The store serializes every mutation through one queue and renames atomically.',
  '- Done when: the catalog answers on the loopback address',
  '',
  '### Phase 1 notes',
  'Sub-heading inside the phase stays with it.',
  '',
  '## Phase 2 — Reservation confirmed',
  '- Implementation: pricing in integer cents.',
  '',
  '## Phase 3 — Return with fee',
  '- Implementation: one transition to returned.',
  '',
  '## Phase 4 — Storefront closed against the prototype',
  '- Implementation: seven states reached by real data.',
  ''
];

// The incident: one lane owning every write path, one whole phase per wave.
const SINGLE_LANE_PLAN = [
  ...HEAD,
  '## Development execution lanes',
  '| Lane | Exact write paths | Integration owner |',
  '|---|---|---|',
  '| delivery | src, public, tests, data, package.json | dev |',
  '',
  '## Execution Sequence',
  '| Phase | Wave | Files | Scope | Done when | Depends on |',
  '|---|---|---|---|---|---|',
  `| 1 | 1 | ${PHASE_1_FILES.join(', ')} | CAP-rentals-catalog, CAP-rentals-period, AC-rentals-01, AC-rentals-02, AC-rentals-03 | npm test -- catalog period passes | - |`,
  `| 2 | 2 | ${PHASE_2_FILES.join(', ')} | CAP-rentals-reserve, AC-rentals-04, AC-rentals-05 | npm test -- reservation passes | 1 |`,
  `| 3 | 3 | ${PHASE_3_FILES.join(', ')} | CAP-rentals-return, AC-rentals-06 | npm test -- return passes | 2 |`,
  `| 4 | 4 | ${PHASE_4_FILES.join(', ')} | CAP-rentals-ui, CAP-rentals-ui-states, ${[...UI_ACS, ...UI_STATE_ACS].join(', ')} | npm test passes | 3 |`,
  '',
  ...PHASE_SECTIONS
].join('\n');

// The fix: lanes per surface, the phase cut per lane inside one wave, the boundary as a contract.
const GRID_PLAN = [
  ...HEAD,
  '## Interface Contract',
  '| Interface | Boundary | Input | Output | Failure | CAP |',
  '|---|---|---|---|---|---|',
  '| IF-001 | GET /api/catalog?start&end | civil dates | items with days, total, available | 400 with field errors | CAP-rentals-catalog |',
  '',
  '## Development execution lanes',
  '| Lane | Exact write paths | Integration owner |',
  '|---|---|---|',
  '| backend | src/**, data/**, package.json, tests/api/** | dev |',
  '| frontend | public/**, tests/ui/** | dev |',
  '',
  '## Execution Sequence',
  '| Phase | Wave | Files | Scope | Done when | Depends on |',
  '|---|---|---|---|---|---|',
  '| 1-backend | 1 | package.json, src/server.js, src/http/api.js, src/storage/store.js, src/storage/catalog-repository.js, src/domain/period.js, src/domain/availability.js, data/products.json, tests/api/catalog.test.js | CAP-rentals-catalog, CAP-rentals-period | npm test -- catalog passes | - |',
  '| 1-frontend | 1 | public/index.html, public/styles.css, public/app.js, tests/ui/catalog.test.js | CAP-rentals-ui, AC-rentals-01 | the storefront renders against IF-001 | - |',
  '| 2-backend | 2 | src/domain/pricing.js, src/domain/reservation.js, tests/api/reservation.test.js | CAP-rentals-reserve | npm test -- reservation passes | 1-backend (dev) |',
  '| 2-frontend | 2 | public/app.js, tests/ui/reservation.test.js | CAP-rentals-ui-states, AC-rentals-04 | the modal confirms a reservation | 1 |',
  '| 3-backend | 3 | src/domain/return.js, tests/api/return.test.js | CAP-rentals-return | npm test -- return passes | 2-backend (dev) |',
  '',
  ...PHASE_SECTIONS
].join('\n');

const PRD = [
  '# Rentals',
  '',
  '## Feature Capability Map',
  '| CAP | Capability | Required |',
  '|---|---|---|',
  '| CAP-rentals-catalog | Catalog | yes |',
  '| CAP-rentals-period | Period | yes |',
  '| CAP-rentals-reserve | Reserve | yes |',
  '| CAP-rentals-return | Return | yes |',
  '| CAP-rentals-ui | Storefront | yes |',
  '| CAP-rentals-ui-states | Storefront states | yes |',
  '',
  '## Acceptance Criteria',
  '| AC | CAP | Observable behavior | Evidence |',
  '|---|---|---|---|',
  '| AC-rentals-01 | CAP-rentals-catalog | The catalog lists products | http test |',
  '| AC-rentals-02 | CAP-rentals-period | Inclusive days are counted | domain test |',
  '| AC-rentals-03 | CAP-rentals-period | Inverted dates are refused | domain test |',
  '| AC-rentals-04 | CAP-rentals-reserve | A reservation persists | http test |',
  '| AC-rentals-05 | CAP-rentals-reserve | Overlap is refused | http test |',
  '| AC-rentals-06 | CAP-rentals-return | A late return charges a fee | domain test |',
  ...UI_ACS.map((ac, index) => `| ${ac} | CAP-rentals-ui | Storefront screen ${index + 1} | walkthrough |`),
  ...UI_STATE_ACS.map((ac, index) => `| ${ac} | CAP-rentals-ui-states | Storefront state ${index + 1} | walkthrough |`),
  ''
].join('\n');

function signed(host, model, effort) {
  return { host, model, reasoning_effort: effort, status: 'valid', reason: null, checked_at: '2026-08-25T10:00:00.000Z', expires_at: '2999-01-01T00:00:00.000Z' };
}

const SIGNATURES = {
  [signatureKey('codex', 'gpt-5.6', 'high')]: signed('codex', 'gpt-5.6', 'high'),
  [signatureKey('kimi', 'kimi-k3', null)]: signed('kimi', 'kimi-k3', null),
  [signatureKey('claude', 'claude-sonnet-5', null)]: signed('claude', 'claude-sonnet-5', null)
};

const SINGLE_ROLES = {
  version: 1, source: 'test-client', enabled: true,
  roles: { delivery_dev: { host: 'codex', model: 'gpt-5.6', reasoning_effort: 'high' }, qa: { host: 'claude', model: 'claude-sonnet-5' } },
  parallel: { max_concurrent_lanes: 2 }, on_unavailable: 'ask'
};

const GRID_ROLES = {
  version: 1, source: 'test-client', enabled: true,
  roles: {
    backend_dev: { host: 'codex', model: 'gpt-5.6', reasoning_effort: 'high' },
    frontend_dev: { host: 'kimi', model: 'kimi-k3', reasoning_effort: null },
    qa: { host: 'claude', model: 'claude-sonnet-5' }
  },
  parallel: { max_concurrent_lanes: 2 }, on_unavailable: 'ask'
};

async function setup(t, { plan, roles, prd = PRD, prototype = true } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-execution-unit-budget-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  await fs.mkdir(path.join(dir, '.aioson', 'context'), { recursive: true });
  await fs.mkdir(path.join(dir, '.aioson', 'config'), { recursive: true });
  await fs.mkdir(path.join(dir, '.aioson', 'agents'), { recursive: true });
  await fs.writeFile(path.join(dir, '.aioson', 'context', `implementation-plan-${SLUG}.md`), plan, 'utf8');
  if (prd !== null) await fs.writeFile(path.join(dir, '.aioson', 'context', `prd-${SLUG}.md`), prd, 'utf8');
  if (roles) await fs.writeFile(path.join(dir, '.aioson', 'config', 'execution-roles.json'), JSON.stringify(roles, null, 2), 'utf8');
  if (prototype) {
    await fs.mkdir(path.join(dir, '.aioson', 'briefings', SLUG), { recursive: true });
    await fs.writeFile(path.join(dir, ...PROTOTYPE.split('/')), `<!doctype html><title>rentals</title>${'<section></section>'.repeat(200)}`, 'utf8');
  }
  await fs.copyFile(path.join(ROOT, 'template', '.aioson', 'agents', 'dev.md'), path.join(dir, '.aioson', 'agents', 'dev.md'));
  const env = { ...process.env, AIOSON_HOST_SIGNATURES: path.join(dir, 'signatures.json') };
  delete env.AIOSON_PLAY;
  delete env.AIOSON_EXECUTION_SPLIT_MIN_FILES;
  delete env.AIOSON_EXECUTION_UNIT_MAX_FILES;
  delete env.AIOSON_EXECUTION_UNIT_MAX_ACS;
  await writeSignatures({ signatures: SIGNATURES }, { env });
  return { dir, env };
}

const compile = (dir, env, extra = {}) => runExecution({ args: [dir], options: { sub: 'compile', feature: SLUG, json: true, ...extra }, logger, env });
const offer = (dir, env, extra = {}, log = logger) => runExecution({ args: [dir], options: { sub: 'offer', feature: SLUG, json: true, ...extra }, logger: log, env });
const readPrompt = (dir, unit) => fs.readFile(path.join(dir, '.aioson', 'context', 'execution-prompts', SLUG, `${unit}.md`), 'utf8');
const warningsOf = (result, check) => (result.warnings || []).filter((warning) => warning.check === check);

test('execution:offer measures the unit, the graph and the surfaces — the incident shape reads serial, over the ceiling, two-sided, and the cut is proposed by surface', async (t) => {
  const { dir, env } = await setup(t, { plan: SINGLE_LANE_PLAN, roles: SINGLE_ROLES });
  const result = await offer(dir, env);
  assert.equal(result.available, true, JSON.stringify(result));
  const scale = result.plan.scale;
  assert.equal(scale.files, 18);
  assert.equal(scale.split_candidate, true);
  assert.deepEqual(scale.ceiling, { max_files: 10, max_acs: 6 });

  // Per unit: the numbers the cut is made on.
  assert.deepEqual(scale.units.map((unit) => [unit.phase, unit.files, unit.acs, unit.over_budget, unit.reasons, unit.two_sided, unit.depth]), [
    ['1', 12, 3, true, ['files'], true, 1],
    ['2', 5, 2, false, [], true, 2],
    ['3', 3, 1, false, [], false, 3],
    ['4', 4, 7, true, ['acs'], false, 4]
  ]);
  assert.deepEqual(scale.units[0].shared_files, ['src/http/api.js', 'public/index.html', 'public/styles.css', 'public/app.js']);
  // As a graph: one unit per wave, every wave waiting for the previous review.
  assert.deepEqual(scale.parallelism, { waves: 4, max_concurrent_units: 1, serial_chain: 4, critical_path_processes: 8, serial: true });
  assert.deepEqual(scale.seams.slice(0, 2), [{ file: 'public/app.js', units: 3 }, { file: 'src/http/api.js', units: 3 }]);
  // By surface: the axis models are assigned on. Tests at a root nobody can own alone are named.
  assert.equal(scale.surfaces.backend, 10);
  assert.equal(scale.surfaces.frontend, 3);
  assert.equal(scale.surfaces.two_sided, true);
  assert.equal(scale.surfaces.shared_test_root, true);
  assert.deepEqual(scale.surfaces.tests, { backend: 0, frontend: 0, shared: 4 });
  assert.deepEqual(scale.surfaces.files.find((file) => file.path === 'src/server.js'), { path: 'src/server.js', surface: 'backend', test: false }, 'a stem names the surface when the directory does not');
  assert.deepEqual(scale.surfaces.files.find((file) => file.path === 'package.json'), { path: 'package.json', surface: 'shared', test: false });

  // The proposal: one lane per surface, every row cut in two inside its wave, the unplaceable named with the reason.
  const proposal = result.plan.split_proposal;
  assert.equal(proposal.source, 'execution_sequence');
  assert.deepEqual(proposal.lanes, [
    { lane: 'backend', write_paths: ['data/**', 'src/**'] },
    { lane: 'frontend', write_paths: ['public/**'] }
  ]);
  assert.deepEqual(proposal.rows[0].units.map((unit) => [unit.unit, unit.lane, unit.files.length]), [['1-backend', 'backend', 7], ['1-frontend', 'frontend', 3]]);
  assert.deepEqual(proposal.rows[0].unassigned, ['package.json', 'tests/catalog.test.js']);
  assert.deepEqual(proposal.rows[2].units.map((unit) => unit.unit), ['3-backend'], 'a one-surface row is one unit');
  assert.equal(proposal.shared_test_root, true);
  assert.deepEqual(proposal.unassigned.find((item) => item.path === 'tests/catalog.test.js'), { path: 'tests/catalog.test.js', reason: 'shared_test_root' });
  assert.deepEqual(proposal.unassigned.find((item) => item.path === 'package.json'), { path: 'package.json', reason: 'shared' });

  // The human answer says it in words, not only in JSON.
  const lines = [];
  await offer(dir, env, { json: false }, { log: (line) => lines.push(String(line)), error() {}, warn() {} });
  assert.ok(lines.some((line) => line.includes('phase 1 (12 files, 3 ACs) OVER files') && line.includes('phase 4 (4 files, 7 ACs) OVER acs')), lines.join('\n'));
  assert.ok(lines.some((line) => line.includes('critical path 4 unit(s) = 8 process(es) — SERIAL by construction')), lines.join('\n'));
  assert.ok(lines.some((line) => line.includes('two surfaces: one lane per surface is the model axis')), lines.join('\n'));
  assert.ok(lines.some((line) => line.startsWith('  split proposal (from the Execution Sequence): backend → data/**, src/** | frontend → public/**')), lines.join('\n'));
  assert.ok(lines.some((line) => line.includes('wave 1: 1-backend (7) ‖ 1-frontend (3)')), lines.join('\n'));

  // The ceiling is the environment's.
  const raised = await offer(dir, { ...env, AIOSON_EXECUTION_UNIT_MAX_FILES: '12', AIOSON_EXECUTION_UNIT_MAX_ACS: '7' });
  assert.deepEqual(raised.plan.scale.ceiling, { max_files: 12, max_acs: 7 });
  assert.equal(raised.plan.scale.units.some((unit) => unit.over_budget), false);
});

test('execution:seed without --lanes and without a lanes table seeds one lane per measured surface', async (t) => {
  const noLanes = SINGLE_LANE_PLAN.replace('## Development execution lanes', '## Lanes (not a recognised heading)');
  const { dir, env } = await setup(t, { plan: noLanes, roles: null });
  // Before any table exists, the unlock step already names the measured lanes.
  const locked = await offer(dir, env);
  assert.equal(locked.reason, 'roles_file_missing');
  assert.deepEqual(locked.plan.lanes, []);
  assert.equal(locked.onboarding.next, `aioson execution:seed . --feature=${SLUG} --lanes=backend,frontend`);
  const result = await runExecution({ args: [dir], options: { sub: 'seed', feature: SLUG, json: true }, logger, env });
  assert.deepEqual(result.lanes, ['backend', 'frontend']);
  assert.equal(result.lanes_source, 'surfaces');
  if (result.outcome === 'seeded') {
    assert.deepEqual(Object.keys(result.roles).sort(), ['backend_dev', 'frontend_dev', 'integration_dev', 'qa']);
  } else {
    // A machine without any execution host on PATH: the lanes were still derived from the surfaces.
    assert.equal(result.outcome, 'no_execution_host');
  }
  // After a seed the next step is the owner's: enable the file (or, with no host installed, install one).
  const offered = await offer(dir, env);
  if (result.outcome === 'seeded') assert.match(offered.onboarding.next, /set "enabled": true in \.aioson\/config\/execution-roles\.json/);
  else assert.equal(offered.onboarding.next, `aioson execution:seed . --feature=${SLUG} --lanes=backend,frontend`);
});

test('execution:compile refuses oversized units; an explicitly raised ceiling retains shape diagnostics and context contracts', async (t) => {
  const { dir, env } = await setup(t, { plan: SINGLE_LANE_PLAN, roles: SINGLE_ROLES });
  const result = await compile(dir, env);
  assert.equal(result.ok, false);
  assert.deepEqual(result.errors.map(error => error.check), ['unit_budget_exceeded', 'unit_budget_exceeded']);
  assert.deepEqual(result.warnings.map((warning) => warning.check).sort(), ['orchestration_serial', 'unit_over_budget', 'unit_over_budget', 'unit_spans_surfaces', 'unit_spans_surfaces']);

  const [overFiles, overAcs] = warningsOf(result, 'unit_over_budget');
  assert.equal(overFiles.unit, 'phase-1');
  assert.match(overFiles.message, /unit phase-1 \(phase "1"\) carries 12 files \(ceiling 10\) for one context — cut it on disjoint files inside wave 1/);
  assert.deepEqual(overFiles.ceiling, { max_files: 10, max_acs: 6 });
  assert.equal(overAcs.unit, 'phase-4');
  assert.match(overAcs.message, /carries 7 acceptance criteria \(ceiling 6\) for one context/, 'the ACs come from the PRD rows of the unit capabilities, not only from the scope cell');

  const [spans] = warningsOf(result, 'unit_spans_surfaces');
  assert.equal(spans.unit, 'phase-1');
  assert.deepEqual(spans.backend, ['src/server.js', 'src/http/api.js', 'src/storage/store.js', 'src/storage/catalog-repository.js', 'src/domain/period.js', 'src/domain/availability.js', 'data/products.json']);
  assert.deepEqual(spans.frontend, ['public/index.html', 'public/styles.css', 'public/app.js']);
  assert.match(spans.message, /lets each side run on its own model/);

  const [serial] = warningsOf(result, 'orchestration_serial');
  assert.equal(serial.lane, 'delivery');
  assert.match(serial.message, /one lane \("delivery"\) owning every write path and one unit per wave: this run buys a fresh context and a lane review per unit, never parallelism — lanes are the model axis/);
  const bounded = await compile(dir, { ...env, AIOSON_EXECUTION_UNIT_MAX_FILES: '12', AIOSON_EXECUTION_UNIT_MAX_ACS: '7' });
  assert.equal(bounded.ok, true, JSON.stringify(bounded.errors));
  assert.deepEqual(bounded.summary.parallelism, { max_concurrent_units: 1, serial_chain: 4, critical_path_processes: 8, serial: true });
  assert.deepEqual(bounded.summary.ceiling, { max_files: 12, max_acs: 7 });

  // The prompt: the unit's own plan section, and what it reads beyond the prompt.
  const phase1 = await readPrompt(dir, 'phase-1');
  const sectionAt = phase1.indexOf('## Plan section for this phase (from the plan)');
  assert.ok(sectionAt > 0, phase1);
  assert.ok(phase1.includes('## Phase 1 — Catalog in the browser'));
  assert.ok(phase1.includes('The store serializes every mutation through one queue and renames atomically.'));
  assert.ok(phase1.includes('### Phase 1 notes'), 'a sub-heading inside the phase travels with it');
  assert.ok(!phase1.includes('pricing in integer cents'), 'another phase never enters the unit');
  const contractAt = phase1.indexOf('## Context contract');
  assert.ok(contractAt > sectionAt, phase1);
  assert.match(phase1, /- Plan: \.aioson\/context\/implementation-plan-rentals\.md — your phase section and table rows are embedded above/);
  assert.match(phase1, /- PRD: \.aioson\/context\/prd-rentals\.md — the acceptance criteria of your capabilities are embedded above/);
  assert.match(phase1, /- Prototype: \.aioson\/briefings\/rentals\/prototype\.html \(\d+ KB\) — the visual contract for the UI files of this unit/);
  assert.ok(phase1.includes(`- Rules: run \`aioson context:brief . --agent=dev --mode=executing --paths=${PHASE_1_FILES.join(',')} --task="unit phase-1 of rentals"\``), phase1);
  assert.match(phase1, /never read `\.aioson\/rules\/` wholesale/);
  const phase3 = await readPrompt(dir, 'phase-3');
  assert.ok(phase3.includes('## Phase 3 — Return with fee'));
  assert.ok(!phase3.includes('- Prototype:'), 'a unit without UI files is never told to open the prototype');

  const { plan } = await readExecutionPlan(dir, SLUG);
  const unit1 = plan.units.find((unit) => unit.id === 'phase-1');
  assert.ok(unit1.context.prompt_bytes > 1000);
  assert.deepEqual(unit1.context.reads.map((read) => [read.path, read.bytes > 1000, read.why]), [[PROTOTYPE, true, 'frontend files in this unit']]);
  assert.deepEqual(plan.units.find((unit) => unit.id === 'phase-3').context.reads, []);
  assert.ok(plan.summary.context_bytes_max >= unit1.context.prompt_bytes + unit1.context.reads[0].bytes);

  // The environment moves the ceiling; the warnings follow the number.
  const raised = await compile(dir, { ...env, AIOSON_EXECUTION_UNIT_MAX_FILES: '12', AIOSON_EXECUTION_UNIT_MAX_ACS: '7' });
  assert.equal(raised.ok, true);
  assert.deepEqual(raised.warnings.map((warning) => warning.check).sort(), ['orchestration_serial', 'unit_spans_surfaces', 'unit_spans_surfaces']);
  assert.deepEqual(raised.summary.ceiling, { max_files: 12, max_acs: 7 });
});

test('bounded source reads measure actual selected lines and reject unowned or invalid ranges', async (t) => {
  const { dir, env } = await setup(t, { plan: GRID_PLAN, roles: GRID_ROLES });
  const file = path.join(dir, 'src/domain/period.js');
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, '// bounded\n' + '// large line\n'.repeat(20000));
  const initial = await compile(dir, env);
  assert.equal(initial.ok, true, JSON.stringify(initial.errors));
  assert.ok(initial.plan.units.find(u => u.id === 'phase-1-backend').context.estimated_initial_tokens > 80000);
  const planFile = path.join(dir, '.aioson/context', `implementation-plan-${SLUG}.md`);
  const addRanges = range => GRID_PLAN.split('\n').map(line => {
    if (line.includes('| Phase | Wave |')) return line.replace(/\|\s*$/, '| Read ranges |');
    if (line.startsWith('| 1-backend |')) return line.replace(/\|\s*$/, `| ${range} |`);
    return line;
  }).join('\n');
  await fs.writeFile(planFile, addRanges('src/domain/period.js:1-2'));
  const bounded = await compile(dir, env);
  assert.equal(bounded.ok, true, JSON.stringify(bounded.errors));
  const { plan } = await readExecutionPlan(dir, SLUG);
  const source = plan.units.find(u => u.id === 'phase-1-backend').context.source_files.find(f => f.path === 'src/domain/period.js');
  assert.equal(source.bytes, Buffer.byteLength('// bounded\n// large line\n'));
  assert.ok(source.total_bytes > 200000);
  assert.match(await readPrompt(dir, 'phase-1-backend'), /Do not load these files wholesale/);
  for (const range of ['src/domain/period.js:0-1', 'src/domain/period.js:1-999999', '../outside.js:1-2']) {
    await fs.writeFile(planFile, addRanges(range));
    assert.equal((await compile(dir, env)).ok, false, range);
  }
  await fs.unlink(file);
  await fs.writeFile(planFile, addRanges('src/domain/period.js:1-2'));
  assert.ok((await compile(dir, env)).errors.some(e => e.check === 'read_range_missing_file'));
});

test('the grid compiles: a phase cut per lane inside one wave, a bare phase number depending on every row of that phase, the Interface Contract read from the plan', async (t) => {
  const { dir, env } = await setup(t, { plan: GRID_PLAN, roles: GRID_ROLES });
  const result = await compile(dir, env);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.deepEqual(result.warnings, [], 'no serial shape, no unit over the ceiling, no two-surface unit, and the contract in the PLAN silences the cross-lane edge');
  // The cut was made: the offer proposes nothing more, and the unlock step names the table's lanes.
  const offered = await offer(dir, env);
  assert.equal(offered.plan.split_proposal, null);
  assert.deepEqual(offered.plan.lanes, ['backend', 'frontend']);
  assert.equal(offered.plan.scale.parallelism.serial, false);
  assert.deepEqual(result.summary.parallelism, { max_concurrent_units: 2, serial_chain: 3, critical_path_processes: 6, serial: false });

  const { plan } = await readExecutionPlan(dir, SLUG);
  assert.deepEqual(plan.units.map((unit) => [unit.id, unit.phase, unit.phase_number, unit.wave, unit.lane]), [
    ['phase-1-backend', '1-backend', '1', 1, 'backend'],
    ['phase-1-frontend', '1-frontend', '1', 1, 'frontend'],
    ['phase-2-backend', '2-backend', '2', 2, 'backend'],
    ['phase-2-frontend', '2-frontend', '2', 2, 'frontend'],
    ['phase-3-backend', '3-backend', '3', 3, 'backend']
  ]);
  assert.deepEqual(plan.lanes.backend.units, ['phase-1-backend', 'phase-2-backend', 'phase-3-backend']);
  assert.deepEqual(plan.lanes.frontend.units, ['phase-1-frontend', 'phase-2-frontend']);
  // `1-backend (dev)` is one row; `1` is the whole phase — both of its rows.
  assert.deepEqual(plan.units.find((unit) => unit.id === 'phase-2-backend').depends_on, [{ unit: 'phase-1-backend', gate: 'after_dev' }]);
  assert.deepEqual(plan.units.find((unit) => unit.id === 'phase-2-frontend').depends_on, [
    { unit: 'phase-1-backend', gate: 'after_qa' },
    { unit: 'phase-1-frontend', gate: 'after_qa' }
  ]);
  assert.equal(plan.scheduling, 'dependencies');
  assert.deepEqual(plan.waves.map((wave) => wave.units), [['phase-1-backend', 'phase-1-frontend'], ['phase-2-backend', 'phase-2-frontend'], ['phase-3-backend']]);

  // Each half carries the phase section of its phase; only the frontend half opens the prototype.
  const backend1 = await readPrompt(dir, 'phase-1-backend');
  const frontend1 = await readPrompt(dir, 'phase-1-frontend');
  assert.ok(backend1.includes('## Phase 1 — Catalog in the browser'));
  assert.ok(frontend1.includes('## Phase 1 — Catalog in the browser'));
  assert.ok(!backend1.includes('- Prototype:'));
  assert.ok(frontend1.includes(`- Prototype: ${PROTOTYPE}`));
  assert.match(frontend1, /- Depends on: —|# Unit contract — rentals \/ phase-1-frontend/);
  const frontend2 = await readPrompt(dir, 'phase-2-frontend');
  assert.match(frontend2, /- Depends on: phase-1-backend \(after its review\), phase-1-frontend \(after its review\)/);

  // Without the contract anywhere, the cross-lane edge is the known warning.
  const bare = await setup(t, { plan: GRID_PLAN.replace('## Interface Contract', '## Interface Notes'), roles: GRID_ROLES });
  const uncontracted = await compile(bare.dir, bare.env);
  assert.equal(uncontracted.ok, true, JSON.stringify(uncontracted.errors));
  assert.deepEqual(uncontracted.warnings.map((warning) => warning.check), ['dependency_cross_lane_without_contract']);
});
