'use strict';

/**
 * handoff-contract — machine-verified agent output contracts.
 *
 * Each agent role declares what it must produce before the workflow
 * allows handoff to the next stage. This catches incomplete agent
 * sessions early instead of discovering missing artifacts later.
 */

const path = require('node:path');
const { readFileSafe, fileExists } = require('./preflight-engine');
const { auditAcceptanceCriteriaTests } = require('./lib/ac-test-audit');
const {
  analyzeFeatureCompleteness,
  findingsThroughStage
} = require('./lib/feature-completeness');
const { isCanonicalPlannerState } = require('./workflow-profile');
const { validateCurrentSheldonReview } = require('./lib/sheldon-review');
const { resolveGateCBaseline } = require('./lib/gate-checkpoint');

const { analyzeCoverage, controlId: coverageControlId } = require('./pentester-coverage');
const PENTESTER_RUN_ID_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/;
const PENTESTER_REPORT_MODES = Object.freeze(['full', 'none']);

// Contract definitions per agent stage
const CONTRACTS = {
  setup: {
    artifacts: ['.aioson/context/project.context.md'],
    gates: [],
    contextUpdates: []
  },
  product: {
    artifacts: (targetDir, state) => {
      if (state.mode === 'feature' && state.featureSlug) {
        return [`.aioson/context/prd-${state.featureSlug}.md`];
      }
      return ['.aioson/context/prd.md'];
    },
    gates: [],
    contextUpdates: ['.aioson/context/project-pulse.md']
  },
  sheldon: {
    artifacts: (targetDir, state) => {
      return state.mode === 'feature' && state.featureSlug
        ? [`.aioson/context/prd-${state.featureSlug}.md`]
        : ['.aioson/context/prd.md'];
    },
    gates: [],
    contextUpdates: ['.aioson/context/project-pulse.md']
  },
  planner: {
    artifacts: (targetDir, state) => {
      if (state.mode === 'feature' && state.featureSlug) {
        return [`.aioson/context/implementation-plan-${state.featureSlug}.md`];
      }
      return ['.aioson/context/implementation-plan.md'];
    },
    gates: [],
    contextUpdates: ['.aioson/context/project-pulse.md']
  },
  analyst: {
    artifacts: [],
    gates: [],
    contextUpdates: ['.aioson/context/project-pulse.md']
  },
  'scope-check': {
    artifacts: [],
    gates: [],
    contextUpdates: ['.aioson/context/project-pulse.md']
  },
  architect: {
    artifacts: [],
    gates: [],
    contextUpdates: ['.aioson/context/project-pulse.md']
  },
  'discovery-design-doc': {
    artifacts: [],
    gates: [],
    contextUpdates: ['.aioson/context/project-pulse.md']
  },
  'ux-ui': {
    artifacts: [],
    gates: [],
    contextUpdates: ['.aioson/context/project-pulse.md']
  },
  pm: {
    artifacts: [],
    gates: [],
    contextUpdates: ['.aioson/context/project-pulse.md']
  },
  orchestrator: {
    artifacts: [],
    gates: [],
    contextUpdates: ['.aioson/context/project-pulse.md']
  },
  dev: {
    artifacts: [],
    gates: ['C'],
    contextUpdates: ['.aioson/context/project-pulse.md', '.aioson/context/dev-state.md']
  },
  tester: {
    artifacts: [],
    gates: [],
    contextUpdates: ['.aioson/context/project-pulse.md']
  },
  pentester: {
    artifacts: (targetDir, state) => {
      if (state.mode === 'feature' && state.featureSlug) {
        return [`.aioson/context/security-findings-${state.featureSlug}.json`];
      }
      return [];
    },
    gates: [],
    contextUpdates: ['.aioson/context/project-pulse.md']
  },
  qa: {
    artifacts: [],
    gates: ['D'],
    contextUpdates: ['.aioson/context/project-pulse.md']
  },
  committer: {
    artifacts: [],
    gates: [],
    contextUpdates: []
  }
};

