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
const KNOWN_STATUSES = new Set([
  'planning', 'in_progress', 'paused', 'qa_failed', 'qa_blocked', 'done', 'abandoned'
]);
// Spellings agents and owners write by hand, measured on consumer indexes
// (`in-progress`, `active`, `em andamento`…). Every reader matches the
// canonical token exactly, so an alias row is invisible to routing, sweep and
// hygiene. Delivery spellings (`completed`, `shipped`) are deliberately absent:
// `done` comes only from feature:close and its gates.
const STATUS_ALIASES = new Map([
  ...['in_progress', 'inprogress', 'active', 'wip', 'doing', 'ongoing', 'em_andamento', 'andamento', 'em_progresso']
    .map((alias) => [alias, 'in_progress']),
  ...['paused', 'on_hold', 'hold', 'pausado', 'pausada', 'suspended', 'suspenso', 'suspensa']
    .map((alias) => [alias, 'paused']),
  ...['planning', 'planned', 'draft', 'todo', 'to_do', 'backlog', 'planejamento', 'planejado', 'planejada', 'rascunho']
    .map((alias) => [alias, 'planning']),
  ...['abandoned', 'cancelled', 'canceled', 'dropped', 'discarded', 'cancelado', 'cancelada', 'abandonado', 'abandonada', 'descartado', 'descartada']
    .map((alias) => [alias, 'abandoned']),
  ['qa_failed', 'qa_failed'], ['failed_qa', 'qa_failed'],
  ['qa_blocked', 'qa_blocked'], ['blocked_qa', 'qa_blocked'],
  ['done', 'done']
]);

