'use strict';

/**
 * aioson hooks:emit [projectDir] --agent=<name> --source=<tool>
 *
 * Called by Claude Code / Antigravity / Codex hooks on every tool use.
 * Reads the hook payload from stdin (JSON), maps it to an AIOSON runtime event,
 * and writes it to the active live session in SQLite + events.ndjson.
 *
 * The event goes to the live session that launched the tool (`live:start`
 * exports AIOSON_LIVE_SESSION_KEY), or else to the single open live session of
 * this project for this tool. Only without either does it fall back to the
 * per-agent hooks session, auto-starting one (--no-launch mode) if needed.
 *
 * Designed to be fast (< 50ms hot path) and never block the agent.
 */

const path = require('node:path');
const fs = require('node:fs/promises');
const { execFileSync } = require('node:child_process');
const { resolveProjectRoot, resolveTargetDir } = require('../lib/project-root');
const {
  openRuntimeDb,
  resolveRuntimePaths,
  readAgentSession,
  appendRunEvent,
  startTask,
  startRun,
  writeAgentSession
} = require('../runtime-store');
const { resolveLauncherLiveSession } = require('./live');
const { getAgentDefinition } = require('../agents');
const { recordAgentActivation } = require('../lib/agent-activation');

const HOOKS_EMIT_VERSION = '1';

// Tool name → event_type mapping
const TOOL_EVENT_MAP = {
  Write: 'artifact',
  Edit: 'artifact',
  MultiEdit: 'artifact',
  Bash: 'step_done',
  Task: 'note',
  TodoWrite: 'note',
  WebSearch: 'note',
  WebFetch: 'note'
};

// Tools to skip — too noisy, no meaningful event
const SKIP_TOOLS = new Set(['Read', 'Glob', 'Grep', 'LS', 'NotebookRead', 'mcp__']);

function nowIso() {
  return new Date().toISOString();
}

const MAX_COMMAND_CHARS = 200;
const MAX_RESULT_CHARS = 200;
const MAX_TASK_LIST_CHARS = 300;
const MAX_REPLY_CHARS = 600;

// Summary lines test runners print (cargo, vitest/jest, pytest, node --test,
// go, rspec…). Only these lines are kept — never the rest of the output, which
// can hold anything.
const RESULT_LINE = /(test result:|^\s*tests?:?\s+\d|test files\s+\d|\b\d+\s+(passed|failed|passing|failing|pending|skipped)\b|^[#ℹ]\s*(pass|fail|tests)\s+\d|^(ok|fail|FAIL|PASS)\s+\S|\b\d+\s+examples?,\s+\d+\s+failures?)/i;

function oneLine(text, max) {
  const flat = String(text || '').replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** Last summary lines of a runner's output, or null when it printed none. */
function resultLine(...outputs) {
  const lines = outputs
    .filter(Boolean)
    .join('\n')
    // eslint-disable-next-line no-control-regex
    .replace(/\u001b\[[0-9;]*[A-Za-z]/g, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && RESULT_LINE.test(line));
  return lines.length ? oneLine(lines.slice(-2).join(' · '), MAX_RESULT_CHARS) : null;
}

/** "Tarefas: 2 de 4 feitas · em andamento: … · próximas: …" from TodoWrite. */
function taskListMessage(todos) {
  if (!Array.isArray(todos) || todos.length === 0) return null;
  const done = todos.filter((todo) => todo && todo.status === 'completed').length;
  const doing = todos.filter((todo) => todo && todo.status === 'in_progress').map((todo) => oneLine(todo.content, 80));
  const next = todos.filter((todo) => todo && todo.status === 'pending').map((todo) => oneLine(todo.content, 60));
  const parts = [`Tarefas: ${done} de ${todos.length} feitas`];
  if (doing.length) parts.push(`em andamento: ${doing.join('; ')}`);
  if (next.length) parts.push(`próximas: ${next.slice(0, 3).join('; ')}${next.length > 3 ? '…' : ''}`);
  return oneLine(parts.join(' · '), MAX_TASK_LIST_CHARS);
}

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    if (process.stdin.isTTY) { resolve(null); return; }

    let settled = false;
    const onData = (chunk) => { data += chunk; };

    // Settle once, then stop holding the event loop open: a flowing stdin with
    // live listeners keeps the process alive after the hook is done, which
    // strands the harness (and hangs any in-process caller, such as a test).
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      process.stdin.off('data', onData);
      process.stdin.off('end', onEnd);
      process.stdin.pause();
      resolve(value);
    };

    function onEnd() {
      try { finish(JSON.parse(data)); }
      catch { finish(null); }
    }

    // Timeout: don't block if stdin is empty
    const timer = setTimeout(() => finish(null), 500);
    if (typeof timer.unref === 'function') timer.unref();

    process.stdin.setEncoding('utf8');
    process.stdin.on('data', onData);
    process.stdin.on('end', onEnd);
  });
}

