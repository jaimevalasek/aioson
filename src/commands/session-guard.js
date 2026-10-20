'use strict';

/**
 * aioson session:guard [projectDir] --agent=<name> --tool=<tool>
 *
 * Background supervisor that keeps a live session alive.
 * - If no live session exists: auto-starts one (no-launch mode)
 * - Polls every 30s to verify the session is still open
 * - Detects inactivity (no events for --idle-minutes, default: 60) and closes gracefully
 * - Works alongside hooks:emit — guard handles session lifecycle, hooks handle events
 *
 * Run in background:
 *   aioson session:guard . --agent=dev --tool=claude &
 *
 * Or as a foreground check (--once):
 *   aioson session:guard . --agent=dev --tool=claude --once
 */

const path = require('node:path');
const fs = require('node:fs/promises');
const {
  openRuntimeDb,
  resolveRuntimePaths,
  readAgentSession,
  writeAgentSession,
  startTask,
  startRun,
  updateRun,
  updateTask,
  appendRunEvent
} = require('../runtime-store');
const { resolveTargetDir } = require('../lib/project-root');

const POLL_INTERVAL_MS = 30_000;
const DEFAULT_IDLE_MINUTES = 60;

function nowIso() { return new Date().toISOString(); }
function log(msg) { process.stderr.write(`[session:guard] ${msg}\n`); }

async function getLastEventTime(runtimeDir, sessionKey) {
  const eventsPath = path.join(runtimeDir, 'live', sessionKey, 'events.ndjson');
  try {
    const content = await fs.readFile(eventsPath, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);
    if (lines.length === 0) return null;
    const last = JSON.parse(lines[lines.length - 1]);
    return last.ts ? new Date(last.ts) : null;
  } catch {
    return null;
  }
}

// The session file is keyed by the agent handle (`@dev`), the name hooks:emit
// and agent:done read — a bare `dev.json` was a second, unshared session.
const sessionHandle = (agentName) => `@${agentName}`;

async function startLiveSession(targetDir, runtimeDir, agentName, tool) {
  const now = nowIso();
  const sessionKey = `guard-${agentName}-${Date.now()}`;
  const title = `[guard] ${agentName} via ${tool}`;

  const { db } = await openRuntimeDb(targetDir);
  try {
    const taskKey = startTask(db, {
      sessionKey,
      title,
      status: 'running',
      createdBy: agentName,
      taskKind: 'live_session',
      metaJson: { tool_session: tool, path: targetDir, guarded: true }
    });

    const runKey = startRun(db, {
      taskKey,
      agentName,
      agentKind: 'official',
      sessionKey,
      source: 'live',
      title,
      eventType: 'session_started',
      phase: 'live',
      message: `Session auto-started by session:guard (${tool})`,
      payload: { tool_session: tool, path: targetDir, guarded: true }
    });

    await writeAgentSession(runtimeDir, sessionHandle(agentName), {
      runKey, taskKey, sessionKey,
      startedAt: now, finished: false, source: 'live'
    });

    // Create state.json for dashboard
    const stateDir = path.join(runtimeDir, 'live', sessionKey);
    await fs.mkdir(stateDir, { recursive: true });
    await fs.writeFile(path.join(stateDir, 'state.json'), JSON.stringify({
      session_key: sessionKey, run_key: runKey, task_key: taskKey,
      agent_name: agentName, tool_session: tool,
      status: 'running', started_at: now, updated_at: now, guarded: true,
      last_events: [{ ts: now, type: 'session_started', summary: `Auto-started by session:guard (${tool})` }]
    }, null, 2), 'utf8');

    log(`Session started: ${sessionKey} (run: ${runKey})`);
    return { runKey, taskKey, sessionKey };
  } finally {
    db.close();
  }
}

