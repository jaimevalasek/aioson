'use strict';

const { cleanCell } = require('./feature-completeness-format');

function hasPathPattern(value) {
  if (/[*?{}]/.test(value)) return true;
  // Next route parameters are literal directory names, never expanded globs.
  return String(value).split(/[\\/]/).some((segment) => /[[\]]/.test(segment)
    && !/^(?:\[(?:\.\.\.)?[A-Za-z_$][\w$-]*\]|\[\[\.\.\.[A-Za-z_$][\w$-]*\]\])$/.test(segment));
}

function extractPlannedPaths(value) {
  const candidates = String(value || '')
    .replace(/<br\s*\/?>/gi, ',')
    .split(/[,;\n]/)
    .map((item) => cleanCell(item)
      .replace(/^\s*(?:create|modify|reuse|retire|criar|modificar|reusar|remover)\s*:\s*/i, '')
      .replace(/\s+\((?:create|modify|reuse|retire|new|existing|criar|modificar|reusar|novo|existente)\)\s*$/i, '')
      .trim())
    .filter(Boolean);
  return [...new Set(candidates.filter((candidate) => !hasPathPattern(candidate)
    && !/^(?:https?:|[a-z]+\s)/i.test(candidate)
    && (/[\\/]/.test(candidate) || /\.[a-z0-9]{1,10}$/i.test(candidate))))];
}

module.exports = { extractPlannedPaths, hasPathPattern };
