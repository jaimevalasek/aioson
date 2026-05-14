'use strict';

// Sub-Task Scout — state file management
//
// `.aioson/runtime/scouts/.state.json` tracks per-session cap usage and
// per-scout retry counters. Acquired via `.state.json.lock` (PID + ISO
// timestamp; stale after 30s — single-user / single-machine V1).
//
// Pure helpers. CLI commands compose these around the engine's `enforceCaps`.

const fs = require('node:fs');
const path = require('node:path');

const STATE_FILE_REL_DEFAULT = '.aioson/runtime/scouts/.state.json';
const LOCK_STALE_MS = 30_000;
const LOCK_RETRY_MS = 100;
const LOCK_TIMEOUT_MS = 30_000;

function statePath(rootDir, scoutDir) {
  if (scoutDir) return path.join(rootDir, scoutDir, '.state.json');
  return path.join(rootDir, STATE_FILE_REL_DEFAULT);
}

function lockPath(stateFilePath) {
  return `${stateFilePath}.lock`;
}

function emptyState() {
  return { schema_version: 1, sessions: {} };
}

function readState(stateFilePath) {
  try {
    const raw = fs.readFileSync(stateFilePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return emptyState();
    if (!parsed.sessions || typeof parsed.sessions !== 'object') parsed.sessions = {};
    return parsed;
  } catch (err) {
    if (err.code === 'ENOENT') return emptyState();
    // Corrupt state — start fresh; CLI surface logs the issue.
    return emptyState();
  }
}

function writeState(stateFilePath, state) {
  fs.mkdirSync(path.dirname(stateFilePath), { recursive: true });
  fs.writeFileSync(stateFilePath, JSON.stringify(state, null, 2), 'utf8');
}

function isStale(lockContent) {
  try {
    const data = JSON.parse(lockContent);
    if (typeof data.started_at !== 'string') return true;
    const age = Date.now() - Date.parse(data.started_at);
    return Number.isFinite(age) && age > LOCK_STALE_MS;
  } catch {
    return true; // unparseable lock → reclaim
  }
}

function tryAcquire(lockFilePath) {
  try {
    const fd = fs.openSync(lockFilePath, 'wx');
    fs.writeSync(fd, JSON.stringify({ pid: process.pid, started_at: new Date().toISOString() }));
    fs.closeSync(fd);
    return true;
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
    return false;
  }
}

function reclaimIfStale(lockFilePath) {
  let content;
  try {
    content = fs.readFileSync(lockFilePath, 'utf8');
  } catch {
    return false;
  }
  if (isStale(content)) {
    try { fs.unlinkSync(lockFilePath); } catch { /* race lost — caller retries */ }
    return true;
  }
  return false;
}

function sleepSync(ms) {
  // crude busy-wait to keep the CLI surface synchronous; only used in lock
  // contention which is rare (single-user). Bounded by LOCK_TIMEOUT_MS.
  const end = Date.now() + ms;
  while (Date.now() < end) { /* spin */ }
}

function acquireLock(stateFilePath) {
  fs.mkdirSync(path.dirname(stateFilePath), { recursive: true });
  const lock = lockPath(stateFilePath);
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (tryAcquire(lock)) return lock;
    reclaimIfStale(lock);
    sleepSync(LOCK_RETRY_MS);
  }
  const e = new Error(`scout state lock timeout (>${LOCK_TIMEOUT_MS}ms): ${lock}`);
  e.code = 'lock_timeout';
  throw e;
}

function releaseLock(lockFilePath) {
  try { fs.unlinkSync(lockFilePath); } catch { /* lock may have been reclaimed */ }
}

// withLock: acquire → run sync mutator → write state → release. Returns the
// mutator's return value. Callers stay short and obvious.
function withLock(rootDir, scoutDir, mutator) {
  const sf = statePath(rootDir, scoutDir);
  const lock = acquireLock(sf);
  try {
    const state = readState(sf);
    pruneOldSessions(state);
    const result = mutator(state);
    writeState(sf, state);
    return result;
  } finally {
    releaseLock(lock);
  }
}

function pruneOldSessions(state) {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000; // 24h
  for (const [sid, session] of Object.entries(state.sessions || {})) {
    const inFlight = (session.scouts_in_session || 0) > 0;
    const startedAt = session.started_at ? Date.parse(session.started_at) : NaN;
    if (!inFlight && Number.isFinite(startedAt) && startedAt < cutoff) {
      delete state.sessions[sid];
    }
  }
}

module.exports = {
  STATE_FILE_REL_DEFAULT,
  LOCK_STALE_MS,
  statePath,
  lockPath,
  emptyState,
  readState,
  writeState,
  acquireLock,
  releaseLock,
  withLock,
  pruneOldSessions
};
