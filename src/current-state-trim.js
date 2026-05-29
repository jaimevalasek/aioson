'use strict';

// Pure engine for trimming bootstrap/current-state.md (P0 of the
// agent-loading-contract design-doc).
//
// The "## What the system already has" section is an append-only log that grows
// unbounded (newest entries prepended). Every implementation/continuity/review
// agent reads the whole file at activation, so this single section dominates the
// per-activation token cost.
//
// splitCurrentState() moves COLD entries (older than the keep window AND not tied
// to an active feature) out of that ONE section into a separate archive, keeping
// frontmatter and every OTHER section byte-for-byte. Nothing is ever deleted —
// archived entries are preserved verbatim and stay grep/`memory:search`-able.

const HOT_SECTION = '## What the system already has';

function detectEol(content) {
  return /\r\n/.test(String(content || '')) ? '\r\n' : '\n';
}

function splitLines(content) {
  return String(content || '').split(/\r?\n/);
}

function isEntry(line) {
  return /^- /.test(line);
}

// Locate the hot-log section: its header line index and the index of the next
// "## " header (or EOF). Returns null when the section is absent.
function locateSection(lines) {
  const headerIdx = lines.findIndex((l) => l.trim() === HOT_SECTION);
  if (headerIdx === -1) return null;
  let endIdx = lines.length;
  for (let i = headerIdx + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) { endIdx = i; break; }
  }
  return { headerIdx, endIdx };
}

function entryMatchesActiveSlug(entryText, activeSlugs) {
  return activeSlugs.some((s) => s && entryText.includes(s));
}

/**
 * Split current-state.md into hot content + the entries that should be archived.
 *
 * @param {string} content raw current-state.md
 * @param {object} opts
 * @param {number} [opts.keep=12] number of newest entries to keep HOT
 * @param {string[]} [opts.activeSlugs=[]] feature slugs whose entries are kept regardless of age
 * @returns {{ok:boolean, reason?:string, hotContent?:string, archivedEntries?:string[], stats?:object}}
 */
function splitCurrentState(content, { keep = 12, activeSlugs = [] } = {}) {
  const eol = detectEol(content);
  const lines = splitLines(content);
  const loc = locateSection(lines);
  if (!loc) return { ok: false, reason: 'section_not_found' };

  const { headerIdx, endIdx } = loc;
  const sectionBody = lines.slice(headerIdx + 1, endIdx);
  const entries = sectionBody.filter(isEntry);
  const totalEntries = entries.length;

  const kept = [];
  const archivedEntries = [];
  entries.forEach((entry, idx) => {
    const recent = idx < keep;                                // newest-first: top N stay
    const active = entryMatchesActiveSlug(entry, activeSlugs); // never archive active-feature history
    if (recent || active) kept.push(entry);
    else archivedEntries.push(entry);
  });

  // Section preamble = non-entry lines before the first bullet (the intro line).
  const firstEntryOffset = sectionBody.findIndex(isEntry);
  const preamble = firstEntryOffset === -1 ? sectionBody : sectionBody.slice(0, firstEntryOffset);
  const introLines = preamble.filter((l) => l.trim() !== '');
  const rest = lines.slice(endIdx); // next "## " section onward, kept verbatim

  const hotLines = [
    ...lines.slice(0, headerIdx + 1), // frontmatter … through the section header
    '',
    ...introLines,
    '',
    ...kept,
    '',
    ...rest
  ];
  const hotContent = hotLines.join(eol);

  const beforeBytes = Buffer.byteLength(content, 'utf8');
  const afterBytes = Buffer.byteLength(hotContent, 'utf8');
  return {
    ok: true,
    hotContent,
    archivedEntries,
    stats: {
      total_entries: totalEntries,
      kept: kept.length,
      archived: archivedEntries.length,
      keep,
      active_slugs: activeSlugs,
      before_bytes: beforeBytes,
      after_bytes: afterBytes,
      saved_bytes: Math.max(0, beforeBytes - afterBytes)
    }
  };
}

const ARCHIVE_HEADER = '## Archived capabilities';

function buildArchiveContent(existing, newEntries, nowIso, eol = '\n') {
  if (!newEntries.length) return existing || '';
  if (!existing || !existing.trim()) {
    return [
      '---',
      'generated_by: memory-trim',
      `updated_at: "${nowIso}"`,
      '---',
      '',
      '# Current State — Archive',
      '',
      '> Cold storage for `current-state.md` entries rolled off the hot log by `aioson memory:trim`.',
      '> Searchable (`memory:search` / grep); never loaded at agent activation. Append-only — never deleted.',
      '',
      ARCHIVE_HEADER,
      '',
      ...newEntries,
      ''
    ].join(eol);
  }
  // Prepend the new batch right after the archive header (newest-first), and
  // bump updated_at when present.
  const lines = existing.split(/\r?\n/);
  const headerIdx = lines.findIndex((l) => l.trim() === ARCHIVE_HEADER);
  let bumped = lines.map((l) =>
    /^updated_at\s*:/.test(l) ? `updated_at: "${nowIso}"` : l
  );
  if (headerIdx === -1) {
    return [...bumped, '', ...newEntries, ''].join(eol);
  }
  const insertAt = headerIdx + 1;
  const head = bumped.slice(0, insertAt);
  const tail = bumped.slice(insertAt);
  return [...head, '', ...newEntries, ...tail].join(eol);
}

/**
 * Parse in_progress feature slugs from a features.md pipe table.
 * @returns {string[]}
 */
function parseActiveSlugs(featuresMd) {
  return splitLines(featuresMd)
    .map((l) => l.split('|').map((c) => c.trim()))
    .filter((cols) => cols.length >= 4 && cols[2] === 'in_progress')
    .map((cols) => cols[1])
    .filter((slug) => slug && slug !== 'slug' && !/^-+$/.test(slug));
}

module.exports = {
  HOT_SECTION,
  ARCHIVE_HEADER,
  splitCurrentState,
  buildArchiveContent,
  parseActiveSlugs,
  // exported for tests
  locateSection,
  detectEol
};
