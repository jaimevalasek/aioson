'use strict';

/**
 * aioson verify:implementation — deterministic local implementation verification pilot.
 *
 * Pilot modes:
 *   aioson verify:implementation . --feature=<slug> --prepare-ledger --json
 *   aioson verify:implementation . --feature=<slug> --check-ledger --json
 *   aioson verify:implementation . --feature=<slug> --build-prompt --json
 *   aioson verify:implementation . --feature=<slug> --check-report=<path> --policy=strict --json
 *   aioson verify:implementation . --feature=<slug> --tool=<codex|claude|opencode> --json
 *
 * This command prepares, validates, and can optionally run a constrained clean
 * auditor. It does not claim final correctness and does not replace QA.
 */

const fs = require('node:fs/promises');

const {
  validateFeatureSlug,
  resolveProjectRoot,
  resolveInsideRoot
} = require('../verification/path-policy');
const { normalizePolicy, makeError } = require('../verification/result');
const { discoverSourceArtifacts } = require('../verification/source-discovery');
const {
  prepareLedger,
  checkLedger
} = require('../verification/ledger-store');
const { buildEvidenceBundle } = require('../verification/evidence-bundle');
const { buildAndWritePromptPackage } = require('../verification/prompt-package');
const { parseVerificationReport } = require('../verification/report-parser');
const { applyPolicy } = require('../verification/policy-engine');
const {
  normalizeRunnerTool,
  normalizeRunnerModel,
  runnerLimits,
  runAuditorTool
} = require('../verification/runners');
const {
  runnerRunStem,
  writeVerificationRunFile,
  promoteLatestReport,
  systemInconclusiveReport
} = require('../verification/report-store');
const { recordVerificationTelemetry } = require('../verification/runtime-telemetry');

const BAR = '━'.repeat(42);

function hasMode(options, mode) {
  return Boolean(options && options[mode]);
}

function detectMode(options) {
  const modes = [
    'prepare-ledger',
    'check-ledger',
    'build-prompt',
    'check-report'
  ].filter((mode) => hasMode(options, mode));
  if (options && options.tool) modes.push('run-tool');
  if (modes.length === 0) return { ok: false, reason: 'missing_mode' };
  if (modes.length > 1) return { ok: false, reason: 'multiple_modes', modes };
  return { ok: true, mode: modes[0] };
}

function emit(result, options, logger) {
  if (options.json) return result;
  logger.log('');
  logger.log(`Implementation verification — ${result.feature_slug || 'unknown'}`);
  logger.log(BAR);
  logger.log(`Status: ${result.ok ? 'ok' : 'blocked'}`);
  if (result.reason) logger.log(`Reason: ${result.reason}`);
  if (result.mode) logger.log(`Mode: ${result.mode}`);
  if (result.ledger_path) logger.log(`Ledger: ${result.ledger_path}`);
  if (result.prompt_path) logger.log(`Prompt: ${result.prompt_path}`);
  if (result.raw_report_path) logger.log(`Raw report: ${result.raw_report_path}`);
  if (result.report_path) logger.log(`Report: ${result.report_path}`);
  if (result.tool) logger.log(`Tool: ${result.tool}`);
  if (result.model) logger.log(`Model: ${result.model}`);
  if (result.verdict) logger.log(`Verdict: ${result.verdict}`);
  if (result.recommended_route) logger.log(`Route: ${result.recommended_route}`);
  if (Array.isArray(result.missing_sections) && result.missing_sections.length) {
    logger.log(`Missing sections: ${result.missing_sections.join(', ')}`);
  }
  if (Array.isArray(result.errors) && result.errors.length) {
    logger.log(`Errors: ${result.errors.map((e) => `${e.field}:${e.reason}`).join(', ')}`);
  }
  logger.log('');
  return result;
}

async function runPrepareLedger({ rootDir, slug, options }) {
  const sourceArtifacts = await discoverSourceArtifacts(rootDir, slug);
  const result = await prepareLedger(rootDir, slug, sourceArtifacts);
  return {
    mode: 'prepare-ledger',
    ...result
  };
}

async function runCheckLedger({ rootDir, slug }) {
  const result = await checkLedger(rootDir, slug);
  return {
    mode: 'check-ledger',
    ...result
  };
}

async function runBuildPrompt({ rootDir, slug, policy, options }) {
  const ledgerResult = await checkLedger(rootDir, slug);
  if (!ledgerResult.ok) {
    return {
      mode: 'build-prompt',
      ...ledgerResult,
      ready_for_prompt: false
    };
  }
  if (!ledgerResult.ready_for_prompt) {
    return {
      mode: 'build-prompt',
      ok: false,
      reason: 'ledger_not_ready_for_prompt',
      feature_slug: slug,
      ledger_path: ledgerResult.ledger_path,
      missing_evidence: ledgerResult.missing_evidence || [],
      ready_for_prompt: false
    };
  }

  const sourceArtifacts = await discoverSourceArtifacts(rootDir, slug, ledgerResult.ledger);
  const evidenceBundle = await buildEvidenceBundle(rootDir, slug, ledgerResult.ledger, sourceArtifacts, policy);
  return {
    mode: 'build-prompt',
    ...(await buildAndWritePromptPackage({
      rootDir,
      slug,
      policy,
      ledger: ledgerResult.ledger,
      evidenceBundle,
      outPath: options.out || null
    }))
  };
}

