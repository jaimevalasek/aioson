'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { externalRepairPaths, scopedRepairEvidence, contractRepairResolution, contractRepairTarget, deferContractRepair, applyContractRepair, repairOutcomeFromState, reconcileDeferredContractRepairs } = require('../src/agent-execution/execution-contract-repair');

test('deferred repair releases a delivered descendant whose review waits for the failed consumer', () => {
  const plan = { units: [
    { id: 'producer', lane: 'backend', wave: 1, owner: 'lane', files: ['src/producer.js'] },
    { id: 'consumer', lane: 'frontend', wave: 2, owner: 'lane', files: ['src/consumer.js'] },
    { id: 'descendant', lane: 'backend', wave: 3, owner: 'lane', files: ['src/descendant.js'], depends_on: [{ unit: 'producer' }] }
  ], lanes: { backend: { qa: { max_rework_rounds: 2 } } } };
  const outcome = { kind: 'failed', findings: [{ path: 'src/producer.js', severity: 'high', summary: 'Shared contract failed' }], messages: [{ to: 'unit:producer', kind: 'contract_change', paths: ['src/producer.js'], text: 'Repair the shared contract' }] };
  const state = { units: {
    producer: { id: 'producer', owner: 'lane', status: 'passed', dev: { status: 'passed' }, qa: { status: 'passed' } },
    consumer: { id: 'consumer', owner: 'lane', status: 'passed', dev: { status: 'passed', report: 'keep-dev.json' }, qa: { status: 'failed' } },
    descendant: { id: 'descendant', owner: 'lane', status: 'passed', dev: { status: 'passed' }, qa: { status: 'running' } }
  } };
  const deferred = contractRepairResolution(plan, state, 'consumer', outcome, true, 'qa');
  assert.equal(deferred.status, 'deferred', 'an actual reviewer still owns its files');
  deferContractRepair(state.units.consumer, 'qa', deferred, outcome);
  state.units.descendant.qa.status = 'pending';
  state.units.descendant.waiting = { stage: 'qa', reason: 'review_order', holders: ['consumer'] };
  const resolved = reconcileDeferredContractRepairs(plan, state);
  assert.equal(resolved.routed.length, 1, 'queued QA does not defer the repair in a circle');
  assert.equal(state.units.producer.dev.status, 'pending');
  assert.equal(state.units.descendant.dev.status, 'pending', 'stale descendant is invalidated before review');
  assert.equal(state.units.consumer.dev.report, 'keep-dev.json', 'failed QA preserves the delivered consumer');
  assert.equal(state.units.consumer.qa.status, 'pending');
  assert.deepEqual(state.units.consumer.repair_dependencies, ['producer']);
});

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

