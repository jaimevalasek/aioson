'use strict';

/**
 * aioson artifact:validate — validate the complete artifact chain for a feature.
 *
 * Checks all expected artifacts (prd → sheldon → requirements → spec →
 * architecture → implementation-plan → conformance) and reports chain integrity.
 *
 * Usage:
 *   aioson artifact:validate . --feature=checkout
 *   aioson artifact:validate . --feature=checkout --json
 */

const path = require('node:path');
const {
  scanArtifacts,
  detectClassification,
  parseGatesFromSpec,
  parseFrontmatter,
  contextDir
} = require('../preflight-engine');
const { AC_ID_RE } = require('../lib/ac-test-audit');
const { analyzeFeatureCompleteness } = require('../lib/feature-completeness');

const BAR = '━'.repeat(45);
const REQ_ID_RE = /\bREQ(?:-[A-Za-z0-9]+)+\b/g;

function gateDisplay(gates) {
  const letters = { requirements: 'A', design: 'B', plan: 'C', execution: 'D' };
  return Object.entries(letters).map(([name, letter]) => {
    const status = gates[name];
    return status === 'approved' ? `${letter}✓` : `${letter}○`;
  }).join(' ');
}

function artifactDisplayName(artifact, fallbackName) {
  if (artifact && artifact.exists && artifact.path) return path.basename(artifact.path);
  return fallbackName;
}

