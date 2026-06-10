'use strict';

/**
 * Scope guard do self:loop (loop-guardrails REQ-4/5/6 + REQ-10).
 *
 * Módulo puro: recebe o changed set (já calculado por git-baseline) e o
 * contrato RESOLVIDO (contract-schema.resolveContract — defaults proibidos já
 * mesclados). Não faz I/O.
 *
 * Precedência (REQ-5): deny vence allow — path que casa `forbidden_files` é
 * violação mesmo casando `allowed_files`. Defaults proibidos são sempre
 * aplicados (REQ-4) porque vêm mesclados do resolveContract.
 */

const { matchAny } = require('./glob-match');

/**
 * @param {object} params
 * @param {Array<{path, status}>} params.changedFiles — changed set da tentativa
 * @param {Array<{path, reason}>} [params.rehashViolations] — D2 (git-baseline)
 * @param {string[]|null} params.allowedGlobs — null = sem allowlist
 * @param {string[]} params.forbiddenGlobs — já mesclados com defaults
 * @returns {{ ok: boolean, violations: Array<{path, status, glob, reason}> }}
 */
function checkScope({ changedFiles = [], rehashViolations = [], allowedGlobs = null, forbiddenGlobs = [] }) {
  const violations = [];

  for (const file of changedFiles) {
    const forbiddenMatch = matchAny(forbiddenGlobs, file.path);
    if (forbiddenMatch) {
      violations.push({
        path: file.path,
        status: file.status,
        glob: forbiddenMatch,
        reason: `matches forbidden glob "${forbiddenMatch}"${file.status === 'deleted' ? ' (deletion counts — EC-4)' : ''}`
      });
      continue; // deny vence allow (REQ-5)
    }
    if (allowedGlobs && !matchAny(allowedGlobs, file.path)) {
      violations.push({
        path: file.path,
        status: file.status,
        glob: null,
        reason: 'outside allowed_files allowlist'
      });
    }
  }

  for (const rehash of rehashViolations) {
    violations.push({
      path: rehash.path,
      status: 'modified',
      glob: null,
      reason: rehash.reason
    });
  }

  return { ok: violations.length === 0, violations };
}

/** Conta linhas efetivas de diff (+/− excluindo headers +++/---). */
function countDiffLines(diffPatch) {
  if (!diffPatch) return 0;
  let count = 0;
  for (const line of String(diffPatch).split('\n')) {
    if ((line.startsWith('+') && !line.startsWith('+++')) ||
        (line.startsWith('-') && !line.startsWith('---'))) {
      count += 1;
    }
  }
  return count;
}

/**
 * Limites de diff (REQ-10, should-have). Avaliados sobre o MESMO conjunto do
 * scope guard. `null`/`undefined` = sem limite.
 *
 * @returns {{ ok: boolean, exceeded: Array<{limit, actual, max}> }}
 */
function checkDiffLimits({ changedFiles = [], diffPatch = '', maxChangedFiles = null, maxDiffLines = null }) {
  const exceeded = [];

  if (Number.isInteger(maxChangedFiles) && maxChangedFiles > 0 && changedFiles.length > maxChangedFiles) {
    exceeded.push({ limit: 'max_changed_files', actual: changedFiles.length, max: maxChangedFiles });
  }

  if (Number.isInteger(maxDiffLines) && maxDiffLines > 0) {
    const actual = countDiffLines(diffPatch);
    if (actual > maxDiffLines) {
      exceeded.push({ limit: 'max_diff_lines', actual, max: maxDiffLines });
    }
  }

  return { ok: exceeded.length === 0, exceeded };
}

/**
 * Feedback de reparo/rollback injetado na próxima iteração após violação
 * (REQ-6). Texto direto para o agente: reverter os paths e permanecer no escopo.
 */
function buildRollbackFeedback(violations) {
  const lines = violations.slice(0, 10).map((v) => `  - ${v.path} (${v.reason})`);
  return [
    'SCOPE VIOLATION — files were changed outside the contract scope:',
    ...lines,
    'Revert these changes (git checkout -- <path> / delete untracked files) and redo the task touching ONLY files inside the allowed scope.'
  ].join('\n');
}

module.exports = {
  checkScope,
  checkDiffLimits,
  countDiffLines,
  buildRollbackFeedback
};
