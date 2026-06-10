'use strict';

/**
 * Human gates temáticos do self:loop (loop-guardrails REQ-12/13/14/15 + D4).
 *
 * Estado em disco:
 * - `.aioson/plans/{slug}/gates/{id}.json` — decisão humana persistida
 *   (schema requirements §2.4 + campo aditivo `run_id` para suprimir
 *   re-detecção do mesmo tema dentro do run)
 * - `progress.json` — `status='human_gate'` + `pending_gates[]` (D4)
 *
 * O tema `publish` é gate de COMANDO (intercepta feature:close, REQ-13) —
 * nunca entra na detecção por diff.
 */

const fs = require('node:fs');
const path = require('node:path');

const { matchAny } = require('./glob-match');

const GATE_STATUSES = Object.freeze(['pending', 'approved', 'rejected']);

function gatesDir(planDir) {
  return path.join(planDir, 'gates');
}

function gatePath(planDir, gateId) {
  const safeId = String(gateId).replace(/[^A-Za-z0-9._-]/g, '_');
  return path.join(gatesDir(planDir), `${safeId}.json`);
}

/** Carrega todos os gates do slug (array vazio se nenhum). */
function loadGates(planDir) {
  const dir = gatesDir(planDir);
  if (!fs.existsSync(dir)) return [];
  const gates = [];
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.json')) continue;
    try {
      gates.push(JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')));
    } catch { /* gate corrompido — ignorado na leitura, decisão manual via fs */ }
  }
  return gates;
}

function pendingGates(planDir) {
  return loadGates(planDir).filter((g) => g.status === 'pending');
}

/**
 * Detecção por tema (REQ-12): diff da tentativa casando os globs do tema E
 * tema listado em required_for. `publish` nunca é detectado por diff (REQ-13).
 * Temas já cobertos por gate `approved` do MESMO run não re-disparam.
 *
 * @returns {Array<{theme, triggeredBy: string[]}>}
 */
function detectGates({ changedFiles = [], requiredFor = [], themePaths = {}, existingGates = [], runId = null }) {
  const detections = [];
  for (const theme of requiredFor) {
    if (theme === 'publish') continue; // gate de comando, nunca diff
    const globs = themePaths[theme] || [];
    if (!globs.length) continue;
    const alreadyHandled = existingGates.some(
      (g) => g.theme === theme && g.run_id === runId && (g.status === 'approved' || g.status === 'pending')
    );
    if (alreadyHandled) continue;
    const triggeredBy = changedFiles
      .filter((f) => matchAny(globs, f.path))
      .map((f) => f.path);
    if (triggeredBy.length > 0) {
      detections.push({ theme, triggeredBy });
    }
  }
  return detections;
}

/**
 * Cria e persiste um gate `pending` (schema §2.4). `id` único por slug:
 * `{theme}-{n}` com n incremental sobre os gates existentes do tema.
 */
function createGate(planDir, { theme, attempt, triggeredBy = [], diffSummary = '', runId = null }) {
  const existing = loadGates(planDir).filter((g) => g.theme === theme);
  const id = `${theme}-${existing.length + 1}`;
  const gate = {
    id,
    theme,
    status: 'pending',
    attempt,
    triggered_by: triggeredBy,
    diff_summary: diffSummary,
    requested_at: new Date().toISOString(),
    decided_at: null,
    decided_by: null,
    reason: null,
    run_id: runId
  };
  fs.mkdirSync(gatesDir(planDir), { recursive: true });
  fs.writeFileSync(gatePath(planDir, id), JSON.stringify(gate, null, 2), 'utf8');
  return gate;
}

/**
 * Entra no estado HUMAN_GATE (D4): muta `progress` (caller persiste via cb).
 */
function enterHumanGate(progress, gateIds) {
  progress.status = 'human_gate';
  const pending = new Set(Array.isArray(progress.pending_gates) ? progress.pending_gates : []);
  for (const id of gateIds) pending.add(id);
  progress.pending_gates = [...pending];
  progress.last_updated = new Date().toISOString();
  return progress;
}

/**
 * Decide um gate (REQ-14). Idempotente: gate já decidido → no-op com aviso.
 * EC-8: gate inexistente → erro explícito sem efeito colateral.
 *
 * @returns {{ ok, error?, idempotent?, gate? }}
 */
function decideGate(planDir, gateId, { decision, by = null, reason = null }) {
  if (!GATE_STATUSES.includes(decision) || decision === 'pending') {
    return { ok: false, error: 'invalid_decision' };
  }
  const file = gatePath(planDir, gateId);
  if (!fs.existsSync(file)) {
    return { ok: false, error: 'gate_not_found', gateId };
  }
  let gate;
  try {
    gate = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return { ok: false, error: 'gate_corrupted', gateId };
  }
  if (gate.status !== 'pending') {
    return { ok: true, idempotent: true, gate };
  }
  if (decision === 'rejected' && !(reason && String(reason).trim())) {
    return { ok: false, error: 'reason_required_on_reject', gateId };
  }
  gate.status = decision;
  gate.decided_at = new Date().toISOString();
  gate.decided_by = by || null;
  gate.reason = reason || null;
  fs.writeFileSync(file, JSON.stringify(gate, null, 2), 'utf8');
  return { ok: true, idempotent: false, gate };
}

/**
 * Reconcilia `progress` após decisões (REQ-15): remove o gate decidido de
 * `pending_gates`; sem pendências → `status='in_progress'` (retomada
 * idempotente; gate rejeitado fica como auditoria e não bloqueia runs novos).
 * Muta `progress` (caller persiste).
 */
function resolveGateState(progress, planDir) {
  const stillPending = new Set(pendingGates(planDir).map((g) => g.id));
  const current = Array.isArray(progress.pending_gates) ? progress.pending_gates : [];
  progress.pending_gates = current.filter((id) => stillPending.has(id));
  if (progress.pending_gates.length === 0 && progress.status === 'human_gate') {
    progress.status = 'in_progress';
  }
  progress.last_updated = new Date().toISOString();
  return progress;
}

/**
 * Gate de comando `publish` (REQ-13): existe gate publish aprovado?
 */
function hasApprovedPublishGate(planDir) {
  return loadGates(planDir).some((g) => g.theme === 'publish' && g.status === 'approved');
}

module.exports = {
  loadGates,
  pendingGates,
  detectGates,
  createGate,
  enterHumanGate,
  decideGate,
  resolveGateState,
  hasApprovedPublishGate,
  gatePath
};
