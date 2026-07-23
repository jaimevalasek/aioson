'use strict';

/**
 * aioson artifact:validate — validate the complete artifact chain for a feature.
 *
 * Checks the canonical artifact chain (PRD → implementation plan → QA report)
 * and reports trace integrity. Legacy documents are ignored, not required.
 *
 * Usage:
 *   aioson artifact:validate . --feature=checkout
 *   aioson artifact:validate . --feature=checkout --json
 */

const path = require('node:path');
const {
  scanArtifacts,
  detectClassification
} = require('../preflight-engine');
const { analyzeFeatureCompleteness } = require('../lib/feature-completeness');

const BAR = '━'.repeat(45);

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
  const productScope = String(artifacts.prd.frontmatter?.product_scope || '').toLowerCase();
  const prdReadyStatus = String(artifacts.prd.frontmatter?.prd_ready || '').toLowerCase();
  const prdReady = artifacts.prd.exists && productScope === 'approved' && prdReadyStatus === 'approved';

  // Implementation plan status
  const planStatus = artifacts.implementation_plan.exists
    ? (artifacts.implementation_plan.frontmatter.status || 'present')
    : null;

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
      exists: prdReady,
      detail: artifacts.prd.exists
        ? `product_scope: ${productScope || 'missing'}, prd_ready: ${prdReadyStatus || 'missing'}`
        : null,
      required: true,
      indent: 0
    },
    {
      name: `implementation-plan-${slug}.md`,
      exists: artifacts.implementation_plan.exists,
      detail: planStatus ? `status: ${planStatus}` : null,
      required: true,
      indent: 1
    },
    {
      name: `qa-report-${slug}.md`,
      exists: artifacts.qa_report.exists,
      detail: artifacts.qa_report.exists ? `verdict: ${artifacts.qa_report.frontmatter.verdict || artifacts.qa_report.frontmatter.status || 'present'}` : 'created by @qa after implementation',
      required: false,
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
    [`implementation-plan-${slug}.md`]: { agent: '@planner', reason: 'implementation plan not produced yet' }
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
      specification: '@product',
      requirements: '@product',
      design: '@planner',
      plan: '@planner',
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
