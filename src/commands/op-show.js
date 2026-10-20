'use strict';

/**
 * aioson op:show [path] <slug> — print a single decision body + frontmatter (Phase 3, v1.14.0).
 */

const fs = require('node:fs');
const { commandProject, pathAndSlug, identityFor } = require('../operator-memory/command-context');
const { ensureStorageTree } = require('../operator-memory/storage');
const { readDecision, decisionPath } = require('../operator-memory/decision');
const { readProposal } = require('../operator-memory/proposal');

async function runOpShow({ args = [], options = {}, logger }) {
  const { rawPath, slug } = pathAndSlug(args);

  if (options.help === true || args.includes('--help') || args.includes('-h')) {
    if (logger) logger.log('op:show [path] <slug> — print a single decision (frontmatter + body). --json for structured output.');
    return { ok: true };
  }

  const where = slug ? commandProject(rawPath) : {};
  if (!slug || where.error) {
    const err = where.error ? `op:show — ${where.error}.` : 'op:show — required argument: <slug>. Usage: aioson op:show [path] <slug>';
    if (options.json) return { ok: false, error: err };
    if (logger && logger.error) logger.error(err);
    return { ok: false, exitCode: 1, error: err };
  }

  const resolved = identityFor(where.dir);
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
