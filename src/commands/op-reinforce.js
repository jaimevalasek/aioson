'use strict';

/**
 * aioson op:reinforce [path] <slug> — update last_reinforced without signal capture.
 * Phase 5 (v1.16.0). User-driven action when decay prompt fires.
 */

const { commandFailure, openSlugCommand } = require('../operator-memory/command-context');
const { reinforceDecision } = require('../operator-memory/decision');
const { emitDossierEvent } = require('../lib/dossier-telemetry');

async function runOpReinforce({ args = [], options = {}, logger }) {
  if (options.help === true || args.includes('--help') || args.includes('-h')) {
    if (logger) logger.log('op:reinforce [path] <slug> — refresh a decision\'s last_reinforced timestamp without re-capturing the signal.');
    return { ok: true };
  }

  const opened = openSlugCommand('op:reinforce', args, options, logger);
  if (opened.failure) return opened.failure;
  const { slug, dir: targetDir, resolved } = opened;

  // Surgical in-place reinforce: bumps reinforcement_count + refreshes
  // last_reinforced and regenerates the index, preserving title/body/trigger-quotes
  // byte-for-byte. (The old re-serialize path double-wrapped them, because the merged
  // body from readDecision already contained the "# title" and "## Trigger quotes".)
  const reinforced = reinforceDecision(resolved.identity, slug);
  if (!reinforced) return commandFailure(options, logger, `op:reinforce — decision '${slug}' not found for identity ${resolved.identity}.`);

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
