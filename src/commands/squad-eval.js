'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { runSquadValidate } = require('./squad-validate');
const { evaluateSquad } = require('../squad/eval-engine');
const { validateEvalReport } = require('../squad/eval-contract');
const { isValidSlug } = require('../dossier/schema');

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function writeAtomic(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporary, content, 'utf8');
  await fs.rename(temporary, filePath);
}

function safeTimestamp(iso) {
  return iso.replace(/[:.]/g, '-');
}

function renderMarkdown(report) {
  const lines = [
    '---',
    `slug: ${report.squad}`,
    `created_at: ${report.generated_at}`,
    `verdict: ${report.verdict}`,
    `critical_failures: ${report.critical_failures}`,
    '---',
    `# Squad Eval — ${report.squad}`,
    '',
    `## Verdict: ${report.verdict}`,
    '',
    `- Strict precheck: ${report.precheck.status}`,
    `- Source rubric: ${report.source_rubric.status}`,
    `- Held-out execution: ${report.held_out.status}`,
    `- Genome A/B: ${report.genome_comparison.status}`,
    `- Critical failures: ${report.critical_failures}`,
    '',
    '## Dimension results',
    '',
    '| Dimension | Pass | Warn | Fail | Unverified | Critical failures |',
    '|---|---:|---:|---:|---:|---:|',
    ...Object.entries(report.dimensions).map(([name, counts]) => (
      `| ${name} | ${counts.pass || 0} | ${counts.warn || 0} | ${counts.fail || 0} | ${counts.unverified || 0} | ${counts.critical_failures || 0} |`
    )),
    '',
    '## Reproduce',
    '',
    `\`${report.reproduction.command}\``
  ];
  return `${lines.join('\n')}\n`;
}

async function runSquadEval({ args = [], options = {}, logger = console, t } = {}) {
  const projectDir = path.resolve(process.cwd(), args[0] || '.');
  const slug = options.squad || args[1];
  if (!slug) {
    logger.error(t ? t('squadEval.missing_slug') : 'squad:eval requires --squad=<slug>');
    return { ok: false, error: 'missing_slug' };
  }
  if (!isValidSlug(slug)) {
    logger.error(t ? t('squadEval.invalid_slug', { slug }) : `Invalid squad slug: ${slug}`);
    return { ok: false, error: 'invalid_slug', slug };
  }
  const squadDir = path.join(projectDir, '.aioson', 'squads', slug);
  const manifestPath = path.join(squadDir, 'squad.manifest.json');
  let manifest;
  try {
    manifest = await readJson(manifestPath);
  } catch {
    logger.error(t ? t('squadEval.manifest_missing', { slug }) : `Squad manifest not found: ${slug}`);
    return { ok: false, error: 'manifest_missing', slug };
  }

  const silent = { log() {}, error() {} };
  const precheck = await runSquadValidate({
    args: [projectDir],
    options: { squad: slug, strict: true, skipEval: true, json: true },
    logger: silent
  });
  const report = await evaluateSquad({
    projectDir,
    slug,
    manifest,
    precheck
  });
  const schema = await validateEvalReport(projectDir, report);
  if (!schema.valid) {
    return {
      ok: false,
      error: 'invalid_eval_report',
      schema
    };
  }

  const reportName = `eval-${safeTimestamp(report.generated_at)}.json`;
  const reportPath = path.join(squadDir, 'evals', reportName);
  const latestPath = path.join(squadDir, 'evals', 'latest.json');
  const markdownPath = path.join(squadDir, 'docs', `EVAL-${report.generated_at.slice(0, 10)}.md`);
  const json = `${JSON.stringify(report, null, 2)}\n`;
  await writeAtomic(reportPath, json);
  await writeAtomic(latestPath, json);
  await writeAtomic(markdownPath, renderMarkdown(report));

  const ok = report.verdict === 'PASS' || report.verdict === 'WARN';
  const result = {
    ok,
    exitCode: ok ? 0 : 1,
    slug,
    verdict: report.verdict,
    criticalFailures: report.critical_failures,
    report: path.relative(projectDir, reportPath).replace(/\\/g, '/'),
    latest: path.relative(projectDir, latestPath).replace(/\\/g, '/'),
    markdown: path.relative(projectDir, markdownPath).replace(/\\/g, '/'),
    schema: {
      valid: schema.valid,
      path: path.relative(projectDir, schema.schemaPath).replace(/\\/g, '/')
    },
    dimensions: report.dimensions,
    genomeComparison: report.genome_comparison
  };
  if (!options.json) {
    logger.log(t
      ? t('squadEval.result', { slug, verdict: report.verdict })
      : `Squad eval ${slug}: ${report.verdict}`);
    logger.log(t
      ? t('squadEval.report', { path: result.report })
      : `Report: ${result.report}`);
  }
  return result;
}

module.exports = {
  renderMarkdown,
  runSquadEval
};
