'use strict';

/**
 * Orçamento do self:loop (loop-guardrails REQ-7/8 + D3).
 *
 * Módulo puro: opera sobre o objeto `progress` (de progress.json) e devolve
 * eventos a emitir + decisão de pausa. O wiring persiste e emite.
 *
 * Fonte de enforcement é o acumulador `progress.budget` — nunca SQLite no hot
 * path (D3). `execution_events.token_count` é só telemetria. "Run atual" =
 * acumulador zerado a cada run novo (EC-10: legados null irrelevantes).
 *
 * Estimativa: chars/4 sobre o output do agente (erro 5-15% aceito pelo PRD;
 * `tokenx` é upgrade path documentado).
 */

/** Estimativa heurística chars/4 (REQ-7). */
function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(String(text).length / 4);
}

/**
 * Inicializa o acumulador de budget para um run NOVO (preflight, passo 4).
 * Zera tokens e flags; muta `progress` (caller persiste).
 */
function startRunBudget(progress, runId) {
  progress.budget = {
    tokens_estimated: 0,
    warned_80: false,
    run_started_at: new Date().toISOString(),
    run_id: runId
  };
  return progress.budget;
}

/** Garante que progress.budget existe (retomada de run antigo sem o campo). */
function ensureBudget(progress, runId) {
  if (!progress.budget || typeof progress.budget !== 'object') {
    startRunBudget(progress, runId);
  }
  return progress.budget;
}

/** Acumula a estimativa da tentativa; muta `progress` (caller persiste). */
function recordAttemptTokens(progress, tokens) {
  ensureBudget(progress, null);
  progress.budget.tokens_estimated += Math.max(0, Math.round(tokens) || 0);
  return progress.budget.tokens_estimated;
}

/**
 * Política 80/100% (REQ-7) + max_runtime_minutes na fronteira (REQ-8).
 *
 * EC-11: 80% e 100% cruzados na mesma tentativa → AMBOS os eventos em ordem,
 * pausa uma vez. `warned_80` garante o warning 1x por run; muta `progress`.
 *
 * @returns {{ ok, pause, events: [{type, message, payload}] }}
 */
function checkBudget(progress, { costCeilingTokens = null, maxRuntimeMinutes = null, now = null } = {}) {
  const events = [];
  let pause = false;
  const budget = ensureBudget(progress, null);

  if (Number.isInteger(costCeilingTokens) && costCeilingTokens > 0) {
    const spent = budget.tokens_estimated;
    const pct = spent / costCeilingTokens;

    if (pct >= 0.8 && !budget.warned_80) {
      budget.warned_80 = true;
      events.push({
        type: 'budget_warning',
        message: `token budget at ${Math.round(pct * 100)}% (${spent}/${costCeilingTokens} estimated)`,
        payload: { tokens_estimated: spent, cost_ceiling_tokens: costCeilingTokens, pct: Math.round(pct * 100) }
      });
    }

    if (pct >= 1) {
      events.push({
        type: 'budget_exceeded',
        message: `token budget exceeded (${spent}/${costCeilingTokens} estimated) — pausing loop`,
        payload: { tokens_estimated: spent, cost_ceiling_tokens: costCeilingTokens }
      });
      pause = true;
    }
  }

  if (Number.isInteger(maxRuntimeMinutes) && maxRuntimeMinutes > 0 && budget.run_started_at) {
    const startedAt = Date.parse(budget.run_started_at);
    const current = now ? Date.parse(now) : Date.now();
    if (Number.isFinite(startedAt) && current - startedAt > maxRuntimeMinutes * 60000) {
      const elapsedMin = Math.round((current - startedAt) / 60000);
      events.push({
        type: 'runtime_exceeded',
        message: `max_runtime_minutes exceeded (${elapsedMin}min > ${maxRuntimeMinutes}min) — pausing loop`,
        payload: { elapsed_minutes: elapsedMin, max_runtime_minutes: maxRuntimeMinutes }
      });
      pause = true;
    }
  }

  return { ok: !pause, pause, events };
}

/**
 * Resumo feito/faltante para a pausa de 100% (REQ-7).
 */
function buildBudgetSummary(progress, { maxIterations = null } = {}) {
  const budget = progress.budget || {};
  const iterations = progress.iterations || 0;
  return [
    `Budget pause summary:`,
    `  iterations completed: ${iterations}${maxIterations ? `/${maxIterations}` : ''}`,
    `  tokens estimated (chars/4): ${budget.tokens_estimated || 0}`,
    `  run started at: ${budget.run_started_at || 'unknown'}`,
    `  resume: review scope/budget in harness-contract.json, then re-run self:loop`
  ].join('\n');
}

module.exports = {
  estimateTokens,
  startRunBudget,
  ensureBudget,
  recordAttemptTokens,
  checkBudget,
  buildBudgetSummary
};
