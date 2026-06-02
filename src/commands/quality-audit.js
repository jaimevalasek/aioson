'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const {
  normalizeProviderOutput,
  normalizeBaseline,
  classifyFindings,
  buildQualityResult
} = require('../lib/quality/result');
const {
  getChangedPaths,
  loadBaseline,
  collectGovernanceSources,
  runProvider
} = require('../lib/quality/provider');
const { writeMarkdownReport } = require('../lib/quality/report');

function parseFrontmatterValue(content, key) {
  const match = content.match(new RegExp(`^${key}:\\s*([^\\r\\n]+)`, 'm'));
  return match ? match[1].trim().replace(/^["']|["']$/g, '') : null;
}

async function detectFeatureSlug(targetDir, options = {}) {
  if (options.feature) return String(options.feature).trim();
  try {
    const raw = await fs.readFile(path.join(targetDir, '.aioson', 'context', 'dev-state.md'), 'utf8');
    return parseFrontmatterValue(raw, 'active_feature') || 'project';
  } catch {
    return 'project';
  }
}

function buildReportPath(featureSlug, options = {}) {
  if (options.report) return String(options.report);
  return `.aioson/context/quality-report-${featureSlug}.md`;
}

async function runQualityAudit({ args, options = {}, logger }) {
  const targetDir = path.resolve(process.cwd(), args[0] || '.');
  const json = Boolean(options.json);
  const featureSlug = await detectFeatureSlug(targetDir, options);
  const changedPaths = await getChangedPaths(targetDir, options);
  const governanceSources = await collectGovernanceSources(targetDir);
  const advisory = [];

  if (changedPaths.length === 0) {
    advisory.push('No changed paths were detected; audit result is advisory.');
  }

  let baseline = { ref: null, findings: [], metadata: null };
  try {
    baseline = normalizeBaseline(await loadBaseline(targetDir, options));
  } catch (err) {
    advisory.push(`Baseline could not be read: ${err.message}`);
  }

  const providerResult = await runProvider(targetDir, options);
  let provider = {
    name: 'fallow',
    version: null,
    command: providerResult.command || 'fallow'
  };
  let findings = [];

  if (providerResult.ok) {
    findings = normalizeProviderOutput(providerResult.output, {
      providerName: 'fallow',
      command: providerResult.command,
      governanceRefs: governanceSources
    });
    provider = {
      name: providerResult.output?.provider?.name || providerResult.output?.tool || 'fallow',
      version: providerResult.output?.provider?.version || providerResult.output?.version || null,
      command: providerResult.command
    };
  } else {
    advisory.push(providerResult.advisory || `Provider uncertainty: ${providerResult.reason}`);
  }

  const classifiedFindings = classifyFindings(findings, baseline.findings, changedPaths);
  const result = buildQualityResult({
    provider,
    scope: {
      root: '.',
      changed_paths: changedPaths
    },
    baselineRef: baseline.ref,
    findings: classifiedFindings,
    advisory
  });

  const reportPath = await writeMarkdownReport(targetDir, buildReportPath(featureSlug, options), result, {
    featureSlug,
    governanceSources
  });

  const payload = {
    ok: true,
    result,
    report_path: reportPath
  };
  if (result.status === 'fail') payload.exitCode = 1;

  if (!json && logger && typeof logger.log === 'function') {
    logger.log(`quality:audit ${result.status} — report: ${reportPath}`);
    if (result.advisory.length > 0) {
      for (const item of result.advisory) logger.log(`  advisory: ${item}`);
    }
  }

  return payload;
}

module.exports = {
  runQualityAudit,
  detectFeatureSlug,
  buildReportPath
};