// The commands that activate an agent inside the tool: `/aioson:agent:dev`
// (Claude Code), `/dev`, `@dev`. Only a known agent counts — anything else the
// user types is not an activation.
const AGENT_COMMAND = /^(\/aioson:agent:|\/|@)([a-z][a-z0-9-]*)(?=\s|$)/i;

// Claude Code may hand over a slash command already expanded.
const EXPANDED_COMMAND = /<command-name>\s*(\/aioson:agent:)([a-z][a-z0-9-]*)\s*<\/command-name>/i;

/** `@dev` when the prompt activates a known agent, otherwise null. */
function agentFromPrompt(prompt) {
  const text = String(prompt || '').trim();
  const match = AGENT_COMMAND.exec(text) || EXPANDED_COMMAND.exec(text);
  if (!match) return null;
  const definition = getAgentDefinition(match[2]);
  if (!definition) return null;
  // A bare `/help` is the tool's own help, not the AIOSON agent.
  if (match[1] === '/' && definition.id === 'help') return null;
  return `@${definition.id}`;
}

function buildEventFromPayload(payload, source) {
  if (!payload) return null;

  const hookEvent = payload.hook_event_name || payload.hookEventName || null;
  // The user activated an agent inside the session. The session was opened
  // under the launcher's label; this is who actually works from here on.
  if (hookEvent === 'UserPromptSubmit') {
    const agent = agentFromPrompt(payload.prompt);
    if (!agent) return null;
    return {
      eventType: 'agent_activated',
      message: agent,
      filePath: null,
      toolName: null,
      extra: { agent, source },
      sessionId: payload.session_id || null
    };
  }
  // End of a turn: the agent's own final message is the best account of what
  // it did — kept as its claim, never as verified fact.
  if (hookEvent === 'Stop') {
    const reply = oneLine(payload.last_assistant_message, MAX_REPLY_CHARS);
    if (!reply) return null;
    return { eventType: 'agent_reply', message: reply, filePath: null, toolName: null, extra: {}, sessionId: payload.session_id || null };
  }

  const toolName = payload.tool_name || payload.toolName || null;
  if (!toolName) return null;

  // Skip noisy read-only tools
  if (SKIP_TOOLS.has(toolName) || [...SKIP_TOOLS].some((p) => toolName.startsWith(p))) {
    return null;
  }

  const eventType = TOOL_EVENT_MAP[toolName] || 'note';
  const input = payload.tool_input || payload.toolInput || {};

  let message = `[${source}] ${toolName}`;
  let filePath = null;
  let eventTypeOverride = null;
  const extra = {};

  if (toolName === 'Write' || toolName === 'Edit' || toolName === 'MultiEdit') {
    filePath = input.file_path || input.path || null;
    message = filePath ? `${toolName}: ${path.basename(filePath)}` : `${toolName}`;
  } else if (toolName === 'Bash') {
    const cmd = String(input.command || input.cmd || '').trim().slice(0, MAX_COMMAND_CHARS);
    message = cmd ? `$ ${cmd}` : 'Bash';
    // PostToolUse fires only on success; a non-zero exit fires
    // PostToolUseFailure with `error` ("Exit code N\n…").
    const response = payload.tool_response || {};
    if (hookEvent === 'PostToolUseFailure') {
      if (!payload.is_interrupt) {
        extra.outcome = 'failed';
        const exit = /^Exit code \d+/.exec(String(payload.error || ''));
        extra.result = resultLine(payload.error) || (exit ? exit[0] : null);
      }
    } else if (typeof response === 'object' && response && !response.interrupted) {
      extra.outcome = 'passed';
      const line = resultLine(response.stdout, response.stderr);
      if (line) extra.result = line;
    }
    if (!extra.result) delete extra.result;
  } else if (toolName === 'Task') {
    const desc = String(input.description || input.prompt || '').slice(0, 80);
    message = desc || 'Task launched';
  } else if (toolName === 'TodoWrite') {
    const summary = taskListMessage(input.todos);
    message = summary || 'Task list updated';
    if (summary) eventTypeOverride = 'plan_updated';
  }

  return {
    eventType: eventTypeOverride || eventType,
    message,
    filePath,
    toolName,
    extra,
    sessionId: payload.session_id || payload.sessionId || null
  };
}

