'use strict';

/**
 * Writer único de `.aioson/plans/{slug}/attempts/{n}/` (loop-guardrails REQ-9).
 *
 * Scope guard e criteria-runner ENTREGAM dados a este módulo — nunca escrevem
 * direto. Registrar primeiro, julgar depois (D5: artifacts é o passo 1 do hook,
 * sempre executado mesmo em falha).
 *
 * Estrutura:
 *   attempts/{n}/changed-files.json   — { attempt, detected_at, files[] }
 *   attempts/{n}/checks/{id}.log      — stdout+stderr + exit code + duração
 *   attempts/{n}/diff.patch           — git diff da tentativa (should-have)
 */

const fs = require('node:fs');
const path = require('node:path');

function attemptDir(planDir, attempt) {
  return path.join(planDir, 'attempts', String(attempt));
}

/**
 * Grava os artefatos da tentativa. Cada seção é opcional e best-effort
 * independente — falha em uma não impede as outras.
 *
 * @param {string} planDir — .aioson/plans/{slug}
 * @param {number} attempt — número da tentativa (1-based)
 * @param {object} data
 * @param {Array<{path, status}>} [data.changedFiles]
 * @param {Array<{id, command, exitCode, durationMs, stdout, stderr, timedOut}>} [data.checks]
 * @param {string} [data.diffPatch]
 * @returns {{ ok: boolean, dir: string, written: string[] }}
 */
function writeAttemptArtifacts(planDir, attempt, { changedFiles, checks, diffPatch } = {}) {
  const dir = attemptDir(planDir, attempt);
  const written = [];

  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    return { ok: false, dir, written };
  }

  if (Array.isArray(changedFiles)) {
    try {
      const payload = {
        attempt,
        detected_at: new Date().toISOString(),
        files: changedFiles.map((f) => ({ path: f.path, status: f.status }))
      };
      fs.writeFileSync(path.join(dir, 'changed-files.json'), JSON.stringify(payload, null, 2), 'utf8');
      written.push('changed-files.json');
    } catch { /* best-effort */ }
  }

  if (Array.isArray(checks) && checks.length > 0) {
    try {
      const checksDir = path.join(dir, 'checks');
      fs.mkdirSync(checksDir, { recursive: true });
      for (const check of checks) {
        const safeId = String(check.id || 'check').replace(/[^A-Za-z0-9._-]/g, '_');
        const body = [
          `# criterion: ${check.id}`,
          `# command: ${check.command || ''}`,
          `# exit_code: ${check.exitCode === null || check.exitCode === undefined ? 'null' : check.exitCode}`,
          `# duration_ms: ${check.durationMs ?? 0}`,
          `# timed_out: ${Boolean(check.timedOut)}`,
          '',
          '## stdout',
          check.stdout || '',
          '',
          '## stderr',
          check.stderr || ''
        ].join('\n');
        fs.writeFileSync(path.join(checksDir, `${safeId}.log`), body, 'utf8');
        written.push(`checks/${safeId}.log`);
      }
    } catch { /* best-effort */ }
  }

  if (typeof diffPatch === 'string' && diffPatch.length > 0) {
    try {
      fs.writeFileSync(path.join(dir, 'diff.patch'), diffPatch, 'utf8');
      written.push('diff.patch');
    } catch { /* best-effort */ }
  }

  return { ok: true, dir, written };
}

module.exports = {
  writeAttemptArtifacts,
  attemptDir
};
