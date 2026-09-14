'use strict';

const path = require('node:path');
const { flattenFallow } = require('./fallow');
const DEFAULT_MODE = 'changed-code';
const FINDING_CATEGORIES = new Set([
  'dead-code',
  'duplication',
  'dependency',
  'complexity',
  'architecture',
  'governance',
  'unknown'
]);
const FINDING_SEVERITIES = new Set(['advisory', 'medium', 'high', 'critical']);

function normalizeCategory(value) {
  const raw = String(value || '').toLowerCase();
  if (raw.includes('dead')) return 'dead-code';
  if (raw.includes('duplic')) return 'duplication';
  if (raw.includes('depend')) return 'dependency';
  if (raw.includes('complex')) return 'complexity';
  if (raw.includes('arch')) return 'architecture';
  if (raw.includes('govern')) return 'governance';
  return FINDING_CATEGORIES.has(raw) ? raw : 'unknown';
}

function normalizeSeverity(value) {
  const raw = String(value || '').toLowerCase();
  if (raw === 'error' || raw === 'critical') return 'critical';
  if (raw === 'high') return 'high';
  if (raw === 'medium' || raw === 'moderate' || raw === 'warning' || raw === 'warn') return 'medium';
  return FINDING_SEVERITIES.has(raw) ? raw : 'advisory';
}

