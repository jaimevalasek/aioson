'use strict';

/**
 * operator-memory — decision CRUD with atomic promote (Phase 2, v1.13.0).
 *
 * Atomicity boundary (AC-P2-03): SQLite transaction wraps fs operations.
 * Crash mid-transaction → rollback. Markdown is source-of-truth (PMD-AN-06);
 * FTS5 mirror is regenerable. See architecture-operator-memory.md § Phase 2.
 *
 * Schema (frontmatter + body):
 *   ---
 *   slug: ...
 *   signal_type: ...
 *   promoted_at: <ISO>
 *   last_reinforced: <ISO>
 *   reinforcement_count: 0
 *   superseded_by: null
 *   category: identity | autonomy | tooling | default
 *   source_agent: ...
 *   quotes: [...]                       # capped at 5
 *   version_schema: "1.0"
 *   deprecated_by: null
 *   ---
 *
 *   # {Title}
 *
 *   {Body — short paragraph}
 *
 *   ## Trigger quotes
 *   - "..."
 */

const fs = require('node:fs');
const path = require('node:path');
const { getStorageRoot, openIndexDb } = require('./storage');
const { deleteProposal, proposalPath } = require('./proposal');

const SCHEMA_VERSION = '1.0';
const MAX_BODY_CHARS = 500;
const VALID_CATEGORIES = ['identity', 'autonomy', 'tooling', 'default'];

const CATEGORY_KEYWORDS = {
  identity: ['preferencia', 'preference', 'estilo', 'style', 'communication', 'comunicacao', 'linguagem', 'language', 'tom', 'tone'],
  autonomy: ['commit', 'push', 'publish', 'deploy', 'merge', 'release', 'tag'],
  tooling: ['cli', 'tool', 'comando', 'command', 'aws', 'gcp', 'kubectl', 'docker', 'npm', 'pip']
};

function inferCategory(signalType, body) {
  if (signalType !== 'authorization') return 'default';
  const text = String(body || '').toLowerCase();
  for (const cat of ['identity', 'autonomy', 'tooling']) {
    if (CATEGORY_KEYWORDS[cat].some((kw) => text.includes(kw))) return cat;
  }
  return 'default';
}

function decisionPath(identity, slug) {
  return path.join(getStorageRoot(identity), 'decisions', `${slug}.md`);
}

function historyPath(identity, slug, isoStamp) {
  return path.join(getStorageRoot(identity), 'history', `${isoStamp.replace(/[:.]/g, '-')}-${slug}.md`);
}

function escapeYamlString(value) {
  const s = String(value || '');
  return `'${s.replace(/'/g, "''")}'`;
}

function quotesToYaml(quotes) {
  if (!quotes || quotes.length === 0) return '[]';
  return '\n' + quotes.map((q) => `  - ${escapeYamlString(q)}`).join('\n');
}

function deriveTitle(proposal) {
  const text = String(proposal || '').trim();
  if (!text) return 'Untitled decision';
  return text.charAt(0).toUpperCase() + text.slice(1, 100);
}

function serializeDecision(data) {
  const body = String(data.body || data.proposal || '').slice(0, MAX_BODY_CHARS);
  const title = deriveTitle(data.title || data.proposal);
  return [
    '---',
    `slug: ${data.slug}`,
    `signal_type: ${data.signal_type}`,
    `promoted_at: ${data.promoted_at}`,
    `last_reinforced: ${data.last_reinforced}`,
    `reinforcement_count: ${data.reinforcement_count}`,
    `superseded_by: ${data.superseded_by ?? 'null'}`,
    `category: ${data.category}`,
    `source_agent: ${data.source_agent}`,
    `quotes:${quotesToYaml(data.quotes)}`,
    `version_schema: "${SCHEMA_VERSION}"`,
    `deprecated_by: ${data.deprecated_by ?? 'null'}`,
    '---',
    '',
    `# ${title}`,
    '',
    body,
    '',
    '## Trigger quotes',
    ...(data.quotes || []).map((q) => `- "${q}"`),
    ''
  ].join('\n');
}

function parseDecisionFile(content) {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return null;
  const body = content.slice(fmMatch[0].length).trim();
  const out = { body };
  let inQuotes = false;
  let quotes = [];
  for (const rawLine of fmMatch[1].split('\n')) {
    if (rawLine.startsWith('quotes:')) {
      const after = rawLine.slice('quotes:'.length).trim();
      if (after === '[]') { inQuotes = false; out.quotes = []; continue; }
      if (after === '') { inQuotes = true; quotes = []; continue; }
      inQuotes = true; quotes = []; continue;
    }
    if (inQuotes) {
      const m = rawLine.match(/^\s+-\s+'?([\s\S]*?)'?\s*$/);
      if (m) {
        quotes.push(m[1].replace(/''/g, "'"));
        continue;
      } else {
        inQuotes = false;
        out.quotes = quotes;
      }
    }
    const fieldMatch = rawLine.match(/^([a-z_]+):\s*(.*)$/);
    if (fieldMatch) {
      const [, key, rawValue] = fieldMatch;
      let value = rawValue.trim();
      if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1).replace(/''/g, "'");
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      if (value === 'null') value = null;
      else if (/^\d+$/.test(value)) value = Number(value);
      out[key] = value;
    }
  }
  if (inQuotes) out.quotes = quotes;
  if (!out.quotes) out.quotes = [];
  return out;
}

