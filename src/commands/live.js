'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const {
  resolveRuntimePaths,
  openRuntimeDb,
  runtimeStoreExists,
  startTask,
  updateTask,
  startRun,
  updateRun,
  appendRunEvent,
  readAgentSession,
  writeAgentSession,
  clearAgentSession
} = require('../runtime-store');
const { ensureDir, exists } = require('../utils');
const { SUPPORTED_PROMPT_TOOLS } = require('../prompt-tool');
const { isTmuxAvailable, launchTmuxSession, buildSessionName, hasSession, attachSession } = require('../lib/tmux-launcher');
const { resolvePermissionModeArgs, resolveResumeArgs } = require('../lib/tool-capabilities');

const LIVE_EVENTS_LIMIT = 10;
const LIVE_MESSAGE_LIMIT = 500;

function resolveTargetDir(args) {
  return path.resolve(process.cwd(), args[0] || '.');
}

function requireOption(options, key, t) {
  const value = options[key];
  if (value === undefined || value === null || String(value).trim() === '') {
    throw new Error(t('runtime.option_required', { option: `--${key}` }));
  }
  return String(value).trim();
}

function normalizeAgentHandle(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.startsWith('@') ? text : `@${text}`;
}

function makeDirectSessionKey(agentName) {
  return `direct-session:${Date.now()}:${String(agentName || '').replace(/^@/, '')}`;
}

function parseWatchSeconds(value) {
  if (value === undefined || value === null || value === false) return null;
  if (value === true || value === '') return 2;

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 2;
  return parsed;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRuntimeDb(targetDir, t) {
  const handle = await openRuntimeDb(targetDir, { mustExist: true });
  if (!handle) {
    throw new Error(t('runtime.store_missing', { path: resolveRuntimePaths(targetDir).dbPath }));
  }
  return handle;
}

// bug-found-005: session keys carry the format `direct-session:{ts}:{agent}`
// which contains colons. NTFS reserves `:` in filenames (it's the drive-letter
// separator and the alternate-data-stream syntax), so any `path.join(..., 'live',
// 'direct-session:1234:deyvin')` would have `mkdir` fail silently in the
// auxiliary-filesystem catches further down — leaving the dashboard's
// state.json/events.ndjson/summary.md never written on Windows.
//
// We sanitize only at the filesystem boundary: the session_key stored in
// SQLite, returned to callers, and printed by the CLI keeps its colons (it's
// a documented public identifier). Colons survive on POSIX too, but `__` is
// safe everywhere and lets a single code path handle both platforms.
function sessionKeyToDirName(sessionKey) {
  return String(sessionKey).replace(/:/g, '__');
}

function resolveLivePaths(runtimeDir, sessionKey) {
  const sessionDir = path.join(runtimeDir, 'live', sessionKeyToDirName(sessionKey));
  return {
    sessionDir,
    statePath: path.join(sessionDir, 'state.json'),
    eventsPath: path.join(sessionDir, 'events.ndjson'),
    summaryPath: path.join(sessionDir, 'summary.md')
  };
}

function truncateMessage(value, fallback = '') {
  const text = String(value || fallback || '').trim();
  if (!text) return '';
  if (text.length <= LIVE_MESSAGE_LIMIT) return text;
  return `${text.slice(0, LIVE_MESSAGE_LIMIT - 3).trimEnd()}...`;
}

function parseRefs(value) {
  const text = String(value || '').trim();
  if (!text) return [];
  return Array.from(new Set(text.split(',').map((entry) => entry.trim()).filter(Boolean)));
}

function parseJsonOption(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' ? parsed : { value: parsed };
  } catch {
    return { raw: String(value) };
  }
}

// Combine `--resume` (mapped per-tool via TOOL_CAPS) with user-provided `--tool-args`.
// Resume args go FIRST so that codex `resume --last` (subcommand) lands at argv[1].
function buildLaunchArgs(options, tool) {
  const resumeOpt = options.resume !== undefined ? options.resume : options.Resume;
  const resumeArgs = resolveResumeArgs(tool, resumeOpt);
  const permissionMode = options['permission-mode'] || options.permissionMode;
  const permissionArgs = resolvePermissionModeArgs(tool, permissionMode);
  const userArgs = parseToolArgs(options['tool-args'] || options.toolArgs);
  return [...resumeArgs, ...permissionArgs, ...userArgs];
}

function parseToolArgs(value) {
  if (value === undefined || value === null || value === '') return [];
  if (Array.isArray(value)) return value.map((entry) => String(entry));
  const text = String(value).trim();
  if (!text) return [];

  if (text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return parsed.map((entry) => String(entry));
      }
    } catch {
      // fallback to whitespace split below
    }
  }

  return text.split(/\s+/).filter(Boolean);
}

function normalizeLiveTool(value, t) {
  const tool = String(value || '').trim().toLowerCase();
  if (SUPPORTED_PROMPT_TOOLS.has(tool)) {
    return tool;
  }
  const supported = Array.from(SUPPORTED_PROMPT_TOOLS).join(', ');
  throw new Error(t ? t('live.unsupported_tool', { tool: value, supported }) : `Unsupported live tool: ${value}. Supported: ${supported}`);
}


function normalizePlanStepId(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function collectPlanSteps(markdown) {
  const steps = [];
  const seen = new Set();

  function pushStep(id, title) {
    const normalizedId = normalizePlanStepId(id);
    const normalizedTitle = String(title || '').trim();
    if (!normalizedId || !normalizedTitle) return;
    const key = normalizedId.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    steps.push({ id: normalizedId, title: normalizedTitle, done: false });
  }

  const blockPattern = /<!--\s*aioson:steps([\s\S]*?)-->/gi;
  let blockMatch = blockPattern.exec(markdown);
  while (blockMatch) {
    const lines = String(blockMatch[1] || '').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const match = trimmed.match(/^([^:]+):\s*(.+)$/);
      if (match) {
        pushStep(match[1], match[2]);
      }
    }
    blockMatch = blockPattern.exec(markdown);
  }

  const headingPattern = /^#{3,6}\s+((?:[A-Z]{2,}(?:-[A-Z0-9]+)*-\d+(?:\.\d+)?)|(?:Fase\s+\d+(?:\.\d+)?))\s*[-:]\s+(.+)$/gim;
  let headingMatch = headingPattern.exec(markdown);
  while (headingMatch) {
    pushStep(headingMatch[1], headingMatch[2]);
    headingMatch = headingPattern.exec(markdown);
  }

  return steps;
}

async function loadPlanReference(targetDir, planRef) {
  if (!planRef) {
    return { planRef: null, planPath: null, planSteps: [] };
  }

  const planPath = path.isAbsolute(planRef) ? planRef : path.resolve(targetDir, planRef);
  let markdown = '';
  try {
    markdown = await fs.readFile(planPath, 'utf8');
  } catch {
    throw new Error(`Plan file not found: ${planRef}`); // technical message, i18n at caller level
  }

  return {
    planRef,
    planPath,
    planSteps: collectPlanSteps(markdown)
  };
}


