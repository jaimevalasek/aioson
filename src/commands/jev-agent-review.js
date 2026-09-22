'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { inspectBriefingSourcePack } = require('../lib/briefing-source-pack');
const { analyzeCoverage } = require('../pentester-coverage');
const { loadJevConfig } = require('../lib/jev-config');
const { runJevJudgment } = require('../lib/jev-judgment');
const {
  AGENTS,
  assessEvidence,
  PROFILE_DEFINITIONS,
  buildAgentReviewSpec,
  buildProvenance,
  collectArtifacts,
  compact,
  composeAgentDecision,
  normalizeAgent,
  sanitizeSecurityArtifact
} = require('../lib/jev-agent-review');
const { resolveOperandPath, resolveTargetDir } = require('../lib/project-root');
const { validateFeatureSlug } = require('../verification/path-policy');
const { collectRelations, relationQuestions, composeRelations } = require('../lib/jev-relations');

const PHASES = new Set(['preflight', 'review', 'handoff']);

function quietLogger() {
  return { log() {}, error() {}, warn() {} };
}

async function collectFeatureTrace(targetDir, slug) {
  try {
    const { runFeatureTrace } = require('./feature-trace');
    return await runFeatureTrace({
      args: [targetDir],
      options: { feature: slug, json: true },
      logger: quietLogger()
    });
  } catch (error) {
    return { ok: false, reason: 'collector_failed', detail: error.message };
  }
}

async function collectAcTestAudit(targetDir, slug) {
  try {
    const { runAcTestAudit } = require('./ac-test-audit');
    const report = await runAcTestAudit({
      args: [targetDir],
      options: { feature: slug, strict: true, seed: true, json: true },
      logger: quietLogger()
    });
    delete report.audited_at; // Collection time is not execution freshness.
    return report;
  } catch (error) {
    return { ok: false, reason: 'collector_failed', detail: error.message };
  }
}

async function collectBriefingSources(targetDir, slug) {
  try {
    const report = await inspectBriefingSourcePack(targetDir, slug);
    if (!report?.ok) return compact(report);
    return compact({
      ok: true,
      slug: report.slug,
      file_count: report.file_count,
      has_sql: report.has_sql,
      mixed: report.mixed,
      logical_groups: report.logical_groups,
      files: (report.files || []).map((file) => ({
        path: file.path,
        role: file.role,
        kind: file.kind,
        load_policy: file.load_policy,
        sha256: file.sha256
      }))
    });
  } catch (error) {
    return { ok: false, reason: 'collector_failed', detail: error.message };
  }
}

async function collectSecurityCoverage(targetDir, slug) {
  const relativePath = `.aioson/context/security-findings-${slug}.json`;
  try {
    const raw = await fs.readFile(path.join(targetDir, relativePath), 'utf8');
    const artifact = JSON.parse(raw);
    const coverage = analyzeCoverage(artifact);
    return compact({
      ok: true,
      artifact_path: relativePath,
      complete: coverage.complete,
      missing_required: coverage.missingRequired,
      missing_owasp_top_10: coverage.missingTop10,
      duplicate_top_10: coverage.duplicateTop10,
      missing_surfaces: coverage.missingSurfaces,
      issues: coverage.issues,
      not_tested: coverage.notTested.map((row) => ({ control_id: row.control_id, status: row.status })),
      findings: sanitizeSecurityArtifact(artifact).findings
    });
  } catch (error) {
    if (error?.code === 'ENOENT') return { ok: false, reason: 'artifact_missing', artifact_path: relativePath };
    return { ok: false, reason: 'collector_failed', detail: error.message, artifact_path: relativePath };
  }
}

async function collectDeterministicEvidence(targetDir, agent, slug) {
  const evidence = {};
  for (const collector of PROFILE_DEFINITIONS[agent].collectors) {
    if (collector === 'feature_trace') evidence.feature_trace = await collectFeatureTrace(targetDir, slug);
    if (collector === 'ac_test_audit') evidence.ac_test_audit = await collectAcTestAudit(targetDir, slug);
    if (collector === 'briefing_sources') evidence.briefing_sources = await collectBriefingSources(targetDir, slug);
    if (collector === 'security_coverage') evidence.security_coverage = await collectSecurityCoverage(targetDir, slug);
  }
  return evidence;
}

async function writeOutput(targetDir, operand, value) {
  if (!operand) return null;
  const file = resolveOperandPath(targetDir, String(operand));
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return path.relative(targetDir, file).replace(/\\/g, '/');
}

