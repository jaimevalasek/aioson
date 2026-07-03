'use strict';

const path = require('node:path');
const { MANDATORY_SECTIONS, hashText } = require('./briefing-sections');

const VALID_SECTION_STATUSES = new Set(['unchanged', 'accepted', 'change_requested', 'remove_requested', 'blocked']);
const VALID_DECISION_STATUSES = new Set(['accepted', 'change_requested', 'remove', 'blocked', 'note']);
const VALID_SEVERITIES = new Set(['note', 'suggestion', 'important', 'blocking']);
const VALID_EXPORT_METHODS = new Set(['file-system-access', 'download', 'copy-paste', 'manual-save']);
const VALID_FINDING_CATEGORIES = new Set(['ambiguity', 'redundancy', 'gap', 'risk', 'pending-decision', 'scope-suggestion']);
const VALID_FINDING_SEVERITIES = new Set(['low', 'medium', 'high']);
const VALID_FINDING_STATUSES = new Set(['pending', 'accepted', 'rejected', 'deferred']);
// 1.0 = sections/comments/decisions/blocking_items only; 1.1 adds findings[] (the
// agent's audit surfaced as reviewable items) and the refinement round counter.
const SUPPORTED_SCHEMA_VERSIONS = new Set(['1.0', '1.1']);

// Normalization only — NOT a security boundary. This strips well-formed tags
// and normalizes newlines so the text round-trips cleanly into briefings.md.
// It does not guarantee inert HTML (e.g. an unterminated `<script` survives),
// so every HTML sink MUST escape at render time (see review-html.js escapeHtml
// / safeJson). Do not HTML-encode here: this output is also written back into
// Markdown, where entity-encoding would corrupt content.
function sanitizeText(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
}

function normalizeSection(section) {
  return {
    id: String(section.id || ''),
    title: String(section.title || ''),
    source_path: String(section.source_path || ''),
    original_text: sanitizeText(section.original_text),
    original_hash: String(section.original_hash || hashText(section.original_text || '')),
    current_text: sanitizeText(section.current_text || section.original_text || ''),
    status: VALID_SECTION_STATUSES.has(section.status) ? section.status : 'unchanged',
    comments_count: Number.isInteger(section.comments_count) ? section.comments_count : 0
  };
}

function normalizeFinding(finding, index) {
  return {
    id: String(finding.id || `F${index + 1}`),
    section_id: String(finding.section_id || ''),
    category: VALID_FINDING_CATEGORIES.has(finding.category) ? finding.category : 'gap',
    severity: VALID_FINDING_SEVERITIES.has(finding.severity) ? finding.severity : 'medium',
    blocking: Boolean(finding.blocking),
    text: sanitizeText(finding.text),
    recommendation: sanitizeText(finding.recommendation || ''),
    status: VALID_FINDING_STATUSES.has(finding.status) ? finding.status : 'pending',
    note: sanitizeText(finding.note || '')
  };
}

/**
 * Validate agent-supplied audit findings BEFORE they are baked into the review
 * surface. Strict where normalizeFinding is lenient: the agent must name a real
 * section and a valid category, and every finding must carry text.
 */
function validateFindingsInput(findings, { sectionIds = [] } = {}) {
  const errors = [];
  if (!Array.isArray(findings)) {
    return { ok: false, errors: ['findings must be an array'] };
  }
  const known = new Set(sectionIds);
  findings.forEach((finding, index) => {
    const label = finding && finding.id ? String(finding.id) : `#${index + 1}`;
    if (!finding || typeof finding !== 'object') {
      errors.push(`finding ${label} must be an object`);
      return;
    }
    if (!String(finding.text || '').trim()) errors.push(`finding ${label} has no text`);
    if (!VALID_FINDING_CATEGORIES.has(finding.category)) {
      errors.push(`finding ${label} has invalid category: ${finding.category}`);
    }
    if (finding.severity !== undefined && !VALID_FINDING_SEVERITIES.has(finding.severity)) {
      errors.push(`finding ${label} has invalid severity: ${finding.severity}`);
    }
    if (known.size > 0 && !known.has(String(finding.section_id || ''))) {
      errors.push(`finding ${label} points at unknown section_id: ${finding.section_id}`);
    }
  });
  return { ok: errors.length === 0, errors };
}

