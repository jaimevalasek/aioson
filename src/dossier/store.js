'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const {
  SCHEMA_VERSION,
  REQUIRED_SECTIONS,
  isValidSlug,
  assertFrontmatter,
  validateFrontmatter
} = require('./schema');
const { stripInjectionChars } = require('../lib/llm-content-sanitizer');

const FEATURES_SUBDIR = 'features';
const DOSSIER_FILENAME = 'dossier.md';
const DEFAULT_AUTHOR = 'dossier-init';

function featureDir(contextDir, slug) {
  return path.join(contextDir, FEATURES_SUBDIR, slug);
}

function dossierPath(contextDir, slug) {
  return path.join(featureDir(contextDir, slug), DOSSIER_FILENAME);
}

function prdPath(contextDir, slug) {
  return path.join(contextDir, `prd-${slug}.md`);
}

async function fileExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function parseFrontmatter(markdown) {
  const text = String(markdown || '');
  if (!text.startsWith('---\n') && !text.startsWith('---\r\n')) {
    return { ok: false, data: null, body: text, reason: 'missing_frontmatter' };
  }
  const lines = text.split(/\r?\n/);
  let closingIndex = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === '---') {
      closingIndex = i;
      break;
    }
  }
  if (closingIndex === -1) {
    return { ok: false, data: null, body: text, reason: 'unclosed_frontmatter' };
  }
  const data = {};
  for (let i = 1; i < closingIndex; i += 1) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([a-zA-Z0-9_]+)\s*:\s*(.*)$/);
    if (!match) {
      return { ok: false, data: null, body: text, reason: 'invalid_frontmatter_line', line };
    }
    let val = match[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    data[match[1]] = val;
  }
  const body = lines.slice(closingIndex + 1).join('\n');
  return { ok: true, data, body };
}

function parseSections(markdown) {
  const text = String(markdown || '');
  const parsed = parseFrontmatter(text);
  const body = parsed.ok ? parsed.body : text;
  const sections = Object.create(null);

  const lines = body.split(/\r?\n/);
  let current = null;
  let buf = [];

  const flush = () => {
    if (current !== null) {
      sections[current] = buf.join('\n').replace(/\s+$/, '');
    }
  };

  for (const line of lines) {
    const m = line.match(/^##\s+(.+?)\s*$/);
    if (m) {
      flush();
      current = m[1].trim();
      buf = [];
    } else if (current !== null) {
      buf.push(line);
    }
  }
  flush();

  return sections;
}

function extractPrdSection(prdMarkdown, headingNames) {
  if (!prdMarkdown) return null;
  const sections = parseSections(prdMarkdown);
  for (const name of headingNames) {
    if (sections[name]) {
      const trimmed = sections[name].trim();
      if (trimmed) return trimmed;
    }
  }
  return null;
}

function buildDossierMarkdown({
  slug,
  classification,
  createdAt,
  author,
  why,
  what
}) {
  const fm = [
    '---',
    `feature_slug: ${slug}`,
    `schema_version: "${SCHEMA_VERSION}"`,
    `created_by: ${author}`,
    `created_at: ${createdAt}`,
    'status: active',
    `classification: ${classification}`,
    `last_updated_by: ${author}`,
    `last_updated_at: ${createdAt}`,
    '---',
    ''
  ].join('\n');

  const body = [
    '## Why',
    '',
    why || '_(preencher manualmente — PRD não encontrado ou sem seção de Vision/Problem)_',
    '',
    '## What',
    '',
    what || '_(preencher manualmente — PRD não encontrado ou sem seção de Escopo)_',
    '',
    '## Code Map',
    '',
    '```yaml',
    'files: []',
    'modules: []',
    'patterns: []',
    '```',
    '',
    '## Rules & Design-Docs aplicáveis',
    '',
    '_(vazio — populado a partir da Phase 2)_',
    '',
    '## Agent Trail',
    '',
    '_(vazio — populado a partir da Phase 2)_',
    '',
    '## Revision Requests',
    '',
    '_(vazio — populado a partir da Phase 2)_',
    ''
  ].join('\n');

  return fm + body;
}

async function init({
  slug,
  contextDir,
  classification = 'MEDIUM',
  author = DEFAULT_AUTHOR,
  now = () => new Date(),
  prdContent,
  whyText,
  whatText
} = {}) {
  if (!isValidSlug(slug)) {
    const err = new Error(`invalid slug (must be kebab-case): ${JSON.stringify(slug)}`);
    err.code = 'EDOSSIERSLUG';
    throw err;
  }
  if (typeof contextDir !== 'string' || !contextDir) {
    throw new TypeError('init: contextDir must be a non-empty string');
  }

  const dir = featureDir(contextDir, slug);
  const filePath = dossierPath(contextDir, slug);

  let prd = prdContent;
  if (prd === undefined) {
    const candidate = prdPath(contextDir, slug);
    if (await fileExists(candidate)) {
      prd = await fs.readFile(candidate, 'utf8');
    }
  }

  const why = whyText !== undefined ? whyText : extractPrdSection(prd, ['Problem', 'Why', 'Vision']);
  const what = whatText !== undefined ? whatText : extractPrdSection(prd, ['Escopo do MVP', 'Scope', 'What']);

  const createdAt = now().toISOString();
  const markdown = buildDossierMarkdown({
    slug,
    classification,
    createdAt,
    author,
    why,
    what
  });

  // Validate before writing — fail fast if our own builder produces invalid output.
  const fmValidation = validateFrontmatter({
    feature_slug: slug,
    schema_version: SCHEMA_VERSION,
    created_by: author,
    created_at: createdAt,
    status: 'active',
    classification,
    last_updated_by: author,
    last_updated_at: createdAt
  });
  if (!fmValidation.valid) {
    const err = new Error(`refusing to write invalid dossier: ${fmValidation.errors.join('; ')}`);
    err.code = 'EDOSSIERSCHEMA';
    err.errors = fmValidation.errors;
    throw err;
  }

  await fs.mkdir(dir, { recursive: true });
  let fh;
  try {
    fh = await fs.open(filePath, 'wx');
  } catch (err) {
    if (err && err.code === 'EEXIST') {
      const e = new Error(`dossier already exists at ${filePath}`);
      e.code = 'EDOSSIEREXISTS';
      e.path = filePath;
      throw e;
    }
    throw err;
  }
  try {
    await fh.writeFile(markdown);
  } finally {
    await fh.close();
  }

  return { path: filePath, dir, frontmatter: fmValidation, sections: parseSections(markdown) };
}

async function read({ slug, contextDir } = {}) {
  if (!isValidSlug(slug)) {
    const err = new Error(`invalid slug (must be kebab-case): ${JSON.stringify(slug)}`);
    err.code = 'EDOSSIERSLUG';
    throw err;
  }
  const filePath = dossierPath(contextDir, slug);
  let raw;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      const e = new Error(`dossier not found for slug "${slug}" at ${filePath}`);
      e.code = 'EDOSSIERMISSING';
      e.path = filePath;
      throw e;
    }
    throw err;
  }

  const fmParse = parseFrontmatter(raw);
  if (!fmParse.ok) {
    const err = new Error(`malformed dossier frontmatter at ${filePath}: ${fmParse.reason}`);
    err.code = 'EDOSSIERPARSE';
    err.path = filePath;
    throw err;
  }

  // Schema validation — fail loud, never silent.
  assertFrontmatter(fmParse.data);

  return {
    path: filePath,
    raw,
    frontmatter: fmParse.data,
    sections: parseSections(raw)
  };
}

