'use strict';

/**
 * Parsers das tabelas de execução do implementation-plan-{slug}.md
 * (convenções do @planner — Fase 4/5 do plano de verificação executável).
 *
 * - `parseExecutionWaves`: tabela "Execution Sequence" (Phase|Wave|Files|
 *   Scope|Done when|[Depends on]). Compartilhada entre `spec:analyze` (check
 *   wave_file_overlap), `forge:compile` (spec → workflow script) e
 *   `execution:compile` (unidades fase × lane + arestas). Sem coluna Wave a
 *   função retorna null — chamadores tratam como "convenção ausente"
 *   (retrocompat com planos antigos). A coluna `Depends on` é opcional: sem
 *   ela, `depends` é vazio e a onda continua sendo a barreira.
 * - `parseDevelopmentLanes`: tabela "Development execution lanes" (Lane|Host|
 *   Model|Exact write paths|Integration owner). Sem a seção retorna null.
 */

const { extractSection } = require('../lib/feature-completeness-format');

const LANES_HEADINGS = [
  'Development execution lanes',
  'Execution lanes',
  'Lanes de execução',
  'Lanes de execucao',
  'Faixas de execução',
  'Faixas de execucao'
];

/** Uma célula de caminhos → lista (vírgula ou <br>), sem crases, barras normalizadas. */
function splitPathCell(value) {
  return String(value || '')
    .split(/,|<br\s*\/?\s*>/i)
    .map((f) => f.replace(/`/g, '').trim().replace(/\\/g, '/'))
    .filter((f) => f && !/^(\.{3}|-|—)$/.test(f));
}

/**
 * @param {string} content — markdown do implementation-plan
 * @returns {Array<{phase, wave, files: string[], files_raw: string[], scope, done}>|null}
 *   `files` é minúsculo (comparação de overlap independente de plataforma);
 *   `files_raw` preserva o caso escrito no plano (contrato de escrita da unidade).
 */
/**
 * Célula `Depends on`: nomes de fase separados por vírgula/`;`/`<br>`;
 * sufixo `(dev)` = portão after_dev (basta o implementador passar), sem
 * sufixo ou `(qa)` = after_qa (a revisão da lane terminou). Vazio, `-`,
 * `—`, `none` → nenhuma aresta (a onda continua sendo a barreira).
 */
function parseDependsCell(value) {
  return String(value || '')
    .split(/,|;|<br\s*\/?\s*>/i)
    .map((token) => token.replace(/`/g, '').trim())
    .filter((token) => token && !/^(?:-+|—|none|nenhuma?|n\/a)$/i.test(token))
    .map((token) => {
      const match = token.match(/^(.+?)\s*\((dev|qa|implemented|reviewed)\)$/i);
      if (!match) return { phase: token, gate: 'after_qa' };
      const kind = match[2].toLowerCase();
      return { phase: match[1].trim(), gate: kind === 'dev' || kind === 'implemented' ? 'after_dev' : 'after_qa' };
    });
}

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
          done: lower.findIndex((c) => c.includes('done')),
          depends: lower.findIndex((c) => /depend|^after\b|ap[oó]s|requires/.test(c)),
          reads: lower.indexOf('read ranges')
        };
      }
      continue;
    }

    if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue; // separador

    const wave = parseInt(cells[columns.wave], 10);
    if (!Number.isInteger(wave)) continue;
    const filesRaw = splitPathCell(cells[columns.files]);
    const dependsRaw = columns.depends >= 0 ? (cells[columns.depends] || '') : '';
    rows.push({
      phase: cells[columns.phase] || `row ${rows.length + 1}`,
      wave,
      files: filesRaw.map((f) => f.toLowerCase()),
      files_raw: filesRaw,
      scope: columns.scope >= 0 ? (cells[columns.scope] || '') : '',
      done: columns.done >= 0 ? (cells[columns.done] || '') : '',
      read_ranges_raw: columns.reads >= 0 ? (cells[columns.reads] || '') : '',
      depends_raw: dependsRaw,
      depends: parseDependsCell(dependsRaw)
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

/**
 * Tabela `## Development execution lanes` do plano.
 *
 * @returns {null|{rows: Array<{row, lane, host, model, write_paths: string[], integration_owner}>, malformed, missing_columns: string[]}}
 *   null quando a seção não existe (plano de lane única — o caso normal).
 */
function parseDevelopmentLanes(content) {
  const section = extractSection(content, LANES_HEADINGS);
  if (section === null) return null;
  // Raw cell split on purpose: the shared table helper strips `**` as bold
  // markup, which mutilates glob write paths such as `tests/api/**`.
  const lines = section.split(/\r?\n/);
  const plain = (cell) => String(cell || '').replace(/`/g, '').trim();
  const fold = (cell) => plain(cell).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  let columns = null;
  const rows = [];
  const malformed = [];
  let dataRow = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) {
      if (columns) break;
      continue;
    }
    const cells = trimmed.split('|').slice(1, -1).map((c) => c.trim());
    if (!columns) {
      const lower = cells.map(fold);
      const lane = lower.findIndex((c) => c === 'lane' || c === 'faixa');
      const writePaths = lower.findIndex((c) => /(?:write )?paths?$|caminhos/.test(c) && !/integration|integracao/.test(c));
      if (lane === -1 || writePaths === -1) continue;
      columns = {
        lane,
        write_paths: writePaths,
        host: lower.findIndex((c) => c === 'host'),
        model: lower.findIndex((c) => c === 'model' || c === 'modelo'),
        integration_owner: lower.findIndex((c) => /integration|integracao|owner|dono/.test(c)),
        width: cells.length
      };
      continue;
    }
    if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue; // separador
    dataRow += 1;
    if (cells.length !== columns.width) {
      malformed.push({ row: dataRow, cells: cells.length });
      continue;
    }
    const lane = plain(cells[columns.lane]).toLowerCase();
    if (!lane) continue;
    rows.push({
      row: dataRow,
      lane,
      host: columns.host >= 0 ? plain(cells[columns.host]).toLowerCase() : '',
      model: columns.model >= 0 ? plain(cells[columns.model]) : '',
      write_paths: splitPathCell(cells[columns.write_paths]),
      integration_owner: columns.integration_owner >= 0
        ? plain(cells[columns.integration_owner]).replace(/^@/, '').toLowerCase()
        : ''
    });
  }
  if (!columns) return { rows: [], malformed: [], missing_columns: ['lane', 'write_paths'] };
  return { rows, malformed, missing_columns: [] };
}

module.exports = { parseExecutionWaves, parseDependsCell, groupByWave, parseDevelopmentLanes, splitPathCell, LANES_HEADINGS };
