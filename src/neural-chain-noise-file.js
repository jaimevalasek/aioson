'use strict';

/**
 * Neural Chain — noise file write / lazy lifecycle (BR-NC-06).
 *
 * Produces `.aioson/context/noises/{feature-slug}-{YYYYMMDD-HHMM}.md` with a
 * YAML frontmatter + body of markdown checkboxes. One file per session in
 * `guarded` autonomy mode (other modes deferred to Slice 6 threshold rules).
 *
 * Lifecycle:
 *   writeNoiseFile()              — create file with `- [ ]` items.
 *   readNoiseFileAndRecompute()   — re-parse, count `- [x]`, surface stats.
 *   maybeDeleteNoiseFile()        — unlink when no pending items remain.
 *
 * No file watcher — recompute is lazy, triggered by callers (chain:audit,
 * @neo activation, agent_done hook). Idempotent unlink covers EC-NC-10.
 * Item granularity is file-level only (M1 BR-NC-09); `:symbol` deferred to V2.
 */

const fs = require('node:fs');
const path = require('node:path');

const NOISE_DIR_REL = path.join('.aioson', 'context', 'noises');

function formatTimestamp(date) {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const min = String(date.getUTCMinutes()).padStart(2, '0');
  return `${yyyy}${mm}${dd}-${hh}${min}`;
}

function sanitizeSlug(slug) {
  if (slug === null || slug === undefined) return 'unspecified';
  const s = String(slug)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'unspecified';
}

function buildNoiseFilePath({ targetDir, featureSlug, now }) {
  if (!targetDir || typeof targetDir !== 'string') {
    throw new Error('buildNoiseFilePath requires targetDir');
  }
  const slug = sanitizeSlug(featureSlug);
  const ts = formatTimestamp(now instanceof Date ? now : new Date());
  return path.join(targetDir, NOISE_DIR_REL, `${slug}-${ts}.md`);
}

function serializeItem(item) {
  const conf =
    typeof item.confidence === 'number' && Number.isFinite(item.confidence)
      ? item.confidence.toFixed(2)
      : String(item.confidence ?? '0.00');
  const sourceTag = item.source_file ? ` (source: ${item.source_file})` : '';
  return `- [ ] ${item.target_path} — ${item.edge_type} ${conf}${sourceTag}`;
}

function buildContent({ slug, editAtIso, autonomyMode, sourceFiles, items }) {
  const fm = [
    '---',
    `slug: ${slug}`,
    `edit_at: ${editAtIso}`,
    `autonomy_mode: ${autonomyMode}`,
    `source_files: ${JSON.stringify(sourceFiles)}`,
    `total_items: ${items.length}`,
    `resolved_items: 0`,
    '---'
  ].join('\n');
  const heading = '\n\n# Neural Chain — Impact Audit\n';
  const intro =
    '\nThe edits in this session may have impact on the files listed below. Tick each item once verified or addressed; this file is deleted automatically once all items are resolved.\n';
  const body =
    items.length === 0
      ? '\n*No impacts detected.*\n'
      : '\n' + items.map(serializeItem).join('\n') + '\n';
  return fm + heading + intro + body;
}

function flattenAudits(audits) {
  const items = [];
  const sourceFilesSet = new Set();
  for (const audit of audits || []) {
    if (!audit) continue;
    if (audit.source_file) sourceFilesSet.add(audit.source_file);
    if (!Array.isArray(audit.impacts)) continue;
    for (const impact of audit.impacts) {
      if (!impact || !impact.target_path) continue;
      items.push({
        target_path: String(impact.target_path),
        source_file: audit.source_file || null,
        edge_type: impact.edge_type ? String(impact.edge_type) : 'unknown',
        confidence:
          typeof impact.confidence === 'number' && Number.isFinite(impact.confidence)
            ? impact.confidence
            : 0
      });
    }
  }
  return { items, sourceFiles: Array.from(sourceFilesSet) };
}

function writeNoiseFile({
  targetDir,
  featureSlug,
  audits,
  autonomyMode = 'guarded',
  now = new Date()
}) {
  if (!targetDir || typeof targetDir !== 'string') {
    throw new Error('writeNoiseFile requires targetDir');
  }
  const stamp = now instanceof Date ? now : new Date();
  const { items, sourceFiles } = flattenAudits(audits);
  const slug = sanitizeSlug(featureSlug);
  const filePath = buildNoiseFilePath({ targetDir, featureSlug, now: stamp });

  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  const content = buildContent({
    slug,
    editAtIso: stamp.toISOString(),
    autonomyMode,
    sourceFiles,
    items
  });

  fs.writeFileSync(filePath, content, 'utf8');

  return {
    path: filePath,
    slug,
    items,
    total_items: items.length,
    source_files: sourceFiles
  };
}

