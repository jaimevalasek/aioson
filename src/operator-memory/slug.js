'use strict';

/**
 * operator-memory — deterministic slug derivation (Phase 2, v1.13.0).
 *
 * Same proposal text → same slug. Collision suffix appended if slug already
 * taken by a different proposal text (sha256 fingerprint comparison).
 *
 * AC-P2-02: derivation is deterministic + collision-safe.
 */

const crypto = require('node:crypto');

const MAX_SLUG_LENGTH = 40;
// Canonical slug alphabet — mirrors deriveSlug output (lowercase alnum + dash,
// 40-char base + collision suffixes). Enforced at the filesystem boundary
// (decisionPath/historyPath/proposalPath) so CLI-supplied slugs can never
// traverse outside the operator storage root.
const DECISION_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,80}$/;

function isValidDecisionSlug(value) {
  return typeof value === 'string' && DECISION_SLUG_PATTERN.test(value);
}
const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'to', 'for', 'in', 'on', 'with', 'is', 'be',
  'que', 'de', 'em', 'para', 'sem', 'com', 'um', 'uma', 'os', 'as', 'no', 'na'
]);

function normalize(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')           // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9\s-]+/g, ' ')             // non-alnum -> space
    .split(/\s+/)
    .filter((w) => w && !STOPWORDS.has(w))
    .join('-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function truncateAtBoundary(slug, max) {
  if (slug.length <= max) return slug;
  const sliced = slug.slice(0, max);
  const lastDash = sliced.lastIndexOf('-');
  if (lastDash > max * 0.6) {
    return sliced.slice(0, lastDash);
  }
  return sliced;
}

function fingerprintProposal(text) {
  return crypto.createHash('sha256').update(String(text || '').trim()).digest('hex').slice(0, 12);
}

/**
 * Derive a slug from a proposal text.
 *
 * @param {string} proposalText — the canonical proposal paraphrase
 * @param {(slug: string) => string|null} existsCheck — optional callback returning
 *   the existing proposal's fingerprint for `slug` if taken, or null. Used to
 *   detect same-slug-different-text collisions.
 * @returns {string} slug
 */
function deriveSlug(proposalText, existsCheck = null) {
  const normalized = normalize(proposalText);
  const base = normalized === '' ? 'untitled' : truncateAtBoundary(normalized, MAX_SLUG_LENGTH);
  const proposalFingerprint = fingerprintProposal(proposalText);

  if (typeof existsCheck !== 'function') {
    return base;
  }

  let candidate = base;
  let counter = 2;
  while (counter < 100) {
    const existingFingerprint = existsCheck(candidate);
    if (existingFingerprint === null || existingFingerprint === undefined) {
      // slug available
      return candidate;
    }
    if (existingFingerprint === proposalFingerprint) {
      // same proposal text — reuse slug (idempotent capture)
      return candidate;
    }
    // collision: different proposal at same slug — append counter
    candidate = `${base}-${counter}`;
    counter += 1;
  }
  // extreme collision fallback (should never hit in practice)
  return `${base}-${proposalFingerprint.slice(0, 8)}`;
}

module.exports = {
  deriveSlug,
  normalize,
  fingerprintProposal,
  isValidDecisionSlug,
  MAX_SLUG_LENGTH
};
