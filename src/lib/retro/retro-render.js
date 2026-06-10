'use strict';

/**
 * Renderiza o dossiê retrospectivo em Markdown (requirements §3.1).
 *
 * Saída byte-estável exceto `generated_at` (AC-4): nenhuma fonte de
 * não-determinismo além do timestamp injetado pelo caller. As 4 seções existem
 * SEMPRE — vazias com placeholder. O conteúdo do dossiê é um artefato em idioma
 * fixo (pt-BR, conforme §3.1); `--locale` afeta só as mensagens de stdout.
 */

const SOURCE_ORDER = ['qa_reports', 'corrections', 'dossier_trail', 'execution_events', 'attempts', 'failure_signatures', 'devlogs'];

// Defesa em profundidade (SF-01): o dossiê vira contexto do @sheldon. Texto livre
// minerado (títulos) é apresentado como DADO inline, nunca como estrutura Markdown
// injetável. Neutraliza newlines/controles/bidi/zero-width — impede que um título
// forjado injete um header `## …`, um fence ``` ou um bloco de instrução no dossiê.
// Determinístico e byte-estável: identidade sobre texto limpo (sem esses chars).
const INJECTABLE_CHARS_RE = new RegExp(
  '[\\u0000-\\u001F\\u007F\\u200B-\\u200F\\u2028\\u2029\\u202A-\\u202E\\u2066-\\u2069\\uFEFF]',
  'g'
);

function neutralizeText(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(INJECTABLE_CHARS_RE, ' ').trim();
}

function severityLabel(sev) {
  return sev || 'unknown';
}

function fmtCost(cost) {
  const parts = [
    `ocorrências ${cost.occurrences}`,
    `correções ${cost.corrections}`,
    `ciclos FAIL→PASS ${cost.fail_pass_cycles}${cost.cycle_dates && cost.cycle_dates.length ? ` (${cost.cycle_dates.join('; ')})` : ''}`,
    `eventos ${cost.execution_events}`,
    `bytes corrections ${cost.corrections_bytes}`,
    `tokens ${cost.tokens === null || cost.tokens === undefined ? 'n/d' : cost.tokens}`
  ];
  return parts.join(', ');
}

function renderCandidate(c) {
  const lines = [];
  const anchor = c.finding_id || (c.signature ? `sig:${c.signature.slice(0, 12)}` : c.key);
  lines.push(`### ${c.key}`);
  lines.push('');
  lines.push(`- Âncora: ${anchor} | severidade máxima: ${severityLabel(c.max_severity)} | motivos: ${c.reasons.join(', ')}`);
  if (c.occurrences.length > 0) {
    lines.push(`- Ocorrências (${c.occurrences.length}):`);
    for (const o of c.occurrences) {
      const id = o.finding_id || (o.signature ? `sig:${o.signature.slice(0, 12)}` : '—');
      lines.push(`  - (${o.feature_slug}, ${id}, ${severityLabel(o.severity)}, ${o.date || 'sem-data'}, ${o.source_path}, ${o.status})`);
    }
  } else {
    lines.push('- Ocorrências: ciclos FAIL→PASS recorrentes (sem finding-âncora único)');
  }
  lines.push(`- Correções aplicadas: ${c.corrections_link || '—'}`);
  lines.push(`- Custo de retrabalho: ${fmtCost(c.cost)}`);
  lines.push('');
  return lines.join('\n');
}

function renderObservation(o) {
  const id = o.finding_id || '—';
  return `- (${o.feature_slug}, ${id}, ${severityLabel(o.severity)}, ${o.date || 'sem-data'}) — ${neutralizeText(o.title) || id} [${o.source_path}]`;
}

function renderFrontmatter({ mode, slug, windowN, featuresMined, counts, candidatesCount, observationsCount, generatedAt }) {
  const lines = ['---'];
  if (mode === 'window') {
    lines.push(`window: last-${windowN}`);
  } else {
    lines.push(`feature: ${slug}`);
  }
  lines.push(`generated_at: ${generatedAt}`);
  lines.push('generated_by: harness-retro');
  lines.push('schema_version: "1.0"');
  lines.push(`features_mined: [${featuresMined.join(', ')}]`);
  lines.push('sources:');
  for (const key of SOURCE_ORDER) {
    lines.push(`  ${key}: ${counts[key] || 0}`);
  }
  lines.push(`candidates: ${candidatesCount}`);
  lines.push(`observations: ${observationsCount}`);
  lines.push('---');
  return lines.join('\n');
}

