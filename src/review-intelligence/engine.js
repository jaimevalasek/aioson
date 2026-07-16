'use strict';

const crypto = require('node:crypto');

const {
  PACKET_SCHEMA_VERSION,
  REPORT_SCHEMA_VERSION,
  ASSURANCE_AXES,
  MAX_REPORT_BYTES,
  MAX_SOURCE_BYTES,
  sha256Canonical,
  validateReviewPacket,
  validateReviewReport
} = require('./contracts');
const {
  REVIEW_AGENTS,
  resolveProfilePaths
} = require('./profiles');
const {
  ReviewStorageError,
  atomicWriteImmutable,
  draftRelativePath,
  hashSecureFile,
  listCanonicalJsonFiles,
  packetRelativePath,
  readSecureJson,
  reportRelativePath,
  resolveSecureFile,
  reviewStorageDirectories
} = require('./storage');
const { validateFeatureSlug } = require('../verification/path-policy');

class ReviewEngineError extends Error {
  constructor(reason, details = {}) {
    super(reason);
    this.name = 'ReviewEngineError';
    this.reason = reason;
    this.details = details;
  }
}

function engineError(reason, details) {
  return new ReviewEngineError(reason, details);
}

function validateInputs(featureSlug, agent, { agentRequired = true } = {}) {
  const feature = validateFeatureSlug(featureSlug);
  if (!feature.ok) throw engineError(feature.reason, { feature_slug: featureSlug || null });
  if (!agentRequired) return { feature_slug: feature.feature_slug };
  const normalizedAgent = String(agent || '').trim().toLowerCase();
  if (!normalizedAgent) throw engineError('missing_agent');
  if (!REVIEW_AGENTS.includes(normalizedAgent)) {
    throw engineError('invalid_agent', { agent: normalizedAgent, allowed_agents: REVIEW_AGENTS });
  }
  return { feature_slug: feature.feature_slug, agent: normalizedAgent };
}

function isMissingFile(error) {
  return error instanceof ReviewStorageError && error.reason === 'file_not_found';
}

function canonicalJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function packetIdentity(packet) {
  return {
    schema_version: packet.schema_version,
    feature_slug: packet.feature_slug,
    agent: packet.agent,
    profile: packet.profile,
    review_mode: packet.review_mode,
    artifact: packet.artifact,
    authorities: packet.authorities,
    reference_path: packet.reference_path,
    challenge_lenses: packet.challenge_lenses,
    max_passes: packet.max_passes
  };
}

function packetIdFor(identity) {
  return `sha256:${sha256Canonical(identity)}`;
}

function reportHashFor(report) {
  return sha256Canonical(report);
}

function equalJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function resolveArtifact(rootDir, profile, explicitPath) {
  if (explicitPath) return hashSecureFile(rootDir, explicitPath, { maxBytes: MAX_SOURCE_BYTES });
  const matches = [];
  for (const candidate of profile.default_artifacts) {
    try {
      matches.push(await hashSecureFile(rootDir, candidate, { maxBytes: MAX_SOURCE_BYTES }));
    } catch (error) {
      if (!isMissingFile(error)) throw error;
    }
  }
  if (matches.length === 0) {
    throw engineError('default_artifact_not_found', { candidates: profile.default_artifacts });
  }
  if (matches.length > 1) {
    throw engineError('ambiguous_default_artifact', { candidates: matches.map((item) => item.path) });
  }
  return matches[0];
}

async function collectAuthorities(rootDir, profile, artifactPath) {
  const authorities = [];
  const missing = [];
  const seen = new Set([artifactPath]);
  for (const candidate of profile.authority_candidates) {
    if (seen.has(candidate.path)) continue;
    try {
      const hashed = await hashSecureFile(rootDir, candidate.path, { maxBytes: MAX_SOURCE_BYTES });
      if (seen.has(hashed.path)) continue;
      seen.add(hashed.path);
      authorities.push({
        kind: candidate.kind,
        path: hashed.path,
        sha256: hashed.sha256,
        bytes: hashed.bytes
      });
    } catch (error) {
      if (isMissingFile(error)) {
        missing.push({ kind: candidate.kind, path: candidate.path });
        continue;
      }
      throw error;
    }
  }
  return { authorities, missing };
}