async function ensureOrCreateLiveSession(targetDir, agentName, source, runtimeDir) {
  // Fast path: check existing session file
  const session = await readAgentSession(runtimeDir, agentName);
  if (session && !session.finished && session.source === 'live' && session.runKey) {
    return session.runKey;
  }

  // No session — auto-start one inline (no-launch mode)
  const now = nowIso();
  const sessionKey = `hooks-${agentName}-${Date.now()}`;
  const title = `[hooks] ${agentName} via ${source}`;

  const { db } = await openRuntimeDb(targetDir);
  try {
    const taskKey = startTask(db, {
      sessionKey,
      title,
      status: 'running',
      createdBy: agentName,
      taskKind: 'live_session',
      metaJson: { tool_session: source, path: targetDir, auto_started: true }
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
      message: `Auto-started by hooks:emit (${source})`,
      payload: { tool_session: source, path: targetDir, hooks_version: HOOKS_EMIT_VERSION }
    });

    await writeAgentSession(runtimeDir, agentName, {
      runKey,
      taskKey,
      sessionKey,
      startedAt: now,
      finished: false,
      source: 'live'
    });

    // Write state.json for dashboard live view
    const stateDir = path.join(runtimeDir, 'live', sessionKey);
    await fs.mkdir(stateDir, { recursive: true });
    await fs.writeFile(path.join(stateDir, 'state.json'), JSON.stringify({
      session_key: sessionKey,
      run_key: runKey,
      task_key: taskKey,
      agent_name: agentName,
      tool_session: source,
      status: 'running',
      started_at: now,
      updated_at: now,
      auto_started: true,
      last_events: [{ ts: now, type: 'session_started', summary: `Auto-started by hooks:emit (${source})` }]
    }, null, 2), 'utf8');

    return runKey;
  } finally {
    db.close();
  }
}

async function appendLiveEventFile(runtimeDir, runKey, event) {
  // Find the session dir for this runKey
  try {
    const liveRoot = path.join(runtimeDir, 'live');
    const entries = await fs.readdir(liveRoot).catch(() => []);
    for (const entry of entries) {
      const statePath = path.join(liveRoot, entry, 'state.json');
      try {
        const state = JSON.parse(await fs.readFile(statePath, 'utf8'));
        if (state.run_key === runKey) {
          const eventsPath = path.join(liveRoot, entry, 'events.ndjson');
          await fs.appendFile(eventsPath, JSON.stringify(event) + '\n', 'utf8');

          // Update state.json updated_at + last_events
          state.updated_at = event.ts;
          const lastEvents = state.last_events || [];
          lastEvents.push({ ts: event.ts, type: event.type, summary: event.summary || event.message });
          state.last_events = lastEvents.slice(-10); // keep last 10
          await fs.writeFile(statePath, JSON.stringify(state, null, 2), 'utf8');
          break;
        }
      } catch { /* skip */ }
    }
  } catch { /* non-fatal */ }
}

