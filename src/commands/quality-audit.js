'use strict';

const { resolveTargetDir } = require('../lib/project-root');
const { resolveActiveFeature } = require('./feature-current');
const { auditQuality } = require('../lib/quality/audit');

async function detectFeatureSlug(targetDir, options = {}) {
  if (options.feature) {
    if (typeof options.feature !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(options.feature)) throw new Error('Invalid quality feature slug.');
    return options.feature;
  }
  const active = await resolveActiveFeature(targetDir);
  if (active.ambiguous) throw new Error('Ambiguous active feature; use --feature=<slug> or --feature=project.');
  return active.slug || 'project';
}

function buildReportPath(featureSlug, options = {}) {
  return options.report || `.aioson/context/quality-report-${featureSlug}.md`;
}

async function runQualityAudit({ args, options = {}, logger }) {
  const root = resolveTargetDir(args);
  const featureSlug = await detectFeatureSlug(root, options);
  const payload = await auditQuality(root, { ...options, featureSlug, report: buildReportPath(featureSlug, options) });
  if (!options.json && logger) {
    logger.log(`quality:audit ${payload.result.status} — ${payload.report_path || 'not persisted'}`);
    for (const message of payload.result.advisory) logger.log(`  ${message}`);
  }
  return payload;
}

module.exports = { runQualityAudit, detectFeatureSlug, buildReportPath };