function buildReportTemplate(packet) {
  const evidence = [{
    type: 'artifact',
    path: packet.artifact.path,
    detail: 'Primary artifact prepared for bounded review.'
  }];
  const template = {
    schema_version: REPORT_SCHEMA_VERSION,
    packet_id: packet.packet_id,
    feature_slug: packet.feature_slug,
    agent: packet.agent,
    profile: packet.profile,
    review_mode: packet.review_mode,
    artifact: { path: packet.artifact.path, sha256: packet.artifact.sha256 },
    passes_completed: 2,
    review_status: 'unverified',
    summary: 'Complete the evidence review before promotion.',
    findings: [{
      id: 'REVIEW-DRAFT-001',
      lens: packet.challenge_lenses[0],
      status: 'open',
      severity: 'warning',
      description: 'The bounded review has not been completed.',
      evidence,
      impact: 'Coverage and residual risk are not yet verified.',
      recommendation: 'Complete both review passes and replace this draft finding.',
      alternatives: [],
      confidence: 'low',
      owner: packet.agent,
      residual_risk: 'Unverified until the report is completed.'
    }],
    completed_at: packet.prepared_at
  };
  if (packet.profile === 'delivery-assurance') {
    template.assurance = Object.fromEntries(ASSURANCE_AXES.map((axis) => [axis, {
      status: 'unverified',
      evidence,
      residual_risk: `${axis} remains unverified.`
    }]));
  }
  return template;
}

function assertPacketContract(packet, expectedPath) {
  const validation = validateReviewPacket(packet);
  if (!validation.ok) throw engineError('invalid_packet', { errors: validation.errors });
  if (packetIdFor(packetIdentity(packet)) !== packet.packet_id) throw engineError('packet_id_mismatch');
  const canonicalPath = packetRelativePath(packet.feature_slug, packet.agent, packet.packet_id);
  if (expectedPath && canonicalPath !== expectedPath) throw engineError('packet_path_mismatch');
  const profile = resolveProfilePaths(packet.agent, packet.feature_slug);
  if (!profile || packet.profile !== profile.profile || packet.review_mode !== profile.review_mode) {
    throw engineError('packet_profile_mismatch');
  }
  if (packet.reference_path !== profile.reference_path || !equalJson(packet.challenge_lenses, profile.challenge_lenses)) {
    throw engineError('packet_profile_stale');
  }
  return profile;
}

async function packetFreshness(rootDir, packet) {
  try {
    const profile = assertPacketContract(packet);
    const artifact = await hashSecureFile(rootDir, packet.artifact.path, { maxBytes: MAX_SOURCE_BYTES });
    if (artifact.sha256 !== packet.artifact.sha256 || artifact.bytes !== packet.artifact.bytes) {
      return { ok: false, reason: 'artifact_stale', path: packet.artifact.path };
    }
    const current = await collectAuthorities(rootDir, profile, packet.artifact.path);
    if (!equalJson(current.authorities, packet.authorities)) {
      return { ok: false, reason: 'authorities_stale' };
    }
    return { ok: true };
  } catch (error) {
    if (error instanceof ReviewStorageError && ['file_not_found', 'file_too_large'].includes(error.reason)) {
      return { ok: false, reason: error.reason, ...(error.details || {}) };
    }
    if (error instanceof ReviewEngineError) return { ok: false, reason: error.reason, ...(error.details || {}) };
    throw error;
  }
}

async function loadPacket(rootDir, featureSlug, agent, packetId) {
  const packetPath = packetRelativePath(featureSlug, agent, packetId);
  const loaded = await readSecureJson(rootDir, packetPath, { maxBytes: MAX_REPORT_BYTES });
  assertPacketContract(loaded.value, packetPath);
  return { packet: loaded.value, path: packetPath };
}

async function prepareReview({ rootDir, featureSlug, agent, artifactPath, now = () => new Date().toISOString() }) {
  const input = validateInputs(featureSlug, agent);
  const profile = resolveProfilePaths(input.agent, input.feature_slug);
  const artifact = await resolveArtifact(rootDir, profile, artifactPath);
  const sources = await collectAuthorities(rootDir, profile, artifact.path);
  const identity = {
    schema_version: PACKET_SCHEMA_VERSION,
    feature_slug: input.feature_slug,
    agent: input.agent,
    profile: profile.profile,
    review_mode: profile.review_mode,
    artifact: { path: artifact.path, sha256: artifact.sha256, bytes: artifact.bytes },
    authorities: sources.authorities,
    reference_path: profile.reference_path,
    challenge_lenses: profile.challenge_lenses,
    max_passes: 2
  };
  const packetId = packetIdFor(identity);
  const packetPath = packetRelativePath(input.feature_slug, input.agent, packetId);
  let packet;
  let created = false;

  try {
    const existing = await readSecureJson(rootDir, packetPath, { maxBytes: MAX_REPORT_BYTES });
    packet = existing.value;
    assertPacketContract(packet, packetPath);
    if (!equalJson(packetIdentity(packet), identity)) throw engineError('immutable_packet_conflict');
  } catch (error) {
    if (!isMissingFile(error)) throw error;
    packet = { packet_id: packetId, ...identity, prepared_at: now() };
    const validation = validateReviewPacket(packet);
    if (!validation.ok) throw engineError('generated_packet_invalid', { errors: validation.errors });
    try {
      const write = await atomicWriteImmutable(rootDir, packetPath, canonicalJson(packet), { maxBytes: MAX_REPORT_BYTES });
      created = write.created;
    } catch (writeError) {
      if (!(writeError instanceof ReviewStorageError) || writeError.reason !== 'immutable_conflict') throw writeError;
      const concurrent = await readSecureJson(rootDir, packetPath, { maxBytes: MAX_REPORT_BYTES });
      packet = concurrent.value;
      assertPacketContract(packet, packetPath);
      if (!equalJson(packetIdentity(packet), identity)) throw engineError('immutable_packet_conflict');
    }
  }

  const draftPath = draftRelativePath(input.feature_slug, input.agent, packet.packet_id);
  return {
    ok: true,
    operation: 'prepare',
    exitCode: 0,
    created,
    packet_path: packetPath,
    draft_path: draftPath,
    packet,
    missing_authorities: sources.missing,
    report_template: buildReportTemplate(packet),
    next_command: `aioson review:check . --agent=${input.agent} --feature=${input.feature_slug} --report=${draftPath} --json`
  };
}

