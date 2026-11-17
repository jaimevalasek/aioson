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
 *   3. deriveSlug(--proposal) — deterministic kebab + truncate; no entry there,
 *      then the decision or proposal of the same signal saying the same thing
 *      in other words (equivalence.js) — a repeat is a repeat however worded
 *   4. Check proposals/{slug}.md:
 *      - absent: write proposal with detected_count=1
 *      - present: detected_count++
 *        - exclusion/correction: promote on detection 1
 *        - authorization: on detection 1 when the quote says it is standing
 *          (standing.js), else on its repeat
 *        - confirmation: promote on detection 2
 *   5. Telemetry op_capture before file write
 *   6. Once a day, the store's upkeep (housekeeping.js)
 *
 * Steps 3-6 hold the store lock (store-lock.js): two captures at once count
 * one repeat each, never one between them, and the sweep never archives a
 * proposal a capture just renewed.
 */

const fs = require('node:fs');
const path = require('node:path');
const { positionalArgs, commandFailure, openCommand, commandIdentity, projectTranslator } = require('../operator-memory/command-context');
const { recordIdentityActivity, openIndexDb } = require('../operator-memory/storage');
const { deriveSlug, fingerprintProposal } = require('../operator-memory/slug');
const { captureSignal, readProposal, deleteProposal, VALID_SIGNAL_TYPES } = require('../operator-memory/proposal');
const { promoteProposal, readDecision, reinforceDecision, applyProjectScope, decisionStatement } = require('../operator-memory/decision');
const { resolveProjectScope, namesCrossProjectScope, projectSets, recordProject, VALID_SCOPES, SCOPE_OPERATOR, SCOPE_PROJECT } = require('../operator-memory/project-scope');
const { findEquivalent } = require('../operator-memory/equivalence');
const { hasStandingProof } = require('../operator-memory/standing');
const { awaitsAdoption } = require('../operator-memory/archive');
const { sweepStore } = require('../operator-memory/housekeeping');
const { withStoreLock, isLockTimeout } = require('../operator-memory/store-lock');
const { emitDossierEvent } = require('../lib/dossier-telemetry');

const CONFIRMATIONS_JSONL = '.aioson/runtime/session-confirmations.jsonl';

const PROMOTION_THRESHOLD = 2;

/**
 * Detections required before a signal promotes to a decision, by signal type
 * and by what the user's own words (`quotes`) say.
 *
 * `confirmation` needs 2x — the user accepting the same non-obvious approach twice
 * is what turns it into a signal. `exclusion` / `correction` promote on the first
 * detection: forgetting a prohibition is a failure the agent cannot see.
 * `authorization` promotes at once only when the quote carries a standing marker
 * ("pode sempre X", "daqui pra frente", "não precisa perguntar"); a bare "sim" or
 * a picked option is a one-time answer, and waits for its repeat — forgetting a
 * permission only costs a question. Mirrors the taxonomy in
 * agents/_shared/memory-capture-directive.md.
 */
function promotionThresholdFor(signalType, quotes = []) {
  if (signalType === 'confirmation') return PROMOTION_THRESHOLD;
  if (signalType === 'authorization' && !hasStandingProof(quotes, signalType)) return PROMOTION_THRESHOLD;
  return 1;
}

/**
 * Whether a match by meaning under the strong bar may take this signal. Two
 * sentences that close can still name two things (equivalence.js), and the
 * costly mistake is carrying one project's words into another — a second
 * project is what widens a decision to every project. So a loose match joins
 * only an entry already seen where the signal is said: it never records a new
 * project, never adopts a pre-scope decision into one, and never brings words
 * that name every project. Otherwise the signal stands on its own.
 */
function looseMatchStaysPut(identity, match, project, quote) {
  if (namesCrossProjectScope([quote])) return false;
  const entry = match.kind === 'decision' ? readDecision(identity, match.slug) : readProposal(identity, match.slug);
  if (!entry) return false;
  return recordProject(entry, project).sets.length === projectSets(entry).length;
}

