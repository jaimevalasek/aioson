'use strict';

/**
 * Neural Chain — git co-edit ingest helper.
 *
 * Implements the `git_co_edit` edge source for `chain_edges`. Co-edit pairs
 * are derived from `git log --pretty=format:%H|%cI --name-only -n N HEAD`
 * bounded to the last DEFAULT_MAX_COMMITS commits, filtered to the last
 * WINDOW_DAYS days, with `.aioson/` framework state excluded and mega-commits
 * (> MAX_FILES_PER_COMMIT files) skipped to bound the N² pair explosion.
 *
 * Confidence per BR-NC-01: `min(1.0, count / CONFIDENCE_SATURATION)`.
 * Hard cap per BR-NC-08: HARD_CAP_PER_NODE active edges per source_path; oldest
 * by `last_seen_at` is archived (`end_at = now`) before inserting beyond cap.
 *
 * EC-NC-06 (no git history): `runGitIngest` returns `{skipped: true,
 * reason: 'insufficient_history'}` when `git rev-list --count HEAD` < MIN.
 *
 * Idempotent: re-running with the same commit window produces the same active
 * state (UPSERT on the partial UNIQUE index over active rows).
 *
 * Two directional rows are stored per co-edit pair (A→B and B→A) to keep
 * `chain:audit WHERE source_path = X` queries direct without UNION ALL.
 *
 * Internal representation: `Map<source_path, Map<target_path, { count, lastSeen }>>`.
 * Nested map avoids string-separator ambiguity (file paths may contain any
 * character including spaces and NUL bytes).
 */

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const DEFAULT_MAX_COMMITS = 1000;
const CONFIDENCE_SATURATION = 10;
const WINDOW_DAYS = 90;
const MAX_FILES_PER_COMMIT = 50;
const HARD_CAP_PER_NODE = 10000;
const MIN_COMMITS_FOR_INGEST = 50;
const GIT_LOG_MAX_BUFFER = 32 * 1024 * 1024;

function parseGitLog(rawLog) {
  const commits = [];
  if (!rawLog || typeof rawLog !== 'string') return commits;

  const lines = rawLog.split(/\r?\n/);
  let current = null;
  const headerPattern = /^([0-9a-f]{7,40})\|(.+)$/;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, '');
    if (!line) {
      if (current) {
        commits.push(current);
        current = null;
      }
      continue;
    }

    const headerMatch = line.match(headerPattern);
    if (headerMatch) {
      if (current) commits.push(current);
      current = {
        commit_hash: headerMatch[1],
        committer_date_iso: headerMatch[2],
        files: []
      };
    } else if (current) {
      current.files.push(line);
    }
  }
  if (current) commits.push(current);
  return commits;
}

function bumpPair(bySource, source, target, isoDate) {
  let inner = bySource.get(source);
  if (!inner) {
    inner = new Map();
    bySource.set(source, inner);
  }
  const existing = inner.get(target);
  if (existing) {
    existing.count += 1;
    if (isoDate > existing.lastSeen) existing.lastSeen = isoDate;
  } else {
    inner.set(target, { count: 1, lastSeen: isoDate });
  }
}

