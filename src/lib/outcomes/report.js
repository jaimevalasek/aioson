'use strict';

/**
 * What the outcome records show: which practices go with better deliveries.
 *
 * Deterministic and model-free. Records are compared only inside the same
 * classification (a MICRO and a MEDIUM feature are different work). For each
 * practice, the deliveries WITH it are compared to the ones WITHOUT it on one
 * measured result, in this order of preference:
 *   1. first-pass QA rate (the delivery passed QA the first time);
 *   2. the person's rating (1–5), when enough deliveries were rated.
 * A practice is reported only with MIN_SIDE deliveries on each side; the gap
 * decides the strength (STRONG / WEAK thresholds). Everything else is "not
 * enough data" — a claim from three deliveries against one is noise.
 *
 * The wording is "associated with", never "causes": the owner proves a cause
 * by promoting the practice and measuring the next version.
 */

const { practiceLabel, shapeLabel } = require('./practices');

const MIN_SIDE = 3;
const THRESHOLDS = {
  first_pass: { strong: 0.4, weak: 0.2 },
  rating: { strong: 1.0, weak: 0.5 }
};

function mean(values) {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function sideStats(records) {
  const passes = records.map((r) => r.outcome && r.outcome.first_pass).filter((v) => typeof v === 'boolean');
  const ratings = records.map((r) => r.feedback && r.feedback.rating).filter((v) => Number.isInteger(v));
  const cycles = records.map((r) => r.outcome && r.outcome.fail_cycles).filter((v) => Number.isInteger(v));
  return {
    n: records.length,
    first_pass_known: passes.length,
    first_pass: passes.filter(Boolean).length,
    first_pass_rate: passes.length ? passes.filter(Boolean).length / passes.length : null,
    rated: ratings.length,
    rating_mean: mean(ratings),
    fail_cycles_mean: mean(cycles)
  };
}

function strengthOf(metric, gap) {
  const t = THRESHOLDS[metric];
  const size = Math.abs(gap);
  if (size >= t.strong) return 'strong';
  if (size >= t.weak) return 'weak';
  return 'none';
}

/** The comparison of one practice inside one group, or null without enough data. */
function compare(id, withRecords, withoutRecords) {
  const a = sideStats(withRecords);
  const b = sideStats(withoutRecords);
  let metric = null;
  let gap = null;
  if (a.first_pass_known >= MIN_SIDE && b.first_pass_known >= MIN_SIDE) {
    metric = 'first_pass';
    gap = a.first_pass_rate - b.first_pass_rate;
  } else if (a.rated >= MIN_SIDE && b.rated >= MIN_SIDE) {
    metric = 'rating';
    gap = a.rating_mean - b.rating_mean;
  }
  if (!metric) return { id, with: a, without: b, metric: null, gap: null, strength: 'insufficient', direction: null };
  const strength = strengthOf(metric, gap);
  return { id, with: a, without: b, metric, gap, strength, direction: gap > 0 ? 'better' : gap < 0 ? 'worse' : 'even' };
}

/** practice id → boolean for one record; the execution shape becomes `shape:<value>`. */
function booleanFacts(record) {
  const facts = {};
  for (const [id, value] of Object.entries(record.practices || {})) {
    if (typeof value === 'boolean') facts[id] = value;
  }
  if (typeof record.shape === 'string') facts[`shape:${record.shape}`] = true;
  return facts;
}

function analyzeGroup(classification, records) {
  const facts = records.map(booleanFacts);
  const ids = new Set();
  for (const f of facts) for (const id of Object.keys(f)) ids.add(id);
  const practices = [];
  for (const id of [...ids].sort()) {
    const withR = [];
    const withoutR = [];
    records.forEach((record, i) => {
      const value = id.startsWith('shape:')
        ? (typeof record.shape === 'string' ? facts[i][id] === true : undefined)
        : facts[i][id];
      if (value === true) withR.push(record);
      else if (value === false) withoutR.push(record);
    });
    practices.push(compare(id, withR, withoutR));
  }
  return { classification, n: records.length, practices };
}

/**
 * analyze(records) → { total, rated, rating_mean, groups, best, weak }
 *   best: strong comparisons where the practice goes with better results,
 *         largest gap first.
 */
function analyze(records) {
  const byClass = new Map();
  for (const record of records) {
    const key = record.classification || (record.kind === 'simple-plan' ? 'SIMPLE-PLAN' : 'UNKNOWN');
    if (!byClass.has(key)) byClass.set(key, []);
    byClass.get(key).push(record);
  }
  const groups = [...byClass.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([c, list]) => analyzeGroup(c, list));
  // Unclassified features are not one kind of work: counted, never compared.
  const flat = groups.filter((g) => g.classification !== 'UNKNOWN')
    .flatMap((g) => g.practices.map((p) => ({ ...p, classification: g.classification })));
  const ratings = records.map((r) => r.feedback && r.feedback.rating).filter((v) => Number.isInteger(v));
  const byGap = (a, b) => Math.abs(b.gap) - Math.abs(a.gap) || a.id.localeCompare(b.id);
  return {
    total: records.length,
    rated: ratings.length,
    rating_mean: mean(ratings),
    groups,
    best: flat.filter((p) => p.strength === 'strong' && p.direction === 'better').sort(byGap),
    worse: flat.filter((p) => p.strength === 'strong' && p.direction === 'worse').sort(byGap),
    weak: flat.filter((p) => p.strength === 'weak').sort(byGap)
  };
}

function labelOf(id, locale) {
  return id.startsWith('shape:') ? shapeLabel(id.slice('shape:'.length), locale) : practiceLabel(id, locale);
}

function pct(rate) {
  return rate === null ? '—' : `${Math.round(rate * 100)}%`;
}

/** One sentence with the numbers of a comparison, in `locale`. */
function describeComparison(p, locale = 'en') {
  const pt = String(locale).toLowerCase().startsWith('pt');
  const label = labelOf(p.id, locale);
  if (p.metric === 'first_pass') {
    return pt
      ? `${label}: QA de primeira em ${p.with.first_pass}/${p.with.first_pass_known} com a prática vs ${p.without.first_pass}/${p.without.first_pass_known} sem (features ${p.classification})`
      : `${label}: first-pass QA in ${p.with.first_pass}/${p.with.first_pass_known} with it vs ${p.without.first_pass}/${p.without.first_pass_known} without (${p.classification} features)`;
  }
  const a = p.with.rating_mean.toFixed(1);
  const b = p.without.rating_mean.toFixed(1);
  return pt
    ? `${label}: nota média ${a} com a prática (${p.with.rated}) vs ${b} sem (${p.without.rated}) (features ${p.classification})`
    : `${label}: average rating ${a} with it (${p.with.rated}) vs ${b} without (${p.without.rated}) (${p.classification} features)`;
}

module.exports = { analyze, describeComparison, labelOf, pct, MIN_SIDE, THRESHOLDS };