async function resolveExecutablePath(command) {
  const binary = String(command || '').trim();
  if (!binary) return null;

  if (path.isAbsolute(binary) || binary.includes(path.sep)) {
    const absolutePath = path.isAbsolute(binary) ? binary : path.resolve(binary);
    return (await exists(absolutePath)) ? absolutePath : null;
  }

  const pathEntries = String(process.env.PATH || '')
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);

  const extensions = process.platform === 'win32'
    ? Array.from(new Set([...String(process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';').map((entry) => entry.toLowerCase())]))
    : [''];

  for (const dir of pathEntries) {
    for (const ext of extensions) {
      const candidate = process.platform === 'win32' && ext && !binary.toLowerCase().endsWith(ext)
        ? path.join(dir, `${binary}${ext}`)
        : path.join(dir, binary);
      if (await exists(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

// Com `shell: true` (Windows), o comando vai pro cmd.exe. Um caminho com espaços
// — ex.: "C:\Program Files\nodejs\codex.cmd" — quebra se não for quotado (o
// cmd.exe corta no primeiro espaço e tenta rodar "C:\Program"). Quotamos o
// executável; sem shell (Unix) ele vai cru. Resolve o ENOENT/falha ao iniciar
// codex/claude no Windows quando o npm bin fica no Program Files.
function spawnExecutable(binaryPath) {
  return process.platform === 'win32' ? `"${binaryPath}"` : binaryPath;
}

function detectProcessState(pid) {
  if (!pid) return 'not_tracked';
  try {
    process.kill(Number(pid), 0);
    return 'alive';
  } catch (error) {
    if (error && error.code === 'ESRCH') {
      return 'dead';
    }
    return 'unknown';
  }
}

function normalizeLiveStats(stats, fallback = {}) {
  return {
    tasks_completed: Number(stats?.tasks_completed || 0),
    events_total: Number(stats?.events_total || 0),
    plan_steps_done: Number(stats?.plan_steps_done ?? fallback.plan_steps_done ?? 0),
    plan_steps_total: Number(stats?.plan_steps_total ?? fallback.plan_steps_total ?? 0),
    events_by_type: stats?.events_by_type && typeof stats.events_by_type === 'object'
      ? { ...stats.events_by_type }
      : {}
  };
}

function parseTaskMeta(task) {
  if (!task || !task.meta_json) return {};
  try {
    const parsed = JSON.parse(task.meta_json);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function getPlanStats(meta) {
  const steps = Array.isArray(meta?.plan_steps) ? meta.plan_steps : [];
  const done = steps.filter((step) => step && step.done).length;
  return {
    plan_steps_done: done,
    plan_steps_total: steps.length
  };
}

async function readJsonIfExists(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function readLiveState(runtimeDir, sessionKey) {
  if (!sessionKey) return null;
  return readJsonIfExists(resolveLivePaths(runtimeDir, sessionKey).statePath);
}

async function writeLiveState(runtimeDir, sessionKey, state) {
  try {
    const { statePath } = resolveLivePaths(runtimeDir, sessionKey);
    await ensureDir(path.dirname(statePath));
    await fs.writeFile(statePath, JSON.stringify(state, null, 2), 'utf8');
  } catch {
    // filesystem is auxiliary — SQLite is source of truth
  }
}

async function appendLiveEvent(runtimeDir, sessionKey, record) {
  try {
    const { eventsPath } = resolveLivePaths(runtimeDir, sessionKey);
    await ensureDir(path.dirname(eventsPath));
    await fs.appendFile(eventsPath, `${JSON.stringify(record)}\n`, 'utf8');
  } catch {
    // filesystem is auxiliary — SQLite is source of truth
  }
}

async function writeLiveSummary(runtimeDir, sessionKey, markdown) {
  try {
    const { summaryPath } = resolveLivePaths(runtimeDir, sessionKey);
    await ensureDir(path.dirname(summaryPath));
    await fs.writeFile(summaryPath, markdown, 'utf8');
    return summaryPath;
  } catch {
    return null;
  }
}

async function listLiveStates(runtimeDir) {
  const liveRoot = path.join(runtimeDir, 'live');
  if (!(await exists(liveRoot))) {
    return [];
  }

  const entries = await fs.readdir(liveRoot, { withFileTypes: true });
  const states = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const state = await readJsonIfExists(path.join(liveRoot, entry.name, 'state.json'));
    if (state) {
      states.push(state);
    }
  }

  states.sort((left, right) => {
    const leftStamp = Date.parse(left.updated_at || left.closed_at || left.started_at || 0);
    const rightStamp = Date.parse(right.updated_at || right.closed_at || right.started_at || 0);
    return rightStamp - leftStamp;
  });

  return states;
}

function createLiveState(targetDir, run, task, options = {}) {
  const taskMeta = parseTaskMeta(task);
  const planStats = getPlanStats(taskMeta);
  return {
    session_key: run.session_key || task?.session_key || options.sessionKey || null,
    session_task_key: task?.task_key || options.taskKey || null,
    tool_session: options.tool || taskMeta.tool_session || null,
    active_agent: options.activeAgent || run.agent_name || null,
    plan_ref: options.planRef ?? taskMeta.plan_ref ?? null,
    phase: options.phase || (run.status === 'running' || run.status === 'queued' ? 'active' : 'closed'),
    title: options.title || task?.title || run.title || null,
    path: options.projectPath || targetDir,
    child_pid: options.childPid ?? taskMeta.child_pid ?? null,
    started_at: options.startedAt || run.started_at || task?.created_at || null,
    updated_at: options.updatedAt || run.updated_at || task?.updated_at || null,
    closed_at: options.closedAt || (run.status === 'completed' || run.status === 'failed' ? run.finished_at || task?.finished_at || null : null),
    current_task: options.currentTask ?? null,
    current_run_key: options.currentRunKey || run.run_key,
    stats: normalizeLiveStats(options.stats, planStats),
    last_events: Array.isArray(options.lastEvents) ? options.lastEvents.slice(-LIVE_EVENTS_LIMIT) : []
  };
}

function selectLiveRunByKey(db, runKey) {
  if (!runKey) return null;
  return db.prepare(`
    SELECT
      run_key, task_key, agent_name, agent_kind, squad_slug, session_key, source,
      title, status, summary, output_path, started_at, updated_at, finished_at
    FROM agent_runs
    WHERE run_key = ? AND source = 'live'
    LIMIT 1
  `).get(String(runKey));
}

function selectLatestLiveRun(db, options = {}) {
  if (options.sessionKey) {
    return db.prepare(`
      SELECT
        run_key, task_key, agent_name, agent_kind, squad_slug, session_key, source,
        title, status, summary, output_path, started_at, updated_at, finished_at
      FROM agent_runs
      WHERE source = 'live' AND session_key = ?
      ORDER BY updated_at DESC, started_at DESC
      LIMIT 1
    `).get(String(options.sessionKey));
  }

  if (options.agentName) {
    return db.prepare(`
      SELECT
        run_key, task_key, agent_name, agent_kind, squad_slug, session_key, source,
        title, status, summary, output_path, started_at, updated_at, finished_at
      FROM agent_runs
      WHERE source = 'live' AND agent_name = ?
      ORDER BY updated_at DESC, started_at DESC
      LIMIT 1
    `).get(String(options.agentName));
  }

  return db.prepare(`
    SELECT
      run_key, task_key, agent_name, agent_kind, squad_slug, session_key, source,
      title, status, summary, output_path, started_at, updated_at, finished_at
    FROM agent_runs
    WHERE source = 'live'
    ORDER BY updated_at DESC, started_at DESC
    LIMIT 1
  `).get();
}

function selectTaskByKey(db, taskKey) {
  if (!taskKey) return null;
  return db.prepare(`
    SELECT
      task_key, squad_slug, session_key, task_kind, parent_task_key,
      title, goal, meta_json, status, created_by, created_at, updated_at, finished_at
    FROM tasks
    WHERE task_key = ?
    LIMIT 1
  `).get(String(taskKey));
}

function mapRecentDbEvent(event) {
  return {
    ts: event.created_at,
    type: event.event_type,
    summary: event.message || '-'
  };
}

async function resolveLiveContext(targetDir, db, runtimeDir, options = {}) {
  let agentName = options.agentName ? normalizeAgentHandle(options.agentName) : null;
  let sessionRef = agentName ? await readAgentSession(runtimeDir, agentName) : null;
  let sessionKey = options.sessionKey ? String(options.sessionKey).trim() : null;
  let state = null;

  if (!sessionKey && sessionRef?.sessionKey) {
    sessionKey = String(sessionRef.sessionKey).trim();
  }

  if (!sessionKey && !agentName) {
    const liveStates = await listLiveStates(runtimeDir);
    if (liveStates.length > 0) {
      state = liveStates[0];
      sessionKey = state.session_key || null;
      if (state.active_agent) {
        agentName = normalizeAgentHandle(state.active_agent);
      }
    }
  }

  if (!state && sessionKey) {
    state = await readLiveState(runtimeDir, sessionKey);
  }

  if (!agentName && state?.active_agent) {
    agentName = normalizeAgentHandle(state.active_agent);
  }

  let run = sessionRef?.runKey ? selectLiveRunByKey(db, sessionRef.runKey) : null;
  if (!run && state?.current_run_key) {
    run = selectLiveRunByKey(db, state.current_run_key);
  }
  if (!run && sessionKey) {
    run = selectLatestLiveRun(db, { sessionKey });
  }
  if (!run && agentName) {
    run = selectLatestLiveRun(db, { agentName });
  }
  if (!run && !agentName && !sessionKey) {
    run = selectLatestLiveRun(db);
  }

  let task = null;
  if (run?.task_key) {
    task = selectTaskByKey(db, run.task_key);
  }
  if (!task && sessionRef?.taskKey) {
    task = selectTaskByKey(db, sessionRef.taskKey);
  }
  if (!task && state?.session_task_key) {
    task = selectTaskByKey(db, state.session_task_key);
  }

  if (!sessionKey) {
    sessionKey = run?.session_key || task?.session_key || state?.session_key || sessionRef?.sessionKey || null;
  }

  if (!state && sessionKey) {
    state = await readLiveState(runtimeDir, sessionKey);
  }

  if (run && !state) {
    state = createLiveState(targetDir, run, task, {
      sessionKey,
      activeAgent: agentName || run.agent_name,
      projectPath: targetDir
    });
  }

  const recentEvents = run
    ? db.prepare(`
        SELECT event_type, message, created_at
        FROM execution_events
        WHERE run_key = ?
        ORDER BY created_at DESC, id DESC
        LIMIT ?
      `).all(run.run_key, Math.max(1, Math.min(Number(options.limit) || 8, 20))).reverse().map(mapRecentDbEvent)
    : [];

  const processState = detectProcessState(state?.child_pid);
  const phase = state?.phase || (run && (run.status === 'running' || run.status === 'queued') ? 'active' : run ? 'closed' : 'idle');
  const open = phase === 'active' && Boolean(run && (run.status === 'running' || run.status === 'queued'));

  return {
    agentName: agentName || state?.active_agent || run?.agent_name || null,
    sessionRef,
    sessionKey,
    run,
    task,
    state,
    recentEvents,
    processState,
    phase,
    open,
    paths: sessionKey ? resolveLivePaths(runtimeDir, sessionKey) : null
  };
}

async function requireActiveLiveContext(targetDir, agentName, t, options = {}) {
  const { db, dbPath, runtimeDir } = await withRuntimeDb(targetDir, t);
  const context = await resolveLiveContext(targetDir, db, runtimeDir, {
    agentName,
    limit: options.limit
  });

  if (!context.run || context.run.source !== 'live' || !context.sessionKey || !context.task) {
    db.close();
    throw new Error(t('live.no_active_session', { agent: normalizeAgentHandle(agentName) }));
  }

  if (context.phase !== 'active') {
    db.close();
    throw new Error(t('live.session_not_active', { agent: normalizeAgentHandle(agentName) }));
  }

  return { db, dbPath, runtimeDir, context };
}

function applyEventToState(state, event, updates = {}) {
  const next = {
    ...state,
    updated_at: event.ts,
    stats: normalizeLiveStats(state?.stats)
  };

  next.last_events = [...(Array.isArray(state?.last_events) ? state.last_events : []), {
    ts: event.ts,
    type: event.type,
    summary: event.summary
  }].slice(-LIVE_EVENTS_LIMIT);
  next.stats.events_total += 1;
  if (event.type) {
    next.stats.events_by_type[event.type] = (next.stats.events_by_type[event.type] || 0) + 1;
  }

  if (event.type === 'task_completed') {
    next.stats.tasks_completed += 1;
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'currentTask')) {
    next.current_task = updates.currentTask;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'phase')) {
    next.phase = updates.phase;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'closedAt')) {
    next.closed_at = updates.closedAt;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'activeAgent')) {
    next.active_agent = updates.activeAgent;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'currentRunKey')) {
    next.current_run_key = updates.currentRunKey;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'childPid')) {
    next.child_pid = updates.childPid;
  }
  if (updates.planStats) {
    next.stats.plan_steps_done = Number(updates.planStats.plan_steps_done || 0);
    next.stats.plan_steps_total = Number(updates.planStats.plan_steps_total || 0);
  }

  return next;
}

