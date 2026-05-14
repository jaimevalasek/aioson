'use strict';

/**
 * Active Learning Loop — Phase 3 archive helper.
 *
 * Pure-ish module: filesystem moves + evolution_log validity-window writes,
 * coordinated so that a failed FS op rolls back the DB and vice versa.
 *
 * Targets handled:
 *  - rule:    .aioson/rules/<slug>.md        (file move)
 *  - brain:   .aioson/brains/<...>/<id>.brain.json  (file move)
 *  - learning: project_learnings row (DB status + JSON snapshot under
 *              .aioson/context/_archived/<date>/<learning-id>.json)
 *
 * Append-only contract (BR-ALL-02): existing evolution_log rows are never
 * mutated except to set end_at on supersede. Archive/restore each append a
 * fresh row with a new start_at.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const TARGET_TYPES = new Set(['rule', 'learning', 'brain']);
const ACTOR_VALUES = new Set(['human', 'auto']);

function nowIso() {
  return new Date().toISOString();
}

function todayDateUtc() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function parseTargetId(raw) {
  const text = String(raw || '').trim();
  if (!text) return { kind: null, slug: null };
  const idx = text.indexOf(':');
  if (idx < 0) return { kind: null, slug: text };
  return {
    kind: text.slice(0, idx).trim().toLowerCase(),
    slug: text.slice(idx + 1).trim() || null
  };
}

function normalizeKind(kind) {
  if (!kind) return null;
  const lower = String(kind).toLowerCase();
  if (lower === 'rule' || lower === 'rules') return 'rule';
  if (lower === 'learning' || lower === 'learnings') return 'learning';
  if (lower === 'brain' || lower === 'brains') return 'brain';
  return null;
}

function archivedRootFor(targetDir, kind) {
  if (kind === 'rule') return path.join(targetDir, '.aioson', 'rules', '_archived');
  if (kind === 'brain') return path.join(targetDir, '.aioson', 'brains', '_archived');
  return path.join(targetDir, '.aioson', 'context', '_archived');
}

function archivedFolderForDate(targetDir, kind, dateUtc) {
  return path.join(archivedRootFor(targetDir, kind), dateUtc);
}

function resolveActiveRule(targetDir, slug) {
  const abs = path.join(targetDir, '.aioson', 'rules', `${slug}.md`);
  const rel = path.posix.join('.aioson', 'rules', `${slug}.md`);
  return { absPath: abs, relPath: rel, exists: fs.existsSync(abs) };
}

function resolveActiveBrain(targetDir, slug) {
  const root = path.join(targetDir, '.aioson', 'brains');
  const parts = String(slug).split('/').filter(Boolean);
  let attempt = parts.slice();
  while (attempt.length > 0) {
    const fileName = `${attempt[attempt.length - 1]}.brain.json`;
    const segments = attempt.slice(0, -1);
    const abs = path.join(root, ...segments, fileName);
    if (fs.existsSync(abs)) {
      const rel = path.posix.join('.aioson', 'brains', ...segments, fileName);
      return { absPath: abs, relPath: rel, exists: true, segments };
    }
    attempt.pop();
  }
  const fallbackAbs = path.join(root, `${parts[0] || slug}.brain.json`);
  const fallbackRel = path.posix.join('.aioson', 'brains', `${parts[0] || slug}.brain.json`);
  return { absPath: fallbackAbs, relPath: fallbackRel, exists: false, segments: [] };
}

function resolveActiveTarget(targetDir, kind, slug) {
  if (kind === 'rule') return resolveActiveRule(targetDir, slug);
  if (kind === 'brain') return resolveActiveBrain(targetDir, slug);
  // learning has no canonical file under the active tree
  return { absPath: null, relPath: null, exists: true };
}

function findArchivedFileForRule(targetDir, slug) {
  const root = archivedRootFor(targetDir, 'rule');
  if (!fs.existsSync(root)) return null;
  const dates = fs.readdirSync(root).sort().reverse(); // newest date first
  for (const date of dates) {
    const dir = path.join(root, date);
    if (!fs.statSync(dir).isDirectory()) continue;
    const candidate = path.join(dir, `${slug}.md`);
    if (fs.existsSync(candidate)) {
      return {
        absPath: candidate,
        relPath: path.posix.join('.aioson', 'rules', '_archived', date, `${slug}.md`),
        date
      };
    }
    // collision-suffixed variants (slug-1.md, slug-2.md, ...): pick highest
    const entries = fs.readdirSync(dir)
      .filter((n) => n.startsWith(`${slug}-`) && n.endsWith('.md'));
    if (entries.length > 0) {
      const last = entries.sort().pop();
      return {
        absPath: path.join(dir, last),
        relPath: path.posix.join('.aioson', 'rules', '_archived', date, last),
        date
      };
    }
  }
  return null;
}

function findArchivedFileForBrain(targetDir, slug) {
  const root = archivedRootFor(targetDir, 'brain');
  if (!fs.existsSync(root)) return null;
  const parts = String(slug).split('/').filter(Boolean);
  const fileName = `${parts[parts.length - 1] || slug}.brain.json`;
  const segments = parts.slice(0, -1);
  const dates = fs.readdirSync(root).sort().reverse();
  for (const date of dates) {
    const dir = path.join(root, date, ...segments);
    if (!fs.existsSync(dir)) continue;
    const candidate = path.join(dir, fileName);
    if (fs.existsSync(candidate)) {
      return {
        absPath: candidate,
        relPath: path.posix.join('.aioson', 'brains', '_archived', date, ...segments, fileName),
        date
      };
    }
  }
  return null;
}

function findArchivedSnapshotForLearning(targetDir, learningId) {
  const root = archivedRootFor(targetDir, 'learning');
  if (!fs.existsSync(root)) return null;
  const dates = fs.readdirSync(root).sort().reverse();
  for (const date of dates) {
    const dir = path.join(root, date);
    if (!fs.statSync(dir).isDirectory()) continue;
    const candidate = path.join(dir, `${learningId}.json`);
    if (fs.existsSync(candidate)) {
      return {
        absPath: candidate,
        relPath: path.posix.join('.aioson', 'context', '_archived', date, `${learningId}.json`),
        date
      };
    }
  }
  return null;
}

function chooseAvailableArchivePath(folder, baseName, ext) {
  const primary = path.join(folder, `${baseName}${ext}`);
  if (!fs.existsSync(primary)) return primary;
  let seq = 2;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const candidate = path.join(folder, `${baseName}-${seq}${ext}`);
    if (!fs.existsSync(candidate)) return candidate;
    seq += 1;
    if (seq > 9999) throw new Error('archive collision suffix exceeded 9999');
  }
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function safeRename(srcAbs, destAbs) {
  ensureDir(path.dirname(destAbs));
  try {
    fs.renameSync(srcAbs, destAbs);
  } catch (err) {
    if (err && (err.code === 'EXDEV' || err.code === 'EPERM')) {
      // cross-volume / Windows permission: fall back to copy+unlink
      fs.copyFileSync(srcAbs, destAbs);
      fs.unlinkSync(srcAbs);
      return;
    }
    throw err;
  }
}

function findActiveEntry(db, targetType, targetId) {
  return db.prepare(`
    SELECT id, applied_at, event_type, target_type, target_id, start_at, end_at,
           reason, actor, feature_slug, payload_json
    FROM evolution_log
    WHERE target_type = ? AND target_id = ? AND end_at IS NULL
    ORDER BY rowid DESC
    LIMIT 1
  `).get(targetType, targetId);
}

function listHistory(db, targetType, targetId) {
  return db.prepare(`
    SELECT id, applied_at, event_type, target_type, target_id, start_at, end_at,
           reason, actor, feature_slug, payload_json
    FROM evolution_log
    WHERE target_type = ? AND target_id = ?
    ORDER BY rowid ASC
  `).all(targetType, targetId);
}

function buildEntryId(eventType, targetType, targetId, ts) {
  // 6 hex chars from crypto.randomBytes — guards against same-millisecond
  // collisions (evolution_log.id is PRIMARY KEY so duplicates throw).
  const suffix = crypto.randomBytes(3).toString('hex');
  return `evo-${eventType}-${targetType}-${targetId.replace(/[^a-zA-Z0-9_.-]/g, '_')}-${ts.replace(/[:.]/g, '')}-${suffix}`;
}

function insertEvolutionEntry(db, entry) {
  const eventType = String(entry.eventType || '').trim();
  if (!eventType) throw new Error('insertEvolutionEntry: eventType is required');
  const targetType = String(entry.targetType || '').trim();
  if (!TARGET_TYPES.has(targetType)) {
    throw new Error(`insertEvolutionEntry: invalid target_type "${targetType}"`);
  }
  const targetId = String(entry.targetId || '').trim();
  if (!targetId) throw new Error('insertEvolutionEntry: targetId is required');
  const actor = String(entry.actor || '').trim();
  if (!ACTOR_VALUES.has(actor) && !/^agent:.+/.test(actor)) {
    throw new Error(`insertEvolutionEntry: invalid actor "${actor}"`);
  }
  const startAt = entry.startAt || nowIso();
  const endAt = entry.endAt || null;
  const reason = entry.reason ? String(entry.reason) : null;
  const featureSlug = entry.featureSlug ? String(entry.featureSlug) : null;
  const payload = entry.payload ? JSON.stringify(entry.payload) : null;
  const id = entry.id || buildEntryId(eventType, targetType, targetId, startAt);

  db.prepare(`
    INSERT INTO evolution_log (
      id, applied_at, deltas_count,
      event_type, target_type, target_id,
      start_at, end_at, reason, actor, feature_slug, payload_json
    ) VALUES (
      @id, @applied_at, 0,
      @event_type, @target_type, @target_id,
      @start_at, @end_at, @reason, @actor, @feature_slug, @payload_json
    )
  `).run({
    id,
    applied_at: startAt,
    event_type: eventType,
    target_type: targetType,
    target_id: targetId,
    start_at: startAt,
    end_at: endAt,
    reason,
    actor,
    feature_slug: featureSlug,
    payload_json: payload
  });
  return id;
}

function setActiveEntryEndAt(db, entryId, endAt) {
  // Only end_at is mutable on existing rows (BR-ALL-02). Application-level
  // enforcement; raw SQL bypasses it.
  return db.prepare(`
    UPDATE evolution_log
    SET end_at = ?
    WHERE id = ? AND end_at IS NULL
  `).run(endAt, entryId);
}

function getLearningRow(db, learningId) {
  return db.prepare(`
    SELECT learning_id, project_name, feature_slug, type, title, confidence,
           frequency, last_reinforced, applies_to, promoted_to, status,
           source_session, evidence, created_at, updated_at
    FROM project_learnings
    WHERE learning_id = ?
  `).get(learningId);
}

function setLearningStatus(db, learningId, status) {
  return db.prepare(`
    UPDATE project_learnings
    SET status = ?, updated_at = ?
    WHERE learning_id = ?
  `).run(status, nowIso(), learningId);
}

// archiveTarget — orchestrates the archive move and DB writes.
// Returns { ok: true, ... } on success or { ok: false, reason, ... } on
// expected failure (target_not_found, already_archived, etc.). Throws only on
// catastrophic FS errors with active rollback attempted.
function archiveTarget(db, options) {
  const targetDir = options.targetDir;
  const kind = options.kind;
  const slug = options.slug;
  const reason = options.reason || null;
  const actor = options.actor || 'human';
  const featureSlug = options.featureSlug || null;
  const dateUtc = options.dateUtc || todayDateUtc();
  const dryRun = Boolean(options.dryRun);

  if (!TARGET_TYPES.has(kind)) {
    return { ok: false, reason: 'invalid_target_type', value: kind };
  }
  if (!slug) return { ok: false, reason: 'invalid_target_id' };

  // 1. Locate live target
  const resolved = resolveActiveTarget(targetDir, kind, slug);
  if (!resolved.exists && kind !== 'learning') {
    // Check if it's already archived; that path makes archive idempotent.
    const alreadyArchived = kind === 'rule'
      ? findArchivedFileForRule(targetDir, slug)
      : findArchivedFileForBrain(targetDir, slug);
    if (alreadyArchived) {
      return { ok: false, reason: 'already_archived', archivedAt: alreadyArchived.relPath };
    }
    return { ok: false, reason: 'target_not_found', kind, slug };
  }

  let learningRow = null;
  if (kind === 'learning') {
    learningRow = getLearningRow(db, slug);
    if (!learningRow) return { ok: false, reason: 'target_not_found', kind, slug };
    if (learningRow.status === 'archived') {
      const snap = findArchivedSnapshotForLearning(targetDir, slug);
      return { ok: false, reason: 'already_archived', archivedAt: snap ? snap.relPath : null };
    }
  }

  // 2. Compute destination
  const folder = archivedFolderForDate(targetDir, kind, dateUtc);
  let destAbs = null;
  let destRel = null;
  if (kind === 'rule') {
    destAbs = chooseAvailableArchivePath(folder, slug, '.md');
    destRel = path.posix.join('.aioson', 'rules', '_archived', dateUtc, path.basename(destAbs));
  } else if (kind === 'brain') {
    const parts = String(slug).split('/').filter(Boolean);
    const segments = parts.slice(0, -1);
    const base = parts[parts.length - 1] || slug;
    const targetFolder = path.join(folder, ...segments);
    destAbs = chooseAvailableArchivePath(targetFolder, base, '.brain.json');
    destRel = path.posix.join('.aioson', 'brains', '_archived', dateUtc, ...segments, path.basename(destAbs));
  } else { // learning
    destAbs = chooseAvailableArchivePath(folder, slug, '.json');
    destRel = path.posix.join('.aioson', 'context', '_archived', dateUtc, path.basename(destAbs));
  }

  if (dryRun) {
    const active = findActiveEntry(db, kind, slug);
    return {
      ok: true,
      dryRun: true,
      kind,
      slug,
      sourcePath: resolved.relPath || null,
      destPath: destRel,
      hasActiveEntry: Boolean(active),
      activeEntryId: active ? active.id : null,
      reason
    };
  }

  // 3. FS move (or snapshot write for learning)
  let fsCompleted = false;
  try {
    if (kind === 'rule' || kind === 'brain') {
      safeRename(resolved.absPath, destAbs);
    } else {
      ensureDir(path.dirname(destAbs));
      fs.writeFileSync(destAbs, JSON.stringify(learningRow, null, 2), 'utf8');
    }
    fsCompleted = true;
  } catch (err) {
    return { ok: false, reason: 'fs_failed', error: err && err.message ? err.message : String(err) };
  }

  // 4. DB writes inside a transaction; on failure, roll back FS.
  const startAt = nowIso();
  let archivedEntryId = null;
  let supersededEntryId = null;
  try {
    const tx = db.transaction(() => {
      const active = findActiveEntry(db, kind, slug);
      if (active) {
        setActiveEntryEndAt(db, active.id, startAt);
        supersededEntryId = active.id;
      }
      archivedEntryId = insertEvolutionEntry(db, {
        eventType: 'archived',
        targetType: kind,
        targetId: slug,
        startAt,
        endAt: startAt, // archived events are themselves point-in-time
        reason,
        actor,
        featureSlug,
        payload: {
          source_path: resolved.relPath || null,
          archived_path: destRel,
          superseded_entry: supersededEntryId,
          date_utc: dateUtc
        }
      });
      if (kind === 'learning') {
        setLearningStatus(db, slug, 'archived');
      }
    });
    tx();
  } catch (err) {
    // Roll back FS — best-effort.
    if (fsCompleted) {
      try {
        if (kind === 'rule' || kind === 'brain') {
          safeRename(destAbs, resolved.absPath);
        } else {
          fs.unlinkSync(destAbs);
        }
      } catch { /* swallow — surfaced below */ }
    }
    return { ok: false, reason: 'db_failed', error: err && err.message ? err.message : String(err) };
  }

  return {
    ok: true,
    kind,
    slug,
    sourcePath: resolved.relPath || null,
    destPath: destRel,
    archivedEntryId,
    supersededEntryId,
    startAt
  };
}

