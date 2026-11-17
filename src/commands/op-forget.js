'use strict';

/**
 * aioson op:forget [path] <slug> — soft-delete a decision or proposal to history/.
 * Phase 2 (v1.13.0).
 */

const path = require('node:path');
const { commandFailure, openSlugCommand } = require('../operator-memory/command-context');
const { forgetEntry } = require('../operator-memory/decision');
const { withStoreLock, isLockTimeout } = require('../operator-memory/store-lock');
const { emitDossierEvent } = require('../lib/dossier-telemetry');

async function runOpForget({ args = [], options = {}, logger }) {
  if (options.help === true || args.includes('--help') || args.includes('-h')) {
    if (logger) logger.log('op:forget [path] <slug> — soft-delete a decision or proposal to history/. Idempotent.');
    return { ok: true };
  }

  const opened = openSlugCommand('op:forget', args, options, logger);
  if (opened.failure) return opened.failure;
  const { slug, dir: targetDir, resolved } = opened;
  let result;
  try {
    result = await withStoreLock(resolved.identity, () => forgetEntry(resolved.identity, slug));
  } catch (err) {
    if (!isLockTimeout(err)) throw err;
    return commandFailure(options, logger, `op:forget failed: ${err.message}`);
  }

  await emitDossierEvent(targetDir, {
    agent: 'op-forget',
    type: 'op_forget',
    summary: `${result.mode}: ${slug}`,
    meta: { identity_prefix: resolved.identity.slice(0, 8), slug, mode: result.mode }
  });

  if (options.json) {
    return { ok: true, mode: result.mode, archived: result.archivedPath };
  }
  if (result.mode === 'noop') {
    if (logger) logger.log(`op:forget — '${slug}' not found (idempotent no-op).`);
  } else {
    const archivedRel = result.archivedPath ? path.basename(result.archivedPath) : null;
    if (logger) logger.log(`op:forget — '${slug}' archived as history/${archivedRel} (${result.mode}).`);
  }
  return { ok: true, mode: result.mode };
}

module.exports = { runOpForget };
