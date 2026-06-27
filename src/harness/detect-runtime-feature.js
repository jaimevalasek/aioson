'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * Deterministically detect whether a feature ships a runtime surface, using
 * ONLY signals the framework can locate reliably:
 *
 *   - a prototype-manifest (`.aioson/briefings/{slug}/prototype-manifest.md`)
 *     ⇒ a clickable prototype whose Core interactions must work on the real
 *     stack (the flow-deck failure class);
 *   - a migration / Prisma path among `progress.completed_steps` ⇒ a DB feature
 *     whose migrations must actually apply.
 *
 * The Play `manifest.json` `has_api` flag lives in the TARGET app and is not
 * reliably locatable from the framework, so that trigger stays with the LLM
 * @validator (harness-contract.md §2c). A `false` result here means "no reliable
 * runtime signal", NOT "proven non-runtime" — callers treat it conservatively.
 */

// Path segments / extensions that reliably indicate database migration work.
const MIGRATION_HINTS = [
  /(?:^|[\\/])migrations?(?:[\\/]|$)/i,
  /(?:^|[\\/])prisma(?:[\\/]|$)/i,
  /\.prisma$/i,
  /(?:^|[\\/])migrate[^\\/]*$/i
];

function looksLikeMigration(step) {
  const value = String(step || '');
  return MIGRATION_HINTS.some((re) => re.test(value));
}

function detectRuntimeFeature(targetDir, slug, options = {}) {
  const signals = [];

  if (slug) {
    try {
      const protoManifest = path.join(
        targetDir, '.aioson', 'briefings', String(slug), 'prototype-manifest.md'
      );
      if (fs.existsSync(protoManifest)) signals.push('prototype-manifest');
    } catch {
      /* ignore — detection is best-effort */
    }
  }

  const completedSteps = Array.isArray(options.completedSteps) ? options.completedSteps : [];
  if (completedSteps.some(looksLikeMigration)) signals.push('migrations');

  return { isRuntimeFeature: signals.length > 0, signals };
}

module.exports = { detectRuntimeFeature, looksLikeMigration };
