'use strict';

/**
 * Phase checkpoints and the forecast they allow — always from this run.
 *
 * `dev:state:write` could not answer "how long is this taking?": `dev-state.md`
 * is a cold-start pointer, so its History keeps the last five lines and stamps
 * them with the day alone. A 21-phase run ended with phases 17 to 21 under one
 * date, which is no measure of anything. Each write now also appends a stamped
 * line to a ledger under `.aioson/runtime/`, local-only and never rotated, and
 * `dev:progress` reads it.
 *
 * `--phase=<n>` on a checkpoint means phase n just finished (phase-loop.md). A
 * checkpoint with no phase, before the first finished one, marks the start, so
 * the first phase can be measured too. The forecast is wall clock: pauses count.
 *
 * A forecast needs two real intervals and invents nothing below that. An interval
 * under a minute is not a measure: the report speaks in minutes, and a batch of
 * writes on one clock would read as phases that take no time. A phase the plan does
 * not have is not counted either, so one wrong `--phase=100` cannot move the mean.
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const { isValidSlug } = require('../dossier/schema');
const { parsePlanPhases } = require('./plan-document');

const MIN_INTERVALS = 2;
const MIN_INTERVAL_MINUTES = 1;

function ledgerPath(targetDir, slug) {
  return path.join(targetDir, '.aioson', 'runtime', 'dev-progress', `${slug}.jsonl`);
}

function relative(targetDir, file) {
  return path.relative(targetDir, file).split(path.sep).join('/');
}

/** Never throws: a checkpoint is crash recovery, and its ledger line is a bonus. */
async function appendPhaseCheckpoint(targetDir, { feature, phase = null, next = '' }, now = Date.now) {
  if (!isValidSlug(feature)) return { ok: false, reason: 'invalid_slug' };
  const file = ledgerPath(targetDir, feature);
  const entry = { at: new Date(now()).toISOString(), phase: phase === null || phase === undefined ? null : String(phase), next: String(next || '') };
  try {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.appendFile(file, `${JSON.stringify(entry)}\n`, 'utf8');
    return { ok: true, path: relative(targetDir, file), entry };
  } catch (error) {
    return { ok: false, reason: error.code || error.message };
  }
}

async function readPhaseCheckpoints(targetDir, slug) {
  if (!isValidSlug(slug)) return [];
  let raw;
  try {
    raw = await fs.readFile(ledgerPath(targetDir, slug), 'utf8');
  } catch {
    return [];
  }
  const entries = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      const at = Date.parse(parsed.at);
      // A torn or hand-edited line is dropped, never read as a zero.
      if (Number.isFinite(at)) entries.push({ at, phase: parsed.phase === null || parsed.phase === undefined ? null : String(parsed.phase) });
    } catch { /* same */ }
  }
  return entries.sort((a, b) => a.at - b.at);
}

// `3-backend` finished part of phase 3: the plan counts phases, not units.
function phaseKey(phase) {
  const number = /^\s*(?:phase|fase)?\s*(\d+)/i.exec(String(phase));
  return number ? String(Number(number[1])) : String(phase).trim();
}

function round(value) {
  return Math.round(value * 10) / 10;
}

/**
 * First stamp per phase in time order, and the time since the previous stamp. A
 * later rewrite of a phase (a fix after QA) does not move it. A gap in the plan's
 * numbering (a checkpoint skipped for phase 4) spreads the interval over the phases
 * it covers instead of charging one phase with two, and stays one interval: without
 * a plan there is no numbering to trust, so it covers one.
 */
function measureDurations(entries, planIds) {
  const planned = planIds ? new Set(planIds) : null;
  const seen = new Set();
  const durations = [];
  const finished = [];
  const unplanned = new Set();
  let previousAt = null;
  let highest = null;
  for (const entry of entries) {
    if (entry.phase === null) {
      if (finished.length === 0) previousAt = entry.at;
      continue;
    }
    const key = phaseKey(entry.phase);
    if (planned && !planned.has(key)) {
      unplanned.add(key);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    finished.push(key);
    const number = /^\d+$/.test(key) ? Number(key) : null;
    if (previousAt !== null) {
      const minutes = (entry.at - previousAt) / 60000;
      const covers = planned && number !== null && highest !== null && number > highest ? number - highest : 1;
      if (minutes >= MIN_INTERVAL_MINUTES) durations.push({ phase: key, minutes: round(minutes), covers });
    }
    previousAt = entry.at;
    if (number !== null && (highest === null || number > highest)) highest = number;
  }
  return { finished, durations, unplanned: [...unplanned] };
}

/**
 * `{ status, finished, total, remaining, missing, unplanned, intervals, measured,
 *    mean_minutes, min_minutes, max_minutes, projected_remaining_minutes }`, status
 * being `not_measured` below two real intervals, `measured`, or `complete`. Forecast
 * fields stay null when the status gives no ground for them.
 */
function projectProgress(entries, planPhaseIds = null) {
  const plan = Array.isArray(planPhaseIds) && planPhaseIds.length > 0 ? planPhaseIds.map(phaseKey) : null;
  const { finished, durations, unplanned } = measureDurations(entries, plan);
  const finishedSet = new Set(finished);
  const pending = plan ? plan.filter((id) => !finishedSet.has(id)) : null;
  const highest = Math.max(0, ...finished.filter((id) => /^\d+$/.test(id)).map(Number));
  const measured = durations.reduce((sum, item) => sum + item.covers, 0);
  const totalMinutes = durations.reduce((sum, item) => sum + item.minutes, 0);
  const perPhase = durations.map((item) => item.minutes / item.covers);
  const enough = durations.length >= MIN_INTERVALS;
  const mean = enough ? totalMinutes / measured : null;
  const complete = Boolean(plan) && pending.length === 0;
  return {
    status: complete ? 'complete' : enough ? 'measured' : 'not_measured',
    finished: finished.length,
    total: plan ? plan.length : null,
    remaining: pending ? pending.length : null,
    // Passed by a later checkpoint and never stamped: the phase may be done, its time is not known.
    missing: pending ? pending.filter((id) => /^\d+$/.test(id) && Number(id) < highest) : [],
    unplanned,
    intervals: durations.length,
    measured,
    needed_to_measure: MIN_INTERVALS,
    mean_minutes: enough ? round(mean) : null,
    min_minutes: enough ? round(Math.min(...perPhase)) : null,
    max_minutes: enough ? round(Math.max(...perPhase)) : null,
    projected_remaining_minutes: enough && pending ? round(mean * pending.length) : null
  };
}

function formatMinutes(minutes) {
  const total = Math.round(minutes);
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

function planPhaseIds(content) {
  return content ? parsePlanPhases(content).map((phase) => phase.id) : null;
}

module.exports = {
  appendPhaseCheckpoint,
  formatMinutes,
  ledgerPath,
  planPhaseIds,
  projectProgress,
  readPhaseCheckpoints
};
