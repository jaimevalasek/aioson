'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { inferDependencies, reduceTransitive, graphWaves, projectMakespan, rowsOf } = require('../src/agent-execution/dependency-inference');
const { applyDecision } = require('../src/lib/jev-judgment');

// One backend lane written as a queue: a → b → c → d. Really: b and c build on a,
// d is independent, and Jev is unsure about c ← b.
const PLAN = [
  '## Implementation Delta',
  '| CAP | Action | Existing evidence | Exact paths | Required change |',
  '|---|---|---|---|---|',
  '| CAP-x-api | create | none | src/api/store.ts | `Store.save()` persists orders |',
  '| CAP-x-api | create | none | src/api/orders.ts | POST /orders calls `Store.save()` |',
  '',
  '## Development execution lanes',
  '| Lane | Exact write paths | Integration owner |',
  '|---|---|---|',
  '| backend | src/api/**, tests/api/** | dev |',
  '',
  '## Execution Sequence',
  '| Phase | Wave | Files | Scope | Done when |',
  '|---|---|---|---|---|',
  '| a | 1 | src/api/store.ts | CAP-x-api (AC-x-01) | store test passes |',
  '| b | 2 | src/api/orders.ts | CAP-x-api (AC-x-02) | orders test passes |',
  '| c | 3 | src/api/report.ts | CAP-x-api (AC-x-03) | report test passes |',
  '| d | 4 | src/api/health.ts | CAP-x-api (AC-x-04) | health test passes |',
  ''
].join('\n');
const PRD = '| AC | CAP | Observable behavior | Evidence |\n|---|---|---|---|\n| AC-x-01 | CAP-x-api | Orders are stored | test |\n';
const files = { 'implementation-plan-orders.md': PLAN, 'prd-orders.md': PRD };
const readFile = async (file) => {
  const name = file.split(/[\\/]/).pop();
  if (!files[name]) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
  return files[name];
};

const VERDICTS = { 'a>b': 'depends', 'a>c': 'depends', 'b>c': 'unsure', 'a>d': 'independent', 'b>d': 'independent', 'c>d': 'independent' };
function judge({ spec }) {
  const key = `${spec.state.earlier.id}>${spec.state.later.id}`;
  const verdict = VERDICTS[key];
  const choice = verdict === 'independent' ? 'independent' : 'depends';
  const confidence = verdict === 'unsure' ? 0.5 : 0.9;
  const answers = { needs: { type: 'choice', choice, confidence, probabilities: { depends: choice === 'depends' ? confidence : 1 - confidence, independent: choice === 'independent' ? confidence : 1 - confidence } } };
  return { ok: true, answers, decision: applyDecision(spec, answers) };
}

test('reduceTransitive keeps only direct dependencies; graphWaves gives each row its depth', () => {
  const deps = new Map([['a', []], ['b', ['a']], ['c', ['a', 'b']]]);
  assert.deepEqual(reduceTransitive(deps).get('c'), ['b']);
  const waves = graphWaves([{ phase: 'a' }, { phase: 'b' }, { phase: 'c' }, { phase: 'd' }], deps);
  assert.deepEqual([...waves.entries()], [['a', 1], ['b', 2], ['c', 3], ['d', 1]]);
});

