'use strict';

/**
 * aioson feature:current — resolve the active feature slug deterministically.
 *
 * Single source of truth for "which feature is active right now", so every spec
 * agent (product, sheldon, planner, and any optional specialist)
 * resolves the SAME {slug} instead of re-guessing and colliding on bare paths
 * (design-doc.md, readiness.md, scope-check.md, ui-spec.md, sheldon-enrichment.md).
 *
 * Resolution order:
 *   1. project-pulse.md `active_feature` (when set and not the `(none)` sentinel)
 *   2. the single `in_progress` row in features.md (unambiguous fallback)
 *   3. empty — genuine project-level work, no active feature
 *
 * When more than one feature is `in_progress`, the result is `ambiguous`: no slug
 * is guessed, and the caller must disambiguate (ask the user) rather than
 * silently overwrite another feature's artifact.
 *
 * Usage:
 *   aioson feature:current .            # prints the slug (or nothing) to stdout
 *   aioson feature:current . --json     # { ok, slug, source, ambiguous, candidates }
 */

const path = require('node:path');
const { readProjectPulse, parseFeaturesMap, readFileSafe, contextDir } = require('../preflight-engine');

// Values that mean "no active feature" rather than a real slug.
const NONE_SENTINELS = new Set(['', '(none)', 'none', 'null', '-', 'n/a']);

function normalizeSlug(value) {
  return String(value == null ? '' : value).trim();
}

function isNone(value) {
  return NONE_SENTINELS.has(normalizeSlug(value).toLowerCase());
}

async function resolveActiveFeature(targetDir) {
  // 1. project-pulse.md active_feature — the single source of truth maintained
  //    by pulse:update and reset by feature:close.
  const pulse = await readProjectPulse(targetDir);
  if (pulse && pulse.exists && !isNone(pulse.active_feature)) {
    return { slug: normalizeSlug(pulse.active_feature), source: 'pulse', ambiguous: false, candidates: [] };
  }

  // 2. features.md — fall back to the unique in_progress row.
  const featuresContent = await readFileSafe(path.join(contextDir(targetDir), 'features.md'));
  const map = parseFeaturesMap(featuresContent);
  const inProgress = [];
  for (const [slug, status] of map.entries()) {
    if (normalizeSlug(status).toLowerCase() === 'in_progress' && !inProgress.includes(slug)) {
      inProgress.push(slug);
    }
  }
  if (inProgress.length === 1) {
    return { slug: inProgress[0], source: 'features.md', ambiguous: false, candidates: [] };
  }
  if (inProgress.length > 1) {
    // Ambiguous: more than one feature is open. The caller must disambiguate
    // (ask the user) rather than silently colliding on a guessed slug.
    return { slug: '', source: 'features.md', ambiguous: true, candidates: inProgress };
  }

  // 3. No active feature — genuine project-level work.
  return { slug: '', source: 'none', ambiguous: false, candidates: [] };
}

async function runFeatureCurrent({ args = [], options = {}, logger = console } = {}) {
  const targetDir = args[0] || options.dir || '.';
  const resolved = await resolveActiveFeature(targetDir);
  const payload = { ok: true, ...resolved };

  if (!options.json) {
    // Plain mode prints ONLY the slug so `$(aioson feature:current .)` is
    // directly usable in shell substitution; ambiguous/none print nothing.
    if (resolved.slug) logger.log(resolved.slug);
  }
  return payload;
}

module.exports = { runFeatureCurrent, resolveActiveFeature };
