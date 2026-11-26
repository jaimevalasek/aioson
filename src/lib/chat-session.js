'use strict';

/**
 * The chat a command runs in, when no live session launched it.
 *
 * Two plain chats on one folder shared every "which feature am I on?" answer:
 * `active_feature` in project-pulse.md, the project-level dev-state and the
 * last handoff are one per project, so whichever chat wrote last answered for
 * both — and the other chat continued that feature as its own. A live session
 * (`live:start`) keeps its own feature (session-feature.js); a chat opened
 * straight in its host had none.
 *
 * Every host measured tells a shell command its model runs which chat it
 * belongs to, through the environment (TOOL_CAPS `chat_env`). The CLI keeps
 * one small record per chat and per project:
 *
 *   .aioson/runtime/chats/<key>.json
 *     { chat, hosts, feature, bound_at, bound_by, seen_at }
 *
 * written when a command of that chat names a feature, read back before the
 * project-wide pointers.
 *
 * Hosts nest: a Codex started from a Claude Code chat inherits
 * CLAUDE_CODE_SESSION_ID and adds its own CODEX_THREAD_ID (measured). The key
 * is therefore every host variable present, together: the inner chat never
 * takes the outer chat's record, and two inner chats under one outer chat
 * stay apart.
 */

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { TOOL_CAPS } = require('./tool-capabilities');

const CHATS_DIR = path.join('.aioson', 'runtime', 'chats');

// Another chat counts as working beside this one while its last command that
// named a feature is this recent: one working day. Past it, its pointer in the
// pulse is history, and the pulse answers as it always did.
const CHAT_ACTIVE_WINDOW_MS = 12 * 60 * 60 * 1000;

// A record nobody refreshed in two weeks is a chat that ended.
const CHAT_RECORD_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;

const MAX_ENV_VALUE = 512;
const KEY_RE = /^[a-f0-9]{16}$/;

let sources = null;

// [{ host, names }], one variable belonging to one host: two registry entries
// of the same binary (agy, antigravity) declare the same one.
function chatEnvSources() {
  if (sources) return sources;
  const taken = new Set();
  sources = [];
  for (const [host, caps] of Object.entries(TOOL_CAPS)) {
    const names = (Array.isArray(caps.chat_env) ? caps.chat_env : []).filter((name) => !taken.has(name));
    if (names.length === 0) continue;
    for (const name of names) taken.add(name);
    sources.push({ host, names });
  }
  return sources;
}

function envValue(env, name) {
  const value = String((env && env[name]) || '').trim();
  return value && value.length <= MAX_ENV_VALUE ? value : null;
}

/**
 * The chat this process runs in: `{ key, hosts }`, or null when no host told
 * it (a terminal of its own, an unmeasured host).
 */
function resolveChatIdentity(env = process.env) {
  const parts = [];
  const hosts = [];
  for (const { host, names } of chatEnvSources()) {
    const name = names.find((candidate) => envValue(env, candidate));
    if (!name) continue;
    parts.push(`${host}=${envValue(env, name)}`);
    hosts.push(host);
  }
  if (parts.length === 0) return null;
  const key = crypto.createHash('sha256').update(parts.sort().join('\n')).digest('hex').slice(0, 16);
  return { key, hosts };
}

function chatsDir(targetDir) {
  return path.join(targetDir, CHATS_DIR);
}

function chatRecordPath(targetDir, key) {
  return path.join(chatsDir(targetDir), `${key}.json`);
}

function parseRecord(text, key) {
  try {
    const record = JSON.parse(text);
    if (!record || typeof record !== 'object' || record.chat !== key) return null;
    return record;
  } catch {
    return null;
  }
}

async function readChatRecord(targetDir, key) {
  if (!KEY_RE.test(String(key || ''))) return null;
  const text = await fs.readFile(chatRecordPath(targetDir, key), 'utf8').catch(() => null);
  return text ? parseRecord(text, key) : null;
}