/** Canonical status for a hand-written spelling, or null when it has none. */
function canonicalStatus(raw) {
  const key = String(raw || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .trim().toLowerCase().replace(/[\s-]+/g, '_');
  return STATUS_ALIASES.get(key) || null;
}

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
// Lines this module writes itself; they are regenerated, never kept as notes.
const GENERATED_LINES = [
  /^#\s+/, // the title
  /^Rows only\b/, // the intro line
  /^Run `aioson feature:tidy/ // the legacy-notes hint
];

function isGeneratedLine(trimmed) {
  return SECTION_HEADING.test(trimmed) || SUMMARY_LINE.test(trimmed) || GENERATED_LINES.some((re) => re.test(trimmed));
}

function rowFromCells(cells) {
  const raw = cells[1] || 'unknown';
  return {
    slug: cells[0],
    // An alias is rewritten to its canonical token on the next write; a
    // status with no canonical meaning is kept verbatim (section "Other").
    status: canonicalStatus(raw) || raw,
    rawStatus: raw,
    started: cells[2] || EMPTY_CELL,
    completed: cells[3] || EMPTY_CELL,
    extra: cells.slice(4)
  };
}

/** One `|` line: header, separator or data row. Mutates the parse state. */
function readTableLine(state, trimmed) {
  if (!state.inRun) state.headerSeenInRun = false;
  state.inRun = true;
  const cells = splitCells(trimmed);
  if (isHeaderRow(cells)) {
    state.headerSeenInRun = true;
    if (!state.columns) state.columns = cells.map((cell) => cell || '');
    return;
  }
  if (isSeparatorRow(cells) || !cells[0]) return;
  if (!state.headerSeenInRun) state.headerlessRows += 1;
  const row = rowFromCells(cells);
  const existing = state.bySlug.get(row.slug);
  if (existing) {
    // Last row wins — the same rule parseFeaturesMap (workflow routing)
    // applies. The earlier row is kept verbatim as a note, never dropped.
    state.superseded.push({ slug: row.slug, text: `${row.slug}: superseded duplicate row ${trimmed}` });
    Object.assign(existing, row);
    return;
  }
  state.bySlug.set(row.slug, row);
  state.rows.push(row);
}

function collectNotes(comments, state) {
  const knownSlugs = new Set(state.rows.map((row) => row.slug));
  const notes = comments.filter(Boolean).map((text) => ({ slug: noteSlug(text, knownSlugs), text, kind: 'comment' }));
  if (state.prose.length > 0) notes.push({ slug: null, text: state.prose.join('\n'), kind: 'prose' });
  for (const entry of state.superseded) {
    notes.push({ slug: SAFE_SLUG.test(entry.slug) ? entry.slug : null, text: entry.text, kind: 'superseded_row' });
  }
  return notes;
}

function measure(raw, state, notes, unclosed) {
  const visible = notes.filter((note) => note.kind !== 'superseded_row');
  return {
    bytes: Buffer.byteLength(raw, 'utf8'),
    rows: state.rows.length,
    notes: visible.length,
    noteBytes: visible.reduce((sum, note) => sum + Buffer.byteLength(note.text, 'utf8'), 0),
    headerlessRows: state.headerlessRows,
    unclosedComment: unclosed,
    duplicates: state.superseded.length,
    aliasStatuses: state.rows.filter((row) => row.rawStatus !== row.status).length
  };
}

function parseFeatureRegistry(content) {
  const raw = String(content || '');
  const { comments, plain, unclosed } = extractComments(raw);
  const state = {
    columns: null, rows: [], bySlug: new Map(), superseded: [], prose: [],
    headerlessRows: 0, headerSeenInRun: false, inRun: false
  };

  for (const line of plain.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('|')) {
      readTableLine(state, trimmed);
      continue;
    }
    state.inRun = false;
    if (trimmed && !isGeneratedLine(trimmed)) state.prose.push(trimmed);
  }

  const notes = collectNotes(comments, state);
  const columns = state.columns && state.columns.length >= DEFAULT_COLUMNS.length ? state.columns : DEFAULT_COLUMNS.slice();
  return {
    // Comments alone are fine (a fresh file); free prose with no rows is a
    // hand-made format this module will not restructure.
    recognized: state.rows.length > 0 || state.prose.length === 0,
    columns,
    rows: state.rows,
    notes,
    measures: measure(raw, state, notes, unclosed)
  };
}

function needsTidy(measures) {
  return Boolean(
    measures &&
      (measures.notes > 0 || measures.headerlessRows > 0 || measures.unclosedComment || measures.duplicates > 0 ||
        measures.aliasStatuses > 0)
  );
}

/** i18n params for the doctor/update advisory. */
function featureRegistryParams(measures) {
  const m = measures || {};
  return {
    notes: m.notes || 0,
    noteKb: ((m.noteBytes || 0) / 1024).toFixed(1),
    totalKb: ((m.bytes || 0) / 1024).toFixed(1),
    headerless: m.headerlessRows || 0,
    aliases: m.aliasStatuses || 0
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

const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;

/** Newest first by completed, then started; undated rows keep file order at the end. */
function newestFirst(rows) {
  const key = (row) => (ISO_DATE.test(row.completed) ? row.completed : '') + (ISO_DATE.test(row.started) ? row.started : '');
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const left = key(a.row);
      const right = key(b.row);
      if (left !== right) {
        if (!left) return 1;
        if (!right) return -1;
        return left < right ? 1 : -1;
      }
      return a.index - b.index;
    })
    .map((entry) => entry.row);
}

// One section per situation. "In progress" keeps FILE ORDER: the workflow
// binding reads "the last in_progress row", so those rows never move relative
// to each other. Closed sections read newest first.
const SECTIONS = [
  { heading: 'In progress', label: 'in progress', statuses: ['in_progress', 'qa_failed', 'qa_blocked'], order: 'file' },
  { heading: 'Planning', label: 'planning', statuses: ['planning'], order: 'file' },
  { heading: 'Paused', label: 'paused', statuses: ['paused'], order: 'file' },
  { heading: 'Done', label: 'done', statuses: ['done'], order: 'newest' },
  { heading: 'Abandoned', label: 'abandoned', statuses: ['abandoned'], order: 'newest' }
];
const OTHER_SECTION = { heading: 'Other', label: 'other', order: 'file' };
const SECTION_HEADING = /^##\s+(in progress|planning|paused|done|abandoned|other|active|closed|legacy notes)\s*$/i;
const SUMMARY_LINE = /^\d+ (in progress|planning|paused|done|abandoned|other)( · \d+ [a-z ]+)*$/;

function groupRows(rows) {
  const known = new Set(SECTIONS.flatMap((section) => section.statuses));
  const groups = SECTIONS.map((section) => ({
    ...section,
    rows: rows.filter((row) => section.statuses.includes(row.status))
  }));
  groups.push({ ...OTHER_SECTION, rows: rows.filter((row) => !known.has(row.status)) });
  for (const group of groups) {
    if (group.order === 'newest') group.rows = newestFirst(group.rows);
  }
  return groups.filter((group) => group.rows.length > 0);
}

/**
 * Canonical features.md: title, one intro line, a count summary, one table per
 * situation (empty ones omitted), and — only while legacy notes were not
 * relocated yet — those notes verbatim at the bottom.
 */
function serializeFeatureRegistry(registry, { keepNotes = [] } = {}) {
  const groups = groupRows(registry.rows);
  const parts = [
    '# Features',
    '',
    'Rows only — written by `aioson feature:register` and `aioson feature:close`. Notes and decisions belong in the feature folder (`.aioson/context/features/{slug}/`), never here.',
    ''
  ];
  if (groups.length === 0) {
    parts.push('## In progress', '', renderTable(registry.columns, []), '');
  } else {
    parts.push(groups.map((group) => `${group.rows.length} ${group.label}`).join(' · '), '');
    for (const group of groups) {
      parts.push(`## ${group.heading}`, '', renderTable(registry.columns, group.rows), '');
    }
  }
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
  // Abandoned features are archived too: a note must not recreate a live
  // features/{slug}/ folder that the sweep would only move back.
  for (const bucket of ['done', 'abandoned']) {
    const archivedDossier = path.join(ctxDir, bucket, slug, 'dossier');
    if (await exists(archivedDossier)) return path.join(archivedDossier, NOTES_FILE);
    const archived = path.join(ctxDir, bucket, slug);
    if (await exists(archived)) return path.join(archived, NOTES_FILE);
  }
  return path.join(ctxDir, 'features', slug, NOTES_FILE);
}