function createLiveEventRecord(context, options = {}) {
  return {
    ts: options.ts,
    type: options.type,
    summary: options.summary,
    agent: context.agentName,
    task_key: options.taskKey || context.task?.task_key || null,
    run_key: context.run?.run_key || null,
    session_key: context.sessionKey,
    refs: options.refs || [],
    plan_step: options.planStep || null,
    status: options.status || null,
    meta: options.meta || null
  };
}

function waitForChild(child) {
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => {
      resolve({ code: Number(code || 0), signal: signal || null });
    });
  });
}

async function runLocalProcess(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args.map((entry) => String(entry)), {
      cwd: options.cwd || process.cwd(),
      env: { ...process.env, ...(options.env || {}) },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', () => {
      resolve({ code: 1, stdout, stderr });
    });
    child.on('close', (code) => {
      resolve({ code: Number(code || 0), stdout, stderr });
    });
  });
}

async function collectGitSnapshot(targetDir) {
  if (!(await exists(path.join(targetDir, '.git')))) {
    return null;
  }

  const [branch, commit, diffStat, status] = await Promise.all([
    runLocalProcess('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: targetDir }),
    runLocalProcess('git', ['rev-parse', '--short', 'HEAD'], { cwd: targetDir }),
    runLocalProcess('git', ['diff', '--stat'], { cwd: targetDir }),
    runLocalProcess('git', ['status', '--short'], { cwd: targetDir })
  ]);

  if (branch.code !== 0 && commit.code !== 0 && diffStat.code !== 0 && status.code !== 0) {
    return null;
  }

  return {
    branch: branch.code === 0 ? branch.stdout.trim() : null,
    commit: commit.code === 0 ? commit.stdout.trim() : null,
    diff_stat: diffStat.code === 0 ? diffStat.stdout.trim() : null,
    changed_files: status.code === 0
      ? status.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => line.slice(3).trim() || line)
      : []
  };
}

