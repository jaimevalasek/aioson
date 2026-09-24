'use strict';

const path = require('node:path');
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
    const payload = {
      mode: result.mode,
      task_chars: String(result.task || '').length,
      must_load: (result.must_load || []).map((item) => item.path).slice(0, 40),
      should_load: (result.should_load || []).map((item) => item.path).slice(0, 40),
      skills: (result.skills || []).map((item) => item.path),
      // Recall is offered too: a doc loaded from `related` is not a routing gap.
      related: (result.related || []).map((item) => item.path).slice(0, 6),
      confidence: result.confidence,
      // A workflow-only task routes no domain rule; context:usage and
      // agent:done count these separately from a real consultation.
      generic_task: Boolean(result.task_vocabulary && result.task_vocabulary.generic)
    };
    if (featureSlug) payload.feature_slug = String(featureSlug).trim();
    appendContextBriefEvent(handle.db, {
      agentName: result.agent,
      message: `brief_built:${result.mode}`,
      payload
    });
  } catch { /* telemetry is advisory */ } finally {
    if (handle && handle.db) { try { handle.db.close(); } catch { /* closed */ } }
  }
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
    recall: !(options['no-recall'] || options.recall === false)
  });
  await recordBriefEvent(targetDir, result, options.feature || options.slug || '');

  if (options.json) return result;

  logger.log(`Context brief for @${result.agent} (${result.mode})`);
  if (result.task) logger.log(`Task: ${result.task}`);
  logger.log(`Intent: ${result.intent.operation}${result.intent.stack ? ` / ${result.intent.stack}` : ''}`);
  if (result.intent.concerns.length > 0) logger.log(`Concerns: ${result.intent.concerns.join(', ')}`);
  logger.log(`Confidence: ${result.confidence}`);

  if (result.must_load.length > 0) {
    logger.log('Must load:');
    for (const item of result.must_load) logger.log(`- ${item.path} [${item.surface}] ${item.reason}`);
  }
  if (result.should_load.length > 0) {
    logger.log('Should load when needed:');
    for (const item of result.should_load) logger.log(`- ${item.path} [${item.surface}] ${item.reason}`);
  }
  if (result.skills && result.skills.length > 0) {
    logger.log('Matching skills (load per your kernel skill contract):');
    for (const item of result.skills) logger.log(`- ${item.path} ${item.reason}`);
  }
  if (result.constraints.length > 0) {
    logger.log('Constraints:');
    for (const item of result.constraints.slice(0, 8)) logger.log(`- ${item}`);
  }
  if (result.forbidden_patterns.length > 0) {
    logger.log('Forbidden patterns:');
    for (const item of result.forbidden_patterns.slice(0, 8)) logger.log(`- ${item}`);
  }
  if (result.verification_hints.length > 0) {
    logger.log('Verification hints:');
    for (const item of result.verification_hints.slice(0, 8)) logger.log(`- ${item}`);
  }
  if (result.gaps.length > 0) {
    logger.log('Gaps:');
    for (const gap of result.gaps) logger.log(`- ${gap.code}: ${gap.message}`);
  }
  if (result.related && result.related.length > 0) {
    logger.log('Related (recall — history/archive select cannot see):');
    for (const item of result.related) logger.log(`- ${item.path} [${item.source_type}] ${item.reason || ''}`);
  }

  return result;
}

module.exports = { runContextBrief };
