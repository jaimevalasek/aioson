'use strict';

/**
 * aioson context:digest [path] [--task="<the request>"] [--json]
 *
 * The session-start read the gateway block points at (src/lib/session-digest.js):
 * validation verdict, project essentials, matching memory titles and learnings,
 * and the commands that open each full version. Always exits 0 with a digest;
 * an invalid context is a verdict inside it, not a command failure.
 */

const { resolveProjectRootOrSelf, resolveTargetDir } = require('../lib/project-root');
const { buildSessionDigest } = require('../lib/session-digest');

async function runContextDigest({ args = [], options = {}, logger = console } = {}) {
  const targetDir = resolveProjectRootOrSelf(resolveTargetDir(args));
  const task = typeof options.task === 'string' ? options.task : '';
  const digest = await buildSessionDigest(targetDir, { task });
  if (!options.json && logger) logger.log(JSON.stringify(digest, null, 2));
  return digest;
}

module.exports = { runContextDigest };
