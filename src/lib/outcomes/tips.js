'use strict';

/**
 * The tip at the moment of decision: when the agents that shape a new
 * delivery (@briefing, @refiner, @product) start, and the records show a
 * practice with STRONG evidence of better results that the current delivery
 * does not use yet, the context brief carries one line saying so — with the
 * numbers, never as an order.
 *
 * At most one tip, only from strong evidence, only to those agents: the cost
 * is one line (MAX_TIP_BYTES) on a few activations, and nothing at all when
 * there is no evidence. The project's own records come first; the person's
 * portfolio (every aioson project on the machine) is the fallback.
 */

const path = require('node:path');
const { readRecords } = require('./ledger');
const { analyze, describeComparison } = require('./report');

const TIP_AGENTS = new Set(['briefing', 'refiner', 'product']);
const MAX_TIP_BYTES = 280;

function agentName(agent) {
  return String(agent || '').trim().replace(/^@/, '').toLowerCase();
}

/** Ids of practices the active delivery already uses (cheap checks only). */
async function practicesInUse(targetDir, slug) {
  if (!slug) return new Set();
  try {
    const { detectPractices } = require('./practices');
    const ctxDir = path.join(targetDir, '.aioson', 'context');
    const fs = require('node:fs');
    let prd = null;
    try { prd = fs.readFileSync(path.join(ctxDir, `prd-${slug}.md`), 'utf8'); } catch { prd = null; }
    const { practices } = await detectPractices({ targetDir, ctxDir, slug, kind: 'feature', prd, integrity: null });
    return new Set(Object.entries(practices).filter(([, v]) => v === true).map(([id]) => id));
  } catch {
    return new Set();
  }
}

function clip(text) {
  let out = text;
  while (Buffer.byteLength(out) > MAX_TIP_BYTES) out = `${[...out].slice(0, -2).join('')}…`;
  return out;
}

function tipLine(comparison, locale, scope) {
  const pt = String(locale || '').toLowerCase().startsWith('pt');
  const where = scope === 'portfolio' ? (pt ? ' (seus projetos)' : ' (your projects)') : '';
  const body = describeComparison(comparison, locale);
  return clip(`${pt ? 'Prática medida' : 'Measured practice'}${where}: ${body}. ${pt ? 'Ofereça ao usuário; não é obrigatório.' : 'Offer it to the user; not mandatory.'}`);
}

/**
 * practiceTips(targetDir, { agent, locale, feature, records, portfolio }) → string[] (0 or 1 line)
 * `records` / `portfolio` are injectable for tests.
 */
async function practiceTips(targetDir, { agent, locale = 'en', feature = null, records, portfolio } = {}) {
  if (!TIP_AGENTS.has(agentName(agent))) return [];
  const own = records || readRecords(targetDir);
  let scope = 'project';
  let best = analyze(own).best.filter((p) => !p.id.startsWith('shape:'));
  if (best.length === 0) {
    const all = portfolio || require('./record').portfolioRecords(targetDir).records;
    best = analyze(all).best.filter((p) => !p.id.startsWith('shape:'));
    scope = 'portfolio';
  }
  if (best.length === 0) return [];
  const inUse = await practicesInUse(targetDir, feature);
  const tip = best.find((p) => !inUse.has(p.id));
  return tip ? [tipLine(tip, locale, scope)] : [];
}

module.exports = { practiceTips, TIP_AGENTS, MAX_TIP_BYTES };
