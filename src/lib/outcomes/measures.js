'use strict';

/**
 * Outcome measures — how a delivery went, in numbers the framework already
 * records. Model-free; null when a number is not on record (never estimated).
 *
 *   first_pass      the delivery passed QA the first time (no FAIL → PASS
 *                   cycle in the dossier trail, and not closed as FAIL)
 *   fail_cycles     FAIL → PASS cycles (harness:retro's own miner)
 *   findings_*      findings by severity (QA reports, correction plans,
 *                   verification reports — the same miner)
 *   tokens          only when the host reported usage (orchestrated runs)
 *   duration_hours  from the first recorded start to the close
 *   gate_reds       close gates bypassed with --force at this close
 *
 * Compactions and sessions per agent are not attributable to one delivery in
 * a single chat yet; they stay null rather than guessed.
 */

const path = require('node:path');
const { readText } = require('./ledger');

const HOUR = 60 * 60 * 1000;

function retroSources(targetDir, slug) {
  try {
    const { collectFeatureSources } = require('../retro/retro-sources');
    return collectFeatureSources(targetDir, slug);
  } catch {
    return null;
  }
}

function severityCounts(findings) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const f of findings || []) if (counts[f.severity] !== undefined) counts[f.severity] += 1;
  return counts;
}

function firstPass(verdict, sources) {
  if (verdict === 'FAIL') return false;
  if (!sources) return null;
  if (sources.cycles.length > 0) return false;
  // No trail and no QA report: nothing says how many rounds QA took.
  const counts = sources.counts || {};
  if (!(counts.dossier_trail > 0 || counts.qa_reports > 0)) return null;
  return true;
}

/** The earliest start on record: the dev-progress ledger (ISO) or the features.md row (date). */
async function startedAt(targetDir, slug, ctxDir) {
  const starts = [];
  try {
    const { readPhaseCheckpoints } = require('../dev-progress');
    for (const entry of await readPhaseCheckpoints(targetDir, slug)) {
      const at = Date.parse(entry && entry.at);
      if (Number.isFinite(at)) starts.push(at);
    }
  } catch { /* no ledger */ }
  try {
    const { parseFeatureRegistry } = require('../feature-registry');
    const registry = parseFeatureRegistry(readText(path.join(ctxDir, 'features.md')) || '');
    const row = registry.rows.find((r) => r.slug === slug);
    const date = row && /^\d{4}-\d{2}-\d{2}$/.test(String(row.started || '')) ? Date.parse(`${row.started}T00:00:00Z`) : NaN;
    if (Number.isFinite(date)) starts.push(date);
  } catch { /* no registry */ }
  return starts.length > 0 ? Math.min(...starts) : null;
}

/**
 * measureOutcome({ targetDir, ctxDir, slug, verdict, now, forceBypass }) → outcome
 */
async function measureOutcome({ targetDir, ctxDir, slug, verdict, now = Date.now(), forceBypass = null }) {
  const sources = retroSources(targetDir, slug);
  const sev = sources ? severityCounts(sources.findings) : null;
  const start = await startedAt(targetDir, slug, ctxDir);
  const tokens = sources && sources.cost && sources.cost.token_count_available && Number.isInteger(sources.cost.token_total)
    ? sources.cost.token_total
    : null;
  return {
    first_pass: firstPass(verdict, sources),
    fail_cycles: sources ? sources.cycles.length : null,
    findings_critical: sev ? sev.critical : null,
    findings_high: sev ? sev.high : null,
    findings_medium: sev ? sev.medium : null,
    findings_low: sev ? sev.low : null,
    compactions: null,
    tokens: tokens !== null && tokens >= 0 ? tokens : null,
    duration_hours: start !== null && now >= start ? Math.round(((now - start) / HOUR) * 10) / 10 : null,
    agent_sessions: null,
    gate_reds: forceBypass && Array.isArray(forceBypass.blockers) ? forceBypass.blockers.length : 0
  };
}

module.exports = { measureOutcome, firstPass, severityCounts };
