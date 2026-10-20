'use strict';

/**
 * aioson hooks:recap [projectDir] --source=<tool> [--when=compact|always] [--session=<id>] --json
 *
 * Claude Code SessionStart hook (matcher `compact`). After the conversation is
 * compacted, injects the session checkpoint rebuilt from the events the hooks
 * recorded before it (src/lib/compaction-recap.js): agent, feature, workflow
 * stage and the next step on record, files changed, commands still failing,
 * last test result, plan, continuity notes. Any other SessionStart (startup,
 * resume, clear) answers `{}`.
 *
 * The checkpoint speaks for one harness session: the session_id of the
 * SessionStart payload (Claude Code, Codex), `--session` (the OpenCode
 * plugin), or — on demand with neither — the session that recorded last. The
 * per-agent hooks run is shared by every window, lane and day on the project;
 * reading it whole gave a new session yesterday's files and claims.
 *
 * Codex's SessionStart hook (matcher `compact`) speaks the same payload and
 * envelope. OpenCode has no shell hook: its AIOSON plugin calls
 * `--when=always --session=<id> --json` around a compaction and reads the bare
 * context. The same flag, as text, is the on-demand door a kernel uses right
 * after `/compact` when no hook is installed. The data layer is the same; only
 * the door differs.
 *
 * Like context:guard it answers on the hook's stdout channel, so every failure
 * is an empty injection, never a non-hook envelope — it must never block.
 */

const fs = require('node:fs');
const path = require('node:path');
const { resolveProjectRoot, resolveTargetDir } = require('../lib/project-root');
const { openRuntimeDb, resolveRuntimePaths, readAgentSession } = require('../runtime-store');
const { resolveLauncherLiveSession } = require('./live');
const { buildDevResumeData } = require('../lib/dev-resume');
const { buildCompactionRecap, sessionAgent } = require('../lib/compaction-recap');
const { readStdin, hookAgentHandle } = require('./hooks-emit');

const MAX_EVENTS = 2000;
const WHEN_VALUES = ['compact', 'always'];
// A session's events may sit in more than one run (one window's SessionEnd
// closed the shared hooks run while another kept going): every live run still
// open, or opened within this span, is searched for the session.
const SESSION_LOOKBACK_MS = 3 * 24 * 60 * 60 * 1000;
const SESSION_ID_SQL = "CASE WHEN json_valid(payload_json) THEN json_extract(payload_json, '$.session_id') END";

// Tools with a Claude-style SessionStart hook — Claude Code, Codex, and by
// default any harness that copies that format — get its envelope; the
// OpenCode plugin, which calls on demand, gets the bare context.
function formatForTool(tool, additionalContext) {
  switch (tool) {
    case 'opencode':
      return { additionalContext };
    case 'claude':
    case 'codex':
    default:
      return { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext } };
  }
}

function contextOf(response) {
  if (!response) return null;
  if (response.hookSpecificOutput) return response.hookSpecificOutput.additionalContext || null;
  return response.additionalContext || null;
}

// The run the hooks write to: the launcher's live session, else the per-agent
// session `hooks:emit` auto-starts (`source: 'live'`). Same predicate as
// hooks-emit — an agent's own official run is a different run, and reading it
// here would rebuild the checkpoint from events the hooks never wrote there.
async function sessionRunKey(targetDir, runtimeDir, source, handle) {
  const live = await resolveLauncherLiveSession(targetDir, runtimeDir, { source });
  if (live) return live.runKey;
  const session = await readAgentSession(runtimeDir, handle);
  return session && !session.finished && session.source === 'live' && session.runKey ? session.runKey : null;
}

