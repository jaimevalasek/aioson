'use strict';

/**
 * Projected makespan of a compiled plan under each scheduling policy, with
 * the readiness rules the engine applies: explicit dependencies, otherwise the wave barrier or lane chain at
 * a gate, and never two writers (a DEV, or a review that may fix files) on one
 * file. Reviews start right after their DEV here, so a unit never idles in a
 * review queue holding nothing. Every unit costs one DEV and one QA duration.
 * A planning instrument: it shows how much
 * parallelism the plan's shape allows before any worker is paid for, and which
 * files serialize the units that share them.
 */

const DEFAULT_DEV_MINUTES = 8;
const DEFAULT_QA_MINUTES = 14;
const HOT_FILE_MIN_UNITS = 3;
const POLICIES = [
  { key: 'waves', scheduling: 'waves', lane_gate: null },
  { key: 'lanes_after_qa', scheduling: 'lanes', lane_gate: 'after_qa' },
  { key: 'lanes_after_dev', scheduling: 'lanes', lane_gate: 'after_dev' },
  { key: 'file_ceiling', scheduling: 'files', lane_gate: null }
];

function laneUnitsOf(plan) {
  return (plan?.units || [])
    .map((unit, index) => ({ unit, index }))
    .filter(({ unit }) => unit.owner === 'lane')
    .sort((a, b) => (a.unit.wave - b.unit.wave) || (a.index - b.index))
    .map(({ unit }) => unit);
}

function projectPolicy(units, policy, { devMinutes, qaMinutes, maxConcurrent }) {
  // A lane unit follows the units of its lane in the nearest earlier wave
  // (same rule as the engine); units of one lane in one wave run side by side.
  const lanePredecessors = new Map(units.map((unit) => {
    const earlier = units.filter((other) => other.lane === unit.lane && other.wave < unit.wave);
    const nearest = earlier.length ? Math.max(...earlier.map((other) => other.wave)) : null;
    return [unit.id, earlier.filter((other) => other.wave === nearest).map((other) => other.id)];
  }));
  const files = new Map(units.map((unit) => [unit.id, new Set((unit.files || []).map((file) => file.toLowerCase()))]));
  const timing = new Map();
  const laneIds = new Set(units.map((unit) => unit.id));
  const devDone = (id, t) => timing.has(id) && timing.get(id).devEnd <= t;
  const done = (id, t) => timing.has(id) && timing.get(id).qaEnd <= t;
  const active = (t) => units.filter((unit) => timing.has(unit.id) && timing.get(unit.id).qaEnd > t);
  const ready = (unit, t) => {
    if (policy.scheduling === 'files') return true;
    const dependencies = unit.depends_on || [];
    // Explicit edges replace implicit wave/lane barriers, as in execution-run.
    // Integration belongs to the session DEV, outside this lane projection.
    if (dependencies.length > 0) return dependencies.every((dep) => !laneIds.has(dep.unit)
      || (dep.gate === 'after_dev' ? devDone(dep.unit, t) : done(dep.unit, t)));
    if (policy.scheduling === 'waves') return units.every((other) => other.wave >= unit.wave || done(other.id, t));
    return lanePredecessors.get(unit.id).every((previous) => (policy.lane_gate === 'after_dev' ? devDone(previous, t) : done(previous, t)));
  };
  let t = 0;
  let peak = 0;
  let busy = 0;
  // A unit's duration is whole minutes ≥ 1, so stepping minute by minute is exact.
  while (units.some((unit) => !done(unit.id, t))) {
    for (const unit of units) {
      if (timing.has(unit.id)) continue;
      const running = active(t);
      if (running.length >= maxConcurrent) break;
      if (!ready(unit, t)) continue;
      const mine = files.get(unit.id);
      if (running.some((other) => [...files.get(other.id)].some((file) => mine.has(file)))) continue;
      timing.set(unit.id, { devEnd: t + devMinutes, qaEnd: t + devMinutes + qaMinutes });
    }
    const running = active(t).length;
    if (running === 0) {
      const pending = units.filter((unit) => !done(unit.id, t)).map((unit) => unit.id);
      throw new Error(`Cannot project ${policy.key}: blocked dependencies for ${pending.join(', ')}`);
    }
    peak = Math.max(peak, running);
    busy += running;
    t += 1;
  }
  return { key: policy.key, scheduling: policy.scheduling, lane_gate: policy.lane_gate, minutes: t, peak, average: t > 0 ? Number((busy / t).toFixed(1)) : 0 };
}

