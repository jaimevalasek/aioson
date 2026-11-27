'use strict';

/**
 * The closed schema of an outcome record — the promise behind every word the
 * feedback screen says about privacy.
 *
 * A record holds numbers, booleans and enumerations about how aioson was
 * used and how the delivery went. The ONLY free text is the person's own
 * comment (feedback.good / feedback.bad), already scrubbed (scrub.js) and
 * capped. No path, no file name, no project name, no PRD or finding text has
 * a field to live in: validateRecord refuses any key it does not know and any
 * value of the wrong shape, and ledger.writeRecord never writes a record that
 * fails it. The feature slug is the file name and the join key; it stays in
 * the project, and any future export replaces it before anything leaves.
 */

const { TEXT_MAX } = require('./scrub');

const SCHEMA_VERSION = 1;
const KINDS = ['feature', 'simple-plan'];
const CLASSIFICATIONS = ['MICRO', 'SMALL', 'MEDIUM'];
const VERDICTS = ['PASS', 'FAIL', 'ACCEPTED_WITH_FOLLOWUPS', 'DONE'];
const SHAPES = ['simple-plan', 'single-dev', 'orchestrated'];
const CHOICES = ['later', 'week', 'month', 'never'];
// The practice catalog (practices.js labels and detects exactly these). A key
// outside it is refused on write and dropped on read: an id is the one place
// a record could otherwise carry a word of its own.
const PRACTICE_IDS = [
  'visual_inputs', 'document_inputs', 'data_inputs', 'identity_from_references',
  'prototype_approved', 'visual_directions', 'prd_reviewed', 'phased_plan',
  'runtime_proven', 'browser_walkthrough', 'shakedown', 'decisions_recorded',
  'tests_reported', 'project_rules'
];
const PRACTICE_SET = new Set(PRACTICE_IDS);
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const VERSION = /^\d{1,4}\.\d{1,4}\.\d{1,4}(?:-(?:alpha|beta|rc)(?:\.\d{1,4})?)?$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const TOP_KEYS = new Set(['schema', 'feature', 'kind', 'classification', 'verdict', 'closed_at', 'aioson_version', 'catalog_version', 'shape', 'autopilot', 'practices', 'outcome', 'feedback']);
const OUTCOME_KEYS = {
  first_pass: 'boolean',
  fail_cycles: 'count',
  findings_critical: 'count',
  findings_high: 'count',
  findings_medium: 'count',
  findings_low: 'count',
  compactions: 'count',
  tokens: 'count',
  duration_hours: 'number',
  agent_sessions: 'count',
  gate_reds: 'count'
};

const isCount = (v) => Number.isInteger(v) && v >= 0 && v <= 1e12;
const isNumber = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1e9;

function checkValue(kind, value) {
  if (value === null) return true;
  if (kind === 'boolean') return typeof value === 'boolean';
  if (kind === 'count') return isCount(value);
  if (kind === 'number') return isNumber(value);
  return false;
}

function checkOutcome(outcome, errors) {
  if (!outcome || typeof outcome !== 'object' || Array.isArray(outcome)) { errors.push('outcome must be an object'); return; }
  for (const [key, value] of Object.entries(outcome)) {
    if (!OUTCOME_KEYS[key]) errors.push(`outcome.${key} is not in the schema`);
    else if (!checkValue(OUTCOME_KEYS[key], value)) errors.push(`outcome.${key} must be ${OUTCOME_KEYS[key]} or null`);
  }
}

function checkPractices(practices, errors) {
  if (!practices || typeof practices !== 'object' || Array.isArray(practices)) { errors.push('practices must be an object'); return; }
  for (const [id, value] of Object.entries(practices)) {
    if (!PRACTICE_SET.has(id)) errors.push('a practices key is not in the practice catalog');
    else if (value !== null && typeof value !== 'boolean') errors.push(`practices.${id} must be boolean or null`);
  }
}

/**
 * A record as read from disk, made safe to analyze: practice ids outside this
 * version's catalog (a newer aioson's, or hand-edited ones) are dropped, so
 * no unknown word reaches REPORT.md or a tip. null when the rest is invalid.
 */
