'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { assertSafeSlug } = require('./briefing-paths');

const KNOWN_FIELDS = ['slug', 'status', 'source_plans', 'created_at', 'approved_at', 'prd_generated'];
const REFINEMENT_FIELDS = ['refinement_status', 'refinement_updated_at', 'review_html', 'refinement_report'];

function configPath(projectDir) {
  return path.join(projectDir, '.aioson', 'briefings', 'config.md');
}

function stripQuotes(value) {
  return String(value || '').trim().replace(/^["']|["']$/g, '');
}

function parseScalar(value) {
  const val = stripQuotes(value);
  if (val === 'null' || val === '') return null;
  return val;
}

function parseSourcePlans(value) {
  const val = String(value || '').trim();
  const arrMatch = val.match(/^\[(.*)\]$/);
  if (!arrMatch) return val === '' ? [] : [stripQuotes(val)];
  if (!arrMatch[1].trim()) return [];
  return arrMatch[1].split(',').map((item) => stripQuotes(item));
}

function parseConfigFrontmatter(content) {
  const match = String(content || '').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;

  const lines = match[1].split(/\r?\n/);
  const result = { updated_at: null, briefings: [] };
  let inBriefings = false;
  let currentItem = null;

  for (const line of lines) {
    const updatedMatch = line.match(/^updated_at:\s*(.*)$/);
    if (updatedMatch) {
      result.updated_at = stripQuotes(updatedMatch[1]);
      continue;
    }

    if (/^briefings:/.test(line)) {
      inBriefings = true;
      continue;
    }

    if (!inBriefings) continue;

    const itemMatch = line.match(/^\s{2}-\s+slug:\s*(.+)/);
    if (itemMatch) {
      if (currentItem) result.briefings.push(currentItem);
      currentItem = {
        slug: stripQuotes(itemMatch[1]),
        status: 'draft',
        source_plans: [],
        created_at: null,
        approved_at: null,
        prd_generated: null
      };
      continue;
    }

    if (!currentItem) continue;
    const fieldMatch = line.match(/^\s{4}([\w-]+):\s*(.*)/);
    if (!fieldMatch) continue;
    const [, key, rawVal] = fieldMatch;
    currentItem[key] = key === 'source_plans' ? parseSourcePlans(rawVal) : parseScalar(rawVal);
  }

  if (currentItem) result.briefings.push(currentItem);
  return result;
}

// Registry scalars are single-line metadata. Strip characters that would break
// the line-based frontmatter parser or inject sibling fields (newlines, quotes).
function sanitizeScalar(value) {
  return String(value == null ? '' : value).replace(/[\r\n"]+/g, ' ').trim();
}

function serializeSourcePlans(plans) {
  if (!Array.isArray(plans) || plans.length === 0) return '[]';
  return `[${plans.map((item) => `"${sanitizeScalar(item)}"`).join(', ')}]`;
}

function serializeOptional(value) {
  return value ? `"${sanitizeScalar(value)}"` : 'null';
}

function serializeConfigFrontmatter(data) {
  const lines = ['---', `updated_at: ${data.updated_at || new Date().toISOString().slice(0, 10)}`, 'briefings:'];
  const fieldOrder = [...KNOWN_FIELDS.filter((field) => field !== 'slug'), ...REFINEMENT_FIELDS];

  for (const briefing of data.briefings || []) {
    // Validate slug as a safe segment — blocks row spoofing via a crafted slug.
    lines.push(`  - slug: ${assertSafeSlug(briefing.slug)}`);
    for (const field of fieldOrder) {
      if (field === 'source_plans') {
        lines.push(`    source_plans: ${serializeSourcePlans(briefing.source_plans)}`);
      } else if (field === 'status') {
        lines.push(`    status: ${sanitizeScalar(briefing.status || 'draft')}`);
      } else if (field === 'created_at') {
        lines.push(`    created_at: "${sanitizeScalar(briefing.created_at || '')}"`);
      } else if (field === 'approved_at' || field === 'prd_generated') {
        lines.push(`    ${field}: ${serializeOptional(briefing[field])}`);
      } else if (briefing[field] !== undefined && briefing[field] !== null && briefing[field] !== '') {
        lines.push(`    ${field}: "${sanitizeScalar(briefing[field])}"`);
      }
    }
  }

  lines.push('---');
  return lines.join('\n');
}

function buildMarkdownTable(briefings) {
  const header = '| slug | status | source_plans | created | approved | prd | refinement |';
  const sep = '|------|--------|-------------|---------|----------|-----|------------|';
  const cell = (value) => String(value == null ? '' : value).replace(/[\r\n|]+/g, ' ').trim();
  const rows = (briefings || []).map((briefing) => {
    const sources = cell((briefing.source_plans || []).join(', ')) || '-';
    return [
      `| ${cell(briefing.slug)}`,
      cell(briefing.status) || 'draft',
      sources,
      cell(briefing.created_at) || '-',
      cell(briefing.approved_at) || '-',
      cell(briefing.prd_generated) || '-',
      `${cell(briefing.refinement_status) || 'not_started'} |`
    ].join(' | ');
  });
  return [header, sep, ...rows].join('\n');
}

async function readBriefingRegistry(projectDir) {
  const file = configPath(projectDir);
  const raw = await fs.readFile(file, 'utf8');
  const data = parseConfigFrontmatter(raw);
  if (!data) {
    const error = new Error('Invalid briefing registry frontmatter');
    error.code = 'invalid_frontmatter';
    throw error;
  }
  return data;
}

async function writeBriefingRegistry(projectDir, data) {
  const file = configPath(projectDir);
  const today = new Date().toISOString().slice(0, 10);
  const payload = { ...data, updated_at: data.updated_at || today };
  const frontmatter = serializeConfigFrontmatter(payload);
  const table = buildMarkdownTable(payload.briefings);
  await fs.writeFile(file, `${frontmatter}\n\n# Briefings Registry\n\n${table}\n`, 'utf8');
}

function hasGeneratedPrd(briefing) {
  return Boolean(briefing && briefing.prd_generated);
}

function listRefinableBriefings(data) {
  return (data.briefings || []).filter((briefing) => {
    if (hasGeneratedPrd(briefing)) return false;
    return briefing.status === 'draft' || briefing.status === 'approved';
  });
}

function findBriefing(data, slug) {
  return (data.briefings || []).find((briefing) => briefing.slug === slug) || null;
}

function markRefinementState(data, slug, patch) {
  const entry = findBriefing(data, slug);
  if (!entry) return false;
  Object.assign(entry, patch, { refinement_updated_at: patch.refinement_updated_at || new Date().toISOString() });
  data.updated_at = new Date().toISOString().slice(0, 10);
  return true;
}

function returnApprovedBriefingToDraft(data, slug) {
  const entry = findBriefing(data, slug);
  if (!entry || entry.status !== 'approved' || entry.prd_generated) return false;
  entry.status = 'draft';
  entry.approved_at = null;
  data.updated_at = new Date().toISOString().slice(0, 10);
  return true;
}

module.exports = {
  buildMarkdownTable,
  configPath,
  findBriefing,
  listRefinableBriefings,
  markRefinementState,
  parseConfigFrontmatter,
  readBriefingRegistry,
  returnApprovedBriefingToDraft,
  serializeConfigFrontmatter,
  writeBriefingRegistry
};
