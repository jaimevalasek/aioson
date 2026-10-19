'use strict';

/**
 * aioson hooks:recap [projectDir] --source=<tool> --json
 *
 * Claude Code SessionStart hook (matcher `compact`). After the conversation is
 * compacted, injects the session checkpoint rebuilt from the events the hooks
 * recorded before it (src/lib/compaction-recap.js): agent, feature and next
 * step on record, files changed, commands still failing, last test result,
 * plan, continuity notes. Any other SessionStart (startup, resume, clear)
 * answers `{}`.
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
const { buildCompactionRecap } = require('../lib/compaction-recap');
const { readStdin } = require('./hooks-emit');

const MAX_EVENTS = 2000;

function formatForTool(tool, additionalContext) {
  // Only the Claude Code adapter exists: it is the harness with a SessionStart
  // `compact` source to inject into.
  switch (tool) {
    case 'claude':
    default:
      return { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext } };
  }
}

async function sessionRunKey(targetDir, runtimeDir, source, agentName) {
  const live = await resolveLauncherLiveSession(targetDir, runtimeDir, { source });
  if (live) return live.runKey;
  const session = await readAgentSession(runtimeDir, agentName);
  return session && !session.finished && session.runKey ? session.runKey : null;
}

function readSessionEvents(handle, runKey) {
  if (!handle || !runKey) return [];
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

async function buildRecapResponse(targetDir, payload, options = {}) {
  if (!payload || payload.source !== 'compact') return {};
  const source = options.source || 'claude';
  const agentName = options.agent ? String(options.agent).replace(/^@/, '') : 'dev';
  const { runtimeDir } = resolveRuntimePaths(targetDir);

  const runKey = await sessionRunKey(targetDir, runtimeDir, source, agentName).catch(() => null);
  let events = [];
  const handle = runKey ? await openRuntimeDb(targetDir, { mustExist: true }).catch(() => null) : null;
  try {
    events = readSessionEvents(handle, runKey);
  } finally {
    if (handle && handle.db) handle.db.close();
  }

  const resume = await buildDevResumeData(targetDir).catch(() => null);
  const recap = buildCompactionRecap({
    events,
    resume,
    continuityPath: continuityFor(targetDir, resume),
    targetDir,
    maxChars: options.maxChars
  });
  return recap ? formatForTool(source, recap) : {};
}

async function runHooksRecap({ args, options = {}, logger }) {
  const targetDir = resolveProjectRoot(resolveTargetDir(args));
  let response = {};
  if (targetDir) {
    try {
      const payload = options.payload !== undefined ? options.payload : await readStdin();
      response = await buildRecapResponse(targetDir, payload, {
        source: options.source ? String(options.source).trim() : 'claude',
        agent: options.agent,
        maxChars: options['max-chars'] ? Number(options['max-chars']) : undefined
      });
    } catch {
      response = {};
    }
  }
  if (options.json) return response;
  const context = response.hookSpecificOutput && response.hookSpecificOutput.additionalContext;
  if (logger) logger.log(context || 'hooks:recap: nothing to restore (not a compaction, or no recorded session)');
  return { ok: true, injected: Boolean(context) };
}

module.exports = { runHooksRecap, buildRecapResponse };
