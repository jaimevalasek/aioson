'use strict';

/**
 * aioson hooks:emit [projectDir] --agent=<name> --source=<tool> [--event=<HookEvent>] [--then=agent:done]
 *
 * Called by Claude Code / Antigravity / Codex hooks and the OpenCode plugin on
 * every tool use. Reads the hook payload from stdin (JSON), maps it to an
 * AIOSON runtime event, and writes it to the active live session in SQLite +
 * events.ndjson.
 *
 * The event goes to the live session that launched the tool (`live:start`
 * exports AIOSON_LIVE_SESSION_KEY), or else to the single open live session of
 * this project for this tool. Only without either does it fall back to the
 * per-agent hooks session, auto-starting one (--no-launch mode) if needed —
 * named the way agent:done reads it (`@dev`), so the two meet in one file.
 * Every event carries the harness session_id: the per-agent session is shared
 * by every window, lane worker and day on the project, and the checkpoint
 * after a compaction reads one harness session only (src/lib/compaction-recap.js).
 *
 * `--event=SessionEnd` (Codex) records the end of the harness session and
 * closes the hooks session it opened — never a launched one, which belongs to
 * live:*. `--then=agent:done` (Claude Code's Stop) closes the turn in-process
 * after the final message is recorded. Outside an AIOSON project every form is
 * a silent no-op that creates nothing, and no failure ever exits non-zero.
 */

const path = require('node:path');
const fs = require('node:fs/promises');
const { resolveProjectRoot, resolveTargetDir } = require('../lib/project-root');
const {
  openRuntimeDb,
  resolveRuntimePaths,
  readAgentSession,
  appendRunEvent,
  startTask,
  startRun,
  updateRun,
  updateTask,
  writeAgentSession
} = require('../runtime-store');
const { resolveLauncherLiveSession, resolveLivePaths } = require('./live');
const { getAgentDefinition } = require('../agents');
const { recordAgentActivation } = require('../lib/agent-activation');
const { redactTelemetryText } = require('../lib/telemetry-redaction');
const { redactCommandSecrets } = require('../lib/compaction-recap');

const HOOKS_EMIT_VERSION = '1';
const SILENT = { log: () => {}, error: () => {} };

// Tool name → event_type mapping. `apply_patch` and `update_plan` are Codex's
// file-edit and plan tools (its hooks report them under those names).
const TOOL_EVENT_MAP = {
  Write: 'artifact',
  Edit: 'artifact',
  MultiEdit: 'artifact',
  apply_patch: 'artifact',
  Bash: 'step_done',
  Task: 'note',
  TodoWrite: 'note',
  update_plan: 'note',
  WebSearch: 'note',
  WebFetch: 'note'
};

// File headers of an apply_patch body, in order: `*** Add File:`, `*** Update
// File:` (a `*** Move to:` right after it renames that file) and `*** Delete File:`.
const PATCH_HEADER_RE = /^\*\*\* (Add File|Update File|Delete File|Move to): (.+?)\s*$/gm;

function patchText(input) {
  if (typeof input === 'string') return input.includes('*** Begin Patch') ? input : '';
  const source = input && typeof input === 'object' ? input : {};
  return [source.command, source.patch, source.input, source.content, ...Object.values(source)]
    .find((value) => typeof value === 'string' && value.includes('*** Begin Patch')) || '';
}

/** Files an apply_patch call changes (a moved file under the path it went to) and the files it deletes. */
function patchFiles(input) {
  const files = [];
  const deleted = [];
  let last = null;
  for (const [, kind, file] of patchText(input).matchAll(PATCH_HEADER_RE)) {
    if (kind === 'Delete File') {
      if (!deleted.includes(file)) deleted.push(file);
      last = null;
      continue;
    }
    if (kind === 'Move to') {
      const at = last === null ? -1 : files.lastIndexOf(last);
      if (at !== -1) files.splice(at, 1);
    }
    if (!files.includes(file)) files.push(file);
    last = file;
  }
  return { files, deleted };
}

/** The exit code a harness reports inside tool_response, when it reports one. */
function responseExitCode(response) {
  if (!response || typeof response !== 'object') return undefined;
  return [response.exit_code, response.exitCode, response.exit].find((value) => Number.isInteger(value));
}

