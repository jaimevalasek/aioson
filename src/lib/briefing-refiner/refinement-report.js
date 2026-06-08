'use strict';

function list(items, formatter) {
  if (!items || items.length === 0) return '- None';
  return items.map((item, index) => `- ${formatter(item, index)}`).join('\n');
}

function buildRefinementReport(data) {
  const nextAction = data.next_action || 'rerun_review';
  return [
    `# Refinement Report — ${data.briefing_slug}`,
    '',
    `- Source briefing: ${data.source_briefing_path}`,
    `- Feedback: ${data.feedback_path || '.aioson/briefings/{slug}/refinement-feedback.json'}`,
    `- Source hash: ${data.source_hash || '-'}`,
    `- Applied hash: ${data.applied_hash || '-'}`,
    `- Status: ${data.status || 'review_generated'}`,
    `- Next action: ${nextAction}`,
    '',
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
