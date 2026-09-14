'use strict';

const { normalizeProviderOutput, normalizeBaseline, classifyFindings, buildQualityResult } = require('./result');
const { getChangedScope } = require('./scope');
const { loadBaseline, collectGovernanceSources, runProvider } = require('./provider');
const { writeMarkdownReport } = require('./report');
const { containedOutput, writeJson } = require('./files');
const fs = require('node:fs/promises');
const path = require('node:path');
const { digest } = require('./eval-suite');

async function readBaseline(root, options, advisory) {
  try { return normalizeBaseline(await loadBaseline(root, options)); } catch (error) {
    advisory.push(`Baseline could not be read: ${error.message}`);
    return { ref: null, findings: [], invalid: true };
  }
}

async function measure(root, options, baseline, governanceSources, advisory) {
  const measured = await runProvider(root, options);
  const provider = { name: 'fallow', version: measured.version || measured.output?.version || null, command: measured.command || 'fallow' };
  const measurement = { status: measured.status, reason: measured.reason || null };
  let findings = [];
  try {
    provider.config_sha256 = await configDigest(root);
    if (baseline.invalid) throw new Error('Baseline is unreadable.');
    await verifyBaseline(root, baseline.metadata, provider);
    if (measured.ok) {
      findings = normalizeProviderOutput(measured.output, { governanceRefs: governanceSources });
      if (measured.exit_code === 1 && findings.length === 0) throw new Error('Provider exited with findings status but returned no findings.');
    } else advisory.push(measured.advisory);
  } catch (error) {
    measurement.status = 'error'; measurement.reason = 'invalid_measurement'; advisory.push(error.message);
  }
  return { provider, measurement, findings };
}

async function verifyBaseline(root, metadata, provider) {
  if (!metadata) return;
  if (metadata.provider_version && metadata.provider_version !== provider.version) throw new Error('Baseline provider version mismatch.');
  if (metadata.config_sha256) {
    const config = JSON.parse(await fs.readFile(path.join(root, '.fallowrc.json'), 'utf8'));
    if (metadata.config_sha256 !== digest(JSON.stringify(config))) throw new Error('Baseline configuration mismatch.');
  }
}

async function configDigest(root) {
  try {
    return digest(JSON.stringify(JSON.parse(await fs.readFile(path.join(root, '.fallowrc.json'), 'utf8'))));
  } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function auditQuality(root, options) {
  const output = options.output || options.report.replace(/\.md$/i, '') + '.json';
  if (!options['no-persist']) {
    const reportPath = await containedOutput(root, options.report);
    const jsonPath = await containedOutput(root, output);
    if (jsonPath.toLowerCase() === reportPath.toLowerCase()) throw new Error('JSON and Markdown quality outputs must have distinct paths.');
  }
  const scope = await getChangedScope(root, options);
  const governanceSources = await collectGovernanceSources(root);
  const advisory = [];
  const baseline = await readBaseline(root, options, advisory);
  const { provider, measurement, findings } = await measure(root, options, baseline, governanceSources, advisory);
  if (scope.paths.length === 0 && !options.all) advisory.push('No changed paths were detected. Use --all for a project-wide audit, or --base=<revision> --head=<revision> in CI.');
  const result = buildQualityResult({
    provider,
    scope: { root: '.', mode: options.all ? 'project' : 'changed-code', changed_paths: scope.paths, base: scope.base, head: scope.head },
    baselineRef: baseline.ref || options.baseline || null,
    findings: classifyFindings(findings, baseline.findings, scope.paths, { all: options.all, renames: scope.renames }),
    advisory,
    measurement
  });
  let reportPath = null;
  let jsonPath = null;
  if (!options['no-persist']) {
    reportPath = await writeMarkdownReport(root, options.report, result, { featureSlug: options.featureSlug, governanceSources });
    jsonPath = await writeJson(root, output, result);
  }
  const error = result.status === 'error' || (options.strict && measurement.status !== 'pass');
  const exitCode = error ? 2 : result.status === 'fail' ? 1 : 0;
  return { ok: exitCode === 0, exitCode, result, report_path: reportPath, json_path: jsonPath };
}

module.exports = { auditQuality };
