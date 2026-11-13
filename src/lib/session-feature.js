'use strict';

/**
 * The feature a live session works on.
 *
 * A project had one active feature — `active_feature` in project-pulse.md,
 * rewritten by every `pulse:update --feature` — so with two sessions open on
 * the same folder the one that registered or advanced a feature last moved
 * the other one's too. Each live session now keeps its own, beside its
 * `state.json`:
 *
 *   .aioson/runtime/live/<session>/feature.json
 *
 * The session is the one that launched this process: `live:start` exports its
 * key as AIOSON_LIVE_SESSION_KEY / AIOSON_LIVE_SESSION, and the key counts
 * only while that session has a running live run in THIS project. Without the
 * key nothing is read or written here and every command answers as before.
 *
 * The file is separate from `state.json` on purpose: every event rewrites the
 * state from a copy read earlier, and a feature kept there would be dropped by
 * the next event of a concurrent command.
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const { resolveRuntimePaths, openRuntimeDb } = require('../runtime-store');
const { validateFeatureSlug } = require('../verification/path-policy');
const { resolveTargetDir, resolveProjectRootOrSelf } = require('./project-root');

const SESSION_FEATURE_FILE = 'feature.json';

// The value a lane worker's AIOSON_LIVE_SESSION carries (adapters/base.js
// laneEnv): a session of its own, never the launcher's.
const NO_LIVE_SESSION = 'none';

// bug-found-005: session keys carry the format `direct-session:{ts}:{agent}`
// which contains colons. NTFS reserves `:` in filenames (it's the drive-letter
// separator and the alternate-data-stream syntax), so any `path.join(..., 'live',
// 'direct-session:1234:deyvin')` would have `mkdir` fail silently in the
// auxiliary-filesystem catches of live.js — leaving the dashboard's
// state.json/events.ndjson/summary.md never written on Windows.
//
// We sanitize only at the filesystem boundary: the session_key stored in
// SQLite, returned to callers, and printed by the CLI keeps its colons (it's
// a documented public identifier). Colons survive on POSIX too, but `__` is
// safe everywhere and lets a single code path handle both platforms.
function sessionKeyToDirName(sessionKey) {
  return String(sessionKey).replace(/:/g, '__');
}

function liveSessionDir(runtimeDir, sessionKey) {
  return path.join(runtimeDir, 'live', sessionKeyToDirName(sessionKey));
}

/**
 * The session a key names, while it runs in this project: its running live
 * run, read from the database — a handoff swaps it for the next agent's. A
 * key with no running run here (the tool moved to another project, or the
 * session was closed) is null — never a guess.
 */
async function findRunningLiveSession(targetDir, runtimeDir, sessionKey) {
  const handle = await openRuntimeDb(targetDir, { mustExist: true });
  if (!handle) return null;
  try {
    const row = handle.db.prepare(`
      SELECT run_key FROM agent_runs
      WHERE session_key = ? AND source = 'live' AND status = 'running'
      ORDER BY started_at DESC, rowid DESC
      LIMIT 1
    `).get(sessionKey);
    return row
      ? { sessionKey, runKey: row.run_key, sessionDir: liveSessionDir(runtimeDir, sessionKey) }
      : null;
  } finally {
    handle.db.close();
  }
}

// Commands that say which feature the session is on when they name one. The
// value is the option that carries the slug.
const FEATURE_BINDING_COMMANDS = new Map([
  ['pulse:update', 'feature'],
  ['context:brief', 'feature'],
  ['phase:next', 'feature'],
  ['dev:state:write', 'feature'],
  ['state:save', 'feature'],
  ['workflow:next', 'expect-feature'],
  ['feature:register', 'feature']
]);

function canonicalCommand(command) {
  const text = String(command || '').trim();
  if (FEATURE_BINDING_COMMANDS.has(text)) return text;
  // `pulse-update`, `dev-state-write`: the dashed spelling of the same command.
  for (const name of FEATURE_BINDING_COMMANDS.keys()) {
    if (name.replace(/:/g, '-') === text) return name;
  }
  return null;
}

// Slug-shaped words that mean "no feature": the registry's sentinels and
// `workflow:next --expect-feature=none|project` (project mode).
const NO_FEATURE_WORDS = new Set(['none', 'null', 'project']);

/** A feature slug the canonical rule accepts, or null. A bare flag (`true`) is no slug. */
function normalizeFeatureSlug(value) {
  if (typeof value !== 'string') return null;
  const validation = validateFeatureSlug(value);
  if (!validation.ok || NO_FEATURE_WORDS.has(validation.feature_slug)) return null;
  return validation.feature_slug;
}

/** The key `live:start` exported to this process, or null. */
function ownSessionKey(env = process.env) {
  const key = String(env.AIOSON_LIVE_SESSION_KEY || env.AIOSON_LIVE_SESSION || '').trim();
  return key && key !== NO_LIVE_SESSION ? key : null;
}

