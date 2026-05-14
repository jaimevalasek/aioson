'use strict';

/**
 * aioson memory:archive --id=<rule|learning|brain>:<slug> --reason="<text>" [--dry-run] [--json]
 *
 * Tier-2 human-actioned command (PMD-4 / Article VII / BR-ALL-01). Moves a
 * curated artifact to `_archived/{YYYY-MM-DD}/` and records the transition in
 * `evolution_log` using the validity-window pattern (BR-ALL-02 append-only):
 *  - supersedes the prior active entry (sets `end_at`)
 *  - inserts a new `event_type='archived'` row
 *  - for learnings: also flips `project_learnings.status` to 'archived'
 *
 * Refuses to run when `process.env.AIOSON_RUNTIME_HOOK === '1'` (BR-ALL-01:
 * hook code paths are never permitted to archive — only direct invocation by
 * a human).
 *
 * Emits `aioson notify --level=warn` BEFORE mutating disk or DB (BR-ALL-06).
 */

const path = require('node:path');
const { openRuntimeDb } = require('../runtime-store');
const { runNotify } = require('./notify');
const {
  parseTargetId,
  normalizeKind,
  archiveTarget,
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

async function runMemoryArchive({ args, options = {}, logger, t }) {
  const targetDir = path.resolve(process.cwd(), args && args[0] ? args[0] : '.');
  const wantJson = Boolean(options.json);
  const dryRun = Boolean(options['dry-run'] || options.dryRun);
  const log = (msg) => { if (logger && typeof logger.log === 'function') logger.log(msg); };

  if (isHookContext()) {
    const msg = tFn(t, 'memory_archive.hook_blocked')
      || 'memory:archive cannot be invoked from a runtime hook (BR-ALL-01: tier-2 requires human action).';
    if (wantJson) return { ok: false, reason: 'hook_blocked' };
    log(msg);
    return { ok: false, reason: 'hook_blocked' };
  }

  const rawId = options.id || options.target || '';
  const reason = options.reason ? String(options.reason).trim() : '';

  if (!rawId) {
    const msg = tFn(t, 'memory_archive.id_required')
      || 'memory:archive requires --id=<rule|learning|brain>:<slug>.';
    if (wantJson) return { ok: false, reason: 'missing_id' };
    log(msg);
    return { ok: false, reason: 'missing_id' };
  }
  if (!reason) {
    const msg = tFn(t, 'memory_archive.reason_required')
      || 'memory:archive requires --reason="<text>".';
    if (wantJson) return { ok: false, reason: 'missing_reason' };
    log(msg);
    return { ok: false, reason: 'missing_reason' };
  }

  const parsed = parseTargetId(rawId);
  const kind = normalizeKind(parsed.kind);
  if (!kind || !TARGET_TYPES.has(kind)) {
    const msg = tFn(t, 'memory_archive.invalid_id', { value: rawId })
      || `memory:archive invalid --id value: "${rawId}". Expected rule|learning|brain:<slug>.`;
    if (wantJson) return { ok: false, reason: 'invalid_id', value: rawId };
    log(msg);
    return { ok: false, reason: 'invalid_id' };
  }
  if (!parsed.slug) {
    const msg = tFn(t, 'memory_archive.invalid_id', { value: rawId })
      || `memory:archive invalid --id value: "${rawId}". Missing slug after ":".`;
    if (wantJson) return { ok: false, reason: 'invalid_id', value: rawId };
    log(msg);
    return { ok: false, reason: 'invalid_id' };
  }

  // BR-ALL-06: emit tier-2 notify BEFORE any mutation (defense in depth).
  // notify.runNotify returns { ok, exitCode } — non-zero aborts.
  const notifyMessage = tFn(t, 'memory_archive.notify_template', { kind, slug: parsed.slug, reason })
    || `archiving ${kind} "${parsed.slug}": ${reason}`;
  let notifyResult;
  try {
    notifyResult = await runNotify({
      args: [targetDir],
      options: {
        level: 'warn',
        topic: 'memory',
        message: notifyMessage,
        agent: 'memory-archive',
        json: wantJson ? true : undefined
      },
      logger: logger || { log: () => {} }
    });
  } catch (err) {
    if (wantJson) return { ok: false, reason: 'notify_failed', error: String(err && err.message || err) };
    log(`memory:archive notify failed: ${err && err.message ? err.message : err}`);
    return { ok: false, reason: 'notify_failed' };
  }
  if (notifyResult && notifyResult.ok === false) {
    if (wantJson) return { ok: false, reason: 'notify_blocked', exitCode: notifyResult.exitCode };
    log('memory:archive aborted: tier-2 notify returned non-zero exit code.');
    return { ok: false, reason: 'notify_blocked' };
  }

  let dbHandle;
  try {
    dbHandle = await openRuntimeDb(targetDir);
  } catch (err) {
    if (wantJson) return { ok: false, reason: 'runtime_db_unavailable', error: String(err && err.message || err) };
    log(`memory:archive runtime db unavailable: ${err && err.message ? err.message : err}`);
    return { ok: false, reason: 'runtime_db_unavailable' };
  }

  const { db } = dbHandle;
  let outcome;
  try {
    outcome = archiveTarget(db, {
      targetDir,
      kind,
      slug: parsed.slug,
      reason,
      actor: 'human',
      featureSlug: options.feature ? String(options.feature).trim() : null,
      dryRun
    });
  } finally {
    db.close();
  }

  if (!outcome.ok) {
    if (wantJson) return outcome;
    if (outcome.reason === 'already_archived') {
      const msg = tFn(t, 'memory_archive.already_archived', { path: outcome.archivedAt })
        || `memory:archive: "${parsed.slug}" already archived (${outcome.archivedAt || 'unknown path'}). No-op.`;
      log(msg);
    } else if (outcome.reason === 'target_not_found') {
      const msg = tFn(t, 'memory_archive.target_not_found', { kind, slug: parsed.slug })
        || `memory:archive: ${kind} "${parsed.slug}" not found in active state.`;
      log(msg);
    } else {
      log(`memory:archive failed: ${outcome.reason}${outcome.error ? ' — ' + outcome.error : ''}`);
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
      archived_entry_id: outcome.archivedEntryId || null,
      superseded_entry_id: outcome.supersededEntryId || null,
      start_at: outcome.startAt || null
    };
  }

  if (outcome.dryRun) {
    const msg = tFn(t, 'memory_archive.dry_run_summary', {
      kind,
      slug: parsed.slug,
      source: outcome.sourcePath || '(no source path)',
      dest: outcome.destPath,
      has_active: outcome.hasActiveEntry ? 'yes' : 'no'
    }) || `memory:archive [dry-run]: would move ${outcome.sourcePath || kind + ':' + parsed.slug} → ${outcome.destPath} (active entry: ${outcome.hasActiveEntry ? 'yes' : 'no'}).`;
    log(msg);
  } else {
    const msg = tFn(t, 'memory_archive.archived_success', {
      kind,
      slug: parsed.slug,
      dest: outcome.destPath
    }) || `memory:archive ✓ ${kind} "${parsed.slug}" archived to ${outcome.destPath}.`;
    log(msg);
  }
  return outcome;
}

module.exports = { runMemoryArchive };
