'use strict';

// Cross-platform replacement for the legacy `rsync -av template/ ./` step in the
// `sync:agents` npm script. rsync is not available on Windows, which silently
// left the workspace un-synced. This mirrors template/ into the repo root using
// Node's fs, replicating the original rsync excludes:
//   --exclude='config.md' --exclude='runtime/' --exclude='backups/' --exclude='mcp/servers.local.json'
// rsync matched those names at any depth; we replicate that (basename / dir
// segment / path suffix).

const fs = require('node:fs/promises');
const path = require('node:path');

const EXCLUDE_BASENAMES = new Set(['config.md']);
const EXCLUDE_DIR_NAMES = new Set(['runtime', 'backups']);
const EXCLUDE_SUFFIXES = [path.join('mcp', 'servers.local.json')];

// `relPath` is relative to template/ and uses the OS separator.
function isExcluded(relPath) {
  const segments = relPath.split(path.sep).filter(Boolean);
  const base = segments[segments.length - 1];
  if (EXCLUDE_BASENAMES.has(base)) return true;
  // a directory named runtime/ or backups/ anywhere in the path (or the dir itself)
  if (segments.some((seg) => EXCLUDE_DIR_NAMES.has(seg))) return true;
  if (EXCLUDE_SUFFIXES.some((suf) => relPath === suf || relPath.endsWith(path.sep + suf))) return true;
  return false;
}

async function copyTree(srcRoot, destRoot, relPath = '') {
  const entries = await fs.readdir(path.join(srcRoot, relPath), { withFileTypes: true });
  let copied = 0;
  for (const entry of entries) {
    const childRel = path.join(relPath, entry.name);
    if (isExcluded(childRel)) continue;
    const srcChild = path.join(srcRoot, childRel);
    const destChild = path.join(destRoot, childRel);
    if (entry.isDirectory()) {
      await fs.mkdir(destChild, { recursive: true });
      copied += await copyTree(srcRoot, destRoot, childRel);
    } else if (entry.isFile()) {
      await fs.mkdir(path.dirname(destChild), { recursive: true });
      await fs.copyFile(srcChild, destChild);
      copied += 1;
    }
  }
  return copied;
}

async function syncAgentsCopy(rootDir = process.cwd()) {
  const templateDir = path.join(rootDir, 'template');
  const copied = await copyTree(templateDir, rootDir);
  return { copied };
}

module.exports = { syncAgentsCopy, isExcluded };

if (require.main === module) {
  syncAgentsCopy(process.cwd())
    .then(({ copied }) => {
      console.log(`[sync:agents] mirrored template/ -> ./ (${copied} files, cross-platform copy; rsync not required)`);
    })
    .catch((err) => {
      console.error(`[sync:agents] copy failed: ${err.message}`);
      process.exitCode = 1;
    });
}
