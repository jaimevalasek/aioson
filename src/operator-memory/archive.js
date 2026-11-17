'use strict';

/**
 * operator-memory — which decisions leave the session-start recall.
 *
 * The archive tier is a reading of each decision, not a move: the file stays
 * in decisions/, `op:show` and `op:list --include-archived` still read it, and
 * a re-detection that reinforces it brings it back on its own. Two reasons:
 *
 * - `unproven`: a decision saved before decisions carried a project scope,
 *   never reinforced, whose quotes hold no standing marker (standing.js). Such
 *   decisions loaded in every project; on a real store 456 of its 522 were one
 *   project's screen feedback or a one-time "sim". A first re-detection adopts
 *   it into the project it was said in (op:capture).
 * - `stale`: a permission (authorization, confirmation) not reinforced for two
 *   of its category's half-lives. Prohibitions (exclusion, correction) never
 *   age out: one the agents obey is never said again, so it is never
 *   reinforced, and forgetting it is a failure nobody sees.
 *
 * Identity decisions (style, language, verbosity) never archive (PMD-04).
 */

const ARCHIVE_AFTER_HALF_LIVES = 2;
const AGING_SIGNALS = new Set(['authorization', 'confirmation']);
const PROOF_SIGNALS = new Set(['authorization', 'exclusion', 'correction']);

// From this moment every promotion of this CLI writes `scope`. A decision
// without one promoted earlier is pre-scope; one promoted later came from an
// older CLI still sharing the store (`op:promote` of 1.81.0 answered "scope:
// operator" and wrote none), so it keeps that writer's meaning — operator-wide
// — instead of being archived the moment it was saved. A missing or unreadable
// date is read as old: that is what an old file looks like.
const SCOPE_ALWAYS_WRITTEN_SINCE = Date.parse('2026-11-17T04:01:04Z');

/** True for a decision saved before decisions carried a scope. */
function isLegacy(decision) {
  if (!decision || decision.scope) return false;
  const promoted = new Date(decision.promoted_at || NaN).getTime();
  return !(promoted >= SCOPE_ALWAYS_WRITTEN_SINCE);
}

/** A pre-scope decision whose own quotes hold no standing marker (the reinforcement count aside). */
function lacksStandingWords(decision) {
  if (!isLegacy(decision) || decision.category === 'identity') return false;
  if (!PROOF_SIGNALS.has(decision.signal_type)) return false;
  const { hasStandingProof } = require('./standing');
  return !hasStandingProof(decision.quotes || [], decision.signal_type);
}

/** A pre-scope decision the user's words never showed to be standing. */
function isUnprovenLegacy(decision) {
  if (!lacksStandingWords(decision)) return false;
  return !(Number(decision.reinforcement_count) > 0);
}

/**
 * A pre-scope decision whose project is still unknown: no standing words,
 * reinforced or not. Said again in an identifiable project, op:capture adopts
 * it there. A repeat in a folder with no project reinforces it but cannot
 * place it, so the next repeat in a project still can.
 */
function awaitsAdoption(decision) {
  return lacksStandingWords(decision);
}

/** 'unproven' | 'stale' | null — why a decision is out of the recall. */
function archiveReason(decision, now = Date.now()) {
  if (!decision || decision.category === 'identity') return null;
  if (isUnprovenLegacy(decision)) return 'unproven';
  if (AGING_SIGNALS.has(decision.signal_type)) {
    const { halfLifeForCategory, daysSinceReinforced } = require('./decay');
    const days = daysSinceReinforced(decision, now);
    if (days >= ARCHIVE_AFTER_HALF_LIVES * halfLifeForCategory(decision.category || 'default')) return 'stale';
  }
  return null;
}

module.exports = { archiveReason, isUnprovenLegacy, isLegacy, awaitsAdoption, ARCHIVE_AFTER_HALF_LIVES, SCOPE_ALWAYS_WRITTEN_SINCE };
