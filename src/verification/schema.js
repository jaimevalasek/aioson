'use strict';

const { resolveInsideRoot } = require('./path-policy');

const LEDGER_SCHEMA_VERSION = 'implementation-ledger/v1';
const REPORT_SCHEMA_VERSION = 'verification-report/v1';

const POLICIES = new Set(['advisory', 'standard', 'strict']);

const CLAIM_STATUSES = new Set([
  'planned',
  'implemented',
  'partial',
  'blocked',
  'not_applicable'
]);

const CLAIM_KINDS = new Set([
  'required_behavior',
  'acceptance_criterion',
  'test_coverage',
  'scope_constraint',
  'security_constraint',
  'prototype_contract',
  'migration_or_data'
]);

const OWNERS = new Set([
  'dev',
  'deyvin',
  'product',
  'sheldon',
  'architect',
  'ux-ui',
  'qa',
  'tester',
  'pentester',
  'scope-check'
]);

const VERDICTS = new Set([
  'PASS',
  'NEEDS_DEV_FIX',
  'NEEDS_SCOPE_DECISION',
  'NEEDS_QA_RECHECK',
  'NEEDS_SECURITY_REVIEW',
  'INCONCLUSIVE'
]);

const FINDING_STATUSES = new Set([
  'CONFIRMS',
  'DOES_NOT_CONFIRM',
  'PARTIAL',
  'NOT_VERIFIED',
  'NOT_APPLICABLE'
]);

const SEVERITIES = new Set([
  'info',
  'warning',
  'blocking'
]);

function normalizePolicy(policy) {
  const value = String(policy || 'standard').toLowerCase();
  return POLICIES.has(value) ? value : null;
}

function validatePathInsideRoot(rootDir, relPath, field, errors) {
  if (!relPath) {
    errors.push({ field, reason: 'missing' });
    return;
  }
  const safe = resolveInsideRoot(rootDir, relPath);
  if (!safe.ok) errors.push({ field, reason: safe.reason });
}

function validateSourceArtifacts(rootDir, artifacts, errors) {
  if (!Array.isArray(artifacts)) {
    errors.push({ field: 'source_artifacts', reason: 'must_be_array' });
    return;
  }
  for (const [index, artifact] of artifacts.entries()) {
    if (!artifact || typeof artifact !== 'object') {
      errors.push({ field: `source_artifacts[${index}]`, reason: 'must_be_object' });
      continue;
    }
    if (!artifact.type) errors.push({ field: `source_artifacts[${index}].type`, reason: 'missing' });
    validatePathInsideRoot(rootDir, artifact.path, `source_artifacts[${index}].path`, errors);
  }
}

function validateClaims(rootDir, claims, errors) {
  if (!Array.isArray(claims)) {
    errors.push({ field: 'claims', reason: 'must_be_array' });
    return;
  }

  for (const [index, claim] of claims.entries()) {
    if (!claim || typeof claim !== 'object') {
      errors.push({ field: `claims[${index}]`, reason: 'must_be_object' });
      continue;
    }
    if (!claim.id) errors.push({ field: `claims[${index}].id`, reason: 'missing' });
    if (!claim.summary) errors.push({ field: `claims[${index}].summary`, reason: 'missing' });
    if (!CLAIM_KINDS.has(claim.kind)) errors.push({ field: `claims[${index}].kind`, reason: 'invalid' });
    if (!OWNERS.has(claim.owner)) errors.push({ field: `claims[${index}].owner`, reason: 'invalid' });
    if (!CLAIM_STATUSES.has(claim.status)) errors.push({ field: `claims[${index}].status`, reason: 'invalid' });
    if (claim.capability_ids !== undefined) {
      if (!Array.isArray(claim.capability_ids)) {
        errors.push({ field: `claims[${index}].capability_ids`, reason: 'must_be_array' });
      } else {
        claim.capability_ids.forEach((capabilityId, capabilityIndex) => {
          if (!/^CAP(?:-[A-Za-z0-9]+)+$/i.test(String(capabilityId || ''))) {
            errors.push({ field: `claims[${index}].capability_ids[${capabilityIndex}]`, reason: 'invalid' });
          }
        });
      }
    }
    if (!Array.isArray(claim.evidence)) {
      errors.push({ field: `claims[${index}].evidence`, reason: 'must_be_array' });
      continue;
    }
    for (const [evidenceIndex, evidence] of claim.evidence.entries()) {
      if (evidence && evidence.path) {
        validatePathInsideRoot(
          rootDir,
          evidence.path,
          `claims[${index}].evidence[${evidenceIndex}].path`,
          errors
        );
      }
    }
  }
}

function validateLedgerVerificationCommands(commands, errors) {
  if (!Array.isArray(commands)) {
    errors.push({ field: 'verification_commands', reason: 'must_be_array' });
    return;
  }
  for (const [index, command] of commands.entries()) {
    if (!command || typeof command !== 'object') {
      errors.push({ field: `verification_commands[${index}]`, reason: 'must_be_object' });
      continue;
    }
    if (!command.command) errors.push({ field: `verification_commands[${index}].command`, reason: 'missing' });
  }
}

