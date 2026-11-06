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
const VALID_SELECTION_MODES = new Set(['single', 'multiple']);
const DECISION_LIMITS = Object.freeze({
  question: 500,
  label: 120,
  description: 500,
  impact: 500,
  rationale: 2000,
  evidenceRef: 500,
  minOptions: 2,
  maxOptions: 4
});
// 1.0 = sections/comments/decisions/blocking_items only; 1.1 adds findings[] (the
// agent's audit surfaced as reviewable items) and the refinement round counter;
// 1.2 adds visual alternatives, selections, rationale, and evidence references.
const SUPPORTED_SCHEMA_VERSIONS = new Set(['1.0', '1.1', '1.2']);

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

function normalizeTextArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => sanitizeText(item)).filter(Boolean);
}

function normalizeDecisionOption(option, index) {
  return {
    id: String(option && option.id || `option-${index + 1}`),
    label: sanitizeText(option && option.label),
    description: sanitizeText(option && option.description),
    impact: sanitizeText(option && option.impact),
    recommended: Boolean(option && option.recommended),
    defers: Boolean(option && option.defers),
    evidence_refs: normalizeTextArray(option && option.evidence_refs)
  };
}

function normalizeFinding(finding, index) {
  const options = Array.isArray(finding.options)
    ? finding.options.map(normalizeDecisionOption)
    : [];
  return {
    id: String(finding.id || `F${index + 1}`),
    section_id: String(finding.section_id || ''),
    category: VALID_FINDING_CATEGORIES.has(finding.category) ? finding.category : 'gap',
    severity: VALID_FINDING_SEVERITIES.has(finding.severity) ? finding.severity : 'medium',
    blocking: Boolean(finding.blocking),
    text: sanitizeText(finding.text),
    recommendation: sanitizeText(finding.recommendation || ''),
    status: VALID_FINDING_STATUSES.has(finding.status) ? finding.status : 'pending',
    note: sanitizeText(finding.note || ''),
    question: sanitizeText(finding.question || ''),
    selection_mode: options.length > 0 && VALID_SELECTION_MODES.has(finding.selection_mode)
      ? finding.selection_mode
      : null,
    options,
    selected_option_ids: Array.isArray(finding.selected_option_ids)
      ? finding.selected_option_ids.map((id) => String(id))
      : [],
    rationale: sanitizeText(finding.rationale || ''),
    evidence_refs: normalizeTextArray(finding.evidence_refs)
  };
}

function validateText(value, label, max, { required = false } = {}) {
  if (value === undefined || value === null) {
    return required ? `${label} is required` : null;
  }
  if (typeof value !== 'string') return `${label} must be a string`;
  if (required && !value.trim()) return `${label} is required`;
  if (value.length > max) return `${label} exceeds ${max} characters`;
  return null;
}

function validateEvidenceRefs(value, label) {
  const errors = [];
  if (value === undefined) return errors;
  if (!Array.isArray(value)) return [`${label} must be an array`];
  value.forEach((ref, index) => {
    const error = validateText(ref, `${label}[${index}]`, DECISION_LIMITS.evidenceRef, { required: true });
    if (error) errors.push(error);
  });
  return errors;
}