async function validateSecurityForFeature(targetDir, slug, { includeWarnings = false } = {}) {
  const missing = [];
    let findingsPath = path.join(
      targetDir,
      `.aioson/context/security-findings-${slug}.json`
    );
    if (!await fileExists(findingsPath)) findingsPath = path.join(targetDir, `.aioson/context/done/${slug}/security-findings-${slug}.json`);
    // Security review is risk-triggered, not classification-triggered. When a
    // findings artifact exists it remains authoritative and blocking; its mere
    // absence does not create paperwork for an unrelated MEDIUM feature.
    if (await fileExists(findingsPath)) {
      const envelope = await readSecurityFindings(findingsPath);
      if (!envelope || envelope.ok === false) {
        missing.push(
          `security: invalid findings artifact in ${path.relative(targetDir, findingsPath)} (${envelope?.reason || 'invalid_json'})`
        );
      } else {
        const reviewContractMissing = validateReviewContract(envelope.reviewContract);
        if (reviewContractMissing.length > 0) {
          missing.push(
            `security: invalid review_contract in ${path.relative(targetDir, findingsPath)} (missing: ${reviewContractMissing.join(', ')})`
          );
        } else {
          const v2Evidence = await validateV2SecurityEvidence(targetDir, envelope);
          missing.push(...v2Evidence.errors);
          missing.push(...v2Evidence.warnings.map((warning) => `${warning} (recommended)`));
          const blockers = envelope.findings.filter(
            (f) =>
              (f.status === 'open' || f.status === 'needs_validation') &&
              f.recommended_gate_status === 'block' &&
              (f.severity === 'high' || f.severity === 'critical')
          );
          if (blockers.length > 0) {
            missing.push(
              `security: ${blockers.length} unresolved high/critical finding(s) blocking gate: ${blockers.map((f) => getFindingIdentifier(f)).join(', ')}`
            );
          }
        }
      }
    }
  return includeWarnings ? missing : missing.filter(item => !item.includes("(recommended)"));
}

async function readSecurityFindings(findingsPath) {
  try {
    const content = await readFileSafe(findingsPath);
    if (!content) return { ok: false, reason: 'empty_file' };
    const data = JSON.parse(content);
    return {
      ok: true,
      version: data.version,
      reviewContract: data.review_contract && typeof data.review_contract === 'object'
        ? data.review_contract
        : null,
      coverage: data.coverage,
      threatSurfaces: data.threat_surfaces,
      findings: Array.isArray(data.findings) ? data.findings : [],
      reportBundle: data.report_bundle && typeof data.report_bundle === 'object'
        ? data.report_bundle
        : null
    };
  } catch {
    return { ok: false, reason: 'invalid_json' };
  }
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateReviewContract(reviewContract) {
  const missing = [];

  if (!reviewContract || typeof reviewContract !== 'object') {
    return ['review_contract'];
  }

  for (const field of ['scope_mode', 'evidence_policy', 'findings_artifact_path']) {
    if (!isNonEmptyString(reviewContract[field])) {
      missing.push(field);
    }
  }

  if (
    reviewContract.target_mode === 'app_target' &&
    !isNonEmptyString(reviewContract.target_scope)
  ) {
    missing.push('target_scope');
  }

  return missing;
}

function normalizeReportMode(value) {
  if (value === undefined || value === null || String(value).trim() === '') return 'full';
  const mode = String(value).trim().toLowerCase();
  return PENTESTER_REPORT_MODES.includes(mode) ? mode : null;
}

function normalizeArtifactPath(value) {
  return String(value || '').trim().replace(/\\/g, '/').replace(/^\.\//, '');
}

function isSafeWorkspaceRelativePath(value) {
  const normalized = String(value || '').trim().replace(/\\/g, '/');
  if (!normalized || normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)) return false;
  return !normalized.split('/').includes('..');
}

function endpointValidationIssue(value) {
  const raw = String(value || '').trim();
  if (!raw) return 'empty endpoint';
  if (raw.includes('?') || raw.includes('#')) return 'endpoint contains query or fragment';
  try {
    const parsed = new URL(raw);
    if (parsed.username || parsed.password) return 'endpoint contains credentials';
    if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(parsed.hostname)) return 'endpoint is not local';
  } catch {
    if (!raw.startsWith('/')) return 'endpoint is neither a local URL nor an absolute route';
  }
  return null;
}

