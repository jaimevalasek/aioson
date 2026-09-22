'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { runVerifyArtifact, collectVisualSources } = require('./verify-artifact');
const { loadJevConfig } = require('../lib/jev-config');
const { runJevJudgment } = require('../lib/jev-judgment');
const {
  MAX_CRITERIA_CHARS,
  PROFILES,
  analyzeSourcePatterns,
  buildReviewSpec,
  compactVisualEvidence,
  normalizeProfile,
  redactText
} = require('../lib/jev-review');
const { resolveOperandPath, resolveTargetDir } = require('../lib/project-root');

const INTERFACE_EXTENSIONS = new Set(['.html', '.htm', '.css', '.scss', '.sass', '.less', '.jsx', '.tsx', '.vue', '.svelte', '.astro']);
const IGNORE_DIRS = new Set(['.git', '.aioson', 'node_modules', 'dist', 'build', 'coverage', 'vendor']);

function containsInterfaceFiles(root, limit = 1500) {
  const stack = [root];
  let visited = 0;
  while (stack.length > 0 && visited < limit) {
    const current = stack.pop();
    let entries;
    try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      visited += 1;
      if (entry.isDirectory() && !IGNORE_DIRS.has(entry.name)) stack.push(path.join(current, entry.name));
      if (entry.isFile() && INTERFACE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) return true;
      if (visited >= limit) break;
    }
  }
  return false;
}

function detectInterfaceTarget(targetDir) {
  for (const [name, dir] of [['index.html', '.'], ['src/index.html', 'src'], ['public/index.html', 'public']]) {
    // Directory mode reads the linked CSS/JS corpus beside the entry instead
    // of measuring the HTML shell alone.
    if (fs.existsSync(path.join(targetDir, name))) return { file: null, dir, detected: true };
  }
  for (const name of ['src', 'app', 'pages', 'public']) {
    const candidate = path.join(targetDir, name);
    if (fs.existsSync(candidate) && containsInterfaceFiles(candidate)) return { file: null, dir: name, detected: true };
  }
  return null;
}

async function readCriteria(targetDir, operand) {
  if (!operand) return { text: '', file: null };
  const file = resolveOperandPath(targetDir, String(operand));
  const text = await fsp.readFile(file, 'utf8');
  return {
    text: redactText(text, MAX_CRITERIA_CHARS),
    file: path.relative(targetDir, file).split(path.sep).join('/')
  };
}

async function writeOutput(targetDir, operand, value) {
  if (!operand) return null;
  const file = resolveOperandPath(targetDir, String(operand));
  await fsp.mkdir(path.dirname(file), { recursive: true });
  value.out = path.relative(targetDir, file).split(path.sep).join('/');
  await fsp.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return path.relative(targetDir, file).split(path.sep).join('/');
}

