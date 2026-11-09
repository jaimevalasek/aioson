'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { isValidSlug } = require('./schema');

const FEATURES_SUBDIR = 'features';
const DOSSIER_FILENAME = 'dossier.md';
const HISTORY_FILENAME = 'dossier-history.md';
const TRAIL_ARCHIVE_FILENAME = 'dossier-trail-archive.md';
const MAX_ACTIVE_SIZE = 15000;
const TARGET_ACTIVE_SIZE = 10000;
// The newest Agent Trail entries always stay in the dossier, whatever their size.
const TRAIL_KEEP_ENTRIES = 8;

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

function trailArchivePath(contextDir, slug) {
  return path.join(contextDir, FEATURES_SUBDIR, slug, TRAIL_ARCHIVE_FILENAME);
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

// ─── Agent Trail archive ─────────────────────────────────────────────────────
//
// Every chain agent reads the dossier at session start, and the Agent Trail
// only ever grew: one real feature's dossier reached 97 KB, almost all trail.
// Past the size budget, the oldest entries move — verbatim, oldest first — to
// dossier-trail-archive.md beside it; the newest TRAIL_KEEP_ENTRIES always
// stay. One pointer line stays where they were, with how many moved, their
// dates and the phases they name, so an agent looking for an earlier phase's
// evidence or verdict knows to open the archive.

const TRAIL_POINTER = /^_\((\d+) older Agent Trail entr(?:y|ies)(?:, (\d{4}-\d{2}-\d{2}) to (\d{4}-\d{2}-\d{2}))?, are in \[dossier-trail-archive\.md\]\(dossier-trail-archive\.md\)(?:; phases they name: ([0-9, ]+))?\./;
const HASH_MARKER = /^<!--\s*sha256:/;

/**
 * The trail's entries: an add-finding block opens at its hash marker; before the
 * first marker, a hand-written entry opens at a top-level bullet or a ### line.
 * Lines that open nothing stay with the entry before them.
 */
function splitTrail(lines) {
  const head = [];
  const entries = [];
  let pointer = null;
  let marked = false;
  for (const line of lines) {
    if (TRAIL_POINTER.test(line.trim())) { pointer = line.trim(); continue; }
    const isMarker = HASH_MARKER.test(line);
    if (isMarker) marked = true;
    const opens = isMarker || (!marked && (/^[-*]\s+\S/.test(line) || /^###\s/.test(line)));
    if (opens) entries.push([line]);
    else if (entries.length > 0) entries[entries.length - 1].push(line);
    else head.push(line);
  }
  return { head, entries, pointer };
}

function entryText(entry) {
  return entry.join('\n').replace(/\s+$/, '');
}

function phasesNamed(text) {
  const phases = new Set();
  for (const match of String(text).matchAll(/\b(?:phase|fase|etapa)\s+(\d+)\b/gi)) phases.add(Number(match[1]));
  return phases;
}

function datesOf(text) {
  return [...String(text).matchAll(/\b(\d{4}-\d{2}-\d{2})/g)].map((match) => match[1]).sort();
}

function pointerLine(previous, movedText) {
  const old = previous ? TRAIL_POINTER.exec(previous) : null;
  const count = (old ? Number(old[1]) : 0) + movedText.count;
  const dates = [...(old && old[2] ? [old[2], old[3]] : []), ...datesOf(movedText.text)].sort();
  const phases = new Set([...(old && old[4] ? old[4].split(',').map((item) => Number(item.trim())) : []), ...phasesNamed(movedText.text)]);
  const span = dates.length > 0 ? `, ${dates[0]} to ${dates[dates.length - 1]}` : '';
  const named = phases.size > 0 ? `; phases they name: ${[...phases].sort((a, b) => a - b).join(', ')}` : '';
  return `_(${count} older Agent Trail ${count === 1 ? 'entry' : 'entries'}${span}, are in [dossier-trail-archive.md](dossier-trail-archive.md)${named}. Read it for an earlier phase's evidence, verdict or decision.)_`;
}

/**
 * The dossier text with its oldest trail entries cut until it fits
 * TARGET_ACTIVE_SIZE (keeping the newest TRAIL_KEEP_ENTRIES), and the cut text;
 * null when nothing can move.
 */
function planTrailArchive(raw) {
  const lines = raw.split('\n');
  const start = lines.findIndex((line) => line.trimEnd() === '## Agent Trail');
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^## /.test(lines[i])) { end = i; break; }
  }
  const { head, entries, pointer } = splitTrail(lines.slice(start + 1, end));
  if (entries.length <= TRAIL_KEEP_ENTRIES) return null;

  let size = Buffer.byteLength(raw, 'utf8');
  let cut = 0;
  while (cut < entries.length - TRAIL_KEEP_ENTRIES && size > TARGET_ACTIVE_SIZE) {
    size -= Buffer.byteLength(`${entries[cut].join('\n')}\n`, 'utf8');
    cut += 1;
  }
  if (cut === 0) return null;

  const moved = entries.slice(0, cut).map(entryText);
  const movedText = { count: cut, text: moved.join('\n') };
  const headText = head.join('\n').replace(/\s+$/, '');
  const trail = [
    ...(headText ? [headText, ''] : ['']),
    pointerLine(pointer, movedText),
    '',
    ...entries.slice(cut).map(entryText).flatMap((text) => [text, '']),
  ];
  const rebuilt = [...lines.slice(0, start + 1), ...trail, ...lines.slice(end)].join('\n');
  return { raw: rebuilt, moved, count: cut };
}

/**
 * Moves the oldest Agent Trail entries to dossier-trail-archive.md once the
 * dossier passes MAX_ACTIVE_SIZE (or always with `force`). The archive is
 * append-only and keeps its own `## Agent Trail` heading, so every trail reader
 * (retro, add-finding idempotency) reads it the same way.
 */
async function archiveTrail({ slug, contextDir, force = false } = {}) {
  if (!isValidSlug(slug)) return { archived: false, reason: 'invalid_slug' };
  const p = dossierPath(contextDir, slug);
  let raw;
  try { raw = await fs.readFile(p, 'utf8'); } catch { return { archived: false, reason: 'missing' }; }
  if (!force && Buffer.byteLength(raw, 'utf8') <= MAX_ACTIVE_SIZE) return { archived: false, reason: 'size_ok' };
  const plan = planTrailArchive(raw);
  if (!plan) return { archived: false, reason: 'nothing_to_archive', sizeBytes: Buffer.byteLength(raw, 'utf8') };

  const ap = trailArchivePath(contextDir, slug);
  let archive;
  try {
    archive = await fs.readFile(ap, 'utf8');
  } catch {
    archive = `# Agent Trail archive — ${slug}\n\nOlder entries moved from dossier.md as it grew, verbatim, oldest first.\n\n## Agent Trail\n`;
  }
  const appended = `${archive.replace(/\s+$/, '')}\n\n${plan.moved.join('\n\n')}\n`;
  // Archive first: a crash between the two writes duplicates entries, never loses them.
  await fs.writeFile(ap, appended, 'utf8');
  await fs.writeFile(p, plan.raw, 'utf8');
  return { archived: true, entries: plan.count, activeSizeBytes: Buffer.byteLength(plan.raw, 'utf8'), archivePath: ap };
}

async function readTrailArchive({ slug, contextDir } = {}) {
  try { return await fs.readFile(trailArchivePath(contextDir, slug), 'utf8'); } catch { return ''; }
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
  let historyContent;
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
    // The sections that close with their gates are gone: the trail is what grew.
    const trail = await archiveTrail({ slug, contextDir, force });
    if (trail.archived) return { compacted: true, migratedSections: [], archivedTrailEntries: trail.entries, activeSizeBytes: trail.activeSizeBytes, historyPath: hp };
    return { compacted: false, reason: 'nothing_migratable', sizeBytes: Buffer.byteLength(raw, 'utf8') };
  }

  const newRaw = joinSections(frontmatter, activeSections);
  await fs.writeFile(p, newRaw, 'utf8');
  // History is append-only
  await fs.writeFile(hp, historyContent, 'utf8');
  const trail = await archiveTrail({ slug, contextDir });

  return {
    compacted: true,
    migratedSections: migratedHeadings,
    ...(trail.archived ? { archivedTrailEntries: trail.entries } : {}),
    activeSizeBytes: trail.archived ? trail.activeSizeBytes : Buffer.byteLength(newRaw, 'utf8'),
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

module.exports = {
  compact,
  shouldCompact,
  archiveTrail,
  readTrailArchive,
  planTrailArchive,
  MAX_ACTIVE_SIZE,
  TARGET_ACTIVE_SIZE,
  TRAIL_KEEP_ENTRIES,
  dossierPath,
  historyPath,
  trailArchivePath
};
