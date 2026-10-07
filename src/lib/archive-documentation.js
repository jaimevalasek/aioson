'use strict';

/**
 * What a closed feature keeps: the documents a person reads later — PRD,
 * spec, requirements, plans, QA and security reports, the approved prototype.
 * Everything else that the agents produced to examine the system while it was
 * being built (screenshots, logs, smoke scripts, validator runs, review
 * packets, visual and execution ledgers) has done its job once the feature is
 * closed, so the archive drops it.
 *
 * Why this module exists: one project's `done/` grew to 18 MB, two thirds of
 * it captures, logs and machine JSON that no one opens after QA signs off.
 * The owner's rule: after a feature closes, only the documentation stays.
 *
 * Callers that still mine the raw evidence (the learning distillation inside
 * `feature:close`) run before the prune, never after.
 */

const fs = require('node:fs');
const path = require('node:path');
const { isContainedFolder } = require('./evidence-artifacts');

const DOCUMENT_EXTENSIONS = new Set(['.md', '.yaml', '.yml']);

// Structured records that are documentation in their own right: the closure's
// own audit trail, the pentester's findings, and the approved prototype.
const KEPT_RECORDS = [
  /^force-bypass-findings\.json$/i,
  /^closure-review\.json$/i,
  /^security-findings-[a-z0-9-]+\.json$/i,
  /^prototype[a-z0-9-]*\.html$/i
];

// Folders that only ever hold analysis output, whatever the file type inside.
const EVIDENCE_DIRS = new Set([
  'browser',
  'visual-screenshots',
  'evidence',
  'validator-runs',
  'reviews',
  'jev',
  'qa',
  'scouts',
  'reports'
]);

function isDocumentation(relPath) {
  const parts = relPath.split(/[\\/]/);
  const name = parts[parts.length - 1];
  if (parts.slice(0, -1).some((dir) => EVIDENCE_DIRS.has(dir.toLowerCase()))) return false;
  if (DOCUMENT_EXTENSIONS.has(path.extname(name).toLowerCase())) return true;
  return KEPT_RECORDS.some((re) => re.test(name));
}

function listEntries(dir) {
  try { return fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
}

/**
 * Remove every non-documentation file under one archived feature folder
 * (`done/{slug}/` or `abandoned/{slug}/`), then the folders left empty.
 * Never follows a link and never works outside `root`. Never throws: a file
 * the OS refuses to delete is reported in `failed`.
 *
 * @returns {{ files: number, bytes: number, removed: string[], failed: Array<{file:string, error:string}> }}
 */
function pruneToDocumentation(archiveDir, { root, dryRun = false } = {}) {
  const result = { files: 0, bytes: 0, removed: [], failed: [] };
  if (!isContainedFolder(archiveDir, root)) return result;

  const walk = (dir, rel) => {
    for (const entry of listEntries(dir)) {
      const abs = path.join(dir, entry.name);
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        walk(abs, relPath);
        if (!dryRun && listEntries(abs).length === 0) {
          try { fs.rmdirSync(abs); } catch { /* left in place */ }
        }
        continue;
      }
      if (!entry.isFile() || isDocumentation(relPath)) continue;
      let size = 0;
      try { size = fs.statSync(abs).size; } catch { /* weightless */ }
      if (!dryRun) {
        try {
          fs.rmSync(abs, { force: true, maxRetries: 3, retryDelay: 50 });
        } catch (error) {
          result.failed.push({ file: relPath, error: String((error && error.message) || error) });
          continue;
        }
      }
      result.files += 1;
      result.bytes += size;
      result.removed.push(relPath);
    }
  };
  walk(archiveDir, '');
  return result;
}

module.exports = { isDocumentation, pruneToDocumentation, EVIDENCE_DIRS };
