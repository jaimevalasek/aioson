'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { auditAcceptanceCriteriaTests } = require('../lib/ac-test-audit');
const { resolveTargetDir } = require('../lib/project-root');

const CLOSED_FINDING_STATUSES = new Set(['fixed', 'false_positive', 'accepted_risk']);

/**
 * --seed: the deterministic seed list for the Tester's hypothesis matrix — AC
 * ids (already enumerated by the audit), Engineering Controls rows from the
 * approved plan, and open security-finding ids. The tester used to cross-read
 * plan and findings artifacts by hand to build the same list; deciding WHICH
 * hypotheses bite stays entirely with the agent.
 */
async function buildMatrixSeeds(targetDir, slug, report) {
  const seeds = report.items.map((item) => ({ id: item.ac, source: 'ac', label: null }));

  try {
    const { analyzeFeatureCompleteness } = require('../lib/feature-completeness');
    const analysis = await analyzeFeatureCompleteness(targetDir, slug, {});
    const rows = (analysis.engineering_controls && analysis.engineering_controls.rows) || [];
    rows.forEach((row, index) => {
      seeds.push({
        id: `EC-${index + 1}`,
        source: 'engineering-control',
        label: [row.concern, row.control].filter(Boolean).join(' — ') || null
      });
    });
  } catch { /* no plan / analysis unavailable — AC seeds still stand */ }

  try {
    const artifactPath = path.join(targetDir, '.aioson', 'context', `security-findings-${slug}.json`);
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    for (const finding of Array.isArray(artifact.findings) ? artifact.findings : []) {
      if (CLOSED_FINDING_STATUSES.has(String(finding?.status || '').toLowerCase())) continue;
      const id = String(finding?.id || finding?.finding_id || '').trim();
      if (id) seeds.push({ id, source: 'security-finding', label: finding.title || null });
    }
  } catch { /* no security artifact for this feature */ }

  return seeds;
}

// --strict additionally requires at least one AC and an assertion signal near
// each test-file AC reference. Executable harness criteria remain strong proof.

async function runAcTestAudit({ args, options = {}, logger }) {
  const targetDir = resolveTargetDir(args);
  const slug = String(options.feature || options.slug || '').trim();

  if (!slug) {
    if (options.json) return { ok: false, error: 'missing_feature' };
    logger.error('--feature=<slug> is required.');
    return { ok: false, error: 'missing_feature' };
  }

  const strict = Boolean(options.strict);
  const report = await auditAcceptanceCriteriaTests(targetDir, slug, {
    requireCriteria: strict,
    requireAssertions: strict,
    acceptQaEvidence: Boolean(options['accept-qa-evidence'] || options.acceptQaEvidence)
  });

  if (options.seed) {
    report.seeds = await buildMatrixSeeds(targetDir, slug, report);
  }

  if (options.json) {
    logger.log(JSON.stringify(report, null, 2));
    return report;
  }

  logger.log('');
  logger.log(`AC test audit — ${slug}`);
  logger.log('━'.repeat(45));
  logger.log(`ACs: ${report.summary.covered}/${report.summary.acs_total} covered; weak: ${report.summary.weak || 0}; tests scanned: ${report.summary.test_files_scanned}`);

  if (report.summary.acs_total === 0) {
    logger.log('No acceptance criteria IDs found in requirements, PRD, or conformance artifacts.');
  } else {
    for (const item of report.items) {
      const mark = item.status === 'covered' ? '✓' : (item.status === 'out_of_scope' ? '–' : '✗');
      const evidence = item.evidence.length
        ? ` — ${item.evidence.map((e) => e.file).join(', ')}`
        : (item.scope ? ` — ${item.scope.cap} is ${item.scope.decision} in the PRD` : '');
      logger.log(`  ${mark} ${item.ac}: ${item.status}${evidence}`);
    }
  }

  if (report.seeds) {
    logger.log('');
    logger.log(`Matrix seeds (${report.seeds.length}):`);
    for (const seed of report.seeds) {
      logger.log(`  [${seed.source}] ${seed.id}${seed.label ? ` — ${seed.label}` : ''}`);
    }
  }

  logger.log('');
  logger.log(report.ok ? 'Result: PASS' : `Result: BLOCKED — missing tests for ${report.missing.join(', ')}`);
  return report;
}

module.exports = { runAcTestAudit };
