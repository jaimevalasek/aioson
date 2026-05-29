'use strict';

/**
 * aioson memory:trim [.] [--keep=<N>] [--archive=<path>] [--dry-run] [--json]
 *
 * P0 of the agent-loading-contract: rolls COLD entries out of the
 * `## What the system already has` section of bootstrap/current-state.md into a
 * separate archive (default `bootstrap/current-state-archive.md`), keeping only
 * the newest `--keep` entries (default 12) plus any entry tied to an in_progress
 * feature. Frontmatter and every other section are preserved byte-for-byte, and
 * archived entries are MOVED verbatim — never deleted.
 *
 * Tier-2 (memory mutation): refuses to run inside a runtime hook and emits
 * `notify --level=warn` before any disk write. `--dry-run` mutates nothing.
 */

const fs = require('node:fs');
const path = require('node:path');
const { runNotify } = require('./notify');
const {
  splitCurrentState,
  buildArchiveContent,
  parseActiveSlugs
} = require('../current-state-trim');

const CURRENT_STATE_REL = '.aioson/context/bootstrap/current-state.md';
const DEFAULT_ARCHIVE_REL = '.aioson/context/bootstrap/current-state-archive.md';
const FEATURES_REL = '.aioson/context/features.md';

function tFn(t, key, params) {
  if (typeof t === 'function') {
    try { return t(key, params || {}); } catch { /* fall through */ }
  }
  return null;
}

function isHookContext() {
  return process.env.AIOSON_RUNTIME_HOOK === '1';
}

function readFileOrNull(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}

function parseKeep(value) {
  if (value === undefined || value === null || value === '') return 12;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 12;
  return Math.floor(n);
}

