'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { containedOutput } = require('./files');

function formatCountMap(map) {
  return Object.entries(map || {})
    .map(([key, value]) => `${key}: ${value}`)
    .join(', ') || 'none';
}

function buildMarkdownReport(result, context = {}) {
  const lines = [
    `# Quality Audit Report — ${context.featureSlug || 'project'}`,
    '',
    `Generated: ${new Date().toISOString()}`,
    `Status: ${result.status}`,
    `Mode: ${result.mode}`,
    `Measurement: ${result.measurement?.status || 'unknown'}`,
    '',
    '## Provider',
    `- Name: ${result.provider.name}`,
    `- Version: ${result.provider.version || 'unknown'}`,
    `- Command: ${result.provider.command}`,
    '',
    '## Scope',
    `- Changed paths considered: ${result.scope.changed_paths.length > 0 ? result.scope.changed_paths.join(', ') : 'none'}`,
    `- Baseline reference: ${result.baseline_ref || 'none'}`,
    '',
    '## Summary',
    `- Total findings: ${result.summary.total}`,
    `- By classification: ${formatCountMap(result.summary.by_classification)}`,
    `- By severity: ${formatCountMap(result.summary.by_severity)}`,
    `- By category: ${formatCountMap(result.summary.by_category)}`,
    '',
    '## Governance Sources Considered'
  ];

  const governanceSources = context.governanceSources || [];
  if (governanceSources.length === 0) {
    lines.push('- none');
  } else {
    for (const source of governanceSources) lines.push(`- ${source}`);
  }

  lines.push('', '## Findings');
  lines.push(...renderFindings(result.findings));

  lines.push('', '## Advisory');
  lines.push(...(result.advisory.length ? result.advisory.map(item => `- ${item}`) : ['- none']));

  lines.push('', '## Limitations');
  lines.push('- Findings are static-analysis candidates; review them before changing code.');
  lines.push('- Baseline findings remain visible but are not accepted as resolved debt.');
  lines.push('- Provider raw JSON is not written to `.aioson/context/` by this command.');

  return lines.join('\n');
}

function renderFindings(findings) {
  if (findings.length === 0) return ['- No provider findings were normalized.'];
  const lines = [];
  for (const finding of findings) {
    const location = finding.path ? `${finding.path}${finding.line ? `:${finding.line}` : ''}` : 'unknown location';
    const refs = finding.governance_refs.length > 0 ? ` refs=${finding.governance_refs.join(', ')}` : '';
    lines.push(`- [${finding.classification}] ${finding.severity} ${finding.category} — ${location} — ${finding.message}${refs}`);
    if (finding.action) lines.push(`  Action: ${finding.action}`);
  }

  return lines;
}

async function writeMarkdownReport(targetDir, reportPath, result, context) {
  const absolute = await containedOutput(targetDir, reportPath);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, buildMarkdownReport(result, context), 'utf8');
  return path.relative(targetDir, absolute).replace(/\\/g, '/');
}

module.exports = {
  buildMarkdownReport,
  writeMarkdownReport
};
