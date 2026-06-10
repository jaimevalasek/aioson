'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  loadGates,
  pendingGates,
  detectGates,
  createGate,
  enterHumanGate,
  decideGate,
  resolveGateState,
  hasApprovedPublishGate
} = require('../src/harness/human-gate');

const THEME_PATHS = {
  payment_logic_change: ['**/billing/**', '**/payment/**'],
  auth_permission_change: ['**/auth/**'],
  database_destructive_change: ['**/migrations/**'],
  publish: []
};

describe('harness/human-gate — detectGates (REQ-12/13)', () => {
  test('detecta tema por glob e lista os arquivos que dispararam', () => {
    const detections = detectGates({
      changedFiles: [
        { path: 'src/billing/charge.js', status: 'modified' },
        { path: 'src/ui/button.js', status: 'modified' }
      ],
      requiredFor: ['payment_logic_change'],
      themePaths: THEME_PATHS
    });
    assert.strictEqual(detections.length, 1);
    assert.strictEqual(detections[0].theme, 'payment_logic_change');
    assert.deepStrictEqual(detections[0].triggeredBy, ['src/billing/charge.js']);
  });

  test('múltiplos temas na mesma tentativa → um gate por tema (REQ-12)', () => {
    const detections = detectGates({
      changedFiles: [
        { path: 'src/billing/x.js', status: 'modified' },
        { path: 'src/auth/y.js', status: 'modified' }
      ],
      requiredFor: ['payment_logic_change', 'auth_permission_change'],
      themePaths: THEME_PATHS
    });
    assert.strictEqual(detections.length, 2);
  });

  test('publish nunca é detectado por diff (REQ-13)', () => {
    const detections = detectGates({
      changedFiles: [{ path: 'qualquer/coisa.js', status: 'added' }],
      requiredFor: ['publish'],
      themePaths: THEME_PATHS
    });
    assert.deepStrictEqual(detections, []);
  });

  test('tema fora de required_for não dispara', () => {
    const detections = detectGates({
      changedFiles: [{ path: 'src/auth/y.js', status: 'modified' }],
      requiredFor: ['payment_logic_change'],
      themePaths: THEME_PATHS
    });
    assert.deepStrictEqual(detections, []);
  });

  test('tema com gate aprovado/pendente do mesmo run não re-dispara', () => {
    const base = {
      changedFiles: [{ path: 'src/auth/y.js', status: 'modified' }],
      requiredFor: ['auth_permission_change'],
      themePaths: THEME_PATHS,
      runId: 'run-1'
    };
    const approved = detectGates({
      ...base,
      existingGates: [{ theme: 'auth_permission_change', status: 'approved', run_id: 'run-1' }]
    });
    assert.deepStrictEqual(approved, []);
    // gate de OUTRO run não suprime
    const otherRun = detectGates({
      ...base,
      existingGates: [{ theme: 'auth_permission_change', status: 'approved', run_id: 'run-0' }]
    });
    assert.strictEqual(otherRun.length, 1);
  });
});

describe('harness/human-gate — persistência e decisão (REQ-14/15, EC-8/9)', () => {
  let planDir;

  before(() => {
    planDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-gates-'));
  });

  after(() => {
    try { fs.rmSync(planDir, { recursive: true, force: true }); } catch { /* win race */ }
  });

  test('createGate persiste pending com id único por tema (§2.4)', () => {
    const g1 = createGate(planDir, { theme: 'payment_logic_change', attempt: 1, triggeredBy: ['src/billing/x.js'], diffSummary: '1 file', runId: 'run-1' });
    const g2 = createGate(planDir, { theme: 'payment_logic_change', attempt: 2, triggeredBy: ['src/billing/y.js'], diffSummary: '1 file', runId: 'run-1' });
    assert.strictEqual(g1.id, 'payment_logic_change-1');
    assert.strictEqual(g2.id, 'payment_logic_change-2');
    assert.strictEqual(g1.status, 'pending');
    assert.strictEqual(g1.decided_at, null);
    assert.strictEqual(pendingGates(planDir).length, 2);
  });

  test('enterHumanGate marca status e pending_gates (D4)', () => {
    const progress = { status: 'in_progress' };
    enterHumanGate(progress, ['payment_logic_change-1', 'payment_logic_change-2']);
    assert.strictEqual(progress.status, 'human_gate');
    assert.strictEqual(progress.pending_gates.length, 2);
  });

  test('decideGate aprova com decided_by/decided_at; idempotente na 2ª chamada (REQ-14)', () => {
    const first = decideGate(planDir, 'payment_logic_change-1', { decision: 'approved', by: 'jaime' });
    assert.strictEqual(first.ok, true);
    assert.strictEqual(first.idempotent, false);
    assert.strictEqual(first.gate.decided_by, 'jaime');
    assert.ok(first.gate.decided_at);

    const second = decideGate(planDir, 'payment_logic_change-1', { decision: 'rejected', reason: 'late' });
    assert.strictEqual(second.ok, true);
    assert.strictEqual(second.idempotent, true);
    assert.strictEqual(second.gate.status, 'approved', 'decisão original preservada');
  });

  test('reject exige reason (REQ-14); gate inexistente é erro sem efeito colateral (EC-8)', () => {
    const noReason = decideGate(planDir, 'payment_logic_change-2', { decision: 'rejected' });
    assert.strictEqual(noReason.ok, false);
    assert.strictEqual(noReason.error, 'reason_required_on_reject');
    assert.strictEqual(loadGates(planDir).find((g) => g.id === 'payment_logic_change-2').status, 'pending');

    const missing = decideGate(planDir, 'ghost-99', { decision: 'approved' });
    assert.strictEqual(missing.ok, false);
    assert.strictEqual(missing.error, 'gate_not_found');
  });

  test('resolveGateState remove decididos e restaura in_progress quando zera (REQ-15/EC-9)', () => {
    const progress = { status: 'human_gate', pending_gates: ['payment_logic_change-1', 'payment_logic_change-2'] };
    resolveGateState(progress, planDir); // gate 1 já aprovado, gate 2 pendente
    assert.deepStrictEqual(progress.pending_gates, ['payment_logic_change-2']);
    assert.strictEqual(progress.status, 'human_gate');

    decideGate(planDir, 'payment_logic_change-2', { decision: 'rejected', reason: 'fora de escopo' });
    resolveGateState(progress, planDir);
    assert.deepStrictEqual(progress.pending_gates, []);
    assert.strictEqual(progress.status, 'in_progress', 'rejeitado vira auditoria, não bloqueia runs futuros');
  });

  test('hasApprovedPublishGate só com gate publish aprovado (REQ-13)', () => {
    assert.strictEqual(hasApprovedPublishGate(planDir), false);
    const gate = createGate(planDir, { theme: 'publish', attempt: 0, runId: 'run-2' });
    assert.strictEqual(hasApprovedPublishGate(planDir), false);
    decideGate(planDir, gate.id, { decision: 'approved', by: 'jaime' });
    assert.strictEqual(hasApprovedPublishGate(planDir), true);
  });
});