function numberOption(value, fallback, min, max) {
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

function logHuman(logger, result) {
  if (!logger) return;
  if (!result.ok) {
    logger.error(`Jev agent review failed: ${result.reason || result.status || 'unknown error'}`);
    return;
  }
  if (result.status === 'evidence' || result.status === 'dry_run') {
    logger.log(`Jev agent review ${result.status.replace('_', '-')} prepared for @${result.agent} (${result.feature}); no judgment was applied.`);
    return;
  }
  if (result.status === 'skipped') {
    logger.log(`Jev agent review skipped for @${result.agent}: ${result.reason}. Deterministic workflow remains authoritative.`);
    return;
  }
  logger.log(`Jev agent review @${result.agent} (${result.phase}): ${result.decision.passed ? 'READY' : 'REVIEW'}`);
  logger.log(`Advisory action: ${result.decision.action}; model: ${result.model || 'unknown'}`);
}

async function finalizeResult(targetDir, options, logger, result) {
  if (options['require-pass'] && (result.status !== 'reviewed' || !result.decision?.passed)) result.exitCode = 2;
  if (options.out) result.out = path.relative(targetDir, resolveOperandPath(targetDir, String(options.out))).replace(/\\/g, '/');
  await writeOutput(targetDir, options.out, result);
  if (!options.json) logHuman(logger, result);
  return result;
}

async function runJevAgentReview({ args = [], options = {}, logger, fetchImpl, env = process.env } = {}) {
  const targetDir = resolveTargetDir(args);
  const agent = normalizeAgent(options.agent);
  if (!agent) {
    return finalizeResult(targetDir, options, logger, {
      ok: false,
      status: 'invalid_input',
      reason: `--agent must be one of ${AGENTS.join(', ')}`
    });
  }
  const checkedSlug = validateFeatureSlug(options.feature || options.slug);
  if (!checkedSlug.ok) {
    return finalizeResult(targetDir, options, logger, {
      ok: false,
      status: 'invalid_input',
      reason: '--feature=<slug> is required and must be a safe feature slug',
      agent
    });
  }
  const slug = checkedSlug.feature_slug;
  const phase = String(options.phase || 'review').trim().toLowerCase();
  if (!PHASES.has(phase)) {
    return finalizeResult(targetDir, options, logger, {
      ok: false,
      status: 'invalid_input',
      reason: '--phase must be preflight, review, or handoff',
      agent,
      feature: slug
    });
  }

  const artifacts = await collectArtifacts(targetDir, agent, slug);
  const evidence = await collectDeterministicEvidence(targetDir, agent, slug);
  const relations = await collectRelations(targetDir, slug, { includeSource: Boolean(options['include-source']) });
  evidence.relations = { status: relations.status, total: relations.total, errors: relations.errors };
  const deterministic = assessEvidence(agent, phase, artifacts, evidence);
  const spec = buildAgentReviewSpec({ agent, slug, phase, artifacts, evidence, deterministic });
  if (relations.items.length) {
    spec.state.relations = relations.items;
    Object.assign(spec.questions, relationQuestions(relations.items));
  }
  const config = loadJevConfig(targetDir, env);
  const provenance = buildProvenance(spec, artifacts, config);
  const base = {
    ok: true,
    agent,
    profile: PROFILE_DEFINITIONS[agent].profile,
    feature: slug,
    phase,
    generated_at: new Date().toISOString(),
    advisory: true,
    authority: 'deterministic_cli_and_agent_ownership',
    privacy: {
      sent_when_used: artifacts.filter((item) => item.status === 'included').map((item) => item.path),
      omitted: artifacts.filter((item) => item.status !== 'included').map((item) => ({ path: item.path, status: item.status })),
      application_source_files_collected: Boolean(options['include-source'] && relations.items.length),
      persisted_content: Boolean(options.out && (options['evidence-only'] || options['dry-run'])),
      notice: 'Canonical artifact excerpts and compact deterministic evidence are sent to the configured external Jev provider. Explicit relation references outside canonical documents require --include-source. Code snippets embedded in canonical artifacts remain part of those artifacts. Do not include sensitive reproduction evidence.'
    },
    provenance
  };

  if (options['evidence-only']) {
    return finalizeResult(targetDir, options, logger, {
      ...base,
      status: 'evidence',
      spec
    });
  }

  const included = artifacts.filter((item) => item.status === 'included');
  if (included.length === 0) {
    return finalizeResult(targetDir, options, logger, {
      ...base,
      status: 'skipped',
      reason: 'no_review_artifacts'
    });
  }

  const timeoutMs = numberOption(options.timeout, undefined, 1000, 120000);
  const retries = numberOption(options.retries, undefined, 0, 4);
  if (options.timeout != null && timeoutMs == null) {
    return finalizeResult(targetDir, options, logger, { ...base, ok: false, status: 'invalid_input', reason: '--timeout must be between 1000 and 120000 ms' });
  }
  if (options.retries != null && retries == null) {
    return finalizeResult(targetDir, options, logger, { ...base, ok: false, status: 'invalid_input', reason: '--retries must be between 0 and 4' });
  }

  if (!options['dry-run'] && (!config.enabled || config.status !== 'ready')) {
    return finalizeResult(targetDir, options, logger, {
      ...base,
      status: 'skipped',
      reason: config.reason || config.status || 'jev_not_ready',
      route: config.route,
      model: config.model
    });
  }

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
    if (judgment.status === 'invalid_spec') {
      return finalizeResult(targetDir, options, logger, {
        ...base,
        status: 'skipped',
        reason: 'generated_spec_invalid_or_over_budget',
        errors: judgment.errors
      });
    }
    return finalizeResult(targetDir, options, logger, {
      ...base,
      status: 'skipped',
      reason: judgment.reason || judgment.status || 'jev_unavailable',
      route: judgment.route || config.route,
      model: judgment.model || config.model,
      attempts: judgment.attempts || null
    });
  }

  if (judgment.status === 'dry_run') {
    return finalizeResult(targetDir, options, logger, {
      ...base,
      status: 'dry_run',
      route: judgment.route,
      model: judgment.model,
      bytes: judgment.bytes,
      spec
    });
  }

  const decision = composeAgentDecision(agent, judgment.answers, {}, deterministic);
  const relationships = composeRelations(relations.items, judgment.answers);
  if (relationships.some((item) => !item.supported)) {
    decision.passed = false;
    decision.action = decision.effective_action = 'review_relations';
  }
  return finalizeResult(targetDir, options, logger, {
    ...base,
    status: 'reviewed',
    route: judgment.route,
    model: judgment.model,
    provider: judgment.provider,
    usage: judgment.usage,
    request_id: judgment.request_id,
    attempts: judgment.attempts,
    answers: judgment.answers,
    decision,
    relationships,
    cache: judgment.cache,
    duration_ms: judgment.duration_ms,
    provenance: buildProvenance(spec, artifacts, config, judgment.model)
  });
}

module.exports = {
  PHASES,
  collectDeterministicEvidence,
  runJevAgentReview
};