function sessionFeaturePath(sessionDir) {
  return path.join(sessionDir, SESSION_FEATURE_FILE);
}

/**
 * The live session that owns this process — `{ sessionKey, runKey, sessionDir }`
 * — or null: no key in the environment, or a key with no running session in
 * this project (closed, or the tool moved to another folder).
 */
async function resolveOwnSession(targetDir, env = process.env) {
  const key = ownSessionKey(env);
  if (!key) return null;
  const { runtimeDir } = resolveRuntimePaths(targetDir);
  return findRunningLiveSession(targetDir, runtimeDir, key).catch(() => null);
}

async function readFeatureFile(sessionDir) {
  try {
    const parsed = JSON.parse(await fs.readFile(sessionFeaturePath(sessionDir), 'utf8'));
    return normalizeFeatureSlug(parsed && parsed.feature);
  } catch {
    return null;
  }
}

/** The feature recorded in a session directory, whoever asks (`live:status --session`). */
async function readFeatureOfSessionDir(sessionDir) {
  return sessionDir ? readFeatureFile(sessionDir) : null;
}

// Written whole and renamed into place: a reader never sees half a file. The
// rename can lose to a reader holding the file on Windows; the direct write
// that follows is still one small write.
async function writeFeatureFile(sessionDir, record) {
  const target = sessionFeaturePath(sessionDir);
  const text = `${JSON.stringify(record, null, 2)}\n`;
  await fs.mkdir(sessionDir, { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  try {
    await fs.writeFile(temporary, text, 'utf8');
    await fs.rename(temporary, target);
  } catch {
    await fs.rm(temporary, { force: true }).catch(() => {});
    await fs.writeFile(target, text, 'utf8');
  }
}

/** Records the feature of a session directory (`live:start --feature`). */
async function writeFeatureOfSessionDir(sessionDir, sessionKey, feature, source) {
  const slug = normalizeFeatureSlug(feature);
  if (!sessionDir || !slug) return null;
  await writeFeatureFile(sessionDir, {
    session_key: sessionKey,
    feature: slug,
    bound_at: new Date().toISOString(),
    bound_by: source || null
  });
  return slug;
}

/**
 * The feature of the session that owns this process.
 *
 * `null` outside a live session of this project; otherwise
 * `{ sessionKey, feature }`, with `feature: null` for a session that has not
 * named one yet.
 */
async function readSessionFeature(targetDir, env = process.env) {
  const session = await resolveOwnSession(targetDir, env);
  if (!session) return null;
  return { sessionKey: session.sessionKey, feature: await readFeatureFile(session.sessionDir) };
}

/**
 * Binds the session that owns this process to a feature. A no-op outside a
 * live session and for a value that is not a feature slug; best-effort — the
 * command that named the feature never fails because of it.
 */
async function bindSessionFeature(targetDir, feature, { env = process.env, source = null } = {}) {
  const slug = normalizeFeatureSlug(feature);
  if (!slug) return { bound: false, reason: 'invalid_feature' };
  try {
    const session = await resolveOwnSession(targetDir, env);
    if (!session) return { bound: false, reason: 'no_live_session' };
    const previous = await readFeatureFile(session.sessionDir);
    if (previous !== slug) {
      await writeFeatureOfSessionDir(session.sessionDir, session.sessionKey, slug, source);
    }
    return { bound: true, sessionKey: session.sessionKey, feature: slug, previous };
  } catch (error) {
    return { bound: false, reason: 'write_failed', error: error && error.message };
  }
}

/**
 * The CLI's single hook: a command of FEATURE_BINDING_COMMANDS that names a
 * feature binds the session it runs in before it executes, so the command
 * itself already answers about that feature.
 */
async function bindSessionFeatureForCommand({ command, args = [], options = {}, env = process.env } = {}) {
  const name = canonicalCommand(command);
  if (!name || !ownSessionKey(env)) return null;
  const slug = normalizeFeatureSlug(options[FEATURE_BINDING_COMMANDS.get(name)]);
  if (!slug) return null;
  const targetDir = resolveProjectRootOrSelf(resolveTargetDir(args));
  return bindSessionFeature(targetDir, slug, { env, source: name });
}

module.exports = {
  SESSION_FEATURE_FILE,
  FEATURE_BINDING_COMMANDS,
  NO_LIVE_SESSION,
  sessionKeyToDirName,
  liveSessionDir,
  findRunningLiveSession,
  ownSessionKey,
  resolveOwnSession,
  readSessionFeature,
  readFeatureOfSessionDir,
  writeFeatureOfSessionDir,
  bindSessionFeature,
  bindSessionFeatureForCommand
};
