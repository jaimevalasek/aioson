'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const { REPORT_SCHEMA_VERSION } = require('./schema');
const { featureContextDir, verificationRunsDir, relativeFromRoot } = require('./path-policy');
const { timestampForFile } = require('./prompt-package');

function safeSegment(value, fallback = 'default') {
  const segment = String(value || fallback)
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return segment || fallback;
}

function runnerRunStem({ timestamp = timestampForFile(), tool, model }) {
  return `${timestamp}-${safeSegment(tool, 'tool')}-${safeSegment(model || 'configured-default', 'configured-default')}`;
}

async function writeVerificationRunFile(rootDir, slug, stem, suffix, content) {
  const runsDir = verificationRunsDir(rootDir, slug);
  await fs.mkdir(runsDir, { recursive: true });
  const targetPath = path.join(runsDir, `${stem}-${suffix}`);
  await fs.writeFile(targetPath, String(content || ''), 'utf8');
  return {
    path: targetPath,
    relative_path: relativeFromRoot(rootDir, targetPath)
  };
}

async function promoteLatestReport(rootDir, slug, markdown) {
  const targetPath = path.join(featureContextDir(rootDir, slug), 'verification-report.md');
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, String(markdown || ''), 'utf8');
  return {
    path: targetPath,
    relative_path: relativeFromRoot(rootDir, targetPath)
  };
}

function systemInconclusiveReport({ slug, policy, summary, route = 'qa', command, status, evidence }) {
  const report = {
    schema_version: REPORT_SCHEMA_VERSION,
    feature_slug: slug,
    policy,
    verdict: 'INCONCLUSIVE',
    summary,
    commands_run: [
      {
        command: command || 'auditor runner',
        status: status || 'failed',
        evidence: evidence || summary
      }
    ],
    findings: [],
    recommended_route: route,
    blocking_findings_count: 0
  };

  return `# Verification Report - ${slug}

## Verdict
INCONCLUSIVE

## Commands Run
${command || 'auditor runner'} — ${status || 'failed'}.

## Findings
No auditor findings were trusted because the runner did not produce a valid report.

## Before And Now
Not evaluated by a valid auditor report.

## Residual Risk
${summary}

## Recommended Route
${route}

## Machine Report

\`\`\`json
${JSON.stringify(report, null, 2)}
\`\`\`
`;
}

module.exports = {
  safeSegment,
  runnerRunStem,
  writeVerificationRunFile,
  promoteLatestReport,
  systemInconclusiveReport
};
