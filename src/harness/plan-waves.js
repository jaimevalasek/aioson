'use strict';

/**
 * Parser da tabela "Execution Sequence" do implementation-plan-{slug}.md
 * (convenção Wave do @pm — Fase 4/5 do plano de verificação executável).
 *
 * Compartilhado entre `spec:analyze` (check wave_file_overlap) e
 * `forge:compile` (compilação spec → workflow script). Sem coluna Wave a
 * função retorna null — chamadores tratam como "convenção ausente"
 * (retrocompat com planos antigos).
 */

/**
 * @param {string} content — markdown do implementation-plan
 * @returns {Array<{phase, wave, files: string[], scope, done}>|null}
 */
function parseExecutionWaves(content) {
  const lines = String(content || '').split(/\r?\n/);
  let columns = null;
  const rows = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) {
      if (columns && rows.length) break; // fim da tabela alvo
      columns = columns && rows.length === 0 ? columns : null;
      continue;
    }
    const cells = trimmed.split('|').slice(1, -1).map((c) => c.trim());
    const lower = cells.map((c) => c.toLowerCase());

    if (!columns) {
      if (lower.includes('wave') && lower.some((c) => c.includes('phase')) && lower.some((c) => c.includes('file'))) {
        columns = {
          phase: lower.findIndex((c) => c.includes('phase')),
          wave: lower.indexOf('wave'),
          files: lower.findIndex((c) => c.includes('file')),
          scope: lower.findIndex((c) => c.includes('scope')),
          done: lower.findIndex((c) => c.includes('done'))
        };
      }
      continue;
    }

    if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue; // separador

    const wave = parseInt(cells[columns.wave], 10);
    if (!Number.isInteger(wave)) continue;
    const files = (cells[columns.files] || '')
      .split(/,|<br\s*\/?\s*>/i)
      .map((f) => f.replace(/`/g, '').trim().replace(/\\/g, '/').toLowerCase())
      .filter((f) => f && !/^(\.{3}|-|—)$/.test(f));
    rows.push({
      phase: cells[columns.phase] || `row ${rows.length + 1}`,
      wave,
      files,
      scope: columns.scope >= 0 ? (cells[columns.scope] || '') : '',
      done: columns.done >= 0 ? (cells[columns.done] || '') : ''
    });
  }

  return columns ? rows : null;
}

/** Agrupa as fases por wave, em ordem ascendente. */
function groupByWave(rows) {
  const byWave = new Map();
  for (const row of rows || []) {
    if (!byWave.has(row.wave)) byWave.set(row.wave, []);
    byWave.get(row.wave).push(row);
  }
  return [...byWave.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([wave, phases]) => ({ wave, phases }));
}

module.exports = { parseExecutionWaves, groupByWave };
