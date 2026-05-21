'use strict';

/**
 * operator-memory — preflight loader + lazy decision matcher (Phase 3, v1.14.0).
 *
 * Architecture-operator-memory.md § Phase 3 data flow:
 *   AIOSON_OPERATOR_MEMORY=true → resolveIdentity → loadMemoryIndex(active)
 *   → matchDecisions(index, task keywords) → return top-N matched slugs
 *   → agent lazy-loads decisions/{slug}.md
 *
 * V1 match heuristic: substring on title + signal_type tag (AC-P3-10).
 * V2: FTS5-backed query optimization (deferred).
 */

const { loadMemoryIndex } = require('./index-md');

const DEFAULT_MAX_MATCHES = 5;
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

/**
 * Match decisions by keyword overlap with task description.
 *
 * @param {object} memoryIndex — output of loadMemoryIndex(identity, 'active')
 * @param {string} taskDescription — current task description / user goal
 * @param {object} options — { maxMatches: number, minOverlap: number }
 * @returns {Array<{slug: string, title: string, score: number}>}
 */
function matchDecisions(memoryIndex, taskDescription, options = {}) {
  if (!memoryIndex || !memoryIndex.entries || memoryIndex.entries.length === 0) return [];
  const max = options.maxMatches || DEFAULT_MAX_MATCHES;
  const minOverlap = options.minOverlap || 1;

  const taskTokens = new Set(tokenize(taskDescription));
  if (taskTokens.size === 0) return [];

  const scored = memoryIndex.entries.map((entry) => {
    const entryTokens = new Set(tokenize(`${entry.title} ${entry.signal_type}`));
    let overlap = 0;
    for (const t of taskTokens) {
      if (entryTokens.has(t)) overlap += 1;
    }
    return { slug: entry.slug, title: entry.title, signal_type: entry.signal_type, score: overlap };
  });

  return scored
    .filter((s) => s.score >= minOverlap)
    .sort((a, b) => b.score - a.score)
    .slice(0, max);
}

/**
 * Convenience wrapper combining load + match + conflict detection for preflight use.
 *
 * @param {string} identity — operator identity hash or override
 * @param {string} taskDescription — current task / user goal
 * @param {object} options — { maxMatches, minOverlap, projectRoot, detectConflicts }
 * @returns {{index, matches, conflicts}} — conflicts is [] when projectRoot absent
 *   OR when Phase 4 conflict detection is not requested.
 */
function preflightLoad(identity, taskDescription, options = {}) {
  const index = loadMemoryIndex(identity, 'active');
  if (!index) return { index: null, matches: [], conflicts: [] };
  const matches = matchDecisions(index, taskDescription, options);

  let conflicts = [];
  if (options.projectRoot && options.detectConflicts !== false) {
    try {
      const { scanProjectRules, detectConflicts, debounceConflicts } = require('./conflict');
      const { readDecision } = require('./decision');
      // Resolve full decision data for matched entries so conflict-body checks have content
      const matchedDecisions = matches
        .map((m) => {
          try {
            const d = readDecision(identity, m.slug);
            return d ? { slug: m.slug, ...d } : null;
          } catch { return null; }
        })
        .filter(Boolean);
      const rules = scanProjectRules(options.projectRoot);
      const detected = detectConflicts(matchedDecisions, rules, options);
      conflicts = options.skipDebounce ? detected : debounceConflicts(identity, detected, options);
    } catch { /* conflict detection failure must not crash preflight */ }
  }

  return { index, matches, conflicts };
}

module.exports = {
  preflightLoad,
  matchDecisions,
  tokenize,
  DEFAULT_MAX_MATCHES,
  STOPWORDS
};
