'use strict';

/**
 * What the review screen shows about one delivery: the practices measured
 * and the numbers measured, as label/value rows in the person's language.
 * Shown so the person sees exactly what the record holds besides their own
 * words.
 */

const { practiceLabel, shapeLabel } = require('./practices');

const MEASURE_LABELS = {
  first_pass: { 'pt-BR': 'QA aprovado de primeira', en: 'Passed QA the first time' },
  fail_cycles: { 'pt-BR': 'Voltas de correção (FAIL → PASS)', en: 'Fix rounds (FAIL → PASS)' },
  findings: { 'pt-BR': 'Achados (crítico / alto / médio / baixo)', en: 'Findings (critical / high / medium / low)' },
  tokens: { 'pt-BR': 'Tokens informados pelo host', en: 'Tokens reported by the host' },
  duration_hours: { 'pt-BR': 'Duração (horas)', en: 'Duration (hours)' },
  gate_reds: { 'pt-BR': 'Gates forçados no fechamento', en: 'Gates forced at close' },
  shape: { 'pt-BR': 'Forma de execução', en: 'Execution shape' }
};

function label(key, locale) {
  const entry = MEASURE_LABELS[key];
  return String(locale || '').toLowerCase().startsWith('pt') ? entry['pt-BR'] : entry.en;
}

function measuredRows(record, locale) {
  const o = record.outcome || {};
  const rows = [];
  if (typeof o.first_pass === 'boolean') rows.push({ label: label('first_pass', locale), value: o.first_pass });
  if (Number.isInteger(o.fail_cycles)) rows.push({ label: label('fail_cycles', locale), value: String(o.fail_cycles) });
  if ([o.findings_critical, o.findings_high, o.findings_medium, o.findings_low].every(Number.isInteger)) {
    rows.push({ label: label('findings', locale), value: `${o.findings_critical} / ${o.findings_high} / ${o.findings_medium} / ${o.findings_low}` });
  }
  if (Number.isInteger(o.tokens)) rows.push({ label: label('tokens', locale), value: o.tokens.toLocaleString(locale === 'pt-BR' ? 'pt-BR' : 'en-US') });
  if (typeof o.duration_hours === 'number') rows.push({ label: label('duration_hours', locale), value: String(o.duration_hours) });
  if (Number.isInteger(o.gate_reds) && o.gate_reds > 0) rows.push({ label: label('gate_reds', locale), value: String(o.gate_reds) });
  if (record.shape) rows.push({ label: label('shape', locale), value: shapeLabel(record.shape, locale).replace(/^[^:]+:\s*/, '') });
  return rows;
}

/** describeRecord(record, locale) → { practices: [{label, value}], measured: [{label, value}] } */
function describeRecord(record, locale = 'en') {
  if (!record) return { practices: [], measured: [] };
  const practices = Object.entries(record.practices || {})
    .filter(([, value]) => typeof value === 'boolean')
    .sort(([, a], [, b]) => Number(b) - Number(a))
    .map(([id, value]) => ({ label: practiceLabel(id, locale), value }));
  return { practices, measured: measuredRows(record, locale) };
}

module.exports = { describeRecord };