function normalizeRelPath(value) {
  if (value === null || value === undefined || value === '') return null;
  const normalized = String(value).replace(/\\/g, '/').replace(/^\.\//, '');
  if (path.posix.isAbsolute(normalized) || path.win32.isAbsolute(normalized)
    || normalized.split('/').includes('..') || [...normalized].some(char => char.charCodeAt(0) < 32)) {
    throw new Error('Quality paths must be project-relative and contained.');
  }
  return normalized;
}

function getFindingKey(finding) {
  return [
    normalizeRelPath(finding.path) || '',
    finding.fingerprint || '',
    finding.rule || '',
    finding.symbol || '',
    normalizeCategory(finding.category),
    String(finding.message || '').trim().toLowerCase()
  ].join('|');
}

function extractNativeFindings(nativeOutput) {
  if (!nativeOutput || typeof nativeOutput !== 'object' || Array.isArray(nativeOutput) || nativeOutput.error) {
    throw new Error('Invalid quality provider envelope.');
  }
  if (nativeOutput.kind) return flattenFallow(nativeOutput);
  if (Array.isArray(nativeOutput.findings)) return nativeOutput.findings;
  if (Array.isArray(nativeOutput.issues)) return nativeOutput.issues;
  if (Array.isArray(nativeOutput.results)) return nativeOutput.results;
  if (nativeOutput.result && Array.isArray(nativeOutput.result.findings)) return nativeOutput.result.findings;
  throw new Error('Unrecognized quality provider schema; no analysis can be inferred.');
}

function findingLocation(rawFinding) {
  const pathValue = [rawFinding.path, rawFinding.file, rawFinding.filename, rawFinding.location?.path].find(Boolean);
  const lineValue = rawFinding.line || rawFinding.startLine || rawFinding.location?.line || null;
  const message = rawFinding.message || rawFinding.title || rawFinding.rule || rawFinding.reason || 'Quality finding';
  const category = normalizeCategory(rawFinding.category || rawFinding.kind || rawFinding.type || rawFinding.rule);
  const severity = normalizeSeverity(rawFinding.severity || rawFinding.level);
  const pathName = normalizeRelPath(pathValue);
  if (!pathName) throw new Error('Quality finding has no project-relative source location.');
  return { category, severity, path: pathName, message: String(message),
    line: Number.isInteger(Number(lineValue)) && Number(lineValue) > 0 ? Number(lineValue) : null };
}

function findingIdentity(rawFinding, index) {
  return {
    id: String(rawFinding.id || rawFinding.fingerprint || rawFinding.ruleId || `QF-${index + 1}`),
    fingerprint: Object.hasOwn(rawFinding, 'fingerprint') ? rawFinding.fingerprint : (
      !rawFinding.ruleId && rawFinding.id && !/^QF-\d+$/.test(rawFinding.id) ? rawFinding.id : null),
    rule: rawFinding.rule || rawFinding.ruleId || null,
    symbol: rawFinding.symbol || null
  };
}

function normalizeFinding(rawFinding, index, options = {}) {
  if (!rawFinding || typeof rawFinding !== 'object' || Array.isArray(rawFinding)) throw new Error('Invalid quality finding.');
  const normalized = {
    ...findingIdentity(rawFinding, index),
    ...findingLocation(rawFinding),
    source: rawFinding.source || 'provider',
    classification: rawFinding.classification || 'unknown',
    metrics: rawFinding.metrics || null,
    action: rawFinding.action || rawFinding.suggestion || null,
    governance_refs: Array.isArray(rawFinding.governance_refs) ? rawFinding.governance_refs : []
  };

  if (options.governanceRefs && normalized.governance_refs.length === 0) {
    normalized.governance_refs = inferGovernanceRefs(normalized, options.governanceRefs);
  }

  return normalized;
}

function inferGovernanceRefs(finding, governanceRefs) {
  const haystack = `${finding.category} ${finding.message}`.toLowerCase();
  return governanceRefs.filter((ref) => {
    const name = String(ref).toLowerCase();
    return (
      (haystack.includes('size') && name.includes('file-size')) ||
      (haystack.includes('component') && name.includes('componentization')) ||
      (haystack.includes('naming') && name.includes('naming')) ||
      (haystack.includes('reuse') && name.includes('code-reuse')) ||
      (haystack.includes('context') && name.includes('context-boundary')) ||
      (haystack.includes('agent') && name.includes('agent-structural-contract'))
    );
  });
}

function normalizeProviderOutput(nativeOutput, options = {}) {
  const nativeFindings = extractNativeFindings(nativeOutput);
  return nativeFindings.map((finding, index) => normalizeFinding(finding, index, {
    governanceRefs: options.governanceRefs
  })).map((finding) => ({ ...finding, source: 'provider' }));
}

function normalizeBaseline(rawBaseline) {
  if (!rawBaseline || typeof rawBaseline !== 'object') {
    return { ref: null, findings: [], metadata: null };
  }
  const metadata = { ...(rawBaseline.metadata || rawBaseline.baseline || rawBaseline) };
  metadata.provider_version ||= rawBaseline.provider?.version;
  metadata.config_sha256 ||= rawBaseline.provider?.config_sha256;
  const findings = extractNativeFindings(rawBaseline).map((finding, index) => ({
    ...normalizeFinding(finding, index),
    classification: 'baseline'
  }));
  return {
    ref: metadata.baseline_id || metadata.id || metadata.path || null,
    findings,
    metadata
  };
}

function classifyFindings(findings, baselineFindings, changedPaths, options = {}) {
  const changedSet = new Set((changedPaths || []).map(normalizeRelPath).filter(Boolean));
  const baselineKeys = new Map();
  for (const finding of baselineFindings || []) {
    const key = getFindingKey({ ...finding, path: options.renames?.[finding.path] || finding.path });
    const entries = baselineKeys.get(key) || [];
    entries.push(finding);
    baselineKeys.set(key, entries);
  }
  return findings.map((finding) => {
    const key = getFindingKey(finding);
    const previous = baselineKeys.get(key)?.shift();
    const isBaseline = Boolean(previous);
    const severityOrder = ['advisory', 'medium', 'high', 'critical'];
    const worsened = previous && (severityOrder.indexOf(finding.severity) > severityOrder.indexOf(previous.severity) || Object.entries(finding.metrics || {}).some(([metric, value]) =>
      Number.isFinite(value) && Number.isFinite(previous.metrics?.[metric]) && value > previous.metrics[metric]
    ));
    const isInChangedScope = finding.path ? changedSet.has(normalizeRelPath(finding.path)) : false;
    return {
      ...finding,
      classification: isBaseline && !worsened ? 'baseline' : (isInChangedScope || options.all ? 'new' : 'unknown')
    };
  });
}

function buildSummary(findings) {
  const summary = {
    total: findings.length,
    by_classification: { baseline: 0, new: 0, unknown: 0 },
    by_severity: { advisory: 0, medium: 0, high: 0, critical: 0 },
    by_category: {}
  };
  for (const finding of findings) {
    summary.by_classification[finding.classification] = (summary.by_classification[finding.classification] || 0) + 1;
    summary.by_severity[finding.severity] = (summary.by_severity[finding.severity] || 0) + 1;
    summary.by_category[finding.category] = (summary.by_category[finding.category] || 0) + 1;
  }
  return summary;
}

function buildQualityResult({ provider, scope, baselineRef, findings, advisory = [], measurement = { status: 'pass' } }) {
  const summary = buildSummary(findings);
  const hasConfirmedNewRegression = findings.some((finding) =>
    finding.classification === 'new' && ['medium', 'high', 'critical'].includes(finding.severity)
  );
  let status = hasConfirmedNewRegression ? 'fail' : 'pass';
  if (!hasConfirmedNewRegression && (advisory.length > 0 || summary.by_classification.baseline > 0 || summary.by_classification.unknown > 0)) {
    status = 'warn';
  }
  if (measurement.status === 'error') status = 'error';
  else if (measurement.status === 'not_run') status = 'warn';
  return {
    schema_version: 1,
    status,
    mode: scope.mode || DEFAULT_MODE,
    measurement,
    provider,
    scope,
    baseline_ref: baselineRef,
    findings,
    summary,
    advisory
  };
}

module.exports = {
  DEFAULT_MODE,
  normalizeProviderOutput,
  normalizeBaseline,
  classifyFindings,
  buildQualityResult,
  getFindingKey,
  normalizeRelPath
};
