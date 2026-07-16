'use strict';

const crypto = require('node:crypto');
const { stripInjectionChars } = require('../lib/llm-content-sanitizer');

const PACKET_SCHEMA_VERSION = 'review-packet/v1';
const REPORT_SCHEMA_VERSION = 'review-report/v1';
const MAX_SOURCE_BYTES = 5 * 1024 * 1024;
const MAX_REPORT_BYTES = 1024 * 1024;
const MAX_FINDINGS = 100;
const MAX_EVIDENCE_PER_FINDING = 20;
const MAX_CANONICAL_FILES = 1000;

const PROFILES = new Set(['framing', 'specification', 'architecture', 'delivery-assurance']);
const REVIEW_MODES = new Set(['self_review', 'independent_review']);
const REVIEW_STATUSES = new Set(['pass', 'blocked', 'decision_required', 'unverified']);
const FINDING_STATUSES = new Set(['open', 'resolved', 'decision_required', 'deferred']);
const SEVERITIES = new Set(['info', 'warning', 'blocking']);
const CONFIDENCE_LEVELS = new Set(['high', 'medium', 'low']);
const EVIDENCE_TYPES = new Set(['artifact', 'code', 'test', 'research-cache', 'runtime', 'command', 'decision']);
const EVIDENCE_STATUSES = new Set(['passed', 'failed', 'not_run', 'unverified', 'recorded']);
const ASSURANCE_STATUSES = new Set(['pass', 'fail', 'unverified', 'not_applicable']);
const ASSURANCE_AXES = Object.freeze([
  'specification_fidelity',
  'acceptance_coverage',
  'code_health',
  'runtime_truth',
  'residual_risk'
]);

const PRIVATE_KEY_PARTS = ['chainofthought', 'reasoning', 'thoughts', 'scratchpad', 'deliberation'];
const AGGREGATE_SCORE_KEYS = new Set(['overallscore', 'score', 'rating', 'percentage', 'rank']);

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeKey(key) {
  return String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function scanForbiddenKeys(value, errors, path = '$', seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanForbiddenKeys(item, errors, `${path}[${index}]`, seen));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    const normalized = normalizeKey(key);
    if (PRIVATE_KEY_PARTS.some((part) => normalized.includes(part))) {
      errors.push({ path: `${path}.${key}`, reason: 'private_reasoning_forbidden' });
    }
    if (AGGREGATE_SCORE_KEYS.has(normalized)) {
      errors.push({ path: `${path}.${key}`, reason: 'aggregate_score_forbidden' });
    }
    scanForbiddenKeys(child, errors, `${path}.${key}`, seen);
  }
}

function checkObject(value, path, required, optional, errors) {
  if (!isObject(value)) {
    errors.push({ path, reason: 'must_be_object' });
    return false;
  }
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) errors.push({ path: `${path}.${key}`, reason: 'unknown_field' });
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) errors.push({ path: `${path}.${key}`, reason: 'missing' });
  }
  return true;
}

function checkString(value, path, errors, { min = 1, max = 4000, pattern } = {}) {
  if (typeof value !== 'string') {
    errors.push({ path, reason: 'must_be_string' });
    return false;
  }
  if (value.length < min) errors.push({ path, reason: 'too_short', min });
  if (value.length > max) errors.push({ path, reason: 'too_long', max });
  if (pattern && !pattern.test(value)) errors.push({ path, reason: 'invalid_format' });
  return true;
}

function checkSafeString(value, path, errors, options) {
  const valid = checkString(value, path, errors, options);
  if (typeof value === 'string' && stripInjectionChars(value) !== value) {
    errors.push({ path, reason: 'injection_carrier_forbidden' });
  }
  return valid;
}

function checkEnum(value, allowed, path, errors) {
  if (!allowed.has(value)) errors.push({ path, reason: 'invalid_value' });
}

function checkTimestamp(value, path, errors) {
  if (!checkString(value, path, errors, { max: 64 })) return;
  if (!Number.isFinite(Date.parse(value))) errors.push({ path, reason: 'invalid_timestamp' });
}