function validateStructuredFinding(finding, label, { requireAcceptedSelection = false } = {}) {
  const errors = [];
  const options = finding && finding.options;
  const structuredFields = ['question', 'selection_mode', 'options', 'selected_option_ids', 'rationale', 'evidence_refs'];
  const hasStructuredField = structuredFields.some((field) => finding && finding[field] !== undefined);
  if (!hasStructuredField) return errors;

  const questionError = validateText(finding.question, `${label}.question`, DECISION_LIMITS.question);
  if (questionError) errors.push(questionError);
  const rationaleError = validateText(finding.rationale, `${label}.rationale`, DECISION_LIMITS.rationale);
  if (rationaleError) errors.push(rationaleError);
  errors.push(...validateEvidenceRefs(finding.evidence_refs, `${label}.evidence_refs`));

  const declaresChoice = (Array.isArray(options) && options.length > 0)
    || finding.selection_mode !== undefined && finding.selection_mode !== null
    || Array.isArray(finding.selected_option_ids) && finding.selected_option_ids.length > 0;
  if (!declaresChoice) return errors;

  if (!Array.isArray(options)) {
    errors.push(`${label}.options must be an array`);
    return errors;
  }
  if (options.length < DECISION_LIMITS.minOptions || options.length > DECISION_LIMITS.maxOptions) {
    errors.push(`${label}.options must contain ${DECISION_LIMITS.minOptions} to ${DECISION_LIMITS.maxOptions} items`);
  }
  if (!VALID_SELECTION_MODES.has(finding.selection_mode)) {
    errors.push(`${label}.selection_mode must be single or multiple`);
  }

  const optionIds = new Set();
  options.forEach((option, index) => {
    const optionLabel = `${label}.options[${index}]`;
    if (!option || typeof option !== 'object' || Array.isArray(option)) {
      errors.push(`${optionLabel} must be an object`);
      return;
    }
    for (const [field, max] of [
      ['id', DECISION_LIMITS.label],
      ['label', DECISION_LIMITS.label],
      ['description', DECISION_LIMITS.description],
      ['impact', DECISION_LIMITS.impact]
    ]) {
      const error = validateText(option[field], `${optionLabel}.${field}`, max, { required: true });
      if (error) errors.push(error);
    }
    if (option.recommended !== undefined && typeof option.recommended !== 'boolean') {
      errors.push(`${optionLabel}.recommended must be a boolean`);
    }
    if (option.defers !== undefined && typeof option.defers !== 'boolean') {
      errors.push(`${optionLabel}.defers must be a boolean`);
    }
    errors.push(...validateEvidenceRefs(option.evidence_refs, `${optionLabel}.evidence_refs`));
    const id = String(option.id || '');
    if (id && optionIds.has(id)) errors.push(`${label}.options has duplicate id: ${id}`);
    optionIds.add(id);
  });

  if (finding.selected_option_ids !== undefined && !Array.isArray(finding.selected_option_ids)) {
    errors.push(`${label}.selected_option_ids must be an array`);
  }
  const selected = Array.isArray(finding.selected_option_ids)
    ? finding.selected_option_ids.map((id) => String(id))
    : [];
  if (new Set(selected).size !== selected.length) errors.push(`${label}.selected_option_ids contains duplicates`);
  for (const id of selected) {
    if (!optionIds.has(id)) errors.push(`${label}.selected_option_ids contains unknown option: ${id}`);
  }
  if (requireAcceptedSelection && finding.status === 'accepted') {
    if (finding.selection_mode === 'single' && selected.length !== 1) {
      errors.push(`${label} accepted single choice requires exactly one selected option`);
    }
    if (finding.selection_mode === 'multiple' && selected.length < 1) {
      errors.push(`${label} accepted multiple choice requires at least one selected option`);
    }
  }
  return errors;
}

const PROMISE_ID_RE = /\bPROM-[A-Za-z0-9_-]+/g;

/** The promises a briefing holds, read from its map. `not_applicable` is no promise. */
function briefingPromiseIds(markdown) {
  const ids = new Set();
  for (const line of String(markdown || '').split('\n')) {
    const cell = /^\|\s*(PROM-[A-Za-z0-9_-]+)\s*\|/.exec(line);
    if (cell && !/\|\s*not_applicable\s*\|\s*$/.test(line)) ids.add(cell[1]);
  }
  return ids;
}

function citedPromises(finding, option) {
  const text = [finding.text, finding.recommendation, ...(finding.evidence_refs || []), option && option.description, option && option.impact, ...((option && option.evidence_refs) || [])]
    .filter(Boolean).join(' ');
  return text.match(PROMISE_ID_RE) || [];
}

/**
 * The owner takes the recommended option in 95% of the review answers, so recommending
 * scope is deciding it. An idea with no promise behind it stays on the card, and the
 * owner chooses it: only a promise the briefing holds, or an option that leaves the
 * scope as it is (`defers: true`), can carry the recommendation.
 */
function scopeRecommendationErrors(finding, label, promiseIds) {
  if (finding.category !== 'scope-suggestion') return [];
  const options = Array.isArray(finding.options) ? finding.options : [];
  const backed = (option) => {
    const cited = citedPromises(finding, option);
    return cited.length > 0 && (!promiseIds || cited.some((id) => promiseIds.has(id)));
  };
  const fix = 'cite a PROM-* the briefing holds, mark an option that leaves the scope as it is with defers: true, or drop the recommendation and let the owner choose';
  if (options.length === 0) {
    return String(finding.recommendation || '').trim() && !backed(null)
      ? [`finding ${label} recommends scope with no promise behind it: ${fix}`]
      : [];
  }
  return options
    .filter((option) => option && option.recommended && option.defers !== true && !backed(option))
    .map((option) => `finding ${label} recommends scope with no promise behind it (${option.id}): ${fix}`);
}

/**
 * Validate agent-supplied audit findings BEFORE they are baked into the review
 * surface. Strict where normalizeFinding is lenient: the agent must name a real
 * section and a valid category, and every finding must carry text.
 */
function validateFindingsInput(findings, { sectionIds = [], promiseIds = null } = {}) {
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
    errors.push(...validateStructuredFinding(finding, `finding ${label}`));
    errors.push(...scopeRecommendationErrors(finding, label, promiseIds));
  });
  return { ok: errors.length === 0, errors };
}

