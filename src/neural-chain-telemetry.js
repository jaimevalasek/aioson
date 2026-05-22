'use strict';

/**
 * Neural Chain — shared chain_audit telemetry emit helper.
 *
 * Single emitter used by both the CLI command (`src/commands/chain-audit.js`)
 * and the post-session hook (`src/neural-chain-agent-ingest.js`) so payload
 * shape is identical across code paths (BR-NC-10).
 *
 * Spec payload schema (BR-NC-10), 8 required fields:
 *   feature_slug         — string | null
 *   source_files         — string[] (the files edited in this session, plural)
 *   impacts_found        — number | null (null on query failure)
 *   auto_fixable_count   — number (per BR-NC-02/03 classification)
 *   noise_file           — string | null (path written, if any)
 *   tokens_used          — number (V1 placeholder = 0; M2 hooks LLM-mediated path)
 *   duration_ms          — number (audit query elapsed; 0 on no-op)
 *   error                — string | null
 *
 * Emitters may attach extra context fields (e.g. `agent`, `autonomy_mode`,
 * `chain_auto_threshold`, `ingest_stats`, `skipped_reason`) on top of the
 * required schema — those are passed through verbatim.
 *
 * EC-NC-05 no-op event (empty artifact list) also populates `duration_ms = 0`
 * and `error = null` so downstream aggregation never has to special-case the
 * skip path. Hotfix v1.17.1 — bug-found-003 from @tester gap-fill audit.
 */

const REQUIRED_FIELDS = Object.freeze([
  'feature_slug',
  'source_files',
  'impacts_found',
  'auto_fixable_count',
  'noise_file',
  'tokens_used',
  'duration_ms',
  'error'
]);

function normalizeSourceFiles(value) {
  if (Array.isArray(value)) return value.slice();
  if (value === null || value === undefined) return [];
  return [String(value)];
}

function buildChainAuditPayload({
  feature_slug = null,
  source_files = [],
  impacts_found = 0,
  auto_fixable_count = 0,
  noise_file = null,
  tokens_used = 0,
  duration_ms = 0,
  error = null,
  ...extras
} = {}) {
  return {
    feature_slug,
    source_files: normalizeSourceFiles(source_files),
    impacts_found,
    auto_fixable_count,
    noise_file,
    tokens_used,
    duration_ms,
    error,
    ...extras
  };
}

function emitChainAuditEvent(db, { agent = null, message = 'chain:audit', ...payloadOverrides } = {}) {
  if (!db || typeof db.prepare !== 'function') return false;
  const payload = buildChainAuditPayload(payloadOverrides);
  try {
    db.prepare(`
      INSERT INTO execution_events (event_type, agent_name, message, payload_json, created_at)
      VALUES ('chain_audit', ?, ?, ?, ?)
    `).run(agent, message, JSON.stringify(payload), new Date().toISOString());
    return true;
  } catch (_) {
    // BR-NC-10 best-effort: telemetry failure must never propagate to the caller.
    return false;
  }
}

module.exports = {
  buildChainAuditPayload,
  emitChainAuditEvent,
  normalizeSourceFiles,
  REQUIRED_FIELDS
};