// The exit line a harness may write into the model-facing output (Codex's
// unified exec: "Process exited with code N"; its classic shell: "Exit code: N").
const EXIT_LINE = /^(?:Process exited with code|Exit code:?)\s+(\d+)\b/im;
// A runner's own failure marker: a FAIL line (jest, vitest, go) or a TAP `not ok`.
const RUNNER_MARKER = /^\s*(?:FAIL\b|not ok\b)/m;
// A runner summary that says something failed: a non-zero failed/failing
// count, a FAIL or `not ok` line, node:test's `ℹ fail N`.
const FAILED_SUMMARY = /\b[1-9]\d*\s+(?:failed|failing|failures?)\b|^\s*(?:FAIL\b|not ok\b)|^[#ℹ]\s*fail\s+[1-9]/m;

/**
 * Outcome and summary line from a command's raw output alone — what Codex
 * hands over (the model-facing text, no exit code). An exit line decides when
 * present; otherwise only a runner summary does, and with neither there is no
 * verdict: a build that printed an error and no summary is not called passed.
 */
function outputVerdict(output) {
  const text = stripAnsi(output);
  const line = resultLine(text);
  const exit = EXIT_LINE.exec(text);
  if (exit) {
    const code = Number(exit[1]);
    return code === 0 ? { outcome: 'passed', result: line } : { outcome: 'failed', result: line || `Exit code ${code}` };
  }
  if (!line && !RUNNER_MARKER.test(text)) return {};
  return { outcome: FAILED_SUMMARY.test(text) ? 'failed' : 'passed', result: line };
}

/** Outcome and summary line of a shell command, from the hook that reported it. */
function bashOutcome(hookEvent, payload) {
  let extra = {};
  const response = payload.tool_response || {};
  if (hookEvent === 'PostToolUseFailure') {
    // Claude Code: a non-zero exit fires PostToolUseFailure with `error` ("Exit code N\n…").
    if (!payload.is_interrupt) {
      extra.outcome = 'failed';
      const exit = /^Exit code \d+/.exec(String(payload.error || ''));
      extra.result = resultLine(payload.error) || (exit ? exit[0] : null);
    }
  } else if (typeof response === 'string') {
    // Codex has no PostToolUseFailure and sends the command's model-facing
    // output as one string, without the exit code: the text has to say.
    extra = outputVerdict(response);
  } else if (typeof response === 'object' && response && !response.interrupted) {
    // A harness that reports the exit code in an object; its output may sit
    // under `output`, not `stdout`.
    const exitCode = responseExitCode(response);
    const line = resultLine(response.stdout != null ? response.stdout : response.output, response.stderr);
    if (Number.isInteger(exitCode) && exitCode !== 0) {
      extra.outcome = 'failed';
      extra.result = line || `Exit code ${exitCode}`;
    } else {
      extra.outcome = 'passed';
      extra.result = line;
    }
  }
  if (!extra.result) delete extra.result;
  if (!extra.outcome) delete extra.outcome;
  return extra;
}

/** Codex edits files through one patch tool; the files are in the patch text. */
function patchArtifact(input) {
  const { files, deleted } = patchFiles(input);
  const names = (list) => list.map((file) => path.basename(file)).join(', ');
  const parts = [];
  if (files.length) parts.push(names(files));
  if (deleted.length) parts.push(`(deleted: ${names(deleted)})`);
  const extra = {};
  if (files.length > 1) extra.files = files;
  if (deleted.length) extra.deleted = deleted;
  return { filePath: files[0] || null, message: parts.length ? `apply_patch: ${parts.join(' ')}` : 'apply_patch', extra };
}

/** Codex's update_plan steps, summarized like a TodoWrite list. */
function planUpdate(input) {
  const steps = Array.isArray(input.plan) ? input.plan : [];
  const summary = taskListMessage(steps.map((step) => ({ content: step && step.step, status: step && step.status })));
  return { message: summary || 'Plan updated', eventTypeOverride: summary ? 'plan_updated' : null };
}

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

function stripAnsi(text) {
  // eslint-disable-next-line no-control-regex
  return String(text || '').replace(/\u001b\[[0-9;]*[A-Za-z]/g, '');
}

/** Last summary lines of a runner's output, or null when it printed none. */
function resultLine(...outputs) {
  const lines = stripAnsi(outputs.filter(Boolean).join('\n'))
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

const HOOK_AGENT_RE = /^[a-z][a-z0-9-]*$/i;

/** The bare agent id a hook names (`dev`); anything that is not a kebab-case id falls back to `dev`. */
function hookAgentId(input) {
  const bare = String(input || '').trim().replace(/^['"]+|['"]+$/g, '').replace(/^@/, '');
  return HOOK_AGENT_RE.test(bare) ? bare.toLowerCase() : 'dev';
}

/** The handle agent:done reads the per-agent session file under (`@dev`). */
function hookAgentHandle(input) {
  return `@${hookAgentId(input)}`;
}

// The commands that activate an agent inside the tool: `/aioson:agent:dev`
// (Claude Code), `/dev`, `@dev`. Only a known agent counts — anything else the
// user types is not an activation.
const AGENT_COMMAND = /^(\/aioson:agent:|\/|@)([a-z][a-z0-9-]*)(?=\s|$)/i;

// Claude Code may hand over a slash command already expanded.
const EXPANDED_COMMAND = /<command-name>\s*(\/aioson:agent:)([a-z][a-z0-9-]*)\s*<\/command-name>/i;

// An AIOSON agent the model activates itself (an autopilot handoff) runs
// through Claude Code's Skill tool as `aioson:agent:<id>`.
const SKILL_AGENT = /^aioson:agent:([a-z][a-z0-9-]*)$/i;

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

/** `@sheldon` when a Skill call runs an AIOSON agent, otherwise null. */
function agentFromSkill(input) {
  const name = String((input && (input.skill || input.command || input.name)) || '').trim();
  const match = SKILL_AGENT.exec(name);
  const definition = match ? getAgentDefinition(match[1]) : null;
  return definition ? `@${definition.id}` : null;
}

/** Events that are not tool uses; `undefined` when `hookEvent` is a tool event. */
function lifecycleEvent(hookEvent, payload, source) {
  const base = { filePath: null, toolName: null, sessionId: payload.session_id || null };
  // The user activated an agent inside the session. The session was opened
  // under the launcher's label; this is who actually works from here on.
  if (hookEvent === 'UserPromptSubmit') {
    const agent = agentFromPrompt(payload.prompt);
    return agent ? { ...base, eventType: 'agent_activated', message: agent, extra: { agent, source } } : null;
  }
  // The conversation is about to be compacted: the marker bounds the stretch
  // `hooks:recap` restores after it (src/lib/compaction-recap.js).
  if (hookEvent === 'PreCompact') {
    const trigger = payload.trigger === 'manual' || payload.trigger === 'auto' ? payload.trigger : 'unknown';
    return { ...base, eventType: 'compaction', message: `Context compaction (${trigger})`, extra: { trigger } };
  }
  // End of a turn: the agent's own final message is the best account of what
  // it did — kept as its claim, never as verified fact.
  if (hookEvent === 'Stop') {
    const reply = oneLine(payload.last_assistant_message, MAX_REPLY_CHARS);
    return reply ? { ...base, eventType: 'agent_reply', message: reply, extra: {} } : null;
  }
  // The harness session ended (Codex's SessionEnd): recorded, and the hooks
  // session it opened is closed.
  if (hookEvent === 'SessionEnd') {
    const reason = typeof payload.reason === 'string' && payload.reason ? payload.reason : 'other';
    return { ...base, eventType: 'session_ended', message: `Session ended (${reason})`, extra: { reason, source } };
  }
  return undefined;
}

function buildEventFromPayload(payload, source) {
  if (!payload) return null;

  const hookEvent = payload.hook_event_name || payload.hookEventName || null;
  const lifecycle = lifecycleEvent(hookEvent, payload, source);
  if (lifecycle !== undefined) return lifecycle;

  const toolName = payload.tool_name || payload.toolName || null;
  if (!toolName) return null;

  // Skip noisy read-only tools
  if (SKIP_TOOLS.has(toolName) || [...SKIP_TOOLS].some((p) => toolName.startsWith(p))) {
    return null;
  }

  const eventType = TOOL_EVENT_MAP[toolName] || 'note';
  const input = payload.tool_input || payload.toolInput || {};
  const sessionId = payload.session_id || payload.sessionId || null;

  if (toolName === 'Skill') {
    const agent = agentFromSkill(input);
    return agent ? { eventType: 'agent_activated', message: agent, filePath: null, toolName: null, extra: { agent, source }, sessionId } : null;
  }

  let message = `[${source}] ${toolName}`;
  let filePath = null;
  let eventTypeOverride = null;
  let extra = {};

  if (toolName === 'Write' || toolName === 'Edit' || toolName === 'MultiEdit') {
    filePath = input.file_path || input.path || null;
    message = filePath ? `${toolName}: ${path.basename(filePath)}` : `${toolName}`;
  } else if (toolName === 'Bash') {
    const cmd = String(input.command || input.cmd || '').trim().slice(0, MAX_COMMAND_CHARS);
    message = cmd ? `$ ${cmd}` : 'Bash';
    extra = bashOutcome(hookEvent, payload);
  } else if (toolName === 'apply_patch') {
    ({ filePath, message, extra } = patchArtifact(input));
  } else if (toolName === 'update_plan') {
    ({ message, eventTypeOverride } = planUpdate(input));
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
    sessionId
  };
}

function openHooksSession(session) {
  return Boolean(session && !session.finished && session.source === 'live' && session.runKey);
}

/** The per-agent hooks session: the open one, else a new one started here (--no-launch mode). */
async function ensureHooksSession(targetDir, agentName, handle, source, runtimeDir) {
  // Fast path: check existing session file
  const session = await readAgentSession(runtimeDir, handle);
  if (openHooksSession(session)) {
    return { runKey: session.runKey, sessionDir: session.sessionKey ? resolveLivePaths(runtimeDir, session.sessionKey).sessionDir : null, launched: false };
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
      createdBy: handle,
      taskKind: 'live_session',
      metaJson: { tool_session: source, path: targetDir, auto_started: true }
    });

    const runKey = startRun(db, {
      taskKey,
      agentName: handle,
      agentKind: 'official',
      sessionKey,
      source: 'live',
      title,
      eventType: 'session_started',
      phase: 'live',
      message: `Auto-started by hooks:emit (${source})`,
      payload: { tool_session: source, path: targetDir, hooks_version: HOOKS_EMIT_VERSION }
    });

    await writeAgentSession(runtimeDir, handle, {
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
      agent_name: handle,
      tool_session: source,
      status: 'running',
      started_at: now,
      updated_at: now,
      auto_started: true,
      last_events: [{ ts: now, type: 'session_started', summary: `Auto-started by hooks:emit (${source})` }]
    }, null, 2), 'utf8');

    return { runKey, sessionDir: stateDir, launched: false };
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
          if (event.type === 'session_ended') state.status = 'completed';
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

/**
 * The harness session ended. A hooks session this command opened is closed
 * (the run and its task completed, the session file finished), so the next
 * session starts its own; a launched session only gets the record — live:*
 * owns its lifecycle. A session end never opens a session to close it.
 */
async function endSession(targetDir, runtimeDir, event, message, { handle, liveRun, now }) {
  const session = liveRun ? null : await readAgentSession(runtimeDir, handle);
  const hooksSession = openHooksSession(session) && String(session.sessionKey || '').startsWith('hooks-') ? session : null;
  const runKey = liveRun ? liveRun.runKey : (hooksSession && hooksSession.runKey);
  if (!runKey) return { ok: true, skipped: true, reason: 'no-session' };
  const opened = await openRuntimeDb(targetDir, { mustExist: true });
  if (!opened) return { ok: true, skipped: true, reason: 'no-runtime' };
  const payload = { ...event.extra, ...(event.sessionId ? { session_id: event.sessionId } : {}) };
  try {
    if (hooksSession) {
      updateRun(opened.db, { runKey, status: 'completed', summary: message, eventType: 'session_ended', phase: 'live', message, payload });
      if (hooksSession.taskKey) updateTask(opened.db, { taskKey: hooksSession.taskKey, status: 'completed' });
    } else {
      appendRunEvent(opened.db, { runKey, eventType: 'session_ended', phase: 'live', status: 'running', message, payload, createdAt: now });
    }
  } finally {
    opened.db.close();
  }
  if (hooksSession) await writeAgentSession(runtimeDir, handle, { ...hooksSession, finished: true, finishedAt: now });
  const liveEvent = { ts: now, type: 'session_ended', message, source: event.extra.source };
  if (liveRun) await fs.appendFile(path.join(liveRun.sessionDir, 'events.ndjson'), JSON.stringify(liveEvent) + '\n', 'utf8').catch(() => {});
  else await appendLiveEventFile(runtimeDir, runKey, liveEvent);
  return { ok: true, runKey, event: 'session_ended', closed: Boolean(hooksSession) };
}

async function recordEvent(targetDir, runtimeDir, event, { agentName, handle, source }) {
  const now = nowIso();
  // The same text reaches SQLite and events.ndjson, which the SQLite redaction never saw.
  const message = redactCommandSecrets(redactTelemetryText(event.message));

  // The live session that launched this tool wins; the per-agent hooks
  // session (auto-started when missing) is only the fallback.
  const liveRun = await resolveLauncherLiveSession(targetDir, runtimeDir, { source });
  if (event.eventType === 'session_ended') return endSession(targetDir, runtimeDir, event, message, { handle, liveRun, now });

  const run = liveRun
    ? { runKey: liveRun.runKey, sessionDir: liveRun.sessionDir, launched: true }
    : await ensureHooksSession(targetDir, agentName, handle, source, runtimeDir);

  // An activation is recorded once per change, for the harness session it happened in.
  if (event.eventType === 'agent_activated') {
    const activation = await recordAgentActivation(targetDir, event.extra.agent, { via: 'prompt', source, sessionId: event.sessionId, run });
    return activation.recorded
      ? { ok: true, runKey: activation.runKey, event: event.eventType, message: event.message }
      : { ok: true, skipped: true, reason: activation.reason };
  }

  // Write to SQLite
  const { db } = await openRuntimeDb(targetDir, { mustExist: true });
  try {
    appendRunEvent(db, {
      runKey: run.runKey,
      eventType: event.eventType,
      phase: 'live',
      status: 'running',
      message,
      payload: {
        ...(event.filePath ? { file: event.filePath } : {}),
        ...(event.toolName ? { tool: event.toolName } : {}),
        ...event.extra,
        ...(event.sessionId ? { session_id: event.sessionId } : {})
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
    message,
    tool: event.toolName,
    file: event.filePath || undefined,
    source,
    agent: agentName
  };
  if (run.launched) {
    // Append only. state.json of a launched session belongs to `live:*`;
    // parallel tool uses fire concurrent hooks, and a read-modify-write here
    // would race and corrupt it.
    await fs.appendFile(path.join(run.sessionDir, 'events.ndjson'), JSON.stringify(liveEvent) + '\n', 'utf8')
      .catch(() => {});
  } else {
    await appendLiveEventFile(runtimeDir, run.runKey, liveEvent);
  }

  return { ok: true, runKey: run.runKey, event: event.eventType, message };
}

// Claude Code's Stop closes the turn (`--then=agent:done`): agent:done runs
// in-process once the final message is recorded, and only inside a project —
// the separate `aioson agent:done "$PWD"` this replaces created `.aioson/`
// wherever the harness happened to stop.
async function closeTurn(targetDir, agentName) {
  const { runAgentDone } = require('./runtime');
  const { createTranslator } = require('../i18n');
  await runAgentDone({
    args: [targetDir],
    options: { agent: agentName, summary: `Session ended via ${agentName} hook` },
    logger: SILENT,
    t: createTranslator('en').t
  });
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

  const agentName = hookAgentId(options.agent || 'dev');
  const handle = `@${agentName}`;
  const source = options.source ? String(options.source).trim() : 'claude';

  // Never fail: a hook must not block the agent, and Codex reports any
  // non-zero exit as a failed hook on every tool call.
  let result = { ok: false, exitCode: 0 };
  try {
    const { runtimeDir } = resolveRuntimePaths(targetDir);
    const payload = await readStdin();
    const hookPayload = options.event ? { ...(payload || {}), hook_event_name: String(options.event) } : payload;
    const event = buildEventFromPayload(hookPayload, source);
    // Skip if no meaningful event (read-only tools, etc.)
    result = event ? await recordEvent(targetDir, runtimeDir, event, { agentName, handle, source }) : { ok: true, skipped: true };
  } catch { /* the event is lost, the agent is not blocked */ }
  if (options.then === 'agent:done') await closeTurn(targetDir, agentName).catch(() => {});
  return result;
}

module.exports = {
  runHooksEmit,
  buildEventFromPayload,
  agentFromPrompt,
  resultLine,
  taskListMessage,
  readStdin,
  hookAgentId,
  hookAgentHandle
};
