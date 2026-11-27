'use strict';

/**
 * REPORT.md — the person-readable view of analyze() (report.js). Reading it
 * costs no model token; it is regenerated at every close and by
 * `aioson outcome:report`.
 */

const { describeComparison, MIN_SIDE } = require('./report');

const TEXT = {
  'pt-BR': {
    title: '# O que deu melhor resultado',
    scope_project: 'Escopo: este projeto',
    scope_portfolio: 'Escopo: todos os projetos aioson desta máquina ({projects})',
    totals: '{total} entrega(s) registradas, {rated} com nota da pessoa{mean}.',
    mean: ' (média {value})',
    best: '## Práticas associadas a resultados melhores',
    worse: '## Práticas associadas a resultados piores',
    weak: '## Sinais fracos (acompanhar)',
    none_yet: 'Ainda não há evidência forte. São precisas pelo menos {min} entregas com e {min} sem a mesma prática, na mesma classificação.',
    method: '## Como ler',
    method_lines: [
      'Cada linha compara entregas com e sem a prática, dentro da mesma classificação (MICRO, SMALL, MEDIUM).',
      'A medida é o QA aprovado de primeira; sem dado suficiente dele, a nota da pessoa (1 a 5).',
      'Forte = diferença de 40 pontos no QA de primeira (ou 1 ponto de nota); fraca = 20 pontos (ou meio ponto).',
      '"Associado a" não é "causa": a prova vem quando a prática vira padrão e a versão seguinte mede de novo.',
      'Gerado sem modelo de IA, a partir de .aioson/outcomes/*.json. Regerar: aioson outcome:report .'
    ]
  },
  en: {
    title: '# What gave the best results',
    scope_project: 'Scope: this project',
    scope_portfolio: 'Scope: every aioson project on this machine ({projects})',
    totals: '{total} delivery(ies) recorded, {rated} rated by the person{mean}.',
    mean: ' (average {value})',
    best: '## Practices associated with better results',
    worse: '## Practices associated with worse results',
    weak: '## Weak signals (keep watching)',
    none_yet: 'No strong evidence yet. It takes at least {min} deliveries with and {min} without the same practice, in the same classification.',
    method: '## How to read this',
    method_lines: [
      'Each line compares deliveries with and without the practice, inside the same classification (MICRO, SMALL, MEDIUM).',
      'The measure is first-pass QA; without enough of it, the person\'s rating (1 to 5).',
      'Strong = a 40-point gap in first-pass QA (or 1 rating point); weak = 20 points (or half a point).',
      '"Associated with" is not "causes": the proof comes when the practice becomes a default and the next version measures again.',
      'Generated without an AI model, from .aioson/outcomes/*.json. Regenerate: aioson outcome:report .'
    ]
  }
};

function textFor(locale) {
  return String(locale || '').toLowerCase().startsWith('pt') ? TEXT['pt-BR'] : TEXT.en;
}

function fill(template, values) {
  return Object.entries(values).reduce((out, [k, v]) => out.split(`{${k}}`).join(String(v)), template);
}

function section(heading, items, locale) {
  if (items.length === 0) return [];
  return ['', heading, '', ...items.map((p) => `- ${describeComparison(p, locale)}`)];
}

/** renderReport(analysis, { locale, portfolio: { projects } | null }) → markdown */
function renderReport(analysis, { locale = 'en', portfolio = null } = {}) {
  const T = textFor(locale);
  const mean = analysis.rating_mean === null ? '' : fill(T.mean, { value: analysis.rating_mean.toFixed(1) });
  const lines = [
    T.title,
    '',
    portfolio ? fill(T.scope_portfolio, { projects: portfolio.projects }) : T.scope_project,
    '',
    fill(T.totals, { total: analysis.total, rated: analysis.rated, mean })
  ];
  if (analysis.best.length === 0 && analysis.worse.length === 0) {
    lines.push('', fill(T.none_yet, { min: MIN_SIDE }));
  }
  lines.push(...section(T.best, analysis.best, locale));
  lines.push(...section(T.worse, analysis.worse, locale));
  lines.push(...section(T.weak, analysis.weak, locale));
  lines.push('', T.method, '', ...T.method_lines.map((l) => `- ${l}`), '');
  return lines.join('\n');
}

module.exports = { renderReport };