async function runMemoryTrim({ args, options = {}, logger, t }) {
  const targetDir = path.resolve(process.cwd(), args && args[0] ? args[0] : '.');
  const wantJson = Boolean(options.json);
  const dryRun = Boolean(options['dry-run'] || options.dryRun);
  const keep = parseKeep(options.keep);
  const log = (msg) => { if (logger && typeof logger.log === 'function') logger.log(msg); };

  if (isHookContext()) {
    if (wantJson) return { ok: false, reason: 'hook_blocked' };
    log(tFn(t, 'cli.memory_trim.hook_blocked')
      || 'memory:trim cannot be invoked from a runtime hook (tier-2 requires human action).');
    return { ok: false, reason: 'hook_blocked' };
  }

  const currentStatePath = path.join(targetDir, CURRENT_STATE_REL);
  let archivePath;
  if (options.archive) {
    // SECURITY (TS-LC-01): contain --archive under the project root. Resolve
    // relative to the project (not cwd) and reject absolute escapes / `..`
    // traversal, so the command can never write/overwrite a file outside the
    // project — mirrors the containment wall in memory-reflect-commit.js.
    const root = path.resolve(targetDir);
    const resolved = path.resolve(root, String(options.archive));
    if (resolved !== root && !resolved.startsWith(root + path.sep)) {
      if (wantJson) return { ok: false, reason: 'archive_path_escape' };
      log(tFn(t, 'cli.memory_trim.archive_path_escape', { path: String(options.archive) })
        || `memory:trim: refused --archive outside the project: ${options.archive}`);
      return { ok: false, reason: 'archive_path_escape' };
    }
    archivePath = resolved;
  } else {
    archivePath = path.join(targetDir, DEFAULT_ARCHIVE_REL);
  }

  const content = readFileOrNull(currentStatePath);
  if (content === null) {
    if (wantJson) return { ok: false, reason: 'no_current_state' };
    log(tFn(t, 'cli.memory_trim.no_current_state', { path: CURRENT_STATE_REL })
      || `memory:trim: ${CURRENT_STATE_REL} not found (nothing to trim).`);
    return { ok: false, reason: 'no_current_state' };
  }

  const activeSlugs = parseActiveSlugs(readFileOrNull(path.join(targetDir, FEATURES_REL)) || '');
  const result = splitCurrentState(content, { keep, activeSlugs });
  if (!result.ok) {
    if (wantJson) return { ok: false, reason: result.reason };
    log(tFn(t, 'cli.memory_trim.section_not_found')
      || `memory:trim: "## What the system already has" section not found — nothing to do.`);
    return { ok: false, reason: result.reason };
  }

  const { hotContent, archivedEntries, stats } = result;

  if (archivedEntries.length === 0) {
    if (wantJson) return { ok: true, dry_run: dryRun, archived: 0, stats };
    log(tFn(t, 'cli.memory_trim.nothing_to_archive', { kept: stats.kept, keep })
      || `memory:trim: ${stats.kept} entr${stats.kept === 1 ? 'y' : 'ies'} within keep=${keep} window — nothing to archive.`);
    return { ok: true, dry_run: dryRun, archived: 0, stats };
  }

  if (dryRun) {
    if (!wantJson) {
      log(tFn(t, 'cli.memory_trim.dry_run_summary', {
        archived: stats.archived,
        kept: stats.kept,
        total: stats.total_entries,
        keep,
        saved_kb: (stats.saved_bytes / 1024).toFixed(1),
        before_kb: (stats.before_bytes / 1024).toFixed(1),
        after_kb: (stats.after_bytes / 1024).toFixed(1)
      }) || `memory:trim [dry-run]: would archive ${stats.archived}/${stats.total_entries} entries (keep=${keep}, active-slug exempt). ${(stats.before_bytes / 1024).toFixed(1)}KB → ${(stats.after_bytes / 1024).toFixed(1)}KB (saves ${(stats.saved_bytes / 1024).toFixed(1)}KB). No files written.`);
      for (const e of archivedEntries.slice(0, 5)) {
        log(`  - would archive: ${e.slice(0, 100)}${e.length > 100 ? '…' : ''}`);
      }
      if (archivedEntries.length > 5) log(`  … and ${archivedEntries.length - 5} more`);
    }
    return { ok: true, dry_run: true, archived: stats.archived, stats, archive_path: path.relative(targetDir, archivePath) };
  }

  // Real run — tier-2 notify before any mutation (BR-ALL-06).
  try {
    const notifyResult = await runNotify({
      args: [targetDir],
      options: {
        level: 'warn',
        topic: 'memory',
        message: tFn(t, 'cli.memory_trim.notify_template', { archived: stats.archived })
          || `trimming current-state.md: archiving ${stats.archived} cold entries`,
        agent: 'memory-trim',
        json: wantJson ? true : undefined
      },
      logger: logger || { log: () => {} }
    });
    if (notifyResult && notifyResult.ok === false) {
      if (wantJson) return { ok: false, reason: 'notify_blocked', exitCode: notifyResult.exitCode };
      log('memory:trim aborted: tier-2 notify returned non-zero exit code.');
      return { ok: false, reason: 'notify_blocked' };
    }
  } catch (err) {
    if (wantJson) return { ok: false, reason: 'notify_failed', error: String((err && err.message) || err) };
    log(`memory:trim notify failed: ${(err && err.message) || err}`);
    return { ok: false, reason: 'notify_failed' };
  }

  const nowIso = new Date().toISOString();
  const eol = /\r\n/.test(content) ? '\r\n' : '\n';
  const existingArchive = readFileOrNull(archivePath) || '';
  const newArchive = buildArchiveContent(existingArchive, archivedEntries, nowIso, eol);

  try {
    fs.mkdirSync(path.dirname(archivePath), { recursive: true });
    fs.writeFileSync(archivePath, newArchive, 'utf8');
    fs.writeFileSync(currentStatePath, hotContent, 'utf8');
  } catch (err) {
    if (wantJson) return { ok: false, reason: 'write_failed', error: String((err && err.message) || err) };
    log(`memory:trim write failed: ${(err && err.message) || err}`);
    return { ok: false, reason: 'write_failed' };
  }

  if (wantJson) {
    return {
      ok: true,
      dry_run: false,
      archived: stats.archived,
      stats,
      current_state_path: path.relative(targetDir, currentStatePath),
      archive_path: path.relative(targetDir, archivePath)
    };
  }
  log(tFn(t, 'cli.memory_trim.trimmed_success', {
    archived: stats.archived,
    kept: stats.kept,
    before_kb: (stats.before_bytes / 1024).toFixed(1),
    after_kb: (stats.after_bytes / 1024).toFixed(1),
    archive: path.relative(targetDir, archivePath)
  }) || `memory:trim ✓ archived ${stats.archived} entries (kept ${stats.kept}). ${(stats.before_bytes / 1024).toFixed(1)}KB → ${(stats.after_bytes / 1024).toFixed(1)}KB. Archive: ${path.relative(targetDir, archivePath)}`);
  return { ok: true, dry_run: false, archived: stats.archived, stats };
}

module.exports = { runMemoryTrim };