async function validateV2SecurityEvidence(targetDir, envelope) {
  // Number('2.0.0') is NaN, which read as v1 and skipped this whole gate. Only
  // an absent version or major 1 is legacy; anything else is held to v2.
  const version = String(envelope.version ?? '').trim();
  if (!version || Number.parseInt(version, 10) === 1) return { errors: [], warnings: [] };

  const errors = [];
  const warnings = [];
  const contract = envelope.reviewContract || {};
  const runId = String(contract.run_id || '').trim();
  if (!['framework_target', 'app_target'].includes(contract.target_mode)) {
    errors.push('security: v2 review_contract.target_mode must be framework_target or app_target');
  }
  if (!['focused', 'comprehensive'].includes(contract.review_depth)) {
    errors.push('security: v2 review_contract.review_depth must be focused or comprehensive');
  }
  if (!isNonEmptyString(contract.runtime_mode)) {
    errors.push('security: v2 review_contract.runtime_mode is required');
  }
  if (!['ASVS-L1', 'ASVS-L2', 'ASVS-L3'].includes(contract.assurance_level)) {
    errors.push('security: v2 review_contract.assurance_level must be ASVS-L1, ASVS-L2, or ASVS-L3');
  }
  const reportMode = normalizeReportMode(contract.report_mode);
  if (!reportMode) {
    errors.push('security: v2 review_contract.report_mode must be full or none');
  }
  for (const field of ['target_profiles', 'allowed_targets', 'forbidden_targets', 'standards', 'tools']) {
    if (!Array.isArray(contract[field])) {
      errors.push(`security: v2 review_contract.${field} must be an array`);
    }
  }
  if (!PENTESTER_RUN_ID_PATTERN.test(runId)) {
    errors.push('security: v2 review_contract.run_id must use YYYY-MM-DDTHH-mm-ss-SSSZ');
  }

  const coverage = envelope.coverage;
  const analysis = analyzeCoverage({
    review_contract: contract,
    coverage,
    threat_surfaces: envelope.threatSurfaces,
    findings: envelope.findings
  });
  if (analysis.missingTop10.length) {
    errors.push(`security: v2 app_target is missing OWASP Top 10:2025 rows (${analysis.missingTop10.join(', ')})`);
  }
  for (const issue of analysis.issues) {
    const detail = [issue.index === undefined ? '' : `index=${issue.index}`, issue.control_id, issue.surface, issue.finding_id, issue.field].filter(Boolean).join(' / ');
    errors.push(`security: v2 coverage ${issue.code}${detail ? ` (${detail})` : ''}`);
  }
  const unsafeTargets = [];
  for (const row of analysis.rows) {
    const id = coverageControlId(row);
    for (const target of Array.isArray(row.tested_paths) ? row.tested_paths : []) {
      const candidate = target && typeof target === 'object' ? target.path || target.value : target;
      if (!isSafeWorkspaceRelativePath(candidate)) unsafeTargets.push(`${id}: unsafe path`);
    }
    for (const target of Array.isArray(row.tested_endpoints) ? row.tested_endpoints : []) {
      const candidate = target && typeof target === 'object' ? target.url || target.route || target.path : target;
      const issue = endpointValidationIssue(candidate);
      if (issue) unsafeTargets.push(`${id}: ${issue}`);
    }
  }
  if (unsafeTargets.length > 0) {
    errors.push(`security: unsafe v2 coverage targets (${unsafeTargets.join(', ')})`);
  }

  const unsafeFindingTargets = [];
  for (const finding of envelope.findings) {
    const id = getFindingIdentifier(finding);
    for (const target of Array.isArray(finding.affected_artifacts) ? finding.affected_artifacts : []) {
      if (!isSafeWorkspaceRelativePath(target)) unsafeFindingTargets.push(`${id}: unsafe affected_artifact`);
    }
    for (const target of Array.isArray(finding.affected_endpoints) ? finding.affected_endpoints : []) {
      const candidate = target && typeof target === 'object' ? target.url || target.route || target.path : target;
      const issue = endpointValidationIssue(candidate);
      if (issue) unsafeFindingTargets.push(`${id}: ${issue}`);
    }
  }
  if (unsafeFindingTargets.length > 0) {
    errors.push(`security: unsafe v2 finding targets (${unsafeFindingTargets.join(', ')})`);
  }

  const incompleteRows = analysis.notTested;
  const pushCoverageGap = (count) => {
    const message = `security: Pentester coverage remains incomplete (${count} not_tested row(s))`;
    if (contract.review_depth === 'comprehensive') errors.push(message);
    else warnings.push(message);
  };

  const bundle = envelope.reportBundle;
  if (!bundle) {
    if (reportMode === 'none') {
      warnings.push('security: Pentester ran with report_mode none — findings JSON only, no HTML bundle');
      if (incompleteRows.length > 0) pushCoverageGap(incompleteRows.length);
    } else {
      errors.push('security: v2 report_bundle is required');
    }
    return { errors, warnings };
  }
  if (!PENTESTER_RUN_ID_PATTERN.test(runId)) return { errors, warnings };

  const expectedRoot = `.aioson/pentester/${runId}/relatorios`;
  const expected = {
    root: expectedRoot,
    index: `${expectedRoot}/index.html`,
    vulnerabilities: `${expectedRoot}/vulnerabilidades.html`,
    corrections: `${expectedRoot}/correcoes.html`,
    coverage: `${expectedRoot}/cobertura.html`
  };
  if (String(bundle.run_id || '') !== runId) {
    errors.push('security: report_bundle.run_id must match review_contract.run_id');
  }
  for (const field of ['missing_owasp_top_10', 'missing_required_controls']) {
    if (!Array.isArray(bundle[field])) {
      errors.push(`security: report_bundle.${field} must be an array`);
    }
  }
  if (typeof bundle.coverage_complete !== 'boolean') {
    errors.push('security: report_bundle.coverage_complete must be a boolean');
  }
  for (const [field, expectedPath] of Object.entries(expected)) {
    if (normalizeArtifactPath(bundle[field]) !== expectedPath) {
      errors.push(`security: report_bundle.${field} must equal ${expectedPath}`);
    }
  }

  for (const field of ['index', 'vulnerabilities', 'corrections', 'coverage']) {
    if (normalizeArtifactPath(bundle[field]) !== expected[field]) continue;
    const absolutePath = path.resolve(targetDir, ...expected[field].split('/'));
    const allowedRoot = path.resolve(targetDir, '.aioson', 'pentester', runId, 'relatorios') + path.sep;
    if (!absolutePath.startsWith(allowedRoot)) {
      errors.push(`security: unsafe report path for ${field}`);
      continue;
    }
    const content = await readFileSafe(absolutePath);
    if (!isNonEmptyString(content)) {
      errors.push(`security: missing or empty HTML report ${expected[field]}`);
    }
  }

  if (bundle.coverage_complete === true && incompleteRows.length > 0) {
    errors.push('security: report_bundle.coverage_complete cannot be true while coverage contains not_tested rows');
  } else if (bundle.coverage_complete === true && !analysis.complete) {
    errors.push('security: report_bundle.coverage_complete contradicts computed coverage');
  } else if (bundle.coverage_complete !== true) {
    pushCoverageGap(incompleteRows.length);
  }

  return { errors, warnings };
}