function restoreTarget(db, options) {
  const targetDir = options.targetDir;
  const kind = options.kind;
  const slug = options.slug;
  const reason = options.reason || null;
  const actor = options.actor || 'human';
  const featureSlug = options.featureSlug || null;
  const dryRun = Boolean(options.dryRun);

  if (!TARGET_TYPES.has(kind)) return { ok: false, reason: 'invalid_target_type', value: kind };
  if (!slug) return { ok: false, reason: 'invalid_target_id' };

  let archivedFile = null;
  let learningRow = null;
  if (kind === 'rule') {
    archivedFile = findArchivedFileForRule(targetDir, slug);
    if (!archivedFile) return { ok: false, reason: 'target_not_archived', kind, slug };
    const active = resolveActiveRule(targetDir, slug);
    if (active.exists) return { ok: false, reason: 'target_already_active', kind, slug };
  } else if (kind === 'brain') {
    archivedFile = findArchivedFileForBrain(targetDir, slug);
    if (!archivedFile) return { ok: false, reason: 'target_not_archived', kind, slug };
    const active = resolveActiveBrain(targetDir, slug);
    if (active.exists) return { ok: false, reason: 'target_already_active', kind, slug };
  } else {
    archivedFile = findArchivedSnapshotForLearning(targetDir, slug);
    learningRow = getLearningRow(db, slug);
    if (!learningRow) return { ok: false, reason: 'target_not_found', kind, slug };
    if (learningRow.status !== 'archived') {
      return { ok: false, reason: 'target_already_active', kind, slug };
    }
  }

  const restoredAbs = (() => {
    if (kind === 'rule') return path.join(targetDir, '.aioson', 'rules', `${slug}.md`);
    if (kind === 'brain') {
      const parts = String(slug).split('/').filter(Boolean);
      return path.join(targetDir, '.aioson', 'brains', ...parts.slice(0, -1), `${parts[parts.length - 1]}.brain.json`);
    }
    return null;
  })();
  const restoredRel = (() => {
    if (kind === 'rule') return path.posix.join('.aioson', 'rules', `${slug}.md`);
    if (kind === 'brain') {
      const parts = String(slug).split('/').filter(Boolean);
      return path.posix.join('.aioson', 'brains', ...parts.slice(0, -1), `${parts[parts.length - 1]}.brain.json`);
    }
    return null;
  })();

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      kind,
      slug,
      sourcePath: archivedFile ? archivedFile.relPath : null,
      destPath: restoredRel,
      reason
    };
  }

  let fsCompleted = false;
  try {
    if (kind === 'rule' || kind === 'brain') {
      safeRename(archivedFile.absPath, restoredAbs);
      fsCompleted = true;
    } else {
      // learning restore = remove snapshot (DB row already exists).
      if (archivedFile) {
        fs.unlinkSync(archivedFile.absPath);
      }
      fsCompleted = true;
    }
  } catch (err) {
    return { ok: false, reason: 'fs_failed', error: err && err.message ? err.message : String(err) };
  }

  const startAt = nowIso();
  let restoredEntryId = null;
  try {
    const tx = db.transaction(() => {
      restoredEntryId = insertEvolutionEntry(db, {
        eventType: 'restored',
        targetType: kind,
        targetId: slug,
        startAt,
        endAt: null,
        reason,
        actor,
        featureSlug,
        payload: {
          archived_path: archivedFile ? archivedFile.relPath : null,
          restored_path: restoredRel
        }
      });
      if (kind === 'learning') {
        setLearningStatus(db, slug, 'active');
      }
    });
    tx();
  } catch (err) {
    if (fsCompleted) {
      try {
        if (kind === 'rule' || kind === 'brain') {
          safeRename(restoredAbs, archivedFile.absPath);
        } else if (archivedFile) {
          // Rewrite the snapshot back (read-only stream of the unlink may
          // already be in-flight; best-effort).
          ensureDir(path.dirname(archivedFile.absPath));
          fs.writeFileSync(archivedFile.absPath, JSON.stringify(learningRow, null, 2), 'utf8');
        }
      } catch { /* swallow */ }
    }
    return { ok: false, reason: 'db_failed', error: err && err.message ? err.message : String(err) };
  }

  return {
    ok: true,
    kind,
    slug,
    sourcePath: archivedFile ? archivedFile.relPath : null,
    destPath: restoredRel,
    restoredEntryId,
    startAt
  };
}

module.exports = {
  TARGET_TYPES,
  parseTargetId,
  normalizeKind,
  archivedFolderForDate,
  resolveActiveRule,
  resolveActiveBrain,
  resolveActiveTarget,
  findArchivedFileForRule,
  findArchivedFileForBrain,
  findArchivedSnapshotForLearning,
  findActiveEntry,
  listHistory,
  insertEvolutionEntry,
  setActiveEntryEndAt,
  archiveTarget,
  restoreTarget
};