function parseFrontmatter(text) {
  if (!text.startsWith('---\n') && !text.startsWith('---\r\n')) {
    return { ok: false, reason: 'missing_frontmatter', data: null, bodyOffset: 0 };
  }
  const lines = text.split(/\r?\n/);
  let closing = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === '---') {
      closing = i;
      break;
    }
  }
  if (closing === -1) {
    return { ok: false, reason: 'unclosed_frontmatter', data: null, bodyOffset: 0 };
  }

  const data = {};
  for (let i = 1; i < closing; i += 1) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const m = line.match(/^([a-zA-Z0-9_]+)\s*:\s*(.*)$/);
    if (!m) {
      return {
        ok: false,
        reason: 'invalid_line',
        data: null,
        bodyOffset: 0,
        badLine: line
      };
    }
    const key = m[1];
    const raw = m[2].trim();
    let val;
    if (raw === '') {
      val = '';
    } else if (raw.startsWith('[') && raw.endsWith(']')) {
      try {
        val = JSON.parse(raw);
      } catch {
        val = [];
      }
    } else if (
      (raw.startsWith('"') && raw.endsWith('"')) ||
      (raw.startsWith("'") && raw.endsWith("'"))
    ) {
      val = raw.slice(1, -1);
    } else if (raw === 'true') {
      val = true;
    } else if (raw === 'false') {
      val = false;
    } else if (/^-?\d+$/.test(raw)) {
      val = Number(raw);
    } else if (/^-?\d+\.\d+$/.test(raw)) {
      val = Number(raw);
    } else {
      val = raw;
    }
    data[key] = val;
  }

  const headerText = lines.slice(0, closing + 1).join('\n') + '\n';
  return { ok: true, data, bodyOffset: headerText.length };
}

function parseItems(body) {
  const items = [];
  const lines = body.split(/\r?\n/);
  const re = /^- \[([ xX])\] (.+?)(?: — (.+))?$/;
  for (const line of lines) {
    const m = re.exec(line);
    if (!m) continue;
    items.push({
      checked: m[1] === 'x' || m[1] === 'X',
      target_path: m[2].trim(),
      motivo: m[3] ? m[3].trim() : ''
    });
  }
  return items;
}

function readNoiseFileAndRecompute({ path: filePath }) {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('readNoiseFileAndRecompute requires path');
  }
  let text;
  try {
    text = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return {
        exists: false,
        frontmatter: null,
        frontmatterOk: false,
        frontmatterReason: 'not_found',
        items: [],
        allResolved: false,
        pendingCount: 0,
        resolvedCount: 0
      };
    }
    throw err;
  }

  const fm = parseFrontmatter(text);
  // EC-NC-09: corrupted frontmatter still allows body parsing — readable items preserved.
  const body = fm.ok ? text.slice(fm.bodyOffset) : text;
  const items = parseItems(body);
  const resolved = items.filter((i) => i.checked).length;
  const pending = items.length - resolved;

  const frontmatter = fm.ok ? { ...fm.data, resolved_items: resolved } : null;

  return {
    exists: true,
    frontmatter,
    frontmatterOk: fm.ok,
    frontmatterReason: fm.ok ? null : fm.reason,
    items,
    allResolved: items.length > 0 && pending === 0,
    pendingCount: pending,
    resolvedCount: resolved
  };
}

function maybeDeleteNoiseFile({ path: filePath }) {
  const r = readNoiseFileAndRecompute({ path: filePath });
  if (!r.exists) {
    return { deleted: false, reason: 'not_found' };
  }
  if (r.pendingCount === 0) {
    try {
      fs.unlinkSync(filePath);
      return {
        deleted: true,
        reason: r.items.length === 0 ? 'no_items' : 'all_resolved'
      };
    } catch (err) {
      // EC-NC-10: race between recompute and unlink — idempotent return.
      if (err && err.code === 'ENOENT') {
        return { deleted: false, reason: 'already_deleted' };
      }
      throw err;
    }
  }
  return { deleted: false, reason: 'pending_items', pendingCount: r.pendingCount };
}

module.exports = {
  writeNoiseFile,
  readNoiseFileAndRecompute,
  maybeDeleteNoiseFile,
  buildNoiseFilePath,
  sanitizeSlug,
  formatTimestamp,
  parseFrontmatter,
  parseItems,
  NOISE_DIR_REL
};
