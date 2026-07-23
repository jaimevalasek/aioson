'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const { scanArtifacts, detectClassification } = require('../preflight-engine');
const { auditAcceptanceCriteriaTests } = require('../lib/ac-test-audit');
const { analyzeFeatureCompleteness } = require('../lib/feature-completeness');

function roundScore(value) {
  return Math.round(Math.max(0, Math.min(1, value)) * 100) / 100;
}

function artifactScore(artifacts, classification) {
  const required = ['project_context', 'prd'];
  required.push('implementation_plan');

  const present = required.filter((key) => artifacts[key] && artifacts[key].exists);
  return {
    score: required.length === 0 ? 1 : roundScore(present.length / required.length),
    required,
    present
  };
}

function specScore(specAnalyze) {
  const summary = specAnalyze.summary || { errors: 0, warnings: 0, info: 0 };
  if (summary.errors > 0) return 0;
  return roundScore(1 - (summary.warnings * 0.1) - (summary.info * 0.03));
}

function acTestScore(acAudit) {
  const total = acAudit.summary.acs_total;
  if (total === 0) return acAudit.ok ? 1 : 0;
  return roundScore(acAudit.summary.covered / total);
}

function renderMarkdown(report) {
  const lines = [
    `# SDD Benchmark — ${report.feature}`,
    '',
    `- Classification: ${report.classification}`,
    `- Final score: ${report.scores.final}`,
    `- Implementation proxy: ${report.scores.implementation}`,
    `- Test proof: ${report.scores.tests}`,
    '',
    '> Deterministic process-hygiene baseline (PRD + plan consistency + AC→test citation). It does not replace production-path QA.',
    '',
    '## Evidence',
    '',
    `- Required artifacts present: ${report.artifacts.present.length}/${report.artifacts.required.length}`,
    `- PRD/plan completeness: ${report.spec_analyze.summary.errors} error(s)`,
    `- AC test audit: ${report.ac_test_audit.summary.covered}/${report.ac_test_audit.summary.acs_total} covered`,
    ''
  ];

  if (report.ac_test_audit.missing.length > 0) {
    lines.push('## Missing AC Test Evidence', '');
    for (const ac of report.ac_test_audit.missing) lines.push(`- ${ac}`);
    lines.push('');
  }

  lines.push('## Raw Report', '', '```json', JSON.stringify(report, null, 2), '```', '');
  return lines.join('\n');
}

async function runSddBenchmark({ args, options = {}, logger }) {
  const targetDir = path.resolve(process.cwd(), args?.[0] || '.');
  const slug = String(options.feature || options.slug || '').trim();

  if (!slug) {
    if (options.json) return { ok: false, error: 'missing_feature' };
    logger.error('--feature=<slug> is required.');
    return { ok: false, error: 'missing_feature' };
  }

  const artifacts = await scanArtifacts(targetDir, slug);
  const classification = await detectClassification(targetDir, slug) || 'unknown';
  const completeness = await analyzeFeatureCompleteness(targetDir, slug, {
    artifacts,
    classification,
    force: Boolean(options.strict)
  });
  const specAnalyze = {
    ok: completeness.ok,
    summary: { errors: completeness.findings.length, warnings: 0, info: 0 },
    findings: completeness.findings,
    feature_completeness: completeness
  };
  const completenessApplies = completeness.applicable;
  const acAudit = await auditAcceptanceCriteriaTests(targetDir, slug, {
    requireCriteria: completenessApplies || Boolean(options.strict),
    requireAssertions: completenessApplies || Boolean(options.strict)
  });

  const artifact = artifactScore(artifacts, classification);
  const implementation = roundScore((artifact.score + specScore(specAnalyze)) / 2);
  const tests = acTestScore(acAudit);
  const final = roundScore((implementation * 0.6) + (tests * 0.4));

  const report = {
    ok: specAnalyze.ok && acAudit.ok,
    feature: slug,
    classification,
    benchmarked_at: new Date().toISOString(),
    strict: Boolean(options.strict),
    scores: { final, implementation, tests, artifacts: artifact.score, spec: specScore(specAnalyze) },
    artifacts: artifact,
    spec_analyze: {
      ok: specAnalyze.ok,
      summary: specAnalyze.summary,
      findings: specAnalyze.findings
    },
    ac_test_audit: acAudit
  };

  try {
    const retroDir = path.join(targetDir, '.aioson', 'context', 'retro');
    await fs.mkdir(retroDir, { recursive: true });
    await fs.writeFile(path.join(retroDir, `sdd-benchmark-${slug}.md`), renderMarkdown(report), 'utf8');
  } catch {
    // stdout/JSON remains canonical when persistence is unavailable.
  }

  if (options.json) {
    logger.log(JSON.stringify(report, null, 2));
    return report;
  }

  logger.log('');
  logger.log(`SDD benchmark — ${slug}`);
  logger.log('━'.repeat(45));
  logger.log(`Final score: ${final}`);
  logger.log(`Implementation proxy: ${implementation}`);
  logger.log(`Test proof: ${tests}`);
  logger.log(`Report: .aioson/context/retro/sdd-benchmark-${slug}.md`);
  logger.log('Note: deterministic process-hygiene baseline (PRD + plan + AC→test citation) — production-path correctness still belongs to QA.');
  logger.log('');
  return report;
}

module.exports = { runSddBenchmark, artifactScore, acTestScore, specScore };
