'use strict';

/**
 * Plan-time dependency inference (`aioson execution:dependencies`).
 *
 * A plan written as one queue per lane runs as a queue: a unit without
 * `Depends on` edges waits for the previous unit of its lane (or the whole
 * wave). Many of those waits are not real dependencies. Here Jev judges, for
 * every pair of units in the same lane, whether the later one needs something
 * the earlier one creates; the planner gets
 *
 *  - the confirmed dependencies, reduced to the direct ones, written as a
 *    `Depends on` cell with the `(dev)` gate — the implementation may start on
 *    the dependency's implementation, and the engine still makes the review
 *    wait for the dependency's review;
 *  - the pairs Jev could not decide, to settle once (default: dependent);
 *  - a suggested wave per row (its depth in the graph), so an independent
 *    unit is not held behind a wave barrier;
 *  - the projected makespan of the plan as written and as suggested.
 *
 * Only metadata is judged (unit id, lane, paths, the Implementation Delta's
 * required change per path, CAP and AC behaviour from the PRD). Without a
 * ready Jev the command returns the setup steps instead. Explicit prerequisites,
 * including cross-lane and integration edges, always retain their declared gate.
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const { parseExecutionWaves, parseDevelopmentLanes } = require('../harness/plan-waves');
const { pathOwns } = require('./execution-plan');
const { extractIds, AC_ID_RE, CAP_ID_RE } = require('../lib/feature-completeness-format');
const { runJevJudgment } = require('../lib/jev-judgment');
const { loadJevConfig } = require('../lib/jev-config');
const { acceptanceText, deltaChanges } = require('./execution-jev');

const DEFAULT_CONCURRENCY = 6;
const DEFAULT_DEV_MINUTES = 8;
const DEFAULT_QA_MINUTES = 14;
const TUTORIAL = 'tutorials/orquestration-jev/index.html';

/** What the user does to turn Jev on — shown whenever it is not ready. */
function jevSetupSteps(config) {
  const keyName = config?.keyName || config?.apiKeyEnv || 'OPENROUTER_API_KEY';
  return [
    `Put the key in a git-ignored place, e.g. the project .env: ${keyName}=sk-or-v1-...  (never paste it into a chat)`,
    'Enable Jev in aioson-models.json at the project root (git-ignored): { "providers": { "openrouter": { "api_key": "OPENROUTER_API_KEY" } }, "jev": { "enabled": true, "route": "openrouter" } }',
    'Confirm with: aioson jev:judge . --check',
    `Guide: ${TUTORIAL} in the AIOSON repository`
  ];
}

