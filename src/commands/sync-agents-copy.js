'use strict';

// Cross-platform replacement for the legacy `rsync -av template/ ./` step in the
// `sync:agents` npm script. rsync is not available on Windows, which silently
// left the workspace un-synced. This mirrors template/ into the repo root using
// Node's fs, replicating the original rsync excludes:
//   --exclude='config.md' --exclude='runtime/' --exclude='backups/' --exclude='mcp/servers.local.json'
// rsync matched those names at any depth; we replicate that (basename / dir
// segment / path suffix).
//
// We also exclude the live project-state files (project-pulse.md, project-map.md,
// learning-loop.json, git-guard.json): the dogfooding workspace owns its own
// evolving state, so a template sync must never overwrite it with the template
// seeds. External project installs (`aioson update`) are a separate code path and
// still receive the seeds.
//
// Gateway-pointer files (CLAUDE.md / AGENTS.md / OPENCODE.md) carry an AIOSON
// managed block (<!-- AIOSON:BEGIN --> … <!-- AIOSON:END -->) when a project was
// installed/updated. A blind copy of the raw template body STRIPS that block (and
// any project content around it). So when the destination already has a managed
// block, we refresh it in place via mergeGatewayPointer (same path the installer
// uses) instead of clobbering it. When the destination has no block we keep the
// plain copy — that leaves the framework repo's own raw CLAUDE.md untouched.

const fs = require('node:fs/promises');
const path = require('node:path');
const {
  isGatewayPointerPath,
  findBlockRange,
  mergeGatewayPointer
} = require('../gateway-pointer-merge');

const EXCLUDE_BASENAMES = new Set([
  'config.md',
  // live project-state — owned by the workspace, never clobbered by template seeds
  'project-pulse.md',
  'project-map.md',
  'learning-loop.json',
  'git-guard.json'
]);
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

// Refresh an AIOSON-managed block in place when the destination already has one;
// otherwise fall back to a plain copy. Keeps markers + any project-authored
// content around the block intact (the blind copy would have stripped them).
async function copyGatewayPointer(srcChild, destChild) {
  await fs.mkdir(path.dirname(destChild), { recursive: true });
  let hasBlock = false;
  try {
    const existing = await fs.readFile(destChild, 'utf8');
    hasBlock = findBlockRange(existing) !== null;
  } catch {
    hasBlock = false; // destination missing/unreadable → plain copy
  }
  if (hasBlock) {
    await mergeGatewayPointer({ templatePath: srcChild, targetPath: destChild });
  } else {
    await fs.copyFile(srcChild, destChild);
  }
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
      if (isGatewayPointerPath(childRel)) {
        await copyGatewayPointer(srcChild, destChild);
      } else {
        await fs.mkdir(path.dirname(destChild), { recursive: true });
        await fs.copyFile(srcChild, destChild);
      }
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