function readDecision(identity, slug) {
  const filePath = decisionPath(identity, slug);
  if (!fs.existsSync(filePath)) return null;
  return parseDecisionFile(fs.readFileSync(filePath, 'utf8'));
}

/**
 * Atomically promote a proposal to a decision.
 *
 * SQLite transaction wraps:
 *   1. INSERT INTO decisions_fts
 *   2. write decisions/{slug}.md (atomic via tmp+rename)
 *   3. delete proposals/{slug}.md
 *
 * Returns the decision data on success. Throws on transaction failure.
 */
function promoteProposal({ identity, proposal: proposalData }) {
  const now = new Date().toISOString();
  const body = String(proposalData.proposal || '').slice(0, MAX_BODY_CHARS);
  const category = inferCategory(proposalData.signal_type, body);
  const decision = {
    slug: proposalData.slug,
    signal_type: proposalData.signal_type,
    promoted_at: now,
    last_reinforced: now,
    reinforcement_count: 0,
    superseded_by: null,
    category,
    source_agent: proposalData.source_agent || 'unknown',
    quotes: proposalData.quotes || [],
    body,
    title: proposalData.proposal,
    deprecated_by: null
  };

  const decFilePath = decisionPath(identity, decision.slug);
  const decTmpPath = `${decFilePath}.tmp`;
  const propPath = proposalPath(identity, decision.slug);

  const db = openIndexDb();
  try {
    const txn = db.transaction(() => {
      db.prepare(`
        INSERT INTO decisions_fts (identity, slug, signal_type, category, body, last_reinforced)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(identity, decision.slug, decision.signal_type, decision.category, decision.body, decision.last_reinforced);

      fs.writeFileSync(decTmpPath, serializeDecision(decision), 'utf8');
      fs.renameSync(decTmpPath, decFilePath);

      if (fs.existsSync(propPath)) {
        fs.unlinkSync(propPath);
      }
    });
    txn();
  } catch (err) {
    // Cleanup tmp on rollback
    try { if (fs.existsSync(decTmpPath)) fs.unlinkSync(decTmpPath); } catch { /* ignore */ }
    throw err;
  } finally {
    db.close();
  }

  // Post-commit: regenerate MEMORY.md index (best-effort, outside transaction
  // since MEMORY.md is regenerable from decisions/ — markdown source-of-truth).
  try {
    const { regenerateIndex } = require('./index-md');
    regenerateIndex(identity);
  } catch { /* index regen failure is non-fatal */ }

  return decision;
}

/**
 * Soft-delete a decision or proposal to history/.
 * Returns { mode: 'decision'|'proposal'|'noop', archivedPath: string|null }.
 */
function forgetEntry(identity, slug) {
  const decFilePath = decisionPath(identity, slug);
  const propFilePath = proposalPath(identity, slug);
  const now = new Date().toISOString();

  if (fs.existsSync(decFilePath)) {
    const archived = historyPath(identity, slug, now);
    const content = fs.readFileSync(decFilePath, 'utf8');
    fs.writeFileSync(archived, content, 'utf8');

    const db = openIndexDb();
    try {
      db.transaction(() => {
        db.prepare('DELETE FROM decisions_fts WHERE identity = ? AND slug = ?').run(identity, slug);
        fs.unlinkSync(decFilePath);
      })();
    } finally {
      db.close();
    }
    // Post-commit: regenerate MEMORY.md index after decision removed
    try {
      const { regenerateIndex } = require('./index-md');
      regenerateIndex(identity);
    } catch { /* index regen failure is non-fatal */ }
    return { mode: 'decision', archivedPath: archived };
  }
  if (fs.existsSync(propFilePath)) {
    const archived = historyPath(identity, slug, now);
    fs.copyFileSync(propFilePath, archived);
    deleteProposal(identity, slug);
    return { mode: 'proposal', archivedPath: archived };
  }
  return { mode: 'noop', archivedPath: null };
}

module.exports = {
  promoteProposal,
  forgetEntry,
  readDecision,
  decisionPath,
  historyPath,
  serializeDecision,
  parseDecisionFile,
  inferCategory,
  CATEGORY_KEYWORDS,
  MAX_BODY_CHARS,
  SCHEMA_VERSION,
  VALID_CATEGORIES
};
