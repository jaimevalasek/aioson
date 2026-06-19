'use strict';

const path = require('node:path');
const { buildContextBrief } = require('../context-brief');

async function runContextBrief({ args, options = {}, logger }) {
  const targetDir = path.resolve(process.cwd(), args[0] || '.');
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
