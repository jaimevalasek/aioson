'use strict';

/**
 * aioson op:reinforce [path] <slug> — update last_reinforced without signal capture.
 * Phase 5 (v1.16.0). User-driven action when decay prompt fires.
 */

const { commandProject, pathAndSlug, identityFor } = require('../operator-memory/command-context');
const { ensureStorageTree } = require('../operator-memory/storage');
const { reinforceDecision } = require('../operator-memory/decision');
const { emitDossierEvent } = require('../lib/dossier-telemetry');

async function runOpReinforce({ args = [], options = {}, logger }) {
  const { rawPath, slug } = pathAndSlug(args);

  if (options.help === true || args.includes('--help') || args.includes('-h')) {
    if (logger) logger.log('op:reinforce [path] <slug> — refresh a decision\'s last_reinforced timestamp without re-capturing the signal.');
    return { ok: true };
  }

  const where = slug ? commandProject(rawPath) : {};
  if (!slug || where.error) {
    const err = where.error ? `op:reinforce — ${where.error}.` : 'op:reinforce — required argument: <slug>. Usage: aioson op:reinforce [path] <slug>';
    if (options.json) return { ok: false, error: err };
    if (logger && logger.error) logger.error(err);
    return { ok: false, exitCode: 1, error: err };
  }
  const targetDir = where.dir;

  const resolved = identityFor(targetDir);
  ensureStorageTree(resolved.identity);

  // Surgical in-place reinforce: bumps reinforcement_count + refreshes
  // last_reinforced and regenerates the index, preserving title/body/trigger-quotes
  // byte-for-byte. (The old re-serialize path double-wrapped them, because the merged
  // body from readDecision already contained the "# title" and "## Trigger quotes".)
  const reinforced = reinforceDecision(resolved.identity, slug);
  if (!reinforced) {
    const err = `op:reinforce — decision '${slug}' not found for identity ${resolved.identity}.`;
    if (options.json) return { ok: false, error: err };
    if (logger && logger.error) logger.error(err);
    return { ok: false, exitCode: 1, error: err };
  }

  const { last_reinforced: now, previous, reinforcement_count } = reinforced;

  await emitDossierEvent(targetDir, {
    agent: 'op-reinforce',
    type: 'op_reinforce',
    summary: `reinforced ${slug}`,
    meta: { identity_prefix: resolved.identity.slice(0, 8), slug, previous, now }
  });

  if (options.json) {
    return { ok: true, slug, last_reinforced: now, previous, reinforcement_count };
  }
  if (logger) logger.log(`op:reinforce — '${slug}' last_reinforced refreshed to ${now}.`);
  return { ok: true, slug };
}

module.exports = { runOpReinforce };