function assertReportBinding(report, packet, input) {
  const fields = ['feature_slug', 'agent', 'profile', 'review_mode'];
  for (const field of fields) {
    const expected = field === 'feature_slug' ? input.feature_slug : field === 'agent' ? input.agent : packet[field];
    if (report[field] !== expected) throw engineError('report_binding_mismatch', { field });
  }
  if (report.packet_id !== packet.packet_id) throw engineError('report_binding_mismatch', { field: 'packet_id' });
  if (!equalJson(report.artifact, { path: packet.artifact.path, sha256: packet.artifact.sha256 })) {
    throw engineError('report_binding_mismatch', { field: 'artifact' });
  }
  for (const finding of report.findings) {
    if (!packet.challenge_lenses.includes(finding.lens)) {
      throw engineError('report_lens_mismatch', { finding_id: finding.id, lens: finding.lens });
    }
  }
}

async function validateEvidencePaths(rootDir, report) {
  const evidence = [];
  for (const finding of report.findings) evidence.push(...finding.evidence);
  if (report.assurance) {
    for (const axis of ASSURANCE_AXES) evidence.push(...report.assurance[axis].evidence);
  }
  const paths = [...new Set(evidence.map((item) => item.path).filter(Boolean))];
  for (const evidencePath of paths) {
    await resolveSecureFile(rootDir, evidencePath, { maxBytes: Number.MAX_SAFE_INTEGER });
  }
}

async function checkReview({ rootDir, featureSlug, agent, reportPath }) {
  const input = validateInputs(featureSlug, agent);
  if (!reportPath) throw engineError('missing_report');
  const candidate = await readSecureJson(rootDir, reportPath, { maxBytes: MAX_REPORT_BYTES });
  const report = candidate.value;
  const validation = validateReviewReport(report);
  if (!validation.ok) throw engineError('invalid_report', { errors: validation.errors });
  const loaded = await loadPacket(rootDir, input.feature_slug, input.agent, report.packet_id);
  assertReportBinding(report, loaded.packet, input);
  const freshness = await packetFreshness(rootDir, loaded.packet);
  if (!freshness.ok) throw engineError('stale_packet', freshness);
  await validateEvidencePaths(rootDir, report);

  const reportHash = reportHashFor(report);
  const canonicalPath = reportRelativePath(input.feature_slug, input.agent, report.packet_id, reportHash);
  const write = await atomicWriteImmutable(rootDir, canonicalPath, canonicalJson(report), { maxBytes: MAX_REPORT_BYTES });
  const requiresAction = report.review_status !== 'pass';
  return {
    ok: true,
    operation: 'check',
    exitCode: requiresAction ? 1 : 0,
    promoted: true,
    created: write.created,
    requires_action: requiresAction,
    review_status: report.review_status,
    packet_path: loaded.path,
    report_path: canonicalPath,
    report_hash: reportHash,
    report
  };
}

function reportBindingIssue(report, packet) {
  try {
    assertReportBinding(report, packet, { feature_slug: packet.feature_slug, agent: packet.agent });
    return null;
  } catch (error) {
    return { reason: error.reason, ...(error.details || {}) };
  }
}

function storedAt(record) {
  return Number.isFinite(record.stored_at_ms) ? record.stored_at_ms : 0;
}

function newestStoredFirst(left, right) {
  const byStorageTime = storedAt(right) - storedAt(left);
  return byStorageTime || right.path.localeCompare(left.path);
}

