'use strict';

/**
 * agent-semantic-diff — pure helpers for detecting semantic drift between
 * workspace `.aioson/agents/{agent}.md` and template `template/.aioson/agents/{agent}.md`.
 *
 * F4 / T5 (workflow-handoff-integrity v1.9.8). Designed to catch the 981a8fd-style
 * migration where the workspace agent prompt was updated but the template was not.
 * The existing `sync-agents-preflight#checkParity` only inspects the `## Feature dossier`
 * section length — this helper extends that lens to headers, section content, and
 * frontmatter.
 *
 * Three diff strategies (per DD-03):
 *   - diffHeaders        — section list (presence + order) at `##` and `###` levels
 *   - diffSectionContent — hash-based diff of section bodies (catches content drift)
 *   - diffFrontmatter    — field-level YAML-ish frontmatter comparison
 *
 * Plain text body diff is deliberately skipped — too noisy for typos/cosmetic edits.
 */

const crypto = require('node:crypto');

// ─── Frontmatter ─────────────────────────────────────────────────────────────

function extractFrontmatter(content) {
  const match = String(content || '').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  const out = {};
  for (const line of match[1].split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    if (!key) continue;
    out[key] = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

function diffFrontmatter(workspaceContent, templateContent) {
  const ws = extractFrontmatter(workspaceContent);
  const tpl = extractFrontmatter(templateContent);
  if (ws === null && tpl === null) return null; // both have no frontmatter
  const missingInTemplate = [];
  const missingInWorkspace = [];
  const valueChanged = [];
  const wsObj = ws || {};
  const tplObj = tpl || {};
  for (const key of Object.keys(wsObj)) {
    if (!(key in tplObj)) {
      missingInTemplate.push(key);
    } else if (wsObj[key] !== tplObj[key]) {
      valueChanged.push({ key, workspace: wsObj[key], template: tplObj[key] });
    }
  }
  for (const key of Object.keys(tplObj)) {
    if (!(key in wsObj)) missingInWorkspace.push(key);
  }
  if (missingInTemplate.length + missingInWorkspace.length + valueChanged.length === 0) return null;
  return { missingInTemplate, missingInWorkspace, valueChanged };
}

// ─── Headers ─────────────────────────────────────────────────────────────────

/**
 * Extract ## and ### headers in document order.
 * Skips anything inside fenced code blocks.
 */
function extractHeaders(content) {
  const lines = String(content || '').split(/\r?\n/);
  const headers = [];
  let inFence = false;
  for (const line of lines) {
    if (/^```/.test(line.trim())) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = line.match(/^(##{1,2})\s+(.+?)\s*$/);
    if (m) headers.push(m[2].trim());
  }
  return headers;
}

function diffHeaders(workspaceContent, templateContent) {
  const ws = extractHeaders(workspaceContent);
  const tpl = extractHeaders(templateContent);
  const wsSet = new Set(ws);
  const tplSet = new Set(tpl);
  const missingInTemplate = ws.filter((h) => !tplSet.has(h));
  const missingInWorkspace = tpl.filter((h) => !wsSet.has(h));
  // Order check: of the headers present in both, do they appear in the same sequence?
  const common = ws.filter((h) => tplSet.has(h));
  const commonInTpl = tpl.filter((h) => wsSet.has(h));
  const reordered = common.length === commonInTpl.length
    && common.some((h, i) => h !== commonInTpl[i]);
  if (missingInTemplate.length + missingInWorkspace.length === 0 && !reordered) return null;
  return { missingInTemplate, missingInWorkspace, reordered };
}

// ─── Section content (hash-based) ────────────────────────────────────────────

/**
 * Split content into Map<header, body>. Body is normalized (trimmed lines,
 * collapsed whitespace) before hashing to avoid cosmetic-only false positives.
 */
function extractSections(content) {
  const lines = String(content || '').split(/\r?\n/);
  const sections = new Map();
  let current = '__preamble__';
  let body = [];
  let inFence = false;
  for (const line of lines) {
    if (/^```/.test(line.trim())) {
      inFence = !inFence;
      body.push(line);
      continue;
    }
    const headerMatch = !inFence && line.match(/^(##{1,2})\s+(.+?)\s*$/);
    if (headerMatch) {
      sections.set(current, body.join('\n'));
      current = headerMatch[2].trim();
      body = [];
      continue;
    }
    body.push(line);
  }
  sections.set(current, body.join('\n'));
  return sections;
}

function normalizeBody(body) {
  return String(body || '')
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

function hashBody(body) {
  return crypto.createHash('sha256').update(normalizeBody(body)).digest('hex').slice(0, 16);
}

function diffSectionContent(workspaceContent, templateContent) {
  const ws = extractSections(workspaceContent);
  const tpl = extractSections(templateContent);
  const diverged = [];
  for (const [header, wsBody] of ws.entries()) {
    if (!tpl.has(header)) continue; // missing-header case handled by diffHeaders
    const wsHash = hashBody(wsBody);
    const tplHash = hashBody(tpl.get(header));
    if (wsHash !== tplHash) {
      diverged.push({ header, workspaceHash: wsHash, templateHash: tplHash });
    }
  }
  return diverged.length > 0 ? diverged : null;
}

// ─── Aggregate runner ────────────────────────────────────────────────────────

/**
 * Run all three diff strategies on a single agent file pair.
 * Returns null when no drift is detected, otherwise an issue object.
 */
function diffAgentFile(workspaceContent, templateContent) {
  // AC-T5-08: missing-on-one-side detection.
  if (!workspaceContent && !templateContent) return null;
  if (!workspaceContent || !templateContent) {
    return {
      missingFile: !workspaceContent ? 'workspace' : 'template',
      missingInTemplate: [], missingInWorkspace: [], reordered: false,
      divergedSections: [],
      frontmatter: null
    };
  }
  const headers = diffHeaders(workspaceContent, templateContent);
  const sections = diffSectionContent(workspaceContent, templateContent);
  const frontmatter = diffFrontmatter(workspaceContent, templateContent);
  if (!headers && !sections && !frontmatter) return null;
  return {
    missingFile: null,
    missingInTemplate: headers?.missingInTemplate || [],
    missingInWorkspace: headers?.missingInWorkspace || [],
    reordered: headers?.reordered || false,
    divergedSections: sections || [],
    frontmatter: frontmatter || null
  };
}

module.exports = {
  extractFrontmatter,
  extractHeaders,
  extractSections,
  diffFrontmatter,
  diffHeaders,
  diffSectionContent,
  diffAgentFile,
  hashBody,
  normalizeBody
};
