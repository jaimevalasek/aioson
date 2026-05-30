'use strict';

/**
 * cross-tool-project-knowledge — M2/M3: materialize project-knowledge learnings
 * (gotcha/resolution) to disk + regenerate INDEX.md.
 *
 * Called from runDistillation on feature:close (Q-CTPK-02), after auto-promote.
 * Best-effort: the caller wraps this so a disk failure never breaks distillation
 * (BR-CTPK-02). Disk-first so any harness (Claude Code / Codex / OpenCode) reads
 * the knowledge via `.aioson/learnings/INDEX.md` without an `aioson memory:search`.
 *
 * Sync fs (matches neural-chain-noise-file.js) — no new dependency.
 */

const fs = require('node:fs');
const path = require('node:path');

const CATEGORY_BY_KIND = { gotcha: 'gotchas', resolution: 'recipes' };
const CATEGORIES = ['gotchas', 'recipes'];
const LEARNINGS_DIR = '.aioson/learnings';
const MAX_INDEX_LINE = 200;
const INDEX_SIZE_ALERT = 100; // EC-CTPK-06 sanity threshold (telemetry only, no trim)

function sanitizeSlug(title) {
  const s = String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return s || 'untitled';
}

function parseFrontmatter(text) {
  const m = String(text || '').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const out = {};
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i === -1) continue;
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

