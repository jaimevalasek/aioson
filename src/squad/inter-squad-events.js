'use strict';

/**
 * Inter-Squad Event Streaming — publish/subscribe over SQLite
 *
 * Squads publish typed events (e.g. 'episode.created') and subscribe
 * to patterns (e.g. 'episode.*'). Consumers receive events at the
 * start of each squad:autorun run.
 *
 * Usage in squad manifests:
 *   "subscriptions": ["episode.*", "review.completed"]
 *   "publishes": ["episode.created"]
 *
 * Table: inter_squad_events (created in runtime-store.js)
 */

const { randomUUID, createHash } = require('node:crypto');
const { openRuntimeDb } = require('../runtime-store');

function nowIso() { return new Date().toISOString(); }

function migrateSessions(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS inter_squad_event_sessions (
      squad_slug TEXT NOT NULL, session_id TEXT NOT NULL, events_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL, completed_at TEXT,
      PRIMARY KEY (squad_slug, session_id)
    );
    CREATE TABLE IF NOT EXISTS inter_squad_event_claims (
      event_id TEXT NOT NULL, squad_slug TEXT NOT NULL, session_id TEXT NOT NULL,
      PRIMARY KEY (event_id, squad_slug)
    );
  `);
}

function decodeSession(row) {
  return row ? { sessionId: row.session_id, status: row.status, events: JSON.parse(row.events_json) } : null;
}

async function withSessions(projectDir, action) {
  const handle = await openRuntimeDb(projectDir);
  if (!handle) throw new Error('Event session store unavailable');
  try { migrateSessions(handle.db); return action(handle.db); }
  finally { handle.db.close(); }
}

async function getSession(projectDir, { toSquad, sessionId }) {
  return withSessions(projectDir, (db) => decodeSession(db.prepare(
    'SELECT * FROM inter_squad_event_sessions WHERE squad_slug = ? AND session_id = ?'
  ).get(toSquad, sessionId)));
}

function pendingRows(db, toSquad) {
  return db.prepare(`SELECT e.*, c.session_id AS claimed_session FROM inter_squad_events e
    LEFT JOIN inter_squad_event_claims c ON c.event_id = e.id AND c.squad_slug = ?
    WHERE datetime(e.created_at, '+' || e.ttl_hours || ' hours') >= datetime('now')
    ORDER BY e.created_at, e.id`).all(toSquad)
    .filter((row) => !JSON.parse(row.consumed_by || '[]').includes(toSquad));
}

function decodeEvent(row) {
  return { id: row.id, fromSquad: row.from_squad, event: row.event,
    payload: row.payload ? JSON.parse(row.payload) : null, createdAt: row.created_at };
}

function matchesSubscription(row, subscriptions, dependencies) {
  return subscriptions.some((pattern) => matchesPattern(row.event, pattern)) || dependencies.some((dep) =>
    dep.event && (!dep.squad || dep.squad === row.from_squad) && matchesPattern(row.event, dep.event));
}

async function bindSession(projectDir, { toSquad, sessionId, subscriptions = [], dependencies = [], ignoreDependencies = false, acceptNew = true }) {
  return withSessions(projectDir, (db) => db.transaction(() => {
    const existing = decodeSession(db.prepare('SELECT * FROM inter_squad_event_sessions WHERE squad_slug = ? AND session_id = ?').get(toSquad, sessionId));
    if (existing) return { ok: true, ...existing };
    const rows = acceptNew ? pendingRows(db, toSquad).filter((row) => matchesSubscription(row, subscriptions, dependencies)) : [];
    const conflict = rows.find((row) => row.claimed_session && row.claimed_session !== sessionId);
    if (conflict) return { ok: false, error: 'event_session_conflict', session_id: conflict.claimed_session };
    const unmet = acceptNew && !ignoreDependencies ? dependencies.filter((dep) => dep.event && !rows.some((row) =>
      (!dep.squad || dep.squad === row.from_squad) && matchesPattern(row.event, dep.event))) : [];
    if (unmet.length) return { ok: false, error: 'unmet_dependencies', unmet };
    // Decode the whole batch before mutating ownership; malformed payloads never get acknowledged.
    const events = rows.map(decodeEvent);
    db.prepare('INSERT INTO inter_squad_event_sessions (squad_slug,session_id,events_json,created_at) VALUES (?,?,?,?)')
      .run(toSquad, sessionId, JSON.stringify(events), nowIso());
    for (const row of rows) db.prepare('INSERT INTO inter_squad_event_claims (event_id,squad_slug,session_id) VALUES (?,?,?)').run(row.id, toSquad, sessionId);
    return { ok: true, sessionId, status: 'pending', events };
  }).immediate());
}

async function acknowledgeSession(projectDir, { toSquad, sessionId }) {
  return withSessions(projectDir, (db) => db.transaction(() => {
    const session = decodeSession(db.prepare('SELECT * FROM inter_squad_event_sessions WHERE squad_slug = ? AND session_id = ?').get(toSquad, sessionId));
    if (!session) throw new Error('Event session not found');
    if (session.status === 'completed') return;
    for (const event of session.events) {
      const claim = db.prepare('SELECT session_id FROM inter_squad_event_claims WHERE event_id = ? AND squad_slug = ?').get(event.id, toSquad);
      if (claim?.session_id !== sessionId) throw new Error('Event session ownership mismatch');
      const row = db.prepare('SELECT consumed_by FROM inter_squad_events WHERE id = ?').get(event.id);
      if (!row) throw new Error('Claimed event missing; reconcile before acknowledgement');
      const consumed = JSON.parse(row.consumed_by || '[]');
      if (!consumed.includes(toSquad)) consumed.push(toSquad);
      db.prepare('UPDATE inter_squad_events SET consumed_by = ? WHERE id = ?').run(JSON.stringify(consumed), event.id);
    }
    db.prepare("UPDATE inter_squad_event_sessions SET status = 'completed', completed_at = ? WHERE squad_slug = ? AND session_id = ?")
      .run(nowIso(), toSquad, sessionId);
  }).immediate());
}

async function nextSession(projectDir, { toSquad, subscriptions = [], dependencies = [] }) {
  return withSessions(projectDir, (db) => {
    const existing = decodeSession(db.prepare("SELECT * FROM inter_squad_event_sessions WHERE squad_slug = ? AND status = 'pending' AND events_json <> '[]' ORDER BY created_at, session_id LIMIT 1").get(toSquad));
    if (existing) return existing;
    const rows = pendingRows(db, toSquad).filter((row) => !row.claimed_session && matchesSubscription(row, subscriptions, dependencies));
    if (!rows.length) return null;
    // The oldest event gives persistent mode the same plan identity after a pre-dispatch crash.
    const sessionId = 'event-' + createHash('sha256').update(JSON.stringify([toSquad, rows[0].id])).digest('hex').slice(0, 32);
    return { sessionId, status: 'pending', events: rows.map(decodeEvent) };
  });
}

/**
 * Publish an event from a squad.
 *
 * @param {string} projectDir
 * @param {{ fromSquad: string, event: string, payload?: object }} opts
 * @returns {Promise<string|null>} event id, or null if db unavailable
 */
async function publish(projectDir, { fromSquad, event, payload = null }) {
  const handle = await openRuntimeDb(projectDir);
  if (!handle) return null;
  const { db } = handle;
  try {
    const id = randomUUID();
    db.prepare(`
      INSERT INTO inter_squad_events (id, from_squad, event, payload, created_at, consumed_by, ttl_hours)
      VALUES (?, ?, ?, ?, ?, '[]', 48)
    `).run(id, fromSquad, event, payload ? JSON.stringify(payload) : null, nowIso());
    return id;
  } finally {
    db.close();
  }
}

/**
 * Inspect pending events without acknowledging or deleting them.
 * Dependency checks must not steal events from the execution that needs them.
 */
async function peek(projectDir, { toSquad, subscriptions = [], fromSquad } = {}) {
  if (subscriptions.length === 0) return [];
  const handle = await openRuntimeDb(projectDir, { mustExist: true });
  if (!handle) return [];
  const { db } = handle;
  try {
    const rows = db.prepare(`
      SELECT * FROM inter_squad_events
      WHERE datetime(created_at, '+' || ttl_hours || ' hours') >= datetime('now')
      ORDER BY created_at ASC
    `).all();
    return rows.filter((row) =>
      (!fromSquad || row.from_squad === fromSquad) &&
      !JSON.parse(row.consumed_by || '[]').includes(toSquad) &&
      subscriptions.some((pattern) => matchesPattern(row.event, pattern))
    ).map((row) => ({
      id: row.id,
      fromSquad: row.from_squad,
      event: row.event,
      payload: row.payload ? JSON.parse(row.payload) : null,
      createdAt: row.created_at
    }));
  } finally { db.close(); }
}

/**
 * Consume pending events for a squad.
 * Marks consumed events so they are not returned again for this squad.
 *
 * Pattern matching:
 *   'episode.*'  matches 'episode.created', 'episode.updated' (one segment after prefix)
 *   '*'          matches any event
 *   'exact.name' matches that exact event name only
 *
 * @param {string} projectDir
 * @param {{ toSquad: string, subscriptions: string[] }} opts
 * @returns {Promise<Array<{ id, fromSquad, event, payload, createdAt }>>}
 */
async function consume(projectDir, { toSquad, subscriptions = [] }) {
  if (subscriptions.length === 0) return [];

  const handle = await openRuntimeDb(projectDir, { mustExist: true });
  if (!handle) return [];
  const { db } = handle;

  try {
    migrateSessions(db);
    return db.transaction(() => {
    // TTL cleanup: remove events older than their ttl_hours
    db.prepare(`
      DELETE FROM inter_squad_events
      WHERE datetime(created_at, '+' || ttl_hours || ' hours') < datetime('now')
      AND id NOT IN (SELECT event_id FROM inter_squad_event_claims)
    `).run();

    const rows = db.prepare(`
      SELECT * FROM inter_squad_events
      WHERE datetime(created_at, '+' || ttl_hours || ' hours') >= datetime('now')
      ORDER BY created_at ASC
    `).all();

    const matching = [];

    for (const row of rows) {
      const consumed = JSON.parse(row.consumed_by || '[]');
      if (consumed.includes(toSquad)) continue;
      if (db.prepare('SELECT 1 FROM inter_squad_event_claims WHERE event_id = ? AND squad_slug = ?').get(row.id, toSquad)) continue;

      const matched = subscriptions.some((pattern) => matchesPattern(row.event, pattern));
      if (!matched) continue;

      consumed.push(toSquad);
      db.prepare(`UPDATE inter_squad_events SET consumed_by = ? WHERE id = ?`)
        .run(JSON.stringify(consumed), row.id);

      matching.push({
        id: row.id,
        fromSquad: row.from_squad,
        event: row.event,
        payload: row.payload ? JSON.parse(row.payload) : null,
        createdAt: row.created_at
      });
    }

    return matching;
    }).immediate();
  } finally {
    db.close();
  }
}

/**
 * Pattern matching for inter-squad event subscriptions.
 *   '*'           → any event
 *   'episode.*'   → 'episode.created', 'episode.updated' (exactly one segment after prefix, no deeper nesting)
 *   'exact.name'  → only that exact event name
 */
function matchesPattern(event, pattern) {
  if (pattern === '*') return true;
  if (!pattern.includes('*')) return pattern === event;
  // Trailing '.*': match exactly one additional dot-separated segment
  if (pattern.endsWith('.*')) {
    const prefix = pattern.slice(0, -2); // e.g. 'episode'
    if (!event.startsWith(prefix + '.')) return false;
    const remainder = event.slice(prefix.length + 1); // e.g. 'created'
    return remainder.length > 0 && !remainder.includes('.');
  }
  // Other glob patterns not supported → exact match only
  return pattern === event;
}

// ─── A2A Remote Backend (Plan 81 §3.2) ───────────────────────────────────────

/**
 * Publish an event to remote A2A peers (if configured in manifest).
 *
 * @param {string} projectDir
 * @param {{ fromSquad: string, event: string, payload?: object }} eventData
 * @param {{ peers: Array<{ name: string, url: string }> }} a2aConfig
 * @returns {Promise<object[]>}  — results per peer
 */
async function publishRemote(projectDir, eventData, a2aConfig) {
  if (!a2aConfig || !a2aConfig.peers || a2aConfig.peers.length === 0) return [];

  let publishEvent;
  try {
    ({ publishEvent } = require('../a2a/client'));
  } catch {
    return [];
  }

  const results = [];
  for (const peer of a2aConfig.peers) {
    const result = await publishEvent(peer.url, eventData).catch((err) => ({
      ok: false, error: err.message
    }));
    results.push({ peer: peer.name, ...result });
  }

  return results;
}

/**
 * Enhanced publish: local + optional remote A2A.
 *
 * @param {string} projectDir
 * @param {{ fromSquad: string, event: string, payload?: object }} eventData
 * @param {{ remote?: boolean, a2a?: object }} options
 */
async function publishWithA2A(projectDir, eventData, options = {}) {
  // Always publish locally
  const localId = await publish(projectDir, eventData);

  // Optionally publish to A2A peers
  let remoteResults = [];
  if (options.remote && options.a2a) {
    remoteResults = await publishRemote(projectDir, eventData, options.a2a);
  }

  return { localId, remoteResults };
}

module.exports = { publish, peek, consume, matchesPattern, publishWithA2A, publishRemote,
  getSession, bindSession, acknowledgeSession, nextSession };
