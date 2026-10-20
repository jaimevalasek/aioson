'use strict';

// Which agent took over the live session — recorded as `agent_activated` on
// the session that launched the tool, so the Play's Activity view can say
// "@dev" instead of the label the session was opened under (`@aioson`).
//
// Two channels feed it:
//   - the prompt hook (`hooks:emit`): exact, at the moment the user types
//     `/aioson:agent:dev` (or the model runs it through Claude's Skill tool).
//     hooks:emit resolves the run itself — the launcher's live session, else
//     the per-agent hooks session — and the activation carries the harness
//     session_id, so the checkpoint after a compaction knows who works in
//     that session even when no launcher opened it;
//   - `context:brief` / `context:select --agent=<name>`: every agent kernel
//     runs one before acting, from any harness (codex, opencode, …), as a
//     shell command that inherits the session from `live:start`.
// Both go through here, so the same agent is recorded once per change.

const fs = require('node:fs/promises');
const path = require('node:path');
const { getAgentDefinition } = require('../agents');
const { openRuntimeDb, resolveRuntimePaths, appendRunEvent } = require('../runtime-store');

const SESSION_ID_SQL = "CASE WHEN json_valid(payload_json) THEN json_extract(payload_json, '$.session_id') END";

/** `@dev` for a known agent id/alias, otherwise null. */
function activationHandle(agent) {
  const definition = getAgentDefinition(String(agent || '').replace(/^@/, ''));
  return definition ? `@${definition.id}` : null;
}

/** The last agent activated on the run — within one harness session when its id is known. */
function lastActivatedAgent(db, runKey, sessionId = null) {
  const row = sessionId
    ? db.prepare(`SELECT payload_json FROM agent_events WHERE run_key = ? AND event_type = 'agent_activated' AND ${SESSION_ID_SQL} = ? ORDER BY id DESC LIMIT 1`).get(runKey, sessionId)
    : db.prepare("SELECT payload_json FROM agent_events WHERE run_key = ? AND event_type = 'agent_activated' ORDER BY id DESC LIMIT 1").get(runKey);
  if (!row) return null;
  try {
    return JSON.parse(row.payload_json || '{}').agent || null;
  } catch {
    return null;
  }
}

/**
 * Records that `agent` took over a session: the run the caller already
 * resolved (`run`), else the live session that launched this process. Silent
 * and best-effort: no session to record on, an unknown agent or the same agent
 * as last time records nothing. Never opens a session itself.
 *
 * @param {string} targetDir project root
 * @param {string} agent agent id or handle
 * @param {{ via: string, source?: string, sessionId?: string|null, run?: { runKey: string, sessionDir?: string|null }|null }} options
 */
async function recordAgentActivation(targetDir, agent, { via, source, sessionId = null, run = null } = {}) {
  const handle = activationHandle(agent);
  if (!handle || !targetDir) return { recorded: false, reason: 'unknown-agent' };
  try {
    const { runtimeDir } = resolveRuntimePaths(targetDir);
    let liveRun = run && run.runKey ? run : null;
    if (!liveRun) {
      // Lazy: live.js is large and requires this module's callers.
      const { resolveLauncherLiveSession } = require('../commands/live');
      liveRun = await resolveLauncherLiveSession(targetDir, runtimeDir, source ? { source } : {});
    }
    if (!liveRun) return { recorded: false, reason: 'no-live-session' };

    const opened = await openRuntimeDb(targetDir, { mustExist: true });
    if (!opened || !opened.db) return { recorded: false, reason: 'no-runtime' };
    const now = new Date().toISOString();
    try {
      if (lastActivatedAgent(opened.db, liveRun.runKey, sessionId) === handle) {
        return { recorded: false, reason: 'same-agent' };
      }
      appendRunEvent(opened.db, {
        runKey: liveRun.runKey,
        eventType: 'agent_activated',
        phase: 'live',
        status: 'running',
        message: handle,
        payload: { agent: handle, via, ...(source ? { source } : {}), ...(sessionId ? { session_id: sessionId } : {}) },
        createdAt: now
      });
    } finally {
      opened.db.close();
    }
    // Append only — state.json belongs to `live:*` (see hooks:emit).
    if (liveRun.sessionDir) {
      await fs.appendFile(
        path.join(liveRun.sessionDir, 'events.ndjson'),
        JSON.stringify({ ts: now, type: 'agent_activated', message: handle, agent: handle, via }) + '\n',
        'utf8'
      ).catch(() => {});
    }
    return { recorded: true, runKey: liveRun.runKey, agent: handle };
  } catch {
    return { recorded: false, reason: 'error' };
  }
}

module.exports = { recordAgentActivation, activationHandle };
