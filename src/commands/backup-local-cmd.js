'use strict';

const { backupAiosonDocs } = require('../backup-local');
const { resolveTargetDir } = require('../lib/project-root');

/**
 * aioson backup:local [.]
 *
 * Manually snapshots the .md files of .aioson/context/ (closed-feature
 * archives left out) and .aioson/plans/ to ~/.aioson/backups/{project}/{timestamp}/;
 * the newest snapshots are kept, older ones removed.
 */
async function runBackupLocal({ args, logger }) {
  const targetDir = resolveTargetDir(args);
  const result = await backupAiosonDocs(targetDir);

  if (result.unchanged) {
    logger.log(`backup:local — nothing changed since the last snapshot (${result.backupPath})`);
    return { ok: true, count: 0, backupPath: result.backupPath, unchanged: true };
  }

  if (result.skipped) {
    logger.log('backup:local — this project lives under the OS temp folder, so it is not snapshotted into ~/.aioson/backups (set AIOSON_BACKUPS_DIR to keep one elsewhere)');
    return { ok: true, count: 0, backupPath: null, skipped: result.skipped };
  }

  if (result.count === 0) {
    logger.log('backup:local — nothing to back up (no .md files found in .aioson/context/ or .aioson/plans/)');
    return { ok: true, count: 0, backupPath: null };
  }

  logger.log(`backup:local — ${result.count} file(s) backed up → ${result.backupPath}${result.pruned ? ` (${result.pruned} older snapshot(s) removed)` : ''}`);
  return { ok: true, count: result.count, backupPath: result.backupPath, pruned: result.pruned };
}

module.exports = { runBackupLocal };