// The text already at `slug`, as a fingerprint: a slug keeps the first 40
// characters of a paraphrase, so two different sentences can share one. Only
// the same text is an exact repeat; another one at a taken slug gets its own
// (`-2`) and is compared by meaning, under its guards (equivalence.js).
function existsCheckFactory(identity) {
  return (slug) => {
    const existing = readProposal(identity, slug);
    if (existing) {
      // The frontmatter parser reads an all-digit fingerprint as a Number (leading
      // zeros lost): back to its 12 hex characters, or the repeat forks a `-2` slug.
      return existing.proposal_fingerprint ? String(existing.proposal_fingerprint).padStart(12, '0') : fingerprintProposal(existing.proposal || '');
    }
    const decision = readDecision(identity, slug);
    return decision ? fingerprintProposal(decisionStatement(decision)) : null;
  };
}

async function runOpCapture({ args = [], options = {}, logger, t = null }) {
  const helpRequested = options.help === true || args.includes('--help') || args.includes('-h');
  if (helpRequested) {
    const msg = `op:capture — capture a standing-decision signal into the proposals queue.
Usage:
  aioson op:capture [path] --signal=<type> --quote=<verbatim> --proposal=<paraphrase> --source-agent=<agent> [--scope=operator|project]
Signal types: ${VALID_SIGNAL_TYPES.join(', ')}
Exclusion and correction promote on their first detection. Confirmation promotes on its second.
Authorization promotes on its first detection only when the verbatim quote says it is standing ("sempre", "daqui pra frente", "não precisa perguntar", "from now on", or naming every project) and does not bound itself to the moment ("agora", "essa tarefa", "this once"); otherwise it waits for its repeat (held: awaiting_repeat).
A repeat is recognized in other words (matched_by: meaning) unless it negates, reverses or swaps the object of what was said; only a close match carries it into another project.
A decision applies only in the project it was said in until it is detected in a second project or its quote says it covers every project; --scope sets it explicitly.`;
    if (options.json) return { ok: true, help: true };
    if (logger) logger.log(msg);
    return { ok: true };
  }

  // The project is the `[path]` argument's, the working directory only without one.
  const where = openCommand('op:capture', positionalArgs(args)[0], options, logger);
  if (where.failure) return where.failure;
  const targetDir = where.dir;

  const signal = options.signal;
  const quote = options.quote;
  const proposal = options.proposal;
  const sourceAgent = options['source-agent'] || options.sourceAgent || 'unknown';
  const featureSlug = options.feature ? String(options.feature) : null;
  const sessionId = options['session-id'] || options.sessionId || null;

  if (!signal || !proposal) {
    return commandFailure(options, logger, `op:capture — required: --signal=<type> --proposal=<paraphrase>. Got signal=${signal}, proposal=${proposal ? 'present' : 'missing'}.`);
  }
  if (!VALID_SIGNAL_TYPES.includes(signal)) {
    return commandFailure(options, logger, `op:capture — invalid --signal='${signal}'. Must be one of: ${VALID_SIGNAL_TYPES.join(', ')}.`);
  }
  const requestedScope = options.scope == null ? null : String(options.scope);
  if (requestedScope !== null && !VALID_SCOPES.includes(requestedScope)) {
    return commandFailure(options, logger, `op:capture — invalid --scope='${requestedScope}'. Must be one of: ${VALID_SCOPES.join(', ')}.`);
  }
  let project;
  try { project = resolveProjectScope(targetDir); } catch { project = null; }
  // A project scope needs a project to bind to — an AIOSON root or a git
  // checkout, never whatever folder the shell stands in; falling back to
  // operator-wide would widen exactly the memory the caller asked to keep local.
  if (requestedScope === SCOPE_PROJECT && !(project && project.anchored)) {
    return commandFailure(options, logger, `op:capture — --scope=project needs a project (an AIOSON root or a git checkout), and none could be identified from ${targetDir}.`);
  }

  const resolved = commandIdentity(targetDir);
  const db = openIndexDb();
  try {
    recordIdentityActivity(db, { identity: resolved.identity, source: resolved.source });
  } finally {
    db.close();
  }

  const signalInput = { resolved, targetDir, signal, quote, proposal, sourceAgent, featureSlug, sessionId, requestedScope, project };
  try {
    return await withStoreLock(resolved.identity, () => captureLocked(signalInput, { options, logger, t }));
  } catch (err) {
    if (!isLockTimeout(err)) throw err;
    return commandFailure(options, logger, `op:capture failed: ${err.message}`);
  }
}

