'use strict';

/**
 * operator-memory — proposal CRUD (Phase 2, v1.13.0).
 *
 * Proposals are the pending-promotion queue. Each first detection writes a
 * proposal at proposals/{slug}.md with detected_count=1. Second detection
 * triggers promotion (see decision.js) — proposal removed, decision created
 * atomically via SQLite transaction wrapping fs ops.
 *
 * Schema (frontmatter-only file, no body):
 *   ---
 *   slug: ...
 *   signal_type: authorization | exclusion | correction | confirmation
 *   detected_count: 1
 *   first_detected: <ISO>
 *   last_detected: <ISO>
 *   quotes: [verbatim, ...] (capped at 5)
 *   proposal: <paraphrase>
 *   source_agent: <agent_name>
 *   proposal_fingerprint: <sha256[0..12]>
 *   ---
 */

const fs = require('node:fs');
const path = require('node:path');
const { ensureStorageTree, getStorageRoot } = require('./storage');
const { fingerprintProposal } = require('./slug');

const MAX_QUOTES = 5;
const VALID_SIGNAL_TYPES = ['authorization', 'exclusion', 'correction', 'confirmation'];

function proposalPath(identity, slug) {
  return path.join(getStorageRoot(identity), 'proposals', `${slug}.md`);
}

function escapeYamlString(value) {
  const s = String(value || '');
  // Simple: wrap in single quotes; escape embedded single quotes
  return `'${s.replace(/'/g, "''")}'`;
}

function quotesToYaml(quotes) {
  if (!quotes || quotes.length === 0) return '[]';
  return '\n' + quotes.map((q) => `  - ${escapeYamlString(q)}`).join('\n');
}

function serializeProposal(data) {
  return [
    '---',
    `slug: ${data.slug}`,
    `signal_type: ${data.signal_type}`,
    `detected_count: ${data.detected_count}`,
    `first_detected: ${data.first_detected}`,
    `last_detected: ${data.last_detected}`,
    `quotes:${quotesToYaml(data.quotes)}`,
    `proposal: ${escapeYamlString(data.proposal)}`,
    `source_agent: ${data.source_agent}`,
    `proposal_fingerprint: ${data.proposal_fingerprint}`,
    '---',
    ''
  ].join('\n');
}

function parseProposalFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  const block = match[1];
  const out = {};
  let inQuotes = false;
  let quotes = [];
  for (const rawLine of block.split('\n')) {
    if (rawLine.startsWith('quotes:')) {
      const after = rawLine.slice('quotes:'.length).trim();
      if (after === '[]' || after === '') {
        if (after === '[]') { inQuotes = false; out.quotes = []; continue; }
        inQuotes = true; quotes = []; continue;
      }
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
        // fall through to parse this line as a regular field
      }
    }
    const fieldMatch = rawLine.match(/^([a-z_]+):\s*(.*)$/);
    if (fieldMatch) {
      const [, key, rawValue] = fieldMatch;
      let value = rawValue.trim();
      if (value.startsWith("'") && value.endsWith("'")) {
        value = value.slice(1, -1).replace(/''/g, "'");
      }
      if (/^\d+$/.test(value)) value = Number(value);
      out[key] = value;
    }
  }
  if (inQuotes) out.quotes = quotes;
  if (!out.quotes) out.quotes = [];
  return out;
}

function readProposal(identity, slug) {
  const filePath = proposalPath(identity, slug);
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, 'utf8');
  return parseProposalFrontmatter(content);
}

function writeProposal(identity, data) {
  ensureStorageTree(identity);
  const filePath = proposalPath(identity, data.slug);
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, serializeProposal(data), 'utf8');
  fs.renameSync(tmpPath, filePath);
  return filePath;
}

function deleteProposal(identity, slug) {
  const filePath = proposalPath(identity, slug);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
}

function captureSignal({ identity, slug, signal_type, quote, proposal, source_agent }) {
  if (!VALID_SIGNAL_TYPES.includes(signal_type)) {
    throw new Error(`Invalid signal_type '${signal_type}'. Must be one of: ${VALID_SIGNAL_TYPES.join(', ')}`);
  }
  const now = new Date().toISOString();
  const existing = readProposal(identity, slug);

  if (existing) {
    existing.detected_count = Number(existing.detected_count || 1) + 1;
    existing.last_detected = now;
    const trimmedQuote = String(quote || '').trim();
    if (trimmedQuote && !existing.quotes.includes(trimmedQuote)) {
      existing.quotes.push(trimmedQuote);
      if (existing.quotes.length > MAX_QUOTES) {
        existing.quotes = existing.quotes.slice(-MAX_QUOTES);
      }
    }
    writeProposal(identity, existing);
    return { proposal: existing, isNew: false };
  }

  const fresh = {
    slug,
    signal_type,
    detected_count: 1,
    first_detected: now,
    last_detected: now,
    quotes: quote ? [String(quote).trim()].filter(Boolean) : [],
    proposal,
    source_agent: source_agent || 'unknown',
    proposal_fingerprint: fingerprintProposal(proposal)
  };
  writeProposal(identity, fresh);
  return { proposal: fresh, isNew: true };
}

module.exports = {
  captureSignal,
  readProposal,
  writeProposal,
  deleteProposal,
  proposalPath,
  serializeProposal,
  parseProposalFrontmatter,
  MAX_QUOTES,
  VALID_SIGNAL_TYPES
};
