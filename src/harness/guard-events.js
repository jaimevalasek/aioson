'use strict';

/**
 * Telemetria dos guards do self:loop (loop-guardrails D6).
 *
 * Helper único de emissão para os tipos de evento novos (requirements §2.5):
 * scope_violation, budget_warning, budget_exceeded, runtime_exceeded,
 * human_gate_requested, human_gate_decision, criteria_check_failed,
 * failure_signature_repeat, contract_invalid, diff_limit_exceeded.
 *
 * Sempre best-effort (espelha BR-NC-11 / neural-chain-telemetry): telemetria
 * NUNCA quebra o loop. `token_count` carrega a estimativa chars/4 quando o
 * evento é de tentativa (REQ-7) — telemetria apenas; enforcement lê o
 * acumulador em progress.json (D3).
 */

const GUARD_EVENT_TYPES = Object.freeze([
  'scope_violation',
  'budget_warning',
  'budget_exceeded',
  'runtime_exceeded',
  'human_gate_requested',
  'human_gate_decision',
  'criteria_check_failed',
  'failure_signature_repeat',
  'contract_invalid',
  'diff_limit_exceeded'
]);

/**
 * Emite um evento de guard no runtime store. Nunca lança.
 *
 * @param {string} targetDir — raiz do projeto
 * @param {object} event
 * @param {string} event.eventType — um de GUARD_EVENT_TYPES
 * @param {string} [event.agent] — default 'self-loop'
 * @param {string} [event.message]
 * @param {object} [event.payload] — vai para payload_json (slug, attempt, etc.)
 * @param {number|null} [event.tokenCount] — estimativa chars/4 da tentativa
 * @returns {boolean} true se gravou
 */
async function emitGuardEvent(targetDir, { eventType, agent = 'self-loop', message = '', payload = null, tokenCount = null } = {}) {
  if (!GUARD_EVENT_TYPES.includes(eventType)) return false;
  let db = null;
  try {
    const { openRuntimeDb } = require('../runtime-store');
    const opened = await openRuntimeDb(targetDir);
    db = opened.db;
    db.prepare(`
      INSERT INTO execution_events (event_type, agent_name, message, payload_json, token_count, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      eventType,
      agent,
      message || eventType,
      payload ? JSON.stringify(payload) : null,
      tokenCount === null || tokenCount === undefined ? null : Math.round(tokenCount),
      new Date().toISOString()
    );
    return true;
  } catch {
    return false; // D6: telemetria nunca quebra o loop
  } finally {
    try { if (db) db.close(); } catch { /* ignore */ }
  }
}

module.exports = {
  GUARD_EVENT_TYPES,
  emitGuardEvent
};