/**
 * The slug the signal lands on: its own, else the decision or proposal saying
 * the same in other words — unless a loose match would carry it elsewhere.
 */
function resolveSlug({ resolved, signal, quote, proposal, project }) {
  const slug = deriveSlug(proposal, existsCheckFactory(resolved.identity));
  // The paraphrase is the agent's words, new every session: with nothing at
  // its exact slug, the same signal said differently is still a repeat.
  if (readDecision(resolved.identity, slug) || readProposal(resolved.identity, slug)) return { slug, meaning: {} };
  let equivalent;
  try { equivalent = findEquivalent(resolved.identity, { signalType: signal, proposal }); } catch { equivalent = null; }
  if (equivalent && !equivalent.strong && !looseMatchStaysPut(resolved.identity, equivalent, project, quote)) equivalent = null;
  if (!equivalent) return { slug, meaning: {} };
  return { slug: equivalent.slug, meaning: { matched_by: 'meaning', similarity: equivalent.score } };
}

// M2: append confirmation signals to session accumulator for decision_rationale
function logConfirmation({ targetDir, sourceAgent, proposal, quote }) {
  try {
    const accPath = path.join(targetDir, CONFIRMATIONS_JSONL);
    fs.mkdirSync(path.dirname(accPath), { recursive: true });
    const entry = JSON.stringify({ agent: sourceAgent, decision: proposal, quote: quote || null, timestamp: new Date().toISOString() });
    fs.appendFileSync(accPath, entry + '\n', 'utf8');
  } catch {
    // best-effort — never block op:capture
  }
}

function say(input, io, key, params) {
  if (io.logger) io.logger.log((io.t || projectTranslator(input.targetDir, io.options))(key, params));
}

/**
 * Idempotent re-detection: a signal already promoted to a decision is reinforced,
 * not re-promoted — re-promotion would duplicate the FTS row and reset promoted_at.
 */
function reinforceExisting(input, io, slug, existingDecision, meaning) {
  const { resolved, quote, proposal, requestedScope, project } = input;
  // A pre-scope decision never shown to be standing loaded in every project
  // until now; said again, it belongs to the project it was said in (or to
  // every project, when the words say so) — and widens on a second project.
  // A repeat in a folder with no project could not place it, so a later
  // repeat in a project still can.
  const adopted = !requestedScope && awaitsAdoption(existingDecision) && Boolean(project && project.anchored);
  const scopeRequest = requestedScope || (adopted ? (namesCrossProjectScope([quote]) ? SCOPE_OPERATOR : SCOPE_PROJECT) : null);
  let reinforced = null;
  try { reinforced = reinforceDecision(resolved.identity, slug, { quote }); } catch { /* best-effort */ }
  // captureSignal re-created a stray proposal (the decision had none) — drop it.
  try { deleteProposal(resolved.identity, slug); } catch { /* best-effort */ }
  let scoped = null;
  try { scoped = applyProjectScope(resolved.identity, slug, { project, quote, requested: scopeRequest }); } catch { /* best-effort */ }
  if (io.options.json) {
    return {
      ok: true,
      promoted: false,
      reinforced: true,
      slug,
      identity: resolved.identity,
      reinforcement_count: reinforced ? reinforced.reinforcement_count : undefined,
      scope: scoped ? scoped.scope : undefined,
      ...(adopted ? { adopted: true } : {}),
      ...meaning
    };
  }
  // Only a real move from one project to every project is news; an
  // operator-wide decision seen in one more project is not. The line a person
  // reads, in the project's language.
  const widened = Boolean(scoped && scoped.changed && scoped.previous === SCOPE_PROJECT && scoped.scope === SCOPE_OPERATOR);
  say(input, io, `cli.operator_memory.${widened ? 'reinforced_widened' : 'reinforced'}`, { proposal, slug });
  return { ok: true, promoted: false, reinforced: true, slug };
}