function checkCanonicalPath(value, path, errors) {
  if (!checkString(value, path, errors, { max: 1024 })) return;
  if (value.includes('\0')) errors.push({ path, reason: 'path_contains_nul' });
  if (value.includes('\\')) errors.push({ path, reason: 'path_must_use_posix_separators' });
  if (value.startsWith('/') || /^[A-Za-z]:\//.test(value)) errors.push({ path, reason: 'path_must_be_relative' });
  if (value.split('/').includes('..')) errors.push({ path, reason: 'path_traversal' });
}

function checkSha256(value, path, errors, { prefixed = false } = {}) {
  const pattern = prefixed ? /^sha256:[a-f0-9]{64}$/ : /^[a-f0-9]{64}$/;
  checkString(value, path, errors, { min: prefixed ? 71 : 64, max: prefixed ? 71 : 64, pattern });
}

function validateBoundArtifact(value, path, errors, { includeBytes = true } = {}) {
  const required = includeBytes ? ['path', 'sha256', 'bytes'] : ['path', 'sha256'];
  if (!checkObject(value, path, required, [], errors)) return;
  checkCanonicalPath(value.path, `${path}.path`, errors);
  checkSha256(value.sha256, `${path}.sha256`, errors);
  if (includeBytes && (!Number.isInteger(value.bytes) || value.bytes < 0 || value.bytes > MAX_SOURCE_BYTES)) {
    errors.push({ path: `${path}.bytes`, reason: 'invalid_size', max: MAX_SOURCE_BYTES });
  }
}

function validateEvidence(value, path, errors) {
  if (!checkObject(value, path, ['type'], ['path', 'detail', 'command', 'status'], errors)) return;
  checkEnum(value.type, EVIDENCE_TYPES, `${path}.type`, errors);
  if (value.path !== undefined) checkCanonicalPath(value.path, `${path}.path`, errors);
  if (value.detail !== undefined) checkSafeString(value.detail, `${path}.detail`, errors, { max: 2000 });
  if (value.command !== undefined) checkSafeString(value.command, `${path}.command`, errors, { max: 1000 });
  if (value.status !== undefined) checkEnum(value.status, EVIDENCE_STATUSES, `${path}.status`, errors);

  if (value.type === 'command') {
    if (value.command === undefined) errors.push({ path: `${path}.command`, reason: 'missing' });
    if (value.status === undefined) errors.push({ path: `${path}.status`, reason: 'missing' });
    if (value.detail === undefined) errors.push({ path: `${path}.detail`, reason: 'missing' });
  } else if (value.path === undefined && value.detail === undefined) {
    errors.push({ path, reason: 'evidence_requires_path_or_detail' });
  }
  if (value.type === 'research-cache' && typeof value.path === 'string') {
    if (!/^researchs\/[^/]+\/summary\.md$/.test(value.path)) {
      errors.push({ path: `${path}.path`, reason: 'research_must_use_cache_summary' });
    }
  }
}

function validateFinding(value, path, errors) {
  const required = [
    'id', 'lens', 'status', 'severity', 'description', 'evidence', 'impact',
    'recommendation', 'alternatives', 'confidence', 'owner', 'residual_risk'
  ];
  if (!checkObject(value, path, required, [], errors)) return;
  checkString(value.id, `${path}.id`, errors, { max: 100, pattern: /^[A-Za-z0-9][A-Za-z0-9._-]*$/ });
  checkString(value.lens, `${path}.lens`, errors, { max: 100, pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/ });
  checkEnum(value.status, FINDING_STATUSES, `${path}.status`, errors);
  checkEnum(value.severity, SEVERITIES, `${path}.severity`, errors);
  checkSafeString(value.description, `${path}.description`, errors, { max: 4000 });
  checkSafeString(value.impact, `${path}.impact`, errors, { max: 4000 });
  checkSafeString(value.recommendation, `${path}.recommendation`, errors, { max: 4000 });
  checkString(value.owner, `${path}.owner`, errors, { max: 64, pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/ });
  checkSafeString(value.residual_risk, `${path}.residual_risk`, errors, { max: 4000 });
  checkEnum(value.confidence, CONFIDENCE_LEVELS, `${path}.confidence`, errors);

  if (!Array.isArray(value.alternatives)) {
    errors.push({ path: `${path}.alternatives`, reason: 'must_be_array' });
  } else {
    if (value.alternatives.length > 10) errors.push({ path: `${path}.alternatives`, reason: 'too_many_items', max: 10 });
    value.alternatives.slice(0, 10).forEach((item, index) => {
      checkSafeString(item, `${path}.alternatives[${index}]`, errors, { max: 1000 });
    });
  }

  if (!Array.isArray(value.evidence)) {
    errors.push({ path: `${path}.evidence`, reason: 'must_be_array' });
  } else {
    if (value.evidence.length === 0) errors.push({ path: `${path}.evidence`, reason: 'must_not_be_empty' });
    if (value.evidence.length > MAX_EVIDENCE_PER_FINDING) {
      errors.push({ path: `${path}.evidence`, reason: 'too_many_items', max: MAX_EVIDENCE_PER_FINDING });
    }
    value.evidence.slice(0, MAX_EVIDENCE_PER_FINDING).forEach((item, index) => {
      validateEvidence(item, `${path}.evidence[${index}]`, errors);
    });
  }
}

function validateAssuranceAxis(value, path, errors) {
  if (!checkObject(value, path, ['status', 'evidence', 'residual_risk'], [], errors)) return;
  checkEnum(value.status, ASSURANCE_STATUSES, `${path}.status`, errors);
  checkSafeString(value.residual_risk, `${path}.residual_risk`, errors, { max: 4000 });
  if (!Array.isArray(value.evidence)) {
    errors.push({ path: `${path}.evidence`, reason: 'must_be_array' });
    return;
  }
  if (value.evidence.length === 0) errors.push({ path: `${path}.evidence`, reason: 'must_not_be_empty' });
  if (value.evidence.length > MAX_EVIDENCE_PER_FINDING) {
    errors.push({ path: `${path}.evidence`, reason: 'too_many_items', max: MAX_EVIDENCE_PER_FINDING });
  }
  const evidence = value.evidence.slice(0, MAX_EVIDENCE_PER_FINDING);
  evidence.forEach((item, index) => {
    validateEvidence(item, `${path}.evidence[${index}]`, errors);
  });
  if (value.status === 'pass' && evidence.some((item) => item && ['failed', 'not_run', 'unverified'].includes(item.status))) {
    errors.push({ path: `${path}.status`, reason: 'pass_axis_has_non_passing_evidence' });
  }
}

function validateAssurance(value, path, errors) {
  if (!checkObject(value, path, ASSURANCE_AXES, [], errors)) return;
  for (const axis of ASSURANCE_AXES) validateAssuranceAxis(value[axis], `${path}.${axis}`, errors);
}

function validateReviewPacket(packet) {
  const errors = [];
  scanForbiddenKeys(packet, errors);
  const required = [
    'schema_version', 'packet_id', 'feature_slug', 'agent', 'profile', 'review_mode',
    'artifact', 'authorities', 'reference_path', 'challenge_lenses', 'max_passes', 'prepared_at'
  ];
  if (!checkObject(packet, '$', required, [], errors)) return { ok: false, errors };
  if (packet.schema_version !== PACKET_SCHEMA_VERSION) errors.push({ path: '$.schema_version', reason: 'invalid_version' });
  checkSha256(packet.packet_id, '$.packet_id', errors, { prefixed: true });
  checkString(packet.feature_slug, '$.feature_slug', errors, { max: 100, pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/ });
  checkString(packet.agent, '$.agent', errors, { max: 64, pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/ });
  checkEnum(packet.profile, PROFILES, '$.profile', errors);
  checkEnum(packet.review_mode, REVIEW_MODES, '$.review_mode', errors);
  validateBoundArtifact(packet.artifact, '$.artifact', errors);
  checkCanonicalPath(packet.reference_path, '$.reference_path', errors);
  if (packet.max_passes !== 2) errors.push({ path: '$.max_passes', reason: 'must_equal_2' });
  checkTimestamp(packet.prepared_at, '$.prepared_at', errors);

  if (!Array.isArray(packet.authorities)) {
    errors.push({ path: '$.authorities', reason: 'must_be_array' });
  } else {
    if (packet.authorities.length > 50) errors.push({ path: '$.authorities', reason: 'too_many_items', max: 50 });
    packet.authorities.slice(0, 50).forEach((item, index) => {
      const itemPath = `$.authorities[${index}]`;
      if (!checkObject(item, itemPath, ['kind', 'path', 'sha256', 'bytes'], [], errors)) return;
      checkString(item.kind, `${itemPath}.kind`, errors, { max: 64, pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/ });
      validateBoundArtifact({ path: item.path, sha256: item.sha256, bytes: item.bytes }, itemPath, errors);
    });
  }
  if (!Array.isArray(packet.challenge_lenses)) {
    errors.push({ path: '$.challenge_lenses', reason: 'must_be_array' });
  } else {
    if (packet.challenge_lenses.length === 0) errors.push({ path: '$.challenge_lenses', reason: 'must_not_be_empty' });
    if (packet.challenge_lenses.length > 20) errors.push({ path: '$.challenge_lenses', reason: 'too_many_items', max: 20 });
    packet.challenge_lenses.slice(0, 20).forEach((item, index) => {
      checkString(item, `$.challenge_lenses[${index}]`, errors, { max: 100, pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/ });
    });
  }
  return { ok: errors.length === 0, errors };
}

function validateReviewReport(report) {
  const errors = [];
  scanForbiddenKeys(report, errors);
  const required = [
    'schema_version', 'packet_id', 'feature_slug', 'agent', 'profile', 'review_mode',
    'artifact', 'passes_completed', 'review_status', 'summary', 'findings', 'completed_at'
  ];
  if (!checkObject(report, '$', required, ['assurance'], errors)) return { ok: false, errors };
  if (report.schema_version !== REPORT_SCHEMA_VERSION) errors.push({ path: '$.schema_version', reason: 'invalid_version' });
  checkSha256(report.packet_id, '$.packet_id', errors, { prefixed: true });
  checkString(report.feature_slug, '$.feature_slug', errors, { max: 100, pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/ });
  checkString(report.agent, '$.agent', errors, { max: 64, pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/ });
  checkEnum(report.profile, PROFILES, '$.profile', errors);
  checkEnum(report.review_mode, REVIEW_MODES, '$.review_mode', errors);
  validateBoundArtifact(report.artifact, '$.artifact', errors, { includeBytes: false });
  if (!Number.isInteger(report.passes_completed) || report.passes_completed < 1 || report.passes_completed > 2) {
    errors.push({ path: '$.passes_completed', reason: 'out_of_range', min: 1, max: 2 });
  }
  checkEnum(report.review_status, REVIEW_STATUSES, '$.review_status', errors);
  checkSafeString(report.summary, '$.summary', errors, { max: 4000 });
  checkTimestamp(report.completed_at, '$.completed_at', errors);

  if (!Array.isArray(report.findings)) {
    errors.push({ path: '$.findings', reason: 'must_be_array' });
  } else {
    if (report.findings.length > MAX_FINDINGS) errors.push({ path: '$.findings', reason: 'too_many_items', max: MAX_FINDINGS });
    report.findings.slice(0, MAX_FINDINGS).forEach((item, index) => validateFinding(item, `$.findings[${index}]`, errors));
  }

  if (report.profile === 'delivery-assurance') {
    if (report.assurance === undefined) errors.push({ path: '$.assurance', reason: 'missing' });
    else validateAssurance(report.assurance, '$.assurance', errors);
  } else if (report.assurance !== undefined) {
    errors.push({ path: '$.assurance', reason: 'not_allowed_for_profile' });
  }

  const findings = Array.isArray(report.findings) ? report.findings : [];
  const openBlocker = findings.some((item) => item && item.status === 'open' && item.severity === 'blocking');
  const decision = findings.some((item) => item && item.status === 'decision_required' && typeof item.owner === 'string' && item.owner);
  if (report.review_status === 'pass') {
    if (findings.some((item) => item && ['open', 'decision_required'].includes(item.status))) {
      errors.push({ path: '$.review_status', reason: 'pass_has_unresolved_finding' });
    }
    if (findings.some((item) => item && item.severity === 'blocking')) {
      errors.push({ path: '$.review_status', reason: 'pass_has_blocking_finding' });
    }
    if (report.assurance && ASSURANCE_AXES.some((axis) => ['fail', 'unverified'].includes(report.assurance[axis] && report.assurance[axis].status))) {
      errors.push({ path: '$.review_status', reason: 'pass_has_failing_assurance_axis' });
    }
  }
  if (report.review_status === 'blocked' && !openBlocker) {
    errors.push({ path: '$.review_status', reason: 'blocked_requires_open_blocker' });
  }
  if (report.review_status === 'decision_required' && !decision) {
    errors.push({ path: '$.review_status', reason: 'decision_required_requires_owned_finding' });
  }
  return { ok: errors.length === 0, errors };
}

function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (isObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256Canonical(value) {
  return crypto.createHash('sha256').update(stableSerialize(value)).digest('hex');
}

module.exports = {
  PACKET_SCHEMA_VERSION,
  REPORT_SCHEMA_VERSION,
  MAX_SOURCE_BYTES,
  MAX_REPORT_BYTES,
  MAX_FINDINGS,
  MAX_EVIDENCE_PER_FINDING,
  MAX_CANONICAL_FILES,
  PROFILES,
  REVIEW_MODES,
  REVIEW_STATUSES,
  FINDING_STATUSES,
  SEVERITIES,
  CONFIDENCE_LEVELS,
  EVIDENCE_TYPES,
  ASSURANCE_STATUSES,
  ASSURANCE_AXES,
  validateReviewPacket,
  validateReviewReport,
  scanForbiddenKeys,
  stableSerialize,
  sha256Canonical
};