function runnerFailureReason(status) {
  if (status === 'timeout') return 'runner_timeout';
  if (status === 'output_limit') return 'runner_output_limit';
  if (status === 'spawn_error') return 'runner_spawn_error';
  if (status === 'failed') return 'runner_failed';
  return 'runner_inconclusive';
}

async function buildPromptForRunner({ rootDir, slug, policy, options }) {
  const promptResult = await runBuildPrompt({ rootDir, slug, policy, options: { ...options, out: null } });
  if (!promptResult.ok) return promptResult;
  const safePrompt = resolveInsideRoot(rootDir, promptResult.prompt_path);
  if (!safePrompt.ok) return safePrompt;
  const promptText = await fs.readFile(safePrompt.path, 'utf8');
  return {
    ...promptResult,
    prompt_absolute_path: safePrompt.path,
    prompt_text: promptText
  };
}

async function writeSystemRunnerReport({ rootDir, slug, policy, stem, runner, reason, summary }) {
  const command = runner && runner.command ? runner.command : 'auditor runner';
  const markdown = systemInconclusiveReport({
    slug,
    policy,
    summary,
    command,
    status: reason,
    evidence: runner && runner.stderr ? runner.stderr.slice(0, 1000) : summary
  });
  const runReport = await writeVerificationRunFile(rootDir, slug, stem, 'system-report.md', markdown);
  const latest = await promoteLatestReport(rootDir, slug, markdown);
  const parsed = await parseVerificationReport(rootDir, slug, latest.relative_path, policy);
  const policyResult = parsed.ok
    ? applyPolicy(parsed.report, policy)
    : { verdict: 'INCONCLUSIVE', recommended_route: 'qa', blocking_findings_count: 0, policy, reason };
  return {
    ok: false,
    reason,
    verdict: policyResult.verdict,
    recommended_route: policyResult.recommended_route,
    blocking_findings_count: policyResult.blocking_findings_count,
    report: parsed.ok ? parsed.report : null,
    report_path: latest.relative_path,
    run_report_path: runReport.relative_path
  };
}

async function runToolAudit({ rootDir, slug, policy, options, spawnImpl }) {
  const toolResult = normalizeRunnerTool(options.tool);
  if (!toolResult.ok) {
    return {
      mode: 'run-tool',
      ok: false,
      verdict: 'INCONCLUSIVE',
      recommended_route: 'qa',
      ...toolResult
    };
  }
  const modelResult = normalizeRunnerModel(options.model);
  if (!modelResult.ok) {
    return {
      mode: 'run-tool',
      ok: false,
      verdict: 'INCONCLUSIVE',
      recommended_route: 'qa',
      tool: toolResult.tool,
      ...modelResult
    };
  }

  const prompt = await buildPromptForRunner({ rootDir, slug, policy, options });
  if (!prompt.ok) {
    return {
      mode: 'run-tool',
      ...prompt
    };
  }

  const limits = runnerLimits(options);
  const runner = await runAuditorTool({
    rootDir,
    tool: options.tool,
    model: options.model,
    promptPath: prompt.prompt_absolute_path,
    promptText: prompt.prompt_text,
    limits,
    spawnImpl
  });

  if (!runner.ok && ['unsupported_tool', 'missing_tool', 'invalid_model', 'tool_not_found'].includes(runner.reason)) {
    return {
      mode: 'run-tool',
      ok: false,
      verdict: 'INCONCLUSIVE',
      recommended_route: 'qa',
      ...runner
    };
  }

  const stem = runnerRunStem({ tool: runner.tool || options.tool, model: runner.model || options.model });
  const raw = await writeVerificationRunFile(rootDir, slug, stem, 'raw.md', runner.stdout || '');
  let stderrFile = null;
  if (runner.stderr) {
    stderrFile = await writeVerificationRunFile(rootDir, slug, stem, 'stderr.txt', runner.stderr);
  }

  const base = {
    mode: 'run-tool',
    feature_slug: slug,
    policy,
    tool: runner.tool,
    model: runner.model,
    prompt_path: prompt.prompt_path,
    raw_report_path: raw.relative_path,
    stderr_path: stderrFile ? stderrFile.relative_path : null,
    runner: {
      status: runner.status,
      command: runner.command,
      permission_mode: runner.permission_mode,
      destructive_commands_allowed: runner.destructive_commands_allowed,
      timeout_ms: runner.timeout_ms,
      max_output_bytes: runner.max_output_bytes,
      duration_ms: runner.duration_ms,
      exit_code: runner.exit_code,
      signal: runner.signal,
      output_bytes: runner.output_bytes,
      output_truncated: runner.output_truncated,
      detected: runner.detected
    }
  };

  if (!runner.ok) {
    const reason = runnerFailureReason(runner.status);
    return {
      ...base,
      ...(await writeSystemRunnerReport({
        rootDir,
        slug,
        policy,
        stem,
        runner,
        reason,
        summary: `Auditor runner did not complete successfully: ${runner.status}.`
      }))
    };
  }

  const parsed = await parseVerificationReport(rootDir, slug, raw.relative_path, policy);
  if (!parsed.ok) {
    return {
      ...base,
      parse_error: parsed,
      ...(await writeSystemRunnerReport({
        rootDir,
        slug,
        policy,
        stem,
        runner,
        reason: 'invalid_runner_report',
        summary: `Auditor output did not match the verification report contract: ${parsed.reason}.`
      }))
    };
  }

  const latest = await promoteLatestReport(rootDir, slug, runner.stdout);
  const machineJson = await writeVerificationRunFile(
    rootDir,
    slug,
    stem,
    'report.json',
    `${JSON.stringify(parsed.report, null, 2)}\n`
  );
  const policyResult = applyPolicy(parsed.report, policy);
  return {
    ...base,
    ok: policyResult.verdict === 'PASS',
    report_path: latest.relative_path,
    report_json_path: machineJson.relative_path,
    run_report_path: raw.relative_path,
    report: parsed.report,
    verdict: policyResult.verdict,
    recommended_route: policyResult.recommended_route,
    blocking_findings_count: policyResult.blocking_findings_count,
    reason: policyResult.reason
  };
}

