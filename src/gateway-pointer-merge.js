'use strict';

// Gateway pointer merge — keeps the AIOSON instructions inside CLAUDE.md,
// AGENTS.md, OPENCODE.md, and .gemini/GEMINI.md without clobbering any
// project-authored content above the managed block. When the destination
// file already exists, the prior copy path skipped it entirely, leaving
// existing projects without the framework instructions. This module wraps
// the template body in <!-- AIOSON:BEGIN --> ... <!-- AIOSON:END --> markers
// and either appends or replaces that block in place.

const fs = require('node:fs/promises');
const path = require('node:path');
const { exists, copyFileWithDir, toRelativeSafe } = require('./utils');

const MARKER_BEGIN = '<!-- AIOSON:BEGIN -->';
const MARKER_END = '<!-- AIOSON:END -->';

const GATEWAY_POINTER_FILES = new Set([
  'CLAUDE.md',
  'AGENTS.md',
  'OPENCODE.md',
  '.gemini/GEMINI.md'
]);

function isGatewayPointerPath(rel) {
  return GATEWAY_POINTER_FILES.has(rel);
}

function buildBlock(templateContent) {
  const body = templateContent.endsWith('\n') ? templateContent : `${templateContent}\n`;
  return `${MARKER_BEGIN}\n${body}${MARKER_END}\n`;
}

function findBlockRange(content) {
  const start = content.indexOf(MARKER_BEGIN);
  if (start === -1) return null;
  const endIdx = content.indexOf(MARKER_END, start + MARKER_BEGIN.length);
  if (endIdx === -1) return null;
  let end = endIdx + MARKER_END.length;
  if (content[end] === '\n') end += 1;
  return { start, end };
}

async function mergeGatewayPointer({ templatePath, targetPath, backupRoot, targetDir, dryRun = false }) {
  const templateContent = await fs.readFile(templatePath, 'utf8');
  const block = buildBlock(templateContent);

  if (!(await exists(targetPath))) {
    if (!dryRun) await fs.writeFile(targetPath, block, 'utf8');
    return { action: 'created' };
  }

  const existing = await fs.readFile(targetPath, 'utf8');
  const range = findBlockRange(existing);

  let next;
  let action;
  if (range) {
    const before = existing.slice(0, range.start);
    const after = existing.slice(range.end);
    const cleanBefore = before.length === 0 || before.endsWith('\n') ? before : `${before}\n`;
    next = `${cleanBefore}${block}${after}`;
    action = 'block_updated';
  } else {
    const separator = existing.length === 0 ? '' : existing.endsWith('\n\n') ? '' : existing.endsWith('\n') ? '\n' : '\n\n';
    next = `${existing}${separator}${block}`;
    action = 'block_appended';
  }

  if (next === existing) return { action: 'unchanged' };

  let backupPath = null;
  let backupError = null;
  if (backupRoot && targetDir) {
    const rel = toRelativeSafe(targetDir, targetPath);
    const dest = path.join(backupRoot, rel);
    if (!dryRun) {
      try {
        await copyFileWithDir(targetPath, dest);
        backupPath = dest;
      } catch (err) {
        backupError = err && err.message ? err.message : String(err);
      }
    } else {
      backupPath = dest;
    }
  }

  if (!dryRun) await fs.writeFile(targetPath, next, 'utf8');
  return { action, backupPath, backupError };
}

module.exports = {
  MARKER_BEGIN,
  MARKER_END,
  GATEWAY_POINTER_FILES,
  isGatewayPointerPath,
  buildBlock,
  findBlockRange,
  mergeGatewayPointer
};
