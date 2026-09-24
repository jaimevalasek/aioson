'use strict';

/**
 * context:usage — the aggregate reader for the knowledge-routing telemetry.
 *
 * `context:brief` records every selection decision (`brief_built`),
 * `context:load` records every confirmed load (`rule_loaded` / `doc_loaded` /
 * `skill_loaded` / `brain_loaded`), and `agent:done` records every session end.
 * Until now those rows were only written; nothing read them back, so
 * "is this rule ever offered at runtime?", "did the agent consult its brief
 * before closing?" and "which skill has been dead for a month?" stayed guesses.
 *
 * This module folds the window into three views and four deterministic flags:
 *   - per artifact: selected (by a brief) × loaded (by context:load)
 *   - per agent: briefs × loads × session ends
 *   - flags: loaded_never_selected (routing gap — the agent needed it and the
 *     selector never offered it), selected_never_loaded (offered, never
 *     confirmed — only when loads are instrumented at all), skills_never_selected
 *     (active registry skills the window never routed: trigger or retirement
 *     candidates), done_without_brief (an agent whose kernel mandates
 *     `context:brief` closed sessions without one), sessions_without_brief
 *     (the same, counted per session for agents that brief only sometimes),
 *     generic_brief_sessions (sessions whose only briefs named workflow words,
 *     so no domain rule could route).
 *
 * Advisory by contract: no runtime store means "nothing recorded", never an
 * error; the reader opens the database and closes it before returning.
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const { openRuntimeDb, runtimeStoreExists } = require('../runtime-store');

const DEFAULT_SINCE_DAYS = 30;
const LOAD_EVENT_TYPES = new Set(['rule_loaded', 'brain_loaded', 'doc_loaded', 'skill_loaded']);
// A live/tracked session end writes `agent_done`; a standalone `agent:done`
// creates and finishes its own run (`finished`, or `failed`); the workflow
// engine writes `stage_completed`. All of them are "the agent closed" — and a
// run that wrote two of them (`agent:done --verdict` writes `finished` AND
// `agent_done`) closed once, so session ends are counted per run key.
const DONE_EVENT_TYPES = new Set(['agent_done', 'stage_completed', 'finished', 'failed']);

// `--since` is a number of days; a bare `--since` parses as `true`, and
// Number(true) is a silent 1-day window — booleans and junk mean the default.
function resolveSinceDays(raw) {
  const candidate = typeof raw === 'number'
    ? raw
    : (typeof raw === 'string' && /^\d+(?:\.\d+)?$/.test(raw.trim()) ? Number(raw.trim()) : NaN);
  return Number.isFinite(candidate) && candidate > 0 ? candidate : DEFAULT_SINCE_DAYS;
}

function normalizeRel(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\.\//, '').trim();
}

function isoDaysAgo(days) {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

// Brief rows carry the bare agent id, run rows the `@`-prefixed one; one key.
// A shell that keeps quotes literal (cmd.exe: `--agent='dev'`) stored `'dev'`
// rows — a separate agent that escaped every brief check.
function normalizeAgent(value) {
  const bare = String(value || '').trim().replace(/^['"`]+|['"`]+$/g, '').trim().replace(/^@/, '').replace(/^['"`]+|['"`]+$/g, '');
  return bare || null;
}

function parsePayload(json) {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

async function readActiveSkills(targetDir) {
  try {
    const registry = JSON.parse(await fs.readFile(path.join(targetDir, '.aioson', 'skills', 'registry.json'), 'utf8'));
    return (registry.skills || [])
      .filter((skill) => skill && skill.path && String(skill.status || 'active') !== 'deprecated')
      .map((skill) => ({ id: skill.id, path: normalizeRel(skill.path) }));
  } catch {
    return [];
  }
}

// The kernel is the contract: an agent whose file tells it to run
// `context:brief` promised to consult routed knowledge. No hardcoded list —
// a consumer agent that adopts the line is measured the same way.
async function kernelRequiresBrief(targetDir, agent) {
  try {
    const text = await fs.readFile(path.join(targetDir, '.aioson', 'agents', `${agent}.md`), 'utf8');
    return text.includes('context:brief');
  } catch {
    return false;
  }
}

function touch(map, key, seed) {
  if (!map.has(key)) map.set(key, seed());
  return map.get(key);
}

async function collectContextUsage(targetDir, options = {}) {
  const sinceDays = resolveSinceDays(options.since);
  const since = isoDaysAgo(sinceDays);
  const feature = options.feature ? String(options.feature).trim() : null;

  if (!(await runtimeStoreExists(targetDir))) {
    return { ok: true, available: false, reason: 'runtime_store_missing', since, since_days: sinceDays, feature };
  }

  const { db, dbPath } = await openRuntimeDb(targetDir, { mustExist: true });
  let rows;
  try {
    rows = db.prepare(`
      SELECT agent_name, event_type, source, run_key, payload_json, created_at
      FROM execution_events
      WHERE created_at >= ?
        AND (source IN ('context_brief', 'context_load')
             OR event_type IN ('agent_done', 'stage_completed', 'finished', 'failed'))
      ORDER BY created_at ASC, id ASC
    `).all(since);
  } finally {
    db.close();
  }

  const artifacts = new Map();
  const agents = new Map();
  const seedArtifact = (relPath) => () => ({ path: relPath, selected: 0, loaded: 0, sections: new Set(), last_selected_at: null, last_loaded_at: null });
  const seedAgent = (name) => () => ({ agent: name, briefs: 0, generic_briefs: 0, loads: 0, dones: 0, dones_without_brief: 0, dones_with_generic_brief_only: 0, last_brief_at: null, last_done_at: null });
  // Per-session trajectory: what each agent asked for since its previous
  // close. A per-agent total hid 150 of 185 dev closes behind 35 briefs.
  const sinceLastDone = new Map();
  const SAME_CLOSE_WINDOW_MS = 5 * 60 * 1000;

  let briefs = 0;
  let loads = 0;
  let dones = 0;
  const doneRuns = new Set();

  for (const row of rows) {
    const payload = parsePayload(row.payload_json) || {};
    const agent = normalizeAgent(row.agent_name) || normalizeAgent(payload.agent_name);
    const rowFeature = payload.feature_slug ? String(payload.feature_slug).trim() : null;
    // Session ends carry no feature slug: a feature scope keeps them (they
    // are per agent), otherwise `--feature` zeroed every done and the
    // done_without_brief flag could never fire inside a feature.
    const isSessionEnd = DONE_EVENT_TYPES.has(row.event_type);
    if (feature && !isSessionEnd && rowFeature !== feature) continue;

    if (row.event_type === 'brief_built') {
      briefs += 1;
      if (agent) {
        const entry = touch(agents, agent, seedAgent(agent));
        entry.briefs += 1;
        if (payload.generic_task === true) entry.generic_briefs += 1;
        entry.last_brief_at = row.created_at;
        const trail = sinceLastDone.get(agent) || { briefed: false, domain: false, lastDoneAt: null };
        trail.briefed = true;
        if (payload.generic_task !== true) trail.domain = true;
        sinceLastDone.set(agent, trail);
      }
      const selections = [
        ['must_load', payload.must_load],
        ['should_load', payload.should_load],
        ['skills', payload.skills],
        // `related` is the brief's recall section: offered, so a load of it
        // is not a routing gap.
        ['related', payload.related]
      ];
      for (const [section, list] of selections) {
        for (const relPath of Array.isArray(list) ? list : []) {
          const key = normalizeRel(relPath);
          if (!key) continue;
          const entry = touch(artifacts, key, seedArtifact(key));
          entry.selected += 1;
          entry.sections.add(section);
          entry.last_selected_at = row.created_at;
        }
      }
      continue;
    }

    if (LOAD_EVENT_TYPES.has(row.event_type)) {
      const key = normalizeRel(payload.target_path);
      if (!key) continue;
      loads += 1;
      const entry = touch(artifacts, key, seedArtifact(key));
      entry.loaded += 1;
      entry.last_loaded_at = row.created_at;
      if (agent) touch(agents, agent, seedAgent(agent)).loads += 1;
      continue;
    }

    if (isSessionEnd && agent) {
      if (row.run_key) {
        if (doneRuns.has(row.run_key)) continue;
        doneRuns.add(row.run_key);
      }
      dones += 1;
      const entry = touch(agents, agent, seedAgent(agent));
      entry.dones += 1;
      entry.last_done_at = row.created_at;
      const trail = sinceLastDone.get(agent) || { briefed: false, domain: false, lastDoneAt: null };
      const doneAt = Date.parse(row.created_at);
      // A tracked close writes agent_done and the engine stage_completed under
      // different run keys: a second close moments later is the same session.
      const repeatClose = !trail.briefed && trail.lastDoneAt !== null
        && Number.isFinite(doneAt) && doneAt - trail.lastDoneAt < SAME_CLOSE_WINDOW_MS;
      if (!repeatClose) {
        if (!trail.briefed) entry.dones_without_brief += 1;
        else if (!trail.domain) entry.dones_with_generic_brief_only += 1;
      }
      sinceLastDone.set(agent, { briefed: false, domain: false, lastDoneAt: Number.isFinite(doneAt) ? doneAt : trail.lastDoneAt });
    }
  }

  const artifactRows = [...artifacts.values()]
    .map((entry) => ({ ...entry, sections: [...entry.sections].sort() }))
    .sort((a, b) => (b.selected - a.selected) || (b.loaded - a.loaded) || a.path.localeCompare(b.path));
  const agentRows = [...agents.values()].sort((a, b) => a.agent.localeCompare(b.agent));

  const loadedNeverSelected = artifactRows.filter((entry) => entry.loaded > 0 && entry.selected === 0).map((entry) => entry.path);
  const selectedNeverLoaded = loads > 0
    ? artifactRows.filter((entry) => entry.selected >= 2 && entry.loaded === 0).map((entry) => entry.path)
    : [];

  const activeSkills = await readActiveSkills(targetDir);
  const skillsNeverSelected = activeSkills
    .filter((skill) => !artifacts.has(skill.path) || artifacts.get(skill.path).selected === 0)
    .map((skill) => ({ id: skill.id, path: skill.path }));

  const doneWithoutBrief = [];
  for (const entry of agentRows) {
    if (entry.dones === 0 || entry.briefs > 0) continue;
    if (await kernelRequiresBrief(targetDir, entry.agent)) doneWithoutBrief.push(entry.agent);
  }

  // Partial skips: agents that brief SOME sessions. done_without_brief only
  // names agents with zero briefs, so a kernel skipped on most closes stayed
  // invisible. Generic-only: every brief of the session named workflow words
  // only, so no domain rule could route.
  const sessionsWithoutBrief = [];
  const genericBriefSessions = [];
  // A feature scope drops other features' briefs but keeps every close, so
  // the per-session trajectory is only honest on the unscoped window.
  for (const entry of feature ? [] : agentRows) {
    if (entry.dones === 0) continue;
    if (!(await kernelRequiresBrief(targetDir, entry.agent))) continue;
    if (entry.briefs > 0 && entry.dones_without_brief > 0) {
      sessionsWithoutBrief.push({ agent: entry.agent, dones: entry.dones, without_brief: entry.dones_without_brief });
    }
    if (entry.dones_with_generic_brief_only > 0) {
      genericBriefSessions.push({ agent: entry.agent, dones: entry.dones, generic_only: entry.dones_with_generic_brief_only });
    }
  }

  const caveats = [];
  if (feature) {
    caveats.push('Session ends are counted per agent, not per feature — a feature scope narrows briefs and loads only.');
  }
  if (loads === 0) {
    caveats.push('No context:load events in the window — the loaded side is only recorded when agents confirm loads through `aioson context:load`; brief selections are measured regardless.');
  }
  if (briefs === 0) {
    caveats.push('No context:brief events in the window — nothing was routed through the selector, or agents read knowledge without asking for a brief. brief_built rows exist only since the context:brief telemetry shipped (v1.65): session ends older than that upgrade predate the instrument, so judge the pattern from new sessions on.');
  }

  return {
    ok: true,
    available: true,
    db_path: dbPath,
    since,
    since_days: sinceDays,
    feature,
    totals: {
      briefs,
      loads,
      dones,
      artifacts_selected: artifactRows.filter((entry) => entry.selected > 0).length,
      artifacts_loaded: artifactRows.filter((entry) => entry.loaded > 0).length
    },
    agents: agentRows,
    artifacts: artifactRows,
    flags: {
      loaded_never_selected: loadedNeverSelected,
      selected_never_loaded: selectedNeverLoaded,
      skills_never_selected: skillsNeverSelected,
      done_without_brief: doneWithoutBrief,
      sessions_without_brief: sessionsWithoutBrief,
      generic_brief_sessions: genericBriefSessions
    },
    caveats
  };
}

module.exports = { collectContextUsage, kernelRequiresBrief, normalizeAgent, DEFAULT_SINCE_DAYS };