function getFindingIdentifier(finding) {
  if (isNonEmptyString(finding?.id)) return finding.id.trim();
  if (isNonEmptyString(finding?.finding_id)) return finding.finding_id.trim();
  return 'unknown-finding';
}

async function resolveArtifacts(contract, targetDir, state) {
  const raw = typeof contract.artifacts === 'function'
    ? contract.artifacts(targetDir, state)
    : contract.artifacts;
  return raw.map((p) => path.join(targetDir, p));
}

function parseFrontmatterValue(markdown, key) {
  const fmMatch = String(markdown || '').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch) return null;
  for (const line of fmMatch[1].split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const currentKey = line.slice(0, idx).trim();
    if (currentKey !== key) continue;
    return line.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
  }
  return null;
}

async function readProjectClassification(targetDir) {
  // SF-project-26: project-level classification, independent of any feature's
  // PRD frontmatter. Used as the security baseline that an LLM-authored
  // prd-{slug}.md cannot override downwards.
  const contextPath = path.join(targetDir, '.aioson', 'context', 'project.context.md');
  const content = await readFileSafe(contextPath);
  const inferred = parseFrontmatterValue(content, 'classification');
  return isNonEmptyString(inferred) ? inferred.trim().toUpperCase() : null;
}

async function resolveClassification(targetDir, state) {
  const explicit = isNonEmptyString(state?.classification) ? state.classification.trim().toUpperCase() : null;
  if (explicit) return explicit;

  // In feature mode, the feature's own classification controls depth and
  // budgets. It does not remove the PRD, plan, or delivery verdict.
  const slug = state?.featureSlug;
  if (slug) {
    const prdPath = path.join(targetDir, '.aioson', 'context', `prd-${slug}.md`);
    const prdContent = await readFileSafe(prdPath);
    if (prdContent) {
      const featureClass = parseFrontmatterValue(prdContent, 'classification');
      if (isNonEmptyString(featureClass)) return featureClass.trim().toUpperCase();
    }
  }

  return await readProjectClassification(targetDir);
}

