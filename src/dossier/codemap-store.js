'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { isValidSlug } = require('./schema');

const FEATURES_SUBDIR = 'features';
const DOSSIER_FILENAME = 'dossier.md';

const VALID_ROLES = new Set([
  'command-entry', 'core-module', 'io-layer', 'store', 'schema',
  'test', 'util', 'config', 'integration', 'cli', 'other'
]);
const VALID_COUPLING = new Set(['low', 'medium', 'high']);
const LINES_REGEX = /^\d+-\d+$/;

function dossierPath(contextDir, slug) {
  return path.join(contextDir, FEATURES_SUBDIR, slug, DOSSIER_FILENAME);
}

function parseCodeMapBlock(raw) {
  const marker = '```yaml\n';
  const start = raw.indexOf('## Code Map\n');
  if (start === -1) return null;
  const blockStart = raw.indexOf(marker, start);
  if (blockStart === -1) return null;
  const codeStart = blockStart + marker.length;
  const codeEnd = raw.indexOf('\n```', codeStart);
  if (codeEnd === -1) return null;
  return { blockStart, codeStart, codeEnd };
}

function parseYamlCodeMap(yamlText) {
  const result = { files: [], modules: [], patterns: [] };
  const lines = yamlText.split('\n');
  let currentSection = null;
  let currentItem = null;

  const flushItem = () => {
    if (currentItem !== null && currentSection !== null) {
      result[currentSection].push(currentItem);
      currentItem = null;
    }
  };

  for (const line of lines) {
    if (!line.trim()) continue;

    // Section header
    const sectionMatch = line.match(/^(files|modules|patterns):\s*(\[\])?$/);
    if (sectionMatch) {
      flushItem();
      currentSection = sectionMatch[1];
      continue;
    }

    // List item start: "- key: value"
    const listItemMatch = line.match(/^-\s+(\w+):\s*(.*)$/);
    if (listItemMatch && currentSection) {
      flushItem();
      currentItem = {};
      currentItem[listItemMatch[1]] = listItemMatch[2].replace(/^["']|["']$/g, '');
      continue;
    }

    // Continuation: "  key: value"
    const kvMatch = line.match(/^\s+(\w+):\s*(.*)$/);
    if (kvMatch && currentItem !== null) {
      currentItem[kvMatch[1]] = kvMatch[2].replace(/^["']|["']$/g, '');
    }
  }
  flushItem();
  return result;
}

function serializeCodeMap(map) {
  const lines = [];
  const serializeList = (key, items) => {
    if (!items || items.length === 0) {
      lines.push(`${key}: []`);
      return;
    }
    lines.push(`${key}:`);
    for (const item of items) {
      const entries = Object.entries(item);
      if (entries.length === 0) continue;
      lines.push(`- ${entries[0][0]}: ${entries[0][1]}`);
      for (const [k, v] of entries.slice(1)) {
        lines.push(`  ${k}: ${v}`);
      }
    }
  };
  serializeList('files', map.files);
  serializeList('modules', map.modules);
  serializeList('patterns', map.patterns);
  return lines.join('\n');
}

function validateFileEntry(entry) {
  const errors = [];
  if (!entry.path || typeof entry.path !== 'string') errors.push('path is required');
  if (entry.lines && !LINES_REGEX.test(entry.lines)) errors.push(`lines must be int-int (got: ${entry.lines})`);
  if (entry.role && !VALID_ROLES.has(entry.role)) errors.push(`role must be one of [${[...VALID_ROLES].join(', ')}]`);
  if (entry.coupling_risk && !VALID_COUPLING.has(entry.coupling_risk)) errors.push(`coupling_risk must be low|medium|high`);
  return errors;
}

async function addCodemap({ slug, contextDir, filePath, lines, role, coupling, addedBy, now = () => new Date() }) {
  if (!isValidSlug(slug)) {
    const err = new Error(`invalid slug: ${JSON.stringify(slug)}`);
    err.code = 'EDOSSIERSLUG';
    throw err;
  }
  const errors = validateFileEntry({ path: filePath, lines, role, coupling_risk: coupling });
  if (errors.length > 0) {
    const err = new Error(`invalid codemap entry: ${errors.join('; ')}`);
    err.code = 'ECODEMAPVALIDATION';
    err.errors = errors;
    throw err;
  }

  // Warn (not error) when the file path doesn't exist on disk — may be a planned file
  let fileWarn = null;
  try {
    await fs.access(path.resolve(contextDir, '..', '..', filePath));
  } catch {
    fileWarn = 'file_not_found';
  }

  const p = dossierPath(contextDir, slug);
  let raw;
  try {
    raw = await fs.readFile(p, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      const e = new Error(`dossier not found for slug "${slug}"`);
      e.code = 'EDOSSIERMISSING';
      throw e;
    }
    throw err;
  }

  const parsed = parseCodeMapBlock(raw);
  let map = { files: [], modules: [], patterns: [] };
  if (parsed) {
    const yamlText = raw.slice(parsed.codeStart, parsed.codeEnd);
    map = parseYamlCodeMap(yamlText);
  }

  // Idempotency: dedupe by (path, lines)
  const existing = map.files.find(f => f.path === filePath && f.lines === (lines || ''));
  if (existing) {
    return { added: false, path: filePath, warn: fileWarn };
  }

  const entry = { path: filePath };
  if (lines) entry.lines = lines;
  if (role) entry.role = role;
  if (coupling) entry.coupling_risk = coupling;
  if (addedBy) entry.added_by = addedBy;
  entry.added_at = now().toISOString();

  map.files.push(entry);
  const newYaml = serializeCodeMap(map);

  let newRaw;
  if (parsed) {
    newRaw = raw.slice(0, parsed.codeStart) + newYaml + raw.slice(parsed.codeEnd);
  } else {
    // Insert a Code Map section if absent (shouldn't happen in well-formed dossiers)
    newRaw = raw + `\n## Code Map\n\n\`\`\`yaml\n${newYaml}\n\`\`\`\n`;
  }

  await fs.writeFile(p, newRaw, 'utf8');
  return { added: true, path: filePath, warn: fileWarn };
}

async function linkRule({ slug, contextDir, rulePath, reason, targetDir }) {
  if (!isValidSlug(slug)) {
    const err = new Error(`invalid slug: ${JSON.stringify(slug)}`);
    err.code = 'EDOSSIERSLUG';
    throw err;
  }

  // Validate rule path exists in .aioson/rules/ or .aioson/design-docs/
  const base = targetDir || process.cwd();
  const absRule = path.resolve(base, rulePath);
  const rulesDir = path.join(base, '.aioson', 'rules');
  const designDocsDir = path.join(base, '.aioson', 'design-docs');

  const inRules = absRule.startsWith(rulesDir + path.sep) || absRule.startsWith(rulesDir + '/');
  const inDesignDocs = absRule.startsWith(designDocsDir + path.sep) || absRule.startsWith(designDocsDir + '/');

  if (!inRules && !inDesignDocs) {
    const err = new Error(`rule path must be under .aioson/rules/ or .aioson/design-docs/ (got: ${rulePath})`);
    err.code = 'ELINKREULEPATH';
    throw err;
  }

  try {
    await fs.access(absRule);
  } catch {
    const err = new Error(`rule file not found: ${absRule}`);
    err.code = 'ELINKREULENOTFOUND';
    err.path = absRule;
    throw err;
  }

  const p = dossierPath(contextDir, slug);
  let raw;
  try {
    raw = await fs.readFile(p, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      const e = new Error(`dossier not found for slug "${slug}"`);
      e.code = 'EDOSSIERMISSING';
      throw e;
    }
    throw err;
  }

  const rulesSection = '## Rules & Design-Docs aplicáveis';
  const entry = `- [${rulePath}](${rulePath})${reason ? ` — ${reason}` : ''}`;

  // Idempotency: don't duplicate same path
  if (raw.includes(`[${rulePath}]`)) {
    return { added: false, path: rulePath };
  }

  const lines = raw.split('\n');
  let sectionEnd = lines.length;
  let inSection = false;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trimEnd() === rulesSection) {
      inSection = true;
    } else if (inSection && /^## /.test(lines[i])) {
      sectionEnd = i;
      break;
    }
  }

  const before = lines.slice(0, sectionEnd);
  const after = lines.slice(sectionEnd);

  // Remove placeholder line if present
  const placeholderIdx = before.findIndex(l => l.includes('_(vazio —') || l.includes('_(empty'));
  if (placeholderIdx !== -1) before.splice(placeholderIdx, 1);

  while (before.length > 0 && before[before.length - 1].trim() === '') before.pop();
  before.push('', entry);

  const newRaw = [...before, '', ...after].join('\n');
  await fs.writeFile(p, newRaw, 'utf8');
  return { added: true, path: rulePath };
}

module.exports = {
  addCodemap,
  linkRule,
  parseCodeMapBlock,
  parseYamlCodeMap,
  serializeCodeMap,
  validateFileEntry,
  VALID_ROLES,
  VALID_COUPLING
};
