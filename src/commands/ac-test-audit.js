'use strict';

const path = require('node:path');
const { auditAcceptanceCriteriaTests } = require('../lib/ac-test-audit');

async function runAcTestAudit({ args, options = {}, logger }) {
  const targetDir = path.resolve(process.cwd(), args?.[0] || '.');
  const slug = String(options.feature || options.slug || '').trim();

  if (!slug) {
    if (options.json) return { ok: false, error: 'missing_feature' };
    logger.error('--feature=<slug> is required.');
    return { ok: false, error: 'missing_feature' };
  }

  const report = await auditAcceptanceCriteriaTests(targetDir, slug);

  if (options.json) {
    logger.log(JSON.stringify(report, null, 2));
    return report;
  }

  logger.log('');
  logger.log(`AC test audit — ${slug}`);
  logger.log('━'.repeat(45));
  logger.log(`ACs: ${report.summary.covered}/${report.summary.acs_total} covered; tests scanned: ${report.summary.test_files_scanned}`);

  if (report.summary.acs_total === 0) {
    logger.log('No acceptance criteria IDs found in requirements, PRD, or conformance artifacts.');
  } else {
    for (const item of report.items) {
      const mark = item.status === 'covered' ? '✓' : '✗';
      const evidence = item.evidence.length
        ? ` — ${item.evidence.map((e) => e.file).join(', ')}`
        : '';
      logger.log(`  ${mark} ${item.ac}: ${item.status}${evidence}`);
    }
  }

  logger.log('');
  logger.log(report.ok ? 'Result: PASS' : `Result: BLOCKED — missing tests for ${report.missing.join(', ')}`);
  return report;
}

module.exports = { runAcTestAudit };
