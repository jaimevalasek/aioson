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
 *
 * A chat opened straight in its host (Claude Code, Codex, agy, OpenCode) has
 * no live session, but its host names the chat to every command it runs: that
 * chat keeps its feature in `.aioson/runtime/chats/<key>.json`
 * (chat-session.js). A live session of this project comes first; the chat is
 * the answer only without one. The chat answer carries `chat: { key, hosts }`.
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const { resolveRuntimePaths, openRuntimeDb } = require('../runtime-store');
const { validateFeatureSlug } = require('../verification/path-policy');
const { resolveTargetDir, resolveProjectRootOrSelf } = require('./project-root');
const { resolveChatIdentity, readChatRecord, writeChatFeature } = require('./chat-session');

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

// `aioson <command> <args>` inside one segment of a recorded shell command
// (`npx aioson`, `node bin/aioson.js` too).
const AIOSON_COMMAND_RE = /\baioson(?:\.js)?\s+([a-z][a-z0-9:-]*)(.*)$/;
const SEGMENT_SPLIT_RE = /\r?\n|&&|\|\||[;&|]/;
const CD_RE = /^cd\s+("[^"]*"|'[^']*'|\S+)\s*$/;

function readCommandOption(text, option) {
  const match = String(text || '').match(new RegExp(`(?:^|\\s)--${option}(?:=|\\s+)("[^"]*"|'[^']*'|[^\\s"']+)`));
  return match ? match[1].replace(/^["']|["']$/g, '') : null;
}

function unquote(token) {
  return String(token || '').replace(/^["']|["']$/g, '');
}

// The project argument of a command: the word right after the command name,
// unless it is an option (`aioson context:brief --agent=dev` runs on `.`).
function readCommandTarget(rest) {
  const word = (String(rest || '').trim().match(/^("[^"]*"|'[^']*'|\S+)/) || [])[1];
  return word && !word.startsWith('-') ? unquote(word) : null;
}

// A Bash tool on Windows writes `/c/dev/app` for `C:\dev\app`.
function nativePath(value) {
  const text = String(value || '');
  const drive = process.platform === 'win32' ? text.match(/^\/([a-zA-Z])(\/.*)?$/) : null;
  return drive ? `${drive[1]}:${drive[2] || '/'}` : text;
}

// The project or a folder inside it: the CLI resolves a subfolder to its project.
function withinProject(target, root) {
  const fold = (value) => (process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value));
  const relative = path.relative(fold(root), fold(target));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/**
 * The feature a plain chat works on, read from the commands it ran.
 *
 * A chat opened without `live:start` has no session file, so every reader
 * that asks "which feature is mine?" fell back to the project-wide pointers —
 * the pulse, the project-level dev-state, the last handoff — which are the
 * last chat to write, maybe another one. The chat's own hooks recorded every
 * command it ran: the last one of FEATURE_BINDING_COMMANDS that named a
 * feature is the front this chat is on. Oldest first in, the newest naming wins.
 *
 * With `targetDir`, a command aimed at another folder (`aioson dev:state:write
 * ../other-app --feature=x`, or after `cd ../other-app`) names that folder's
 * front, not this one's: a chat working in one project while it measures
 * another was recapped with the other project's feature.
 */
function featureNamedByCommands(commands, { targetDir = null } = {}) {
  let found = null;
  for (const text of Array.isArray(commands) ? commands : []) {
    let cwd = targetDir;
    for (const raw of String(text || '').replace(/^\$\s*/, '').split(SEGMENT_SPLIT_RE)) {
      const segment = raw.trim();
      const cd = cwd ? segment.match(CD_RE) : null;
      if (cd) { cwd = path.resolve(cwd, nativePath(unquote(cd[1]))); continue; }
      const match = segment.match(AIOSON_COMMAND_RE);
      const name = match ? canonicalCommand(match[1]) : null;
      if (!name) continue;
      if (cwd && !withinProject(path.resolve(cwd, nativePath(readCommandTarget(match[2]) || '.')), targetDir)) continue;
      const slug = normalizeFeatureSlug(readCommandOption(match[2], FEATURE_BINDING_COMMANDS.get(name)));
      if (slug) found = slug;
    }
  }
  return found;
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
  if (session) return { sessionKey: session.sessionKey, feature: await readFeatureFile(session.sessionDir) };
  return readChatFeature(targetDir, env);
}

/**
 * The feature of the host chat this process runs in, without a live session:
 * `{ sessionKey: 'chat:<key>', feature, chat: { key, hosts } }`, with
 * `feature: null` for a chat that has not named one here; null when no host
 * names the chat.
 */
async function readChatFeature(targetDir, env = process.env) {
  const identity = resolveChatIdentity(env);
  if (!identity) return null;
  const record = await readChatRecord(targetDir, identity.key).catch(() => null);
  return {
    sessionKey: `chat:${identity.key}`,
    feature: normalizeFeatureSlug(record && record.feature),
    chat: identity
  };
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
    if (!session) return bindChatFeature(targetDir, slug, { env, source });
    const previous = await readFeatureFile(session.sessionDir);
    if (previous !== slug) {
      await writeFeatureOfSessionDir(session.sessionDir, session.sessionKey, slug, source);
    }
    return { bound: true, sessionKey: session.sessionKey, feature: slug, previous };
  } catch (error) {
    return { bound: false, reason: 'write_failed', error: error && error.message };
  }
}

async function bindChatFeature(targetDir, slug, { env, source }) {
  const identity = resolveChatIdentity(env);
  if (!identity) return { bound: false, reason: 'no_live_session' };
  const written = await writeChatFeature(targetDir, identity, slug, { source });
  if (!written) return { bound: false, reason: 'write_failed' };
  return { bound: true, sessionKey: `chat:${identity.key}`, feature: slug, previous: written.previous, chat: identity };
}

/**
 * The CLI's single hook: a command of FEATURE_BINDING_COMMANDS that names a
 * feature binds the session — or, without one, the host chat — it runs in
 * before it executes, so the command itself already answers about that feature.
 */
async function bindSessionFeatureForCommand({ command, args = [], options = {}, env = process.env } = {}) {
  const name = canonicalCommand(command);
  if (!name || (!ownSessionKey(env) && !resolveChatIdentity(env))) return null;
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
  readChatFeature,
  readFeatureOfSessionDir,
  writeFeatureOfSessionDir,
  bindSessionFeature,
  bindSessionFeatureForCommand,
  featureNamedByCommands
};
