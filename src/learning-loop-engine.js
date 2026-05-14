'use strict';

/**
 * Active Learning Loop — Phase 5 distillation orchestrator.
 *
 * `runDistillation({ targetDir, slug, classification, db, timeoutMs })`:
 *
 *  1. Bail out with `skipped_micro` when project/feature classification is MICRO
 *     (PMD-5 / BR-ALL-11).
 *  2. Acquire a row-level lock via `BEGIN IMMEDIATE` + `INSERT INTO evolution_log`
 *     with `event_type='auto_distillation'` and `end_at=NULL` (DD-3 resolution).
 *     If another active distillation for the same slug already exists, return
 *     `lock_held` without running anything.
 *  3. Run `runLearningAutoPromote` against the project (project-wide promotion
 *     is the existing primitive; per-feature filtering is V2 if telemetry shows
 *     drift). A 5s Promise.race timeout (DD-2) is enforced — note that
 *     better-sqlite3 is synchronous so the timeout protects the orchestrator
 *     from runaway external work, not the SQL itself.
 *  4. Release the lock row: UPDATE end_at + payload_json with the summary. On
 *     any failure, write a fresh `distillation_failed` row instead.
 *
 * Best-effort semantics (BR-ALL-05): this engine NEVER throws back to the
 * caller. Every internal failure is captured in the returned result and (for
 * accounting) also persisted to evolution_log.
 */

const path = require('node:path');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');

// NOTE: required lazily inside runDistillation so test-time monkey-patching of
// `learning-auto-promote.runLearningAutoPromote` (failure injection) takes
// effect — direct destructuring would bind the original export.
const autoPromoteModule = require('./commands/learning-auto-promote');

const DEFAULT_TIMEOUT_MS = 5000;
const MICRO = 'MICRO';

function nowIso() {
  return new Date().toISOString();
}

function buildEntryId(eventType, slug) {
  const suffix = crypto.randomBytes(3).toString('hex');
  const tsClean = nowIso().replace(/[:.]/g, '');
  const safeSlug = String(slug || 'unknown').replace(/[^a-zA-Z0-9_.-]/g, '_');
  return `evo-${eventType}-feature-${safeSlug}-${tsClean}-${suffix}`;
}

// PRD frontmatter reader — pull the per-feature classification from the
// canonical `prd-{slug}.md`. Falls back to null when the file is absent.
async function readFeatureClassification(targetDir, slug) {
  const prdPath = path.join(targetDir, '.aioson', 'context', `prd-${slug}.md`);
  try {
    const raw = await fs.readFile(prdPath, 'utf8');
    const match = raw.match(/^classification\s*:\s*["']?([A-Z]+)["']?/m);
    return match ? match[1].trim().toUpperCase() : null;
  } catch {
    return null;
  }
}

// Insert a distillation lock row inside a BEGIN IMMEDIATE transaction. Returns
// `{ acquired: true, lockId }` on success or `{ acquired: false }` when another
// active row already holds the lock.
function acquireDistillationLock(db, slug) {
  // BEGIN IMMEDIATE escalates to a write lock so the SELECT-then-INSERT race
  // window collapses (better-sqlite3 default is autocommit per statement; the
  // immediate transaction holds the lock across both statements).
  db.exec('BEGIN IMMEDIATE');
  try {
    const existing = db.prepare(`
      SELECT id FROM evolution_log
      WHERE feature_slug = ?
        AND event_type = 'auto_distillation'
        AND end_at IS NULL
      LIMIT 1
    `).get(slug);
    if (existing) {
      db.exec('ROLLBACK');
      return { acquired: false, lockHolder: existing.id };
    }
    const lockId = buildEntryId('auto_distillation', slug);
    const startAt = nowIso();
    db.prepare(`
      INSERT INTO evolution_log (
        id, applied_at, deltas_count,
        event_type, target_type, target_id,
        start_at, end_at, reason, actor, feature_slug, payload_json
      ) VALUES (
        @id, @applied_at, 0,
        'auto_distillation', 'feature', @target_id,
        @start_at, NULL, NULL, 'auto', @feature_slug, @payload_json
      )
    `).run({
      id: lockId,
      applied_at: startAt,
      target_id: slug,
      start_at: startAt,
      feature_slug: slug,
      payload_json: JSON.stringify({ state: 'in_progress' })
    });
    db.exec('COMMIT');
    return { acquired: true, lockId, startAt };
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch { /* swallow */ }
    throw err;
  }
}

function releaseLockWithSummary(db, lockId, summary) {
  db.prepare(`
    UPDATE evolution_log
    SET end_at = ?, payload_json = ?
    WHERE id = ? AND end_at IS NULL
  `).run(nowIso(), JSON.stringify(summary), lockId);
}

function recordDistillationFailed(db, slug, errorPhase, errorMessage) {
  const id = buildEntryId('distillation_failed', slug);
  const ts = nowIso();
  try {
    db.prepare(`
      INSERT INTO evolution_log (
        id, applied_at, deltas_count,
        event_type, target_type, target_id,
        start_at, end_at, reason, actor, feature_slug, payload_json
      ) VALUES (
        @id, @applied_at, 0,
        'distillation_failed', 'feature', @target_id,
        @start_at, @end_at, NULL, 'auto', @feature_slug, @payload_json
      )
    `).run({
      id,
      applied_at: ts,
      target_id: slug,
      start_at: ts,
      end_at: ts,
      feature_slug: slug,
      payload_json: JSON.stringify({
        error_phase: String(errorPhase || 'unknown'),
        error_message: String(errorMessage || '').slice(0, 1024)
      })
    });
  } catch {
    // Best-effort: if even the failure row cannot be persisted, we still
    // refuse to throw upwards (Article: Living Memory never blocks workflows).
  }
}

// Promise.race-based timeout. better-sqlite3 is sync so this can't actually
// abort the in-flight statement; it just returns to the orchestrator after
// `timeoutMs`. The runaway operation may still complete in the background and
// touch the DB. The lock row still gets stamped via the `distillation_failed`
// path so doctor checks see the truth.
function withTimeout(workPromise, timeoutMs) {
  let timer;
  const timeoutPromise = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error('timeout'), { _aioson_timeout: true })), timeoutMs);
  });
  return Promise.race([workPromise, timeoutPromise]).finally(() => clearTimeout(timer));
}

