'use strict';

/**
 * The project's own files, as `aioson install` reports them: how many, and how
 * many under each top-level folder. It decides the "Existing project detected
 * (N files)" notice and the folder the scan hint names.
 *
 * The count is taken before the install writes anything, and it leaves out
 * what AIOSON writes: counted afterwards, a project holding only package.json
 * read as "Existing project detected (45 files)".
 */

const fs = require('node:fs/promises');
const path = require('node:path');

// Dependency, build and VCS trees, skipped at any depth: none of it is source.
const SKIP_NAMES = new Set(['.git', 'node_modules', 'vendor', '.aioson', 'dist', 'build', '__pycache__']);
// What AIOSON itself writes at the project root besides the template files:
// the tool folders (agents, commands, generated permissions and hooks), the
// agent scratch caches, the logs, and the .gitignore its policy creates. Only
// at the root — a `src/mappings/` folder is the project's own.
const SKIP_ROOT_ENTRIES = new Set(['.claude', '.codex', '.opencode', 'aioson-logs', 'squad-searches', 'researchs', 'mappings', '.gitignore']);

/**
 * @param {string} targetDir Project directory.
 * @param {Set<string>} [ownedPaths] Template-relative paths an earlier install
 *   wrote (CLAUDE.md, AGENTS.md…): a re-install does not count its own files.
 * @returns {Promise<{count: number, folders: Map<string, number>}>}
 */
async function surveyProjectFiles(targetDir, ownedPaths = new Set()) {
  const folders = new Map();
  let count = 0;
  async function walk(dir, rel) {
    let entries;
    try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (SKIP_NAMES.has(entry.name)) continue;
      if (!rel && SKIP_ROOT_ENTRIES.has(entry.name)) continue;
      const entryRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(path.join(dir, entry.name), entryRel);
        continue;
      }
      if (ownedPaths.has(entryRel)) continue;
      count++;
      const top = entryRel.split('/')[0];
      if (top !== entryRel) folders.set(top, (folders.get(top) || 0) + 1);
    }
  }
  await walk(targetDir, '');
  return { count, folders };
}

async function countProjectFiles(targetDir, ownedPaths) {
  return (await surveyProjectFiles(targetDir, ownedPaths)).count;
}

/**
 * The folder the scan hint names. scan:project refuses a folder that does not
 * exist, and the hint used to say `--folder=src` to every project: `src` when
 * the project has one, else the visible top-level folder holding most of its
 * files, else null (the hint then shows a placeholder).
 */
function pickScanFolder(folders) {
  if (folders.has('src')) return 'src';
  let best = null;
  for (const [name, count] of folders) {
    if (name.startsWith('.')) continue;
    if (!best || count > best.count) best = { name, count };
  }
  return best ? best.name : null;
}

module.exports = {
  surveyProjectFiles,
  countProjectFiles,
  pickScanFolder
};
