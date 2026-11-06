'use strict';

/**
 * Whether a saved review still needs a second "yes" before it is applied.
 *
 * The owner took the recommended option in 97 of 102 review answers, and half of
 * the conversation in this stage was "I answered the review" and "I confirm". Asking
 * again adds nothing when the owner saved the page with no note and no other choice,
 * and the agent only folded those decisions: saving was the confirmation, and
 * `briefing:approve` is still theirs to run.
 *
 * It stays a question whenever the agent had to interpret something or wrote more than
 * the decisions explain, measured on what the apply would write against what the file
 * holds. A false "needs confirmation" costs one question, the old behavior. A false
 * "clean" would apply text nobody chose, so every doubt falls on the first side.
 */

const { promiseRows } = require('../feature-source-lineage');
const { sectionId, serializeBriefingSections } = require('./briefing-sections');
const { collectApprovedReviewDecisions, sanitizeText } = require('./feedback-schema');
const { planSectionWrites } = require('./section-writes');

// The page writes one of these on save. `manual-save` is what the generator seeds, and
// what an agent leaves when it fills the file itself: nothing shows the owner acted.
const USER_EXPORT_METHODS = new Set(['download', 'copy-paste', 'file-system-access']);

// Closing a question or adding a source row is the bookkeeping of a decision, whichever
// section the decision named. A decision closes about one line, so it licenses about one.
const BOOKKEEPING_SECTIONS = new Set(['open-questions', 'sources', 'identified-gaps', 'additional-files']);

const STABLE_ID_RE = /\b(?:PROM|SRC)-[A-Za-z0-9_-]+/g;

const hasText = (value) => String(value || '').trim().length > 0;
const nonBlankLines = (text) => String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

function reason(code, items) {
  return items.length > 0 ? [{ code, ids: items.map((item) => String(item.id || '-')) }] : [];
}

function selectedOptions(finding) {
  const selected = new Set((finding.selected_option_ids || []).map(String));
  return (finding.options || []).filter((option) => selected.has(String(option.id)));
}

