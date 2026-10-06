'use strict';

/**
 * features.md — the project's feature index — has one owner: this module.
 *
 * The index holds ROWS ONLY (slug, status, started, completed). Narrative
 * about a feature — decisions, scope history, why it paused — belongs in the
 * feature's own folder (`.aioson/context/features/{slug}/`), which travels
 * with the feature into `done/{slug}/dossier/` when `feature:close` archives
 * it. Measured on a long-lived project: 86% of a 32 KB index was HTML-comment
 * narrative that never left on close, and rows appended after those comments
 * landed outside any table header, so they no longer rendered as a table.
 *
 * Every writer (feature:close, feature:register, feature:tidy, doctor --fix)
 * goes through parse → mutate rows → serialize, so the file always comes out
 * as one canonical shape. Notes found in the file are never dropped: a writer
 * either keeps them verbatim at the bottom ("Legacy notes") or relocates them
 * losslessly to the owning feature's folder.
 */

const fs = require('node:fs/promises');
const path = require('node:path');

const FEATURES_FILE = 'features.md';
const NOTES_FILE = 'registry-notes.md';
const UNATTRIBUTED_NOTES_REL = path.join('done', NOTES_FILE);
const DEFAULT_COLUMNS = ['slug', 'status', 'started', 'completed'];
const EMPTY_CELL = '—';
const CLOSED_STATUSES = new Set(['done', 'abandoned']);
const KNOWN_STATUSES = new Set([
  'planning', 'in_progress', 'paused', 'qa_failed', 'qa_blocked', 'done', 'abandoned'
]);
// No dots and no separators: a slug is always a single safe path segment.
const SAFE_SLUG = /^[a-z0-9][a-z0-9_-]*$/;
const LEGACY_NOTES_HEADING = '## Legacy notes';

function today(now) {
  return (now ? now() : new Date()).toISOString().slice(0, 10);
}

function splitCells(line) {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((cell) => cell.trim());
}

function isSeparatorRow(cells) {
  return cells.length > 0 && cells.every((cell) => /^:?-{2,}:?$/.test(cell) || cell === '');
}

function isHeaderRow(cells) {
  return String(cells[0] || '').toLowerCase() === 'slug';
}

/**
 * Split content into comment spans and plain text. An unclosed `<!--` runs to
 * the end of the file (that is how Markdown renders it: everything after it
 * disappears).
 */
function extractComments(content) {
  const comments = [];
  let plain = '';
  let cursor = 0;
  let unclosed = false;
  while (cursor < content.length) {
    const open = content.indexOf('<!--', cursor);
    if (open === -1) {
      plain += content.slice(cursor);
      break;
    }
    plain += content.slice(cursor, open);
    const close = content.indexOf('-->', open + 4);
    if (close === -1) {
      comments.push(content.slice(open + 4).trim());
      unclosed = true;
      break;
    }
    comments.push(content.slice(open + 4, close).trim());
    // Keep the line structure: a comment that sat on its own line leaves a blank line.
    plain += '\n';
    cursor = close + 3;
  }
  return { comments, plain, unclosed };
}

function noteSlug(text, knownSlugs) {
  const match = String(text || '').match(/^([a-z0-9][a-z0-9_-]*)\s*:/);
  if (match && knownSlugs.has(match[1]) && SAFE_SLUG.test(match[1])) return match[1];
  return null;
}

/**
 * Parse features.md into rows + notes + measured defects.
 *
 * `recognized` is false only when the file has content but no pipe-table rows
 * (an unknown hand-made format) — writers then refuse to restructure it.
 */
