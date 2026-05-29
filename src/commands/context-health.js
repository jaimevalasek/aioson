'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { openRuntimeDb } = require('../runtime-store');

const CHARS_PER_TOKEN = 4;
const HEAVY_TOKEN_THRESHOLD = 5000;   // ~20KB
const CRITICAL_TOKEN_THRESHOLD = 12500; // ~50KB

function estimateTokens(content) {
  return Math.ceil(content.length / CHARS_PER_TOKEN);
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  return `${(bytes / 1024).toFixed(1)}KB`;
}

function formatTokens(n) {
  return `~${n.toLocaleString()}`;
}

async function loadFeatureStatuses(contextDir) {
  const featuresPath = path.join(contextDir, 'features.md');
  try {
    const content = await fs.readFile(featuresPath, 'utf8');
    const done = new Set();
    for (const line of content.split(/\r?\n/)) {
      // Match lines like: - auth: done or | auth | done |
      const m = line.match(/[-|]\s*([a-z0-9_-]+)\s*[:|]\s*done/i);
      if (m) done.add(m[1].toLowerCase());
    }
    return done;
  } catch {
    return new Set();
  }
}

async function getCacheHitRate(db) {
  if (!db) return null;
  try {
    const rows = db.prepare(`
      SELECT COUNT(*) as total,
             SUM(CASE WHEN event_type = 'cache_hit' THEN 1 ELSE 0 END) as hits
      FROM execution_events
      WHERE created_at >= datetime('now', '-7 days')
    `).get();
    if (!rows || rows.total === 0) return null;
    return Math.round((rows.hits / rows.total) * 100);
  } catch {
    return null;
  }
}

