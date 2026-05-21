'use strict';

/**
 * operator-memory — MEMORY.md tier-based index reader/writer (Phase 3, v1.14.0).
 *
 * Per PMD-AN-02: MEMORY.md = active tier (auto-loaded by preflight directive);
 * MEMORY-archive.md = archive tier (lazy-loaded only with --include-archived).
 *
 * Format (architecture-operator-memory.md § Phase 3):
 *   ---
 *   identity_prefix: <first 8 chars of identity>
 *   decisions_count: N
 *   archived_count: M
 *   last_promoted: <ISO>
 *   schema_version: "1.0"
 *   ---
 *
 *   # Operator Memory — Index
 *
 *   ## Active decisions
 *
 *   - [Title](decisions/{slug}.md) — {signal_type}, reinforced {date}
 *   ...
 */

const fs = require('node:fs');
const path = require('node:path');
const { getStorageRoot } = require('./storage');
const { readDecision, decisionPath } = require('./decision');

const SCHEMA_VERSION = '1.0';

function indexPath(identity, tier = 'active') {
  const filename = tier === 'archive' ? 'MEMORY-archive.md' : 'MEMORY.md';
  return path.join(getStorageRoot(identity), filename);
}

function listDecisionSlugs(identity) {
  const root = path.join(getStorageRoot(identity), 'decisions');
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root)
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.slice(0, -3));
}

function deriveLineForDecision(decision) {
  const title = decision.body
    ? decision.body.slice(0, 80).split('\n')[0].replace(/[#`*\[\]()]/g, '').trim()
    : decision.slug;
  const dateOnly = String(decision.last_reinforced || '').slice(0, 10);
  return `- [${title || decision.slug}](decisions/${decision.slug}.md) — ${decision.signal_type}, reinforced ${dateOnly}`;
}

function serializeIndex({ identity, decisionsCount, archivedCount, lastPromoted, lines, tier = 'active' }) {
  const heading = tier === 'archive' ? 'Archived decisions' : 'Active decisions';
  const frontmatter = [
    '---',
    `identity_prefix: ${identity.slice(0, 8)}`,
    `decisions_count: ${decisionsCount}`,
    `archived_count: ${archivedCount}`,
    `last_promoted: ${lastPromoted || 'null'}`,
    `schema_version: "${SCHEMA_VERSION}"`,
    '---',
    ''
  ].join('\n');
  const body = [
    '# Operator Memory — Index',
    '',
    `## ${heading}`,
    '',
    lines.length === 0 ? '_(empty — no decisions yet)_' : lines.join('\n'),
    ''
  ];
  if (tier === 'active') {
    body.push('## See also', '');
    body.push(`- \`MEMORY-archive.md\` — ${archivedCount} archived decisions`);
    body.push('');
  }
  return frontmatter + body.join('\n');
}

function parseIndexFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  const out = {};
  for (const line of match[1].split('\n')) {
    const m = line.match(/^([a-z_]+):\s*(.*)$/);
    if (m) {
      let v = m[2].trim();
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
      if (/^\d+$/.test(v)) v = Number(v);
      if (v === 'null') v = null;
      out[m[1]] = v;
    }
  }
  return out;
}

function parseIndexLinks(content) {
  // Match `- [Title](decisions/{slug}.md) — {signal_type}, reinforced {date}`
  const re = /^- \[(.*?)\]\(decisions\/([a-z0-9-]+)\.md\) — (\w+), reinforced (\S+)/gm;
  const out = [];
  let m;
  while ((m = re.exec(content)) !== null) {
    out.push({ title: m[1], slug: m[2], signal_type: m[3], last_reinforced: m[4] });
  }
  return out;
}

function loadMemoryIndex(identity, tier = 'active') {
  const p = indexPath(identity, tier);
  if (!fs.existsSync(p)) return null;
  const content = fs.readFileSync(p, 'utf8');
  return {
    frontmatter: parseIndexFrontmatter(content),
    entries: parseIndexLinks(content),
    raw: content
  };
}

/**
 * Regenerate MEMORY.md from current decisions on disk.
 *
 * Phase 3 V1: includes ALL decisions in active tier (no decay yet).
 * Phase 5 will partition into active vs archive based on category half-life.
 */
function regenerateIndex(identity) {
  const slugs = listDecisionSlugs(identity);
  const decisions = slugs
    .map((slug) => {
      try {
        const d = readDecision(identity, slug);
        if (!d) return null;
        return { slug, ...d };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => String(b.last_reinforced || '').localeCompare(String(a.last_reinforced || '')));

  const lines = decisions.map(deriveLineForDecision);
  const lastPromoted = decisions[0]?.promoted_at || null;
  const indexContent = serializeIndex({
    identity,
    decisionsCount: decisions.length,
    archivedCount: 0, // Phase 5 will compute from MEMORY-archive.md
    lastPromoted,
    lines,
    tier: 'active'
  });

  const p = indexPath(identity, 'active');
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, indexContent, 'utf8');
  fs.renameSync(tmp, p);
  return p;
}

module.exports = {
  loadMemoryIndex,
  regenerateIndex,
  indexPath,
  parseIndexFrontmatter,
  parseIndexLinks,
  serializeIndex,
  deriveLineForDecision,
  listDecisionSlugs,
  SCHEMA_VERSION
};
