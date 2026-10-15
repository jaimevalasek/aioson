'use strict';

// Which agent took over the live session — recorded as `agent_activated` on
// the session that launched the tool, so the Play's Activity view can say
// "@dev" instead of the label the session was opened under (`@aioson`).
//
// Two channels feed it:
//   - Claude Code's UserPromptSubmit hook (`hooks:emit`): exact, at the moment
//     the user types `/aioson:agent:dev`;
//   - `context:brief` / `context:select --agent=<name>`: every agent kernel
//     runs one before acting, from any harness (codex, opencode, …), as a
//     shell command that inherits the session from `live:start`.
// Both go through here, so the same agent is recorded once per change.

const fs = require('node:fs/promises');
const path = require('node:path');
const { getAgentDefinition } = require('../agents');
const { openRuntimeDb, resolveRuntimePaths, appendRunEvent } = require('../runtime-store');

/** `@dev` for a known agent id/alias, otherwise null. */
function activationHandle(agent) {
  const definition = getAgentDefinition(String(agent || '').replace(/^@/, ''));
  return definition ? `@${definition.id}` : null;
}

function lastActivatedAgent(db, runKey) {
  const row = db.prepare(
    "SELECT payload_json FROM agent_events WHERE run_key = ? AND event_type = 'agent_activated' ORDER BY id DESC LIMIT 1"
  ).get(runKey);
  if (!row) return null;
  try {
    return JSON.parse(row.payload_json || '{}').agent || null;
  } catch {
    return null;
  }
}

/**
 * Records that `agent` took over the live session that launched this process.
 * Silent and best-effort: no open session, an unknown agent or the same agent
 * as last time records nothing. Never opens a session.
 *
 * @param {string} targetDir project root
 * @param {string} agent agent id or handle
 * @param {{ via: string, source?: string }} options
 */
async function recordAgentActivation(targetDir, agent, { via, source } = {}) {
  const handle = activationHandle(agent);
  if (!handle || !targetDir) return { recorded: false, reason: 'unknown-agent' };
  try {
    const { runtimeDir } = resolveRuntimePaths(targetDir);
    // Lazy: live.js is large and requires this module's callers.
    const { resolveLauncherLiveSession } = require('../commands/live');
    const liveRun = await resolveLauncherLiveSession(targetDir, runtimeDir, source ? { source } : {});
    if (!liveRun) return { recorded: false, reason: 'no-live-session' };

    const opened = await openRuntimeDb(targetDir, { mustExist: true });
    if (!opened || !opened.db) return { recorded: false, reason: 'no-runtime' };
    const now = new Date().toISOString();
    try {
      if (lastActivatedAgent(opened.db, liveRun.runKey) === handle) {
        return { recorded: false, reason: 'same-agent' };
      }
      appendRunEvent(opened.db, {
        runKey: liveRun.runKey,
        eventType: 'agent_activated',
        phase: 'live',
        status: 'running',
        message: handle,
        payload: { agent: handle, via, ...(source ? { source } : {}) },
        createdAt: now
      });
    } finally {
      opened.db.close();
    }
    // Append only — state.json belongs to `live:*` (see hooks:emit).
    await fs.appendFile(
      path.join(liveRun.sessionDir, 'events.ndjson'),
      JSON.stringify({ ts: now, type: 'agent_activated', message: handle, agent: handle, via }) + '\n',
      'utf8'
    ).catch(() => {});
    return { recorded: true, runKey: liveRun.runKey, agent: handle };
  } catch {
    return { recorded: false, reason: 'error' };
  }
}

module.exports = { recordAgentActivation, activationHandle };