async function promote(input, io, slug, proposalRecord, meaning) {
  const { resolved, signal, proposal, requestedScope, project, targetDir } = input;
  let decision;
  try {
    decision = promoteProposal({ identity: resolved.identity, proposal: proposalRecord, scope: requestedScope });
  } catch (err) {
    return commandFailure(io.options, io.logger, `op:capture promotion failed: ${err.message}`);
  }
  await emitDossierEvent(targetDir, {
    agent: 'op-capture',
    type: 'op_promote',
    summary: `promoted ${slug} (${signal})`,
    meta: { identity_prefix: resolved.identity.slice(0, 8), slug, signal_type: signal, category: decision.category }
  });
  if (io.options.json) {
    return { ok: true, promoted: true, slug, identity: resolved.identity, category: decision.category, scope: decision.scope || 'operator', ...meaning };
  }
  const onlyHere = decision.scope === SCOPE_PROJECT && project;
  say(input, io, `cli.operator_memory.${onlyHere ? 'saved_here' : 'saved'}`, { proposal, slug, project: onlyHere ? project.name : '' });
  return { ok: true, promoted: true, slug };
}

/**
 * Below its threshold. A confirmation waits in silence, as it always has; an
 * authorization held for want of a standing word says so, or the agent
 * would tell the user it was remembered.
 */
function hold(input, io, slug, count, meaning) {
  const held = input.signal === 'authorization';
  if (io.options.json) {
    return { ok: true, promoted: false, slug, detected_count: count, identity: input.resolved.identity, ...(held ? { held: 'awaiting_repeat' } : {}), ...meaning };
  }
  if (held) say(input, io, 'cli.operator_memory.held', { proposal: input.proposal, slug });
  return { ok: true, promoted: false, slug, detected_count: count, ...(held ? { held: 'awaiting_repeat' } : {}) };
}

/** Steps 3-6 of the flow, inside the store lock. */
async function captureLocked(input, io) {
  const { resolved, targetDir, signal, quote, proposal, sourceAgent, featureSlug, sessionId, project } = input;
  const { slug, meaning } = resolveSlug(input);
  try { sweepStore(resolved.identity); } catch { /* upkeep never fails a capture */ }

  await emitDossierEvent(targetDir, {
    agent: 'op-capture',
    type: 'op_capture',
    summary: `${signal}: ${slug}`,
    meta: { identity_prefix: resolved.identity.slice(0, 8), signal_type: signal, slug, source_agent: sourceAgent }
  });

  let result;
  try {
    result = captureSignal({
      identity: resolved.identity, slug, signal_type: signal, quote, proposal,
      source_agent: sourceAgent, feature_slug: featureSlug, session_id: sessionId, project
    });
  } catch (err) {
    return commandFailure(io.options, io.logger, `op:capture failed: ${err.message}`);
  }
  if (signal === 'confirmation') logConfirmation(input);
  const count = result.proposal.detected_count;

  // `_anonymous` is a diagnostic fallback, not a stable operator identity.
  // Keep captured evidence in its proposal queue, but never turn it into a
  // standing decision that another anonymous session could load.
  if (resolved.source === 'anonymous-fallback') {
    const reason = { ok: true, promoted: false, slug, detected_count: count, reason: 'identity_unresolved' };
    return io.options.json ? { ...reason, identity: resolved.identity, warning: resolved.warning } : reason;
  }

  const existingDecision = readDecision(resolved.identity, slug);
  if (existingDecision) return reinforceExisting(input, io, slug, existingDecision, meaning);
  if (count >= promotionThresholdFor(signal, result.proposal.quotes)) return promote(input, io, slug, result.proposal, meaning);
  return hold(input, io, slug, count, meaning);
}

module.exports = {
  runOpCapture,
  promotionThresholdFor,
  PROMOTION_THRESHOLD,
  CONFIRMATIONS_JSONL
};
