'use strict';

// Sub-Task Scout — direct telemetry helper
//
// Bypasses `logAgentEvent`'s session-lifecycle layer to write `event_type='sub_task'`
// rows directly into `agent_events`. Necessary for one-shot agents like
// `feature-close` that fire exactly one sub_task event per invocation: their
// FIRST event would otherwise land as `event_type='start'` (lifecycle artifact)
// with `payload_json=null`, which `collectScoutSummary` cannot match.
//
// Closes M-01 from QA Gate D corrections plan.

const { openRuntimeDb } = require('./runtime-store');

function nowIso() {
  return new Date().toISOString();
}

// emitSubTaskEvent — telemetry-only, never throws (matches existing
// best-effort convention in scout commands).
//
// Writes one row to agent_events with:
//   event_type   = 'sub_task'
//   message      = options.message (string)
//   payload_json = JSON.stringify(options.payload || {})
//   run_key      = `sub-task-${options.parent_session_id || 'orphan'}`
//                  (sentinel; agent_events.run_key is NOT NULL but no FK)
// Sentinel agent_run for sub-task events. agent_events has a FOREIGN KEY on
// run_key → agent_runs(run_key); we maintain a single anchor row so direct
// sub_task inserts don't violate the constraint without needing per-event
// session scaffolding.
const SUB_TASK_RUN_KEY = 'sub-task-scout-anchor';

function ensureSubTaskAnchorRun(db) {
  const now = nowIso();
  db.prepare(`
    INSERT OR IGNORE INTO agent_runs
      (run_key, agent_name, agent_kind, source, status, started_at, updated_at)
    VALUES (?, 'sub-task-scout', 'official', 'direct', 'running', ?, ?)
  `).run(SUB_TASK_RUN_KEY, now, now);
}

async function emitSubTaskEvent(rootPath, options = {}) {
  const message = String(options.message || '');
  const payload = options.payload || {};
  const createdAt = nowIso();

  let handle;
  try {
    handle = await openRuntimeDb(rootPath);
  } catch {
    return; // best-effort
  }
  if (!handle || !handle.db) return;

  try {
    ensureSubTaskAnchorRun(handle.db);
    handle.db.prepare(`
      INSERT INTO agent_events (run_key, event_type, message, payload_json, created_at)
      VALUES (?, 'sub_task', ?, ?, ?)
    `).run(SUB_TASK_RUN_KEY, message, JSON.stringify(payload), createdAt);
  } catch {
    // best-effort
  } finally {
    try { handle.db.close(); } catch { /* ignore */ }
  }
}

module.exports = { emitSubTaskEvent };
