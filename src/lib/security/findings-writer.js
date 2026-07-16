'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const SCHEMA_VERSION = '1.0.0';
const MAX_FINDINGS = 500;
const ARTIFACT_DIR = path.join('.aioson', 'context');
const PRESERVED_STATUSES_ON_REDETECT = new Set(['accepted', 'accepted_risk', 'false_positive']);

function hash6(input) {
  return crypto.createHash('sha1').update(String(input)).digest('hex').slice(0, 6);
}

function buildFindingId({ source, control_id, scope }) {
  return `${source}-${control_id}-${hash6(scope || '')}`;
}

function normalizeFinding(input, { generator }) {
  const finding_id = input.finding_id || buildFindingId({
    source: input.source,
    control_id: input.control_id,
    scope: input.scope
  });
  return {
    finding_id,
    source: input.source,
    control_id: input.control_id,
    severity: input.severity,
    status: input.status || 'open',
    scope: input.scope,
    affected_artifacts: Array.isArray(input.affected_artifacts) ? [...input.affected_artifacts] : [],
    preconditions: Array.isArray(input.preconditions) ? [...input.preconditions] : [],
    reproduction_steps: Array.isArray(input.reproduction_steps) ? [...input.reproduction_steps] : [],
    evidence: Array.isArray(input.evidence) ? [...input.evidence] : [],
    impact: input.impact || '',
    suggested_fix: input.suggested_fix || '',
    recommended_owner: input.recommended_owner || 'dev',
    recommended_gate_status: input.recommended_gate_status || gateStatusFromSeverity(input.severity),
    safe_to_reproduce: input.safe_to_reproduce !== false,
    detected_by: generator
  };
}

function gateStatusFromSeverity(severity) {
  if (severity === 'critical' || severity === 'high') return 'block';
  if (severity === 'medium') return 'review';
  return 'note';
}

function findingKey(finding) {
  if (typeof finding.finding_id === 'string' && finding.finding_id) return `finding_id:${finding.finding_id}`;
  if (typeof finding.id === 'string' && finding.id) return `id:${finding.id}`;
  return `legacy:${buildFindingId({
    source: finding.source || 'unknown',
    control_id: finding.control_id || 'finding',
    scope: finding.scope || finding.title || ''
  })}`;
}

function sortFindings(findings) {
  return [...findings].sort((a, b) => findingKey(a).localeCompare(findingKey(b)));
}

function summarize(findings) {
  const summary = { critical: 0, high: 0, medium: 0, low: 0, inconclusive: 0 };
  for (const f of findings) {
    if (f.status !== 'open' && f.status !== 'needs_validation') continue;
    if (f.severity === 'inconclusive') {
      summary.inconclusive += 1;
    } else if (summary[f.severity] !== undefined) {
      summary[f.severity] += 1;
    }
  }
  return summary;
}

function artifactPathFor(targetDir, slug) {
  const safeSlug = slug && slug.length > 0 ? slug : 'project';
  return path.join(targetDir, ARTIFACT_DIR, `security-findings-${safeSlug}.json`);
}

async function readArtifact(artifactPath) {
  try {
    const raw = await fs.readFile(artifactPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.findings)) {
      return null;
    }
    return parsed;
  } catch (err) {
    if (err && err.code === 'ENOENT') return null;
    throw err;
  }
}

function mergeFindings(existing, incoming, { source } = {}) {
  const byId = new Map();
  for (const f of existing) {
    byId.set(findingKey(f), f);
  }
  const seenIncoming = new Set();
  const refreshedSources = new Set([...incoming.map((f) => f.source), source].filter(Boolean));
  for (const f of incoming) {
    const key = findingKey(f);
    seenIncoming.add(key);
    const prior = byId.get(key);
    if (
      prior &&
      PRESERVED_STATUSES_ON_REDETECT.has(prior.status) &&
      (f.status === 'open' || f.status === 'needs_validation')
    ) {
      byId.set(key, { ...f, status: prior.status });
      continue;
    }
    byId.set(key, { ...f });
  }
  for (const f of existing) {
    const key = findingKey(f);
    if (
      !seenIncoming.has(key) &&
      refreshedSources.has(f.source) &&
      (f.status === 'open' || f.status === 'needs_validation')
    ) {
      byId.set(key, { ...f, status: 'fixed' });
    }
  }
  return sortFindings([...byId.values()]);
}

async function writeFindings({
  targetDir,
  slug,
  source,
  generator,
  generatedAt,
  scopeMode,
  findings
}) {
  const artifactPath = artifactPathFor(targetDir, slug);
  const normalized = findings.map((f) => normalizeFinding({ ...f, source: f.source || source }, { generator }));

  const existing = await readArtifact(artifactPath);
  const previous = existing && Array.isArray(existing.findings) ? existing.findings : [];
  const merged = mergeFindings(previous, normalized, { source });

  if (merged.length > MAX_FINDINGS) {
    return {
      ok: false,
      reason: 'contract_violation_too_many_findings',
      count: merged.length,
      max: MAX_FINDINGS,
      artifactPath
    };
  }

  const payload = {
    schema_version: SCHEMA_VERSION,
    slug: slug || 'project',
    generated_at: generatedAt,
    generator,
    review_contract: {
      scope_mode: scopeMode,
      evidence_policy: 'high_critical_require_reproduction',
      findings_artifact_path: path.posix.join('.aioson', 'context', `security-findings-${slug || 'project'}.json`)
    },
    summary: summarize(merged),
    findings: merged
  };

  await fs.mkdir(path.dirname(artifactPath), { recursive: true });
  const json = JSON.stringify(payload, null, 2) + '\n';
  await fs.writeFile(artifactPath, json, 'utf8');

  return { ok: true, artifactPath, payload };
}

module.exports = {
  SCHEMA_VERSION,
  MAX_FINDINGS,
  ARTIFACT_DIR,
  buildFindingId,
  hash6,
  gateStatusFromSeverity,
  findingKey,
  normalizeFinding,
  summarize,
  sortFindings,
  mergeFindings,
  artifactPathFor,
  readArtifact,
  writeFindings
};
