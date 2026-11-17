'use strict';

/**
 * The operator's portfolio: what a person chooses across the projects this
 * machine records (project-registry.js), read from each project.context.md,
 * and the standing decisions proven in more than one project.
 *
 * Deterministic and model-free. A choice becomes a suggestion for a new
 * project only on a clear majority: at least SUGGEST_MIN_PROJECTS projects
 * hold a value for it, those are at least half of the portfolio, and one value
 * holds SUGGEST_MIN_SHARE of them. Only choices a person makes are suggested
 * (type, framework, language, Autopilot, test runner): classification is
 * measured from each project's own scope, and the visual system is never a
 * setup question (the design engine's default) — both are shown, never
 * suggested.
 */

const fs = require('node:fs');
const path = require('node:path');
const { parseYamlFrontmatter } = require('../context');
const { livingProjects, contextFile } = require('./project-registry');

const FIELDS = ['project_type', 'framework', 'classification', 'design_skill', 'interaction_language', 'auto_handoff', 'test_runner'];
const SUGGESTABLE = new Set(['project_type', 'framework', 'interaction_language', 'auto_handoff', 'test_runner']);
const SUGGEST_MIN_PROJECTS = 3;
const SUGGEST_MIN_SHARE = 0.6;
const SUGGEST_MIN_FILLED = 0.5;
const HABITS_MAX = 5;

/** The frontmatter of a project.context.md; line by line when strict parsing refuses it. */
function readContextData(dir) {
  let text;
  try { text = fs.readFileSync(contextFile(dir), 'utf8'); } catch { return null; }
  const strict = parseYamlFrontmatter(text);
  if (strict.ok) return strict.data;
  const block = (text.match(/^---\r?\n([\s\S]*?)\r?\n---/) || [])[1];
  if (!block) return null;
  const data = {};
  for (const line of block.split(/\r?\n/)) {
    const match = line.match(/^([a-zA-Z0-9_]+):\s*(.*)$/);
    if (!match) continue;
    const value = match[2].trim().replace(/^(["'])([\s\S]*)\1$/, '$2');
    data[match[1]] = value === 'true' ? true : value === 'false' ? false : value;
  }
  return data;
}

function valueOf(data, field) {
  if (field === 'interaction_language') return String(data.interaction_language || data.conversation_language || '').trim();
  if (field === 'auto_handoff') return data.auto_handoff === true || data.auto_handoff === 'true' ? 'true' : data.auto_handoff === false || data.auto_handoff === 'false' ? 'false' : '';
  return String(data[field] == null ? '' : data[field]).trim();
}

// "Node" and "Node.js", "nextjs" and "Next.js" are one choice; the spelling
// most projects used is the one shown.
function groupKey(field, value) {
  if (field !== 'framework') return value.toLowerCase();
  return value.toLowerCase().replace(/\.js\b/g, '').replace(/js$/, '').replace(/\s+/g, '');
}

function tallyField(rows, field) {
  const groups = new Map();
  for (const row of rows) {
    const value = valueOf(row.data, field);
    if (!value) continue;
    const key = groupKey(field, value);
    const group = groups.get(key) || { count: 0, spellings: new Map() };
    group.count += 1;
    group.spellings.set(value, (group.spellings.get(value) || 0) + 1);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((group) => ({ value: [...group.spellings.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0], count: group.count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

function suggestion(field, tally, total) {
  if (!SUGGESTABLE.has(field) || tally.length === 0) return null;
  const filled = tally.reduce((sum, entry) => sum + entry.count, 0);
  const top = tally[0];
  if (filled < SUGGEST_MIN_PROJECTS || filled < total * SUGGEST_MIN_FILLED) return null;
  if (top.count / filled < SUGGEST_MIN_SHARE) return null;
  return { value: top.value, count: top.count, of: filled };
}

function versionParts(version) {
  const match = String(version || '').match(/(\d+)\.(\d+)\.(\d+)/);
  return match ? match.slice(1).map(Number) : null;
}

function isBehind(version, current) {
  const a = versionParts(version);
  const b = versionParts(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i += 1) if (a[i] !== b[i]) return a[i] < b[i];
  return false;
}

/**
 * Standing decisions proven beyond one project: operator-wide, not archived,
 * and seen in two distinct projects or said for every project in the user's
 * own words. The freshest first.
 */
function loadHabits(identity, { limit = HABITS_MAX, now = Date.now() } = {}) {
  if (!identity) return [];
  const { getStorageRoot } = require('../operator-memory/storage');
  const { parseDecisionFile } = require('../operator-memory/decision');
  const { projectSets, namesCrossProjectScope, SCOPE_OPERATOR } = require('../operator-memory/project-scope');
  const { archiveReason } = require('../operator-memory/archive');
  const dir = path.join(getStorageRoot(identity), 'decisions');
  if (!fs.existsSync(dir)) return [];
  const habits = [];
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.md')) continue;
    let decision;
    try { decision = parseDecisionFile(fs.readFileSync(path.join(dir, file), 'utf8').replace(/\r\n/g, '\n')); } catch { continue; }
    if (!decision || decision.scope !== SCOPE_OPERATOR || archiveReason(decision, now)) continue;
    const projects = projectSets(decision).length;
    if (projects < 2 && !namesCrossProjectScope(decision.quotes || [])) continue;
    const title = (String(decision.body || '').split('\n').find((line) => line.startsWith('# ')) || '').slice(2).trim();
    habits.push({ slug: file.slice(0, -3), title: title.slice(0, 100) || file.slice(0, -3), projects, signal: decision.signal_type, last_reinforced: decision.last_reinforced || decision.promoted_at || '' });
  }
  habits.sort((a, b) => String(b.last_reinforced).localeCompare(String(a.last_reinforced)) || a.slug.localeCompare(b.slug));
  return habits.slice(0, limit);
}

/**
 * The portfolio of the recorded projects. `exclude` leaves one project out
 * (a project being set up must not vote for itself); `identity` adds habits.
 */
function buildPortfolio({ home, identity = null, exclude = null, cliVersion = null, now = Date.now() } = {}) {
  const projects = livingProjects(home).filter((project) => !exclude || path.resolve(project.path).toLowerCase() !== path.resolve(exclude).toLowerCase());
  const rows = projects.map((project) => ({ project, data: readContextData(project.path) })).filter((row) => row.data);
  const choices = {};
  const suggested = {};
  for (const field of FIELDS) {
    choices[field] = tallyField(rows, field);
    const pick = suggestion(field, choices[field], rows.length);
    if (pick) suggested[field] = pick;
  }
  const behind = cliVersion ? rows.filter((row) => isBehind(row.data.aioson_version, cliVersion)) : [];
  return {
    projects: rows.length,
    recent: rows.slice(0, 5).map((row) => ({ name: row.project.name, path: row.project.path, last_seen: row.project.last_seen })),
    choices,
    suggested,
    outdated: cliVersion ? { current: cliVersion, count: behind.length, oldest: behind
      .map((row) => ({ name: row.project.name, version: String(row.data.aioson_version) }))
      .sort((a, b) => (isBehind(a.version, b.version) ? -1 : isBehind(b.version, a.version) ? 1 : a.name.localeCompare(b.name)))
      .slice(0, 5) } : null,
    habits: loadHabits(identity, { now })
  };
}

module.exports = {
  buildPortfolio,
  loadHabits,
  readContextData,
  tallyField,
  isBehind,
  FIELDS,
  SUGGESTABLE,
  SUGGEST_MIN_PROJECTS,
  SUGGEST_MIN_SHARE
};