async function checkGateApproval(targetDir, gateLetter, slug, classification, projectClassification) {
  // Canonical streamlined workflow: Gate C is the approved implementation
  // plan and Gate D is QA's delivery verdict. Neither requires spec-{slug}.md.
  if (slug && gateLetter === 'C') {
    const planPath = path.join(targetDir, '.aioson', 'context', `implementation-plan-${slug}.md`);
    const planContent = await readFileSafe(planPath);
    if (!planContent) return { ok: false, reason: 'implementation_plan_missing' };
    const status = parseFrontmatterValue(planContent, 'status');
    return String(status || '').toLowerCase() === 'approved'
      ? { ok: true }
      : { ok: false, reason: 'implementation_plan_not_approved' };
  }

  if (slug && gateLetter === 'D') {
    const reportPath = path.join(targetDir, '.aioson', 'context', `qa-report-${slug}.md`);
    const report = await readFileSafe(reportPath);
    if (report) {
      const verdict = parseFrontmatterValue(report, 'verdict')
        || parseFrontmatterValue(report, 'status');
      if (String(verdict || '').toLowerCase() === 'accepted_with_followups') {
        const followups = await require('./lib/delivery-followups').evaluateFollowups(targetDir, slug);
        return { ok: followups.eligible, reason: followups.reason };
      }
      if (String(verdict || '').toLowerCase() === 'pass'
        || /(?:\*\*)?verdict(?:\*\*)?\s*:\s*PASS\b/i.test(report)) {
        return { ok: true };
      }
      return { ok: false, reason: 'qa_verdict_not_pass' };
    }
    // Fall through for legacy features that still store QA sign-off in spec.
  }

  const specPath = slug
    ? path.join(targetDir, '.aioson', 'context', `spec-${slug}.md`)
    : path.join(targetDir, '.aioson', 'context', 'spec.md');
  const content = await readFileSafe(specPath);
  if (!content) {
    if (!slug) return { ok: true, reason: 'project_mode_without_spec' };
    return { ok: false, reason: 'spec_missing' };
  }

  const gateNames = { A: 'requirements', B: 'design', C: 'plan', D: 'execution' };
  const gateName = gateNames[gateLetter];

  // Parse frontmatter when present. Explicit gate fields take precedence over
  // free-text gate lines so `gate_requirements: pending` cannot be overridden
  // accidentally by stale prose elsewhere in the spec.
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (fmMatch) {
    const fm = {};
    for (const line of fmMatch[1].split(/\r?\n/)) {
      const idx = line.indexOf(':');
      if (idx === -1) continue;
      const key = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
      if (key) fm[key] = val;
    }

    // Check explicit gate field
    const gateVal = fm[`gate_${gateName}`] || fm[`gate${gateLetter}`] || fm[`gate_${gateLetter}`];
    if (gateVal) {
      return gateVal.toLowerCase() === 'approved'
        ? { ok: true }
        : { ok: false, reason: `gate_${gateName}_not_approved` };
    }

    // Check phase_gates JSON
    if (fm.phase_gates) {
      try {
        const parsed = JSON.parse(fm.phase_gates.replace(/'/g, '"'));
        if (parsed[gateName]) {
          return parsed[gateName] === 'approved'
            ? { ok: true }
            : { ok: false, reason: `gate_${gateName}_not_approved` };
        }
      } catch {
        // ignore
      }
    }
  }

  // Check content for gate approval lines
  const gateLineRe = new RegExp(`gate\\s+${gateLetter}[^:]*:\\s*approved`, 'i');
  if (gateLineRe.test(content)) {
    return { ok: true };
  }

  // Gate D: also accept QA sign-off section with PASS verdict
  if (gateLetter === 'D') {
    if (content.includes('## QA Sign-off')) {
      const passMatch = content.match(/\*\*Verdict:\*\*\s*(PASS)/i);
      if (passMatch) {
        return { ok: true };
      }
    }
  }

  return { ok: false, reason: fmMatch ? `gate_${gateName}_not_approved` : 'no_frontmatter' };
}

async function validateHandoffContract(targetDir, state, stageName, options = {}) {
  const contract = CONTRACTS[stageName];
  if (!contract) {
    // Unknown stage — allow pass-through
    return { ok: true, stage: stageName, missing: [] };
  }

  const missing = [];
  const classification = await resolveClassification(targetDir, state);
  // SF-project-26: project-level classification is the security baseline.
  // Independent of the feature's PRD frontmatter so it cannot be lowered by
  // an LLM-authored PRD.
  const projectClassification = await readProjectClassification(targetDir);

  let completeness = null;
  if (state.featureSlug) {
    const gateCBaseline = await resolveGateCBaseline(
      targetDir,
      state.featureSlug,
      path.join(targetDir, '.aioson', 'context', `implementation-plan-${state.featureSlug}.md`)
    );
    completeness = await analyzeFeatureCompleteness(targetDir, state.featureSlug, {
      classification,
      force: isCanonicalPlannerState(state) && ['product', 'sheldon', 'planner', 'dev', 'qa'].includes(stageName),
      preImplementation: stageName === 'planner' && gateCBaseline.pre_implementation,
      implementationBaseline: gateCBaseline,
      includeExecution: stageName === 'qa' && !options.structuralOnly,
      includeExecutionStructure: stageName === 'dev'
        || (stageName === 'qa' && options.structuralOnly)
    });
    if (completeness.applicable) {
      let completenessStage = {
        product: isCanonicalPlannerState(state) ? 'specification' : 'product',
        planner: 'plan',
        dev: 'execution',
        tester: 'plan',
        pentester: 'plan',
        qa: 'execution'
      }[stageName] || null;
      if (stageName === 'sheldon') {
        completenessStage = 'specification';
      }
      if (completenessStage) {
        const completenessFindings = findingsThroughStage(completeness, completenessStage);
        missing.push(...completenessFindings.map((item) =>
          `feature completeness [${item.stage}/${item.check}]: ${item.message}`
        ));
      }
    }
    if (stageName === 'planner' && gateCBaseline.blocking) {
      missing.push(`Gate C recovery [${gateCBaseline.cause}]: ${gateCBaseline.recommendation}`);
    }
  }

  // 1. Artifacts
  const artifactPaths = await resolveArtifacts(contract, targetDir, state);
  for (const p of artifactPaths) {
    if (!(await fileExists(p))) {
      missing.push(`missing artifact: ${path.relative(targetDir, p)}`);
    }
  }

  if (stageName === 'sheldon') {
    const prdPath = path.join(
      targetDir,
      '.aioson',
      'context',
      state.featureSlug ? `prd-${state.featureSlug}.md` : 'prd.md'
    );
    const prd = await readFileSafe(prdPath);
    const review = prd ? parseFrontmatterValue(prd, 'sheldon_review') : null;
    if (String(review || '').toLowerCase() !== 'approved') {
      missing.push('PRD sheldon_review must be approved before planning');
    }
    if (state.featureSlug) {
      const currentReview = await validateCurrentSheldonReview(
        targetDir,
        state.featureSlug,
        prdPath
      );
      if (!currentReview.ok) missing.push(`Sheldon review: ${currentReview.message}`);
    }
  }

  if (stageName === 'product' && isCanonicalPlannerState(state)) {
    const prdPath = path.join(
      targetDir,
      '.aioson',
      'context',
      state.featureSlug ? `prd-${state.featureSlug}.md` : 'prd.md'
    );
    const prd = await readFileSafe(prdPath);
    const productScope = prd ? parseFrontmatterValue(prd, 'product_scope') : null;
    const prdReady = prd ? parseFrontmatterValue(prd, 'prd_ready') : null;
    if (String(productScope || '').toLowerCase() !== 'approved'
      || String(prdReady || '').toLowerCase() !== 'approved') {
      missing.push('PRD product_scope and prd_ready must be approved by Product before planning');
    }
  }

  if (stageName === 'planner') {
    const prdPath = path.join(
      targetDir,
      '.aioson',
      'context',
      state.featureSlug ? `prd-${state.featureSlug}.md` : 'prd.md'
    );
    const prd = await readFileSafe(prdPath);
    const productScope = prd ? parseFrontmatterValue(prd, 'product_scope') : null;
    const prdReady = prd ? parseFrontmatterValue(prd, 'prd_ready') : null;
    if (String(productScope || '').toLowerCase() !== 'approved'
      || String(prdReady || '').toLowerCase() !== 'approved') {
      missing.push('PRD product_scope and prd_ready must be approved before development');
    }
    if (state.featureSlug) {
      const currentReview = await validateCurrentSheldonReview(
        targetDir,
        state.featureSlug,
        prdPath
      );
      if (!currentReview.ok) missing.push(`Sheldon review: ${currentReview.message}`);
    }
    const planPath = path.join(
      targetDir,
      '.aioson',
      'context',
      state.featureSlug ? `implementation-plan-${state.featureSlug}.md` : 'implementation-plan.md'
    );
    const plan = await readFileSafe(planPath);
    const status = plan ? parseFrontmatterValue(plan, 'status') : null;
    if (String(status || '').toLowerCase() !== 'approved') {
      missing.push('implementation plan status must be approved before development');
    }
  }

  // 2. Gates
  for (const gateLetter of contract.gates) {
    const gateCheck = await checkGateApproval(
      targetDir,
      gateLetter,
      state.featureSlug,
      classification,
      projectClassification
    );
    if (!gateCheck.ok) {
      missing.push(`gate ${gateLetter} not approved (${gateCheck.reason})`);
    }
  }

  if ((stageName === 'tester' || stageName === 'qa') && state.featureSlug) {
    const acAudit = await auditAcceptanceCriteriaTests(targetDir, state.featureSlug, {
      requireCriteria: Boolean(completeness && completeness.applicable),
      requireAssertions: Boolean(completeness && completeness.applicable),
      acceptQaEvidence: stageName === 'qa'
    });
    if (!acAudit.ok) {
      missing.push(`AC test audit failed: missing tests for ${acAudit.missing.join(', ')}`);
    }
  }

  // 3. Context updates (soft check — just warn if completely missing)
  for (const p of contract.contextUpdates) {
    const abs = path.join(targetDir, p);
    if (!(await fileExists(abs))) {
      missing.push(`missing context file: ${p} (recommended)`);
    }
  }

  if (stageName === 'qa' && state.featureSlug) missing.push(...await validateSecurityForFeature(targetDir, state.featureSlug, { includeWarnings: true }));

  // Only hard-block on artifacts and gates; context updates are warnings unless
  // we are in strict mode. For now, treat everything as blocking to harden handoffs.
  const hardBlockers = missing.filter((m) => !m.includes('(recommended)'));

  return {
    ok: hardBlockers.length === 0,
    stage: stageName,
    missing: hardBlockers,
    warnings: missing.filter((m) => m.includes('(recommended)'))
  };
}

function formatContractError(result) {
  const lines = [
    `[Handoff Contract BLOCKED]`,
    `Stage: @${result.stage}`,
    '',
    'Missing deliverables:',
    ...result.missing.map((m) => `  - ${m}`)
  ];
  if (result.warnings.length > 0) {
    lines.push('', 'Warnings:');
    lines.push(...result.warnings.map((w) => `  - ${w}`));
  }
  lines.push('', 'Complete these items before finishing the stage.');
  return lines.join('\n');
}

// Returns pending blocking revisions for the active feature (or [] for legacy features).
// Safe to call when dossier feature dir does not exist — returns [] silently.
async function getBlockingRevisions(targetDir, featureSlug) {
  if (!featureSlug) return [];
  try {
    const { getBlockingRevisions: getBlockers } = require('./dossier/revision-store');
    const ctxDir = path.join(targetDir, '.aioson', 'context');
    return await getBlockers({ slug: featureSlug, contextDir: ctxDir });
  } catch {
    return [];
  }
}

/**
 * getCanonicalArtifactsForAgent
 *
 * Public lookup helper used by `runAgentDone` (F2 — workflow-handoff-integrity v1.9.5)
 * to determine which artifact paths an agent is expected to produce. Returns the
 * paths declared by the agent's contract in CONTRACTS, fully resolved against
 * the workflow state.
 *
 * @param {string} agent       Agent name (with or without leading `@`).
 * @param {string} targetDir   Project root path (absolute).
 * @param {object} state       Workflow state: { mode, featureSlug, classification }.
 * @returns {string[]|null}    Array of absolute artifact paths, or `null` when the
 *                             agent is not registered in CONTRACTS. An empty array
 *                             means the agent produces no canonical artifact (e.g.
 *                             `@committer`, `@dev`) — auto-emit should be skipped.
 */
async function getCanonicalArtifactsForAgent(agent, targetDir, state) {
  const normalizedAgent = String(agent || '').replace(/^@/, '').toLowerCase();
  if (!normalizedAgent) return null;
  const contract = CONTRACTS[normalizedAgent];
  if (!contract) return null;
  return await resolveArtifacts(contract, targetDir, state || {});
}

module.exports = {
  validateSecurityForFeature,
  parseFrontmatterValue,
  readProjectClassification,
  resolveClassification,
  checkGateApproval,
  validateHandoffContract,
  formatContractError,
  getBlockingRevisions,
  getCanonicalArtifactsForAgent,
  CONTRACTS
};