async function show({ slug, contextDir } = {}) {
  const { raw, frontmatter, sections, path: p } = await read({ slug, contextDir });

  // Check for corrupted dossier-history.md (if present)
  let historyWarn = null;
  const hp = path.join(path.dirname(p), 'dossier-history.md');
  try {
    const histRaw = await fs.readFile(hp, 'utf8');
    if (typeof histRaw !== 'string') historyWarn = 'history_corrupted';
  } catch (err) {
    if (err && err.code !== 'ENOENT') historyWarn = 'history_corrupted';
    // ENOENT = absent, not corrupted — silently ignore
  }

  const header = [
    `# Dossier — ${frontmatter.feature_slug} (${frontmatter.classification})`,
    `status=${frontmatter.status} schema=${frontmatter.schema_version} updated=${frontmatter.last_updated_at}`,
    `path: ${p}`,
    ''
  ].join('\n');
  return { header, raw, frontmatter, sections, path: p, warn: historyWarn };
}

// Append-only write to a named ## section in dossier.md.
// Uses SHA-256 of (section + content) for dedup — repeated calls with same args are no-ops.
async function addFinding({ slug, contextDir, agent, section, content, now = () => new Date() } = {}) {
  if (!isValidSlug(slug)) {
    const err = new Error(`invalid slug: ${JSON.stringify(slug)}`);
    err.code = 'EDOSSIERSLUG';
    throw err;
  }
  const filePath = dossierPath(contextDir, slug);
  let raw;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      const e = new Error(`dossier not found for slug "${slug}" at ${filePath}`);
      e.code = 'EDOSSIERMISSING';
      e.path = filePath;
      throw e;
    }
    throw err;
  }

  // SF-project-09: strip zero-width / bidi / HTML-comment injection carriers
  // from author-supplied content before it lands in the Agent Trail (read by
  // every chain agent at session start).
  const safeContent = stripInjectionChars(String(content || ''));

  const hash = crypto.createHash('sha256').update(`${section}\0${safeContent}`).digest('hex');
  const hashMarker = `<!-- sha256:${hash} -->`;

  // Idempotency: if hash already present, no-op silently
  if (raw.includes(hashMarker)) {
    return { added: false, hash };
  }

  const timestamp = now().toISOString();
  const entry = [
    hashMarker,
    `**${timestamp}** | @${agent} | _${section}_`,
    '',
    safeContent.trim(),
    ''
  ].join('\n');

  // Append inside ## Agent Trail (or after it if not found)
  const lines = raw.split('\n');
  let trailEnd = lines.length;
  let inTrail = false;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trimEnd() === '## Agent Trail') {
      inTrail = true;
    } else if (inTrail && /^## /.test(lines[i])) {
      trailEnd = i;
      break;
    }
  }

  // Insert before the next section (or at end of file)
  const before = lines.slice(0, trailEnd);
  const after = lines.slice(trailEnd);

  // Trim trailing blank lines from before to avoid double blanks
  while (before.length > 0 && before[before.length - 1].trim() === '') before.pop();
  before.push('', entry.trimEnd());

  const rebuilt = [...before, '', ...after].join('\n');
  await fs.writeFile(filePath, rebuilt, 'utf8');

  return { added: true, hash };
}

module.exports = {
  FEATURES_SUBDIR,
  DOSSIER_FILENAME,
  DEFAULT_AUTHOR,
  REQUIRED_SECTIONS,
  featureDir,
  dossierPath,
  prdPath,
  parseFrontmatter,
  parseSections,
  buildDossierMarkdown,
  addFinding,
  init,
  read,
  show
};