function sanitizeRead(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
  const practices = record.practices && typeof record.practices === 'object' && !Array.isArray(record.practices)
    ? Object.fromEntries(Object.entries(record.practices).filter(([id]) => PRACTICE_SET.has(id)))
    : record.practices;
  const clean = { ...record, practices };
  return validateRecord(clean).ok ? clean : null;
}

function checkComment(value, key, errors) {
  if (typeof value !== 'string') { errors.push(`feedback.${key} must be a string`); return; }
  if ([...value].length > TEXT_MAX) errors.push(`feedback.${key} is longer than ${TEXT_MAX}`);
}

function checkFeedback(feedback, errors) {
  if (feedback === undefined || feedback === null) return;
  if (typeof feedback !== 'object' || Array.isArray(feedback)) { errors.push('feedback must be an object'); return; }
  const allowed = feedback.skipped_at !== undefined
    ? new Set(['skipped_at', 'choice'])
    : new Set(['rating', 'good', 'bad', 'answered_at', 'aioson_version']);
  for (const key of Object.keys(feedback)) if (!allowed.has(key)) errors.push(`feedback.${key} is not in the schema`);
  if (feedback.skipped_at !== undefined) {
    if (!ISO.test(String(feedback.skipped_at))) errors.push('feedback.skipped_at must be an ISO timestamp');
    if (!CHOICES.includes(feedback.choice)) errors.push('feedback.choice is not a known choice');
    return;
  }
  if (feedback.rating !== null && !(Number.isInteger(feedback.rating) && feedback.rating >= 1 && feedback.rating <= 5)) errors.push('feedback.rating must be 1-5 or null');
  checkComment(feedback.good, 'good', errors);
  checkComment(feedback.bad, 'bad', errors);
  if (!ISO.test(String(feedback.answered_at))) errors.push('feedback.answered_at must be an ISO timestamp');
  if (feedback.aioson_version !== undefined && !VERSION.test(String(feedback.aioson_version))) errors.push('feedback.aioson_version is not a version');
}

function checkHeader(record, errors) {
  for (const key of Object.keys(record)) if (!TOP_KEYS.has(key)) errors.push(`${key.slice(0, 40)} is not in the schema`);
  if (record.schema !== SCHEMA_VERSION) errors.push(`schema must be ${SCHEMA_VERSION}`);
  if (!SLUG.test(String(record.feature || ''))) errors.push('feature must be a kebab-case slug');
  if (!KINDS.includes(record.kind)) errors.push('kind must be feature or simple-plan');
  if (record.classification !== null && !CLASSIFICATIONS.includes(record.classification)) errors.push('classification must be MICRO, SMALL, MEDIUM or null');
  if (!VERDICTS.includes(record.verdict)) errors.push('verdict is not a known verdict');
  if (!ISO.test(String(record.closed_at || ''))) errors.push('closed_at must be an ISO timestamp');
  if (record.aioson_version !== null && !VERSION.test(String(record.aioson_version))) errors.push('aioson_version is not a version');
  if (!isCount(record.catalog_version)) errors.push('catalog_version must be a count');
  if (record.shape !== null && !SHAPES.includes(record.shape)) errors.push('shape is not a known execution shape');
  if (record.autopilot !== null && typeof record.autopilot !== 'boolean') errors.push('autopilot must be boolean or null');
}

/** validateRecord(record) → { ok, errors[] } */
function validateRecord(record) {
  const errors = [];
  if (!record || typeof record !== 'object' || Array.isArray(record)) return { ok: false, errors: ['record must be an object'] };
  checkHeader(record, errors);
  checkPractices(record.practices, errors);
  checkOutcome(record.outcome, errors);
  checkFeedback(record.feedback, errors);
  return { ok: errors.length === 0, errors };
}

module.exports = {
  SCHEMA_VERSION,
  KINDS,
  CLASSIFICATIONS,
  VERDICTS,
  SHAPES,
  CHOICES,
  SLUG,
  PRACTICE_IDS,
  OUTCOME_KEYS,
  validateRecord,
  sanitizeRead
};