function parseFeatureRegistry(content) {
  const raw = String(content || '');
  const { comments, plain, unclosed } = extractComments(raw);

  let columns = null;
  const rows = [];
  const bySlug = new Map();
  const superseded = [];
  const prose = [];
  let headerlessRows = 0;
  let headerSeenInRun = false;
  let inRun = false;

  for (const line of plain.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('|')) {
      if (!inRun) headerSeenInRun = false;
      inRun = true;
      const cells = splitCells(trimmed);
      if (isHeaderRow(cells)) {
        headerSeenInRun = true;
        if (!columns) columns = cells.map((cell) => cell || '');
        continue;
      }
      if (isSeparatorRow(cells)) continue;
      const slug = cells[0];
      if (!slug) continue;
      if (!headerSeenInRun) headerlessRows += 1;
      const row = {
        slug,
        status: cells[1] || 'unknown',
        started: cells[2] || EMPTY_CELL,
        completed: cells[3] || EMPTY_CELL,
        extra: cells.slice(4)
      };
      if (bySlug.has(slug)) {
        // Last row wins — the same rule parseFeaturesMap (workflow routing)
        // applies. The earlier row is kept verbatim as a note, never dropped.
        superseded.push({ slug, text: `${slug}: superseded duplicate row ${trimmed}` });
        Object.assign(bySlug.get(slug), row);
        continue;
      }
      bySlug.set(slug, row);
      rows.push(row);
      continue;
    }
    inRun = false;
    if (!trimmed) continue;
    if (/^#\s+/.test(trimmed)) continue; // the title is regenerated
    if (/^##\s+(active|closed|legacy notes)\s*$/i.test(trimmed)) continue;
    if (/^Rows only\b/.test(trimmed)) continue; // the canonical intro line
    if (/^Run `aioson feature:tidy/.test(trimmed)) continue; // the legacy-notes hint
    prose.push(trimmed);
  }

  const knownSlugs = new Set(rows.map((row) => row.slug));
  const notes = [];
  for (const text of comments) {
    if (!text) continue;
    notes.push({ slug: noteSlug(text, knownSlugs), text, kind: 'comment' });
  }
  if (prose.length > 0) {
    notes.push({ slug: null, text: prose.join('\n'), kind: 'prose' });
  }
  for (const entry of superseded) {
    notes.push({ slug: SAFE_SLUG.test(entry.slug) ? entry.slug : null, text: entry.text, kind: 'superseded_row' });
  }

  return {
    // Comments alone are fine (a fresh file); free prose with no rows is a
    // hand-made format this module will not restructure.
    recognized: rows.length > 0 || prose.length === 0,
    columns: columns && columns.length >= DEFAULT_COLUMNS.length ? columns : DEFAULT_COLUMNS.slice(),
    rows,
    notes,
    measures: {
      bytes: Buffer.byteLength(raw, 'utf8'),
      rows: rows.length,
      notes: notes.filter((note) => note.kind !== 'superseded_row').length,
      noteBytes: notes
        .filter((note) => note.kind !== 'superseded_row')
        .reduce((sum, note) => sum + Buffer.byteLength(note.text, 'utf8'), 0),
      headerlessRows,
      unclosedComment: unclosed,
      duplicates: superseded.length
    }
  };
}

function needsTidy(measures) {
  return Boolean(
    measures &&
      (measures.notes > 0 || measures.headerlessRows > 0 || measures.unclosedComment || measures.duplicates > 0)
  );
}

/** i18n params for the doctor/update advisory. */
function featureRegistryParams(measures) {
  const m = measures || {};
  return {
    notes: m.notes || 0,
    noteKb: ((m.noteBytes || 0) / 1024).toFixed(1),
    totalKb: ((m.bytes || 0) / 1024).toFixed(1),
    headerless: m.headerlessRows || 0
  };
}

function renderTable(columns, rows) {
  const cell = (value) => String(value == null || value === '' ? EMPTY_CELL : value).replace(/[\r\n|]+/g, ' ').trim();
  const lines = [
    `| ${columns.join(' | ')} |`,
    `|${columns.map((column) => '-'.repeat(Math.max(3, column.length + 2))).join('|')}|`
  ];
  for (const row of rows) {
    const cells = [row.slug, row.status, row.started, row.completed, ...(row.extra || [])];
    while (cells.length < columns.length) cells.push(EMPTY_CELL);
    lines.push(`| ${cells.map(cell).join(' | ')} |`);
  }
  return lines.join('\n');
}

/**
 * Canonical features.md: title, one intro line, an Active table (file order
 * preserved — workflow binding reads "the last in_progress row"), a Closed
 * table, and — only while legacy notes were not relocated yet — those notes
 * verbatim at the bottom.
 */
function serializeFeatureRegistry(registry, { keepNotes = [] } = {}) {
  const active = registry.rows.filter((row) => !CLOSED_STATUSES.has(row.status));
  const closed = registry.rows.filter((row) => CLOSED_STATUSES.has(row.status));
  const parts = [
    '# Features',
    '',
    'Rows only — written by `aioson feature:register` and `aioson feature:close`. Notes and decisions belong in the feature folder (`.aioson/context/features/{slug}/`), never here.',
    '',
    '## Active',
    '',
    renderTable(registry.columns, active),
    '',
    '## Closed',
    '',
    renderTable(registry.columns, closed),
    ''
  ];
  if (keepNotes.length > 0) {
    parts.push(LEGACY_NOTES_HEADING, '');
    parts.push('Run `aioson feature:tidy .` to move these notes to their feature folders.', '');
    for (const note of keepNotes) {
      parts.push(note.kind === 'prose' ? note.text : `<!-- ${note.text.replace(/-->/g, '-- >')} -->`, '');
    }
  }
  return `${parts.join('\n').replace(/\n+$/, '')}\n`;
}

function upsertRow(registry, { slug, status, started, completed }) {
  const existing = registry.rows.find((row) => row.slug === slug);
  if (existing) {
    if (status) existing.status = status;
    if (started) existing.started = started;
    if (completed) existing.completed = completed;
    return existing;
  }
  const row = {
    slug,
    status: status || 'planning',
    started: started || EMPTY_CELL,
    completed: completed || EMPTY_CELL,
    extra: []
  };
  registry.rows.push(row);
  return row;
}

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

/** Where a slug's relocated notes go: beside the feature, live or archived. */
async function notesDestination(ctxDir, slug) {
  if (!slug) return path.join(ctxDir, UNATTRIBUTED_NOTES_REL);
  const archivedDossier = path.join(ctxDir, 'done', slug, 'dossier');
  if (await exists(archivedDossier)) return path.join(archivedDossier, NOTES_FILE);
  const archived = path.join(ctxDir, 'done', slug);
  if (await exists(archived)) return path.join(archived, NOTES_FILE);
  return path.join(ctxDir, 'features', slug, NOTES_FILE);
}

/**
 * Append notes to their destination files. Idempotent: a note whose exact
 * text is already in the destination is not written twice.
 */
async function relocateNotes(ctxDir, notes, { dryRun = false, now } = {}) {
  const groups = new Map();
  for (const note of notes) {
    // eslint-disable-next-line no-await-in-loop
    const dest = await notesDestination(ctxDir, note.slug);
    if (!groups.has(dest)) groups.set(dest, { slug: note.slug, notes: [] });
    groups.get(dest).notes.push(note);
  }
  const moved = [];
  for (const [dest, group] of groups) {
    let current = '';
    try {
      // eslint-disable-next-line no-await-in-loop
      current = await fs.readFile(dest, 'utf8');
    } catch {
      current = '';
    }
    const fresh = group.notes.filter((note) => !current.includes(note.text));
    const bytes = fresh.reduce((sum, note) => sum + Buffer.byteLength(note.text, 'utf8'), 0);
    moved.push({
      slug: group.slug,
      path: path.relative(path.dirname(path.dirname(ctxDir)), dest).replace(/\\/g, '/'),
      notes: group.notes.length,
      written: fresh.length,
      bytes
    });
    if (dryRun || fresh.length === 0) continue;
    const header = current
      ? ''
      : `# Registry notes${group.slug ? ` — ${group.slug}` : ''}\n\nMoved verbatim out of \`.aioson/context/features.md\`, which holds rows only.\n`;
    const block = fresh.map((note) => note.text).join('\n\n');
    const stamp = `\n## Moved on ${today(now)}\n\n${block}\n`;
    // eslint-disable-next-line no-await-in-loop
    await fs.mkdir(path.dirname(dest), { recursive: true });
    // eslint-disable-next-line no-await-in-loop
    await fs.writeFile(dest, `${current}${current && !current.endsWith('\n') ? '\n' : ''}${header}${stamp}`, 'utf8');
  }
  return moved;
}

async function readRegistry(ctxDir) {
  const file = path.join(ctxDir, FEATURES_FILE);
  try {
    return { file, content: await fs.readFile(file, 'utf8') };
  } catch {
    return { file, content: null };
  }
}

/** Read-only measurement used by doctor, update and feature:tidy --dry-run. */
async function inspectFeatureRegistry(targetDir) {
  const ctxDir = path.join(targetDir, '.aioson', 'context');
  const { content } = await readRegistry(ctxDir);
  if (content === null) return { exists: false, recognized: true, needsTidy: false, measures: null };
  const registry = parseFeatureRegistry(content);
  return {
    exists: true,
    recognized: registry.recognized,
    needsTidy: registry.recognized && needsTidy(registry.measures),
    measures: registry.measures
  };
}

/**
 * Rewrite features.md canonically and relocate every note to its feature
 * folder. Keeps a byte-for-byte backup of the previous file.
 */
async function tidyFeatureRegistry(targetDir, { dryRun = false, now } = {}) {
  const ctxDir = path.join(targetDir, '.aioson', 'context');
  const { file, content } = await readRegistry(ctxDir);
  if (content === null) return { ok: true, changed: false, reason: 'no_registry', moved: [] };
  const registry = parseFeatureRegistry(content);
  if (!registry.recognized) return { ok: false, changed: false, reason: 'unrecognized_format', moved: [] };

  const next = serializeFeatureRegistry(registry);
  const changed = next !== content;
  const moved = await relocateNotes(ctxDir, registry.notes, { dryRun, now });
  let backup = null;
  if (changed && !dryRun) {
    const stamp = (now ? now() : new Date()).toISOString().replace(/[-:]/g, '').replace(/\..*$/, '').replace('T', '-');
    const backupPath = path.join(targetDir, '.aioson', 'backups', 'features-registry', `features-${stamp}.md`);
    await fs.mkdir(path.dirname(backupPath), { recursive: true });
    await fs.writeFile(backupPath, content, 'utf8');
    backup = path.relative(targetDir, backupPath).replace(/\\/g, '/');
    await fs.writeFile(file, next, 'utf8');
  }
  return {
    ok: true,
    changed,
    dryRun,
    before: registry.measures,
    afterBytes: Buffer.byteLength(next, 'utf8'),
    moved,
    backup
  };
}

/**
 * Upsert one row and rewrite the file canonically. Notes of `relocateSlug`
 * (the feature being closed) move to its folder; every other note is kept
 * verbatim at the bottom until `feature:tidy` runs.
 *
 * @returns {Promise<{written: boolean, recognized: boolean, relocated: Array, remainingNotes: number}>}
 */
async function writeFeatureRow(targetDir, row, { relocateSlug = null, now } = {}) {
  const ctxDir = path.join(targetDir, '.aioson', 'context');
  const { file, content } = await readRegistry(ctxDir);
  const registry = parseFeatureRegistry(content || '');
  if (!registry.recognized) return { written: false, recognized: false, relocated: [], remainingNotes: 0 };
  upsertRow(registry, row);
  const relocate = relocateSlug ? registry.notes.filter((note) => note.slug === relocateSlug) : [];
  const keep = registry.notes.filter((note) => !relocate.includes(note));
  const relocated = relocate.length > 0 ? await relocateNotes(ctxDir, relocate, { now }) : [];
  await fs.mkdir(ctxDir, { recursive: true });
  await fs.writeFile(file, serializeFeatureRegistry(registry, { keepNotes: keep }), 'utf8');
  return { written: true, recognized: true, relocated, remainingNotes: keep.length };
}

module.exports = {
  CLOSED_STATUSES,
  EMPTY_CELL,
  KNOWN_STATUSES,
  NOTES_FILE,
  SAFE_SLUG,
  featureRegistryParams,
  inspectFeatureRegistry,
  needsTidy,
  parseFeatureRegistry,
  relocateNotes,
  serializeFeatureRegistry,
  tidyFeatureRegistry,
  today,
  upsertRow,
  writeFeatureRow
};
