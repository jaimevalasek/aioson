'use strict';

/**
 * operator-memory — conflict policy + warning surface (Phase 4, v1.15.0).
 *
 * V1 binary policy (PMD-09): project rules in `.aioson/rules/` always win.
 * Operator decisions are unchanged on conflict — only a stderr warning is
 * emitted, debounced per (decision_slug, rule_path) pair via _conflict_state.json
 * with a 60s window (AC-P4-03).
 *
 * Detection (V1 keyword-based — V2 will move to LLM-tagged):
 *   1. Rule frontmatter must opt in: `conflicts_with_signal_types: [authorization, ...]`
 *      Rules without this field generate zero false positives (additive policy).
 *   2. Operator decision's signal_type must intersect rule's `conflicts_with_signal_types`.
 *   3. Keyword overlap ≥ 2 between rule body and decision body (case-insensitive,
 *      stopwords filtered). Configurable via env `AIOSON_OPERATOR_CONFLICT_KEYWORD_THRESHOLD`.
 */

const fs = require('node:fs');
const path = require('node:path');
const { getStorageRoot } = require('./storage');

const DEFAULT_KEYWORD_THRESHOLD = 2;
const DEFAULT_DEBOUNCE_MS = 60_000;
const CONFLICT_STATE_FILE = '_conflict_state.json';

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'to', 'for', 'in', 'on', 'with', 'is', 'be',
  'que', 'de', 'em', 'para', 'sem', 'com', 'um', 'uma', 'os', 'as', 'no', 'na'
]);

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !STOPWORDS.has(w) && w.length >= 3);
}

function keywordOverlap(textA, textB) {
  const a = new Set(tokenize(textA));
  const b = new Set(tokenize(textB));
  if (a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  for (const t of a) if (b.has(t)) overlap += 1;
  return overlap;
}

function parseRuleFrontmatter(content) {
  const m = content.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const out = {};
  let inList = null;
  for (const rawLine of m[1].split('\n')) {
    if (inList) {
      const listItem = rawLine.match(/^\s+-\s+(.*)$/);
      if (listItem) {
        out[inList].push(listItem[1].trim().replace(/^['"]|['"]$/g, ''));
        continue;
      } else if (rawLine.trim() === '' || /^[a-z_]+:/.test(rawLine)) {
        inList = null;
        // fall through to parse this line as regular field
      }
    }
    const arrayLineMatch = rawLine.match(/^([a-z_]+):\s*\[(.*)\]$/);
    if (arrayLineMatch) {
      out[arrayLineMatch[1]] = arrayLineMatch[2].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
      continue;
    }
    const listStartMatch = rawLine.match(/^([a-z_]+):\s*$/);
    if (listStartMatch) {
      out[listStartMatch[1]] = [];
      inList = listStartMatch[1];
      continue;
    }
    const fieldMatch = rawLine.match(/^([a-z_]+):\s*(.+)$/);
    if (fieldMatch) {
      let v = fieldMatch[2].trim();
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
      out[fieldMatch[1]] = v;
    }
  }
  return out;
}

function readRule(rulePath) {
  const content = fs.readFileSync(rulePath, 'utf8');
  const fm = parseRuleFrontmatter(content);
  const body = content.replace(/^---\n[\s\S]*?\n---\n?/, '');
  return { frontmatter: fm || {}, body, path: rulePath };
}

function scanProjectRules(projectRoot) {
  const rulesDir = path.join(projectRoot, '.aioson', 'rules');
  if (!fs.existsSync(rulesDir)) return [];
  const files = fs.readdirSync(rulesDir).filter((f) => f.endsWith('.md') && f !== 'README.md');
  return files.map((f) => readRule(path.join(rulesDir, f)));
}

/**
 * Detect conflicts between loaded operator decisions and project rules.
 *
 * @param {Array<object>} decisions — decisions to check (e.g. matched by preflightLoad)
 * @param {Array<object>} rules — output of scanProjectRules(projectRoot)
 * @param {object} options — { threshold }
 * @returns {Array<{decision_slug, rule_path, rule_basename, reason, severity, overlap}>}
 */
function detectConflicts(decisions, rules, options = {}) {
  const threshold = options.threshold || DEFAULT_KEYWORD_THRESHOLD;
  const conflicts = [];

  for (const decision of decisions) {
    for (const rule of rules) {
      const conflictSignals = rule.frontmatter.conflicts_with_signal_types;
      if (!Array.isArray(conflictSignals) || conflictSignals.length === 0) continue;
      if (!conflictSignals.includes(decision.signal_type)) continue;
      const overlap = keywordOverlap(rule.body, decision.body || decision.proposal || '');
      if (overlap >= threshold) {
        conflicts.push({
          decision_slug: decision.slug,
          rule_path: rule.path,
          rule_basename: path.basename(rule.path),
          severity: 'warning',
          overlap,
          reason: `keyword overlap=${overlap} ≥ threshold=${threshold}, signal_type=${decision.signal_type} in rule.conflicts_with_signal_types`
        });
      }
    }
  }

  return conflicts;
}

function formatConflictWarning(conflict) {
  return `⚠ Operator memory '${conflict.decision_slug}' conflicts with project rule '${conflict.rule_basename}'. Project rule applies.`;
}

function conflictStatePath(identity) {
  return path.join(getStorageRoot(identity), CONFLICT_STATE_FILE);
}

function loadConflictState(identity) {
  const p = conflictStatePath(identity);
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return {};
  }
}

function saveConflictState(identity, state) {
  const p = conflictStatePath(identity);
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(tmp, p);
}

/**
 * Filter conflicts to those whose debounce window has elapsed.
 * Updates state file with new last_warned_at timestamps for emitted ones.
 *
 * @returns {Array} subset of conflicts that should be emitted right now
 */
function debounceConflicts(identity, conflicts, options = {}) {
  if (conflicts.length === 0) return [];
  const debounceMs = options.debounceMs || DEFAULT_DEBOUNCE_MS;
  const state = loadConflictState(identity);
  const now = Date.now();
  const toEmit = [];
  let stateChanged = false;
  for (const c of conflicts) {
    const key = `${c.decision_slug}::${c.rule_basename}`;
    const last = state[key];
    if (!last || (now - new Date(last).getTime()) >= debounceMs) {
      toEmit.push(c);
      state[key] = new Date(now).toISOString();
      stateChanged = true;
    }
  }
  if (stateChanged) {
    try { saveConflictState(identity, state); } catch { /* non-fatal */ }
  }
  return toEmit;
}

module.exports = {
  detectConflicts,
  debounceConflicts,
  formatConflictWarning,
  scanProjectRules,
  readRule,
  parseRuleFrontmatter,
  keywordOverlap,
  tokenize,
  loadConflictState,
  saveConflictState,
  DEFAULT_KEYWORD_THRESHOLD,
  DEFAULT_DEBOUNCE_MS,
  CONFLICT_STATE_FILE
};
