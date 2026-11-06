'use strict';

/**
 * The workflow engine's two readings of the plan's scale:
 *   - planner ACTIVATION: MEDIUM and larger features see the locked state and
 *     the unlock step when the orchestrated path is not unlocked; MICRO/SMALL
 *     stay byte-identical (the lean lane never carries it);
 *   - planner COMPLETION: a split-candidate plan with no recorded execution
 *     choice is an advisory with the numbers — never a block.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { runWorkflowNext, buildExecutionActivationContext, inspectExecutionGate } = require('../src/commands/workflow-next');
const { createTranslator } = require('../src/i18n');
const { approveAndSealSheldonReview } = require('./helpers/feature-evidence');

const ROOT = path.resolve(__dirname, '..');
const logger = { log() {}, error() {}, warn() {} };
const { t } = createTranslator('en');
const SLUG = 'orders';

const prd = (classification) => [
  '---',
  `classification: ${classification}`,
  'product_scope: approved',
  'prd_ready: approved',
  'sheldon_review: pending',
  '---',
  '# Orders',
  '',
  '## Feature Capability Map',
  '',
  '| CAP | Promised outcome | Actor / trigger | Scope decision | Rationale |',
  '|---|---|---|---|---|',
  '| CAP-orders-api | Orders API stores orders | User submits | required | Core promise |',
  '',
  '## Acceptance Criteria',
  '',
  '| AC | CAP | Observable behavior | Evidence |',
  '|---|---|---|---|',
  '| AC-orders-01 | CAP-orders-api | POST /orders creates an order | api test |',
  ''
].join('\n');

const SMALL_PLAN = [
  '---',
  'status: draft',
  '---',
  '# Plan',
  '',
  '## Capability Delivery Plan',
  '',
  '| CAP | Phase | Files | Verification |',
  '|---|---|---|---|',
  '| CAP-orders-api | 1 | src/api/orders.ts, tests/api/orders.test.ts | npm test -- orders.api |',
  ''
].join('\n');

// The incident shape: 16 files, four chained phases, no lanes table, no recorded choice.
const files = (prefix, n) => Array.from({ length: n }, (_, i) => `${prefix}/file${i}.ts`);
const PHASES = [
  files('src/server', 6),
  files('src/client', 5),
  files('src/domain', 3),
  files('tests/integration', 2)
];
function bigPlan({ frontmatter = ['status: draft'], lanes = false, parallel = false, phases = PHASES } = {}) {
  return [
    '---', ...frontmatter, '---',
    '# Plan',
    '',
    '## Implementation Delta',
    '| CAP | Action | Existing evidence | Exact paths | Required change |',
    '|---|---|---|---|---|',
    ...phases.map((paths, i) => `| CAP-orders-p${i + 1} | create | none | ${paths.join(', ')} | phase ${i + 1} |`),
    '',
    '## Capability Delivery Plan',
    '',
    '| CAP | Phase | Files | Verification |',
    '|---|---|---|---|',
    ...phases.map((paths, i) => `| CAP-orders-p${i + 1} | ${i + 1} | ${paths.join(', ')} | npm test |`),
    '',
    ...(lanes ? [
      '## Development execution lanes',
      '| Lane | Exact write paths | Integration owner |',
      '|---|---|---|',
      '| server | src/server/**, src/domain/** | dev |',
      '| client | src/client/** | dev |',
      ''
    ] : []),
    '## Execution Sequence',
    '| Phase | Wave | Files | Scope | Depends on | Done when |',
    '|---|---|---|---|---|---|',
    // Serial: one phase per wave, each depending on the previous. Parallel: two phases per wave, no edges.
    ...phases.map((paths, i) => `| ${i + 1} | ${parallel ? Math.floor(i / 2) + 1 : i + 1} | ${paths.join(', ')} | CAP-orders-p${i + 1} | ${parallel || i === 0 ? '—' : i} | npm test passes |`),
    ''
  ].join('\n');
}

const ROLES = {
  version: 1,
  source: 'test-client',
  enabled: true,
  roles: { backend_dev: { host: 'codex', model: 'gpt-5.6' }, qa: { host: 'claude', model: 'claude-sonnet-5' } },
  parallel: { max_concurrent_lanes: 2 },
  on_unavailable: 'ask'
};

async function write(root, rel, body) {
  const file = path.join(root, ...rel.split('/'));
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, body, 'utf8');
}

function stateAt(stage, classification, { current = false } = {}) {
  const sequence = ['product', 'sheldon', 'planner', 'dev', 'qa'];
  return JSON.stringify({
    version: 1,
    mode: 'feature',
    classification,
    sequence,
    current: current ? stage : null,
    next: current ? null : stage,
    completed: sequence.slice(0, sequence.indexOf(stage)),
    skipped: [],
    featureSlug: SLUG,
    detour: null,
    updatedAt: new Date().toISOString()
  });
}

async function project(tt, { classification = 'SMALL', plan = SMALL_PLAN, roles = null, current = false, prdContent = null } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-execution-scale-'));
  tt.after(() => fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  await write(dir, '.aioson/context/project.context.md', [
    '---', 'project_name: demo', 'project_type: web_app', 'profile: developer', 'framework: Node.js',
    'framework_installed: true', `classification: ${classification}`, 'interaction_language: en', 'conversation_language: en',
    'aioson_version: 1.60.0', '---', '# Context', ''
  ].join('\n'));
  await write(dir, '.aioson/context/features.md', `| slug | status | started | completed |\n|---|---|---|---|\n| ${SLUG} | in_progress | 2026-08-25 | |\n`);
  await write(dir, `.aioson/context/prd-${SLUG}.md`, prdContent || prd(classification));
  await approveAndSealSheldonReview(dir, SLUG);
  await write(dir, `.aioson/context/implementation-plan-${SLUG}.md`, plan);
  await write(dir, '.aioson/context/workflow.state.json', stateAt('planner', classification, { current }));
  await fs.copyFile(path.join(ROOT, 'template', '.aioson', 'agents', 'dev.md'), path.join(dir, '.aioson', 'agents', 'dev.md'));
  await fs.copyFile(path.join(ROOT, 'template', '.aioson', 'agents', 'qa.md'), path.join(dir, '.aioson', 'agents', 'qa.md'));
  if (roles) await write(dir, '.aioson/config/execution-roles.json', JSON.stringify(roles, null, 2));
  const previous = process.env.AIOSON_HOST_SIGNATURES;
  process.env.AIOSON_HOST_SIGNATURES = path.join(dir, 'signatures.json');
  tt.after(() => {
    if (previous === undefined) delete process.env.AIOSON_HOST_SIGNATURES;
    else process.env.AIOSON_HOST_SIGNATURES = previous;
  });
  return dir;
}

const activate = (dir, options = {}, log = logger) => runWorkflowNext({ args: [dir], options: { tool: 'codex', ...options }, logger: log, t });
const normalize = (prompt, dir) => String(prompt || '').split(dir).join('<dir>').split(dir.replace(/\\/g, '/')).join('<dir>');

test('planner activation names the locked state and the unlock step for MEDIUM features; MICRO and SMALL stay byte-identical and silent', async (tt) => {
  const state = (classification) => ({ mode: 'feature', featureSlug: SLUG, classification });

  const medium = await project(tt, { classification: 'MEDIUM' });
  const pin = await buildExecutionActivationContext(medium, state('MEDIUM'), 'planner');
  assert.match(pin, /^Orchestrated execution: NOT UNLOCKED here \(roles_file_missing; execution hosts installed on this machine: /);
  assert.match(pin, /aioson execution:offer \. --feature=orders --json/);
  assert.match(pin, /`plan\.scale`/);
  assert.match(pin, /onboarding\.next/);
  assert.match(pin, /now: aioson execution:configure \. --feature=orders --lanes=<lane-a,lane-b> --json\)\.$/);
  const activated = await activate(medium);
  assert.equal(activated.agent, 'planner');
  assert.match(activated.prompt, /Orchestrated execution: NOT UNLOCKED here \(roles_file_missing/);

  const disabled = await project(tt, { classification: 'MEDIUM', roles: { ...ROLES, enabled: false } });
  assert.match(await buildExecutionActivationContext(disabled, state('MEDIUM'), 'planner'), /NOT UNLOCKED here \(roles_disabled;.*now: aioson execution:configure/);

  const large = await project(tt, { classification: 'LARGE' });
  assert.match(await buildExecutionActivationContext(large, state('LARGE'), 'planner'), /NOT UNLOCKED here \(roles_file_missing/);

  for (const classification of ['MICRO', 'SMALL']) {
    const lean = await project(tt, { classification });
    assert.equal(await buildExecutionActivationContext(lean, state(classification), 'planner'), '');
    const result = await activate(lean);
    assert.doesNotMatch(result.prompt, /Orchestrated execution/);
  }
  // An unknown classification is treated as MICRO — the lean default — and stays silent.
  assert.equal(await buildExecutionActivationContext(medium, state(undefined), 'planner'), '');
  // Other stages never see the planner pin.
  assert.equal(await buildExecutionActivationContext(medium, state('MEDIUM'), 'dev'), '');
});

test('planner completion: a split-candidate plan with no recorded execution choice is a named advisory; a recorded single choice, a parallel lanes plan or a small plan is silent; a serial or over-ceiling orchestrated plan is named; never blocking', async (tt) => {
  const unrecorded = await project(tt, { classification: 'MEDIUM', plan: bigPlan() });
  const gate = await inspectExecutionGate(unrecorded, SLUG, 'planner');
  assert.equal(gate.blocking, false);
  assert.equal(gate.advisory, true);
  assert.equal(gate.mode, 'single');
  assert.equal(gate.check, 'execution_scale');
  assert.equal(gate.scale.files, 16);
  assert.equal(gate.scale.phases, 4);
  assert.equal(gate.scale.parallel_phases, 0);
  assert.match(gate.message, /^\[Execution Scale\] the plan for "orders" touches 16 file\(s\) \(16 new\) in 4 phase\(s\), 4 wave\(s\), 0 in parallel — a split candidate \(floor 12 files for one context\) — and records no execution choice\./);
  assert.match(gate.message, /`execution: single` in the plan frontmatter, or the `## Development execution lanes` table \+ aioson execution:configure \. --feature=orders --json/);
  // Scale still informs splitting; the starting recommendation stays single.
  assert.equal(gate.recommendation.choice, 'single');
  assert.match(gate.message, /Recommendation: single — .*recommended default/);
  assert.match(gate.message, /Scale and availability never change it/);
  // Only the planner reads the scale; DEV under single execution sees nothing.
  assert.deepEqual(await inspectExecutionGate(unrecorded, SLUG, 'dev'), { blocking: false, advisory: false });

  const recorded = await project(tt, { classification: 'MEDIUM', plan: bigPlan({ frontmatter: ['status: draft', 'execution: single'] }) });
  assert.deepEqual(await inspectExecutionGate(recorded, SLUG, 'planner'), { blocking: false, advisory: false });

  // The second incident: a lanes table AND one unit per wave — orchestrated in name only.
  const lanes = await project(tt, { classification: 'MEDIUM', plan: bigPlan({ lanes: true }) });
  const serial = await inspectExecutionGate(lanes, SLUG, 'planner');
  assert.equal(serial.blocking, false);
  assert.equal(serial.advisory, true);
  assert.equal(serial.mode, 'orchestrated');
  assert.equal(serial.check, 'execution_scale');
  assert.match(serial.message, /^\[Execution Scale\] the plan for "orders" is orchestrated but serial by construction \(2 lane\(s\), 4 wave\(s\) of one unit each, critical path 8 processes\)\. Cut the rows per lane\/surface inside a wave/);
  assert.match(serial.message, /lanes are the model axis, one `\{lane\}_dev` role each\.$/);
  // Two units per wave on disjoint files, every unit under the ceiling: silent.
  const parallel = await project(tt, { classification: 'MEDIUM', plan: bigPlan({ lanes: true, parallel: true }) });
  assert.deepEqual(await inspectExecutionGate(parallel, SLUG, 'planner'), { blocking: false, advisory: false });
  // Parallel but one unit above the ceiling: the unit is named with its numbers.
  const fat = await project(tt, { classification: 'MEDIUM', plan: bigPlan({ lanes: true, parallel: true, phases: [files('src/server', 11), files('src/client', 5), files('src/domain', 3), files('tests/integration', 2)] }) });
  const over = await inspectExecutionGate(fat, SLUG, 'planner');
  assert.equal(over.advisory, true);
  assert.match(over.message, /is orchestrated but over the unit ceiling \(10 files \/ 6 ACs per context\): phase 1 \(11 files, 0 ACs\)\./);
  assert.equal(over.scale.units[0].over_budget, true);
  assert.deepEqual(over.scale.units[0].reasons, ['files']);

  const small = await project(tt, { classification: 'MEDIUM' });
  assert.deepEqual(await inspectExecutionGate(small, SLUG, 'planner'), { blocking: false, advisory: false });

  // The floor is the environment's: raise it and the same plan is silent.
  const previous = process.env.AIOSON_EXECUTION_SPLIT_MIN_FILES;
  process.env.AIOSON_EXECUTION_SPLIT_MIN_FILES = '20';
  try {
    assert.deepEqual(await inspectExecutionGate(unrecorded, SLUG, 'planner'), { blocking: false, advisory: false });
  } finally {
    if (previous === undefined) delete process.env.AIOSON_EXECUTION_SPLIT_MIN_FILES;
    else process.env.AIOSON_EXECUTION_SPLIT_MIN_FILES = previous;
  }
});

// A PRD whose capability map covers the big plan's four phase CAPs, so the
// planner completion walks the whole gate chain instead of dying on an
// unrelated artifact check (the original fixture never reached the advisory).
const COMPLETION_PRD = [
  '---', 'classification: MEDIUM', 'product_scope: approved', 'prd_ready: approved', 'sheldon_review: pending', '---',
  '# Orders', '',
  '## Feature Capability Map', '',
  '| CAP | Promised outcome | Actor / trigger | Scope decision | Rationale |',
  '|---|---|---|---|---|',
  ...[1, 2, 3, 4].map((i) => `| CAP-orders-p${i} | Phase ${i} outcome delivered | User acts | required | Core promise |`),
  '',
  '## Acceptance Criteria', '',
  '| AC | CAP | Observable behavior | Evidence |',
  '|---|---|---|---|',
  ...[1, 2, 3, 4].map((i) => `| AC-orders-0${i} | CAP-orders-p${i} | Behavior ${i} is observable in the app | test |`),
  ''
].join('\n');

test('the advisory is printed at `workflow:next --complete=planner` AND travels in the payload', async (tt) => {
  const dir = await project(tt, {
    classification: 'MEDIUM',
    plan: bigPlan({ frontmatter: ['status: approved'] }),
    current: true,
    prdContent: COMPLETION_PRD
  });
  const lines = [];
  const capture = { log: (line) => lines.push(String(line)), error: (line) => lines.push(String(line)), warn: (line) => lines.push(String(line)) };
  const payload = await activate(dir, { complete: 'planner' }, capture);
  assert.ok(lines.some((line) => line.startsWith('[Execution Scale] the plan for "orders" touches 16 file(s)')), lines.join('\n'));
  assert.equal(payload.next, 'dev');
  // The same advisory is a payload field for --json callers (the Autopilot
  // engine reads the result object, never the logger).
  assert.equal(payload.execution.advisory, true);
  assert.equal(payload.execution.check, 'execution_scale');
  assert.match(payload.execution.message, /^\[Execution Scale\]/);
});

test('a manifest that declares orchestrated but fails validation blocks loudly — never a silent single-DEV fallthrough', async (tt) => {
  const dir = await project(tt, { classification: 'MEDIUM', plan: bigPlan() });
  await write(dir, `.aioson/context/agent-execution-${SLUG}.json`, JSON.stringify({
    version: 2,
    feature: SLUG,
    orchestration: { execution: 'orchestrated' },
    unknown_root_key: true
  }, null, 2));
  const gate = await inspectExecutionGate(dir, SLUG, 'planner');
  assert.equal(gate.blocking, true, JSON.stringify(gate));
  assert.equal(gate.plan, 'invalid_manifest');
  assert.match(gate.message, /^\[Execution Manifest BLOCKED\]/);
  const dev = await inspectExecutionGate(dir, SLUG, 'dev');
  assert.equal(dev.blocking, false, JSON.stringify(dev));
  assert.equal(dev.advisory, true);

  // A manifest that cannot even be parsed is named, not blocking: nothing
  // proves it ever declared orchestration.
  await write(dir, `.aioson/context/agent-execution-${SLUG}.json`, '{ not json');
  const corrupt = await inspectExecutionGate(dir, SLUG, 'planner');
  assert.equal(corrupt.blocking, false, JSON.stringify(corrupt));
  assert.equal(corrupt.advisory, true);
  assert.equal(corrupt.plan, 'invalid_manifest');
});

test('a BLOCKED planner gate reaches stdout through agent:done — the kernel\'s stderr redirect cannot swallow it', async (tt) => {
  const dir = await project(tt, {
    classification: 'MEDIUM',
    plan: bigPlan({ frontmatter: ['status: approved'] }),
    current: true,
    prdContent: COMPLETION_PRD
  });
  await write(dir, `.aioson/context/agent-execution-${SLUG}.json`, JSON.stringify({
    version: 2,
    feature: SLUG,
    orchestration: { execution: 'orchestrated' },
    unknown_root_key: true
  }, null, 2));
  const lines = [];
  const errors = [];
  const capture = { log: (l) => lines.push(String(l)), error: (l) => errors.push(String(l)), warn: () => {} };
  const { runAgentDone } = require('../src/commands/runtime');
  const result = await runAgentDone({ args: [dir], options: { agent: 'planner', summary: 'plan ready' }, logger: capture, t });
  assert.equal(result.ok, true, 'the session close itself never fails');
  assert.equal(result.auto_advance.skipped, 'workflow_next_failed');
  assert.equal(result.auto_advance.blocked, true);
  // The kernels' shutdown line appends `2>/dev/null || true`: stderr does not
  // exist for the agent. The block must be on stdout.
  assert.ok(lines.some((l) => l.includes('[Execution Manifest BLOCKED]')), `stdout:\n${lines.join('\n')}\nstderr:\n${errors.join('\n')}`);
});

// A 21-phase plan ran with `execution: single` recorded, and the choice silenced
// every scale check: the owner heard nothing until they asked 18 hours in.
test('a large plan is named to the owner whatever the choice: it never blocks, and its limits move by environment', async (tt) => {
  const manyPhases = Array.from({ length: 8 }, (_, i) => files(`src/p${i + 1}`, 1));
  const recorded = await project(tt, { classification: 'MEDIUM', plan: bigPlan({ frontmatter: ['status: draft', 'execution: single'], phases: manyPhases }) });
  const gate = await inspectExecutionGate(recorded, SLUG, 'planner');
  assert.equal(gate.blocking, false);
  assert.equal(gate.advisory, true);
  assert.equal(gate.check, 'execution_scale');
  assert.deepEqual(gate.large.limits, { min_phases: 8, min_files: 80 });
  assert.deepEqual(gate.large.reasons, ['phases']);
  assert.match(gate.message, /^\[Execution Scale\] The plan for "orders" has 8 phase\(s\) and 8 file\(s\), at or above the large-plan limit \(8 phases or 80 files\)\. Tell the owner before execution starts, and offer to cut it into deliveries/);
  assert.match(gate.message, /This blocks nothing and Autopilot does not pause for it\./);
  assert.match(gate.message, /aioson dev:progress \. --feature=orders/);
  assert.doesNotMatch(gate.message, /\bhours?\b|\bminutes?\b/i, 'an hour figure here would be invented');

  // Under the limit the recorded choice stays silent: one phase less.
  const below = await project(tt, { classification: 'MEDIUM', plan: bigPlan({ frontmatter: ['status: draft', 'execution: single'], phases: manyPhases.slice(1) }) });
  assert.deepEqual(await inspectExecutionGate(below, SLUG, 'planner'), { blocking: false, advisory: false });

  // Files alone cross it too, in a plan of few phases.
  const wide = await project(tt, { classification: 'MEDIUM', plan: bigPlan({ frontmatter: ['status: draft', 'execution: single'], phases: [files('src/a', 40), files('src/b', 40)] }) });
  const byFiles = await inspectExecutionGate(wide, SLUG, 'planner');
  assert.deepEqual(byFiles.large.reasons, ['files']);

  // No choice recorded: the existing question stays, and the notice joins it.
  const unrecorded = await project(tt, { classification: 'MEDIUM', plan: bigPlan({ phases: [files('src/a', 40), files('src/b', 40)] }) });
  const both = await inspectExecutionGate(unrecorded, SLUG, 'planner');
  assert.match(both.message, /and records no execution choice\. Ask the owner once/);
  assert.match(both.message, /Tell the owner before execution starts/);

  // No choice and below the split floor: the notice alone.
  const fewFiles = await project(tt, { classification: 'MEDIUM', plan: bigPlan({ phases: manyPhases }) });
  assert.match((await inspectExecutionGate(fewFiles, SLUG, 'planner')).message, /^\[Execution Scale\] The plan for "orders" has 8 phase/);

  const previous = process.env.AIOSON_EXECUTION_LARGE_MIN_PHASES;
  process.env.AIOSON_EXECUTION_LARGE_MIN_PHASES = '9';
  try {
    assert.deepEqual(await inspectExecutionGate(recorded, SLUG, 'planner'), { blocking: false, advisory: false });
  } finally {
    if (previous === undefined) delete process.env.AIOSON_EXECUTION_LARGE_MIN_PHASES;
    else process.env.AIOSON_EXECUTION_LARGE_MIN_PHASES = previous;
  }
});

test('the large-plan notice reaches the planner and the owner without moving the stage', async (tt) => {
  const manyPhases = Array.from({ length: 8 }, (_, i) => files(`src/p${i + 1}`, 1));
  const plan = bigPlan({ frontmatter: ['status: approved', 'execution: single'], phases: manyPhases });
  const capRow = (i) => `| CAP-orders-p${i} | Phase ${i} outcome delivered | User acts | required | Core promise |`;
  const acRow = (i) => `| AC-orders-0${i} | CAP-orders-p${i} | Behavior ${i} is observable in the app | test |`;
  const prdContent = COMPLETION_PRD
    .replace(capRow(4), [4, 5, 6, 7, 8].map(capRow).join('\n'))
    .replace(acRow(4), [4, 5, 6, 7, 8].map(acRow).join('\n'));
  const dir = await project(tt, { classification: 'MEDIUM', plan, current: true, prdContent });
  const lines = [];
  const capture = { log: (line) => lines.push(String(line)), error: (line) => lines.push(String(line)), warn: (line) => lines.push(String(line)) };
  const payload = await activate(dir, { complete: 'planner' }, capture);
  assert.equal(payload.next, 'dev', 'Autopilot does not pause for it');
  assert.equal(payload.execution.advisory, true);
  assert.deepEqual(payload.execution.large.reasons, ['phases']);
  assert.ok(lines.some((line) => /^\[Execution Scale\] The plan for "orders" has 8 phase/.test(line)), lines.join('\n'));

  const offerLines = [];
  const { runExecution } = require('../src/commands/execution');
  const offer = await runExecution({ args: [dir], options: { sub: 'offer', feature: SLUG }, logger: { log: (line) => offerLines.push(String(line)), error() {} } });
  assert.deepEqual(offer.plan.large_plan.reasons, ['phases']);
  assert.ok(offerLines.some((line) => /large plan: The plan for "orders" has 8 phase/.test(line)), offerLines.join('\n'));
});

test('the planner kernel, its reference and the Autopilot doc carry the relay', async () => {
  const read = (rel) => fs.readFile(path.join(ROOT, rel), 'utf8');
  assert.match(await read('template/.aioson/agents/planner.md'), /When `plan\.large_plan` is set, give the owner its numbers before handoff/);
  const reference = await read('template/.aioson/skills/process/aioson-spec-driven/references/planner.md');
  assert.match(reference, /AIOSON_EXECUTION_LARGE_MIN_PHASES/);
  assert.match(reference, /Never turn the numbers into hours/);
  for (const rel of ['template/.aioson/docs/autopilot-handoff.md', '.aioson/docs/autopilot-handoff.md']) {
    assert.match(await read(rel), /## Notices that do not stop[\s\S]*`owner_notices`/);
  }
});