async function closeSession(targetDir, runtimeDir, agentName, runKey, taskKey, reason) {
  const now = nowIso();
  const { db } = await openRuntimeDb(targetDir, { mustExist: true });
  try {
    appendRunEvent(db, {
      runKey, eventType: 'session_ended', phase: 'live',
      status: 'completed', message: `Session closed by session:guard: ${reason}`,
      createdAt: now
    });
    updateRun(db, runKey, { status: 'completed', summary: reason, finishedAt: now });
    if (taskKey) updateTask(db, taskKey, { status: 'completed', finishedAt: now });

    // Update state.json
    const { db: _, ...rest } = await readAgentSession(runtimeDir, sessionHandle(agentName)).catch(() => ({}));
    const sessionKey = rest?.sessionKey;
    if (sessionKey) {
      const statePath = path.join(runtimeDir, 'live', sessionKey, 'state.json');
      try {
        const state = JSON.parse(await fs.readFile(statePath, 'utf8'));
        state.status = 'closed';
        state.updated_at = now;
        await fs.writeFile(statePath, JSON.stringify(state, null, 2), 'utf8');
      } catch { /* non-fatal */ }
    }

    // Clear session file
    const sessionFile = path.join(runtimeDir, '.sessions', `${sessionHandle(agentName)}.json`);
    try { await fs.unlink(sessionFile); } catch { /* already gone */ }

    log(`Session closed: ${runKey} (${reason})`);
  } finally {
    db.close();
  }
}

async function tick(targetDir, runtimeDir, agentName, tool, idleMs, state) {
  const session = await readAgentSession(runtimeDir, sessionHandle(agentName));

  if (!session || session.finished) {
    // No session — start one
    const created = await startLiveSession(targetDir, runtimeDir, agentName, tool);
    state.runKey = created.runKey;
    state.taskKey = created.taskKey;
    state.sessionKey = created.sessionKey;
    state.startedAt = Date.now();
    return;
  }

  // Session exists — check for idle timeout
  const sessionKey = session.sessionKey;
  const lastEvent = await getLastEventTime(runtimeDir, sessionKey);
  const now = Date.now();
  const lastActivity = lastEvent ? lastEvent.getTime() : state.startedAt;
  const idleFor = now - lastActivity;

  if (idleFor > idleMs) {
    const idleMin = Math.round(idleFor / 60000);
    log(`Idle for ${idleMin}m — closing session`);
    await closeSession(targetDir, runtimeDir, agentName, session.runKey, session.taskKey,
      `Idle for ${idleMin} minutes`);
    state.runKey = null;
    state.taskKey = null;
    state.sessionKey = null;
  }
}

async function runSessionGuard({ args, options = {}, logger }) {
  const targetDir = resolveTargetDir(args);
  const agentName = options.agent ? String(options.agent).replace(/^@/, '') : 'dev';
  const tool = options.tool ? String(options.tool).trim() : 'claude';
  const once = options.once || options['once'] || false;
  const idleMinutes = Number(options['idle-minutes'] || options.idleMinutes || DEFAULT_IDLE_MINUTES);
  const idleMs = idleMinutes * 60 * 1000;
  const intervalMs = Number(options.interval || POLL_INTERVAL_MS);

  const { runtimeDir } = resolveRuntimePaths(targetDir);
  const state = { runKey: null, taskKey: null, sessionKey: null, startedAt: Date.now() };

  if (!options.json) {
    logger.log(`[session:guard] Watching: ${targetDir}`);
    logger.log(`[session:guard] Agent: @${agentName} | Tool: ${tool} | Idle timeout: ${idleMinutes}m`);
    logger.log(`[session:guard] Press Ctrl+C to stop.`);
  }

  await tick(targetDir, runtimeDir, agentName, tool, idleMs, state);

  if (once) {
    return { ok: true, runKey: state.runKey, sessionKey: state.sessionKey };
  }

  return new Promise((resolve) => {
    const timer = setInterval(async () => {
      try {
        await tick(targetDir, runtimeDir, agentName, tool, idleMs, state);
      } catch (err) {
        log(`Error: ${err.message}`);
      }
    }, intervalMs);

    const shutdown = async () => {
      clearInterval(timer);
      if (state.runKey) {
        try {
          await closeSession(targetDir, runtimeDir, agentName, state.runKey, state.taskKey, 'session:guard stopped');
        } catch { /* best-effort */ }
      }
      if (!options.json) logger.log('[session:guard] Stopped.');
      resolve({ ok: true });
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  });
}

module.exports = { runSessionGuard };