function validateImplementationLedger(ledger, { rootDir, slug }) {
  const errors = [];
  if (!ledger || typeof ledger !== 'object') {
    return [{ field: 'machine_ledger', reason: 'must_be_object' }];
  }
  if (ledger.schema_version !== LEDGER_SCHEMA_VERSION) {
    errors.push({ field: 'schema_version', reason: 'invalid' });
  }
  if (ledger.feature_slug !== slug) {
    errors.push({ field: 'feature_slug', reason: 'mismatch' });
  }
  validateSourceArtifacts(rootDir, ledger.source_artifacts, errors);
  validateClaims(rootDir, ledger.claims, errors);
  validateLedgerVerificationCommands(ledger.verification_commands, errors);
  if (!Array.isArray(ledger.known_gaps)) {
    errors.push({ field: 'known_gaps', reason: 'must_be_array' });
  }
  return errors;
}

function missingLedgerEvidence(ledger) {
  const claims = Array.isArray(ledger && ledger.claims) ? ledger.claims : [];
  return claims
    .filter((claim) => claim && ['implemented', 'partial'].includes(claim.status))
    .filter((claim) => !Array.isArray(claim.evidence) || claim.evidence.length === 0)
    .map((claim) => claim.id || '(missing id)');
}

function validateReportCommands(commands, errors) {
  if (!Array.isArray(commands)) {
    errors.push({ field: 'commands_run', reason: 'must_be_array' });
    return;
  }
  for (const [index, command] of commands.entries()) {
    if (!command || typeof command !== 'object') {
      errors.push({ field: `commands_run[${index}]`, reason: 'must_be_object' });
      continue;
    }
    if (!command.command) errors.push({ field: `commands_run[${index}].command`, reason: 'missing' });
  }
}

function validateFindings(findings, errors) {
  if (!Array.isArray(findings)) {
    errors.push({ field: 'findings', reason: 'must_be_array' });
    return;
  }
  for (const [index, finding] of findings.entries()) {
    if (!finding || typeof finding !== 'object') {
      errors.push({ field: `findings[${index}]`, reason: 'must_be_object' });
      continue;
    }
    if (!finding.id) errors.push({ field: `findings[${index}].id`, reason: 'missing' });
    if (!FINDING_STATUSES.has(finding.status)) errors.push({ field: `findings[${index}].status`, reason: 'invalid' });
    if (!SEVERITIES.has(finding.severity)) errors.push({ field: `findings[${index}].severity`, reason: 'invalid' });
    if (!OWNERS.has(finding.owner)) errors.push({ field: `findings[${index}].owner`, reason: 'invalid' });
    if (finding.kind && !CLAIM_KINDS.has(finding.kind)) errors.push({ field: `findings[${index}].kind`, reason: 'invalid' });
    if (finding.recommended_route && !OWNERS.has(finding.recommended_route)) {
      errors.push({ field: `findings[${index}].recommended_route`, reason: 'invalid' });
    }
  }
}

function validateVerificationReport(report, { slug, requestedPolicy }) {
  const errors = [];
  if (!report || typeof report !== 'object') {
    return [{ field: 'machine_report', reason: 'must_be_object' }];
  }
  if (report.schema_version !== REPORT_SCHEMA_VERSION) {
    errors.push({ field: 'schema_version', reason: 'invalid' });
  }
  if (report.feature_slug !== slug) {
    errors.push({ field: 'feature_slug', reason: 'mismatch' });
  }
  if (!normalizePolicy(requestedPolicy || report.policy)) {
    errors.push({ field: 'policy', reason: 'invalid' });
  }
  if (!VERDICTS.has(report.verdict)) {
    errors.push({ field: 'verdict', reason: 'invalid' });
  }
  if (report.recommended_route && !OWNERS.has(report.recommended_route)) {
    errors.push({ field: 'recommended_route', reason: 'invalid' });
  }
  validateReportCommands(report.commands_run, errors);
  validateFindings(report.findings, errors);
  return errors;
}

function machineReportSchemaExample(slug, policy) {
  return {
    schema_version: REPORT_SCHEMA_VERSION,
    feature_slug: slug,
    policy,
    verdict: 'PASS|NEEDS_DEV_FIX|NEEDS_SCOPE_DECISION|NEEDS_QA_RECHECK|NEEDS_SECURITY_REVIEW|INCONCLUSIVE',
    summary: 'Short evidence-grounded summary.',
    commands_run: [
      {
        command: 'npm test',
        status: 'passed|failed|not_run',
        evidence: 'Short result summary'
      }
    ],
    findings: [
      {
        id: 'FIND-001',
        claim_id: 'CLAIM-001',
        kind: 'required_behavior',
        status: 'CONFIRMS|DOES_NOT_CONFIRM|PARTIAL|NOT_VERIFIED|NOT_APPLICABLE',
        severity: 'info|warning|blocking',
        owner: 'dev',
        file: 'src/example.js',
        line: 1,
        evidence: 'Exact reason with file:line when available.',
        recommended_route: 'dev'
      }
    ],
    recommended_route: 'qa',
    blocking_findings_count: 0
  };
}

module.exports = {
  LEDGER_SCHEMA_VERSION,
  REPORT_SCHEMA_VERSION,
  POLICIES,
  CLAIM_STATUSES,
  CLAIM_KINDS,
  OWNERS,
  VERDICTS,
  FINDING_STATUSES,
  SEVERITIES,
  normalizePolicy,
  validateImplementationLedger,
  missingLedgerEvidence,
  validateVerificationReport,
  machineReportSchemaExample
};