async function reviewStatus({ rootDir, featureSlug }) {
  const input = validateInputs(featureSlug, null, { agentRequired: false });
  const directories = reviewStorageDirectories(input.feature_slug);
  const packetPaths = await listCanonicalJsonFiles(rootDir, directories.packets);
  const reportPaths = await listCanonicalJsonFiles(rootDir, directories.reports);
  if (packetPaths.length === 0 && reportPaths.length === 0) {
    return { ok: true, operation: 'status', exitCode: 0, feature_slug: input.feature_slug, overall_status: 'empty', agents: [], assurance: {} };
  }

  const issues = [];
  const packets = [];
  const packetByKey = new Map();
  for (const packetPath of packetPaths) {
    try {
      const loaded = await readSecureJson(rootDir, packetPath, { maxBytes: MAX_REPORT_BYTES });
      const profile = assertPacketContract(loaded.value, packetPath);
      if (loaded.value.feature_slug !== input.feature_slug) throw engineError('packet_feature_mismatch');
      const freshness = await packetFreshness(rootDir, loaded.value);
      const record = { packet: loaded.value, path: packetPath, profile, freshness, stored_at_ms: loaded.modified_at_ms };
      packets.push(record);
      packetByKey.set(`${loaded.value.agent}|${loaded.value.packet_id}`, record);
    } catch (error) {
      issues.push({ path: packetPath, reason: error.reason || 'invalid_packet' });
    }
  }

  const reports = [];
  for (const reportPath of reportPaths) {
    try {
      const loaded = await readSecureJson(rootDir, reportPath, { maxBytes: MAX_REPORT_BYTES });
      const validation = validateReviewReport(loaded.value);
      if (!validation.ok) throw engineError('invalid_report', { errors: validation.errors });
      const expectedPath = reportRelativePath(
        loaded.value.feature_slug,
        loaded.value.agent,
        loaded.value.packet_id,
        reportHashFor(loaded.value)
      );
      if (expectedPath !== reportPath) throw engineError('report_path_mismatch');
      const packetRecord = packetByKey.get(`${loaded.value.agent}|${loaded.value.packet_id}`);
      if (!packetRecord) throw engineError('report_packet_missing');
      const binding = reportBindingIssue(loaded.value, packetRecord.packet);
      if (binding) throw engineError(binding.reason, binding);
      reports.push({ report: loaded.value, path: reportPath, packet: packetRecord, stored_at_ms: loaded.modified_at_ms });
    } catch (error) {
      issues.push({ path: reportPath, reason: error.reason || 'invalid_report' });
    }
  }

  const currentPackets = new Map();
  for (const record of packets) {
    if (!record.freshness.ok) continue;
    const previous = currentPackets.get(record.packet.agent);
    if (!previous || newestStoredFirst(record, previous) < 0) {
      currentPackets.set(record.packet.agent, record);
    }
  }
  for (const agent of new Set(packets.map((record) => record.packet.agent))) {
    if (!currentPackets.has(agent)) issues.push({ agent, reason: 'no_current_packet' });
  }

  const agents = [];
  const assurance = Object.fromEntries(ASSURANCE_AXES.map((axis) => [axis, []]));
  for (const [agent, packetRecord] of [...currentPackets.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const currentReports = reports
      .filter((item) => item.report.agent === agent && item.report.packet_id === packetRecord.packet.packet_id)
      .sort(newestStoredFirst);
    const latest = currentReports[0] || null;
    agents.push({
      agent,
      profile: packetRecord.packet.profile,
      packet_id: packetRecord.packet.packet_id,
      packet_path: packetRecord.path,
      review_status: latest ? latest.report.review_status : 'prepared',
      report_path: latest ? latest.path : null,
      completed_at: latest ? latest.report.completed_at : null,
      ...(latest && latest.report.assurance ? { assurance: latest.report.assurance } : {})
    });
    if (latest && latest.report.assurance) {
      for (const axis of ASSURANCE_AXES) {
        assurance[axis].push({ agent, ...latest.report.assurance[axis] });
      }
    }
  }

  if (issues.length > 0) {
    return {
      ok: false,
      operation: 'status',
      exitCode: 2,
      feature_slug: input.feature_slug,
      overall_status: 'invalid_or_stale',
      agents,
      assurance,
      issues
    };
  }
  const reviewed = agents.filter((item) => item.review_status !== 'prepared');
  const attention = reviewed.some((item) => item.review_status !== 'pass');
  return {
    ok: true,
    operation: 'status',
    exitCode: attention ? 1 : 0,
    feature_slug: input.feature_slug,
    overall_status: reviewed.length === 0 ? 'empty' : attention ? 'attention_required' : 'clear',
    agents,
    assurance,
    historical_stale_packets: packets.filter((record) => !record.freshness.ok).length
  };
}

module.exports = {
  ReviewEngineError,
  prepareReview,
  checkReview,
  reviewStatus,
  buildReportTemplate,
  packetIdentity,
  packetIdFor,
  reportHashFor,
  packetFreshness
};
