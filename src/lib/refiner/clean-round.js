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
 * other than the recommended one, a section it rewrote that no accepted finding
 * names. A false "needs confirmation" costs one question, the old behavior. A false
 * "clean" would apply text nobody chose, so every doubt falls on the first side.
 */

// The page writes one of these on save. `manual-save` is what the generator seeds, and
// what an agent leaves when it fills the file itself: nothing shows the owner acted.
const USER_EXPORT_METHODS = new Set(['download', 'copy-paste', 'file-system-access']);

// Closing a question or adding a source row is the bookkeeping of an accepted decision,
// whichever section the finding named.
const BOOKKEEPING_SECTIONS = new Set(['open-questions', 'sources', 'identified-gaps', 'additional-files']);

const hasText = (value) => String(value || '').trim().length > 0;
const idsOf = (items) => items.map((item) => String(item.id || '-'));

function selectionMatchesRecommendation(finding) {
  const options = Array.isArray(finding.options) ? finding.options : [];
  const selected = new Set((finding.selected_option_ids || []).map(String));
  const recommended = options.filter((option) => option.recommended).map((option) => String(option.id));
  return selected.size === recommended.length && recommended.every((id) => selected.has(id));
}

// A suggestion with no recommendation, left alone, leaves the scope as it was.
function isUntouchedSuggestion(finding) {
  return finding.category === 'scope-suggestion'
    && !finding.blocking
    && ['pending', 'deferred'].includes(finding.status)
    && (finding.selected_option_ids || []).length === 0;
}

function sectionsRewrittenOutsideFindings(feedback, findings) {
  const named = new Set(findings.filter((finding) => finding.status === 'accepted').map((finding) => String(finding.section_id || '')));
  return (feedback.sections || []).filter((section) => section.current_text !== section.original_text
    && !named.has(String(section.id || ''))
    && !BOOKKEEPING_SECTIONS.has(String(section.id || '')));
}

function findingReasons(findings) {
  const reasons = [];
  const push = (code, items) => { if (items.length > 0) reasons.push({ code, ids: idsOf(items) }); };
  push('notes', findings.filter((finding) => hasText(finding.note) || hasText(finding.rationale)));
  push('unresolved', findings.filter((finding) => finding.status !== 'accepted' && !isUntouchedSuggestion(finding)));
  push('other_choice', findings.filter((finding) => finding.status === 'accepted' && !selectionMatchesRecommendation(finding)));
  return reasons;
}

/**
 * `{ required, reasons }`: each reason is `{ code, ids }`, in the order a reader
 * would check them. No reasons means the saved page is the confirmation.
 */
function assessRoundConfirmation(feedback, { stale = false } = {}) {
  const source = feedback && typeof feedback === 'object' ? feedback : {};
  const findings = Array.isArray(source.findings) ? source.findings : [];
  const sections = Array.isArray(source.sections) ? source.sections : [];
  const reasons = [];
  const push = (code, items) => { if (items.length > 0) reasons.push({ code, ids: idsOf(items) }); };
  if (!USER_EXPORT_METHODS.has(source.export_method)) reasons.push({ code: 'not_saved_by_the_owner', ids: [] });
  if (stale) reasons.push({ code: 'stale', ids: [] });
  reasons.push(...findingReasons(findings));
  push('section_notes', source.comments || []);
  push('decisions', source.decisions || []);
  push('blocking_items', source.blocking_items || []);
  push('section_action', sections.filter((section) => ['remove_requested', 'blocked'].includes(section.status)));
  push('text_outside_findings', sectionsRewrittenOutsideFindings(source, findings));
  return { required: reasons.length > 0, reasons };
}

function describeConfirmationReasons(reasons) {
  return reasons.map(({ code, ids }) => (ids.length > 0 ? `${code} (${ids.join(', ')})` : code)).join('; ');
}

module.exports = { assessRoundConfirmation, describeConfirmationReasons, USER_EXPORT_METHODS };