async function runArtifactValidate({ args, options = {}, logger }) {
  const targetDir = path.resolve(process.cwd(), args[0] || '.');
  const slug = options.feature ? String(options.feature) : null;

  if (!slug) {
    if (options.json) return { ok: false, reason: 'missing_feature' };
    logger.log('--feature=<slug> is required.');
    return { ok: false };
  }

  const artifacts = await scanArtifacts(targetDir, slug);
  const classification = await detectClassification(targetDir, slug);
  const completeness = await analyzeFeatureCompleteness(targetDir, slug, { artifacts, classification });

  // Gates from spec
  const specGates = artifacts.spec.exists ? parseGatesFromSpec(artifacts.spec.content) : {};

  // Spec details
  const specFm = artifacts.spec.exists ? parseFrontmatter(artifacts.spec.content) : {};
  const specVersion = specFm.version || null;
  const specGateDisplay = artifacts.spec.exists ? gateDisplay(specGates) : null;

  // Sheldon readiness
  const sheldonReady = artifacts.sheldon_enrichment.exists
    ? (artifacts.sheldon_enrichment.frontmatter.readiness === 'ready_for_downstream' ? 'ready_for_downstream' : 'present')
    : null;
  const sheldonValidationReady = artifacts.sheldon_validation.exists
    ? (artifacts.sheldon_validation.frontmatter.verdict || artifacts.sheldon_validation.frontmatter.readiness || 'present')
    : null;

  // Implementation plan status
  const planStatus = artifacts.implementation_plan.exists
    ? (artifacts.implementation_plan.frontmatter.status || 'present')
    : null;

  // Requirement count. Accept both simple IDs (REQ-01) and slugged IDs
  // (REQ-SDLC-01), because feature contracts use slugged identifiers.
  let reqCount = null;
  if (artifacts.requirements.exists && artifacts.requirements.content) {
    const reqs = artifacts.requirements.content.match(REQ_ID_RE) || [];
    const acs = artifacts.requirements.content.match(AC_ID_RE) || [];
    reqCount = `${new Set(reqs).size} REQs, ${new Set(acs).size} ACs`;
  }

  // Conformance required?
  const conformanceRequired = classification === 'MEDIUM';
  const designDocRequired = classification === 'SMALL' || classification === 'MEDIUM';
  const designDocName = artifactDisplayName(artifacts.design_doc, `design-doc-${slug}.md`);
  const readinessName = artifactDisplayName(artifacts.readiness, `readiness-${slug}.md`);

  // Build chain items
  const chain = [
    {
      name: 'project.context.md',
      exists: artifacts.project_context.exists,
      detail: artifacts.project_context.exists ? `${artifacts.project_context.size}B` : null,
      required: true,
      indent: 0
    },
    {
      name: `prd-${slug}.md`,
      exists: artifacts.prd.exists,
      detail: artifacts.prd.exists ? `${artifacts.prd.size}B` : null,
      required: true,
      indent: 0
    },
    {
      name: `sheldon-enrichment-${slug}.md`,
      exists: artifacts.sheldon_enrichment.exists,
      detail: sheldonReady ? `readiness: ${sheldonReady}` : null,
      required: false,
      indent: 1
    },
    {
      name: `sheldon-validation-${slug}.md`,
      exists: artifacts.sheldon_validation.exists,
      detail: sheldonValidationReady ? `verdict: ${sheldonValidationReady}` : 'MEDIUM readiness verdict when @sheldon runs',
      required: false,
      indent: 1
    },
    {
      name: `requirements-${slug}.md`,
      exists: artifacts.requirements.exists,
      detail: reqCount,
      required: true,
      indent: 1
    },
    {
      name: `spec-${slug}.md`,
      exists: artifacts.spec.exists,
      detail: artifacts.spec.exists ? `version: ${specVersion || '?'}, gates: ${specGateDisplay || '?'}` : null,
      required: true,
      indent: 1
    },
    {
      name: 'architecture.md',
      exists: artifacts.architecture.exists,
      detail: null,
      required: true,
      indent: 1
    },
    {
      name: designDocName,
      exists: artifacts.design_doc.exists,
      detail: designDocRequired ? 'pre-dev design governance contract' : `SMALL/MEDIUM only — NOT required for ${classification || 'MICRO'}`,
      required: designDocRequired,
      indent: 1
    },
    {
      name: readinessName,
      exists: artifacts.readiness.exists,
      detail: designDocRequired ? 'pre-dev readiness contract' : `SMALL/MEDIUM only — NOT required for ${classification || 'MICRO'}`,
      required: designDocRequired,
      indent: 1
    },
    {
      name: `implementation-plan-${slug}.md`,
      exists: artifacts.implementation_plan.exists,
      detail: planStatus ? `status: ${planStatus}` : null,
      required: true,
      indent: 1
    },
    {
      name: `conformance-${slug}.yaml`,
      exists: artifacts.conformance.exists,
      detail: !conformanceRequired ? `required for MEDIUM — NOT required for ${classification || 'SMALL'}` : null,
      required: conformanceRequired,
      indent: 1
    }
  ];

  // Validate chain integrity
  const missing = chain.filter((c) => c.required && !c.exists);
  const missingOptional = chain.filter((c) => !c.required && !c.exists);

  const contentFindings = completeness.applicable ? completeness.findings : [];
  const valid = missing.length === 0 && contentFindings.length === 0;

  // Determine next_missing and next_agent (AC-SDLC-22)
  const ARTIFACT_OWNER_MAP = {
    'project.context.md': { agent: '@setup', reason: 'setup not complete' },
    [`prd-${slug}.md`]: { agent: '@product', reason: 'PRD not produced yet' },
    [`requirements-${slug}.md`]: { agent: '@analyst', reason: 'requirements not produced yet (Gate A)' },
    'architecture.md': { agent: '@architect', reason: 'architecture not produced yet (Gate B)' },
    [designDocName]: { agent: '@discovery-design-doc', reason: 'design governance contract not produced yet' },
    [readinessName]: { agent: '@discovery-design-doc', reason: 'readiness contract not produced yet' },
    [`implementation-plan-${slug}.md`]: { agent: '@pm', reason: 'implementation plan not produced yet (Gate C)' },
    [`spec-${slug}.md`]: { agent: '@analyst', reason: 'spec not produced yet — @analyst seeds the feature memory' },
    [`conformance-${slug}.yaml`]: { agent: '@analyst', reason: 'conformance contract missing — @analyst creates it for MEDIUM features' }
  };

  let nextMissing = null;
  let nextAgent = null;
  if (!valid && missing.length > 0) {
    const firstMissing = missing[0];
    nextMissing = firstMissing.name;
    const ownerInfo = ARTIFACT_OWNER_MAP[firstMissing.name];
    if (ownerInfo) nextAgent = `${ownerInfo.agent} (${ownerInfo.reason})`;
  } else if (!valid && contentFindings.length > 0) {
    const firstFinding = contentFindings[0];
    const owners = {
      product: '@product',
      requirements: '@analyst',
      design: '@architect',
      plan: '@pm',
      execution: '@qa'
    };
    nextMissing = `content:${firstFinding.check}`;
    nextAgent = `${owners[firstFinding.stage] || '@orchestrator'} (${firstFinding.message})`;
  }

  const result = {
    ok: valid,
    feature: slug,
    classification: classification || 'unknown',
    chain: chain.map((c) => ({
      name: c.name,
      exists: c.exists,
      required: c.required,
      detail: c.detail
    })),
    missing_required: missing.map((c) => c.name),
    missing_optional: missingOptional.map((c) => c.name),
    content_integrity: {
      applicable: completeness.applicable,
      valid: contentFindings.length === 0,
      findings: contentFindings,
      summary: completeness.summary
    },
    next_missing: nextMissing,
    next_agent: nextAgent,
    integrity: valid ? 'VALID' : 'INVALID'
  };

  if (options.json) return result;

  logger.log('');
  logger.log(`Artifact Chain — ${slug}`);
  logger.log(BAR);

  for (const item of chain) {
    const icon = item.exists ? '✓' : '✗';
    const indent = '  '.repeat(item.indent) + (item.indent > 0 ? '→ ' : '');
    const detail = item.detail ? ` (${item.detail})` : '';
    logger.log(`${indent}${icon} ${item.name}${detail}`);
  }

  logger.log('');
  logger.log(`Chain integrity: ${valid ? 'VALID' : 'INVALID'}`);

  if (missing.length > 0) {
    logger.log(`Missing required: ${missing.map((c) => c.name).join(', ')}`);
  }

  if (missingOptional.length > 0 && !valid) {
    logger.log(`Missing optional: ${missingOptional.map((c) => c.name).join(', ')}`);
  }

  if (contentFindings.length > 0) {
    logger.log(`Content completeness gaps: ${contentFindings.length}`);
    for (const item of contentFindings.slice(0, 10)) {
      logger.log(`  ✗ [${item.stage}/${item.check}] ${item.message}`);
    }
  }

  if (valid && missingOptional.length > 0) {
    logger.log(`Missing optional: ${missingOptional.map((c) => c.name).join(', ')} (${classification || 'SMALL'} — acceptable)`);
  }

  if (!valid && nextAgent) {
    logger.log('');
    logger.log(`Next missing: ${nextMissing}`);
    logger.log(`Next agent: ${nextAgent}`);
  }

  logger.log('');

  return result;
}

module.exports = { runArtifactValidate };
