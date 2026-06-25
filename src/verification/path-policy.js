'use strict';

const path = require('node:path');

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function toPosixPath(value) {
  return String(value || '').replace(/\\/g, '/');
}

function validateFeatureSlug(slug) {
  const value = String(slug || '').trim();
  if (!value) {
    return { ok: false, reason: 'missing_feature' };
  }
  if (!SLUG_RE.test(value)) {
    return { ok: false, reason: 'invalid_feature_slug', feature_slug: value };
  }
  return { ok: true, feature_slug: value };
}

function isInsideRoot(rootDir, candidatePath) {
  const root = path.resolve(rootDir);
  const candidate = path.resolve(candidatePath);
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function resolveProjectRoot(cwd, targetArg) {
  return path.resolve(cwd || process.cwd(), targetArg || '.');
}

function resolveInsideRoot(rootDir, inputPath) {
  if (!inputPath) {
    return { ok: false, reason: 'missing_path' };
  }
  const root = path.resolve(rootDir);
  const resolved = path.resolve(root, String(inputPath));
  if (!isInsideRoot(root, resolved)) {
    return {
      ok: false,
      reason: 'path_outside_root',
      path: String(inputPath)
    };
  }
  return {
    ok: true,
    path: resolved,
    relative_path: toPosixPath(path.relative(root, resolved))
  };
}

function relativeFromRoot(rootDir, absolutePath) {
  return toPosixPath(path.relative(path.resolve(rootDir), path.resolve(absolutePath)));
}

function featureContextDir(rootDir, slug) {
  return path.join(path.resolve(rootDir), '.aioson', 'context', 'features', slug);
}

function verificationRunsDir(rootDir, slug) {
  return path.join(featureContextDir(rootDir, slug), 'verification-runs');
}

module.exports = {
  validateFeatureSlug,
  resolveProjectRoot,
  resolveInsideRoot,
  relativeFromRoot,
  featureContextDir,
  verificationRunsDir,
  isInsideRoot,
  toPosixPath
};
