'use strict';

const { buildContextBrief } = require('../context-brief');
const { resolveTargetDir } = require('../lib/project-root');

// Best-effort, silent: one execution_events row per brief when the runtime DB
// already exists — the selection decision becomes queryable runtime usage.
// Never blocks or fails the brief.
async function recordBriefEvent(targetDir, result, featureSlug) {
  let handle = null;
  try {
    const { openRuntimeDb, appendContextBriefEvent } = require('../runtime-store');
    handle = await openRuntimeDb(targetDir, { mustExist: true });
    if (!handle || !handle.db) return;
    appendContextBriefEvent(handle.db, {
      agentName: result.agent,
      message: `brief_built:${result.mode}`,
      payload: briefPayload(result, featureSlug)
    });
  } catch { /* telemetry is advisory */ } finally {
    if (handle && handle.db) { try { handle.db.close(); } catch { /* closed */ } }
  }
}

// An agent consults the brief before acting, from any harness — so a brief
// with an explicit `--agent` inside a live session says who took it over.
// The default agent (`dev` when the flag is absent) proves nothing.
async function recordActivation(targetDir, options) {
  const agent = options.agent || options.a;
  if (!agent || String(agent).trim() === 'auto') return;
  const { recordAgentActivation } = require('../lib/agent-activation');
  await recordAgentActivation(targetDir, agent, { via: 'context' });
}

const pathsOf = (items, limit) => (items || []).map((item) => item.path).slice(0, limit);

function briefPayload(result, featureSlug) {
  const payload = {
    mode: result.mode,
    task_chars: String(result.task || '').length,
    must_load: pathsOf(result.must_load, 40),
    should_load: pathsOf(result.should_load, 40),
    skills: pathsOf(result.skills),
    // Recall is offered too: a doc loaded from `related` is not a routing gap.
    related: pathsOf(result.related, 6),
    confidence: result.confidence,
    // A workflow-only task routes no domain rule; context:usage and
    // agent:done count these separately from a real consultation.
    generic_task: Boolean(result.task_vocabulary && result.task_vocabulary.generic)
  };
  if (result.jev_filter) {
    payload.jev = { status: result.jev_filter.status, offered: result.jev_filter.offered, pruned: pathsOf(result.pruned) };
  }
  if (featureSlug) payload.feature_slug = String(featureSlug).trim();
  return payload;
}

async function runContextBrief({ args, options = {}, logger }) {
  const targetDir = resolveTargetDir(args);
  const result = await buildContextBrief(targetDir, {
    agent: options.agent || options.a || 'dev',
    mode: options.mode || 'planning',
    task: options.task || options.goal || '',
    paths: options.paths || options.path || '',
    feature: options.feature || options.slug || '',
    semantic: options.semantic,
    noSemantic: options.noSemantic || options['no-semantic'],
    recall: !(options['no-recall'] || options.recall === false),
    // A configured JEV prunes optional references over the budget; --no-jev
    // keeps the local selection as is.
    jevFilter: options['no-jev'] || options.jev === false ? null : { env: process.env }
  });
  await recordBriefEvent(targetDir, result, options.feature || options.slug || '');
  await recordActivation(targetDir, options);
  await require('../lib/observations').attachFan(targetDir, result, options); // the session-start fan, never a gate

  if (options.json) return result;

  // Compact by default: it stays in the agent's conversation for every later
  // call. `--full` prints every reason, outline and constraint line.
  const { compactBriefLines, fullBriefLines } = require('../lib/context-brief-format');
  const full = options.full === true || options.full === 'true';
  for (const line of (full ? fullBriefLines : compactBriefLines)(result)) logger.log(line);
  require('../lib/observations').printFan(logger, result);

  return result;
}

module.exports = { runContextBrief };