test('without a ready Jev the command returns the setup steps, never a guess', async () => {
  const result = await inferDependencies({ projectDir: '/p', feature: 'orders', readFile, judge: () => assert.fail('no judgment without Jev'), loadConfig: () => ({ status: 'invalid', reason: 'api_key_env_unset', keyName: 'OPENROUTER_API_KEY' }) });
  assert.equal(result.status, 'jev_unready');
  assert.equal(result.config_reason, 'api_key_env_unset');
  assert.match(result.setup.join('\n'), /OPENROUTER_API_KEY=sk-or-v1-.*never paste it into a chat/);
  assert.match(result.setup.join('\n'), /"jev": \{ "enabled": true/);
  assert.match(result.setup.join('\n'), /aioson jev:judge \. --check/);
});

test('with Jev the plan gets minimal (dev) cells, earliest waves and the pairs to decide', async () => {
  const result = await inferDependencies({ projectDir: '/p', feature: 'orders', readFile, judge, loadConfig: () => ({ status: 'ready' }), devMinutes: 2, qaMinutes: 3 });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(result.pairs, { judged: 6, depends: 2, independent: 3, uncertain: 1 });
  const row = Object.fromEntries(result.units.map((unit) => [unit.phase, unit]));
  assert.equal(row.b.depends_on_cell, 'a (dev)');
  assert.equal(row.c.depends_on_cell, 'a (dev)');
  assert.deepEqual(row.c.to_decide, ['b'], 'the unsure pair is surfaced, and counted as a dependency for the wave');
  assert.equal(row.c.suggested_wave, 3);
  assert.equal(row.d.depends_on_cell, '—');
  assert.equal(row.d.suggested_wave, 1, 'an independent unit leaves the queue');
  const p = result.projection;
  assert.ok(p.suggested_uncertain_as_dependency.minutes < p.as_written.minutes, JSON.stringify(p));
  assert.ok(p.suggested_confirmed_only.minutes <= p.suggested_uncertain_as_dependency.minutes);
});

test('the judgment sees each file\'s planned change, never file contents', async () => {
  const seen = [];
  await inferDependencies({ projectDir: '/p', feature: 'orders', readFile, loadConfig: () => ({ status: 'ready' }), judge: (input) => { seen.push(input.spec); return judge(input); } });
  const ab = seen.find((spec) => spec.state.earlier.id === 'a' && spec.state.later.id === 'b');
  assert.deepEqual(ab.state.later.changes, [{ path: 'src/api/orders.ts', action: 'create', change: 'POST /orders calls `Store.save()`' }]);
  assert.equal(ab.state.earlier.acceptance[0].behaviour, 'Orders are stored');
});

const CROSS_LANE_PLAN = [
  '## Development execution lanes',
  '| Lane | Exact write paths | Integration owner |',
  '|---|---|---|',
  '| backend | src/api/** | dev |',
  '| frontend | src/ui/** | dev |',
  '',
  '## Execution Sequence',
  '| Phase | Wave | Depends on | Files | Scope | Done when |',
  '|---|---|---|---|---|---|',
  '| 1-backend | 1 | — | src/api/store.ts | CAP-x-api | store passes |',
  '| 1-frontend | 1 | — | src/ui/Types.ts | CAP-x-api | types pass |',
  '| 2-frontend | 2 | 1-backend (dev), 1-frontend (qa) | src/ui/Orders.tsx | CAP-x-api | orders pass |',
  '| 3-integration | 3 | 2-frontend | .aioson/plans/orders/harness-contract.json | CAP-x-api | integration passes |',
  ''
].join('\n');

function planReader(plan) {
  return async (file) => file.endsWith('implementation-plan-orders.md') ? plan : PRD;
}

test('dependency suggestions preserve explicit cross-lane, QA and integration prerequisites', async () => {
  const result = await inferDependencies({
    projectDir: '/p', feature: 'orders', readFile: planReader(CROSS_LANE_PLAN),
    loadConfig: () => ({ status: 'ready' }),
    judge: ({ spec }) => {
      const answers = { needs: { choice: 'independent', confidence: 0.95, probabilities: { independent: 0.95, depends: 0.05 } } };
      return { ok: true, decision: applyDecision(spec, answers) };
    }
  });
  assert.equal(result.ok, true);
  const rows = Object.fromEntries(result.units.map((unit) => [unit.phase, unit]));
  assert.deepEqual(rows['2-frontend'].depends_on, ['1-backend', '1-frontend']);
  assert.equal(rows['2-frontend'].depends_on_cell, '1-backend (dev), 1-frontend (qa)');
  assert.equal(rows['2-frontend'].suggested_wave, 2);
  assert.deepEqual(rows['3-integration'].depends_on, ['2-frontend']);
  assert.equal(rows['3-integration'].depends_on_cell, '2-frontend (qa)');
  assert.equal(rows['3-integration'].suggested_wave, 3);
  assert.deepEqual(rows['3-integration'].to_decide, []);
});

test('numeric phase prerequisites retain all producers in the phase', async () => {
  const plan = CROSS_LANE_PLAN.replace('1-backend (dev), 1-frontend (qa)', '1 (dev)');
  const result = await inferDependencies({
    projectDir: '/p', feature: 'orders', readFile: planReader(plan),
    loadConfig: () => ({ status: 'ready' }), judge
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.units.find((unit) => unit.phase === '2-frontend').depends_on, ['1-backend', '1-frontend']);
});

test('an unresolved declared prerequisite fails before any semantic judgment', async () => {
  const result = await inferDependencies({
    projectDir: '/p', feature: 'orders',
    readFile: planReader(CROSS_LANE_PLAN.replace('2-frontend | .aioson', 'missing-unit | .aioson')),
    loadConfig: () => ({ status: 'ready' }), judge: () => assert.fail('invalid plan must not call Jev')
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'dependency_invalid');
  assert.match(result.message, /missing-unit/);
});

test('suggested duration keeps explicit after-QA gates', () => {
  const rows = rowsOf(CROSS_LANE_PLAN);
  const deps = new Map(rows.map((row) => [row.phase, row.depends.map((dep) => dep.phase)]));
  const measured = projectMakespan(rows, deps, { devMinutes: 2, qaMinutes: 3 });
  assert.equal(measured.minutes, 15, 'frontend waits for types QA and integration waits for frontend QA');
  assert.equal(projectMakespan(rows, null, { devMinutes: 2, qaMinutes: 3 }).minutes, 15, 'as-written projection retains the same declared gates');
});

test('transitive DEV prerequisites cannot erase an explicit QA prerequisite', async () => {
  const plan = CROSS_LANE_PLAN.replace('2-frontend | .aioson', '1-backend (qa), 2-frontend (dev) | .aioson');
  const result = await inferDependencies({
    projectDir: '/p', feature: 'orders', readFile: planReader(plan),
    loadConfig: () => ({ status: 'ready' }), judge
  });
  assert.equal(result.ok, true);
  const integration = result.units.find((unit) => unit.phase === '3-integration');
  assert.equal(integration.depends_on_cell, '1-backend (qa), 2-frontend (dev)');
});

test('dependency inference selects each unit capability for a shared file', async () => {
  const plan = PLAN.replace(
    '| CAP-x-api | create | none | src/api/store.ts | `Store.save()` persists orders |',
    '| CAP-x-other | modify | old service | src/api/store.ts | Unrelated old change |\n| CAP-x-api | create | none | src/api/store.ts | `Store.save()` persists orders |'
  );
  const calls = [];
  await inferDependencies({
    projectDir: '/p', feature: 'orders', readFile: planReader(plan), loadConfig: () => ({ status: 'ready' }),
    judge: (input) => { calls.push(input.spec); return judge(input); }
  });
  const evidence = calls.find((spec) => spec.state.earlier.id === 'a').state.earlier;
  assert.equal(evidence.changes[0].change, '`Store.save()` persists orders');
});
