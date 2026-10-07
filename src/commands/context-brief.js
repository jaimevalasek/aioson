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
    appendContextBriefEvent(handle.db, {
      agentName: result.agent,
      message: `brief_built:${result.mode}`,
      payload: briefPayload(result, featureSlug)
    });
  } catch { /* telemetry is advisory */ } finally {
    if (handle && handle.db) { try { handle.db.close(); } catch { /* closed */ } }
  }
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

// A large optional file names the lines worth reading, never the whole file.
function formatReadHint(item) {
  if (item.read === 'lens') {
    return [`your lens — read lines ${item.focus.map((entry) => entry.lines).join(', ')} of ${item.lines}; skip ${item.skipped_sections.join(' | ')} (addressed to other agents)`];
  }
  if (item.read === 'sections') {
    return [`large (${item.chars} chars) — read only: ${item.focus.map((entry) => `lines ${entry.lines} "${entry.heading}"`).join('; ')}`];
  }
  if (item.read === 'outline') {
    return [`large (${item.chars} chars), no section matches the task — pick from: ${item.outline.join(' | ')}`];
  }
  return [];
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

  if (options.json) return result;

  logger.log(`Context brief for @${result.agent} (${result.mode})`);
  if (result.task) logger.log(`Task: ${result.task}`);
  logger.log(`Intent: ${result.intent.operation}${result.intent.stack ? ` / ${result.intent.stack}` : ''}`);
  if (result.intent.concerns.length > 0) logger.log(`Concerns: ${result.intent.concerns.join(', ')}`);
  logger.log(`Confidence: ${result.confidence}`);

  if (result.must_load.length > 0) {
    logger.log('Must load:');
    for (const item of result.must_load) {
      logger.log(`- ${item.path} [${item.surface}] ${item.reason}`);
      for (const line of formatReadHint(item)) logger.log(`    ${line}`);
    }
  }
  if (result.should_load.length > 0) {
    const budget = result.load_budget;
    const cost = budget && budget.should_load_chars > 0
      ? ` (~${budget.should_load_chars} chars whole; ~${budget.should_load_focused_chars} reading only the listed sections)`
      : '';
    logger.log(`Should load when needed${cost}:`);
    for (const item of result.should_load) {
      logger.log(`- ${item.path} [${item.surface}] ${item.reason}`);
      for (const line of formatReadHint(item)) logger.log(`    ${line}`);
    }
  }
  if (result.skills && result.skills.length > 0) {
    logger.log('Matching skills (load per your kernel skill contract):');
    for (const item of result.skills) logger.log(`- ${item.path} ${item.reason}`);
  }
  if (result.jev_filter && result.jev_filter.status === 'used' && result.pruned.length > 0) {
    logger.log(`Pruned by JEV (${result.pruned.length} of ${result.jev_filter.offered} optional, below noul ${result.jev_filter.min_noul}) — not needed for this task:`);
    for (const item of result.pruned) logger.log(`- ${item.path} (${item.noul})`);
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