function buildInitialFeedback({ slug, sourcePath, sourceHash, sections, findings = [], round = 1, exportMethod = 'manual-save', now = new Date() }) {
  const timestamp = now.toISOString();
  return {
    schema_version: '1.1',
    briefing_slug: slug,
    source_briefing_path: sourcePath,
    source_hash: sourceHash,
    review_generated_at: timestamp,
    last_modified_at: timestamp,
    export_method: exportMethod,
    round: Number.isInteger(round) && round > 0 ? round : 1,
    sections: sections.map(normalizeSection),
    findings: findings.map(normalizeFinding),
    comments: [],
    decisions: [],
    blocking_items: []
  };
}

function isPathInsideBriefing(sourcePath, slug) {
  const normalized = String(sourcePath || '').replace(/\\/g, '/');
  // Anchored exact match only — an `endsWith` fallback would accept any prefix
  // (e.g. `/etc/evil/.aioson/briefings/{slug}/briefings.md`). Reject traversal.
  if (normalized.includes('..')) return false;
  return normalized === `.aioson/briefings/${slug}/briefings.md`;
}

function validateFeedback(feedback, { slug, currentSourceHash, allowStale = false } = {}) {
  const errors = [];
  const warnings = [];

  if (!feedback || typeof feedback !== 'object') errors.push('feedback must be an object');
  if (errors.length > 0) return { ok: false, stale: false, errors, warnings };

  if (!SUPPORTED_SCHEMA_VERSIONS.has(feedback.schema_version)) errors.push('schema_version must be 1.0 or 1.1');
  if (slug && feedback.briefing_slug !== slug) errors.push('briefing_slug does not match selected slug');
  if (!isPathInsideBriefing(feedback.source_briefing_path, feedback.briefing_slug || slug)) {
    errors.push('source_briefing_path must stay inside the selected briefing directory');
  }
  if (!VALID_EXPORT_METHODS.has(feedback.export_method)) errors.push('export_method is invalid');

  const arrays = ['sections', 'comments', 'decisions', 'blocking_items'];
  for (const key of arrays) {
    if (!Array.isArray(feedback[key])) errors.push(`${key} must be an array`);
  }

  if (Array.isArray(feedback.sections)) {
    const titles = new Set(feedback.sections.map((section) => section.title));
    const missing = MANDATORY_SECTIONS.filter((title) => !titles.has(title));
    if (missing.length > 0) errors.push(`sections missing mandatory titles: ${missing.join(', ')}`);
    for (const section of feedback.sections) {
      if (!VALID_SECTION_STATUSES.has(section.status)) errors.push(`invalid section status: ${section.status}`);
    }
  }

  if (Array.isArray(feedback.comments)) {
    for (const comment of feedback.comments) {
      if (!VALID_SEVERITIES.has(comment.severity)) errors.push(`invalid comment severity: ${comment.severity}`);
    }
  }

  if (Array.isArray(feedback.decisions)) {
    for (const decision of feedback.decisions) {
      if (!VALID_DECISION_STATUSES.has(decision.status)) errors.push(`invalid decision status: ${decision.status}`);
    }
  }

  // findings[] is a 1.1 field; a 1.0 payload legitimately has none.
  if (feedback.schema_version === '1.1' && !Array.isArray(feedback.findings)) {
    errors.push('findings must be an array');
  }
  if (Array.isArray(feedback.findings)) {
    for (const finding of feedback.findings) {
      if (!VALID_FINDING_STATUSES.has(finding.status)) errors.push(`invalid finding status: ${finding.status}`);
      if (!VALID_FINDING_CATEGORIES.has(finding.category)) errors.push(`invalid finding category: ${finding.category}`);
    }
  }

  const stale = Boolean(currentSourceHash && feedback.source_hash !== currentSourceHash);
  if (stale) warnings.push('source_hash differs from current briefings.md');
  if (stale && !allowStale) errors.push('feedback is stale');

  return { ok: errors.length === 0, stale, errors, warnings };
}

function assertFeedbackPath(projectDir, slug, candidatePath) {
  const root = path.resolve(projectDir, '.aioson', 'briefings', slug);
  const resolved = path.resolve(projectDir, candidatePath);
  if (!resolved.startsWith(root + path.sep)) {
    throw new Error('feedback path must stay inside selected briefing directory');
  }
}

module.exports = {
  buildInitialFeedback,
  normalizeFinding,
  sanitizeText,
  validateFeedback,
  validateFindingsInput,
  assertFeedbackPath,
  VALID_FINDING_CATEGORIES,
  VALID_FINDING_SEVERITIES,
  VALID_FINDING_STATUSES
};