function clip(value, max) {
  const text = String(value ?? '').trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** The lane whose write paths own most of the row's files; null when none owns any. */
function laneOf(files, lanes) {
  let best = null;
  let bestCount = 0;
  for (const lane of lanes) {
    const count = files.filter((file) => lane.write_paths.some((writePath) => pathOwns(writePath, file))).length;
    if (count > bestCount) {
      best = lane.lane;
      bestCount = count;
    }
  }
  return best;
}

function rowsOf(planContent) {
  const rows = parseExecutionWaves(planContent) || [];
  const lanes = (parseDevelopmentLanes(planContent)?.rows || []).filter((lane) => lane.write_paths.length > 0);
  return rows.map((row, index) => ({
    phase: String(row.phase).trim(),
    wave: row.wave,
    index,
    files: row.files_raw || row.files || [],
    scope: row.scope || '',
    depends: row.depends || [],
    lane: lanes.length > 0 ? laneOf(row.files_raw || row.files || [], lanes) : 'single',
    caps: extractIds(row.scope, CAP_ID_RE),
    acs: extractIds(row.scope, AC_ID_RE)
  }));
}

function resolveDeclaredDependencies(rows) {
  for (const row of rows) {
    const resolved = new Map();
    for (const dep of row.depends) {
      const targets = /^\d+$/.test(dep.phase)
        ? rows.filter((candidate) => candidate.phase.match(/\d+/)?.[0] === dep.phase)
        : rows.filter((candidate) => candidate.phase === dep.phase);
      if (targets.length === 0) return `phase "${row.phase}" depends on unknown phase "${dep.phase}"`;
      for (const target of targets) {
        if (target.wave >= row.wave) return `phase "${row.phase}" depends on "${target.phase}" outside an earlier wave`;
        const previous = resolved.get(target.phase);
        resolved.set(target.phase, {
          phase: target.phase,
          gate: previous?.gate === 'after_qa' ? previous.gate : dep.gate
        });
      }
    }
    row.depends = [...resolved.values()];
  }
  return null;
}

function evidence(row, context) {
  const changes = deltaChanges(context.planContent, row.caps);
  return {
    id: row.phase,
    lane: row.lane,
    scope: clip(row.scope, 300),
    files: row.files.slice(0, 30),
    changes: row.files.filter((file) => changes[file]).slice(0, 20).map((file) => ({ path: file, ...changes[file] })),
    capabilities: row.caps.slice(0, 10),
    acceptance: row.acs.slice(0, 10).map((id) => ({ id, behaviour: context.acs[id] || null }))
  };
}

function dependencySpec(earlier, later, context) {
  return {
    version: 1,
    id: 'execution-dependency',
    state: { earlier: evidence(earlier, context), later: evidence(later, context) },
    questions: {
      needs: {
        type: 'choice',
        instructions: 'Can the later unit be implemented correctly before the earlier unit exists?',
        criteria: {
          depends: 'No: the later unit calls, imports, extends, migrates on top of, renders or tests something the earlier unit creates (a function, type, table, column, route, component or file).',
          independent: 'Yes: the later unit needs nothing the earlier unit creates; they only belong to the same feature.'
        }
      }
    },
    decision: { type: 'select', question: 'needs', min_confidence: 0.7, min_probability: 0.7, on_uncertain: 'depends' }
  };
}

async function mapConcurrent(items, concurrency, task) {
  const results = new Array(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await task(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, worker));
  return results;
}

/** Direct dependencies only: drop A from B's list when another dependency of B already needs A. */
function reduceTransitive(deps) {
  const reachable = (from, target, seen = new Set()) => {
    for (const next of deps.get(from) || []) {
      if (next === target) return true;
      if (seen.has(next)) continue;
      seen.add(next);
      if (reachable(next, target, seen)) return true;
    }
    return false;
  };
  const reduced = new Map();
  for (const [unit, list] of deps) {
    reduced.set(unit, list.filter((dep) => !list.some((other) => other !== dep && reachable(other, dep))));
  }
  return reduced;
}

/** Wave = 1 + the deepest dependency's wave. */
function graphWaves(rows, deps) {
  const waves = new Map();
  const depth = (phase, trail = new Set()) => {
    if (waves.has(phase)) return waves.get(phase);
    if (trail.has(phase)) return 1;
    trail.add(phase);
    const own = 1 + Math.max(0, ...(deps.get(phase) || []).map((dep) => depth(dep, trail)));
    waves.set(phase, own);
    return own;
  };
  for (const row of rows) depth(row.phase);
  return waves;
}

/**
 * Makespan with one DEV and one QA duration per unit. `deps` null = the plan as
 * written (explicit edges, else the lane chain behind the previous lane unit at
 * after_qa); otherwise the DEV starts on its dependencies' implementation and
 * the review waits for their review. Units sharing a file never overlap.
 */
function projectMakespan(rows, deps, { devMinutes = DEFAULT_DEV_MINUTES, qaMinutes = DEFAULT_QA_MINUTES, maxConcurrent = 10 } = {}) {
  const ordered = [...rows].sort((a, b) => a.wave - b.wave || a.index - b.index);
  const previousInLane = new Map();
  const last = new Map();
  for (const row of ordered) {
    if (last.has(row.lane)) previousInLane.set(row.phase, last.get(row.lane));
    last.set(row.lane, row.phase);
  }
  const timing = new Map();
  let t = 0;
  let busy = 0;
  const done = (phase) => timing.has(phase) && timing.get(phase).qaEnd !== null && timing.get(phase).qaEnd <= t;
  const devDone = (phase) => timing.has(phase) && timing.get(phase).devEnd <= t;
  const written = (row) => {
    const explicit = row.depends.filter((dep) => rows.some((other) => other.phase === dep.phase));
    if (explicit.length > 0) return {
      dev: explicit.filter((dep) => dep.gate === 'after_dev').map((dep) => dep.phase),
      qa: explicit.map((dep) => dep.phase),
      after_qa: explicit.filter((dep) => dep.gate === 'after_qa').map((dep) => dep.phase)
    };
    const previous = previousInLane.get(row.phase);
    return previous ? { dev: [], qa: [], after_qa: [previous] } : { dev: [], qa: [] };
  };
  const ready = (row) => {
    if (!deps) {
      const rule = written(row);
      return (rule.after_qa || []).every(done) && rule.dev.every(devDone);
    }
    return (deps.get(row.phase) || []).every(devDone)
      && row.depends.filter((dep) => dep.gate === 'after_qa').every((dep) => done(dep.phase));
  };
  const reviewReady = (row) => (deps ? (deps.get(row.phase) || []) : written(row).qa).every(done);
  while (ordered.some((row) => !done(row.phase)) && t < 100000) {
    for (const row of ordered) {
      if (!timing.has(row.phase)) {
        const active = ordered.filter((other) => timing.has(other.phase) && !done(other.phase));
        if (active.length >= maxConcurrent || !ready(row)) continue;
        const files = new Set(row.files.map((file) => file.toLowerCase()));
        if (active.some((other) => other.files.some((file) => files.has(file.toLowerCase())))) continue;
        timing.set(row.phase, { devEnd: t + devMinutes, qaEnd: null });
      }
      const unit = timing.get(row.phase);
      if (unit.qaEnd === null && unit.devEnd <= t && reviewReady(row)) unit.qaEnd = t + qaMinutes;
    }
    busy += ordered.filter((row) => timing.has(row.phase) && !done(row.phase)).length;
    t += 1;
  }
  return { minutes: t, average: t > 0 ? Number((busy / t).toFixed(1)) : 0 };
}

async function inferDependencies({ projectDir, feature, env = process.env, judge = runJevJudgment, loadConfig = loadJevConfig, readFile = fs.readFile, concurrency = DEFAULT_CONCURRENCY, devMinutes, qaMinutes } = {}) {
  const contextDir = path.join(projectDir, '.aioson', 'context');
  const planRelative = `.aioson/context/implementation-plan-${feature}.md`;
  const planContent = await readFile(path.join(contextDir, `implementation-plan-${feature}.md`), 'utf8').catch(() => null);
  if (planContent === null) return { ok: false, status: 'plan_missing', feature, message: `${planRelative} not found`, exitCode: 1 };
  const prdContent = await readFile(path.join(contextDir, `prd-${feature}.md`), 'utf8').catch(() => '');
  const rows = rowsOf(planContent);
  if (rows.length === 0) return { ok: false, status: 'sequence_missing', feature, message: `${planRelative} has no Execution Sequence table (Phase | Wave | Files | Scope | Done when)`, exitCode: 1 };
  const dependencyError = resolveDeclaredDependencies(rows);
  if (dependencyError) return { ok: false, status: 'dependency_invalid', feature, message: dependencyError, exitCode: 1 };

  const config = loadConfig(projectDir, env);
  if (config.status !== 'ready') {
    return { ok: false, status: 'jev_unready', feature, config_status: config.status, config_reason: config.reason || null, setup: jevSetupSteps(config), exitCode: 1 };
  }

  const context = { acs: acceptanceText(prdContent), planContent };
  const ordered = [...rows].sort((a, b) => a.wave - b.wave || a.index - b.index);
  const pairs = [];
  for (let i = 0; i < ordered.length; i += 1) {
    for (let j = i + 1; j < ordered.length; j += 1) {
      if (ordered[i].lane && ordered[i].lane === ordered[j].lane) pairs.push([ordered[i], ordered[j]]);
    }
  }
  const judged = await mapConcurrent(pairs, concurrency, async ([earlier, later]) => {
    try {
      const result = await judge({ spec: dependencySpec(earlier, later, context), config: { ...config, cacheEnabled: false }, projectDir, retries: 1 });
      if (!result?.ok) return { earlier: earlier.phase, later: later.phase, verdict: 'uncertain', reason: result?.status || 'jev_failed' };
      const decision = result.decision;
      if (!decision.accepted) return { earlier: earlier.phase, later: later.phase, verdict: 'uncertain', confidence: decision.confidence };
      return { earlier: earlier.phase, later: later.phase, verdict: decision.selected, confidence: decision.confidence };
    } catch (error) {
      return { earlier: earlier.phase, later: later.phase, verdict: 'uncertain', reason: clip(error?.message, 120) };
    }
  });

  const confirmed = new Map(rows.map((row) => [row.phase, row.depends.map((dep) => dep.phase)]));
  const safe = new Map(rows.map((row) => [row.phase, row.depends.map((dep) => dep.phase)]));
  for (const item of judged) {
    if (item.verdict === 'depends' && !confirmed.get(item.later).includes(item.earlier)) confirmed.get(item.later).push(item.earlier);
    if (item.verdict !== 'independent' && !safe.get(item.later).includes(item.earlier)) safe.get(item.later).push(item.earlier);
  }
  const directConfirmed = reduceTransitive(confirmed);
  const directSafe = reduceTransitive(safe);
  // A transitive DEV path cannot replace an explicitly required QA gate.
  for (const row of rows) {
    for (const graph of [directConfirmed, directSafe]) {
      graph.set(row.phase, [...new Set([...row.depends.map((dep) => dep.phase), ...graph.get(row.phase)])]);
    }
  }
  const safeWaves = graphWaves(rows, directSafe);
  const units = rows.map((row) => ({
    phase: row.phase,
    lane: row.lane,
    wave: row.wave,
    suggested_wave: safeWaves.get(row.phase),
    depends_on: directConfirmed.get(row.phase),
    depends_on_cell: directConfirmed.get(row.phase).length ? directConfirmed.get(row.phase).map((phase) => `${phase} (${row.depends.find((dep) => dep.phase === phase)?.gate === 'after_qa' ? 'qa' : 'dev'})`).join(', ') : '—',
    to_decide: judged.filter((item) => item.later === row.phase && item.verdict === 'uncertain' && !row.depends.some((dep) => dep.phase === item.earlier) && directSafe.get(row.phase).includes(item.earlier)).map((item) => item.earlier)
  }));
  const timing = { devMinutes, qaMinutes };
  return {
    ok: true,
    status: 'inferred',
    feature,
    plan: planRelative,
    pairs: {
      judged: judged.length,
      depends: judged.filter((item) => item.verdict === 'depends').length,
      independent: judged.filter((item) => item.verdict === 'independent').length,
      uncertain: judged.filter((item) => item.verdict === 'uncertain').length
    },
    units,
    projection: {
      assumptions: { dev_minutes: devMinutes || DEFAULT_DEV_MINUTES, qa_minutes: qaMinutes || DEFAULT_QA_MINUTES },
      as_written: projectMakespan(rows, null, timing),
      suggested_uncertain_as_dependency: projectMakespan(rows, directSafe, timing),
      suggested_confirmed_only: projectMakespan(rows, directConfirmed, timing)
    },
    exitCode: 0
  };
}

module.exports = { inferDependencies, jevSetupSteps, reduceTransitive, graphWaves, projectMakespan, rowsOf, laneOf };
