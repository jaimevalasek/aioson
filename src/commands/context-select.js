'use strict';

const path = require('node:path');
const { selectContext } = require('../context-selector');

async function runContextSelect({ args, options = {}, logger }) {
  const targetDir = path.resolve(process.cwd(), args[0] || '.');
  const result = await selectContext(targetDir, {
    agent: options.agent || options.a || 'dev',
    mode: options.mode || 'planning',
    task: options.task || options.goal || '',
    paths: options.paths || options.path || '',
    feature: options.feature || options.slug || ''
  });

  if (options.json) return result;

  logger.log(`Context selection for @${result.agent} (${result.mode})`);
  if (result.task) logger.log(`Task: ${result.task}`);
  if (result.paths.length > 0) logger.log(`Paths: ${result.paths.join(', ')}`);
  if (result.selected.length === 0) {
    logger.log('No context files selected.');
    return result;
  }

  for (const item of result.selected) {
    logger.log(`- ${item.path} [${item.surface}; ${item.load_tier}] ${item.reason}`);
  }

  return result;
}

module.exports = { runContextSelect };