async function runHooksEmit({ args, options = {} }) {
  // The hook fires with the SHELL's cwd, which any `cd` during the session
  // moves — it is a starting point for discovery, never the project root
  // itself. Walk up to the real root so telemetry lands in one store.
  const startDir = resolveTargetDir(args);
  const targetDir = resolveProjectRoot(startDir);

  // Hooks attach to an existing project; they never scaffold one. Outside any
  // AIOSON project this is a silent no-op instead of a new `.aioson/runtime/`
  // in whatever directory happened to be current.
  if (!targetDir) return { ok: true, skipped: true, reason: 'no-project-root' };

  const agentName = options.agent ? String(options.agent).replace(/^@/, '') : 'dev';
  const source = options.source ? String(options.source).trim() : 'claude';

  // Silence all output — hooks must be silent
  const logger = { log: () => {}, error: () => {} };

  try {
    const { runtimeDir } = resolveRuntimePaths(targetDir);

    // Read hook payload from stdin
    const payload = await readStdin();
    const event = buildEventFromPayload(payload, source);

    // Skip if no meaningful event (read-only tools, etc.)
    if (!event) return { ok: true, skipped: true };

    const now = nowIso();

    // An activation only means something for the session the user is in: it
    // never opens a hooks session, and repeating the same agent is not news.
    if (event.eventType === 'agent_activated') {
      const activation = await recordAgentActivation(targetDir, event.extra.agent, { via: 'prompt', source });
      return activation.recorded
        ? { ok: true, runKey: activation.runKey, event: event.eventType, message: event.message }
        : { ok: true, skipped: true, reason: activation.reason };
    }

    // The live session that launched this tool wins; the per-agent hooks
    // session (auto-started when missing) is only the fallback.
    const liveRun = await resolveLauncherLiveSession(targetDir, runtimeDir, { source });
    const runKey = liveRun
      ? liveRun.runKey
      : await ensureOrCreateLiveSession(targetDir, agentName, source, runtimeDir);

    // Write to SQLite
    const { db } = await openRuntimeDb(targetDir, { mustExist: true });
    try {
      appendRunEvent(db, {
        runKey,
        eventType: event.eventType,
        phase: 'live',
        status: 'running',
        message: event.message,
        payload: {
          ...(event.filePath ? { file: event.filePath } : {}),
          ...(event.toolName ? { tool: event.toolName } : {}),
          ...event.extra
        },
        createdAt: now
      });
    } finally {
      db.close();
    }

    // Append to events.ndjson for real-time dashboard view
    const liveEvent = {
      ts: now,
      type: event.eventType,
      message: event.message,
      tool: event.toolName,
      file: event.filePath || undefined,
      source,
      agent: agentName
    };
    if (liveRun) {
      // Append only. state.json of a launched session belongs to `live:*`;
      // parallel tool uses fire concurrent hooks, and a read-modify-write here
      // would race and corrupt it.
      await fs.appendFile(path.join(liveRun.sessionDir, 'events.ndjson'), JSON.stringify(liveEvent) + '\n', 'utf8')
        .catch(() => {});
    } else {
      await appendLiveEventFile(runtimeDir, runKey, liveEvent);
    }

    return { ok: true, runKey, event: event.eventType, message: event.message };
  } catch {
    // Never fail — hooks must not block the agent
    return { ok: false };
  }
}

module.exports = { runHooksEmit, buildEventFromPayload, agentFromPrompt, resultLine, taskListMessage };
