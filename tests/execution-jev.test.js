'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createExecutionJev, acceptanceText, deltaChanges, lowerEffort } = require('../src/agent-execution/execution-jev');
const { applyDecision } = require('../src/lib/jev-judgment');

const PRD = [
  '| AC | CAP | Observable behavior | Evidence |',
  '|---|---|---|---|',
  '| AC-x-01 | CAP-x-ui | The screen lists orders | smoke |',
  '| AC-x-02 | CAP-x-api | POST /orders stores an order | test |'
].join('\n');
const PLAN_MD = [
  '## Implementation Delta',
  '| CAP | Action | Existing evidence | Exact paths | Required change |',
  '|---|---|---|---|---|',
  '| CAP-x-api | create | none | src/api/orders.ts | `createOrder(input)` persists and returns the order |',
  '| CAP-x-ui | modify | list exists | src/ui/Orders.tsx, src/ui/Row.tsx | renders rows from `createOrder` results |',
  '| CAP-x-ui | bogus | ignored | src/ui/Ignored.tsx | not an action |'
].join('\n');
const PLAN = { source: { prd: 'prd.md', plan: 'plan.md' } };
const UI = { id: 'phase-1-frontend', lane: 'frontend', scope: 'CAP-x-ui (AC-x-01)', files: ['src/ui/Orders.tsx'], caps: ['CAP-x-ui'], acs: ['AC-x-01'] };
const API = { id: 'phase-2-backend', lane: 'backend', scope: 'CAP-x-api (AC-x-02)', files: ['src/api/orders.ts'], caps: ['CAP-x-api'], acs: ['AC-x-02'] };
const MAX_QA = { host: 'codex', model: 'gpt-6-luna', reasoning_effort: 'max' };

function jevWith(choose, { confidence = 0.9, status = 'ready', fail = null } = {}) {
  const calls = [];
  const judge = async ({ spec }) => {
    calls.push(spec);
    if (fail) throw new Error(fail);
    const [id, question] = Object.entries(spec.questions)[0];
    const options = Object.keys(question.criteria);
    const choice = choose(spec);
    const answers = { [id]: { type: 'choice', choice, confidence, probabilities: Object.fromEntries(options.map((o) => [o, o === choice ? confidence : (1 - confidence) / (options.length - 1)])) } };
    return { ok: true, answers, decision: applyDecision(spec, answers) };
  };
  const jev = createExecutionJev({ projectDir: '.', plan: PLAN, judge, loadConfig: () => ({ status }), readFile: async (file) => (file.endsWith('plan.md') ? PLAN_MD : PRD) });
  return { jev, calls };
}

test('acceptanceText reads the observable behaviour of each AC row', () => {
  assert.deepEqual(acceptanceText(PRD), { 'AC-x-01': 'The screen lists orders', 'AC-x-02': 'POST /orders stores an order' });
});

test('deltaChanges maps each planned path to its action and required change', () => {
  const changes = deltaChanges(PLAN_MD);
  assert.deepEqual(changes['src/api/orders.ts'], { action: 'create', change: '`createOrder(input)` persists and returns the order' });
  assert.equal(changes['src/ui/Row.tsx'].action, 'modify', 'a multi-path cell gives the change to every path');
  assert.equal(changes['src/ui/Ignored.tsx'], undefined, 'a row without a known action is not a delta row');
});

test('shared-file evidence follows the unit capability rather than the first delta row', async () => {
  const planText = [
    '| CAP | Action | Existing evidence | Exact paths | Required change |',
    '|---|---|---|---|---|',
    '| CAP-x-gaps | modify | service | src/api/shared.ts | Record capability gaps |',
    '| CAP-x-guide | modify | service | src/api/shared.ts | Read direction guide and emit consulted event |'
  ].join('\n');
  const scoped = deltaChanges(planText, ['CAP-x-guide']);
  assert.equal(scoped['src/api/shared.ts'].change, 'Read direction guide and emit consulted event');
  const calls = [];
  const jev = createExecutionJev({
    projectDir: '.', plan: PLAN, loadConfig: () => ({ status: 'ready' }),
    readFile: async (file) => file.endsWith('plan.md') ? planText : PRD,
    judge: async ({ spec }) => { calls.push(spec); return { ok: false, status: 'test_observation' }; }
  });
  await jev.startOrder(
    { ...API, caps: ['CAP-x-gaps'], files: ['src/api/shared.ts'] },
    { ...UI, caps: ['CAP-x-guide'], files: ['src/api/shared.ts'] }
  );
  assert.equal(calls[0].state.earlier.changes[0].change, 'Record capability gaps');
  assert.equal(calls[0].state.later.changes[0].change, 'Read direction guide and emit consulted event');
});

