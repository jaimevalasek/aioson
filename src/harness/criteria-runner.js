'use strict';

/**
 * Avaliação determinística de criteria[].verification (loop-guardrails
 * REQ-16/17 + D7).
 *
 * Reusa `executeInSandbox` (src/sandbox.js) — timeout, kill de process tree e
 * redaction já resolvidos (EC-7). NÃO cria runner novo. Critério sem
 * `verification` mantém o comportamento atual (não avaliado).
 *
 * Assinatura de falha (D7): sha1(criterion_id + exitCode + primeira linha
 * não-vazia de stderr normalizada — paths absolutos, números e timestamps
 * removidos). 2 ocorrências no RUN (não precisam ser consecutivas — EC-13,
 * diferente do error_streak) → failure_signature_repeat + parada.
 */

const crypto = require('node:crypto');

// Repository-wide quality gates can legitimately exceed two minutes on
// Windows. Keep the CLI --timeout override, but give deterministic contract
// checks enough headroom to avoid classifying a healthy full suite as failed.
const DEFAULT_CHECK_TIMEOUT_MS = 300000;

/**
 * Normaliza uma linha de erro para assinatura estável (D7):
 * remove paths absolutos, troca dígitos por '#' (line numbers, timestamps,
 * durações) e colapsa espaços.
 */
function normalizeErrorLine(line) {
  return String(line || '')
    // paths absolutos (posix e windows, com ou sem drive letter)
    .replace(/(?:[A-Za-z]:)?[\\/][^\s:'"()]+/g, '<path>')
    // dígitos (line numbers, timestamps, ms)
    .replace(/\d+/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function firstNonEmptyLine(text) {
  for (const line of String(text || '').split('\n')) {
    if (line.trim()) return line;
  }
  return '';
}

/** sha1 hex da assinatura de falha (D7). */
function failureSignature(criterionId, exitCode, stderr) {
  const normalized = normalizeErrorLine(firstNonEmptyLine(stderr));
  return crypto
    .createHash('sha1')
    .update(`${criterionId}|${exitCode === null || exitCode === undefined ? 'null' : exitCode}|${normalized}`)
    .digest('hex');
}

/**
 * Executa os critérios com `verification` via sandbox (REQ-16).
 *
 * @param {object} params
 * @param {Array} params.criteria — criteria[] do contrato resolvido
 * @param {string} params.cwd — raiz do projeto
 * @param {number} [params.timeoutMs]
 * @param {Function} [params.sandboxExec] — injeção para teste; default executeInSandbox
 * @returns {Promise<Array<{id, command, exitCode, durationMs, stdout, stderr, timedOut, ok, signature}>>}
 */
async function runCriteria({ criteria = [], cwd, timeoutMs = DEFAULT_CHECK_TIMEOUT_MS, sandboxExec = null }) {
  const exec = sandboxExec || require('../sandbox').executeInSandbox;
  const checks = [];
  for (const criterion of criteria) {
    if (!criterion || typeof criterion.verification !== 'string' || !criterion.verification.trim()) {
      continue; // sem verification = não avaliado automaticamente (REQ-16)
    }
    const startedAt = Date.now();
    let result;
    try {
      result = await exec(criterion.verification, {
        cwd,
        timeout: timeoutMs,
        intent: `criteria:${criterion.id}`
      });
    } catch (err) {
      result = { ok: false, stdout: '', stderr: String(err.message || err), exitCode: null, timedOut: false };
    }
    const check = {
      id: criterion.id,
      command: criterion.verification,
      exitCode: result.exitCode,
      durationMs: Date.now() - startedAt,
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      timedOut: Boolean(result.timedOut),
      ok: Boolean(result.ok)
    };
    // EC-7: timeout = check falho com assinatura própria (stderr do sandbox
    // "Command timed out after Xms" normaliza estável via '#')
    check.signature = check.ok ? null : failureSignature(check.id, check.exitCode, check.stderr);
    checks.push(check);
  }
  return checks;
}

/**
 * Registra assinaturas de falha no run (D7) e detecta repetições.
 * Muta `progress.failure_signatures[]` (caller persiste).
 *
 * @returns {Array<{signature, criterion_id}>} repetições (>= 2 no run)
 */
function registerFailureSignatures(progress, failedChecks) {
  if (!Array.isArray(progress.failure_signatures)) progress.failure_signatures = [];
  const repeats = [];
  for (const check of failedChecks) {
    if (!check.signature) continue;
    const priorOccurrences = progress.failure_signatures.filter((s) => s.signature === check.signature).length;
    progress.failure_signatures.push({
      signature: check.signature,
      criterion_id: check.id,
      recorded_at: new Date().toISOString()
    });
    if (priorOccurrences + 1 >= 2) {
      repeats.push({ signature: check.signature, criterion_id: check.id });
    }
  }
  return repeats;
}

/** Zera as assinaturas para um run novo (chamado no preflight junto do budget). */
function startRunSignatures(progress) {
  progress.failure_signatures = [];
  return progress;
}

module.exports = {
  DEFAULT_CHECK_TIMEOUT_MS,
  normalizeErrorLine,
  failureSignature,
  runCriteria,
  registerFailureSignatures,
  startRunSignatures
};
