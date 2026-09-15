'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { externalRepairPaths, scopedRepairEvidence, contractRepairTarget, applyContractRepair, repairOutcomeFromState } = require('../src/agent-execution/execution-contract-repair');

test('contract routing refuses unstructured evidence, unrelated paths, exhausted budgets and delivered consumers', () => {
  const producer = { id: 'api', wave: 1, lane: 'backend', owner: 'lane', files: ['src/api.ts'], depends_on: [] };
  const consumer = { id: 'ui', wave: 2, lane: 'frontend', owner: 'lane', files: ['src/ui.ts'], depends_on: [{ unit: 'api' }] };
  const plan = { units: [producer, consumer], lanes: { backend: { qa: { max_rework_rounds: 2 } } } };
  const state = { units: { api: { status: 'passed', qa: { status: 'passed' } }, ui: { status: 'running' } } };
  const outcome = { kind: 'blocked', findings: [{ path: 'src/api.ts:12', summary: 'Missing field' }], messages: [{ to: 'integration', kind: 'contract_change', paths: ['src/api.ts'] }] };
  assert.equal(contractRepairTarget(plan, state, 'ui', outcome).unit, 'api');
  assert.equal(contractRepairTarget(plan, state, 'ui', { ...outcome, messages: [] }), null);
  assert.equal(contractRepairTarget(plan, state, 'ui', { ...outcome, messages: [{ to: 'integration', kind: 'contract_change', paths: ['../secret'] }] }), null);
  assert.equal(contractRepairTarget({ ...plan, units: [producer, { ...consumer, depends_on: [] }] }, state, 'ui', outcome), null);
  assert.equal(contractRepairTarget(plan, { units: { ...state.units, api: { ...state.units.api, contract_repairs: 2 } } }, 'ui', outcome), null);
  const delivered = { id: 'export', wave: 2, lane: 'frontend', owner: 'lane', files: ['src/export.ts'], depends_on: [{ unit: 'api' }] };
  assert.equal(contractRepairTarget({ ...plan, units: [...plan.units, delivered] }, { units: { ...state.units, export: { status: 'passed' } } }, 'ui', outcome), null);
});

test('continuous routing accepts a failed note, selects the latest transitive owner and invalidates affected deliveries', () => {
  const old = { id: 'render-base', wave: 1, lane: 'backend', owner: 'lane', files: ['src/render.ts'], depends_on: [] };
  const latest = { id: 'render-effects', wave: 4, lane: 'backend', owner: 'lane', files: ['src/render.ts'], depends_on: [{ unit: 'render-base' }] };
  const exported = { id: 'export', wave: 5, lane: 'backend', owner: 'lane', files: ['src/export.ts'], depends_on: [{ unit: 'render-effects' }] };
  const consumer = { id: 'journey', wave: 6, lane: 'frontend', owner: 'lane', files: ['tests/journey.ts'], depends_on: [{ unit: 'export' }] };
  const plan = { units: [old, latest, exported, consumer], lanes: { backend: { qa: { max_rework_rounds: 3 } } } };
  const passed = (id, wave, lane) => ({ id, wave, lane, owner: 'lane', status: 'passed', dev: { status: 'passed', report: `${id}.json` }, qa: { status: 'passed', report: `${id}-qa.json` } });
  const state = { units: {
    'render-base': passed('render-base', 1, 'backend'),
    'render-effects': passed('render-effects', 4, 'backend'),
    export: passed('export', 5, 'backend'),
    journey: { id: 'journey', wave: 6, lane: 'frontend', owner: 'lane', status: 'running', dev: { status: 'failed', report: 'journey.json' }, qa: { status: 'pending' } }
  } };
  const outcome = {
    kind: 'failed',
    findings: [{ path: 'tests/journey.ts:196', summary: 'Shared renderer keeps an invalid SAR' }],
    messages: [{ to: 'lane:backend', kind: 'note', paths: ['src/render.ts', 'tests/journey.ts'], text: 'Repair the shared renderer' }]
  };
  assert.deepEqual(externalRepairPaths(plan, 'journey', outcome), ['src/render.ts']);
  assert.equal(contractRepairTarget(plan, state, 'journey', outcome), null, 'bounded mode does not reopen delivered descendants');
  const repair = contractRepairTarget(plan, state, 'journey', outcome, true);
  assert.equal(repair.unit, 'render-effects');
  assert.equal(repair.contract_repair_limit, 3);
  assert.deepEqual(repair.affected, ['render-effects', 'export', 'journey']);
  assert.equal(applyContractRepair(plan, state, 'journey', repair, '2026-09-14T10:00:00.000Z'), true);
  assert.equal(state.units['render-base'].status, 'passed');
  for (const id of ['render-effects', 'export', 'journey']) {
    assert.equal(state.units[id].status, 'pending');
    assert.equal(state.units[id].dev.status, 'pending');
    assert.equal(state.units[id].qa.status, 'pending');
    assert.equal(state.units[id].invalidations.length, 1);
  }
  assert.equal(state.units['render-effects'].contract_repairs, 1);
  assert.equal(state.units['render-effects'].rework.history.at(-1).source, 'downstream_contract_repair');
  assert.equal(state.units.export.retry_context.dev.reason, 'upstream_contract_repair');
  assert.deepEqual(state.contract_repairs[0].affected, ['render-effects', 'export', 'journey']);
  state.units['render-effects'].status = 'passed';
  state.units['render-effects'].qa = { status: 'passed' };
  state.units['render-effects'].contract_repairs = 3;
  assert.equal(contractRepairTarget(plan, state, 'journey', outcome, true), null, 'continuous routing also has a repeated contract-repair circuit breaker');
});

