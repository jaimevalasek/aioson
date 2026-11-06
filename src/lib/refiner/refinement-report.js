'use strict';

const { collectApprovedReviewDecisions } = require('./feedback-schema');

function list(items, formatter) {
  if (!items || items.length === 0) return '- None';
  return items.map((item, index) => `- ${formatter(item, index)}`).join('\n');
}

function isAppliedArchivePath(value, slug) {
  const prefix = `.aioson/briefings/${slug}/refinement-feedback.applied-round`;
  return String(value || '').startsWith(prefix) && String(value).endsWith('.json');
}

function selectedLabels(decision) {
  return decision.selected_options
    .map((option) => `${option.id} — ${option.label}`)
    .join('; ');
}

function buildRefinementReport(data) {
  const nextAction = data.next_action || 'rerun_review';
  const findings = Array.isArray(data.findings) ? data.findings : [];
  const approvedDecisions = data.status === 'applied'
    ? collectApprovedReviewDecisions(findings)
    : [];
  const feedbackPath = data.feedback_path || '.aioson/briefings/{slug}/refinement-feedback.json';
  const hasAuthorityTrace = data.status === 'applied'
    && Boolean(data.source_hash)
    && Boolean(data.applied_hash)
    && isAppliedArchivePath(feedbackPath, data.briefing_slug);
  const authorityStatus = approvedDecisions.length > 0 && hasAuthorityTrace
    ? 'binding'
    : 'nonbinding';
  const approvedSources = [...new Set(approvedDecisions.flatMap((decision) => [
    ...decision.evidence_refs,
    ...decision.selected_options.flatMap((option) => option.evidence_refs || [])
  ]))];
  const findingsBlock = findings.length > 0
    ? [
        '## Findings',
        '',
        list(findings, (finding) => `${finding.id} [${finding.category}/${finding.severity}${finding.blocking ? '/blocking' : ''}] (${finding.status}) ${finding.section_id}: ${finding.text}`),
        ''
      ]
    : [];
  return [
    `# Refinement Report — ${data.briefing_slug}`,
    '',
    `- Source briefing: ${data.source_briefing_path}`,
    `- Feedback: ${feedbackPath}`,
    `- Source hash: ${data.source_hash || '-'}`,
    `- Applied hash: ${data.applied_hash || '-'}`,
    `- Status: ${data.status || 'review_generated'}`,
    `- Round: ${data.round || 1}`,
    ...(data.confirmation ? [`- Confirmation: ${data.confirmation}`] : []),
    `- Next action: ${nextAction}`,
    `- Approved review authority: ${authorityStatus}`,
    '',
    '## Approved Review Decisions',
    '',
    approvedDecisions.length > 0
      ? list(approvedDecisions, (decision) => `${decision.id} [${decision.kind}] ${decision.section_id}: ${selectedLabels(decision)}${decision.rationale ? ` | rationale: ${decision.rationale}` : ''}`)
      : '- None — pending, rejected, deferred, recommended-only, malformed, stale, declined, or unarchived review material is nonbinding.',
    '',
    '## Approved Source References',
    '',
    list(approvedSources, (source) => source),
    '',
    ...findingsBlock,
    '## Applied Changes',
    '',
    list(data.applied_changes, (change) => `${change.section_id || change.title}: ${change.summary || 'updated'}`),
    '',
    '## Skipped Changes',
    '',
    list(data.skipped_changes, (change) => `${change.section_id || change.title || 'unknown'}: ${change.reason || 'not applied'}`),
    '',
    '## Unresolved Comments',
    '',
    list(data.unresolved_comments, (comment) => `${comment.section_id || 'unknown'} [${comment.severity || 'note'}]: ${comment.note || comment.author_note || '-'}`),
    '',
    '## Blocking Items',
    '',
    list(data.blocking_items, (item) => `${item.section_id || 'unknown'}: ${item.note || item.reason || item.title || '-'}`),
    ''
  ].join('\n');
}

module.exports = { buildRefinementReport };
