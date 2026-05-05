'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const ARTIFACT_NAMES = Object.freeze([
  { key: 'prd', name: (slug) => `prd-${slug}.md` },
  { key: 'requirements', name: (slug) => `requirements-${slug}.md` },
  { key: 'architecture', name: () => 'architecture.md' },
  { key: 'implementation_plan', name: (slug) => `implementation-plan-${slug}.md` },
  { key: 'spec', name: (slug) => `spec-${slug}.md` },
  { key: 'conformance', name: (slug) => `conformance-${slug}.yaml` }
]);

async function readSlugArtifacts(targetDir, slug) {
  const baseDir = path.join(targetDir, '.aioson', 'context');
  const result = { slug, baseDir, artifacts: {} };
  for (const def of ARTIFACT_NAMES) {
    const filePath = path.join(baseDir, def.name(slug));
    try {
      const content = await fs.readFile(filePath, 'utf8');
      result.artifacts[def.key] = { path: filePath, content, present: true };
    } catch (err) {
      if (err && err.code === 'ENOENT') {
        result.artifacts[def.key] = { path: filePath, content: null, present: false };
      } else {
        throw err;
      }
    }
  }
  return result;
}

function extractClassification(content) {
  if (!content) return null;
  const match = content.match(/^classification:\s*["']?([A-Z]+)["']?/m);
  return match ? match[1].toUpperCase() : null;
}

function hasSection(content, headerRegex) {
  if (!content) return false;
  return headerRegex.test(content);
}

const TABLE_ROW_TO_SURFACE = Object.freeze({
  'authenticated endpoints': 'auth',
  'owned resources': 'ownership',
  'financial state changes': 'money',
  uploads: 'uploads',
  'external urls': 'external_urls',
  'secrets or credentials': 'secrets',
  'storage boundaries': 'storage',
  'pentester trigger': 'pentester_trigger'
});

const NON_APPLICABLE_SURFACE_PATTERNS = [
  /\bnone introduced\b/i,
  /\bno new\b/i,
  /\bn\/a\b/i,
  /\bnot applicable\b/i,
  /\bout of scope\b/i,
  /\bnot required\b/i,
  /\bfuture\b/i,
  /\bwhen present\b/i,
  /\blater verif(?:y|ies)\b/i,
  /\bdefines controls\b/i,
  /\bphase \d+\b/i,
  /\.aioson\//i,
  /\btemplate sync\b/i,
  /\bruntime sqlite\b/i
];

function extractAttackSurfaceSection(requirementsContent) {
  if (!requirementsContent) return null;
  const lines = requirementsContent.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => /^##\s+Attack Surface(?: Map)?\b/i.test(line));
  if (startIndex === -1) return null;
  const sectionLines = [];
  for (let i = startIndex + 1; i < lines.length; i += 1) {
    if (/^##\s+/.test(lines[i])) break;
    sectionLines.push(lines[i]);
  }
  return sectionLines.join('\n');
}

function normalizeSurfaceLabel(label) {
  return String(label || '')
    .toLowerCase()
    .replace(/[`*_]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseAttackSurfaceRows(sectionContent) {
  if (!sectionContent) return [];
  const rows = [];
  for (const rawLine of sectionContent.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.startsWith('|')) continue;
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (cells.length < 2) continue;
    const [label, value] = cells;
    if (!label || /^-+$/.test(label.replace(/\s+/g, ''))) continue;
    if (!value || /^-+$/.test(value.replace(/\s+/g, ''))) continue;
    if (normalizeSurfaceLabel(label) === 'surface') continue;
    rows.push({ label, value });
  }
  return rows;
}

function isApplicableSurfaceValue(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return false;
  return !NON_APPLICABLE_SURFACE_PATTERNS.some((pattern) => pattern.test(normalized));
}

function extractAttackSurfaceFlags(requirementsContent) {
  if (!requirementsContent) {
    return { hasMap: false, surfaces: [] };
  }
  const section = extractAttackSurfaceSection(requirementsContent);
  const hasMap = Boolean(section) || /##\s+Attack Surface Map|##\s+Attack Surface\b/i.test(requirementsContent);
  const surfaces = [];
  if (section) {
    const seen = new Set();
    const rows = parseAttackSurfaceRows(section);
    for (const row of rows) {
      const key = TABLE_ROW_TO_SURFACE[normalizeSurfaceLabel(row.label)];
      if (!key || key === 'pentester_trigger') continue;
      if (!isApplicableSurfaceValue(row.value) || seen.has(key)) continue;
      seen.add(key);
      surfaces.push(key);
    }
    if (rows.length > 0) {
      return { hasMap, surfaces };
    }
  }

  const checks = [
    { key: 'auth', re: /authenticated_endpoints|authenticated endpoints|\bauth\b/i },
    { key: 'ownership', re: /owned[_ -]?resources|ownership/i },
    { key: 'money', re: /financial[_ -]?state[_ -]?changes|payments?|money/i },
    { key: 'uploads', re: /uploads?/i },
    { key: 'external_urls', re: /external[_ -]?urls?/i },
    { key: 'secrets', re: /secrets?[_ -]?or[_ -]?credentials|api[_ -]?keys?/i },
    { key: 'storage', re: /storage[_ -]?boundaries?|rls\b/i }
  ];
  const fallbackContent = section || requirementsContent;
  for (const c of checks) {
    if (c.re.test(fallbackContent)) surfaces.push(c.key);
  }
  return { hasMap, surfaces };
}

module.exports = {
  ARTIFACT_NAMES,
  readSlugArtifacts,
  extractClassification,
  hasSection,
  extractAttackSurfaceFlags,
  extractAttackSurfaceSection,
  parseAttackSurfaceRows,
  isApplicableSurfaceValue
};
