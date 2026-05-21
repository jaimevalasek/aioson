'use strict';

/**
 * aioson chain:audit <file> [--limit=N] [--feature=<slug>] [--json]
 *
 * Phase 1 Slice 2 read-only command. Queries `chain_edges` for active edges
 * (`end_at IS NULL`) whose `source_path` matches the given file, ranked by
 * confidence DESC. Emits one row in `execution_events` per invocation
 * (`event_type='chain_audit'`) so the guardrail metric — tokens stable per
 * audit — can be tracked via `runtime:emit` semantics (BR-NC-10).
 *
 * Failure mode (BR-NC-11): SQLite locked / read errors NEVER block the
 * caller. The telemetry row is still emitted with `error` populated and the
 * command returns `{ ok: true, impacts_found: 0, error: <msg> }`. Callers
 * that block on the impact list see "no impacts" and proceed; @neo will
 * surface "last audit failed" on its next activation by reading the latest
 * chain_audit event.
 */

const path = require('node:path');
const { openRuntimeDb } = require('../runtime-store');

const DEFAULT_LIMIT = 20;
const HARD_LIMIT_CAP = 200;

function normalizeLimit(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  if (parsed > HARD_LIMIT_CAP) return HARD_LIMIT_CAP;
  return Math.floor(parsed);
}

function emitTelemetry(db, payload, message) {
  try {
    db.prepare(`
      INSERT INTO execution_events (event_type, agent_name, message, payload_json, created_at)
      VALUES ('chain_audit', NULL, ?, ?, ?)
    `).run(message, JSON.stringify(payload), new Date().toISOString());
  } catch (_) {
    // Telemetry failure is non-fatal (BR-NC-10 best-effort).
  }
}

async function runChainAudit({ args, options = {}, logger, t }) {
  const targetDir = path.resolve(process.cwd(), args[0] || '.');
  const json = Boolean(options.json);
  const filePath = options.file || args[1];
  const featureSlug = options.feature ? String(options.feature).trim() : null;
  const limit = normalizeLimit(options.limit);

  if (!filePath) {
    const msg = (t && t('chain_audit.file_required')) ||
      'chain:audit requires a file path. Usage: aioson chain:audit <file> [--limit=N] [--feature=<slug>] [--json]';
    if (logger && typeof logger.log === 'function' && !json) logger.log(msg);
    return { ok: false, reason: 'missing_file' };
  }

  let dbHandle;
  try {
    dbHandle = await openRuntimeDb(targetDir);
  } catch (err) {
    const errMsg = err && err.message ? err.message : String(err);
    if (logger && typeof logger.log === 'function' && !json) {
      logger.log((t && t('chain_audit.runtime_unavailable', { error: errMsg })) ||
        `chain:audit runtime db unavailable: ${errMsg}`);
    }
    return { ok: false, reason: 'runtime_db_unavailable', error: errMsg };
  }

  const { db } = dbHandle;
  const startedAt = Date.now();
  let impacts = [];
  let auditError = null;

  try {
    impacts = db.prepare(`
      SELECT target_path, edge_type, confidence, hit_count, last_seen_at
      FROM chain_edges
      WHERE source_path = ? AND end_at IS NULL
      ORDER BY confidence DESC, hit_count DESC, last_seen_at DESC
      LIMIT ?
    `).all(filePath, limit);
  } catch (err) {
    auditError = err && err.message ? err.message : String(err);
  }

  const durationMs = Date.now() - startedAt;

  emitTelemetry(db, {
    source_file: filePath,
    feature_slug: featureSlug,
    impacts_found: auditError ? null : impacts.length,
    limit_applied: limit,
    duration_ms: durationMs,
    error: auditError
  }, `chain:audit ${filePath} → ${auditError ? 'error' : `${impacts.length} impacts`}`);

  if (auditError) {
    const msg = (t && t('chain_audit.query_failed', { error: auditError })) ||
      `chain:audit failed to query chain_edges: ${auditError}`;
    if (logger && typeof logger.log === 'function' && !json) logger.log(msg);
    // BR-NC-11: failure non-blocking — still return ok with impacts_found=0
    return {
      ok: true,
      source_file: filePath,
      impacts_found: 0,
      duration_ms: durationMs,
      impacts: [],
      error: auditError
    };
  }

  if (logger && typeof logger.log === 'function' && !json) {
    if (impacts.length === 0) {
      logger.log((t && t('chain_audit.no_impacts', { file: filePath, duration: durationMs })) ||
        `chain:audit ${filePath} → no impacts detected (${durationMs}ms)`);
    } else {
      logger.log((t && t('chain_audit.results_header', { file: filePath, count: impacts.length, duration: durationMs })) ||
        `chain:audit ${filePath} → ${impacts.length} impact(s) (${durationMs}ms):`);
      for (const row of impacts) {
        logger.log(`  ${row.target_path} [${row.edge_type}] confidence=${row.confidence.toFixed(2)} hits=${row.hit_count}`);
      }
    }
  }

  return {
    ok: true,
    source_file: filePath,
    impacts_found: impacts.length,
    duration_ms: durationMs,
    impacts
  };
}

module.exports = { runChainAudit, DEFAULT_LIMIT, HARD_LIMIT_CAP };
