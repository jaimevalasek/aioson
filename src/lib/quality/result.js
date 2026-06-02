'use strict';

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
  if (raw === 'medium' || raw === 'warning' || raw === 'warn') return 'medium';
  return FINDING_SEVERITIES.has(raw) ? raw : 'advisory';
}

function normalizeRelPath(value) {
  if (value === null || value === undefined || value === '') return null;
  return String(value).replace(/\\/g, '/').replace(/^\.?\//, '');
}

function getFindingKey(finding) {
  return [
    normalizeRelPath(finding.path) || '',
    finding.line || '',
    normalizeCategory(finding.category),
    String(finding.message || '').trim().toLowerCase()
  ].join('|');
}

function extractNativeFindings(nativeOutput) {
  if (!nativeOutput || typeof nativeOutput !== 'object') return [];
  if (Array.isArray(nativeOutput.findings)) return nativeOutput.findings;
  if (Array.isArray(nativeOutput.issues)) return nativeOutput.issues;
  if (Array.isArray(nativeOutput.results)) return nativeOutput.results;
  if (nativeOutput.result && Array.isArray(nativeOutput.result.findings)) return nativeOutput.result.findings;
  return [];
}

function normalizeFinding(rawFinding, index, options = {}) {
  const pathValue = rawFinding.path || rawFinding.file || rawFinding.filename || rawFinding.location?.path || null;
  const lineValue = rawFinding.line || rawFinding.startLine || rawFinding.location?.line || null;
  const message = rawFinding.message || rawFinding.title || rawFinding.rule || rawFinding.reason || 'Quality finding';
  const category = normalizeCategory(rawFinding.category || rawFinding.kind || rawFinding.type || rawFinding.rule);
  const severity = normalizeSeverity(rawFinding.severity || rawFinding.level);
  const pathName = normalizeRelPath(pathValue);
  const normalized = {
    id: String(rawFinding.id || rawFinding.fingerprint || rawFinding.ruleId || `QF-${index + 1}`),
    source: rawFinding.source || 'provider',
    category,
    severity,
    classification: rawFinding.classification || 'unknown',
    path: pathName,
    line: Number.isInteger(Number(lineValue)) && Number(lineValue) > 0 ? Number(lineValue) : null,
    message: String(message),
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
  const provider = {
    name: String(nativeOutput?.provider?.name || nativeOutput?.tool || options.providerName || 'fallow'),
    version: nativeOutput?.provider?.version || nativeOutput?.version || null,
    command: options.command || nativeOutput?.provider?.command || 'fallow'
  };
  const nativeFindings = extractNativeFindings(nativeOutput);
  return nativeFindings.map((finding, index) => normalizeFinding(finding, index, {
    governanceRefs: options.governanceRefs
  })).map((finding) => ({ ...finding, source: 'provider' }));
}

function normalizeBaseline(rawBaseline) {
  if (!rawBaseline || typeof rawBaseline !== 'object') {
    return { ref: null, findings: [], metadata: null };
  }
  const metadata = rawBaseline.metadata || rawBaseline.baseline || rawBaseline;
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

function classifyFindings(findings, baselineFindings, changedPaths) {
  const changedSet = new Set((changedPaths || []).map(normalizeRelPath).filter(Boolean));
  const baselineKeys = new Set((baselineFindings || []).map(getFindingKey));
  return findings.map((finding) => {
    const key = getFindingKey(finding);
    const isBaseline = baselineKeys.has(key);
    const isInChangedScope = finding.path ? changedSet.has(normalizeRelPath(finding.path)) : false;
    return {
      ...finding,
      classification: isBaseline ? 'baseline' : (isInChangedScope ? 'new' : 'unknown')
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

function buildQualityResult({ provider, scope, baselineRef, findings, advisory }) {
  const summary = buildSummary(findings);
  const hasConfirmedNewRegression = findings.some((finding) =>
    finding.classification === 'new' && ['medium', 'high', 'critical'].includes(finding.severity)
  );
  let status = hasConfirmedNewRegression ? 'fail' : 'pass';
  if (!hasConfirmedNewRegression && (advisory.length > 0 || summary.by_classification.baseline > 0 || summary.by_classification.unknown > 0)) {
    status = 'warn';
  }
  return {
    status,
    mode: DEFAULT_MODE,
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
