'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { ensureDir, nowStamp } = require('./utils');

const DOC_CREATING_AGENTS = new Set([
  'product', 'sheldon', 'planner', 'analyst', 'architect', 'ux-ui'
]);

function isDocCreatingAgent(agentName) {
  const normalized = agentName.toLowerCase().replace(/^@/, '');
  return DOC_CREATING_AGENTS.has(normalized);
}

async function collectMdFiles(dir) {
  const results = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await collectMdFiles(full)));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Backs up all .md files from .aioson/context/ and .aioson/plans/ to
 * ~/.aioson/backups/{project-name}/{timestamp}/
 *
 * @param {string} targetDir - Project root directory
 * @returns {{ ok: boolean, count: number, backupPath: string|null }}
 */
async function backupAiosonDocs(targetDir) {
  const contextDir = path.join(targetDir, '.aioson', 'context');
  const plansDir = path.join(targetDir, '.aioson', 'plans');

  const files = [
    ...(await collectMdFiles(contextDir)),
    ...(await collectMdFiles(plansDir))
  ];

  if (files.length === 0) return { ok: true, count: 0, backupPath: null };

  const projectName = path.basename(path.resolve(targetDir));
  // nowStamp() returns ISO with colons replaced: 2026-01-01T00-00-00.000Z
  // Take just the date+time part: YYYY-MM-DDTHH-MM-SS
  const stamp = nowStamp().slice(0, 19);
  const backupRoot = path.join(os.homedir(), '.aioson', 'backups', projectName, stamp);

  await ensureDir(backupRoot);

  const aiosonRoot = path.join(targetDir, '.aioson');

  for (const file of files) {
    const rel = path.relative(aiosonRoot, file); // e.g. "context/prd.md"
    const dest = path.join(backupRoot, rel);
    await ensureDir(path.dirname(dest));
    await fs.copyFile(file, dest);
  }

  return { ok: true, count: files.length, backupPath: backupRoot };
}

module.exports = { backupAiosonDocs, isDocCreatingAgent };
