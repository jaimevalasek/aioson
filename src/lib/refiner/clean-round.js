'use strict';

/**
 * Whether a saved review still needs a second "yes" before it is applied.
 *
 * The owner took the recommended option in 97 of 102 review answers, and half of
 * the conversation in this stage was "I answered the review" and "I confirm". Asking
 * again adds nothing when the owner saved the page with no note and no other choice:
 * saving was the confirmation, and `briefing:approve` is still theirs to run.
 *
 * It stays a question whenever the agent had to interpret something: a note, a choice
 * other than the recommended one, a section it rewrote that no accepted decision
 * names. A false "needs confirmation" costs one question, the old behavior. A false
 * "clean" would apply text nobody chose, so every doubt falls on the first side.
 */

const { collectApprovedReviewDecisions, sanitizeText } = require('./feedback-schema');

// The page writes one of these on save. `manual-save` is what the generator seeds, and
// what an agent leaves when it fills the file itself: nothing shows the owner acted.
const USER_EXPORT_METHODS = new Set(['download', 'copy-paste', 'file-system-access']);

// Closing a question or adding a source row is the bookkeeping of an accepted decision,
// whichever section the decision named. With no decision there is nothing to keep.
const BOOKKEEPING_SECTIONS = new Set(['open-questions', 'sources', 'identified-gaps', 'additional-files']);

const STABLE_ID_RE = /\b(?:PROM|SRC)-[A-Za-z0-9_-]+/g;

const hasText = (value) => String(value || '').trim().length > 0;

function reason(code, items) {
  return items.length > 0 ? [{ code, ids: items.map((item) => String(item.id || '-')) }] : [];
}

function selectionMatchesRecommendation(finding) {
  const options = Array.isArray(finding.options) ? finding.options : [];
  const selected = new Set((finding.selected_option_ids || []).map(String));
  const recommended = options.filter((option) => option.recommended).map((option) => String(option.id));
  return selected.size === recommended.length && recommended.every((id) => selected.has(id));
}

// A suggestion nobody recommended, left alone, leaves the scope as it was. One that a
// promise backs and the owner did not take is an answer the agent would have to read.
function isUntouchedSuggestion(finding) {
  return finding.category === 'scope-suggestion'
    && !finding.blocking
    && ['pending', 'deferred'].includes(finding.status)
    && (finding.selected_option_ids || []).length === 0
    && !hasText(finding.recommendation)
    && !(finding.options || []).some((option) => option.recommended);
}

function findingReasons(findings, inputFindings) {
  const seeded = Array.isArray(inputFindings) ? inputFindings : (inputFindings && inputFindings.findings) || [];
  return [
    ...reason('arrived_decided', seeded.filter((finding) => finding && ((finding.status && finding.status !== 'pending') || (finding.selected_option_ids || []).length > 0))),
    ...reason('notes', findings.filter((finding) => hasText(finding.note) || hasText(finding.rationale))),
    ...reason('unresolved', findings.filter((finding) => finding.status !== 'accepted' && !isUntouchedSuggestion(finding))),
    ...reason('other_choice', findings.filter((finding) => finding.status === 'accepted' && !selectionMatchesRecommendation(finding)))
  ];
}

// The text the file holds, in the form the review shows it. The JSON carries a copy that
// a save can change along with the edit, so the file is what a change is measured by.
function fileText(section, briefingSections) {
  const raw = briefingSections ? briefingSections.get(String(section.id || '')) : undefined;
  return raw === undefined ? section.original_text : sanitizeText(raw);
}

function dropsStableIds(section, briefingSections) {
  const kept = new Set(String(section.current_text || '').match(STABLE_ID_RE) || []);
  return (String(fileText(section, briefingSections) || '').match(STABLE_ID_RE) || []).some((id) => !kept.has(id));
}

function sectionReasons(source, findings, briefingSections) {
  const sections = Array.isArray(source.sections) ? source.sections : [];
  const changed = sections.filter((section) => section.current_text !== fileText(section, briefingSections));
  const approved = collectApprovedReviewDecisions(findings);
  const named = new Set(approved.map((decision) => decision.section_id));
  const covered = (section) => named.has(String(section.id || '')) || (approved.length > 0 && BOOKKEEPING_SECTIONS.has(String(section.id || '')));
  return [
    // The agent marks what it rewrites. The same mark on untouched text is a request
    // from the page, with nothing yet done about it.
    ...reason('section_action', sections.filter((section) => ['remove_requested', 'blocked'].includes(section.status) || (section.status === 'change_requested' && !changed.includes(section)))),
    ...reason('text_outside_findings', changed.filter((section) => !covered(section))),
    ...reason('ids_dropped', changed.filter((section) => dropsStableIds(section, briefingSections))),
    // Applying strips what looks like a tag, so `Map<string, User>` would lose its type.
    ...reason('markup_stripped', changed.filter((section) => sanitizeText(section.current_text) !== section.current_text))
  ];
}

/**
 * `{ required, reasons }`: each reason is `{ code, ids }`, in the order a reader
 * would check them. No reasons means the saved page is the confirmation.
 * `briefingSections` maps a section id to its text in the file, and `inputFindings`
 * is what the agent wrote for the review, where a decision already filled in is not
 * the owner's act on this page.
 */
function assessRoundConfirmation(feedback, { stale = false, briefingSections = null, inputFindings = null } = {}) {
  const source = feedback && typeof feedback === 'object' ? feedback : {};
  const findings = Array.isArray(source.findings) ? source.findings : [];
  const reasons = [
    ...(USER_EXPORT_METHODS.has(source.export_method) ? [] : [{ code: 'not_saved_by_the_owner', ids: [] }]),
    ...(stale ? [{ code: 'stale', ids: [] }] : []),
    ...findingReasons(findings, inputFindings),
    ...reason('section_notes', source.comments || []),
    ...reason('decisions', source.decisions || []),
    ...reason('blocking_items', source.blocking_items || []),
    ...sectionReasons(source, findings, briefingSections)
  ];
  return { required: reasons.length > 0, reasons };
}

function describeConfirmationReasons(reasons) {
  return reasons.map(({ code, ids }) => (ids.length > 0 ? `${code} (${ids.join(', ')})` : code)).join('; ');
}

module.exports = { assessRoundConfirmation, describeConfirmationReasons, USER_EXPORT_METHODS };