function computeCoEditPairs(commits, { now = new Date() } = {}) {
  const cutoff = new Date(now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const bySource = new Map();

  for (const commit of commits) {
    const commitDate = new Date(commit.committer_date_iso);
    if (Number.isNaN(commitDate.getTime()) || commitDate < cutoff) continue;

    // Exclude framework state churn — .aioson/* changes every agent session.
    const files = commit.files.filter(
      (f) => f && !f.startsWith('.aioson/') && !f.startsWith('.aioson\\')
    );
    if (files.length < 2 || files.length > MAX_FILES_PER_COMMIT) continue;

    for (let i = 0; i < files.length; i++) {
      for (let j = 0; j < files.length; j++) {
        if (i === j) continue;
        bumpPair(bySource, files[i], files[j], commit.committer_date_iso);
      }
    }
  }

  return bySource;
}

function ingestGitCoEditEdges({ db, pairs, now = new Date() }) {
  if (!db || typeof db.prepare !== 'function') {
    throw new Error('ingestGitCoEditEdges requires an open better-sqlite3 db handle');
  }

  const nowIso = now.toISOString();
  const stats = { upserted: 0, archived: 0, capped_inserts: 0 };

  const upsertStmt = db.prepare(`
    INSERT INTO chain_edges (source_path, target_path, edge_type, confidence, start_at, last_seen_at, hit_count)
    VALUES (?, ?, 'git_co_edit', ?, ?, ?, ?)
    ON CONFLICT(source_path, target_path, edge_type) WHERE end_at IS NULL
    DO UPDATE SET
      confidence = excluded.confidence,
      last_seen_at = excluded.last_seen_at,
      hit_count = excluded.hit_count
  `);

  const countActiveStmt = db.prepare(`
    SELECT count(*) AS c FROM chain_edges
    WHERE source_path = ? AND end_at IS NULL
  `);

  const findExistingStmt = db.prepare(`
    SELECT id FROM chain_edges
    WHERE source_path = ? AND target_path = ? AND edge_type = 'git_co_edit' AND end_at IS NULL
  `);

  const findOldestStmt = db.prepare(`
    SELECT id FROM chain_edges
    WHERE source_path = ? AND end_at IS NULL
    ORDER BY last_seen_at ASC LIMIT 1
  `);

  const archiveStmt = db.prepare(`UPDATE chain_edges SET end_at = ? WHERE id = ?`);

  // Flatten nested Map<source, Map<target, {count, lastSeen}>> into items.
  const items = [];
  for (const [source, inner] of pairs.entries()) {
    if (!inner || typeof inner.entries !== 'function') continue;
    for (const [target, value] of inner.entries()) {
      items.push({ source, target, count: value.count, lastSeen: value.lastSeen });
    }
  }

  const tx = db.transaction((arr) => {
    for (const item of arr) {
      const confidence = Math.min(1.0, item.count / CONFIDENCE_SATURATION);

      // BR-NC-08 hard cap — only enforce when inserting a NEW edge for this source.
      // Existing-edge updates (re-ingest) don't grow the active set.
      const existingRow = findExistingStmt.get(item.source, item.target);
      if (!existingRow) {
        const { c: activeCount } = countActiveStmt.get(item.source);
        if (activeCount >= HARD_CAP_PER_NODE) {
          const oldest = findOldestStmt.get(item.source);
          if (oldest) {
            archiveStmt.run(nowIso, oldest.id);
            stats.archived += 1;
            stats.capped_inserts += 1;
          }
        }
      }

      upsertStmt.run(item.source, item.target, confidence, nowIso, item.lastSeen, item.count);
      stats.upserted += 1;
    }
  });

  tx(items);
  return stats;
}

function getCommitCount(projectDir) {
  try {
    const output = execSync('git rev-list --count HEAD', {
      cwd: projectDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const n = parseInt(output.trim(), 10);
    return Number.isFinite(n) ? n : 0;
  } catch (_) {
    return -1;
  }
}

function fetchGitLog(projectDir, maxCommits) {
  return execSync(
    `git log --pretty=format:%H|%cI --name-only -n ${Number(maxCommits)} HEAD`,
    {
      cwd: projectDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: GIT_LOG_MAX_BUFFER
    }
  );
}

function runGitIngest({
  db,
  projectDir,
  maxCommits = DEFAULT_MAX_COMMITS,
  now = new Date(),
  fetchLog = fetchGitLog
} = {}) {
  if (!projectDir) {
    return { skipped: true, reason: 'missing_project_dir' };
  }
  if (!fs.existsSync(path.join(projectDir, '.git'))) {
    return { skipped: true, reason: 'no_git_repo' };
  }

  const commitCount = getCommitCount(projectDir);
  if (commitCount < 0) {
    return { skipped: true, reason: 'git_unavailable' };
  }
  if (commitCount < MIN_COMMITS_FOR_INGEST) {
    return { skipped: true, reason: 'insufficient_history', commit_count: commitCount };
  }

  let rawLog;
  try {
    rawLog = fetchLog(projectDir, maxCommits);
  } catch (err) {
    return { skipped: true, reason: 'git_log_failed', error: err && err.message ? err.message : String(err) };
  }

  const commits = parseGitLog(rawLog);
  const pairs = computeCoEditPairs(commits, { now });
  const stats = ingestGitCoEditEdges({ db, pairs, now });

  let pairsCount = 0;
  for (const inner of pairs.values()) pairsCount += inner.size;

  return {
    skipped: false,
    commit_count: commitCount,
    commits_parsed: commits.length,
    pairs_computed: pairsCount,
    ...stats
  };
}

module.exports = {
  parseGitLog,
  computeCoEditPairs,
  ingestGitCoEditEdges,
  runGitIngest,
  DEFAULT_MAX_COMMITS,
  CONFIDENCE_SATURATION,
  WINDOW_DAYS,
  MAX_FILES_PER_COMMIT,
  HARD_CAP_PER_NODE,
  MIN_COMMITS_FOR_INGEST
};