test('the review-order judgment sees what each file is meant to gain', async () => {
  const { jev, calls } = jevWith(() => 'coupled');
  await jev.reviewOrder(API, UI);
  assert.deepEqual(calls[0].state.previous.changes, [{ path: 'src/api/orders.ts', action: 'create', change: '`createOrder(input)` persists and returns the order' }]);
  assert.match(calls[0].state.next.changes[0].change, /createOrder/);
});

test('lowerEffort only lowers, never below high, and only to an effort the host accepts', () => {
  assert.equal(lowerEffort('codex', 'max'), 'high');
  assert.equal(lowerEffort('codex', 'xhigh'), 'high');
  assert.equal(lowerEffort('codex', 'high'), null);
  assert.equal(lowerEffort('codex', 'medium'), null);
  assert.equal(lowerEffort('codex', null), null);
});

test('review depth: standard lowers to high and the judgment carries the PRD behaviour', async () => {
  const { jev, calls } = jevWith(() => 'standard');
  const verdict = await jev.reviewDepth(UI, MAX_QA);
  assert.deepEqual([verdict.choice, verdict.effort, verdict.source], ['standard', 'high', 'jev']);
  assert.equal(calls[0].state.unit.acceptance[0].behaviour, 'The screen lists orders');
  assert.equal(calls[0].state.unit.files[0], 'src/ui/Orders.tsx');
});

test('review depth floors: risky paths and efforts at or below high never ask', async () => {
  const { jev, calls } = jevWith(() => 'standard');
  const migration = await jev.reviewDepth({ ...API, files: ['apps/core/prisma/migrations/0027/migration.sql'] }, MAX_QA);
  assert.deepEqual([migration.effort, migration.source], ['max', 'floor']);
  assert.match(migration.reason, /^risky_path:/);
  const installer = await jev.reviewDepth({ ...API, files: ['scripts/install.sh'] }, MAX_QA);
  assert.equal(installer.source, 'floor');
  const alreadyHigh = await jev.reviewDepth(UI, { ...MAX_QA, reasoning_effort: 'high' });
  assert.deepEqual([alreadyHigh.effort, alreadyHigh.source], ['high', 'floor']);
  assert.equal(calls.length, 0);
});

test('review depth falls back to the configured effort when Jev is uncertain, unconfigured or failing', async () => {
  const uncertain = await jevWith(() => 'standard', { confidence: 0.5 }).jev.reviewDepth(UI, MAX_QA);
  assert.deepEqual([uncertain.effort, uncertain.source, uncertain.reason], ['max', 'fallback', 'uncertain']);
  const off = await jevWith(() => 'standard', { status: 'disabled' }).jev.reviewDepth(UI, MAX_QA);
  assert.deepEqual([off.effort, off.reason], ['max', 'jev_disabled']);
  const broken = await jevWith(() => 'standard', { fail: 'network down' }).jev.reviewDepth(UI, MAX_QA);
  assert.deepEqual([broken.effort, broken.source], ['max', 'fallback']);
});

test('triage: only environment failure kinds are judged; verdict failures and errors stay with a person', async () => {
  const { jev, calls } = jevWith(() => 'transient');
  assert.equal((await jev.triage(API, 'dev', { kind: 'crashed', reason: 'crash', error: 'ECONNRESET' })).choice, 'retry');
  assert.equal((await jev.triage(API, 'qa', { kind: 'failed', verdict: 'FAIL' })).choice, 'human');
  assert.equal((await jev.triage(API, 'dev', { kind: 'blocked' })).source, 'floor');
  assert.equal(calls.length, 1, 'a verdict failure never reaches Jev');
  const broken = await jevWith(() => 'transient', { fail: 'timeout' }).jev.triage(API, 'dev', { kind: 'crashed' });
  assert.equal(broken.choice, 'human');
});

test('review order: independent → the reviews may overlap; coupled or uncertain → the review waits', async () => {
  assert.equal((await jevWith(() => 'independent').jev.reviewOrder(API, UI)).wait, false);
  assert.equal((await jevWith(() => 'coupled').jev.reviewOrder(API, UI)).wait, true);
  assert.equal((await jevWith(() => 'independent', { confidence: 0.6 }).jev.reviewOrder(API, UI)).wait, true);
  assert.equal((await jevWith(() => 'independent', { status: 'invalid' }).jev.reviewOrder(API, UI)).wait, true);
});

test('start order: independent → start before the earlier unit; depends, uncertain (below 0.8) or unavailable → keep the plan order', async () => {
  assert.equal((await jevWith(() => 'independent').jev.startOrder(API, UI)).wait, false);
  assert.equal((await jevWith(() => 'depends').jev.startOrder(API, UI)).wait, true);
  assert.equal((await jevWith(() => 'independent', { confidence: 0.75 }).jev.startOrder(API, UI)).wait, true);
  assert.equal((await jevWith(() => 'independent', { status: 'invalid' }).jev.startOrder(API, UI)).wait, true);
});
