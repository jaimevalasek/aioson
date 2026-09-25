'use strict';
const { randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { openRuntimeDb, insertWorkerRun } = require('../runtime-store');
const { normalizeCall, keyFor } = require('./event-delivery');

const INBOX_DIR = (projectDir, squadSlug) =>
  path.join(projectDir, '.aioson', 'squads', squadSlug, 'inbox');

async function enqueueCall(projectDir, request) {
  const directory = INBOX_DIR(projectDir, request.to);
  await fs.mkdir(directory, { recursive: true });
  const destination = path.join(directory, `${keyFor(request.from, request.to, request.id)}.json`);
  const temporary = path.join(directory, `.${randomUUID()}.tmp`);
  const serialized = JSON.stringify(request);
  try {
    await fs.writeFile(temporary, serialized, { flag: 'wx' });
    try {
      // Publish complete bytes without overwriting a competing call with the same identity.
      await fs.link(temporary, destination);
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (await fs.readFile(destination, 'utf8') !== serialized) throw new Error('call_identity_conflict', { cause: error });
    }
  } finally { await fs.unlink(temporary).catch(() => {}); }
}

async function callSquad({ projectDir, from, to, worker, payload = {}, conversationId, callId, depth = 0 }) {
  if (!Number.isInteger(depth) || depth < 0 || depth >= 5) return { ok: false, error: 'cascade_guard' };
  callId = callId || randomUUID();
  conversationId = conversationId || callId;
  let request;
  try { request = normalizeCall({ id: callId, from, to, worker, payload, conversationId, depth: depth + 1 }); }
  catch (error) { return { ok: false, error: error.message, callId, conversationId }; }

  const handle = await openRuntimeDb(projectDir);
  const db = handle?.db;
  try {
    const port = db?.prepare("SELECT port FROM squad_daemons WHERE squad_slug = ? AND status = 'running'").get(to)?.port;
    let result;
    if (port) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/call/${worker}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, _inter_squad: { id: callId, from, to, conversationId, depth: request.depth } }),
          signal: AbortSignal.timeout(10000)
        });
        const json = await res.json();
        result = { ok: res.ok && json.ok === true, result: json, error: json.ok === true ? undefined : json.error || json.status || 'call_failed',
          status: json.status, delivery_key: json.delivery_key, callId, conversationId };
      } catch {
        // Outcome may be unknown. Inbox uses exactly the same identity as HTTP.
      }
    }
    if (!result) {
      try {
        await enqueueCall(projectDir, request);
        result = { ok: false, error: 'offline_queued', status: 'queued',
          reason: port ? 'http_outcome_unknown' : 'daemon_offline', callId, conversationId };
      } catch (error) {
        if (error.message !== 'call_identity_conflict') throw error;
        result = { ok: false, error: error.message, callId, conversationId };
      }
    }
    if (db) {
      try {
        insertWorkerRun(db, {
          squadSlug: from, workerSlug: worker, triggerType: 'inter-squad',
          inputJson: JSON.stringify({ to, payload, conversationId, callId }),
          outputJson: result.ok ? JSON.stringify(result.result) : null,
          status: result.ok ? 'completed' : 'failed', errorMessage: result.ok ? null : result.error,
          durationMs: 0, attempt: 1, conversationId
        });
      } catch { /* Telemetry does not determine delivery. */ }
    }
    return result;
  } finally { if (db) db.close(); }
}

module.exports = { callSquad, INBOX_DIR };
