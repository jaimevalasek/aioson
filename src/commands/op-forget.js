'use strict';

/**
 * aioson op:forget <slug> — soft-delete a decision or proposal to history/.
 * Phase 2 (v1.13.0).
 */

const path = require('node:path');
const { resolveIdentity } = require('../operator-memory/identity');
const { ensureStorageTree } = require('../operator-memory/storage');
const { forgetEntry } = require('../operator-memory/decision');
const { emitDossierEvent } = require('../lib/dossier-telemetry');

async function runOpForget({ args = [], options = {}, logger }) {
  const targetDir = process.cwd();
  const positional = (args || []).filter((a) => typeof a === 'string' && !a.startsWith('-') && a !== '.');
  const slug = positional[0];

  if (options.help === true || args.includes('--help') || args.includes('-h')) {
    if (logger) logger.log('op:forget <slug> — soft-delete a decision or proposal to history/. Idempotent.');
    return { ok: true };
  }

  if (!slug) {
    const err = 'op:forget — required argument: <slug>. Usage: aioson op:forget <slug>';
    if (options.json) return { ok: false, error: err };
    if (logger && logger.error) logger.error(err);
    return { ok: false, exitCode: 1, error: err };
  }

  const resolved = resolveIdentity();
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