/**
 * Append notes to their destination files. Idempotent: a note whose exact
 * text is already in the destination is not written twice.
 */
async function readOptional(file) {
  try {
    return await fs.readFile(file, 'utf8');
  } catch {
    return '';
  }
}

async function appendNotesFile(dest, slug, current, fresh, now) {
  const header = current
    ? ''
    : `# Registry notes${slug ? ` — ${slug}` : ''}\n\nMoved verbatim out of \`.aioson/context/features.md\`, which holds rows only.\n`;
  const separator = current && !current.endsWith('\n') ? '\n' : '';
  const block = fresh.map((note) => note.text).join('\n\n');
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, `${current}${separator}${header}\n## Moved on ${today(now)}\n\n${block}\n`, 'utf8');
}

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
    // eslint-disable-next-line no-await-in-loop
    const current = await readOptional(dest);
    const fresh = group.notes.filter((note) => !current.includes(note.text));
    moved.push({
      slug: group.slug,
      path: path.relative(path.dirname(path.dirname(ctxDir)), dest).replace(/\\/g, '/'),
      notes: group.notes.length,
      written: fresh.length,
      bytes: fresh.reduce((sum, note) => sum + Buffer.byteLength(note.text, 'utf8'), 0)
    });
    // eslint-disable-next-line no-await-in-loop
    if (!dryRun && fresh.length > 0) await appendNotesFile(dest, group.slug, current, fresh, now);
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
    normalized: registry.rows
      .filter((row) => row.rawStatus !== row.status)
      .map((row) => ({ slug: row.slug, from: row.rawStatus, to: row.status })),
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
  EMPTY_CELL,
  KNOWN_STATUSES,
  SAFE_SLUG,
  canonicalStatus,
  featureRegistryParams,
  inspectFeatureRegistry,
  parseFeatureRegistry,
  serializeFeatureRegistry,
  tidyFeatureRegistry,
  today,
  writeFeatureRow
};