function selectionMatchesRecommendation(finding) {
  const selected = selectedOptions(finding).map((option) => String(option.id));
  const recommended = (finding.options || []).filter((option) => option.recommended).map((option) => String(option.id));
  return selected.length === (finding.selected_option_ids || []).length
    && selected.length === recommended.length
    && recommended.every((id) => selected.includes(id));
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

function findingReasons(findings) {
  return [
    ...reason('notes', findings.filter((finding) => hasText(finding.note) || hasText(finding.rationale))),
    ...reason('unresolved', findings.filter((finding) => finding.status !== 'accepted' && !isUntouchedSuggestion(finding))),
    ...reason('other_choice', findings.filter((finding) => finding.status === 'accepted' && !selectionMatchesRecommendation(finding)))
  ];
}

// The generator stamps what the agent wrote already decided, which is not the owner's act
// on this page. A page with no stamp cannot say who decided.
function arrivedDecidedReasons(source) {
  if (!Array.isArray(source.arrived_decided)) return [{ code: 'arrived_decided', ids: [] }];
  return reason('arrived_decided', source.arrived_decided.map((id) => ({ id })));
}

// An option that defers leaves the scope as it was, so it asks for no text.
function decisionsAskingForText(findings) {
  const deferring = findings.filter((finding) => {
    const options = selectedOptions(finding);
    return options.length > 0 && options.every((option) => option.defers);
  });
  const deferred = new Set(deferring.map((finding) => String(finding.id)));
  return collectApprovedReviewDecisions(findings).filter((decision) => !deferred.has(decision.id));
}

function linesLost(section) {
  const kept = new Set(nonBlankLines(section.current_text));
  return nonBlankLines(section.file_text).filter((line) => !kept.has(line)).length;
}

// A heading would start another section, and folding a decision never leaves a section
// with one line: neither happened in the real rounds on record.
function reshapesSection(section) {
  return /^##\s/m.test(section.current_text)
    || (nonBlankLines(section.file_text).length >= 3 && nonBlankLines(section.current_text).length <= 1);
}

function explainedByDecisions(decisions) {
  const named = new Set(decisions.map((decision) => decision.section_id));
  return (section) => {
    if (reshapesSection(section)) return false;
    const id = sectionId(section.title);
    if (named.has(id)) return true;
    return BOOKKEEPING_SECTIONS.has(id) && decisions.length > 0 && linesLost(section) <= decisions.length;
  };
}

// The agent marks what it rewrites. The same mark on untouched text is a request from the
// page with nothing yet done about it, a section with no heading of its title would be
// dropped, and an emptied one keeps its old text: none of these is what was asked.
function needsAction(section) {
  return section.file_text === undefined
    || (!hasText(section.requested_text) && hasText(section.file_text))
    || ['remove_requested', 'blocked'].includes(section.status)
    || (section.status === 'change_requested' && section.current_text === section.file_text);
}

function dropsStableIds(section) {
  const kept = new Set(String(section.current_text).match(STABLE_ID_RE) || []);
  return (String(section.file_text || '').match(STABLE_ID_RE) || []).some((id) => !kept.has(id));
}

// Applying strips what looks like a tag. A line of the file with one stays only while
// nobody changes it, and one the agent wrote would never reach the file.
function losesMarkup(section) {
  if (sanitizeText(section.requested_text) !== section.requested_text) return true;
  const written = new Set(section.current_text.split('\n'));
  return String(section.file_text || '').split(/\r?\n/).some((line) => /[<>]/.test(line) && !written.has(line));
}

function changedPromises(before, after) {
  const kept = new Map(promiseRows(after).map((row) => [row.id, row]));
  return promiseRows(before).filter((row) => {
    const now = kept.get(row.id);
    return !now || now.intent !== row.intent || now.state !== row.state;
  });
}

// The next round has to read what this one writes: a repeated heading would refuse it.
function writtenReasons(briefing, sections) {
  try {
    return reason('promises_changed', changedPromises(briefing, serializeBriefingSections(briefing, sections)));
  } catch (error) {
    return reason('unwritable', [{ id: error.code || 'no_sections' }]);
  }
}

function sectionReasons(source, findings, briefing) {
  const sections = planSectionWrites(briefing, source);
  const changed = sections.filter((section) => section.file_text !== undefined && section.current_text !== section.file_text);
  const explained = explainedByDecisions(decisionsAskingForText(findings));
  return [
    ...reason('section_action', sections.filter(needsAction)),
    ...reason('text_outside_findings', changed.filter((section) => !explained(section))),
    ...reason('ids_dropped', changed.filter(dropsStableIds)),
    ...reason('markup_stripped', changed.filter(losesMarkup)),
    ...writtenReasons(briefing, sections)
  ];
}

/**
 * `{ required, reasons }`: each reason is `{ code, ids }`, in the order a reader
 * would check them. No reasons means the saved page is the confirmation. `briefing`
 * is the file as it stands, which everything about the text is measured against.
 */
function assessRoundConfirmation(feedback, { stale = false, briefing = '' } = {}) {
  const source = feedback && typeof feedback === 'object' ? feedback : {};
  const findings = Array.isArray(source.findings) ? source.findings : [];
  const reasons = [
    ...(USER_EXPORT_METHODS.has(source.export_method) ? [] : [{ code: 'not_saved_by_the_owner', ids: [] }]),
    ...(stale ? [{ code: 'stale', ids: [] }] : []),
    ...arrivedDecidedReasons(source),
    ...findingReasons(findings),
    ...reason('section_notes', source.comments || []),
    ...reason('decisions', source.decisions || []),
    ...reason('blocking_items', source.blocking_items || []),
    ...sectionReasons(source, findings, briefing)
  ];
  return { required: reasons.length > 0, reasons };
}

function describeConfirmationReasons(reasons) {
  return reasons.map(({ code, ids }) => (ids.length > 0 ? `${code} (${ids.join(', ')})` : code)).join('; ');
}

module.exports = { assessRoundConfirmation, describeConfirmationReasons, USER_EXPORT_METHODS };
