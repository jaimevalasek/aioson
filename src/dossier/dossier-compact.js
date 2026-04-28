'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { isValidSlug } = require('./schema');

const FEATURES_SUBDIR = 'features';
const DOSSIER_FILENAME = 'dossier.md';
const HISTORY_FILENAME = 'dossier-history.md';
const MAX_ACTIVE_SIZE = 15000;
const TARGET_ACTIVE_SIZE = 10000;

// Sections whose content can be migrated once the gate they belong to is closed.
// The ordering reflects which gates close first in MEDIUM flow.
const MIGRATABLE_SECTIONS = [
  'Why',
  'What',
  'Rules & Design-Docs aplicáveis'
];

function dossierPath(contextDir, slug) {
  return path.join(contextDir, FEATURES_SUBDIR, slug, DOSSIER_FILENAME);
}

function historyPath(contextDir, slug) {
  return path.join(contextDir, FEATURES_SUBDIR, slug, HISTORY_FILENAME);
}

function splitSections(raw) {
  const result = [];
  const lines = raw.split('\n');
  let current = null;
  let buf = [];
  let frontmatter = null;
  let inFm = false;
  let fmClosed = false;
  let fmBuf = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!fmClosed) {
      if (i === 0 && line === '---') { inFm = true; fmBuf.push(line); continue; }
      if (inFm) {
        fmBuf.push(line);
        if (line === '---' && i > 0) { fmClosed = true; frontmatter = fmBuf.join('\n'); continue; }
        continue;
      }
      fmClosed = true;
    }
    const m = line.match(/^##\s+(.+?)\s*$/);
    if (m) {
      if (current !== null) result.push({ heading: current, lines: buf });
      current = m[1].trim();
      buf = [];
    } else {
      if (current !== null) buf.push(line);
    }
  }
  if (current !== null) result.push({ heading: current, lines: buf });
  return { frontmatter, sections: result };
}

function joinSections(frontmatter, sections) {
  const parts = [];
  if (frontmatter) parts.push(frontmatter, '');
  for (const sec of sections) {
    parts.push(`## ${sec.heading}`);
    parts.push(...sec.lines);
  }
  return parts.join('\n');
}

async function compact({ slug, contextDir, now = () => new Date(), force = false } = {}) {
  if (!isValidSlug(slug)) {
    const err = new Error(`invalid slug: ${JSON.stringify(slug)}`);
    err.code = 'EDOSSIERSLUG';
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

  if (!force && Buffer.byteLength(raw, 'utf8') <= MAX_ACTIVE_SIZE) {
    return { compacted: false, reason: 'size_ok', sizeBytes: Buffer.byteLength(raw, 'utf8') };
  }

  const { frontmatter, sections } = splitSections(raw);
  const date = now().toISOString().slice(0, 10);
  const hp = historyPath(contextDir, slug);

  // Load or initialize history
  let historyContent = '';
  try {
    historyContent = await fs.readFile(hp, 'utf8');
  } catch {
    historyContent = `# Dossier History — ${slug}\n\n`;
  }

  const migratedHeadings = [];
  const activeSections = [];

  for (const sec of sections) {
    const body = sec.lines.join('\n').trim();
    const isEmpty = !body || body.startsWith('_(vazio') || body.startsWith('_(empty') || body.startsWith('_(preencher');

    if (MIGRATABLE_SECTIONS.includes(sec.heading) && !isEmpty) {
      // Append to history (append-only, never compact again)
      const anchor = sec.heading.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-');
      historyContent += `\n## [Migrated from active dossier on ${date}] ${sec.heading} {#${anchor}-${date}}\n\n${body}\n`;
      migratedHeadings.push(sec.heading);

      // Replace in active with summary + link
      activeSections.push({
        heading: sec.heading,
        lines: [``, `_(migrated to [dossier-history.md](dossier-history.md#${anchor}-${date}))_`, ``]
      });
    } else {
      activeSections.push(sec);
    }
  }

  if (migratedHeadings.length === 0) {
    return { compacted: false, reason: 'nothing_migratable', sizeBytes: Buffer.byteLength(raw, 'utf8') };
  }

  const newRaw = joinSections(frontmatter, activeSections);
  await fs.writeFile(p, newRaw, 'utf8');
  // History is append-only
  await fs.writeFile(hp, historyContent, 'utf8');

  return {
    compacted: true,
    migratedSections: migratedHeadings,
    activeSizeBytes: Buffer.byteLength(newRaw, 'utf8'),
    historyPath: hp
  };
}

async function shouldCompact({ slug, contextDir } = {}) {
  const p = dossierPath(contextDir, slug);
  try {
    const stat = await fs.stat(p);
    return stat.size > MAX_ACTIVE_SIZE;
  } catch {
    return false;
  }
}

module.exports = { compact, shouldCompact, MAX_ACTIVE_SIZE, TARGET_ACTIVE_SIZE, dossierPath, historyPath };
