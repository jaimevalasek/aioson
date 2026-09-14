'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { digest } = require('./eval-suite');
const git = promisify(execFile);

async function sourceIdentity(root) {
  try {
    const options = { cwd: root, windowsHide: true, timeout: 10000, maxBuffer: 1024 * 1024 };
    const revision = (await git('git', ['rev-parse', 'HEAD'], options)).stdout.trim();
    const status = (await git('git', ['status', '--porcelain'], options)).stdout;
    return { revision, dirty: Boolean(status.trim()) };
  } catch { return { revision: null, dirty: null }; }
}

async function executorFiles(root, argv) {
  const files = [];
  for (const arg of argv || []) {
    const absolute = path.resolve(root, arg);
    try {
      if ((await fs.stat(absolute)).isFile()) files.push({ path: absolute, sha256: digest(await fs.readFile(absolute)) });
    } catch (error) { if (!['ENOENT', 'ENOTDIR', 'EINVAL'].includes(error.code)) throw error; }
  }
  return files;
}

module.exports = { sourceIdentity, executorFiles };
