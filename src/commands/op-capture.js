'use strict';

/**
 * aioson op:capture — record a standing-decision signal (Phase 2, v1.13.0).
 *
 * Usage:
 *   aioson op:capture --signal=authorization --quote="..." --proposal="..." --source-agent=dev
 *
 * Flow (architecture-operator-memory.md § Phase 2 capture pipeline):
 *   1. Validate --signal in {authorization, exclusion, correction, confirmation}
 *   2. Resolve identity (Phase 1)
 *   3. deriveSlug(--proposal) — deterministic kebab + truncate
 *   4. Check proposals/{slug}.md:
 *      - absent: write proposal with detected_count=1, exit 0 silent
 *      - present: detected_count++
 *        - count >= 2: promoteProposal (atomic) + stdout audit line
 *        - count < 2: update proposal, exit 0 silent
 *   5. Telemetry op_capture before file write
 */

const fs = require('node:fs');
const path = require('node:path');
const { resolveIdentity } = require('../operator-memory/identity');
const { ensureStorageTree, recordIdentityActivity, openIndexDb, getStorageRoot } = require('../operator-memory/storage');
const { deriveSlug, fingerprintProposal } = require('../operator-memory/slug');
const { captureSignal, readProposal, VALID_SIGNAL_TYPES } = require('../operator-memory/proposal');
const { promoteProposal } = require('../operator-memory/decision');
const { emitDossierEvent } = require('../lib/dossier-telemetry');

const CONFIRMATIONS_JSONL = '.aioson/runtime/session-confirmations.jsonl';

const PROMOTION_THRESHOLD = 2;

function existsCheckFactory(identity) {
  return (slug) => {
    const existing = readProposal(identity, slug);
    if (!existing) return null;
    return existing.proposal_fingerprint || fingerprintProposal(existing.proposal || '');
  };
}

async function runOpCapture({ args = [], options = {}, logger }) {
  const targetDir = process.cwd();
  const helpRequested = options.help === true || args.includes('--help') || args.includes('-h');
  if (helpRequested) {
    const msg = `op:capture — capture a standing-decision signal into the proposals queue.
Usage:
  aioson op:capture --signal=<type> --quote=<verbatim> --proposal=<paraphrase> --source-agent=<agent>
Signal types: ${VALID_SIGNAL_TYPES.join(', ')}
First detection writes to proposals/{slug}.md. Second detection promotes to decisions/{slug}.md atomically.`;
    if (options.json) return { ok: true, help: true };
    if (logger) logger.log(msg);
    return { ok: true };
  }

  const signal = options.signal;
  const quote = options.quote;
  const proposal = options.proposal;
  const sourceAgent = options['source-agent'] || options.sourceAgent || 'unknown';
  const featureSlug = options.feature ? String(options.feature) : null;
  const sessionId = options['session-id'] || options.sessionId || null;

  if (!signal || !proposal) {
    const err = `op:capture — required: --signal=<type> --proposal=<paraphrase>. Got signal=${signal}, proposal=${proposal ? 'present' : 'missing'}.`;
    if (options.json) return { ok: false, error: err };
    if (logger && logger.error) logger.error(err);
    return { ok: false, exitCode: 1, error: err };
  }
  if (!VALID_SIGNAL_TYPES.includes(signal)) {
    const err = `op:capture — invalid --signal='${signal}'. Must be one of: ${VALID_SIGNAL_TYPES.join(', ')}.`;
    if (options.json) return { ok: false, error: err };
    if (logger && logger.error) logger.error(err);
    return { ok: false, exitCode: 1, error: err };
  }

  const resolved = resolveIdentity();
  ensureStorageTree(resolved.identity);
  const db = openIndexDb();
  try {
    recordIdentityActivity(db, { identity: resolved.identity, source: resolved.source });
  } finally {
    db.close();
  }

  const slug = deriveSlug(proposal, existsCheckFactory(resolved.identity));

  await emitDossierEvent(targetDir, {
    agent: 'op-capture',
    type: 'op_capture',
    summary: `${signal}: ${slug}`,
    meta: { identity_prefix: resolved.identity.slice(0, 8), signal_type: signal, slug, source_agent: sourceAgent }
  });

  let result;
  try {
    result = captureSignal({
      identity: resolved.identity,
      slug,
      signal_type: signal,
      quote,
      proposal,
      source_agent: sourceAgent,
      feature_slug: featureSlug,
      session_id: sessionId
    });
  } catch (err) {
    const errMsg = `op:capture failed: ${err.message}`;
    if (options.json) return { ok: false, error: errMsg };
    if (logger && logger.error) logger.error(errMsg);
    return { ok: false, exitCode: 1, error: errMsg };
  }

  // M2: append confirmation signals to session accumulator for decision_rationale
  if (signal === 'confirmation') {
    try {
      const accPath = path.join(targetDir, CONFIRMATIONS_JSONL);
      const accDir = path.dirname(accPath);
      fs.mkdirSync(accDir, { recursive: true });
      const entry = JSON.stringify({
        agent: sourceAgent,
        decision: proposal,
        quote: quote || null,
        timestamp: new Date().toISOString()
      });
      fs.appendFileSync(accPath, entry + '\n', 'utf8');
    } catch {
      // best-effort — never block op:capture
    }
  }

  const count = result.proposal.detected_count;

  if (count >= PROMOTION_THRESHOLD) {
    // Promote to decision
    let decision;
    try {
      decision = promoteProposal({ identity: resolved.identity, proposal: result.proposal });
    } catch (err) {
      const errMsg = `op:capture promotion failed: ${err.message}`;
      if (options.json) return { ok: false, error: errMsg };
      if (logger && logger.error) logger.error(errMsg);
      return { ok: false, exitCode: 1, error: errMsg };
    }

    await emitDossierEvent(targetDir, {
      agent: 'op-capture',
      type: 'op_promote',
      summary: `promoted ${slug} (${signal})`,
      meta: { identity_prefix: resolved.identity.slice(0, 8), slug, signal_type: signal, category: decision.category }
    });

    const auditLine = `✔ Memory: '${proposal}'. aioson op:forget ${slug} p/ desfazer.`;
    if (options.json) {
      return { ok: true, promoted: true, slug, identity: resolved.identity, category: decision.category };
    }
    if (logger) logger.log(auditLine);
    return { ok: true, promoted: true, slug };
  }

  // First detection (or below threshold) — silent
  if (options.json) {
    return { ok: true, promoted: false, slug, detected_count: count, identity: resolved.identity };
  }
  return { ok: true, promoted: false, slug, detected_count: count };
}

module.exports = {
  runOpCapture,
  PROMOTION_THRESHOLD,
  CONFIRMATIONS_JSONL
};
