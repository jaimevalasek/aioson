'use strict';

/**
 * aioson memory:search "<query>" — full-text search over project_learnings + promoted rules.
 *
 * Active Learning Loop Phase 2 (DD-4: BM25 default via ORDER BY rank ASC).
 * Tier-1 silent telemetry-wise (no runtime:emit per DD-4 guardrail #8) but writes
 * results to stdout (or JSON if --json) — this is a user-facing CLI verb, not a
 * background hook.
 *
 * Usage:
 *   aioson memory:search "<query>" [--limit=5] [--surface=rules|learnings|all]
 *                                  [--include-archived] [--json]
 */

const path = require('node:path');
const { openRuntimeDb } = require('../runtime-store');
const { searchProjectLearnings, QUERY_MAX_CHARS } = require('../learning-loop-fts5');

function tFn(t, key, params) {
  if (typeof t === 'function') {
    try { return t(key, params || {}); } catch { /* fall through */ }
  }
  return null;
}

function stripDelimiters(snippet) {
  if (!snippet) return '';
  return String(snippet).replace(/«|»/g, '');
}

function formatTextResults(results) {
  const lines = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    lines.push(
      `${i + 1}. [${r.target_type}] ${r.target_id} (status=${r.status}${r.feature_slug ? `, feature=${r.feature_slug}` : ''}, score=${Number(r.score).toFixed(4)})`
    );
    lines.push(`   ${stripDelimiters(r.snippet)}`);
  }
  return lines.join('\n');
}

async function runMemorySearch({ args, options = {}, logger, t }) {
  const targetDir = path.resolve(process.cwd(), args[1] !== undefined ? args[1] : '.');
  // Positional 0 is the query string. Some shells will pass it as args[0].
  const query = args[0] !== undefined && args[0] !== null && String(args[0]).trim() !== ''
    ? String(args[0])
    : (options.query ? String(options.query) : '');

  const wantJson = Boolean(options.json);
  const log = (msg) => { if (logger && typeof logger.log === 'function') logger.log(msg); };

  if (!query || !query.trim()) {
    const msg = tFn(t, 'memory_search.query_empty') || `memory:search requires a non-empty query.`;
    if (wantJson) return { ok: false, reason: 'query_empty' };
    log(msg);
    return { ok: false, reason: 'query_empty' };
  }
  if (query.length > QUERY_MAX_CHARS) {
    const msg = tFn(t, 'memory_search.query_too_long', { max: QUERY_MAX_CHARS })
      || `memory:search query exceeds ${QUERY_MAX_CHARS} chars.`;
    if (wantJson) return { ok: false, reason: 'query_too_long', max: QUERY_MAX_CHARS };
    log(msg);
    return { ok: false, reason: 'query_too_long' };
  }

  const limit = options.limit !== undefined ? Number(options.limit) : 5;
  const surface = options.surface || 'all';
  const includeArchived = Boolean(options['include-archived'] || options.includeArchived);

  let dbHandle;
  try {
    dbHandle = await openRuntimeDb(targetDir);
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    if (wantJson) return { ok: false, reason: 'runtime_db_unavailable', error: message };
    log(`memory:search runtime db unavailable: ${message}`);
    return { ok: false, reason: 'runtime_db_unavailable' };
  }

  const { db } = dbHandle;
  let outcome;
  try {
    outcome = searchProjectLearnings(db, { query, limit, surface, includeArchived });
  } finally {
    db.close();
  }

  if (!outcome.ok) {
    if (outcome.reason === 'invalid_surface') {
      const msg = tFn(t, 'memory_search.invalid_surface', { value: outcome.value })
        || `memory:search invalid --surface value: ${outcome.value}.`;
      if (wantJson) return { ok: false, reason: 'invalid_surface', value: outcome.value };
      log(msg);
      return { ok: false, reason: 'invalid_surface' };
    }
    if (outcome.reason === 'query_unparseable') {
      const msg = tFn(t, 'memory_search.query_unparseable', { value: outcome.value })
        || `memory:search query reduces to empty after sanitization: "${outcome.value}".`;
      if (wantJson) return { ok: false, reason: 'query_unparseable', value: outcome.value };
      log(msg);
      return { ok: false, reason: 'query_unparseable' };
    }
    if (wantJson) return outcome;
    log(`memory:search rejected: ${outcome.reason}`);
    return outcome;
  }

  const { results } = outcome;
  if (wantJson) {
    return {
      ok: true,
      query: outcome.query,
      surface: outcome.surface,
      limit: outcome.limit,
      result_count: results.length,
      results
    };
  }

  if (results.length === 0) {
    const msg = tFn(t, 'memory_search.no_results', { query }) || `No matches for "${query}".`;
    log(msg);
    return { ok: true, result_count: 0 };
  }

  const header = tFn(t, 'memory_search.results_header', { count: results.length, query })
    || `Top ${results.length} hits for "${query}":`;
  log(header);
  log(formatTextResults(results));
  return { ok: true, result_count: results.length };
}

module.exports = { runMemorySearch };