test('continuous routing waits for active descendants and then repairs the unique producer automatically', () => {
  const producer = { id: 'backend-domain', wave: 1, lane: 'backend', owner: 'lane', files: ['src/server/timeline.ts'], depends_on: [] };
  const active = { id: 'backend-transition', wave: 4, lane: 'backend', owner: 'lane', files: ['src/server/transition.ts'], depends_on: [{ unit: 'backend-domain' }] };
  const consumer = { id: 'frontend-transition', wave: 5, lane: 'frontend', owner: 'lane', files: ['src/client/transition.ts'], depends_on: [] };
  const plan = { units: [producer, active, consumer], lanes: { backend: { qa: { max_rework_rounds: 5 } } } };
  const findings = [{ path: 'src/server/timeline.ts:42', summary: 'Live preview transport is missing' }];
  const messages = [{ to: 'lane:backend', kind: 'contract_change', paths: ['src/server/timeline.ts'], text: 'Implement the linked timeline preview transport' }];
  const outcome = { kind: 'blocked', reason: 'contract_missing', findings, messages };
  const state = { decisions: [], units: {
    'backend-domain': { id: 'backend-domain', lane: 'backend', owner: 'lane', status: 'passed', dev: { status: 'passed' }, qa: { status: 'passed' } },
    'backend-transition': { id: 'backend-transition', lane: 'backend', owner: 'lane', status: 'running', dev: { status: 'running' }, qa: { status: 'pending' } },
    'frontend-transition': { id: 'frontend-transition', lane: 'frontend', owner: 'lane', status: 'running', dev: { status: 'blocked', findings, messages }, qa: { status: 'pending' } }
  } };

  const resolution = contractRepairResolution(plan, state, 'frontend-transition', outcome, true);
  assert.equal(resolution.status, 'deferred');
  assert.equal(resolution.producer, 'backend-domain');
  assert.deepEqual(resolution.blockers, ['backend-transition']);
  assert.equal(contractRepairTarget(plan, state, 'frontend-transition', outcome, true), null);

  assert.equal(deferContractRepair(state.units['frontend-transition'], 'dev', resolution, outcome, '2026-09-15T11:59:00.000Z').unit, 'backend-domain');
  assert.equal(state.units['frontend-transition'].status, 'pending');
  assert.deepEqual(state.units['frontend-transition'].repair_dependencies, ['backend-transition']);
  // Another routed repair may invalidate this consumer before its queued
  // repair is reconciled; the queued structured evidence must still survive.
  state.units['frontend-transition'].dev = { status: 'pending' };
  state.units['backend-transition'].status = 'passed';
  state.units['backend-transition'].dev = { status: 'passed' };
  state.units['backend-transition'].qa = { status: 'passed' };

  const reconciled = reconcileDeferredContractRepairs(plan, state, '2026-09-15T12:00:00.000Z');
  assert.deepEqual(reconciled.unresolved, []);
  assert.deepEqual(reconciled.waiting, []);
  assert.equal(reconciled.routed[0].producer, 'backend-domain');
  assert.equal(state.decisions[0].source, 'automatic_contract_repair_deferred');
  assert.equal(state.units['backend-domain'].contract_repairs, 1);
  for (const id of ['backend-domain', 'backend-transition', 'frontend-transition']) {
    assert.equal(state.units[id].status, 'pending');
    assert.equal(state.units[id].dev.status, 'pending');
    assert.equal(state.units[id].qa.status, 'pending');
  }
  assert.equal(state.units['frontend-transition'].deferred_contract_repair, undefined);
  assert.deepEqual(state.units['frontend-transition'].repair_dependencies, ['backend-domain']);
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

// The migration run that parked overnight: a wave-3 review failed on a file of
// a same-wave unit and, in the same report, handed the integration owner
// notes about files later waves create. One future path made the whole
// routing `owner_missing`, so the real defect waited for a person.
function outboundGateIncident() {
  const unit = (id, wave, files, depends = []) => ({ id, wave, lane: 'backend', owner: 'lane', files, depends_on: depends.map(dep => ({ unit: dep })) });
  const plan = {
    units: [
      unit('foundation', 1, ['.env.example', 'package.json']),
      unit('db-client', 2, ['server/src/db/client.ts'], ['foundation']),
      unit('schema-generator', 3, ['server/src/entries/schema.ts'], ['db-client']),
      unit('outbound-gate', 3, ['server/src/outbound/gate.ts', 'server/src/outbound/install.ts', 'server/tests/outbound/no-bypass.test.ts'], ['db-client']),
      unit('sync-engine', 6, ['server/src/entries/sync.ts'], ['schema-generator']),
      unit('jobs', 13, ['server/src/entries/worker.ts', 'server/tests/jobs/rehearsal-cycle.test.ts'], ['outbound-gate']),
      unit('ops', 14, ['docs/migration-2-0/vps-setup.md'], ['jobs'])
    ],
    lanes: { backend: { qa: { max_rework_rounds: 1 } } }
  };
  const done = { owner: 'lane', status: 'passed', dev: { status: 'passed' }, qa: { status: 'passed' } };
  const waiting = { owner: 'lane', status: 'pending', dev: { status: 'pending' }, qa: { status: 'pending' } };
  const state = { units: {
    foundation: { id: 'foundation', ...done },
    'db-client': { id: 'db-client', ...done },
    'schema-generator': { id: 'schema-generator', ...done },
    'outbound-gate': { id: 'outbound-gate', owner: 'lane', status: 'passed', dev: { status: 'passed' }, qa: { status: 'failed' } },
    'sync-engine': { id: 'sync-engine', ...waiting },
    jobs: { id: 'jobs', ...waiting },
    ops: { id: 'ops', ...waiting }
  } };
  const outcome = {
    kind: 'failed',
    reason: 'qa_acceptance_failed',
    findings: [
      { id: 'F4', kind: 'verification_failed', severity: 'medium', path: 'server/src/entries/schema.ts:1', summary: 'schema.ts does not install the gate before its other imports' },
      { id: 'F2', kind: 'verification_not_run', severity: 'medium', path: 'server/tests/jobs/rehearsal-cycle.test.ts', summary: 'the jobs cycle belongs to a later unit' },
      { id: 'F3', kind: 'verification_not_run', severity: 'medium', path: 'server/src/entries/worker.ts', summary: 'no VPS here' }
    ],
    messages: [
      { to: 'unit:schema-generator', kind: 'contract_change', text: 'Install the gate first in schema.ts', paths: ['server/src/entries/schema.ts', 'server/tests/outbound/no-bypass.test.ts'] },
      { to: 'integration', kind: 'note', text: 'Run the jobs cycle once it exists', paths: ['server/tests/jobs/rehearsal-cycle.test.ts', 'server/src/entries/worker.ts', 'server/src/outbound/gate.ts'] },
      { to: 'integration', kind: 'note', text: 'Inspect a real cycle on the VPS', paths: ['server/src/entries/worker.ts', 'docs/migration-2-0/vps-setup.md'] },
      { to: 'integration', kind: 'note', text: 'Document OPS_ALERT_TARGETS', paths: ['server/src/outbound/install.ts', '.env.example', 'docs/migration-2-0/vps-setup.md'] }
    ]
  };
  return { plan, state, outcome };
}

test('hand-off notes about future deliverables never stop the routing of the defect reported beside them', () => {
  const { plan, state, outcome } = outboundGateIncident();
  assert.deepEqual(externalRepairPaths(plan, 'outbound-gate', outcome), ['server/src/entries/schema.ts'],
    'integration notes count only where a defect finding points; .env.example never reopens the foundation');
  const resolution = contractRepairResolution(plan, state, 'outbound-gate', outcome, true);
  assert.equal(resolution.status, 'routable', JSON.stringify(resolution));
  assert.equal(resolution.producer, 'schema-generator');
  assert.deepEqual(resolution.paths, ['server/src/entries/schema.ts']);
  assert.deepEqual(resolution.repair.findings.map(finding => finding.id), ['F4'], 'the producer receives only its own defect');

  // Even a note to a unit that names only future work defers to that unit's wave.
  const futureOnly = { ...outcome, findings: [outcome.findings[1]], messages: [{ to: 'unit:jobs', kind: 'note', text: 'Cover the gate in the cycle', paths: ['server/tests/jobs/rehearsal-cycle.test.ts'] }] };
  const deferred = contractRepairResolution(plan, state, 'outbound-gate', futureOnly, true);
  assert.equal(deferred.status, 'not_applicable');
  assert.equal(deferred.reason, 'future_owners_only');
  assert.deepEqual(deferred.future_paths, ['server/tests/jobs/rehearsal-cycle.test.ts']);
});

test('a later-wave owner that already ran owns the defect it wrote; one that has not started only defers', () => {
  const { plan, state } = outboundGateIncident();
  const outcome = {
    kind: 'failed',
    findings: [{ kind: 'verification_failed', severity: 'medium', path: 'server/src/entries/sync.ts:1', summary: 'sync.ts does not install the gate first' }],
    messages: [{ to: 'integration', kind: 'note', text: 'sync.ts breaks the entry contract', paths: ['server/src/entries/sync.ts'] }]
  };
  const notStarted = contractRepairResolution(plan, state, 'outbound-gate', outcome, true);
  assert.equal(notStarted.status, 'not_applicable', 'the sync unit has not run: its own wave writes the file');
  state.units['sync-engine'] = { id: 'sync-engine', owner: 'lane', status: 'passed', dev: { status: 'passed' }, qa: { status: 'passed' } };
  const resolution = contractRepairResolution(plan, state, 'outbound-gate', outcome, true);
  assert.equal(resolution.status, 'routable', JSON.stringify(resolution));
  assert.equal(resolution.producer, 'sync-engine');
  const bounded = contractRepairResolution(plan, state, 'outbound-gate', outcome, false);
  assert.equal(bounded.status, 'unresolved', 'bounded mode never reopens a delivered later unit');
  assert.equal(bounded.reason, 'owner_missing');
});

test('continuous routing repairs one producer at a time and leaves an unassignable path to the next review', () => {
  const { plan, state } = outboundGateIncident();
  state.units['sync-engine'] = { id: 'sync-engine', owner: 'lane', status: 'passed', dev: { status: 'passed' }, qa: { status: 'passed' } };
  const both = {
    kind: 'failed',
    findings: [
      { kind: 'verification_failed', severity: 'high', path: 'server/src/entries/sync.ts:1', summary: 'sync entry' },
      { kind: 'verification_failed', severity: 'high', path: 'server/src/entries/schema.ts:1', summary: 'schema entry' }
    ],
    messages: [{ to: 'orchestrator', kind: 'contract_change', text: 'Both entries skip the gate', paths: ['server/src/entries/sync.ts', 'server/src/entries/schema.ts'] }]
  };
  const first = contractRepairResolution(plan, state, 'outbound-gate', both, true);
  assert.equal(first.status, 'routable');
  assert.equal(first.producer, 'schema-generator', 'earliest wave first');
  assert.deepEqual(first.paths, ['server/src/entries/schema.ts']);
  assert.deepEqual(first.repair.findings.map(finding => finding.summary), ['schema entry']);
  assert.equal(contractRepairResolution(plan, state, 'outbound-gate', both, false).status, 'unresolved', 'bounded mode keeps asking');

  const unownedPlan = { ...plan, units: [...plan.units, { id: 'wiring', wave: 15, lane: 'integration', owner: 'integration', files: ['server/src/app.ts'], depends_on: [] }] };
  const mixed = {
    ...both,
    findings: [...both.findings, { kind: 'verification_failed', severity: 'high', path: 'server/src/app.ts:9', summary: 'wiring' }],
    messages: [{ to: 'orchestrator', kind: 'contract_change', text: 'Wiring and schema entry', paths: ['server/src/app.ts', 'server/src/entries/schema.ts'] }]
  };
  const routed = contractRepairResolution(unownedPlan, state, 'outbound-gate', mixed, true);
  assert.equal(routed.status, 'routable', 'the owned path is repaired; the unowned one waits for the next review');
  assert.equal(routed.producer, 'schema-generator');
  const unowned = { ...mixed, messages: [{ to: 'orchestrator', kind: 'contract_change', text: 'Wiring only', paths: ['server/src/app.ts'] }] };
  const stuck = contractRepairResolution(unownedPlan, state, 'outbound-gate', unowned, true);
  assert.equal(stuck.status, 'unresolved');
  assert.equal(stuck.reason, 'owner_missing');
  assert.deepEqual(stuck.paths, ['server/src/app.ts']);
});

// The review of the same unit after the schema entry was fixed: the real
// defect moved to the sync entry (a later unit that already ran), beside a
// low-severity documentation gap handed to integration and a courtesy note
// to the schema unit. Only the proven defect reopens anything, and only the
// failed review of the consumer runs again.
test('a proven defect outranks hand-offs and courtesy notes, and a failed review reopens only the review', () => {
  const { plan, state } = outboundGateIncident();
  state.units['sync-engine'] = { id: 'sync-engine', owner: 'lane', status: 'passed', dev: { status: 'passed' }, qa: { status: 'passed' } };
  state.units.jobs = { id: 'jobs', owner: 'lane', status: 'passed', dev: { status: 'passed' }, qa: { status: 'passed' } };
  const outcome = {
    kind: 'failed',
    reason: 'qa_acceptance_failed',
    findings: [
      { id: 'F6', kind: 'verification_failed', severity: 'medium', path: 'server/src/entries/sync.ts:1', summary: 'sync.ts does not install the gate first' },
      { id: 'F7', kind: 'contract_gap', severity: 'low', path: '.env.example:105', summary: 'OPS_ALERT_TARGETS is not documented yet' }
    ],
    messages: [
      { to: 'unit:sync-engine', kind: 'contract_change', text: 'Install the gate first', paths: ['server/src/entries/sync.ts'] },
      { to: 'unit:schema-generator', kind: 'note', text: 'Keep the gate import first', paths: ['server/src/entries/schema.ts'] },
      { to: 'integration', kind: 'contract_change', text: 'Document OPS_ALERT_TARGETS', paths: ['.env.example', 'docs/migration-2-0/vps-setup.md'] }
    ]
  };
  assert.deepEqual(externalRepairPaths(plan, 'outbound-gate', outcome), ['server/src/entries/sync.ts', 'server/src/entries/schema.ts'],
    'a low-severity gap handed to integration never reopens the foundation');
  const resolution = contractRepairResolution(plan, state, 'outbound-gate', outcome, true, 'qa');
  assert.equal(resolution.status, 'routable', JSON.stringify(resolution));
  assert.equal(resolution.producer, 'sync-engine', 'the defect a finding proves comes before an earlier unit only a note names');
  assert.deepEqual(resolution.repair.affected, ['sync-engine', 'outbound-gate'], 'the delivered jobs unit built on the consumer stays valid');
  assert.equal(resolution.repair.consumer_review_only, true);
  assert.deepEqual(contractRepairResolution(plan, state, 'outbound-gate', outcome, true, 'dev').repair.affected, ['sync-engine', 'outbound-gate', 'jobs', 'ops'],
    'a DEV failure still revalidates everything built on the consumer');

  state.units['outbound-gate'].dev = { status: 'passed', report: 'gate.json' };
  state.units['outbound-gate'].qa = { status: 'failed', report: 'gate-qa.json', findings: outcome.findings, messages: outcome.messages };
  assert.equal(applyContractRepair(plan, state, 'outbound-gate', resolution.repair, '2026-10-03T03:30:00.000Z'), true);
  assert.equal(state.units['sync-engine'].status, 'pending');
  assert.equal(state.units['sync-engine'].retry_context.dev.reason, 'downstream_contract_repair');
  assert.deepEqual(state.units['sync-engine'].retry_context.dev.findings.map(finding => finding.id), ['F6']);
  const consumer = state.units['outbound-gate'];
  assert.equal(consumer.status, 'passed', 'the implementation stands');
  assert.deepEqual(consumer.dev, { status: 'passed', report: 'gate.json' });
  assert.equal(consumer.qa.status, 'pending');
  assert.deepEqual(consumer.repair_dependencies, ['sync-engine'], 'the review waits for the repaired producer');
  assert.equal(consumer.retry_context.qa.reason, 'upstream_contract_repair');
  assert.equal(state.units.jobs.status, 'passed');
  assert.equal(state.units['sync-engine'].rework.history.at(-1).consumer_report, 'gate-qa.json');
});

test('a parked review is replayed from its own report, never from the approved DEV hand-offs', () => {
  const { outcome } = outboundGateIncident();
  const unit = {
    dev: { status: 'passed', findings: [{ kind: 'contract_gap', severity: 'low', paths: ['.env.example'] }], messages: [{ to: 'integration', kind: 'note', paths: ['.env.example'] }] },
    qa: { status: 'failed', findings: outcome.findings, messages: outcome.messages }
  };
  const replay = repairOutcomeFromState(unit);
  assert.equal(replay.findings, outcome.findings);
  assert.equal(replay.messages, outcome.messages);
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
