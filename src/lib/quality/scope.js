'use strict';

const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { normalizeRelPath } = require('./result');
const execute = promisify(execFile);

async function git(root, args) {
  const { stdout } = await execute('git', args, { cwd: root, windowsHide: true, timeout: 10000, maxBuffer: 5 * 1024 * 1024 });
  return stdout;
}

async function resolveRef(root, value) {
  if (typeof value !== 'string' || !value.trim() || value.startsWith('-') || [...value].some(char => char.charCodeAt(0) < 32)) {
    throw new Error('Quality base/head must name valid Git revisions.');
  }
  return (await git(root, ['rev-parse', '--verify', '--end-of-options', `${value}^{commit}`])).trim();
}

async function getChangedScope(root, options = {}) {
  const explicit = options.changed || options.changedPaths;
  if (explicit && typeof explicit !== 'string') throw new Error('Use --changed=<file[,file]> for explicit quality paths.');
  if (explicit && (options.base || options.head)) throw new Error('Choose explicit changed paths or base/head, not both.');
  if (explicit) return { paths: explicit.split(',').map(p => normalizeRelPath(p.trim())).filter(Boolean), renames: {}, base: null, head: null };
  if (options.head && !options.base) throw new Error('--head requires --base.');
  if (options.base) return changedRange(root, options);
  return localChanges(root);
}

async function changedRange(root, options) {
  const base = await resolveRef(root, options.base);
  const head = await resolveRef(root, options.head || 'HEAD');
  const names = (await git(root, ['diff', '--name-status', '-z', '--find-renames', '--diff-filter=ACMRT', base, head, '--'])).split('\0');
  const paths = [];
  const renames = {};
  for (let i = 0; i < names.length && names[i];) {
    const status = names[i++];
    const first = normalizeRelPath(names[i++]);
    if (/^[RC]/.test(status)) {
      const second = normalizeRelPath(names[i++]);
      paths.push(second);
      if (status.startsWith('R')) renames[first] = second;
    } else paths.push(first);
  }
  return { paths: [...new Set(paths)].sort(), renames, base, head };
}

async function localChanges(root) {
  // Outside Git, project-wide analysis is still possible. Explicit CI revisions
  // above are never downgraded to this advisory local path.
  try { await git(root, ['rev-parse', '--show-toplevel']); } catch { return { paths: [], renames: {}, base: null, head: null, git: false }; }
  let head = null;
  try { head = await resolveRef(root, 'HEAD'); } catch { /* Unborn repository. */ }
  const tracked = await git(root, head ? ['diff', '--name-only', '-z', 'HEAD', '--'] : ['diff', '--cached', '--name-only', '-z', '--']);
  const untracked = await git(root, ['ls-files', '--others', '--exclude-standard', '-z']);
  return { paths: [...new Set(`${tracked}\0${untracked}`.split('\0').filter(Boolean).map(normalizeRelPath))].sort(), renames: {}, base: null, head };
}

module.exports = { getChangedScope };
