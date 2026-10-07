'use strict';

const path = require('node:path');
const { selectContext } = require('../context-selector');
const { resolveTargetDir } = require('../lib/project-root');

// Best-effort, silent, only when the runtime store already exists: the agent's
// selection call is its activation trace (see lib/active-agent.js).
async function recordSelectEvent(targetDir, result) {
  let handle = null;
  try {
    const { openRuntimeDb, appendContextSelectEvent } = require('../runtime-store');
    handle = await openRuntimeDb(targetDir, { mustExist: true });
    if (!handle || !handle.db) return;
    appendContextSelectEvent(handle.db, {
      agentName: result.agent,
      message: `selection_built:${result.mode}`,
      payload: { mode: result.mode, selected: (result.selected || []).length }
    });
  } catch { /* telemetry is advisory */ } finally {
    if (handle && handle.db) { try { handle.db.close(); } catch { /* closed */ } }
  }
}

async function withSelectTrace(targetDir, result) {
  await recordSelectEvent(targetDir, result);
  return result;
}

async function runContextSelect({ args, options = {}, logger }) {
  const targetDir = resolveTargetDir(args);
  const result = await withSelectTrace(targetDir, await selectContext(targetDir, {
    agent: options.agent || options.a || 'dev',
    mode: options.mode || 'planning',
    task: options.task || options.goal || '',
    paths: options.paths || options.path || '',
    feature: options.feature || options.slug || '',
    semantic: options.semantic,
    noSemantic: options.noSemantic || options['no-semantic'],
    // `--explain=<path[,path2]>` prints WHY a named candidate was excluded
    // (agent/mode filter, score vs threshold) — the debugging channel
    // context:evals uses for its failure diagnosis.
    explain: typeof options.explain === 'string' ? options.explain : ''
  }));

  if (options.json) return result;

  logger.log(`Context selection for @${result.agent} (${result.mode})`);
  if (result.task) logger.log(`Task: ${result.task}`);
  if (result.paths.length > 0) logger.log(`Paths: ${result.paths.join(', ')}`);
  logger.log('Boundary: load only the selected files until the task, mode, feature, or touched paths change.');
  if (result.selected.length === 0 && (!result.memory || result.memory.length === 0)) {
    logger.log('No context files selected.');
    return result;
  }

  for (const item of result.selected) {
    logger.log(`- ${item.path} [${item.surface}; ${item.load_tier}] ${item.reason}`);
  }

  if (result.memory && result.memory.length > 0) {
    logger.log('Memory matches:');
    for (const item of result.memory) {
      logger.log(`- [${item.target_type}] ${item.target_id} ${item.reason}`);
    }
  }

  if (result.explain && result.explain.length > 0) {
    logger.log('Explain:');
    for (const entry of result.explain) {
      if (entry.status === 'selected') logger.log(`- ${entry.path}: selected (${entry.reason})`);
      else logger.log(`- ${entry.path}: excluded — ${entry.cause}${entry.cause === 'below_threshold' ? ` (${entry.score}/${entry.threshold})` : ''}`);
    }
  }

  return result;
}

module.exports = { runContextSelect };
