'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { collectSources } = require('../src/lib/retro/retro-sources');
const { aggregate } = require('../src/lib/retro/retro-aggregate');

function writeFile(root, rel, body) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body, 'utf8');
}

function reportMarkdown(slug) {
  const report = {
    schema_version: 'verification-report/v1',
    feature_slug: slug,
    policy: 'strict',
    verdict: 'NEEDS_QA_RECHECK',
    summary: 'One non-confirming report finding.',
    commands_run: [{ command: 'npm test', status: 'passed', evidence: 'passed' }],
    findings: [{
      id: 'FIND-001',
      claim_id: 'CLAIM-001',
      kind: 'required_behavior',
      status: 'NOT_VERIFIED',
      severity: 'warning',
      owner: 'qa',
      file: 'tests/example.test.js',
      line: 12,
      evidence: 'Should not be rendered by retro.',
      recommended_route: 'qa'
    }],
    recommended_route: 'qa',
    blocking_findings_count: 0
  };

  return `# Verification Report - ${slug}

## Machine Report

\`\`\`json
${JSON.stringify(report, null, 2)}
\`\`\`
`;
}

test('verification reports: promoted latest duplicate does not create recurrence', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-retro-verification-dedupe-'));
  const report = reportMarkdown('feat');
  writeFile(root, '.aioson/context/features/feat/verification-report.md', report);
  writeFile(root, '.aioson/context/features/feat/verification-runs/20260624T010203Z-manual-report.md', report);

  const sources = collectSources(root, ['feat']);
  assert.equal(sources.counts.verification_reports, 1);
  assert.equal(sources.findings.length, 1);
  assert.equal(sources.minedPaths.filter((p) => /verification-(?:report|runs\/.*-report)\.md$/.test(p)).length, 1);

  const { candidates, observations } = aggregate(sources);
  assert.equal(candidates.length, 0);
  assert.equal(observations.length, 1);
});

test('verification reports: identical historical runs can still create recurrence', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-retro-verification-recur-'));
  const report = reportMarkdown('feat');
  writeFile(root, '.aioson/context/features/feat/verification-runs/20260624T010203Z-manual-report.md', report);
  writeFile(root, '.aioson/context/features/feat/verification-runs/20260624T020304Z-manual-report.md', report);

  const sources = collectSources(root, ['feat']);
  assert.equal(sources.counts.verification_reports, 2);
  assert.equal(sources.findings.length, 2);

  const { candidates, observations } = aggregate(sources);
  assert.equal(candidates.length, 1);
  assert.equal(observations.length, 0);
  assert.ok(candidates[0].reasons.includes('recurrence'));
});
