'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { isContainedPath } = require('../../squad/path-containment');

async function containedOutput(root, relative) {
  if (typeof relative !== 'string' || !relative || relative.includes('\0')) throw new Error('A quality output path is required.');
  const absolute = path.resolve(root, relative);
  if (absolute === path.resolve(root) || !isContainedPath(root, absolute)) throw new Error('Quality output must stay inside the target project.');
  const realRoot = await fs.realpath(root);
  let parent = absolute;
  for (;;) {
    try {
      const realParent = await fs.realpath(parent);
      if (!isContainedPath(realRoot, realParent)) throw new Error('Quality output escapes the project through a symbolic link.');
      break;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const next = path.dirname(parent);
      if (next === parent) throw error;
      parent = next;
    }
  }
  return absolute;
}

async function writeJson(root, relative, value, options = {}) {
  const absolute = await containedOutput(root, relative);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: options.exclusive ? 'wx' : 'w' });
  return path.relative(root, absolute).replace(/\\/g, '/');
}

async function ensureNewOutput(root, relative) {
  if (!relative) return;
  const absolute = await containedOutput(root, relative);
  try { await fs.lstat(absolute); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
  const error = new Error('EEXIST: quality evidence cannot overwrite an existing result.');
  error.code = 'EEXIST'; throw error;
}

module.exports = { containedOutput, writeJson, ensureNewOutput };