/** Files written by at least `minUnits` units: each one serializes those units. */
function hotFiles(units, minUnits = HOT_FILE_MIN_UNITS) {
  const writers = new Map();
  for (const unit of units) {
    for (const file of new Set(unit.files || [])) {
      if (!writers.has(file)) writers.set(file, []);
      writers.get(file).push(unit.id);
    }
  }
  return [...writers.entries()]
    .filter(([, ids]) => ids.length >= minUnits)
    .map(([file, ids]) => ({ path: file, units: ids, lanes: [...new Set(ids.map((id) => units.find((unit) => unit.id === id).lane))] }))
    .sort((a, b) => b.units.length - a.units.length || a.path.localeCompare(b.path));
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Median DEV and QA minutes of the finished attempts a run recorded, or null. */
function measuredDurations(state) {
  const minutes = { dev: [], qa: [] };
  for (const attempt of state?.attempts || []) {
    if (!minutes[attempt.stage] || !attempt.started_at || !attempt.finished_at || attempt.reason === 'process_interrupted') continue;
    const elapsed = (Date.parse(attempt.finished_at) - Date.parse(attempt.started_at)) / 60000;
    if (Number.isFinite(elapsed) && elapsed > 0) minutes[attempt.stage].push(elapsed);
  }
  const dev = median(minutes.dev);
  const qa = median(minutes.qa);
  return dev && qa ? { devMinutes: dev, qaMinutes: qa, samples: minutes.dev.length + minutes.qa.length } : null;
}

function wholeMinutes(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.max(1, Math.round(number)) : fallback;
}

function projectSchedule(plan, { devMinutes, qaMinutes, maxConcurrent, source = 'assumed' } = {}) {
  const units = laneUnitsOf(plan);
  const dev = wholeMinutes(devMinutes, DEFAULT_DEV_MINUTES);
  const qa = wholeMinutes(qaMinutes, DEFAULT_QA_MINUTES);
  const max = Math.max(1, Number(maxConcurrent) || Number(plan?.parallel?.max_concurrent_lanes) || 1);
  return {
    assumptions: { dev_minutes: dev, qa_minutes: qa, max_concurrent: max, source },
    units: units.length,
    policies: units.length === 0 ? [] : POLICIES.map((policy) => projectPolicy(units, policy, { devMinutes: dev, qaMinutes: qa, maxConcurrent: max })),
    hot_files: hotFiles(units)
  };
}

function formatMinutes(minutes) {
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}`;
}

/** One line per policy plus the hottest shared files, for CLI output. */
function formatProjection(projection, { hotLimit = 5 } = {}) {
  if (!projection || projection.policies.length === 0) return [];
  const a = projection.assumptions;
  const labels = { waves: 'waves', lanes_after_qa: 'lanes after_qa', lanes_after_dev: 'lanes after_dev', file_ceiling: 'file ceiling' };
  const lines = [`projection (DEV ${a.dev_minutes} / QA ${a.qa_minutes} min per unit, ${a.source}; max ${a.max_concurrent} at once): ${projection.policies.map((p) => `${labels[p.key]} ${formatMinutes(p.minutes)} (avg ${p.average}, peak ${p.peak})`).join(' · ')}`];
  const hot = projection.hot_files.slice(0, hotLimit);
  if (hot.length > 0) lines.push(`shared files that serialize their units: ${hot.map((file) => `${file.path} ×${file.units.length}`).join(', ')}${projection.hot_files.length > hot.length ? ` (+${projection.hot_files.length - hot.length} more)` : ''}`);
  return lines;
}

module.exports = { projectSchedule, formatProjection, hotFiles, measuredDurations, DEFAULT_DEV_MINUTES, DEFAULT_QA_MINUTES, HOT_FILE_MIN_UNITS };
