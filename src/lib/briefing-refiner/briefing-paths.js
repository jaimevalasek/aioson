'use strict';

const path = require('node:path');

// A briefing slug is a single, safe path segment: lowercase alphanumerics and
// hyphens, never starting with a hyphen. This is the single source of truth for
// slug validity across the briefing-refiner modules — it blocks path traversal
// (`../`), absolute paths, and separators before any slug reaches the filesystem.
const SAFE_SLUG = /^[a-z0-9][a-z0-9-]*$/;

function assertSafeSlug(slug) {
  const value = String(slug == null ? '' : slug);
  if (!SAFE_SLUG.test(value)) {
    const error = new Error(`Invalid briefing slug: ${JSON.stringify(slug)}`);
    error.code = 'invalid_slug';
    throw error;
  }
  return value;
}

function briefingsRoot(projectDir) {
  return path.resolve(projectDir, '.aioson', 'briefings');
}

// Resolve a path inside a briefing directory after validating the slug AND
// asserting the resolved path stays within that directory. Defence in depth:
// the slug regex rejects traversal in the slug, and the containment check
// rejects traversal smuggled through `parts` (e.g. a crafted filename).
function resolveBriefingPath(projectDir, slug, ...parts) {
  const safeSlug = assertSafeSlug(slug);
  const dir = path.join(briefingsRoot(projectDir), safeSlug);
  const resolved = parts.length === 0 ? dir : path.resolve(dir, ...parts);
  if (resolved !== dir && !resolved.startsWith(dir + path.sep)) {
    const error = new Error('Resolved briefing path escapes the briefing directory');
    error.code = 'path_escape';
    throw error;
  }
  return resolved;
}

module.exports = { SAFE_SLUG, assertSafeSlug, briefingsRoot, resolveBriefingPath };