/**
 * @param {object} opts
 * @param {'feature'|'window'} opts.mode
 * @param {string} [opts.slug]
 * @param {number} [opts.windowN]
 * @param {string[]} opts.featuresMined
 * @param {object} opts.counts — contagens por fonte
 * @param {Array} opts.candidates
 * @param {Array} opts.observations
 * @param {string[]} opts.minedPaths
 * @param {string[]} opts.warnings
 * @param {string} opts.dossierRelPath — path relativo deste dossiê (para o Próximo passo)
 * @param {string} opts.generatedAt — ISO 8601 (única fonte de não-determinismo)
 * @returns {string}
 */
function renderDossier(opts) {
  const {
    mode, slug, windowN, featuresMined, counts,
    candidates, observations, minedPaths, warnings, dossierRelPath, generatedAt
  } = opts;

  const blocks = [];

  blocks.push(renderFrontmatter({
    mode, slug, windowN, featuresMined, counts,
    candidatesCount: candidates.length, observationsCount: observations.length, generatedAt
  }));

  const title = mode === 'window' ? `Dossiê retrospectivo — janela last-${windowN}` : `Dossiê retrospectivo — ${slug}`;
  blocks.push(`\n# ${title}\n`);

  // 1. Propostas candidatas
  const sec1 = ['## Propostas candidatas', ''];
  if (candidates.length === 0) {
    sec1.push('_(nenhuma proposta candidata — nenhum item atende ao critério REQ-2)_');
  } else {
    for (const c of candidates) sec1.push(renderCandidate(c));
  }
  blocks.push(sec1.join('\n'));

  // 2. Observações
  const sec2 = ['', '## Observações', ''];
  if (observations.length === 0) {
    sec2.push('_(nenhuma observação)_');
  } else {
    for (const o of observations) sec2.push(renderObservation(o));
  }
  blocks.push(sec2.join('\n'));

  // 3. Trilha minerada
  const sec3 = ['', '## Trilha minerada', '', '### Paths minerados'];
  if (minedPaths.length === 0) {
    sec3.push('- _(nenhum path encontrado)_');
  } else {
    for (const p of minedPaths) sec3.push(`- ${p}`);
  }
  sec3.push('', '### Contagens por fonte');
  for (const key of SOURCE_ORDER) {
    sec3.push(`- ${key}: ${counts[key] || 0}`);
  }
  sec3.push('', '### Avisos');
  if (warnings.length === 0) {
    sec3.push('- _(nenhum aviso — todas as fontes lidas sem degradação)_');
  } else {
    for (const w of warnings) sec3.push(`- ${w}`);
  }
  blocks.push(sec3.join('\n'));

  // 4. Próximo passo (texto fixo — REQ-5)
  const sec4 = [
    '',
    '## Próximo passo',
    '',
    `Ative o @sheldon sob demanda para analisar este dossiê (\`${dossierRelPath}\`):`,
    '',
    '```',
    `aioson agent:prompt sheldon . --task="analisar ${dossierRelPath}"`,
    '```',
    '',
    'Critério de promoção (REQ-2): só vira proposta o item com ≥2 ocorrências da mesma chave determinística, ≥1 finding High/Critical, ou ≥2 ciclos FAIL→PASS na mesma feature.',
    '',
    '@sheldon classifica as classes de falha citando as ocorrências deste dossiê e propõe deltas que aterrissam APENAS em `.aioson/learnings/` e `.aioson/rules/`, sempre com aprovação humana. A CLI minera e materializa; ela nunca auto-aplica deltas.',
    ''
  ];
  blocks.push(sec4.join('\n'));

  // Normaliza para LF e garante newline final único (byte-estável).
  return `${blocks.join('\n').replace(/\r\n/g, '\n').replace(/\n+$/, '')}\n`;
}

module.exports = {
  renderDossier,
  _internal: { renderFrontmatter, renderCandidate, fmtCost, neutralizeText, SOURCE_ORDER }
};