test('continuous routing returns a shared-check failure to its unique compiled owner without a cross-lane edge', () => {
  const producer = { id: 'render', wave: 3, lane: 'backend', owner: 'lane', files: ['src/domain/renderPlan.ts'], depends_on: [] };
  const consumer = { id: 'drag-style', wave: 3, lane: 'frontend', owner: 'lane', files: ['src/client/drag.ts'], depends_on: [] };
  const later = { id: 'publish', wave: 5, lane: 'backend', owner: 'lane', files: ['src/publish.ts'], depends_on: [{ unit: 'render' }] };
  const plan = { units: [producer, consumer, later], lanes: { backend: { qa: { max_rework_rounds: 3 } } } };
  const state = { units: {
    render: { id: 'render', owner: 'lane', status: 'decision_required', dev: { status: 'unavailable', reason: 'unproductive_loop' }, qa: { status: 'pending' }, pending_decision: { reason: 'unproductive_loop' } },
    'drag-style': { id: 'drag-style', owner: 'lane', status: 'running', dev: { status: 'blocked', report: 'drag.json' }, qa: { status: 'pending' } },
    publish: { id: 'publish', owner: 'lane', status: 'pending', dev: { status: 'pending' }, qa: { status: 'pending' } }
  } };
  const outcome = {
    kind: 'blocked',
    findings: [{ path: 'src/domain/renderPlan.ts:417', summary: 'Unexpected token in shared typecheck' }],
    messages: [{ to: 'orchestrator', kind: 'contract_change', paths: ['src/domain/renderPlan.ts'], text: 'Return the syntax defect to its owner' }]
  };

  assert.equal(contractRepairTarget(plan, state, 'drag-style', outcome), null, 'bounded mode still requires an explicit dependency');
  const repair = contractRepairTarget(plan, state, 'drag-style', outcome, true);
  assert.equal(repair.unit, 'render');
  assert.equal(repair.target_status, 'decision_required');
  assert.deepEqual(repair.affected, ['render', 'publish', 'drag-style']);
  assert.equal(applyContractRepair(plan, state, 'drag-style', repair), true);
  assert.equal(state.units.render.status, 'pending');
  assert.equal(state.units.render.pending_decision, null);
  assert.equal(state.units.render.retry_context.dev.reason, 'downstream_contract_repair');
  assert.deepEqual(state.units['drag-style'].repair_dependencies, ['render']);
  assert.deepEqual(state.units.publish.repair_dependencies, ['render']);
  assert.equal(applyContractRepair(plan, state, 'drag-style', repair), true);
  assert.equal(state.units.render.contract_repairs, 1, 'the same pending owner repair is coalesced instead of consuming another recovery round');
  assert.equal(state.contract_repairs.at(-1).coalesced, true);
});

test('persisted recovery extracts cross-unit evidence from the last rework without trusting prose', () => {
  const unit = { rework: { history: [{
    source: 'continuous_recovery',
    findings: [{ path: 'tests/journey.ts:20', summary: 'renderer failed' }],
    dev: { messages: [{ to: 'lane:backend', kind: 'note', paths: ['src/render.ts'] }] }
  }] } };
  assert.deepEqual(repairOutcomeFromState(unit), {
    kind: 'failed',
    reason: 'continuous_recovery',
    findings: unit.rework.history[0].findings,
    messages: unit.rework.history[0].dev.messages
  });
  unit.invalidations = [{ at: '2026-09-14T11:00:00.000Z', producer: 'render-effects' }];
  unit.rework.history[0].at = '2026-09-14T10:00:00.000Z';
  assert.equal(repairOutcomeFromState(unit), null, 'an already-routed report is not replayed on another resume');
  assert.equal(repairOutcomeFromState({ rework: { history: [{ findings: [{ summary: 'only prose' }] }] } }), null);
});

test('contract repair gives the selected producer only its own failure evidence', () => {
  const outcome = {
    findings: [
      { id: 'consumer-file', location: '.aioson/plans/feature/harness-contract.json', text: 'Consumer file is missing' },
      { id: 'producer-typecheck', location: 'src/server/export.ts:67', text: 'Typecheck fails at the producer boundary' },
      { id: 'other-tests', location: 'tests/a.ts, tests/b.ts', text: 'Several consumer tests fail' }
    ],
    messages: [{
      to: 'integration',
      kind: 'note',
      text: 'Create the consumer contract and repair export',
      paths: ['.aioson/plans/feature/harness-contract.json', 'src/server/export.ts']
    }]
  };
  assert.deepEqual(scopedRepairEvidence(outcome, ['src/server/export.ts']), {
    findings: [outcome.findings[1]],
    messages: [{
      ...outcome.messages[0],
      text: 'Downstream contract repair requested for src/server/export.ts; use the scoped findings as the failure evidence.',
      paths: ['src/server/export.ts']
    }]
  });
  const observationOnly = { ...outcome, findings: [outcome.findings[2]] };
  assert.deepEqual(scopedRepairEvidence(observationOnly, ['src/server/export.ts']).findings, observationOnly.findings, 'consumer observations remain when no finding points directly at the producer');
});
