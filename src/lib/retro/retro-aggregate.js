'use strict';

/**
 * Agregação determinística para `aioson harness:retro` (requirements §3.1/§7).
 *
 * Agrupa findings por CHAVE DETERMINÍSTICA EXATA — nunca por classe semântica
 * (isso é trabalho do @sheldon). A chave inclui sempre o slug (um finding-ID
 * como C-01 existe em quase toda feature; nunca agrupar entre features — edge 5).
 *
 * Critério anti-opinião (REQ-2): um grupo vira "Proposta candidata" SOMENTE se
 *   (a) ≥2 ocorrências da mesma chave, OU
 *   (b) ≥1 ocorrência de severidade high/critical, OU
 *   (c) a feature tem ≥2 ciclos FAIL→PASS.
 * Severidade `unknown` nunca satisfaz (b) sozinha; todo o resto vai para
 * "Observações". (a) é independente de severidade — assinaturas sha1 (severidade
 * unknown) promovem ao repetir, AC-6.
 */

const crypto = require('node:crypto');

const SEVERITY_RANK = { critical: 5, high: 4, medium: 3, low: 2, info: 1, unknown: 0 };
const PHASE_RE = /(?:[-_/]|\b)(ph\d+|phase[-_]?\d+)\b/i;

function severityRank(sev) {
  return SEVERITY_RANK[sev] ?? 0;
}

function sha1short(text) {
  return crypto.createHash('sha1').update(String(text)).digest('hex').slice(0, 12);
}

/** Token de phase derivado do path da fonte (edge 4 — desambiguação entre phases). */
function phaseToken(sourcePath) {
  if (!sourcePath) return '';
  const m = String(sourcePath).match(PHASE_RE);
  return m ? m[1].toLowerCase().replace(/[-_]/g, '') : '';
}

/** Chave determinística exata de um finding (slug sempre incluído). */
function groupKey(f) {
  const phase = phaseToken(f.source_path);
  const prefix = phase ? `${f.feature_slug}::${phase}` : f.feature_slug;
  if (f.signature) return `${prefix}::sig:${f.signature}`;
  if (f.finding_id) return `${prefix}::${f.finding_id}`;
  return `${prefix}::title:${sha1short(f.title || '')}`;
}

/** Ordenação estável de ocorrências: severidade (critical→low), depois data, depois path. */
function compareOccurrences(a, b) {
  const sr = severityRank(b.severity) - severityRank(a.severity);
  if (sr !== 0) return sr;
  const da = a.date || '';
  const db = b.date || '';
  if (da !== db) return da < db ? -1 : 1;
  return (a.source_path || '') < (b.source_path || '') ? -1 : (a.source_path || '') > (b.source_path || '') ? 1 : 0;
}

/**
 * @param {object} sources — saída de `collectSources` ({ findings, cycles, cost, costByFeature })
 * @returns {{ candidates, observations, cost }}
 */