async function runCheckReport({ rootDir, slug, policy, options }) {
  const reportPath = options['check-report'];
  if (reportPath === true || !reportPath) {
    return makeError('missing_report_path', {
      mode: 'check-report',
      feature_slug: slug
    });
  }

  const parsed = await parseVerificationReport(rootDir, slug, reportPath, policy);
  if (!parsed.ok) {
    return {
      mode: 'check-report',
      verdict: 'INCONCLUSIVE',
      recommended_route: 'qa',
      ...parsed
    };
  }

  const policyResult = applyPolicy(parsed.report, policy);
  return {
    mode: 'check-report',
    ok: policyResult.verdict === 'PASS',
    feature_slug: slug,
    report_path: parsed.report_path,
    report: parsed.report,
    verdict: policyResult.verdict,
    recommended_route: policyResult.recommended_route,
    blocking_findings_count: policyResult.blocking_findings_count,
    policy: policyResult.policy,
    reason: policyResult.reason
  };
}

async function runVerifyImplementation({ args, options = {}, logger, spawnImpl }) {
  const startedAt = Date.now();
  const rootDir = resolveProjectRoot(process.cwd(), args && args[0] ? args[0] : '.');
  const slugResult = validateFeatureSlug(options.feature || options.slug);
  if (!slugResult.ok) {
    return emit(makeError(slugResult.reason, {
      mode: 'verify-implementation',
      feature_slug: slugResult.feature_slug || null
    }), options, logger);
  }

  const modeResult = detectMode(options);
  if (!modeResult.ok) {
    return emit(makeError(modeResult.reason, {
      feature_slug: slugResult.feature_slug,
      modes: modeResult.modes || []
    }), options, logger);
  }

  const policy = normalizePolicy(options.policy || 'standard');
  if (!policy) {
    return emit(makeError('invalid_policy', {
      feature_slug: slugResult.feature_slug,
      policy: options.policy
    }), options, logger);
  }

  const slug = slugResult.feature_slug;
  let result;
  if (modeResult.mode === 'prepare-ledger') {
    result = await runPrepareLedger({ rootDir, slug, options });
  } else if (modeResult.mode === 'check-ledger') {
    result = await runCheckLedger({ rootDir, slug });
  } else if (modeResult.mode === 'build-prompt') {
    result = await runBuildPrompt({ rootDir, slug, policy, options });
  } else if (modeResult.mode === 'check-report') {
    result = await runCheckReport({ rootDir, slug, policy, options });
  } else if (modeResult.mode === 'run-tool') {
    result = await runToolAudit({ rootDir, slug, policy, options, spawnImpl });
  }

  const finalResult = {
    feature_slug: slug,
    policy,
    ...result
  };
  finalResult.telemetry = await recordVerificationTelemetry(rootDir, finalResult, { startedAt });

  return emit(finalResult, options, logger);
}

module.exports = {
  runVerifyImplementation,
  detectMode
};
