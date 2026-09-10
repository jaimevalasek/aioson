'use strict';

// template/ is the source of truth. The repository also tracks SOME of its
// workspace mirrors under .aioson/ (agents, docs, brains, rules) and ignores
// the rest by design (.gitignore: .aioson/skills/, .aioson/schemas/, ...). A
// fresh checkout — CI — has no copy of an ignored mirror, so a parity test
// that reads one unconditionally fails with ENOENT everywhere except on a
// maintainer's machine where `sync:agents` wrote it: the suite was green
// locally and red on every CI push for weeks. The rule encoded here: a
// tracked mirror must exist and match; a local-only mirror must match
// wherever it exists, and its absence is not drift.

const fs = require('node:fs');
const path = require('node:path');
const ignore = require('ignore');

const ROOT = path.resolve(__dirname, '..', '..');

let matcher = null;
function gitignore() {
  if (!matcher) matcher = ignore().add(fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8'));
  return matcher;
}

/** Whether a repository-relative path is kept out of version control by .gitignore. */
function isLocalOnly(relativePath) {
  return gitignore().ignores(String(relativePath).split(path.sep).join('/'));
}

/**
 * The workspace copy of a repository-relative path (`.aioson/...`), or null
 * when that copy is local-only and absent (a fresh checkout). A missing
 * tracked mirror still throws: that absence is real drift.
 */
async function readWorkspaceMirror(relativePath) {
  try {
    return await fs.promises.readFile(path.join(ROOT, relativePath), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT' && isLocalOnly(relativePath)) return null;
    throw error;
  }
}

module.exports = { ROOT, isLocalOnly, readWorkspaceMirror };
