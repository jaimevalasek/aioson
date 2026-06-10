'use strict';

/**
 * aioson harness:approve / harness:reject — decisão humana de gates do
 * self:loop (loop-guardrails REQ-14/15).
 *
 * - Exigem --slug e --gate; reject exige --reason.
 * - Decisão persiste em `.aioson/plans/{slug}/gates/{id}.json`
 *   (decided_at/decided_by/reason) e emite `human_gate_decision`.
 * - Gate já decidido = no-op idempotente com aviso (REQ-14).
 * - Gate inexistente = erro explícito sem efeito colateral (EC-8).
 * - Sem pendências restantes → progress.status volta a `in_progress`;
 *   re-executar `self:loop` retoma do ponto persistido (REQ-15).
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { decideGate, resolveGateState, pendingGates } = require('../harness/human-gate');
const { emitGuardEvent } = require('../harness/guard-events');

function gitUserName(targetDir) {
  try {
    return execFileSync('git', ['config', 'user.name'], {
      cwd: targetDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }).trim() || null;
  } catch {
    return null;
  }
}

async function runGateDecision(decision, { args, options = {}, logger }) {
  const targetDir = path.resolve(process.cwd(), args?.[0] || '.');
  const slug = String(options.slug || '').trim();
  const gateId = String(options.gate || '').trim();
  const reason = options.reason ? String(options.reason).trim() : null;
  const decidedBy = options.by ? String(options.by).trim() : gitUserName(targetDir);

  if (!slug) {
    logger.error('Error: --slug is required');
    return { ok: false, error: 'missing_slug' };
  }
  if (!gateId) {
    logger.error('Error: --gate is required (gate id, e.g. payment_logic_change-1)');
    return { ok: false, error: 'missing_gate' };
  }

  const planDir = path.join(targetDir, '.aioson', 'plans', slug);
  if (!fs.existsSync(path.join(planDir, 'harness-contract.json'))) {
    logger.error(`Contract not found for slug: ${slug}`);
    return { ok: false, error: 'contract_not_found' };
  }

  const result = decideGate(planDir, gateId, { decision, by: decidedBy, reason });

  if (!result.ok) {
    const messages = {
      gate_not_found: `Gate not found: ${gateId} — nothing to ${decision === 'approved' ? 'approve' : 'reject'} (no side effects)`,
      reason_required_on_reject: 'Error: --reason is required when rejecting a gate',
      gate_corrupted: `Gate file is corrupted: ${gateId}`,
      invalid_decision: `Invalid decision: ${decision}`
    };
    logger.error(messages[result.error] || `Error: ${result.error}`);
    return { ok: false, error: result.error, gateId };
  }

  if (result.idempotent) {
    logger.log(`• Gate ${gateId} already decided (${result.gate.status} at ${result.gate.decided_at}) — no-op`);
    return { ok: true, idempotent: true, gate: result.gate };
  }

  // reconcilia progress.json: remove decidido de pending_gates; sem pendências
  // restantes → status volta a in_progress (retomada idempotente / auditoria)
  const progressPath = path.join(planDir, 'progress.json');
  let remaining = [];
  try {
    if (fs.existsSync(progressPath)) {
      const progress = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
      resolveGateState(progress, planDir);
      fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2), 'utf8');
      remaining = progress.pending_gates || [];
    } else {
      remaining = pendingGates(planDir).map((g) => g.id);
    }
  } catch { /* progress corrompido — decisão do gate já persistiu */ }

  await emitGuardEvent(targetDir, {
    eventType: 'human_gate_decision',
    message: `gate ${gateId} ${decision} by ${decidedBy || 'unknown'}`,
    payload: { slug, gate_id: gateId, theme: result.gate.theme, decision, decided_by: decidedBy, reason }
  });

  const mark = decision === 'approved' ? '✓' : '✗';
  logger.log(`${mark} Gate ${gateId} ${decision}${decidedBy ? ` by ${decidedBy}` : ''}${reason ? ` — ${reason}` : ''}`);
  if (remaining.length > 0) {
    logger.log(`  Pending gates remaining: ${remaining.join(', ')}`);
  } else if (decision === 'approved') {
    logger.log(`  No pending gates — re-run self:loop to resume from the persisted state.`);
  } else {
    logger.log(`  Run ended. A new self:loop starts a fresh run (rejected gate is kept as audit).`);
  }

  return { ok: true, gate: result.gate, pending_gates: remaining };
}

async function runHarnessApprove(ctx) {
  return runGateDecision('approved', ctx);
}

async function runHarnessReject(ctx) {
  return runGateDecision('rejected', ctx);
}

module.exports = {
  runHarnessApprove,
  runHarnessReject
};
