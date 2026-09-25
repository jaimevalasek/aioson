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

const { randomUUID } = require('node:crypto');
const { openRuntimeDb } = require('../runtime-store');

function nowIso() { return new Date().toISOString(); }

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
    // TTL cleanup: remove events older than their ttl_hours
    db.prepare(`
      DELETE FROM inter_squad_events
      WHERE datetime(created_at, '+' || ttl_hours || ' hours') < datetime('now')
    `).run();

    const rows = db.prepare(`
      SELECT * FROM inter_squad_events ORDER BY created_at ASC
    `).all();

    const matching = [];

    for (const row of rows) {
      const consumed = JSON.parse(row.consumed_by || '[]');
      if (consumed.includes(toSquad)) continue;

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

module.exports = { publish, peek, consume, matchesPattern, publishWithA2A, publishRemote };
