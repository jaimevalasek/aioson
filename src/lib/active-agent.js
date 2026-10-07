'use strict';

// Which agent is acting right now — a runtime fact, never an install-time
// constant. The session guard used to be installed with `--agent='dev'` baked
// in by every `aioson install`/`update`, so a plan written by the planner was
// guarded with the dev's rules. `--agent=auto` (and an absent flag) resolves:
//
//   1. the harness event (`agent`, `agent_name`, `context.agent`);
//   2. `AIOSON_AGENT` in the environment — exact, set by whatever launched a
//      session for one agent;
//   3. the project's latest `context:brief` or `context:select` in the last
//      two hours — every agent kernel consults one of them before acting, so
//      it is the activation handshake. Parallel sessions on one project make
//      this best-effort; the environment variable is the exact channel.
//
// Returns `{ agent: null }` when nothing answers; the caller owns its fallback.

const { canonicalAgentId, normalizeAgentName } = require('../agents');

const ACTIVE_WINDOW_MS = 120 * 60 * 1000;
const AUTO = new Set(['', 'auto']);

function isAutoAgent(value) {
  return AUTO.has(normalizeAgentName(value || ''));
}

function agentFromEvent(event) {
  if (!event || typeof event !== 'object') return '';
  return event.agent || event.agent_name || (event.context && event.context.agent) || '';
}

async function latestBriefAgent(targetDir, now) {
  let handle = null;
  try {
    const { openRuntimeDb } = require('../runtime-store');
    handle = await openRuntimeDb(targetDir, { mustExist: true });
    if (!handle || !handle.db) return null;
    const since = new Date(now - ACTIVE_WINDOW_MS).toISOString();
    const row = handle.db.prepare(
      "SELECT agent_name FROM execution_events WHERE created_at >= ? AND ((source = 'context_brief' AND event_type = 'brief_built') OR (source = 'context_select' AND event_type = 'selection_built')) ORDER BY created_at DESC LIMIT 1"
    ).get(since);
    return row && row.agent_name ? canonicalAgentId(row.agent_name) : null;
  } catch {
    return null; // a missing or locked runtime store never breaks a hook
  } finally {
    if (handle && handle.db) { try { handle.db.close(); } catch { /* already closed */ } }
  }
}

/**
 * @param {string} targetDir project root
 * @param {{ event?: object, env?: object, now?: number }} [options]
 * @returns {Promise<{ agent: string|null, source: 'event'|'env'|'runtime'|'none' }>}
 */
async function resolveActiveAgent(targetDir, options = {}) {
  const { event = null, env = process.env, now = Date.now() } = options;
  const fromEvent = agentFromEvent(event);
  if (fromEvent && !isAutoAgent(fromEvent)) return { agent: canonicalAgentId(fromEvent), source: 'event' };
  if (env && env.AIOSON_AGENT && !isAutoAgent(env.AIOSON_AGENT)) {
    return { agent: canonicalAgentId(env.AIOSON_AGENT), source: 'env' };
  }
  const fromRuntime = await latestBriefAgent(targetDir, now);
  if (fromRuntime) return { agent: fromRuntime, source: 'runtime' };
  return { agent: null, source: 'none' };
}

module.exports = {
  ACTIVE_WINDOW_MS,
  isAutoAgent,
  resolveActiveAgent
};
