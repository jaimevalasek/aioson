'use strict';

/**
 * aioson memory:restore --id=<rule|learning|brain>:<slug> [--reason="<text>"] [--dry-run] [--json]
 *
 * Tier-2 human-actioned command. Moves an archived artifact back to its
 * active path and records an `event_type='restored'` entry with a fresh
 * `start_at` (PMD-10). History is preserved: the prior `archived` entry
 * keeps its `end_at`.
 *
 * Refuses to run when `process.env.AIOSON_RUNTIME_HOOK === '1'` (BR-ALL-01).
 * Emits `aioson notify --level=warn` BEFORE mutation (BR-ALL-06).
 */

const path = require('node:path');
const { openRuntimeDb } = require('../runtime-store');
const { runNotify } = require('./notify');
const {
  parseTargetId,
  normalizeKind,
  restoreTarget,
  TARGET_TYPES
} = require('../learning-loop-archive');

function tFn(t, key, params) {
  if (typeof t === 'function') {
    try { return t(key, params || {}); } catch { /* fall through */ }
  }
  return null;
}

function isHookContext() {
  return process.env.AIOSON_RUNTIME_HOOK === '1';
}

async function runMemoryRestore({ args, options = {}, logger, t }) {
  const targetDir = path.resolve(process.cwd(), args && args[0] ? args[0] : '.');
  const wantJson = Boolean(options.json);
  const dryRun = Boolean(options['dry-run'] || options.dryRun);
  const log = (msg) => { if (logger && typeof logger.log === 'function') logger.log(msg); };

  if (isHookContext()) {
    const msg = tFn(t, 'memory_restore.hook_blocked')
      || 'memory:restore cannot be invoked from a runtime hook (BR-ALL-01: tier-2 requires human action).';
    if (wantJson) return { ok: false, reason: 'hook_blocked' };
    log(msg);
    return { ok: false, reason: 'hook_blocked' };
  }

  const rawId = options.id || options.target || '';
  const reason = options.reason ? String(options.reason).trim() : '';

  if (!rawId) {
    const msg = tFn(t, 'memory_restore.id_required')
      || 'memory:restore requires --id=<rule|learning|brain>:<slug>.';
    if (wantJson) return { ok: false, reason: 'missing_id' };
    log(msg);
    return { ok: false, reason: 'missing_id' };
  }

  const parsed = parseTargetId(rawId);
  const kind = normalizeKind(parsed.kind);
  if (!kind || !TARGET_TYPES.has(kind) || !parsed.slug) {
    const msg = tFn(t, 'memory_restore.invalid_id', { value: rawId })
      || `memory:restore invalid --id value: "${rawId}". Expected rule|learning|brain:<slug>.`;
    if (wantJson) return { ok: false, reason: 'invalid_id', value: rawId };
    log(msg);
    return { ok: false, reason: 'invalid_id' };
  }

  const notifyMessage = tFn(t, 'memory_restore.notify_template', {
    kind,
    slug: parsed.slug,
    reason: reason || 'restoring archived artifact'
  }) || `restoring ${kind} "${parsed.slug}"${reason ? `: ${reason}` : ''}`;
  let notifyResult;
  try {
    notifyResult = await runNotify({
      args: [targetDir],
      options: {
        level: 'warn',
        topic: 'memory',
        message: notifyMessage,
        agent: 'memory-restore',
        json: wantJson ? true : undefined
      },
      logger: logger || { log: () => {} }
    });
  } catch (err) {
    if (wantJson) return { ok: false, reason: 'notify_failed', error: String(err && err.message || err) };
    log(`memory:restore notify failed: ${err && err.message ? err.message : err}`);
    return { ok: false, reason: 'notify_failed' };
  }
  if (notifyResult && notifyResult.ok === false) {
    if (wantJson) return { ok: false, reason: 'notify_blocked', exitCode: notifyResult.exitCode };
    log('memory:restore aborted: tier-2 notify returned non-zero exit code.');
    return { ok: false, reason: 'notify_blocked' };
  }

  let dbHandle;
  try {
    dbHandle = await openRuntimeDb(targetDir);
  } catch (err) {
    if (wantJson) return { ok: false, reason: 'runtime_db_unavailable', error: String(err && err.message || err) };
    log(`memory:restore runtime db unavailable: ${err && err.message ? err.message : err}`);
    return { ok: false, reason: 'runtime_db_unavailable' };
  }

  const { db } = dbHandle;
  let outcome;
  try {
    outcome = restoreTarget(db, {
      targetDir,
      kind,
      slug: parsed.slug,
      reason: reason || null,
      actor: 'human',
      featureSlug: options.feature ? String(options.feature).trim() : null,
      dryRun
    });
  } finally {
    db.close();
  }

  if (!outcome.ok) {
    if (wantJson) return outcome;
    if (outcome.reason === 'target_not_archived') {
      const msg = tFn(t, 'memory_restore.target_not_archived', { kind, slug: parsed.slug })
        || `memory:restore: ${kind} "${parsed.slug}" not found in archive.`;
      log(msg);
    } else if (outcome.reason === 'target_already_active') {
      const msg = tFn(t, 'memory_restore.target_already_active', { kind, slug: parsed.slug })
        || `memory:restore: ${kind} "${parsed.slug}" already active. No-op.`;
      log(msg);
    } else if (outcome.reason === 'target_not_found') {
      const msg = tFn(t, 'memory_restore.target_not_found', { kind, slug: parsed.slug })
        || `memory:restore: ${kind} "${parsed.slug}" not found.`;
      log(msg);
    } else {
      log(`memory:restore failed: ${outcome.reason}${outcome.error ? ' — ' + outcome.error : ''}`);
    }
    return outcome;
  }

  if (wantJson) {
    return {
      ok: true,
      dry_run: Boolean(outcome.dryRun),
      kind,
      slug: parsed.slug,
      source_path: outcome.sourcePath,
      dest_path: outcome.destPath,
      restored_entry_id: outcome.restoredEntryId || null,
      start_at: outcome.startAt || null
    };
  }

  if (outcome.dryRun) {
    const msg = tFn(t, 'memory_restore.dry_run_summary', {
      kind,
      slug: parsed.slug,
      source: outcome.sourcePath || kind,
      dest: outcome.destPath || '(no dest)'
    }) || `memory:restore [dry-run]: would move ${outcome.sourcePath || kind} → ${outcome.destPath || '(no dest)'}.`;
    log(msg);
  } else {
    const msg = tFn(t, 'memory_restore.restored_success', {
      kind,
      slug: parsed.slug,
      dest: outcome.destPath || ''
    }) || `memory:restore ✓ ${kind} "${parsed.slug}" restored${outcome.destPath ? ' to ' + outcome.destPath : ''}.`;
    log(msg);
  }
  return outcome;
}

module.exports = { runMemoryRestore };
