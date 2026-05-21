'use strict';

/**
 * operator-memory — hard cap enforcement (Phase 5, v1.16.0).
 *
 * PMD-04: 10k memories per operator identity. When op:promote would push
 * count > cap, prune oldest non-identity decisions first; identity-category
 * decisions are NEVER auto-pruned.
 *
 * Override cap for tests via AIOSON_OPERATOR_MAX_DECISIONS env var.
 */

const fs = require('node:fs');
const path = require('node:path');
const { getStorageRoot } = require('./storage');
const { readDecision, decisionPath, historyPath, forgetEntry } = require('./decision');
const { listDecisionSlugs } = require('./index-md');

const DEFAULT_MAX_DECISIONS = 10_000;

function getMaxDecisions() {
  const override = process.env.AIOSON_OPERATOR_MAX_DECISIONS;
  if (override && !Number.isNaN(Number(override))) {
    return Number(override);
  }
  return DEFAULT_MAX_DECISIONS;
}

/**
 * Count active decisions for an identity.
 */
function countDecisions(identity) {
  return listDecisionSlugs(identity).length;
}

/**
 * Identify pruning candidates: non-identity-category decisions sorted by
 * last_reinforced ASC (oldest first).
 *
 * @param {number} need — number of pruning slots needed
 * @returns {Array<{slug, category, last_reinforced}>}
 */
function pickPruneCandidates(identity, need) {
  if (need <= 0) return [];
  const slugs = listDecisionSlugs(identity);
  const candidates = [];
  for (const slug of slugs) {
    const d = readDecision(identity, slug);
    if (!d) continue;
    if (d.category === 'identity') continue; // PMD-04: never auto-prune identity
    candidates.push({ slug, category: d.category, last_reinforced: d.last_reinforced || d.promoted_at });
  }
  candidates.sort((a, b) => String(a.last_reinforced || '').localeCompare(String(b.last_reinforced || '')));
  return candidates.slice(0, need);
}

/**
 * Enforce hard cap before allowing an op:promote to proceed.
 * Returns array of pruned slug names (empty when under cap).
 */
function enforceCap(identity, options = {}) {
  const cap = options.cap || getMaxDecisions();
  const current = countDecisions(identity);
  if (current < cap) return [];
  const need = current - cap + 1; // +1 to make room for the incoming promote
  const candidates = pickPruneCandidates(identity, need);
  const pruned = [];
  for (const c of candidates) {
    const result = forgetEntry(identity, c.slug);
    if (result.mode === 'decision') pruned.push(c.slug);
  }
  return pruned;
}

module.exports = {
  enforceCap,
  countDecisions,
  pickPruneCandidates,
  getMaxDecisions,
  DEFAULT_MAX_DECISIONS
};
