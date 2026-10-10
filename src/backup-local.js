'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { ensureDir, nowStamp } = require('./utils');
const { isEphemeralProjectDir } = require('./lib/design-seed');
const { SNAPSHOT_KEEP, projectSnapshotsDir, stampedDirs, pruneStamped } = require('./lib/storage-footprint');

const DOC_CREATING_AGENTS = new Set([
  'product', 'sheldon', 'planner'
]);

// Closed-feature archives are written once, by feature:close, and never by the
// agents this net protects; copying them into every snapshot is what made one
// project's snapshot history 740 MB.
const ARCHIVE_DIRS = new Set(['done', 'abandoned']);
// What a snapshot held (path, size, mtime per file): an unchanged tree is not
// snapshotted again.
const MANIFEST_FILE = '.snapshot-manifest';

function isDocCreatingAgent(agentName) {
  const normalized = agentName.toLowerCase().replace(/^@/, '');
  return DOC_CREATING_AGENTS.has(normalized);
}

async function collectMdFiles(dir, skip = null) {
  const results = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (skip && skip.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await collectMdFiles(full)));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(full);
    }
  }
  return results;
}

/** `{ files, manifest }` for the files that still exist, in a stable order. */
async function describeFiles(files, aiosonRoot) {
  const kept = [];
  const lines = [];
  for (const file of files) {
    let stat;
    try { stat = await fs.stat(file); } catch { continue; }
    kept.push(file);
    lines.push(`${path.relative(aiosonRoot, file).split(path.sep).join('/')}\t${stat.size}\t${Math.round(stat.mtimeMs)}`);
  }
  return { files: kept, manifest: lines.sort().join('\n') };
}

async function readText(file) {
  try { return await fs.readFile(file, 'utf8'); } catch { return null; }
}

/**
 * Snapshots the .md files of .aioson/context/ (closed-feature archives left
 * out) and .aioson/plans/ into ~/.aioson/backups/{project-name}/{timestamp}/,
 * keeping the newest SNAPSHOT_KEEP. Skips the snapshot when nothing changed
 * since the last one, and a project under the OS temp root (a fixture or a
 * sandbox) unless AIOSON_BACKUPS_DIR names a store the caller owns.
 *
 * @param {string} targetDir - Project root directory
 * @returns {Promise<{ ok: boolean, count: number, backupPath: string|null, unchanged?: boolean, skipped?: string, pruned?: number }>}
 */
async function backupAiosonDocs(targetDir) {
  if (!process.env.AIOSON_BACKUPS_DIR && isEphemeralProjectDir(targetDir)) {
    return { ok: true, count: 0, backupPath: null, skipped: 'ephemeral_project' };
  }
  const aiosonRoot = path.join(targetDir, '.aioson');
  const { files, manifest } = await describeFiles([
    ...(await collectMdFiles(path.join(aiosonRoot, 'context'), ARCHIVE_DIRS)),
    ...(await collectMdFiles(path.join(aiosonRoot, 'plans')))
  ], aiosonRoot);

  if (files.length === 0) return { ok: true, count: 0, backupPath: null };

  const projectDir = projectSnapshotsDir(targetDir);
  const latest = stampedDirs(projectDir)[0];
  if (latest && (await readText(path.join(projectDir, latest, MANIFEST_FILE))) === manifest) {
    return { ok: true, count: 0, backupPath: path.join(projectDir, latest), unchanged: true };
  }

  // nowStamp() returns ISO with colons replaced: 2026-01-01T00-00-00.000Z
  // Take just the date+time part: YYYY-MM-DDTHH-MM-SS
  const backupRoot = path.join(projectDir, nowStamp().slice(0, 19));
  await ensureDir(backupRoot);
  for (const file of files) {
    const dest = path.join(backupRoot, path.relative(aiosonRoot, file)); // e.g. "context/prd.md"
    await ensureDir(path.dirname(dest));
    await fs.copyFile(file, dest);
  }
  await fs.writeFile(path.join(backupRoot, MANIFEST_FILE), manifest, 'utf8');

  const pruned = pruneStamped(projectDir, SNAPSHOT_KEEP);
  return { ok: true, count: files.length, backupPath: backupRoot, pruned: pruned.removed };
}

module.exports = { backupAiosonDocs, isDocCreatingAgent };