async function listChatRecords(targetDir) {
  const entries = await fs.readdir(chatsDir(targetDir)).catch(() => []);
  const records = [];
  for (const entry of entries) {
    const key = entry.endsWith('.json') ? entry.slice(0, -5) : '';
    if (!KEY_RE.test(key)) continue;
    const record = await readChatRecord(targetDir, key);
    if (record) records.push(record);
  }
  return records;
}

function seenAt(record) {
  const time = Date.parse(record && record.seen_at);
  return Number.isFinite(time) ? time : 0;
}

// Ended chats leave their record behind; whoever writes clears them.
async function pruneChatRecords(targetDir, now) {
  for (const record of await listChatRecords(targetDir)) {
    if (now - seenAt(record) <= CHAT_RECORD_RETENTION_MS) continue;
    await fs.rm(chatRecordPath(targetDir, record.chat), { force: true }).catch(() => {});
  }
}

// Written whole and renamed into place, so a reader never sees half a file;
// the rename can lose to a reader holding the file on Windows, and the direct
// write that follows is still one small write.
async function writeRecord(targetDir, record) {
  const target = chatRecordPath(targetDir, record.chat);
  const text = `${JSON.stringify(record, null, 2)}\n`;
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  try {
    await fs.writeFile(temporary, text, 'utf8');
    await fs.rename(temporary, target);
  } catch {
    await fs.rm(temporary, { force: true }).catch(() => {});
    await fs.writeFile(target, text, 'utf8');
  }
}

/**
 * Records the feature this chat named. `feature` is an already validated
 * slug. Every call refreshes `seen_at`: it is how another chat knows this one
 * is still working.
 */
async function writeChatFeature(targetDir, identity, feature, { source = null, now = Date.now() } = {}) {
  if (!identity || !KEY_RE.test(identity.key) || !feature) return null;
  // A folder aioson was never installed in gets no `.aioson/` from a command
  // that merely named a feature there.
  const installed = await fs.stat(path.join(targetDir, '.aioson')).then((stat) => stat.isDirectory()).catch(() => false);
  if (!installed) return null;
  const previous = await readChatRecord(targetDir, identity.key);
  const at = new Date(now).toISOString();
  const record = {
    chat: identity.key,
    hosts: identity.hosts,
    feature,
    bound_at: previous && previous.feature === feature && previous.bound_at ? previous.bound_at : at,
    bound_by: source || null,
    seen_at: at
  };
  await writeRecord(targetDir, record);
  await pruneChatRecords(targetDir, now).catch(() => {});
  return { record, previous: previous ? previous.feature || null : null };
}

/**
 * The other chats of this folder that named a feature within the window,
 * newest first: `[{ chat, hosts, feature, seen_at, minutes_ago }]`.
 */
async function otherActiveChats(targetDir, ownKey, { now = Date.now(), windowMs = CHAT_ACTIVE_WINDOW_MS } = {}) {
  return (await listChatRecords(targetDir))
    .filter((record) => record.chat !== ownKey && record.feature && now - seenAt(record) <= windowMs)
    .sort((a, b) => seenAt(b) - seenAt(a))
    .map((record) => ({
      chat: record.chat,
      hosts: Array.isArray(record.hosts) ? record.hosts : [],
      feature: record.feature,
      seen_at: record.seen_at,
      minutes_ago: Math.max(0, Math.round((now - seenAt(record)) / 60000))
    }));
}

/** "a Codex chat, 12 min ago" — the other chat as a person reads it. */
function describeChat(chat) {
  const hosts = chat && chat.hosts && chat.hosts.length ? chat.hosts.join('+') : 'another';
  const ago = chat && Number.isFinite(chat.minutes_ago) ? `, last seen ${chat.minutes_ago} min ago` : '';
  return `a ${hosts} chat${ago}`;
}

module.exports = {
  CHATS_DIR,
  CHAT_ACTIVE_WINDOW_MS,
  CHAT_RECORD_RETENTION_MS,
  chatEnvSources,
  resolveChatIdentity,
  readChatRecord,
  listChatRecords,
  writeChatFeature,
  otherActiveChats,
  describeChat
};