// Best-effort: pull a "## Cited files" list out of an evidence body.
function extractCitedFiles(body) {
  const m = String(body || '').match(/(?:^|\n)#{1,4}\s+Cited files\s*\r?\n([\s\S]*?)(?=\r?\n#{1,4}\s|$)/i);
  if (!m) return [];
  const files = [];
  for (const line of m[1].split(/\r?\n/)) {
    const t = line.replace(/^[-*]\s*/, '').trim();
    if (t && /[/.]/.test(t)) files.push(t);
  }
  return files;
}

function firstLine(body) {
  for (const line of String(body || '').split(/\r?\n/)) {
    const t = line.trim();
    if (t && !t.startsWith('#') && t !== '---') return t;
  }
  return '';
}

function yamlList(arr) {
  return `[${arr.map((x) => JSON.stringify(String(x))).join(', ')}]`;
}

function buildLearningFile(row, category, cited) {
  const body = (row.evidence || '').trim() || row.title;
  return [
    '---',
    `learning_id: ${row.learning_id}`,
    `type: ${row.kind}`,
    `category: ${category}`,
    `feature_slug: ${row.feature_slug || ''}`,
    `confidence: ${row.confidence || 'medium'}`,
    `created_at: ${row.created_at || ''}`,
    `updated_at: ${row.updated_at || ''}`,
    `cited_files: ${yamlList(cited)}`,
    '---',
    '',
    `# ${row.title}`,
    '',
    body,
    ''
  ].join('\n');
}

function indexLine(row, slug, category, cited) {
  const summary = firstLine(row.evidence) || row.title;
  let line = `- [${row.title}](${category}/${slug}.md) — ${summary}`;
  if (cited.length) line += `. Files: ${cited.join(', ')}`;
  if (line.length > MAX_INDEX_LINE) line = `${line.slice(0, MAX_INDEX_LINE - 1)}…`;
  return line;
}

/**
 * Materialize active gotcha/resolution learnings to disk + regenerate INDEX.md.
 * @returns {{ok:boolean, written:number, skipped:number, removed:number, total:number, indexOverCap?:boolean, reason?:string}}
 */
function materializeLearnings({ db, targetDir }) {
  if (!db || !targetDir) return { ok: false, reason: 'missing_args' };

  // A very old DB that somehow skipped Phase 4 won't have `kind` — guard.
  const cols = db.prepare('PRAGMA table_info(project_learnings)').all().map((r) => r.name);
  if (!cols.includes('kind')) return { ok: true, written: 0, skipped: 0, removed: 0, total: 0, reason: 'no_kind_column' };

  const rows = db.prepare(`
    SELECT learning_id, feature_slug, title, kind, confidence, evidence, created_at, updated_at
    FROM project_learnings
    WHERE status = 'active' AND kind IN ('gotcha', 'resolution')
    ORDER BY kind ASC, updated_at DESC
  `).all();

  const baseDir = path.join(targetDir, LEARNINGS_DIR);
  const dirExists = fs.existsSync(baseDir);

  // EC-CTPK-02: nothing active and no existing dir → true no-op (don't create junk).
  if (rows.length === 0 && !dirExists) {
    return { ok: true, written: 0, skipped: 0, removed: 0, total: 0 };
  }

  let written = 0;
  let skipped = 0;
  const activeRel = new Set();
  const indexByCategory = { gotchas: [], recipes: [] };
  const claimed = new Map(); // relPath -> learning_id (in-run collision guard)

  for (const row of rows) {
    const category = CATEGORY_BY_KIND[row.kind];
    if (!category) continue;

    let slug = sanitizeSlug(row.title);
    let rel = `${category}/${slug}.md`;
    // EC-CTPK-05: same sanitized title across features → disambiguate with feature_slug.
    if (claimed.has(rel) && claimed.get(rel) !== row.learning_id) {
      slug = `${slug}-${sanitizeSlug(row.feature_slug || 'x')}`;
      rel = `${category}/${slug}.md`;
    }
    claimed.set(rel, row.learning_id);
    activeRel.add(rel);

    const cited = extractCitedFiles(row.evidence);
    const absPath = path.join(baseDir, category, `${slug}.md`);

    // Idempotency (BR-CTPK-03): rewrite only if the row is newer than disk.
    let doWrite = true;
    if (fs.existsSync(absPath)) {
      const fm = parseFrontmatter(fs.readFileSync(absPath, 'utf8'));
      if (fm.updated_at && row.updated_at && fm.updated_at >= row.updated_at) doWrite = false;
    }
    if (doWrite) {
      fs.mkdirSync(path.dirname(absPath), { recursive: true });
      fs.writeFileSync(absPath, buildLearningFile(row, category, cited), 'utf8');
      written += 1;
    } else {
      skipped += 1;
    }
    indexByCategory[category].push(indexLine(row, slug, category, cited));
  }

  // EC-CTPK-09: remove DB-managed orphan files (learning archived/removed). Only
  // touch files that carry a learning_id frontmatter — never user-authored files.
  let removed = 0;
  for (const category of CATEGORIES) {
    const catDir = path.join(baseDir, category);
    if (!fs.existsSync(catDir)) continue;
    for (const fname of fs.readdirSync(catDir)) {
      if (!fname.endsWith('.md')) continue;
      if (activeRel.has(`${category}/${fname}`)) continue;
      const fm = parseFrontmatter(fs.readFileSync(path.join(catDir, fname), 'utf8'));
      if (fm.learning_id) {
        try { fs.unlinkSync(path.join(catDir, fname)); removed += 1; } catch { /* best-effort */ }
      }
    }
  }

  // M3 — regenerate INDEX.md (category ASC, updated_at DESC from query order; BR-CTPK-11).
  const lines = ['# Project Learnings', ''];
  for (const category of CATEGORIES) {
    for (const l of indexByCategory[category]) lines.push(l);
  }
  if (rows.length === 0) lines.push('_No project learnings yet._');
  fs.mkdirSync(baseDir, { recursive: true });
  fs.writeFileSync(path.join(baseDir, 'INDEX.md'), `${lines.join('\n')}\n`, 'utf8');

  return { ok: true, written, skipped, removed, total: rows.length, indexOverCap: rows.length > INDEX_SIZE_ALERT };
}

module.exports = { materializeLearnings, sanitizeSlug, extractCitedFiles, CATEGORY_BY_KIND };
