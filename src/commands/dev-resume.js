'use strict';

const { buildDevResumeData } = require('../lib/dev-resume');

/**
 * aioson dev:resume-data .
 *
 * Returns JSON that @dev consumes when starting a new chat to know which
 * feature is in progress, what the active phase is, which artifacts were
 * already consumed, and where the code map / plan currently live.
 *
 * Returns ok=true with data=null when there is no in-progress feature.
 * Always machine-readable: omitting --json defaults to pretty JSON output.
 */
async function runDevResumeData({ args = [], options = {}, logger } = {}) {
  const targetDir = args[0] || '.';
  const data = await buildDevResumeData(targetDir);

  if (options.json || !logger) {
    return { ok: true, data };
  }

  if (data === null) {
    logger.log('No in-progress feature detected — cold start.');
    return { ok: true, data: null };
  }

  logger.log(JSON.stringify(data, null, 2));
  return { ok: true, data };
}

module.exports = { runDevResumeData };
