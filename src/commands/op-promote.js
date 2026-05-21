'use strict';

/**
 * aioson op:promote <slug> — manually promote a proposal (skip 2x threshold).
 * Phase 2 (v1.13.0).
 */

const { resolveIdentity } = require('../operator-memory/identity');
const { ensureStorageTree } = require('../operator-memory/storage');
const { readProposal } = require('../operator-memory/proposal');
const { promoteProposal } = require('../operator-memory/decision');
const { emitDossierEvent } = require('../lib/dossier-telemetry');

async function runOpPromote({ args = [], options = {}, logger }) {
  const targetDir = process.cwd();
  const positional = (args || []).filter((a) => typeof a === 'string' && !a.startsWith('-') && a !== '.');
  const slug = positional[0];

  if (options.help === true || args.includes('--help') || args.includes('-h')) {
    if (logger) logger.log('op:promote <slug> — manually promote a pending proposal to a decision.');
    return { ok: true };
  }

  if (!slug) {
    const err = 'op:promote — required argument: <slug>. Usage: aioson op:promote <slug>';
    if (options.json) return { ok: false, error: err };
    if (logger && logger.error) logger.error(err);
    return { ok: false, exitCode: 1, error: err };
  }

  const resolved = resolveIdentity();
  ensureStorageTree(resolved.identity);
  const proposal = readProposal(resolved.identity, slug);
  if (!proposal) {
    const err = `op:promote — proposal '${slug}' not found.`;
    if (options.json) return { ok: false, error: err };
    if (logger && logger.error) logger.error(err);
    return { ok: false, exitCode: 1, error: err };
  }

  let decision;
  try {
    decision = promoteProposal({ identity: resolved.identity, proposal });
  } catch (err) {
    const errMsg = `op:promote failed: ${err.message}`;
    if (options.json) return { ok: false, error: errMsg };
    if (logger && logger.error) logger.error(errMsg);
    return { ok: false, exitCode: 1, error: errMsg };
  }

  await emitDossierEvent(targetDir, {
    agent: 'op-promote',
    type: 'op_promote',
    summary: `manual promote ${slug}`,
    meta: { identity_prefix: resolved.identity.slice(0, 8), slug, signal_type: decision.signal_type, category: decision.category, mode: 'manual' }
  });

  const auditLine = `✔ Memory: '${proposal.proposal}'. aioson op:forget ${slug} p/ desfazer.`;
  if (options.json) {
    return { ok: true, slug, identity: resolved.identity, category: decision.category };
  }
  if (logger) logger.log(auditLine);
  return { ok: true, slug };
}

module.exports = { runOpPromote };
