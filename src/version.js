'use strict';

const fs = require('node:fs');
const fsPromises = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT_DIR = path.join(__dirname, '..');
const PACKAGE_JSON_PATH = path.join(ROOT_DIR, 'package.json');
const DEFAULT_VERSION = '0.0.0';

let cachedVersion = null;
let cachedGitInfo; // undefined = not computed yet; null = no git build info

function parseVersionFromPackageJson(text) {
  try {
    const pkg = JSON.parse(String(text || '{}'));
    const version = String(pkg.version || '').trim();
    return version || DEFAULT_VERSION;
  } catch {
    return DEFAULT_VERSION;
  }
}

function getCliVersionSync() {
  if (cachedVersion) return cachedVersion;

  try {
    const text = fs.readFileSync(PACKAGE_JSON_PATH, 'utf8');
    cachedVersion = parseVersionFromPackageJson(text);
    return cachedVersion;
  } catch {
    return DEFAULT_VERSION;
  }
}

async function getCliVersion() {
  if (cachedVersion) return cachedVersion;

  try {
    const text = await fsPromises.readFile(PACKAGE_JSON_PATH, 'utf8');
    cachedVersion = parseVersionFromPackageJson(text);
    return cachedVersion;
  } catch {
    return DEFAULT_VERSION;
  }
}

function runGitSync(args) {
  return execFileSync('git', ['-C', ROOT_DIR, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore']
  }).trim();
}

/**
 * Short git build info for the package's OWN checkout (e.g. an `npm link`ed dev
 * install). Lets `aioson --version` and the per-project install stamp report the
 * exact commit a linked framework is running, so you don't need a semver bump
 * per commit to know what's installed. Returns null when the package is not a
 * git checkout (a normal npm install) or git is unavailable. Best-effort.
 */
// A packaged copy can sit inside SOMEONE ELSE's checkout (a project's
// node_modules, the CLI an app bundles inside its own repo); `git -C` then
// answers for the enclosing repository and the stamp names a commit of a
// different codebase. Only a package that IS the top of its repository is a
// git build of aioson.
function isOwnCheckout() {
  const top = runGitSync(['rev-parse', '--show-toplevel']);
  if (!top) return false;
  const norm = (p) => {
    const real = fs.realpathSync.native(p);
    return process.platform === 'win32' ? real.toLowerCase() : real;
  };
  return norm(top) === norm(ROOT_DIR);
}

function getGitBuildInfoSync() {
  if (cachedGitInfo !== undefined) return cachedGitInfo;
  try {
    if (!isOwnCheckout()) {
      cachedGitInfo = null;
      return cachedGitInfo;
    }
    const sha = runGitSync(['rev-parse', '--short', 'HEAD']);
    if (!sha) {
      cachedGitInfo = null;
      return cachedGitInfo;
    }
    let date = null;
    try {
      date = runGitSync(['show', '-s', '--format=%cs', 'HEAD']) || null;
    } catch {
      /* date is optional */
    }
    cachedGitInfo = { sha, date };
  } catch {
    cachedGitInfo = null;
  }
  return cachedGitInfo;
}

/**
 * Display label: the semver, plus `(sha, date)` when running from a git checkout.
 * e.g. "1.35.0 (<sha>, <date>)" linked, or "1.35.0" from an npm install.
 */
function getCliVersionLabelSync() {
  const version = getCliVersionSync();
  const git = getGitBuildInfoSync();
  if (!git) return version;
  return git.date ? `${version} (${git.sha}, ${git.date})` : `${version} (${git.sha})`;
}

module.exports = {
  getCliVersion,
  getCliVersionSync,
  getGitBuildInfoSync,
  getCliVersionLabelSync,
  parseVersionFromPackageJson
};