async function runContextHealth({ args, options = {}, logger }) {
  const targetDir = path.resolve(process.cwd(), args[0] || '.');
  const contextDir = path.join(targetDir, '.aioson', 'context');

  let entries;
  try {
    entries = await fs.readdir(contextDir);
  } catch {
    if (!options.json) logger.log('No .aioson/context/ directory found.');
    return { ok: false, reason: 'no_context_dir' };
  }

  const mdFiles = entries.filter((f) => f.endsWith('.md'));
  const report = [];
  let totalTokens = 0;

  for (const file of mdFiles) {
    try {
      const content = await fs.readFile(path.join(contextDir, file), 'utf8');
      const tokens = estimateTokens(content);
      totalTokens += tokens;
      report.push({
        file,
        sizeBytes: content.length,
        tokens,
        heavy: tokens > HEAVY_TOKEN_THRESHOLD,
        critical: tokens > CRITICAL_TOKEN_THRESHOLD
      });
    } catch { /* skip unreadable files */ }
  }

  // bootstrap/*.md is the per-activation memory layer: dev/qa/architect/deyvin
  // read it on every session start, so it dominates the real activation cost.
  // It lives in a subdir, so the top-level scan above missed it entirely —
  // include it here so the heaviest layer is visible, not hidden (P0 of the
  // agent-loading-contract). Backward-compatible: no bootstrap/ dir → no change.
  const bootstrapDir = path.join(contextDir, 'bootstrap');
  let bootstrapFiles = [];
  try {
    // Exclude *-archive.md: cold storage is never loaded at activation, so
    // counting it would inflate the report and mislabel intended bulk as CRITICAL.
    bootstrapFiles = (await fs.readdir(bootstrapDir))
      .filter((f) => f.endsWith('.md') && !f.endsWith('-archive.md'));
  } catch { /* no bootstrap dir — pre-Living-Memory projects */ }
  for (const file of bootstrapFiles) {
    try {
      const content = await fs.readFile(path.join(bootstrapDir, file), 'utf8');
      const tokens = estimateTokens(content);
      totalTokens += tokens;
      report.push({
        file: `bootstrap/${file}`,
        sizeBytes: content.length,
        tokens,
        heavy: tokens > HEAVY_TOKEN_THRESHOLD,
        critical: tokens > CRITICAL_TOKEN_THRESHOLD
      });
    } catch { /* skip unreadable files */ }
  }

  report.sort((a, b) => b.tokens - a.tokens);

  const doneFeatures = await loadFeatureStatuses(contextDir);
  const staleSpecs = report.filter((r) => {
    if (!r.file.startsWith('spec-')) return false;
    const slug = r.file.replace(/^spec-/, '').replace(/\.md$/, '');
    return doneFeatures.has(slug);
  });

  const dbResult = await openRuntimeDb(targetDir, { mustExist: true }).catch(() => ({ db: null, dbPath: null }));
  const db = dbResult ? dbResult.db : null;
  const dbPath = dbResult ? dbResult.dbPath : null;
  const cacheHitRate = await getCacheHitRate(db);
  if (db) {
    // bug-found-004: openRuntimeDb activates WAL mode, which spawns
    // `aios.sqlite-wal` and `aios.sqlite-shm` sibling files. Closing the
    // handle without truncating the WAL first leaves those files locked
    // for ~50-100ms on Windows — long enough to make any cleanup-then-rm
    // teardown fail with EBUSY. Truncate-checkpoint forces WAL → main and
    // synchronously releases the sibling files so the close() that follows
    // leaves a clean filesystem state.
    try { db.pragma('wal_checkpoint(TRUNCATE)'); } catch { /* best-effort */ }
    db.close();
  }

  const skeletonPresent = entries.includes('skeleton-system.md') || entries.includes('skeleton.md');

  if (options.json) {
    return {
      ok: true,
      totalTokens,
      files: report,
      staleSpecs: staleSpecs.map((s) => s.file),
      cacheHitRate,
      skeletonPresent,
      dbPath
    };
  }

  const COL_FILE = 28;
  const COL_SIZE = 10;
  const COL_TOKENS = 16;

  logger.log(`Context Health Report — ${path.basename(targetDir)}`);
  logger.log('─'.repeat(56));
  logger.log('Files'.padEnd(COL_FILE) + 'Size'.padEnd(COL_SIZE) + 'Tokens (est.)');
  logger.log('─'.repeat(56));

  for (const r of report) {
    const flag = r.critical ? ' !! CRITICAL' : r.heavy ? ' ⚠ HEAVY' : '';
    logger.log(
      r.file.padEnd(COL_FILE) +
      formatBytes(r.sizeBytes).padEnd(COL_SIZE) +
      formatTokens(r.tokens) + flag
    );
  }

  logger.log('─'.repeat(56));
  logger.log(`Total context load:`.padEnd(COL_FILE + COL_SIZE) + formatTokens(totalTokens) + ' tokens');
  logger.log('');

  const heavyFiles = report.filter((r) => r.heavy);
  if (heavyFiles.length > 0) {
    for (const r of heavyFiles) {
      const label = r.critical ? 'CRITICAL' : 'heavy';
      logger.log(`⚠  ${r.file} is ${label} (${formatBytes(r.sizeBytes)}). Consider:`);
      if (r.file === 'bootstrap/current-state.md') {
        logger.log(`   → Run: aioson memory:trim . --dry-run`);
        logger.log(`     Archives old log entries out of the hot bootstrap (every agent reads this at activation)`);
      } else {
        logger.log(`   → Run: aioson context:pack . --scope=<feature>`);
        logger.log(`     Creates a scoped context for a specific feature`);
      }
    }
    logger.log('');
  }

  if (staleSpecs.length > 0) {
    logger.log(`⚠  ${staleSpecs.length} stale spec file(s) (features: done):`);
    for (const s of staleSpecs) {
      const slug = s.file.replace(/^spec-/, '').replace(/\.md$/, '');
      logger.log(`   → ${s.file} (feature: ${slug} is done)`);
    }
    logger.log(`   Run: aioson feature:archive . --feature=<slug> to archive them`);
    logger.log('');
  }

  if (cacheHitRate !== null) {
    logger.log(`✓  Cache hit rate: ${cacheHitRate}% (last 7 days)`);
  }
  if (skeletonPresent) {
    logger.log(`✓  skeleton-system.md present — agents can use as lightweight index`);
  }

  return {
    ok: true,
    totalTokens,
    files: report,
    staleSpecs: staleSpecs.map((s) => s.file),
    cacheHitRate,
    skeletonPresent,
    dbPath
  };
}

module.exports = { runContextHealth };
