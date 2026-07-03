'use strict';

const fs = require('node:fs/promises');
const { hashText, serializeBriefingSections } = require('./briefing-sections');
const { validateFeedback, sanitizeText } = require('./feedback-schema');
const { buildRefinementReport } = require('./refinement-report');
const { resolveBriefingPath } = require('./briefing-paths');
const {
  findBriefing,
  markRefinementState,
  readBriefingRegistry,
  returnApprovedBriefingToDraft,
  writeBriefingRegistry
} = require('./briefing-registry');

function summarizeChange(section, nextText) {
  if (section.status === 'remove_requested') return 'remove requested';
  if (section.original_text !== nextText) return 'text changed';
  return section.status || 'accepted';
}

function summarizeSkippedChanges(feedback) {
  const sectionChanges = (feedback.sections || [])
    .filter((section) => section.status !== 'unchanged' || section.current_text !== section.original_text)
    .map((section) => ({
      section_id: section.id,
      title: section.title,
      reason: `declined by user: ${summarizeChange(section, section.current_text)}`
    }));

  const decisionChanges = (feedback.decisions || [])
    .filter((decision) => !decision.applied)
    .map((decision) => ({
      section_id: decision.section_id,
      title: decision.id,
      reason: `declined by user: ${decision.status || 'decision'}`
    }));

  return [...sectionChanges, ...decisionChanges];
}

// Declining never writes to briefings.md, so a stale source hash is irrelevant
// to safety — validating it would only dead-end the user whose briefing moved
// on. Hence allowStale defaults to TRUE here (and only here).
async function applyDeclinedFeedback(projectDir, slug, feedback, { allowStale = true } = {}) {
  const briefingPath = resolveBriefingPath(projectDir, slug, 'briefings.md');
  const currentMarkdown = await fs.readFile(briefingPath, 'utf8');
  const currentSourceHash = hashText(currentMarkdown);
  const validation = validateFeedback(feedback, { slug, currentSourceHash, allowStale });
  if (!validation.ok) {
    return { ok: false, error: 'invalid_feedback', validation };
  }

  const skippedChanges = summarizeSkippedChanges(feedback);
  const unresolvedComments = (feedback.comments || []).filter((comment) => !comment.resolved);
  const report = buildRefinementReport({
    briefing_slug: slug,
    source_briefing_path: `.aioson/briefings/${slug}/briefings.md`,
    feedback_path: `.aioson/briefings/${slug}/refinement-feedback.json`,
    source_hash: feedback.source_hash,
    applied_hash: currentSourceHash,
    status: 'declined',
    round: feedback.round || 1,
    applied_changes: [],
    skipped_changes: skippedChanges,
    unresolved_comments: unresolvedComments,
    blocking_items: feedback.blocking_items || [],
    findings: feedback.findings || [],
    next_action: 'rerun_review'
  });

  await fs.writeFile(resolveBriefingPath(projectDir, slug, 'refinement-report.md'), report, 'utf8');

  return { ok: true, skippedChanges, nextAction: 'rerun_review', appliedHash: currentSourceHash };
}

async function applyConfirmedFeedback(projectDir, slug, feedback, { confirmed = false, allowStale = false } = {}) {
  if (!confirmed) {
    return { ok: false, error: 'confirmation_required' };
  }

  const briefingPath = resolveBriefingPath(projectDir, slug, 'briefings.md');
  const currentMarkdown = await fs.readFile(briefingPath, 'utf8');
  const currentSourceHash = hashText(currentMarkdown);
  const validation = validateFeedback(feedback, { slug, currentSourceHash, allowStale });
  if (!validation.ok) {
    return { ok: false, error: 'invalid_feedback', validation };
  }

  const sections = feedback.sections.map((section) => {
    const currentText = section.status === 'remove_requested' ? 'TBD' : sanitizeText(section.current_text || section.original_text || '');
    return { ...section, current_text: currentText };
  });
  const nextMarkdown = serializeBriefingSections(currentMarkdown, sections);
  const appliedHash = hashText(nextMarkdown);
  const appliedChanges = sections
    .filter((section) => section.status !== 'unchanged' || section.current_text !== section.original_text)
    .map((section) => ({ section_id: section.id, title: section.title, summary: summarizeChange(section, section.current_text) }));

  await fs.writeFile(briefingPath, nextMarkdown, 'utf8');

  const registry = await readBriefingRegistry(projectDir);
  const entry = findBriefing(registry, slug);
  // Decide whether a real revert happens BEFORE mutating entry.status, otherwise
  // a briefing that was already `draft` would be misreported as returnedToDraft.
  const returnedToDraft = Boolean(
    entry && entry.status === 'approved' && !entry.prd_generated && appliedChanges.length > 0
  );
  if (returnedToDraft) {
    returnApprovedBriefingToDraft(registry, slug);
  }
  // A blocking finding the user left pending blocks the PRD the same way an
  // explicit blocking item does — even if the export step never mirrored it
  // into blocking_items (hand-written feedback).
  const pendingBlockingFindings = (feedback.findings || []).filter(
    (finding) => finding.blocking && finding.status === 'pending'
  );
  const hasBlockers = (feedback.blocking_items || []).length > 0 || pendingBlockingFindings.length > 0;
  markRefinementState(registry, slug, {
    refinement_status: hasBlockers ? 'blocked' : 'applied',
    review_html: `.aioson/briefings/${slug}/review.html`,
    refinement_report: `.aioson/briefings/${slug}/refinement-report.md`
  });
  await writeBriefingRegistry(projectDir, registry);

  const unresolvedComments = (feedback.comments || []).filter((comment) => !comment.resolved);
  const nextAction = hasBlockers ? 'resolve_blockers' : 'approve_briefing';
  const report = buildRefinementReport({
    briefing_slug: slug,
    source_briefing_path: `.aioson/briefings/${slug}/briefings.md`,
    feedback_path: `.aioson/briefings/${slug}/refinement-feedback.json`,
    source_hash: feedback.source_hash,
    applied_hash: appliedHash,
    status: 'applied',
    round: feedback.round || 1,
    applied_changes: appliedChanges,
    skipped_changes: [],
    unresolved_comments: unresolvedComments,
    blocking_items: feedback.blocking_items || [],
    findings: feedback.findings || [],
    next_action: nextAction
  });
  await fs.writeFile(resolveBriefingPath(projectDir, slug, 'refinement-report.md'), report, 'utf8');

  return { ok: true, appliedChanges, nextAction, appliedHash, returnedToDraft, pendingBlockingFindings: pendingBlockingFindings.length };
}

module.exports = { applyConfirmedFeedback, applyDeclinedFeedback };