function aggregate(sources) {
  const findings = Array.isArray(sources.findings) ? sources.findings : [];
  const cycles = Array.isArray(sources.cycles) ? sources.cycles : [];
  const costByFeature = sources.costByFeature || {};

  // Ciclos FAIL→PASS por feature (ordenados por data).
  const cyclesByFeature = new Map();
  for (const c of cycles) {
    if (!cyclesByFeature.has(c.feature_slug)) cyclesByFeature.set(c.feature_slug, []);
    cyclesByFeature.get(c.feature_slug).push(c);
  }
  for (const arr of cyclesByFeature.values()) {
    arr.sort((a, b) => (a.fail_at < b.fail_at ? -1 : a.fail_at > b.fail_at ? 1 : 0));
  }

  // Agrupa findings por chave exata.
  const groups = new Map();
  for (const f of findings) {
    const key = groupKey(f);
    if (!groups.has(key)) groups.set(key, { key, feature_slug: f.feature_slug, finding_id: f.finding_id, signature: f.signature, occurrences: [] });
    groups.get(key).occurrences.push(f);
  }

  const candidates = [];
  const observations = [];

  for (const g of groups.values()) {
    g.occurrences.sort(compareOccurrences);
    const maxSeverity = g.occurrences.reduce((acc, o) => (severityRank(o.severity) > severityRank(acc) ? o.severity : acc), 'unknown');
    const occCount = g.occurrences.length;
    const featureCycles = cyclesByFeature.get(g.feature_slug) || [];

    const reasons = [];
    if (occCount >= 2) reasons.push('recurrence');
    if (severityRank(maxSeverity) >= severityRank('high')) reasons.push('severity');
    if (featureCycles.length >= 2) reasons.push('fail_pass_cycle');

    const feCost = costByFeature[g.feature_slug] || {};
    const cost = {
      occurrences: occCount,
      corrections: g.occurrences.filter((o) => o.source_type === 'corrections').length,
      fail_pass_cycles: featureCycles.length,
      cycle_dates: featureCycles.map((c) => `${c.fail_at}→${c.pass_at}`),
      execution_events: feCost.execution_events || 0,
      corrections_bytes: feCost.corrections_bytes || 0,
      tokens: feCost.token_count_available ? (feCost.token_total || 0) : null
    };

    if (reasons.length > 0) {
      candidates.push({
        key: g.key,
        feature_slug: g.feature_slug,
        finding_id: g.finding_id || null,
        signature: g.signature || null,
        max_severity: maxSeverity,
        reasons,
        occurrences: g.occurrences,
        corrections_link: (g.occurrences.find((o) => o.source_type === 'corrections') || {}).source_path || null,
        cost
      });
    } else {
      // Ocorrência única Medium/Low/info/unknown → Observação (uma linha).
      const o = g.occurrences[0];
      observations.push({
        key: g.key,
        feature_slug: g.feature_slug,
        finding_id: g.finding_id || null,
        severity: o.severity,
        title: o.title,
        date: o.date,
        source_path: o.source_path
      });
    }
  }

  // Candidato sintético por feature com ≥2 ciclos sem finding-âncora já candidato.
  for (const [slug, arr] of cyclesByFeature.entries()) {
    if (arr.length < 2) continue;
    const alreadyCovered = candidates.some((c) => c.feature_slug === slug && c.reasons.includes('fail_pass_cycle'));
    if (alreadyCovered) continue;
    const feCost = costByFeature[slug] || {};
    candidates.push({
      key: `${slug}::cycles`,
      feature_slug: slug,
      finding_id: null,
      signature: null,
      max_severity: 'unknown',
      reasons: ['fail_pass_cycle'],
      occurrences: [],
      corrections_link: null,
      cost: {
        occurrences: 0,
        corrections: feCost.corrections || 0,
        fail_pass_cycles: arr.length,
        cycle_dates: arr.map((c) => `${c.fail_at}→${c.pass_at}`),
        execution_events: feCost.execution_events || 0,
        corrections_bytes: feCost.corrections_bytes || 0,
        tokens: feCost.token_count_available ? (feCost.token_total || 0) : null
      }
    });
  }

  // Ordena candidatos: severidade (critical→low), depois data mais antiga, depois chave.
  candidates.sort((a, b) => {
    const sr = severityRank(b.max_severity) - severityRank(a.max_severity);
    if (sr !== 0) return sr;
    const da = (a.occurrences[0] && a.occurrences[0].date) || '';
    const db = (b.occurrences[0] && b.occurrences[0].date) || '';
    if (da !== db) return da < db ? -1 : 1;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });

  // Ordena observações: severidade, depois data, depois chave.
  observations.sort((a, b) => {
    const sr = severityRank(b.severity) - severityRank(a.severity);
    if (sr !== 0) return sr;
    const da = a.date || '';
    const db = b.date || '';
    if (da !== db) return da < db ? -1 : 1;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });

  return { candidates, observations, cost: sources.cost || {} };
}

module.exports = {
  aggregate,
  groupKey,
  severityRank,
  _internal: { phaseToken, compareOccurrences }
};