function formatDuration(startedAt, closedAt) {
  if (!startedAt || !closedAt) return null;
  const ms = Date.parse(closedAt) - Date.parse(startedAt);
  if (!Number.isFinite(ms) || ms < 0) return null;
  const seconds = Math.floor(ms / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

function renderLiveSummary(snapshot) {
  const duration = formatDuration(snapshot.startedAt, snapshot.closedAt);
  const lines = [
    '# Live Session Summary',
    '',
    `- Session: ${snapshot.sessionKey}`,
    `- Agent: ${snapshot.agent}`,
    `- Tool: ${snapshot.tool || 'unknown'}`,
    `- Status: ${snapshot.status}`,
    `- Started: ${snapshot.startedAt || 'unknown'}`,
    `- Closed: ${snapshot.closedAt || 'unknown'}`,
    ...(duration ? [`- Duration: ${duration}`] : []),
    `- Summary: ${snapshot.summary || 'n/a'}`
  ];

  if (snapshot.git) {
    lines.push('');
    lines.push('## Git');
    lines.push(`- Branch: ${snapshot.git.branch || 'unknown'}`);
    lines.push(`- Commit: ${snapshot.git.commit || 'unknown'}`);
    if (snapshot.git.diff_stat) {
      lines.push('');
      lines.push('```text');
      lines.push(snapshot.git.diff_stat);
      lines.push('```');
    }
    if (snapshot.git.changed_files.length > 0) {
      lines.push('');
      lines.push('## Changed Files');
      for (const file of snapshot.git.changed_files) {
        lines.push(`- ${file}`);
      }
    }
  }

  if (Array.isArray(snapshot.recentEvents) && snapshot.recentEvents.length > 0) {
    lines.push('');
    lines.push('## Recent Events');
    for (const event of snapshot.recentEvents) {
      lines.push(`- ${event.ts} | ${event.type} | ${event.summary}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

// ANSI color helpers (no external deps)
const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
  gray: '\x1b[90m'
};

function colorForContext(pct) {
  if (pct >= 90) return ANSI.red;
  if (pct >= 70) return ANSI.yellow;
  return ANSI.green;
}

function colorForPhase(phase) {
  if (phase === 'active') return ANSI.green;
  if (phase === 'closed') return ANSI.gray;
  return ANSI.yellow;
}

function colorForProcess(state) {
  if (state === 'alive') return ANSI.green;
  if (state === 'dead') return ANSI.red;
  return ANSI.gray;
}

function formatDurationCompact(startedAt) {
  if (!startedAt) return '';
  const ms = Date.now() - Date.parse(startedAt);
  if (!Number.isFinite(ms) || ms < 0) return '';
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (m > 60) {
    const h = Math.floor(m / 60);
    return `${h}h${m % 60}m`;
  }
  return `${m}m${s}s`;
}

/**
 * Print a one-line compact status bar with ANSI colors.
 * Designed for small tmux panes (~4 lines).
 */
function printCompactStatus(snapshot, logger) {
  const agent = snapshot.agent || '-';
  const tool = snapshot.tool || '-';
  const phase = snapshot.phase || 'idle';
  const proc = snapshot.processState || 'not_tracked';
  const pid = snapshot.pid || null;

  // Context percentage if available
  let ctxStr = '';
  if (snapshot.run && snapshot.run.context_pct != null) {
    const pct = Number(snapshot.run.context_pct) || 0;
    ctxStr = `${colorForContext(pct)}ctx:${pct}%${ANSI.reset}`;
  }

  // Token / cost if available
  let costStr = '';
  if (snapshot.stats && snapshot.stats.tokens_total) {
    const tokens = snapshot.stats.tokens_total;
    const cost = snapshot.stats.cost_usd;
    costStr = `${ANSI.cyan}${tokens >= 1000 ? (tokens / 1000).toFixed(1) + 'k' : tokens}tk${ANSI.reset}`;
    if (cost != null) {
      costStr += `${ANSI.gray}/${ANSI.reset}${ANSI.cyan}$${cost.toFixed(3)}${ANSI.reset}`;
    }
  }

  // Plan progress
  let planStr = '';
  const planDone = snapshot.stats?.plan_steps_done ?? 0;
  const planTotal = snapshot.stats?.plan_steps_total ?? 0;
  if (planTotal > 0) {
    planStr = `${ANSI.magenta}plan:${planDone}/${planTotal}${ANSI.reset}`;
  }

  // Duration
  const dur = formatDurationCompact(snapshot.startedAt);
  const durStr = dur ? `${ANSI.blue}${dur}${ANSI.reset}` : '';

  // Recent event
  let eventStr = '';
  if (snapshot.recentEvents && snapshot.recentEvents.length > 0) {
    const ev = snapshot.recentEvents[snapshot.recentEvents.length - 1];
    eventStr = `${ANSI.gray}${ev.type}${ANSI.reset}`;
    if (ev.summary) {
      const short = String(ev.summary).slice(0, 35);
      eventStr += `:${ANSI.gray}${short}${ANSI.reset}`;
    }
  }

  // Warning
  let warnStr = '';
  if (snapshot.warning) {
    warnStr = `${ANSI.red}⚠ ${snapshot.warning}${ANSI.reset}`;
  }

  // Build line 1
  const parts = [
    `${colorForPhase(phase)}●${ANSI.reset}`,
    `${ANSI.bold}${agent}${ANSI.reset}`,
    `|`,
    `${ANSI.blue}${tool}${ANSI.reset}`,
    `|`,
    `${colorForProcess(proc)}${proc}${ANSI.reset}`,
    pid ? `${ANSI.gray}(pid:${pid})${ANSI.reset}` : '',
    ctxStr,
    costStr,
    planStr,
    durStr,
    eventStr,
    warnStr
  ].filter(Boolean);

  logger.log(parts.join(' '));
}

/**
 * Print two plain-text lines optimized for tmux status-bar.
 * No ANSI colors — tmux handles its own styling.
 * Designed for a 2-line pane.
 */
function renderMiniBar(pct, width = 10, usedLabel = '', totalLabel = '') {
  const filled = Math.round((pct / 100) * width);
  const empty = width - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  const color = pct > 80 ? '\x1b[31m' : pct > 50 ? '\x1b[33m' : '\x1b[32m';
  const reset = '\x1b[0m';
  const abs = usedLabel && totalLabel ? ` ${usedLabel}/${totalLabel}` : '';
  return `${color}[${bar}]${reset}${abs} ${pct}%`;
}

function formatProjectPath(targetDir) {
  if (!targetDir) return '-';
  const home = process.env.HOME || process.env.USERPROFILE || '';
  let path = String(targetDir).replace(/\\/g, '/');
  if (home && path.startsWith(home.replace(/\\/g, '/'))) {
    path = '~' + path.slice(home.length);
  }
  if (path.length <= 28) return path;
  // Too long: keep last 2 segments with ellipsis
  const segments = path.split('/').filter(Boolean);
  if (segments.length <= 2) return path;
  const lastTwo = segments.slice(-2).join('/');
  return `~/.../${lastTwo}`;
}

function printTmuxBar(snapshot) {
  const agent = snapshot.agent || '-';
  const tool = snapshot.tool || '-';
  const phase = snapshot.phase || 'idle';
  const projectDir = formatProjectPath(snapshot.targetDir);
  const dur = formatDurationCompact(snapshot.startedAt);

  // Build core info
  const parts = [];
  parts.push(`\x1b[1;36m${projectDir}\x1b[0m`);
  parts.push(`\x1b[1;35m${agent}\x1b[0m`);
  parts.push(`\x1b[90m${tool}\x1b[0m`);

  if (phase === 'active') {
    parts.push(`\x1b[32m●\x1b[0m`);
  } else if (phase === 'closed') {
    parts.push(`\x1b[31m○\x1b[0m`);
  } else {
    parts.push(`\x1b[33m${phase}\x1b[0m`);
  }

  if (dur) {
    parts.push(dur);
  }

  // Plan progress
  const planDone = snapshot.stats?.plan_steps_done ?? 0;
  const planTotal = snapshot.stats?.plan_steps_total ?? 0;
  if (planTotal > 0) {
    parts.push(`step ${planDone}/${planTotal}`);
  }

  // Context bar with absolute numbers
  if (snapshot.run && snapshot.run.context_pct != null) {
    const pct = Number(snapshot.run.context_pct) || 0;
    parts.push(`ctx ${renderMiniBar(pct)}`);
  } else if (snapshot.contextEstimated) {
    const est = snapshot.contextEstimated;
    const pct = est.pct ?? 0;
    const used = est.estimatedTokens >= 1000 ? (est.estimatedTokens / 1000).toFixed(1) + 'k' : String(est.estimatedTokens);
    const total = est.windowSize >= 1000 ? (est.windowSize / 1000).toFixed(1) + 'k' : String(est.windowSize);
    parts.push(`ctx ${renderMiniBar(pct, 10, used, total)}`);
  }

  // Cost
  if (snapshot.stats && snapshot.stats.tokens_total) {
    const tokens = snapshot.stats.tokens_total;
    const cost = snapshot.stats.cost_usd;
    const tk = tokens >= 1000 ? (tokens / 1000).toFixed(1) + 'k' : tokens;
    if (cost != null) {
      parts.push(`$${cost.toFixed(2)} (${tk}tk)`);
    } else {
      parts.push(`${tk}tk`);
    }
  }

  // Recent useful event (skip session_started boilerplate)
  let lastEvent = null;
  if (snapshot.recentEvents && snapshot.recentEvents.length > 0) {
    for (let i = snapshot.recentEvents.length - 1; i >= 0; i--) {
      const ev = snapshot.recentEvents[i];
      const type = String(ev.type || '');
      if (type !== 'session_started' && type !== 'session_closed') {
        lastEvent = ev;
        break;
      }
    }
  }
  if (lastEvent) {
    const short = String(lastEvent.summary || lastEvent.type || '').slice(0, 40);
    if (short) {
      parts.push(`\x1b[90m${short}\x1b[0m`);
    }
  }

  // Warning
  if (snapshot.warning) {
    parts.push(`\x1b[1;31m! ${snapshot.warning}\x1b[0m`);
  }

  // When running inside the tmux updater, omit newline so the line can be overwritten.
  // When called directly by a user, append newline for clean shell prompt.
  const suffix = process.env.AIOSON_TMUX_BAR ? '' : '\n';
  process.stdout.write(parts.join(' │ ') + suffix);
}

function printLiveStatusSnapshot(snapshot, logger) {
  logger.log(`Live session: ${snapshot.sessionKey || 'none'}`);
  logger.log(`Phase: ${snapshot.phase}`);
  logger.log(`Tool: ${snapshot.tool || '-'}`);
  logger.log(`Active agent: ${snapshot.agent || '-'}`);
  if (snapshot.stats && Number(snapshot.stats.plan_steps_total || 0) > 0) {
    logger.log(`Plan: ${snapshot.stats.plan_steps_done || 0}/${snapshot.stats.plan_steps_total || 0}`);
  }
  logger.log(`Process: ${snapshot.processState}${snapshot.pid ? ` (pid ${snapshot.pid})` : ''}`);

  if (snapshot.task) {
    logger.log(`Task: ${snapshot.task.task_key} | status: ${snapshot.task.status} | work: ${snapshot.task.title || '-'}`);
  }
  if (snapshot.run) {
    logger.log(`Run: ${snapshot.run.run_key} | status: ${snapshot.run.status} | work: ${snapshot.run.title || snapshot.run.summary || '-'}`);
  }
  if (snapshot.startedAt) {
    logger.log(`Started: ${snapshot.startedAt}`);
  }
  if (snapshot.updatedAt) {
    logger.log(`Updated: ${snapshot.updatedAt}`);
  }
  if (snapshot.closedAt) {
    logger.log(`Closed: ${snapshot.closedAt}`);
  }
  if (snapshot.warning) {
    logger.log(`Warning: ${snapshot.warning}`);
  }

  if (snapshot.recentEvents.length === 0) {
    logger.log('Recent events: none');
    return;
  }

  logger.log('Recent events:');
  for (const event of snapshot.recentEvents) {
    logger.log(`- ${event.ts} | ${event.type} | ${event.summary || '-'}`);
  }
}

async function getLiveStatusSnapshot(targetDir, t, options = {}) {
  const { dbPath } = resolveRuntimePaths(targetDir);

  if (!(await runtimeStoreExists(targetDir))) {
    throw new Error(t('runtime.store_missing', { path: dbPath }));
  }

  const { db, runtimeDir } = await openRuntimeDb(targetDir, { mustExist: true });
  try {
    const context = await resolveLiveContext(targetDir, db, runtimeDir, {
      agentName: options.agent,
      limit: options.limit
    });

    if (!context.run && !context.state) {
      return {
        ok: true,
        targetDir,
        dbPath,
        agent: context.agentName,
        tool: null,
        phase: 'idle',
        open: false,
        processState: 'not_tracked',
        pid: null,
        sessionKey: null,
        startedAt: null,
        updatedAt: null,
        closedAt: null,
        title: null,
        currentTask: null,
        run: null,
        task: null,
        stats: normalizeLiveStats(null),
        recentEvents: []
      };
    }

    const taskMeta = parseTaskMeta(context.task);
    const planStats = getPlanStats(taskMeta);
    const state = context.state || createLiveState(targetDir, context.run, context.task, {
      sessionKey: context.sessionKey,
      activeAgent: context.agentName,
      projectPath: targetDir
    });
    state.stats = normalizeLiveStats(state.stats, planStats);

    // Prefer run.agent_name when no explicit --agent was passed;
    // this lets events emitted by other agents update the bar dynamically.
    const effectiveAgent = options.agent
      ? context.agentName
      : (context.run?.agent_name || context.agentName);

    const snapshot = {
      ok: true,
      targetDir,
      dbPath,
      agent: effectiveAgent,
      tool: state.tool_session || null,
      phase: context.phase,
      open: context.open,
      processState: context.processState,
      pid: state.child_pid || null,
      sessionKey: context.sessionKey,
      startedAt: state.started_at || null,
      updatedAt: state.updated_at || null,
      closedAt: state.closed_at || null,
      title: state.title || null,
      currentTask: state.current_task || null,
      run: context.run,
      task: context.task,
      stats: state.stats,
      recentEvents: Array.isArray(state.last_events) && state.last_events.length > 0 ? state.last_events : context.recentEvents,
      contextEstimated: state.context_estimated || null,
      warning: context.processState === 'dead' && context.phase === 'active'
        ? t('live.process_dead_warning')
        : null
    };

    // Fallback: estimate context on-the-fly if not recorded at session start
    if (!snapshot.contextEstimated && snapshot.phase !== 'idle') {
      try {
        snapshot.contextEstimated = await estimateContextSize(targetDir);
      } catch {
        // non-fatal
      }
    }

    return snapshot;
  } finally {
    db.close();
  }
}

async function runLiveStart({ args, options = {}, logger, t }) {
  const targetDir = resolveTargetDir(args);
  // --agent é OPCIONAL: serve só pra tagueamento/tracking da sessão (session
  // key, run, runtime emit). live:start NÃO invoca/injeta o agente — isso é
  // feito DENTRO do harness (o usuário roda /product etc. na própria CLI). Por
  // isso o caller (ex.: o Play) não precisa forçar um agente. Default 'product'
  // quando omitido, mantendo o tracking consistente sem exigir a flag.
  const agentName = normalizeAgentHandle(options.agent || 'product');
  const tool = normalizeLiveTool(requireOption(options, 'tool', t), t);
  const noLaunch = Boolean(options['no-launch']);

  if (options.json && !noLaunch && !options.attach) {
    throw new Error(t('live.json_requires_no_launch'));
  }

  // ── 5.3 Ambient Intelligence health check alert ────────────────────────────
  if (!options.json && !options['no-health-check']) {
    try {
      const { runHealthCheck, formatHealthAlert } = require('../lib/health-check');
      const health = await runHealthCheck(targetDir);
      const alert = formatHealthAlert(health.items);
      if (alert) {
        logger.log('');
        logger.log(alert);
        logger.log('');
      }
    } catch { /* health check is non-fatal */ }
  }

  const toolBinary = String(options['tool-bin'] || tool).trim();
  const binaryPath = await resolveExecutablePath(toolBinary);
  if (!binaryPath) {
    throw new Error(t('live.tool_binary_not_found', { binary: toolBinary }));
  }

  const useTmux = Boolean(options.tmux) || process.env.AIOSON_TMUX === '1';

  // Pre-check tmux availability so we can warn early
  if (useTmux && !noLaunch) {
    const tmuxOk = await isTmuxAvailable();
    if (!tmuxOk && !options.json) {
      logger.log(t('live.tmux_not_found', { tool }));
    }
  }

  const { db, dbPath, runtimeDir } = await openRuntimeDb(targetDir);

  try {
    const existing = await resolveLiveContext(targetDir, db, runtimeDir, {
      agentName,
      limit: options.limit
    });

    if (existing.run && existing.run.source === 'live' && existing.open) {
      const state = existing.state || createLiveState(targetDir, existing.run, existing.task, {
        sessionKey: existing.sessionKey,
        activeAgent: existing.agentName,
        projectPath: targetDir
      });

      // ── Tmux session recovery: if tmux was killed, close the stale live session ──
      if (useTmux) {
        const sessionName = buildSessionName(targetDir, agentName);
        const tmuxAlive = await hasSession(sessionName);
        if (!tmuxAlive) {
          // Tmux is gone — close the stale live session in DB and continue to create new
          const now = new Date().toISOString();
          updateRun(db, {
            runKey: existing.run.run_key,
            status: 'completed',
            summary: 'Closed because tmux session was terminated',
            eventType: 'session_closed',
            phase: 'live',
            message: 'Tmux session ended — live session auto-closed'
          });
          if (existing.task?.task_key) {
            updateTask(db, {
              taskKey: existing.task.task_key,
              status: 'completed',
              goal: 'Auto-closed after tmux termination'
            });
          }
          await clearAgentSession(runtimeDir, agentName);
          if (!options.json) {
            logger.log(t('live.tmux_recreate', { agent: agentName, session: existing.sessionKey }));
          }
          // Fall through to create a new session below
        } else {
          // Tmux still alive — reattach instead of creating new
          if (!options.json) {
            logger.log(t('live.tmux_reattach', { agent: agentName, session: existing.sessionKey }));
          }
          const sessionName = buildSessionName(targetDir, agentName);
          await attachSession(sessionName);
          return {
            ok: true,
            targetDir,
            dbPath,
            tmux: true,
            reused: true,
            agent: existing.agentName,
            tool: state.tool_session || tool,
            taskKey: existing.task?.task_key || existing.sessionRef?.taskKey || null,
            runKey: existing.run.run_key,
            sessionKey: existing.sessionKey,
            open: true
          };
        }
      } else {
        // Non-tmux reuse logic
        const existingTool = state.tool_session || null;
        // Reconcilia sessão órfã: se o processo da sessão "ativa" já morreu
        // (Play/terminal fechado sem close limpo, ou o tool crashou DEPOIS de
        // gravar o registro), NÃO reusar — senão o start novo só loga "session
        // already active", o tool nunca sobe e a órfã trava todo restart. Morto
        // é tratado igual a troca de tool: auto-close + cria sessão nova abaixo.
        const existingProcessDead = detectProcessState(state.child_pid) === 'dead';
        const toolChanged = Boolean(existingTool && existingTool !== tool);
        if (toolChanged || existingProcessDead) {
          const closeReason = toolChanged
            ? `tool changed from ${existingTool} to ${tool}`
            : 'previous process is no longer running';
          updateRun(db, {
            runKey: existing.run.run_key,
            status: 'completed',
            summary: `Auto-closed: ${closeReason}`,
            eventType: 'session_closed',
            phase: 'live',
            message: `Auto-closed previous session — ${closeReason}`
          });
          if (existing.task?.task_key) {
            updateTask(db, {
              taskKey: existing.task.task_key,
              status: 'completed',
              goal: `Auto-closed (${closeReason})`
            });
          }
          await clearAgentSession(runtimeDir, agentName);
          if (!options.json) {
            const msg = toolChanged
              ? (t('live.tool_mismatch_auto_closed', { existing: existingTool, requested: tool }) ||
                 `Previous session (${existingTool}) auto-closed — starting new with ${tool}`)
              : `Previous ${tool} session was dead — auto-closed, starting fresh`;
            logger.log(msg);
          }
          // Fall through to create a new session below
        } else {
          // Tools match (or no previous tool) — reuse existing session
          const attach = Boolean(options.attach);
          let attachChild = null;
          let attachResult = null;

          if (attach && !noLaunch) {
            attachChild = spawn(spawnExecutable(binaryPath), buildLaunchArgs(options, tool), {
              cwd: targetDir,
              env: process.env,
              stdio: 'inherit',
              shell: process.platform === 'win32'
            });
            state.child_pid = attachChild.pid || null;
            if (existing.task?.task_key) {
              const taskMeta = parseTaskMeta(existing.task);
              taskMeta.child_pid = state.child_pid;
              updateTask(db, { taskKey: existing.task.task_key, metaJson: taskMeta });
            }
          }

          await writeLiveState(runtimeDir, existing.sessionKey, state);

          if (!options.json) {
            logger.log(t('live.session_already_active', { agent: agentName, session: existing.sessionKey, runKey: existing.run.run_key, dbPath }));
          }

          if (attachChild) {
            attachResult = await waitForChild(attachChild);
          }

          return {
            ok: true,
            targetDir,
            dbPath,
            agent: existing.agentName,
            tool: state.tool_session || tool,
            taskKey: existing.task?.task_key || existing.sessionRef?.taskKey || null,
            runKey: existing.run.run_key,
            sessionKey: existing.sessionKey,
            pid: state.child_pid || null,
            processState: detectProcessState(state.child_pid),
            reused: true,
            open: true,
            attached: attach,
            childExitCode: attachResult?.code ?? null,
            childSignal: attachResult?.signal ?? null
          };
        }
      }
    }

    const now = new Date().toISOString();
    const sessionKey = options.session ? String(options.session).trim() : makeDirectSessionKey(agentName);
    const title = options.title ? String(options.title).trim() : `live-${tool}-${Date.now()}`;
    const goal = options.goal ? String(options.goal).trim() : null;
    const planRef = options.plan ? String(options.plan).trim() : null;
    const plan = await loadPlanReference(targetDir, planRef);
    const startMessage = truncateMessage(options.message, `Live session started for ${agentName} with ${tool}`);
    const taskMeta = {
      tool_session: tool,
      plan_ref: plan.planRef,
      path: targetDir,
      child_pid: null
    };
    if (plan.planSteps.length > 0) {
      taskMeta.plan_steps = plan.planSteps;
    }

    const taskKey = startTask(db, {
      sessionKey,
      title,
      goal,
      status: 'running',
      createdBy: agentName,
      taskKind: 'live_session',
      metaJson: taskMeta
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
      message: startMessage,
      payload: {
        tool_session: tool,
        plan_ref: plan.planRef,
        plan_steps_total: plan.planSteps.length,
        path: targetDir
      }
    });

    let child = null;
    let childResult = null;
    let tmuxResult = null;
    if (!noLaunch) {
      if (useTmux) {
        const tmuxOk = await isTmuxAvailable();
        if (tmuxOk) {
          if (!options.json) {
            logger.log(t('live.tmux_starting', { agent: agentName, tool }));
          }
          tmuxResult = await launchTmuxSession({
            targetDir,
            agentName,
            tool,
            binaryPath,
            toolArgs: buildLaunchArgs(options, tool)
          });
        } else {
          // Fallback to normal spawn if tmux not available
          child = spawn(spawnExecutable(binaryPath), buildLaunchArgs(options, tool), {
            cwd: targetDir,
            env: process.env,
            stdio: 'inherit',
            shell: process.platform === 'win32'
          });
          taskMeta.child_pid = child.pid || null;
          updateTask(db, {
            taskKey,
            metaJson: taskMeta
          });
        }
      } else {
        child = spawn(spawnExecutable(binaryPath), buildLaunchArgs(options, tool), {
          cwd: targetDir,
          env: process.env,
          stdio: 'inherit',
          shell: process.platform === 'win32'
        });
        taskMeta.child_pid = child.pid || null;
        updateTask(db, {
          taskKey,
          metaJson: taskMeta
        });
      }
    }

    await writeAgentSession(runtimeDir, agentName, {
      runKey,
      taskKey,
      sessionKey,
      startedAt: now,
      finished: false,
      source: 'live'
    });

    const state = createLiveState(targetDir, {
      run_key: runKey,
      session_key: sessionKey,
      agent_name: agentName,
      title,
      status: 'running',
      started_at: now,
      updated_at: now
    }, {
      task_key: taskKey,
      session_key: sessionKey,
      title,
      meta_json: JSON.stringify(taskMeta),
      created_at: now,
      updated_at: now
    }, {
      tool,
      planRef: plan.planRef,
      activeAgent: agentName,
      currentRunKey: runKey,
      projectPath: targetDir,
      childPid: taskMeta.child_pid,
      stats: {
        tasks_completed: 0,
        events_total: 1,
        plan_steps_done: 0,
        plan_steps_total: plan.planSteps.length
      },
      lastEvents: [{
        ts: now,
        type: 'session_started',
        summary: startMessage
      }]
    });

    // Estimate context size for observability
    try {
      const ctxEst = await estimateContextSize(targetDir);
      state.context_estimated = ctxEst;
    } catch {
      // non-fatal
    }

    await writeLiveState(runtimeDir, sessionKey, state);
    await appendLiveEvent(runtimeDir, sessionKey, {
      ts: now,
      type: 'session_started',
      summary: startMessage,
      agent: agentName,
      task_key: taskKey,
      run_key: runKey,
      session_key: sessionKey,
      refs: [],
      plan_step: null,
      status: 'running',
      meta: {
        tool_session: tool,
        child_pid: taskMeta.child_pid,
        path: targetDir,
        plan_ref: plan.planRef,
        plan_steps_total: plan.planSteps.length
      }
    });

    if (!options.json) {
      logger.log(t('live.session_started', { agent: agentName, tool, session: sessionKey, dbPath }));
    }

    // Ambient Intelligence: exibe digest de saúde ao iniciar sessão
    if (!options.json && !options['no-health']) {
      try {
        const { getHealthDigest } = require('./health');
        const items = await getHealthDigest(targetDir);
        if (items && items.length > 0) {
          logger.log('');
          logger.log('AIOSON Health — itens pendentes:');
          for (const item of items) {
            logger.log(`  ● ${item}`);
          }
          logger.log('  → aioson health . para detalhes');
          logger.log('');
        }
      } catch { /* não bloqueia o start */ }
    }

    if (child) {
      childResult = await waitForChild(child);
    }

    if (tmuxResult) {
      return {
        ok: true,
        targetDir,
        dbPath,
        tmux: true,
        sessionName: tmuxResult.sessionName,
        agent: agentName,
        tool,
        taskKey,
        runKey,
        sessionKey,
        pid: null,
        processState: 'tmux',
        reused: false,
        open: true
      };
    }

    return {
      ok: true,
      targetDir,
      dbPath,
      agent: agentName,
      tool,
      taskKey,
      runKey,
      sessionKey,
      pid: taskMeta.child_pid,
      processState: detectProcessState(taskMeta.child_pid),
      reused: false,
      open: true,
      childExitCode: childResult?.code ?? null,
      childSignal: childResult?.signal ?? null
    };
  } finally {
    db.close();
  }
}

async function runRuntimeEmit({ args, options = {}, logger, t }) {
  const targetDir = resolveTargetDir(args);
  const agentName = normalizeAgentHandle(requireOption(options, 'agent', t));
  const eventType = String(options.type || 'note').trim() || 'note';

  const { db, dbPath, runtimeDir, context } = await requireActiveLiveContext(targetDir, agentName, t, {
    limit: options.limit
  });

  try {
    const now = new Date().toISOString();
    const refs = parseRefs(options.refs);
    const planStep = options['plan-step'] ? String(options['plan-step']).trim() : null;
    const summary = truncateMessage(
      options.summary || options.message || options.title || `${eventType} emitted by ${agentName}`
    );
    const meta = parseJsonOption(options.meta);
    const payload = meta && typeof meta === 'object' ? { ...meta } : {};
    if (refs.length > 0) payload.refs = refs;
    if (planStep) payload.plan_step = planStep;

    const state = context.state || createLiveState(targetDir, context.run, context.task, {
      sessionKey: context.sessionKey,
      activeAgent: context.agentName,
      projectPath: targetDir
    });

    let currentTaskKey = state.current_task || null;
    let nextCurrentTask = currentTaskKey;

    if (eventType === 'task_started') {
      if (currentTaskKey) {
        throw new Error(t('live.micro_task_already_open', { agent: agentName }));
      }

      currentTaskKey = startTask(db, {
        sessionKey: context.sessionKey,
        title: options.title ? String(options.title).trim() : summary,
        goal: summary,
        status: 'running',
        createdBy: agentName,
        taskKind: 'micro_task',
        parentTaskKey: context.task.task_key,
        metaJson: {
          refs,
          plan_step: planStep
        }
      });
      nextCurrentTask = currentTaskKey;
      payload.micro_task_key = currentTaskKey;
    } else if (eventType === 'task_completed') {
      if (currentTaskKey) {
        updateTask(db, {
          taskKey: currentTaskKey,
          status: 'completed',
          goal: summary,
          metaJson: {
            refs,
            plan_step: planStep
          }
        });
      } else {
        currentTaskKey = startTask(db, {
          sessionKey: context.sessionKey,
          title: options.title ? String(options.title).trim() : summary,
          goal: summary,
          status: 'completed',
          createdBy: agentName,
          taskKind: 'micro_task',
          parentTaskKey: context.task.task_key,
          metaJson: {
            refs,
            plan_step: planStep,
            implicit: true
          }
        });
      }
      nextCurrentTask = null;
      payload.micro_task_key = currentTaskKey;
    }

    let planStats = null;
    if (eventType === 'plan_checkpoint' && planStep) {
      const sessionMeta = parseTaskMeta(context.task);
      if (Array.isArray(sessionMeta.plan_steps)) {
        const normalizedPlanStep = normalizePlanStepId(planStep).toLowerCase();
        let changed = false;
        sessionMeta.plan_steps = sessionMeta.plan_steps.map((step) => {
          if (!step || normalizePlanStepId(step.id).toLowerCase() !== normalizedPlanStep) return step;
          if (step.done) return step;
          changed = true;
          return { ...step, done: true };
        });
        if (changed) {
          updateTask(db, {
            taskKey: context.task.task_key,
            metaJson: sessionMeta
          });
          planStats = getPlanStats(sessionMeta);
        }
      }
    }

    const workerStatus = options['worker-status'] ? String(options['worker-status']).trim() : null;
    const verdict = options.verdict ? String(options.verdict).trim().toUpperCase() : null;
    const tokenCount = options['token-count'] != null ? Number(options['token-count']) || null : null;
    const progressPct = options['progress-pct'] != null ? Number(options['progress-pct']) || null : null;

    appendRunEvent(db, {
      runKey: context.run.run_key,
      eventType,
      phase: 'live',
      status: context.run.status || 'running',
      message: summary,
      payload: Object.keys(payload).length > 0 ? payload : null,
      createdAt: now,
      planStepId: planStep || null,
      workerStatus,
      verdict,
      tokenCount,
      progressPct
    });

    const eventRecord = createLiveEventRecord(context, {
      ts: now,
      type: eventType,
      summary,
      refs,
      planStep,
      taskKey: currentTaskKey,
      meta: meta && Object.keys(meta).length > 0 ? meta : null
    });

    await appendLiveEvent(runtimeDir, context.sessionKey, eventRecord);

    const nextState = applyEventToState(state, eventRecord, {
      currentTask: nextCurrentTask,
      planStats,
      activeAgent: context.agentName,
      currentRunKey: context.run.run_key
    });
    await writeLiveState(runtimeDir, context.sessionKey, nextState);

    if (!options.json) {
      logger.log(t('live.event_recorded', { agent: agentName, eventType, session: context.sessionKey, dbPath }));
    }

    return {
      ok: true,
      targetDir,
      dbPath,
      agent: context.agentName,
      eventType,
      sessionKey: context.sessionKey,
      runKey: context.run.run_key,
      taskKey: currentTaskKey || context.task.task_key,
      currentTask: nextCurrentTask,
      open: true
    };
  } finally {
    db.close();
  }
}


async function runLiveHandoff({ args, options = {}, logger, t }) {
  const targetDir = resolveTargetDir(args);
  const agentName = normalizeAgentHandle(requireOption(options, 'agent', t));
  const nextAgent = normalizeAgentHandle(requireOption(options, 'to', t));

  if (agentName === nextAgent) {
    throw new Error(t('live.handoff_same_agent'));
  }

  const reason = truncateMessage(
    options.reason || options.summary || options.message,
    `Handoff from ${agentName} to ${nextAgent}`
  );

  const { db, dbPath, runtimeDir, context } = await requireActiveLiveContext(targetDir, agentName, t, {
    limit: options.limit
  });

  try {
    if (!context.run || context.run.agent_name !== agentName) {
      throw new Error(t('live.handoff_agent_mismatch', { agent: agentName }));
    }

    const now = new Date().toISOString();
    const state = context.state || createLiveState(targetDir, context.run, context.task, {
      sessionKey: context.sessionKey,
      activeAgent: context.agentName,
      projectPath: targetDir
    });

    const handoffSummary = truncateMessage(`Handoff to ${nextAgent}: ${reason}`);
    let currentTaskClosed = false;
    if (state.current_task) {
      updateTask(db, {
        taskKey: state.current_task,
        status: 'completed',
        goal: truncateMessage(`Closed on handoff to ${nextAgent}: ${reason}`)
      });
      currentTaskClosed = true;
    }

    updateRun(db, {
      runKey: context.run.run_key,
      status: 'completed',
      summary: reason,
      eventType: 'handoff',
      phase: 'live',
      message: handoffSummary,
      payload: {
        from: agentName,
        to: nextAgent,
        reason,
        previous_run_key: context.run.run_key,
        micro_task_key: state.current_task || null,
        closed_by: 'live:handoff'
      }
    });

    const nextRunKey = startRun(db, {
      taskKey: context.task.task_key,
      agentName: nextAgent,
      agentKind: 'official',
      sessionKey: context.sessionKey,
      source: 'live',
      parentRunKey: context.run.run_key,
      title: nextAgent,
      phase: 'live',
      message: truncateMessage(`Live handoff from ${agentName}`),
      payload: {
        handoff_from: agentName,
        reason
      }
    });

    await clearAgentSession(runtimeDir, agentName);
    await writeAgentSession(runtimeDir, nextAgent, {
      runKey: nextRunKey,
      taskKey: context.task.task_key,
      sessionKey: context.sessionKey,
      startedAt: now,
      finished: false,
      source: 'live'
    });

    const eventRecord = createLiveEventRecord(context, {
      ts: now,
      type: 'handoff',
      summary: handoffSummary,
      taskKey: context.task.task_key,
      status: 'completed',
      meta: {
        from: agentName,
        to: nextAgent,
        reason,
        previous_run_key: context.run.run_key,
        current_run_key: nextRunKey,
        micro_task_key: state.current_task || null
      }
    });
    await appendLiveEvent(runtimeDir, context.sessionKey, eventRecord);

    const nextState = applyEventToState(state, eventRecord, {
      currentTask: null,
      activeAgent: nextAgent,
      currentRunKey: nextRunKey
    });
    if (currentTaskClosed) {
      nextState.stats.tasks_completed += 1;
    }
    await writeLiveState(runtimeDir, context.sessionKey, nextState);

    if (!options.json) {
      logger.log(t('live.handoff_recorded', { from: agentName, to: nextAgent, session: context.sessionKey, dbPath }));
    }

    return {
      ok: true,
      targetDir,
      dbPath,
      agent: agentName,
      nextAgent,
      taskKey: context.task.task_key,
      previousRunKey: context.run.run_key,
      runKey: nextRunKey,
      sessionKey: context.sessionKey,
      open: true
    };
  } finally {
    db.close();
  }
}

async function runLiveStatus({ args, options = {}, logger, t }) {
  const targetDir = resolveTargetDir(args);
  const watchSeconds = parseWatchSeconds(options.watch);

  if (watchSeconds && options.json) {
    throw new Error(t('live.watch_json_conflict'));
  }

  if (!watchSeconds) {
    const snapshot = await getLiveStatusSnapshot(targetDir, t, options);
    if (!options.json) {
      if (options.format === 'compact') {
        printCompactStatus(snapshot, logger);
      } else if (options.format === 'tmux-bar') {
        printTmuxBar(snapshot, logger);
      } else {
        printLiveStatusSnapshot(snapshot, logger);
      }
    }
    return snapshot;
  }

  let stopped = false;
  const onSignal = () => { stopped = true; };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  try {
    while (!stopped) {
      const snapshot = await getLiveStatusSnapshot(targetDir, t, options);
      if (process.stdout && process.stdout.isTTY) {
        process.stdout.write('\x1Bc');
      }
      if (options.format === 'compact') {
        printCompactStatus(snapshot, logger);
      } else if (options.format === 'tmux-bar') {
        printTmuxBar(snapshot, logger);
      } else {
        printLiveStatusSnapshot(snapshot, logger);
      }
      if (stopped) break;
      await sleep(Math.round(watchSeconds * 1000));
    }
  } finally {
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
  }
}

async function runLiveClose({ args, options = {}, logger, t }) {
  const targetDir = resolveTargetDir(args);
  const requestedAgent = options.agent ? normalizeAgentHandle(options.agent) : null;
  const { db, dbPath, runtimeDir } = await withRuntimeDb(targetDir, t);

  try {
    const context = await resolveLiveContext(targetDir, db, runtimeDir, {
      agentName: requestedAgent,
      limit: options.limit
    });

    if (!context.run || context.run.source !== 'live' || !context.sessionKey || !context.task) {
      throw new Error(requestedAgent
        ? t('live.no_session_for_agent', { agent: requestedAgent })
        : t('live.no_session_found'));
    }

    if (context.phase !== 'active') {
      throw new Error(t('live.session_already_closed', { session: context.sessionKey }));
    }

    const status = String(options.status || 'completed').trim().toLowerCase() === 'failed' ? 'failed' : 'completed';
    const now = new Date().toISOString();
    const summary = truncateMessage(options.summary || options.message || `Live session closed for ${context.agentName}`);
    const state = context.state || createLiveState(targetDir, context.run, context.task, {
      sessionKey: context.sessionKey,
      activeAgent: context.agentName,
      projectPath: targetDir
    });

    let currentTaskClosed = false;
    if (state.current_task) {
      updateTask(db, {
        taskKey: state.current_task,
        status,
        goal: summary
      });
      currentTaskClosed = true;
    }

    updateRun(db, {
      runKey: context.run.run_key,
      status,
      summary,
      eventType: 'session_closed',
      message: summary,
      payload: {
        closed_by: 'live:close'
      }
    });

    updateTask(db, {
      taskKey: context.task.task_key,
      status,
      goal: summary
    });

    const eventRecord = createLiveEventRecord(context, {
      ts: now,
      type: 'session_closed',
      summary,
      taskKey: context.task.task_key,
      status
    });
    await appendLiveEvent(runtimeDir, context.sessionKey, eventRecord);

    const nextState = applyEventToState(state, eventRecord, {
      currentTask: null,
      phase: 'closed',
      closedAt: now,
      activeAgent: context.agentName,
      currentRunKey: context.run.run_key
    });
    if (currentTaskClosed && status === 'completed') {
      nextState.stats.tasks_completed += 1;
    }

    const git = await collectGitSnapshot(targetDir);
    await writeLiveState(runtimeDir, context.sessionKey, nextState);
    const summaryPath = await writeLiveSummary(runtimeDir, context.sessionKey, renderLiveSummary({
      sessionKey: context.sessionKey,
      agent: context.agentName,
      tool: nextState.tool_session,
      status,
      startedAt: nextState.started_at,
      closedAt: now,
      summary,
      git,
      recentEvents: nextState.last_events
    }));

    await clearAgentSession(runtimeDir, context.agentName);

    if (!options.json) {
      logger.log(t('live.session_closed', { agent: context.agentName, session: context.sessionKey, dbPath }));
    }

    // Ambient Intelligence: sugere evolução se há learnings acumulados
    if (!options.json && !options['no-health']) {
      try {
        const { getHealthDigest } = require('./health');
        const items = await getHealthDigest(targetDir);
        if (items && items.length > 0) {
          logger.log('');
          logger.log('AIOSON Health — itens após sessão:');
          for (const item of items) {
            logger.log(`  ● ${item}`);
          }
          logger.log('  → aioson health . para detalhes e ações');
          logger.log('');
        }
      } catch { /* não bloqueia o close */ }
    }

    return {
      ok: true,
      targetDir,
      dbPath,
      agent: context.agentName,
      taskKey: context.task.task_key,
      runKey: context.run.run_key,
      sessionKey: context.sessionKey,
      status,
      closed: true,
      summaryPath,
      git
    };
  } finally {
    db.close();
  }
}

async function runLiveList({ args, options = {}, logger, t }) {
  const targetDir = resolveTargetDir(args);
  const { dbPath } = resolveRuntimePaths(targetDir);

  if (!(await runtimeStoreExists(targetDir))) {
    throw new Error(t('runtime.store_missing', { path: dbPath }));
  }

  const { db, runtimeDir } = await openRuntimeDb(targetDir, { mustExist: true });
  db.close();
  const states = await listLiveStates(runtimeDir);

  if (!options.json) {
    if (states.length === 0) {
      logger.log(t('live.list_empty'));
    } else {
      logger.log(t('live.list_title', { count: states.length }));
      for (const state of states) {
        logger.log(t('live.list_line', {
          session: state.session_key || '-',
          agent: state.active_agent || '-',
          tool: state.tool_session || '-',
          phase: state.phase || '-',
          updatedAt: state.updated_at || state.started_at || '-'
        }));
      }
    }
  }

  return {
    ok: true,
    targetDir,
    dbPath,
    count: states.length,
    sessions: states.map((state) => ({
      sessionKey: state.session_key,
      agent: state.active_agent,
      tool: state.tool_session,
      phase: state.phase,
      title: state.title,
      startedAt: state.started_at,
      updatedAt: state.updated_at,
      closedAt: state.closed_at
    }))
  };
}

module.exports = {
  buildLaunchArgs,
  runLiveStart,
  runRuntimeEmit,
  runLiveHandoff,
  runLiveStatus,
  runLiveClose,
  runLiveList,
  // Exported so callers (including tests) can resolve the on-disk directory
  // for a given session key without re-implementing the sanitization rules.
  sessionKeyToDirName,
  resolveLivePaths
};

// ── Context estimation helpers ──

const CONTEXT_FILES = [
  '.aioson/context/project.context.md',
  '.aioson/context/spec.md',
  '.aioson/context/features.md',
  '.aioson/context/context-pack.md',
  '.aioson/context/discovery.md',
  '.aioson/context/architecture.md',
  '.aioson/context/readiness.md',
  '.aioson/context/design-doc.md',
  '.aioson/context/skeleton-system.md'
];

async function estimateContextSize(projectDir) {
  let totalBytes = 0;
  const foundFiles = [];

  for (const rel of CONTEXT_FILES) {
    const filePath = path.join(projectDir, rel);
    try {
      const stat = await fs.stat(filePath);
      if (stat.isFile()) {
        totalBytes += stat.size;
        foundFiles.push(rel);
      }
    } catch {
      // ignore missing files
    }
  }

  // Heuristic: ~4 chars per token (english-ish text)
  const estimatedTokens = Math.round(totalBytes / 4);
  // Default window size assumption (200k for Sonnet-class)
  const windowSize = 200000;

  return {
    totalBytes,
    estimatedTokens,
    windowSize,
    pct: Math.min(100, Math.round((estimatedTokens / windowSize) * 100)),
    files: foundFiles
  };
}
