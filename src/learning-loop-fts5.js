'use strict';

/**
 * FTS5 query helpers for project_learnings_fts (Phase 2 — memory-search-fts5).
 *
 * DD-4 guardrails (.aioson/plans/active-learning-loop/decision-search-ranking.md):
 *  - Bind parameters only; no string interpolation.
 *  - Phrase-query wrap as default sanitization; FTS5 operators are V2 opt-in.
 *  - Length cap 500 chars (EC-ALL-08); empty queries rejected.
 *  - ORDER BY rank ASC mandatory.
 *  - Snippet config: snippet(project_learnings_fts, -1, ...).
 *  - target_type derived via CASE on promoted_to (column does not live in
 *    project_learnings; rules-promoted-from-learnings carry promoted_to set).
 */

const QUERY_MAX_CHARS = 500;
const SURFACE_VALUES = new Set(['all', 'rules', 'learnings']);
const STATUS_DEFAULT_FILTER = ['active', 'promoted']; // AC-ALL-202

function sanitizeFtsQuery(raw) {
  if (raw === undefined || raw === null) return '';
  const text = String(raw).trim();
  if (!text) return '';
  // DD-4 sanitization (refined): tokenize on whitespace, strip embedded quotes and FTS5
  // operator chars per token, wrap each token as a phrase, AND across tokens. Achieves
  // "all keywords present" UX while keeping every token literal — FTS5 operators
  // (*, (, ), :, ^, +, -, ", AND, OR, NOT) cannot leak from user input because each
  // surviving token is quoted. The literal phrase-only default in the architect's
  // guardrail was too tight (≤7/10 precision in the canonical fixture); this token-AND
  // form preserves the same security envelope and unblocks AC-ALL-205.
  // An operator char between two words is searched both ways: the tokenizer
  // splits `context-search` into adjacent `context` + `search` (the phrase
  // "context search"), while a text that spells it `email`/`rerun` holds one
  // glued token — so `e-mail` asks for ("e mail" OR "email"). FTS5 needs an
  // explicit AND next to a group.
  const terms = text
    .split(/\s+/)
    .map(ftsTerm)
    .filter(Boolean);
  return terms.join(terms.some((term) => term.startsWith('(')) ? ' AND ' : ' ');
}

function ftsTerm(token) {
  const unquoted = String(token).replace(/"/g, '');
  const spaced = unquoted.replace(/[*()^:+-]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!spaced) return '';
  const glued = spaced.replace(/ /g, '');
  return spaced.includes(' ') ? `("${spaced}" OR "${glued}")` : `"${spaced}"`;
}

function validateQuery(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return { ok: false, reason: 'query_empty' };
  }
  if (String(raw).length > QUERY_MAX_CHARS) {
    return { ok: false, reason: 'query_too_long', max: QUERY_MAX_CHARS };
  }
  return { ok: true };
}

function normalizeSurface(value) {
  if (!value) return 'all';
  const text = String(value).trim().toLowerCase();
  return SURFACE_VALUES.has(text) ? text : null;
}

function buildSearchSql(options = {}) {
  const surface = options.surface || 'all';
  const includeArchived = Boolean(options.includeArchived);
  const textColumns = options.withText ? ',\n      pl.title AS match_title,\n      pl.evidence AS match_evidence' : '';

  let surfaceClause = '';
  if (surface === 'rules') {
    surfaceClause = " AND pl.promoted_to IS NOT NULL AND pl.promoted_to != ''";
  } else if (surface === 'learnings') {
    surfaceClause = " AND (pl.promoted_to IS NULL OR pl.promoted_to = '')";
  }

  // Phase 2 default uses pl.status as the active-vs-archived signal. When Phase 3
  // ships the evolution_log validity-window, swap this to a JOIN on evolution_log
  // filtered by end_at IS NULL (no API change required — flag stays the same).
  const statusClause = includeArchived
    ? ''
    : ` AND pl.status IN (${STATUS_DEFAULT_FILTER.map(() => '?').join(', ')})`;

  return `
    SELECT
      CASE
        WHEN pl.promoted_to IS NOT NULL AND pl.promoted_to != '' THEN 'rule'
        ELSE 'learning'
      END AS target_type,
      COALESCE(NULLIF(pl.promoted_to, ''), pl.learning_id) AS target_id,
      pl.feature_slug,
      pl.status,
      snippet(project_learnings_fts, -1, '«', '»', '…', 24) AS snippet,
      project_learnings_fts.rank AS score${textColumns}
    FROM project_learnings_fts
    JOIN project_learnings AS pl ON pl.rowid = project_learnings_fts.rowid
    WHERE project_learnings_fts MATCH ?
      ${surfaceClause}
      ${statusClause}
    ORDER BY project_learnings_fts.rank ASC
    LIMIT ?
  `;
}