function numberOption(value, fallback, min, max) {
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

function visualOptions(options, locator) {
  return {
    kind: 'visual',
    file: locator.file || undefined,
    dir: locator.dir || undefined,
    slug: locator.slug || undefined,
    url: locator.url || undefined,
    runtime: Boolean(options.runtime || locator.url),
    route: options.route,
    routes: options.routes,
    conformance: options.conformance,
    'surface-mode': options['surface-mode'],
    screenshots: options.screenshots,
    'screenshot-dir': options['screenshot-dir'],
    advisory: true,
    'no-persist': true,
    suppressExitCode: true,
    browserLauncher: options.browserLauncher
  };
}

function resolveLocator(targetDir, options) {
  if (options.file || options.dir || options.slug || options.url) {
    return {
      file: options.file ? String(options.file) : null,
      dir: options.dir ? String(options.dir) : null,
      slug: options.slug ? String(options.slug) : null,
      url: options.url ? String(options.url) : null,
      detected: false
    };
  }
  return detectInterfaceTarget(targetDir);
}

function sourceBundle(targetDir, locator) {
  if (!locator || locator.url && !locator.file && !locator.dir && !locator.slug) return null;
  return collectVisualSources({
    targetDir,
    file: locator.file ? resolveOperandPath(targetDir, locator.file) : null,
    dir: locator.dir ? resolveOperandPath(targetDir, locator.dir) : null,
    slug: locator.slug || null
  });
}

function combineReview({ profile, visualReport, judgment, evidence }) {
  const deterministicPassed = visualReport.verdict === 'pass';
  const semanticPassed = Boolean(judgment.decision?.passed);
  const passed = deterministicPassed && semanticPassed;
  let action = judgment.decision?.action || 'review';
  if (visualReport.verdict === 'fail') action = 'fix_deterministic_findings';
  else if (visualReport.verdict === 'unverified') action = 'collect_runtime_evidence';
  return {
    ok: true,
    status: 'reviewed',
    profile,
    passed,
    action,
    deterministic: {
      passed: deterministicPassed,
      verdict: visualReport.verdict,
      issues: visualReport.issues,
      warnings: visualReport.warnings
    },
    semantic: {
      passed: semanticPassed,
      decision: judgment.decision,
      answers: judgment.answers,
      model: judgment.model,
      provider: judgment.provider,
      usage: judgment.usage,
      request_id: judgment.request_id,
      attempts: judgment.attempts
    },
    evidence
  };
}

function logHuman(logger, result) {
  if (!logger) return;
  if (!result.ok) {
    logger.error(`Jev review failed: ${result.reason || result.status || 'unknown error'}`);
    return;
  }
  if (result.status === 'evidence') {
    logger.log(`Jev review evidence collected (${result.profile}); no API request was sent.`);
    return;
  }
  if (result.status === 'dry_run') {
    logger.log(`Jev review dry-run is valid (${result.profile}); no API request was sent.`);
    return;
  }
  logger.log(`Jev review (${result.profile}): ${result.passed ? 'PASS' : 'REVIEW'}`);
  logger.log(`Deterministic: ${result.deterministic.verdict} | semantic: ${result.semantic.passed ? 'pass' : 'fail'} | action: ${result.action}`);
}

async function runJevReview({ args = [], options = {}, logger, fetchImpl, env = process.env } = {}) {
  const targetDir = resolveTargetDir(args);
  const fail = (status, reason, extra = {}) => {
    const result = { ok: false, status, reason, ...extra };
    if (!options.json && logger) logger.error(`Jev review failed: ${reason}`);
    return result;
  };
  const profile = normalizeProfile(options.profile);
  if (!profile) return fail('invalid_profile', `--profile must be one of ${[...PROFILES].join(', ')}`);
  const locator = resolveLocator(targetDir, options);
  if (!locator) {
    return fail('interface_not_found', 'pass --file=<html>, --dir=<interface-root>, --slug=<feature>, or --url=<served-app>');
  }

  let criteria;
  try {
    criteria = await readCriteria(targetDir, options.criteria);
  } catch (error) {
    return fail('invalid_criteria', `cannot read --criteria: ${error.message}`);
  }

  const quiet = { log() {}, error() {}, warn() {} };
  const visualReport = await runVerifyArtifact({
    args: [targetDir],
    options: visualOptions(options, locator),
    logger: quiet
  });
  if (!visualReport || visualReport.error === 'missing_file' || visualReport.error === 'invalid_slug') {
    return fail('visual_analysis_failed', visualReport?.issues?.[0] || visualReport?.error || 'visual analyzer failed');
  }
  if (!visualReport.metrics) {
    return fail('visual_analysis_failed', visualReport.issues?.[0] || 'the selected target contains no interface sources');
  }

  const sources = sourceBundle(targetDir, locator);
  const patterns = analyzeSourcePatterns(sources, { includeSource: Boolean(options['include-source']) });
  const evidence = {
    collector: 'aioson jev:review',
    profile,
    locator: {
      file: locator.file || null,
      dir: locator.dir || null,
      slug: locator.slug || null,
      url: locator.url || null,
      detected: Boolean(locator.detected)
    },
    deterministic: compactVisualEvidence(visualReport),
    patterns
  };
  const spec = buildReviewSpec({
    profile,
    evidence,
    intent: options.intent || '',
    criteria: criteria.text
  });

  if (options['evidence-only']) {
    const result = { ok: true, status: 'evidence', profile, criteria_file: criteria.file, evidence, spec };
    if (options['require-pass']) result.exitCode = 2;
    const out = await writeOutput(targetDir, options.out, result);
    if (out) result.out = out;
    if (!options.json) logHuman(logger, result);
    return result;
  }

  const timeoutMs = numberOption(options.timeout, undefined, 1000, 120000);
  const retries = numberOption(options.retries, undefined, 0, 4);
  if (options.timeout != null && timeoutMs == null) return fail('invalid_input', '--timeout must be between 1000 and 120000 ms');
  if (options.retries != null && retries == null) return fail('invalid_input', '--retries must be between 0 and 4');

  const config = loadJevConfig(targetDir, env);
  const judgment = await runJevJudgment({
    spec,
    projectDir: targetDir,
    config,
    fetchImpl,
    dryRun: Boolean(options['dry-run']),
    timeoutMs,
    retries
  });
  if (!judgment.ok) {
    const result = { ...judgment, profile, criteria_file: criteria.file, evidence };
    if (options['require-pass']) result.exitCode = 2;
    const out = await writeOutput(targetDir, options.out, result);
    if (out) result.out = out;
    if (!options.json) logHuman(logger, result);
    return result;
  }

  let result;
  if (judgment.status === 'dry_run') {
    result = {
      ok: true,
      status: 'dry_run',
      profile,
      criteria_file: criteria.file,
      config_status: judgment.config_status,
      config_reason: judgment.config_reason,
      route: judgment.route,
      model: judgment.model,
      bytes: judgment.bytes,
      spec,
      evidence
    };
  } else {
    result = combineReview({ profile, visualReport, judgment, evidence });
    result.criteria_file = criteria.file;
    if (options['require-pass'] && !result.passed) result.exitCode = 2;
  }
  if (options['require-pass'] && (result.status !== 'reviewed' || !result.passed)) result.exitCode = 2;
  const out = await writeOutput(targetDir, options.out, result);
  if (out) result.out = out;
  if (!options.json) logHuman(logger, result);
  return result;
}

module.exports = {
  combineReview,
  containsInterfaceFiles,
  detectInterfaceTarget,
  runJevReview
};
