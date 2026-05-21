'use strict';

/**
 * aioson op:reinforce <slug> — update last_reinforced without signal capture.
 * Phase 5 (v1.16.0). User-driven action when decay prompt fires.
 */

const fs = require('node:fs');
const { resolveIdentity } = require('../operator-memory/identity');
const { ensureStorageTree } = require('../operator-memory/storage');
const { readDecision, decisionPath, serializeDecision } = require('../operator-memory/decision');
const { regenerateIndex } = require('../operator-memory/index-md');
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
  const decision = readDecision(resolved.identity, slug);
  if (!decision) {
    const err = `op:reinforce — decision '${slug}' not found for identity ${resolved.identity}.`;
    if (options.json) return { ok: false, error: err };
    if (logger && logger.error) logger.error(err);
    return { ok: false, exitCode: 1, error: err };
  }

  const now = new Date().toISOString();
  const previous = decision.last_reinforced;
  const updated = {
    ...decision,
    slug,
    last_reinforced: now,
    reinforcement_count: Number(decision.reinforcement_count || 0) + 1
  };
  // serialize keeps quotes + body + frontmatter intact
  const out = serializeDecision({ ...updated, body: decision.body, title: decision.body?.split('\n')[0]?.replace(/^# /, '') || slug });
  const filePath = decisionPath(resolved.identity, slug);
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, out, 'utf8');
  fs.renameSync(tmp, filePath);

  try { regenerateIndex(resolved.identity); } catch { /* non-fatal */ }

  await emitDossierEvent(targetDir, {
    agent: 'op-reinforce',
    type: 'op_reinforce',
    summary: `reinforced ${slug}`,
    meta: { identity_prefix: resolved.identity.slice(0, 8), slug, previous, now }
  });

  if (options.json) {
    return { ok: true, slug, last_reinforced: now, previous, reinforcement_count: updated.reinforcement_count };
  }
  if (logger) logger.log(`op:reinforce — '${slug}' last_reinforced refreshed to ${now}.`);
  return { ok: true, slug };
}

module.exports = { runOpReinforce };
