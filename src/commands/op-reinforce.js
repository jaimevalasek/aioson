'use strict';

/**
 * aioson op:reinforce <slug> — update last_reinforced without signal capture.
 * Phase 5 (v1.16.0). User-driven action when decay prompt fires.
 */

const { resolveIdentity } = require('../operator-memory/identity');
const { ensureStorageTree } = require('../operator-memory/storage');
const { reinforceDecision } = require('../operator-memory/decision');
const { emitDossierEvent } = require('../lib/dossier-telemetry');

async function runOpReinforce({ args = [], options = {}, logger }) {
  const targetDir = process.cwd();
  const positional = (args || []).filter((a) => typeof a === 'string' && !a.startsWith('-') && a !== '.');
  const slug = positional[0];

  if (options.help === true || args.includes('--help') || args.includes('-h')) {
    if (logger) logger.log('op:reinforce <slug> — refresh a decision\'s last_reinforced timestamp without re-capturing the signal.');
    return { ok: true };
  }

  if (!slug) {
    const err = 'op:reinforce — required argument: <slug>. Usage: aioson op:reinforce <slug>';
    if (options.json) return { ok: false, error: err };
    if (logger && logger.error) logger.error(err);
    return { ok: false, exitCode: 1, error: err };
  }

  const resolved = resolveIdentity();
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
