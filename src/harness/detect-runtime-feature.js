'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

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
  /(?:^|[\\/])migrate(?:[\\/]|$)/i
];

function looksLikeMigration(step) {
  const value = String(step || '');
  return MIGRATION_HINTS.some((re) => re.test(value));
}

/**
 * The set of paths git considers changed in the working tree: unstaged,
 * staged, and untracked-but-not-ignored. Read-only and best-effort — a
 * non-git project (or any git failure) yields `[]`, so callers degrade to
 * prototype/progress-based detection. Lives here (not only in the gate) so
 * the standalone `aioson harness:check` detects the same migration surface
 * the workflow finalize / feature:close gate does.
 */
function gitChangedFiles(targetDir) {
  const files = new Set();
  const commands = [
    ['diff', '--name-only'],
    ['diff', '--name-only', '--cached'],
    ['ls-files', '--others', '--exclude-standard']
  ];
  for (const args of commands) {
    try {
      const output = execFileSync('git', args, {
        cwd: targetDir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      });
      for (const line of output.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (trimmed) files.add(trimmed);
      }
    } catch {
      // Non-git projects still get prototype/progress based detection.
    }
  }
  return [...files];
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
  const changedFiles = Array.isArray(options.changedFiles) ? options.changedFiles : [];
  if ([...completedSteps, ...changedFiles].some(looksLikeMigration)) signals.push('migrations');

  return { isRuntimeFeature: signals.length > 0, signals };
}

module.exports = { detectRuntimeFeature, looksLikeMigration, gitChangedFiles };