async function runDistillation(options) {
  const targetDir = options.targetDir;
  const slug = options.slug;
  const db = options.db;
  const timeoutMs = Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS;
  const classification = options.classification
    || await readFeatureClassification(targetDir, slug)
    || null;

  if (!slug) return { ok: false, reason: 'missing_slug' };
  if (!db) return { ok: false, reason: 'missing_db' };

  // BR-ALL-11 / PMD-5 — MICRO opt-out.
  if (classification === MICRO) {
    return { ok: false, reason: 'skipped_micro', classification };
  }

  let lock;
  try {
    lock = acquireDistillationLock(db, slug);
  } catch (err) {
    recordDistillationFailed(db, slug, 'lock_acquire', err && err.message);
    return { ok: false, reason: 'lock_failed', error: String(err && err.message || err) };
  }
  if (!lock.acquired) {
    return { ok: false, reason: 'lock_held', lockHolder: lock.lockHolder };
  }

  const startedAt = Date.now();
  let result;
  try {
    const work = autoPromoteModule.runLearningAutoPromote({
      args: [targetDir],
      options: { json: true },
      logger: { log: () => {}, error: () => {} }
    });
    result = await withTimeout(work, timeoutMs);
  } catch (err) {
    const phase = err && err._aioson_timeout ? 'timeout' : 'auto_promote';
    // Release the lock row as a failure-marker so doctor sees the truth.
    releaseLockWithSummary(db, lock.lockId, {
      state: 'failed',
      error_phase: phase,
      error_message: String(err && err.message || err).slice(0, 1024),
      duration_ms: Date.now() - startedAt
    });
    recordDistillationFailed(db, slug, phase, err && err.message);
    return {
      ok: false,
      reason: 'auto_promote_failed',
      error_phase: phase,
      error: String(err && err.message || err),
      duration_ms: Date.now() - startedAt
    };
  }

  const durationMs = Date.now() - startedAt;
  const promoted = Array.isArray(result && result.promoted) ? result.promoted.length : Number(result && result.promoted_count) || 0;
  const review = Array.isArray(result && result.noted) ? result.noted.length : Number(result && result.review_count) || 0;
  const skipped = Array.isArray(result && result.skipped) ? result.skipped.length : Number(result && result.skipped_count) || 0;
  const summary = {
    state: 'complete',
    promoted_count: promoted,
    review_count: review,
    skipped_count: skipped,
    merge_candidate_count: 0, // DD-5 deferred — always 0 in V1
    duration_ms: durationMs
  };
  releaseLockWithSummary(db, lock.lockId, summary);

  return {
    ok: true,
    feature_slug: slug,
    lock_id: lock.lockId,
    promoted_count: promoted,
    review_count: review,
    skipped_count: skipped,
    merge_candidate_count: 0,
    duration_ms: durationMs
  };
}

module.exports = {
  DEFAULT_TIMEOUT_MS,
  readFeatureClassification,
  acquireDistillationLock,
  releaseLockWithSummary,
  recordDistillationFailed,
  withTimeout,
  runDistillation
};
