'use strict';

/**
 * aioson op:forget [path] <slug> — soft-delete a decision or proposal to history/.
 * Phase 2 (v1.13.0).
 */

const path = require('node:path');
const { commandProject, pathAndSlug, identityFor } = require('../operator-memory/command-context');
const { ensureStorageTree } = require('../operator-memory/storage');
const { forgetEntry } = require('../operator-memory/decision');
const { emitDossierEvent } = require('../lib/dossier-telemetry');

async function runOpForget({ args = [], options = {}, logger }) {
  const { rawPath, slug } = pathAndSlug(args);

  if (options.help === true || args.includes('--help') || args.includes('-h')) {
    if (logger) logger.log('op:forget [path] <slug> — soft-delete a decision or proposal to history/. Idempotent.');
    return { ok: true };
  }

  const where = slug ? commandProject(rawPath) : {};
  if (!slug || where.error) {
    const err = where.error ? `op:forget — ${where.error}.` : 'op:forget — required argument: <slug>. Usage: aioson op:forget [path] <slug>';
    if (options.json) return { ok: false, error: err };
    if (logger && logger.error) logger.error(err);
    return { ok: false, exitCode: 1, error: err };
  }
  const targetDir = where.dir;

  const resolved = identityFor(targetDir);
  ensureStorageTree(resolved.identity);
  const result = forgetEntry(resolved.identity, slug);

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