function searchProjectLearnings(db, options = {}) {
  const validation = validateQuery(options.query);
  if (!validation.ok) {
    return { ok: false, ...validation };
  }
  const surface = normalizeSurface(options.surface);
  if (surface === null) {
    return { ok: false, reason: 'invalid_surface', value: options.surface };
  }

  const limit = Math.max(1, Math.min(Number(options.limit) || 5, 50));
  const sanitized = sanitizeFtsQuery(options.query);
  // H-01 (QA Phase 2): inputs reducible to empty after sanitization (operator-only,
  // quote-only, or any string whose tokens are all stripped) must not reach FTS5 —
  // SQLite would raise `fts5: syntax error near ""`. Return a structured error so the
  // CLI/JSON contract is preserved.
  if (sanitized === '') {
    return { ok: false, reason: 'query_unparseable', value: String(options.query) };
  }

  const sql = buildSearchSql({ surface, includeArchived: Boolean(options.includeArchived) });

  const bindings = [sanitized];
  if (!options.includeArchived) bindings.push(...STATUS_DEFAULT_FILTER);
  bindings.push(limit);

  const rows = db.prepare(sql).all(...bindings);
  return { ok: true, query: String(options.query), surface, limit, results: rows };
}

function wordsOf(text) {
  return new Set(String(text || '').normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean));
}

/**
 * Any-term search for recall lanes: OR across term groups (a group is one word
 * and its variants, e.g. `charges` + `charge`), in bm25 order, keeping only the
 * learnings that carry at least `minMatches` different groups — a task
 * sentence never holds every word of a learning, so all-terms matched nothing,
 * while one shared word is noise. `memory:search` stays all-terms.
 */
function searchAnyProjectLearnings(db, options = {}) {
  const surface = normalizeSurface(options.surface);
  if (surface === null) {
    return { ok: false, reason: 'invalid_surface', value: options.surface };
  }
  const groups = (options.groups || [])
    .map((group) => [...new Set((Array.isArray(group) ? group : [group])
      .map((term) => String(term).replace(/"/g, '').replace(/[*()^:+-]/g, ' ').replace(/\s+/g, ' ').trim())
      .filter(Boolean))])
    .filter((group) => group.length > 0);
  if (groups.length === 0) {
    return { ok: false, reason: 'query_unparseable', value: '' };
  }
  const limit = Math.max(1, Math.min(Number(options.limit) || 5, 50));
  const minMatches = Math.max(1, Number(options.minMatches) || 2);
  const query = [...new Set(groups.flat())].map((term) => `"${term}"`).join(' OR ');

  const sql = buildSearchSql({ surface, includeArchived: Boolean(options.includeArchived), withText: true });
  const bindings = [query];
  if (!options.includeArchived) bindings.push(...STATUS_DEFAULT_FILTER);
  bindings.push(Math.min(limit * 8, 50));

  const results = [];
  for (const row of db.prepare(sql).all(...bindings)) {
    const words = wordsOf(`${row.match_title || ''} ${row.match_evidence || ''}`);
    const matched = groups.filter((group) => group.some((term) => [...wordsOf(term)].every((word) => words.has(word)))).length;
    const result = { ...row, matched_terms: matched };
    delete result.match_title;
    delete result.match_evidence;
    if (matched >= minMatches) results.push(result);
    if (results.length >= limit) break;
  }
  return { ok: true, query, surface, limit, results };
}

module.exports = {
  QUERY_MAX_CHARS,
  SURFACE_VALUES,
  sanitizeFtsQuery,
  validateQuery,
  normalizeSurface,
  buildSearchSql,
  searchProjectLearnings,
  searchAnyProjectLearnings
};
