'use strict';

/**
 * aioson op:show <slug> — print a single decision body + frontmatter (Phase 3, v1.14.0).
 */

const fs = require('node:fs');
const { resolveIdentity } = require('../operator-memory/identity');
const { ensureStorageTree } = require('../operator-memory/storage');
const { readDecision, decisionPath } = require('../operator-memory/decision');
const { readProposal } = require('../operator-memory/proposal');

async function runOpShow({ args = [], options = {}, logger }) {
  const positional = (args || []).filter((a) => typeof a === 'string' && !a.startsWith('-') && a !== '.');
  const slug = positional[0];

  if (options.help === true || args.includes('--help') || args.includes('-h')) {
    if (logger) logger.log('op:show <slug> — print a single decision (frontmatter + body). --json for structured output.');
    return { ok: true };
  }

  if (!slug) {
    const err = 'op:show — required argument: <slug>. Usage: aioson op:show <slug>';
    if (options.json) return { ok: false, error: err };
    if (logger && logger.error) logger.error(err);
    return { ok: false, exitCode: 1, error: err };
  }

  const resolved = resolveIdentity();
  ensureStorageTree(resolved.identity);

  const decision = readDecision(resolved.identity, slug);
  if (decision) {
    if (options.json) {
      return { ok: true, kind: 'decision', identity: resolved.identity, slug, ...decision };
    }
    if (logger) {
      const filePath = decisionPath(resolved.identity, slug);
      const raw = fs.readFileSync(filePath, 'utf8');
      logger.log(raw);
    }
    return { ok: true, kind: 'decision' };
  }

  const proposal = readProposal(resolved.identity, slug);
  if (proposal) {
    if (options.json) {
      return { ok: true, kind: 'proposal', identity: resolved.identity, slug, ...proposal };
    }
    if (logger) {
      logger.log(`# Proposal: ${slug}`);
      logger.log('');
      logger.log(`signal_type: ${proposal.signal_type}`);
      logger.log(`detected_count: ${proposal.detected_count}`);
      logger.log(`first_detected: ${proposal.first_detected}`);
      logger.log(`last_detected: ${proposal.last_detected}`);
      logger.log(`proposal: ${proposal.proposal}`);
      logger.log('');
      logger.log('## Quotes');
      for (const q of (proposal.quotes || [])) logger.log(`- "${q}"`);
    }
    return { ok: true, kind: 'proposal' };
  }

  const err = `op:show — '${slug}' not found in decisions/ or proposals/ for identity ${resolved.identity}.`;
  if (options.json) return { ok: false, error: err };
  if (logger && logger.error) logger.error(err);
  return { ok: false, exitCode: 1, error: err };
}

module.exports = { runOpShow };
