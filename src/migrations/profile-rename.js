'use strict';

// Migration: project.context.md `profile: beginner` -> `profile: creator`.
//
// Why: lay-user-agent-mode renames the persona value from `beginner` (which
// reads as "tutorial mode" / patronizing) to `creator` (neutral, aligns with
// vibe-coding market vocabulary). Existing projects on v1.9.0 or earlier may
// have `profile: beginner` in their project.context.md frontmatter. On the
// next `aioson update`, this migration rewrites that one line and emits a
// notify so the user understands the rename.
//
// Idempotent: re-running on a project already migrated does nothing.

const fs = require('node:fs/promises');
const path = require('node:path');

const PROJECT_CONTEXT_REL = '.aioson/context/project.context.md';

// Match `profile: beginner` with optional surrounding quotes in YAML frontmatter.
// Anchored to start-of-line to avoid matching prose mentions inside the body.
const FRONTMATTER_PROFILE_RE = /^profile:\s*["']?beginner["']?\s*$/m;

async function readFileOrNull(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') return null;
    throw err;
  }
}

function rewriteProfileLine(content) {
  return content.replace(FRONTMATTER_PROFILE_RE, 'profile: creator');
}

// Returns { changed: boolean, file: string | null }.
// changed=true means the file was rewritten this run.
// changed=false means either the file is missing, has no frontmatter,
// or already says `creator` (or any non-`beginner` value).
async function migrateProfileRename(targetDir) {
  const file = path.join(targetDir, PROJECT_CONTEXT_REL);
  const content = await readFileOrNull(file);
  if (!content) return { changed: false, file: null };

  // Only touch frontmatter — first --- block at top of file.
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch) return { changed: false, file };

  if (!FRONTMATTER_PROFILE_RE.test(fmMatch[1])) {
    return { changed: false, file };
  }

  const newFrontmatter = rewriteProfileLine(fmMatch[1]);
  const newContent = content.replace(fmMatch[0], `---\n${newFrontmatter}\n---`);
  await fs.writeFile(file, newContent, 'utf8');

  return { changed: true, file };
}

module.exports = {
  migrateProfileRename,
  // Exported for tests:
  rewriteProfileLine,
  FRONTMATTER_PROFILE_RE,
  PROJECT_CONTEXT_REL
};