function sessionIdOf(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** The harness session that recorded last on the run: the on-demand door's best guess. */
function latestSessionId(handle, runKey) {
  if (!handle || !runKey) return null;
  const row = handle.db.prepare(`
    SELECT ${SESSION_ID_SQL} AS sid FROM agent_events
    WHERE run_key = ? AND ${SESSION_ID_SQL} IS NOT NULL
    ORDER BY id DESC LIMIT 1
  `).get(runKey);
  return row && row.sid ? String(row.sid) : null;
}

function readSessionEvents(handle, { runKey, sessionId }) {
  if (!handle) return [];
  if (sessionId) {
    const since = new Date(Date.now() - SESSION_LOOKBACK_MS).toISOString();
    return handle.db.prepare(`
      SELECT event_type, message, payload_json FROM (
        SELECT id, event_type, message, payload_json FROM agent_events
        WHERE run_key IN (SELECT run_key FROM agent_runs WHERE source = 'live' AND (status = 'running' OR started_at >= ?))
          AND ${SESSION_ID_SQL} = ?
        ORDER BY id DESC LIMIT ?
      ) ORDER BY id ASC
    `).all(since, sessionId, MAX_EVENTS);
  }
  if (!runKey) return [];
  return handle.db.prepare(`
    SELECT event_type, message, payload_json FROM (
      SELECT id, event_type, message, payload_json FROM agent_events
      WHERE run_key = ? ORDER BY id DESC LIMIT ?
    ) ORDER BY id ASC
  `).all(runKey, MAX_EVENTS);
}

function continuityFor(targetDir, resume) {
  if (!resume || !resume.feature_slug) return null;
  const relative = `.aioson/mappings/${resume.feature_slug}/continuity.md`;
  return fs.existsSync(path.join(targetDir, relative)) ? relative : null;
}

/** The stage the workflow engine has on record (`workflow.state.json` → `current`), or null. */
function workflowStage(targetDir) {
  try {
    const state = JSON.parse(fs.readFileSync(path.join(targetDir, '.aioson', 'context', 'workflow.state.json'), 'utf8'));
    if (!state || typeof state.current !== 'string' || !state.current.trim()) return null;
    return { stage: state.current.trim(), feature: state.featureSlug || null, mode: state.mode || null, classification: state.classification || null };
  } catch {
    return null;
  }
}

/** The artifact the session's agent owes, per the handoff contract (project-relative). */
async function canonicalArtifacts(agent, targetDir, workflow, resume) {
  if (!agent || agent === '@dev') return [];
  const featureSlug = (workflow && workflow.feature) || (resume && resume.feature_slug) || null;
  const { getCanonicalArtifactsForAgent } = require('../handoff-contract');
  const list = await getCanonicalArtifactsForAgent(agent, targetDir, {
    mode: (workflow && workflow.mode) || (featureSlug ? 'feature' : 'project'),
    featureSlug,
    classification: workflow && workflow.classification
  });
  return Array.isArray(list) ? list.map((file) => path.relative(targetDir, file).replace(/\\/g, '/')) : [];
}

async function buildRecapResponse(targetDir, payload, options = {}) {
  const onDemand = options.when === 'always';
  if (!onDemand && (!payload || payload.source !== 'compact')) return {};
  const source = options.source || 'claude';
  const handle = hookAgentHandle(options.agent || 'dev');
  const { runtimeDir } = resolveRuntimePaths(targetDir);

  const runKey = await sessionRunKey(targetDir, runtimeDir, source, handle).catch(() => null);
  let events;
  let sessionId = sessionIdOf(options.session) || sessionIdOf(payload && payload.session_id);
  const db = runKey || sessionId ? await openRuntimeDb(targetDir, { mustExist: true }).catch(() => null) : null;
  try {
    if (!sessionId && onDemand) sessionId = latestSessionId(db, runKey);
    events = readSessionEvents(db, { runKey, sessionId });
  } finally {
    if (db && db.db) db.db.close();
  }

  const sessionScoped = Boolean(sessionId);
  const resume = await buildDevResumeData(targetDir).catch(() => null);
  const workflow = workflowStage(targetDir);
  const artifacts = await canonicalArtifacts(sessionAgent(events, sessionScoped), targetDir, workflow, resume).catch(() => []);
  const observations = await require('../lib/observations').recentObservations(targetDir, { hours: 24 }).catch(() => []);
  const recap = buildCompactionRecap({
    events,
    sessionScoped,
    resume,
    workflow,
    artifacts,
    continuityPath: continuityFor(targetDir, resume),
    observations,
    targetDir,
    maxChars: options.maxChars
  });
  return recap ? formatForTool(source, recap) : {};
}

/** The response for one call inside a project: the hook payload only feeds the compaction gate; on demand nothing is read. */
async function recapFor(targetDir, when, options) {
  const payload = when === 'always'
    ? null
    : (options.payload !== undefined ? options.payload : await readStdin());
  return buildRecapResponse(targetDir, payload, {
    source: options.source ? String(options.source).trim() : 'claude',
    agent: options.agent,
    session: options.session,
    maxChars: options['max-chars'] ? Number(options['max-chars']) : undefined,
    when
  });
}

async function runHooksRecap({ args, options = {}, logger }) {
  const when = options.when == null ? 'compact' : String(options.when).trim();
  if (!WHEN_VALUES.includes(when)) {
    const error = `hooks:recap — invalid --when='${when}'. Must be one of: ${WHEN_VALUES.join(', ')}.`;
    if (options.json) return { ok: false, error };
    if (logger && logger.error) logger.error(error);
    return { ok: false, exitCode: 1, error };
  }
  const targetDir = resolveProjectRoot(resolveTargetDir(args));
  const response = targetDir ? await recapFor(targetDir, when, options).catch(() => ({})) : {};
  if (options.json) return response;
  const context = contextOf(response);
  if (logger) logger.log(context || 'hooks:recap: nothing to restore (not a compaction, or no recorded session)');
  return { ok: true, injected: Boolean(context) };
}

module.exports = { runHooksRecap, buildRecapResponse, formatForTool, WHEN_VALUES };