function buildInitialFeedback({ slug, sourcePath, sourceHash, sections, findings = [], round = 1, exportMethod = 'manual-save', now = new Date() }) {
  const timestamp = now.toISOString();
  return {
    schema_version: '1.2',
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

  if (!SUPPORTED_SCHEMA_VERSIONS.has(feedback.schema_version)) errors.push('schema_version must be 1.0, 1.1, or 1.2');
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

  // findings[] is a 1.1+ field; a 1.0 payload legitimately has none.
  if (['1.1', '1.2'].includes(feedback.schema_version) && !Array.isArray(feedback.findings)) {
    errors.push('findings must be an array');
  }
  if (Array.isArray(feedback.findings)) {
    for (const [index, finding] of feedback.findings.entries()) {
      if (!VALID_FINDING_STATUSES.has(finding.status)) errors.push(`invalid finding status: ${finding.status}`);
      if (!VALID_FINDING_CATEGORIES.has(finding.category)) errors.push(`invalid finding category: ${finding.category}`);
      const structuredFields = ['question', 'selection_mode', 'options', 'selected_option_ids', 'rationale', 'evidence_refs'];
      const hasStructuredField = structuredFields.some((field) => finding[field] !== undefined);
      if (hasStructuredField && feedback.schema_version !== '1.2') {
        errors.push(`finding ${finding.id || `#${index + 1}`} structured fields require schema_version 1.2`);
      }
      if (feedback.schema_version === '1.2') {
        errors.push(...validateStructuredFinding(
          finding,
          `finding ${finding.id || `#${index + 1}`}`,
          { requireAcceptedSelection: true }
        ));
      }
    }
  }

  const stale = Boolean(currentSourceHash && feedback.source_hash !== currentSourceHash);
  if (stale) warnings.push('source_hash differs from current briefings.md');
  if (stale && !allowStale) errors.push('feedback is stale');

  return { ok: errors.length === 0, stale, errors, warnings };
}

function collectApprovedReviewDecisions(findings) {
  const approved = [];
  for (const finding of Array.isArray(findings) ? findings : []) {
    if (!finding || finding.status !== 'accepted') continue;
    const options = Array.isArray(finding.options) ? finding.options : [];
    if (options.length > 0) {
      if (validateStructuredFinding(finding, `finding ${finding.id || '-'}`, { requireAcceptedSelection: true }).length > 0) {
        continue;
      }
      const selectedIds = new Set((finding.selected_option_ids || []).map(String));
      const selectedOptions = options
        .filter((option) => selectedIds.has(String(option.id)))
        .map((option) => ({
          id: String(option.id),
          label: sanitizeText(option.label),
          description: sanitizeText(option.description),
          impact: sanitizeText(option.impact),
          evidence_refs: normalizeTextArray(option.evidence_refs)
        }));
      approved.push({
        id: String(finding.id || ''),
        section_id: String(finding.section_id || ''),
        kind: 'structured_selection',
        question: sanitizeText(finding.question || finding.text),
        selection_mode: finding.selection_mode,
        selected_options: selectedOptions,
        rationale: sanitizeText(finding.rationale || finding.note),
        evidence_refs: normalizeTextArray(finding.evidence_refs)
      });
      continue;
    }
    const recommendation = sanitizeText(finding.recommendation).trim();
    if (!recommendation) continue;
    approved.push({
      id: String(finding.id || ''),
      section_id: String(finding.section_id || ''),
      kind: 'legacy_recommendation',
      question: sanitizeText(finding.text),
      selection_mode: 'legacy',
      selected_options: [{
        id: 'legacy-recommendation',
        label: recommendation,
        description: '',
        impact: '',
        evidence_refs: normalizeTextArray(finding.evidence_refs)
      }],
      rationale: sanitizeText(finding.rationale || finding.note),
      evidence_refs: normalizeTextArray(finding.evidence_refs)
    });
  }
  return approved;
}

function assertFeedbackPath(projectDir, slug, candidatePath) {
  const root = path.resolve(projectDir, '.aioson', 'briefings', slug);
  const resolved = path.resolve(projectDir, candidatePath);
  if (!resolved.startsWith(root + path.sep)) {
    throw new Error('feedback path must stay inside selected briefing directory');
  }
}

module.exports = {
  briefingPromiseIds,
  buildInitialFeedback,
  collectApprovedReviewDecisions,
  DECISION_LIMITS,
  normalizeFinding,
  sanitizeText,
  validateFeedback,
  validateFindingsInput,
  assertFeedbackPath,
  VALID_FINDING_CATEGORIES,
  VALID_FINDING_SEVERITIES,
  VALID_FINDING_STATUSES,
  VALID_SELECTION_MODES
};
