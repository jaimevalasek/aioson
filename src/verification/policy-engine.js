'use strict';

const { normalizePolicy } = require('./result');

function ownerRoute(owner) {
  if (owner === 'product' || owner === 'scope-check') return 'product';
  if (owner === 'sheldon') return 'sheldon';
  if (owner === 'qa' || owner === 'tester') return 'qa';
  if (owner === 'pentester') return 'pentester';
  return owner || 'dev';
}

function routeForFinding(finding) {
  const route = finding.recommended_route || ownerRoute(finding.owner);
  if (finding.kind === 'scope_constraint' || route === 'product' || route === 'sheldon') {
    return { verdict: 'NEEDS_SCOPE_DECISION', route: route === 'sheldon' ? 'sheldon' : 'product' };
  }
  if (finding.kind === 'test_coverage' || route === 'qa' || route === 'tester') {
    return { verdict: 'NEEDS_QA_RECHECK', route: route === 'tester' ? 'tester' : 'qa' };
  }
  if (finding.kind === 'security_constraint' || route === 'pentester') {
    return { verdict: 'NEEDS_SECURITY_REVIEW', route: 'pentester' };
  }
  return { verdict: 'NEEDS_DEV_FIX', route: route === 'deyvin' ? 'deyvin' : 'dev' };
}

function isBlockingFinding(finding, policy) {
  if (!finding) return false;
  if (finding.severity === 'blocking' || finding.blocks === true) return true;
  if (policy !== 'strict') return false;
  return ['DOES_NOT_CONFIRM', 'PARTIAL', 'NOT_VERIFIED'].includes(finding.status)
    && [
      'required_behavior',
      'acceptance_criterion',
      'prototype_contract',
      'security_constraint'
    ].includes(finding.kind);
}

function commandIsMissing(command) {
  if (!command || !command.required) return false;
  const status = String(command.status || command.last_status || '').toLowerCase();
  return !status || ['missing', 'not_run', 'failed', 'error', 'unknown'].includes(status);
}

function applyPolicy(report, requestedPolicy) {
  const policy = normalizePolicy(requestedPolicy || report.policy) || 'standard';
  const findings = Array.isArray(report.findings) ? report.findings : [];
  const commands = Array.isArray(report.commands_run) ? report.commands_run : [];

  if (policy === 'strict' && commands.some(commandIsMissing)) {
    return {
      policy,
      verdict: 'INCONCLUSIVE',
      recommended_route: 'qa',
      blocking_findings_count: findings.filter((f) => isBlockingFinding(f, policy)).length,
      reason: 'missing_required_command'
    };
  }

  const blockingFindings = findings.filter((finding) => isBlockingFinding(finding, policy));
  if (blockingFindings.length > 0 && policy !== 'advisory') {
    const routed = routeForFinding(blockingFindings[0]);
    return {
      policy,
      verdict: routed.verdict,
      recommended_route: routed.route,
      blocking_findings_count: blockingFindings.length,
      reason: 'blocking_findings'
    };
  }

  if (report.verdict && report.verdict !== 'PASS') {
    return {
      policy,
      verdict: report.verdict,
      recommended_route: report.recommended_route || 'dev',
      blocking_findings_count: blockingFindings.length,
      reason: 'auditor_verdict'
    };
  }

  return {
    policy,
    verdict: 'PASS',
    recommended_route: report.recommended_route || 'qa',
    blocking_findings_count: blockingFindings.length,
    reason: 'no_blocking_findings'
  };
}

module.exports = {
  applyPolicy,
  routeForFinding
};
