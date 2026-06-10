'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createCircuitBreaker } = require('../harness/circuit-breaker');
const { validateContract } = require('../harness/contract-schema');

/**
 * aioson harness:init — Inicializa o contrato e progresso da feature.
 */
async function runHarnessInit({ args, options = {}, logger, t }) {
  const targetDir = path.resolve(process.cwd(), args[0] || '.');
  const slug = String(options.slug || '').trim();
  const mode = String(options.mode || 'BALANCED').toUpperCase();

  if (!slug) {
    logger.error(t('errors.missing_slug') || 'Error: --slug is required');
    return { ok: false, error: 'missing_slug' };
  }

  const planDir = path.join(targetDir, '.aioson', 'plans', slug);
  const contractPath = path.join(planDir, 'harness-contract.json');
  const progressPath = path.join(planDir, 'progress.json');

  if (fs.existsSync(contractPath) || fs.existsSync(progressPath)) {
    logger.log(t('harness.init_exists', { path: path.relative(targetDir, planDir) }) || `Harness already initialized in ${path.relative(targetDir, planDir)}`);
    return { ok: true, skipped: true };
  }

  if (!fs.existsSync(planDir)) {
    fs.mkdirSync(planDir, { recursive: true });
  }

  const contract = {
    feature: slug,
    contract_mode: mode,
    governor: {
      max_steps: 50,
      error_streak_limit: 5,
      cost_ceiling_tokens: null,
      max_runtime_minutes: null,
      max_changed_files: null,
      max_diff_lines: null
    },
    // Scope guard (loop-guardrails): allowed_files ausente = sem allowlist;
    // forbidden_files é SEMPRE mesclado com os defaults embutidos (.env*, *.pem,
    // *.key, secrets/**, .git/**, node_modules/**, lockfiles) — não-removíveis.
    forbidden_files: [],
    // human_gate ausente = nenhum gate (retrocompat). Exemplo:
    // "human_gate": { "required_for": ["payment_logic_change", "publish"] }
    criteria: [
      {
        id: "C1",
        description: "Estrutura de arquivos e sintaxe básica",
        assertion: "all files exist and parse",
        binary: true
      }
    ]
  };

  const schemaResult = validateContract(contract);
  if (!schemaResult.ok) {
    const first = schemaResult.errors[0];
    logger.error(`Contract schema invalid: ${first.field} — ${first.reason}`);
    return { ok: false, error: 'contract_schema_invalid', errors: schemaResult.errors };
  }

  const cb = createCircuitBreaker(contractPath, progressPath);
  fs.writeFileSync(contractPath, JSON.stringify(contract, null, 2), 'utf8');
  await cb.load();
  await cb._save();

  logger.log(t('harness.init_success', { slug }) || `Harness initialized for feature: ${slug}`);
  return { ok: true, slug, path: planDir };
}

/**
 * Validates the JSON output emitted by @validator (per validator.md output spec).
 * Returns null if valid; a human-readable error message otherwise.
 *
 * Expected shape:
 *   {
 *     "phase": <number>,
 *     "validation_at": "<ISO-8601 string>",
 *     "results": [{ "id": "<string>", "passed": <bool>, "reason": <string|null> }, ...],
 *     "overall_score": 0 | 1,
 *     "ready_for_done_gate": <bool>
 *   }
 */
function validateValidatorOutput(output) {
  if (!output || typeof output !== 'object') return 'output must be an object';
  if (typeof output.phase !== 'number') return 'phase must be a number';
  if (typeof output.validation_at !== 'string' || !output.validation_at) return 'validation_at must be a non-empty ISO-8601 string';
  if (!Array.isArray(output.results)) return 'results must be an array';
  if (output.overall_score !== 0 && output.overall_score !== 1) return 'overall_score must be 0 or 1';
  if (typeof output.ready_for_done_gate !== 'boolean') return 'ready_for_done_gate must be boolean';
  for (let i = 0; i < output.results.length; i++) {
    const r = output.results[i];
    if (!r || typeof r !== 'object') return `results[${i}] must be an object`;
    if (typeof r.id !== 'string' || !r.id) return `results[${i}].id must be a non-empty string`;
    if (typeof r.passed !== 'boolean') return `results[${i}].passed must be boolean`;
    if (r.reason != null && typeof r.reason !== 'string') return `results[${i}].reason must be string or null`;
  }
  return null;
}

/**
 * Translates @validator output JSON into a single-line `last_error` string
 * suitable for `progress.json`. Returns null when overall_score === 1.
 *
 * Format: "<critério-id>: <reason>" — first failed result wins.
 */
function translateValidatorOutputToLastError(output) {
  if (!output || output.overall_score === 1) return null;
  const firstFailure = (output.results || []).find((r) => !r.passed);
  if (!firstFailure) return 'overall_score=0 with no failure detail';
  const reason = firstFailure.reason || 'no reason given';
  return `${firstFailure.id}: ${reason}`;
}

/**
 * aioson harness:apply-validation — Consome o JSON do @validator (vindo de
 * qualquer fonte: LLM externo, CI runner, manual paste) e atualiza
 * `progress.json` via circuit breaker.
 *
 * Implements AC-HD-15 of harness-driven-aioson.
 */
async function runHarnessApplyValidation({ args, options = {}, logger, t }) {
  const targetDir = path.resolve(process.cwd(), args[0] || '.');
  const slug = String(options.slug || '').trim();

  if (!slug) {
    logger.error(t('errors.missing_slug') || 'Error: --slug is required');
    return { ok: false, error: 'missing_slug' };
  }

  const planDir = path.join(targetDir, '.aioson', 'plans', slug);
  const contractPath = path.join(planDir, 'harness-contract.json');
  const progressPath = path.join(planDir, 'progress.json');
  const inputPath = options.input
    ? path.resolve(targetDir, String(options.input))
    : path.join(planDir, 'last-validator-output.json');

  if (!fs.existsSync(contractPath)) {
    logger.error(t('harness.contract_not_found') || `Contract not found for slug: ${slug}`);
    return { ok: false, error: 'contract_not_found' };
  }

  if (!fs.existsSync(inputPath)) {
    logger.error(
      t('harness.validator_output_not_found', { path: inputPath }) ||
      `Validator output not found at ${inputPath}`
    );
    return { ok: false, error: 'validator_output_not_found', expectedPath: inputPath };
  }

  let validatorOutput;
  try {
    validatorOutput = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  } catch (err) {
    logger.error(`Invalid JSON in validator output: ${err.message}`);
    return { ok: false, error: 'invalid_json', detail: err.message };
  }

  const schemaError = validateValidatorOutput(validatorOutput);
  if (schemaError) {
    logger.error(`Invalid validator output schema: ${schemaError}`);
    return { ok: false, error: 'invalid_schema', detail: schemaError };
  }

  const cb = createCircuitBreaker(contractPath, progressPath);
  await cb.load();

  const overallScore = validatorOutput.overall_score;
  const archive = options.archive !== false;

  if (overallScore === 1) {
    await cb.recordSuccess();
    await clearWaitingValidationStatus(cb);
    if (archive) archiveValidatorOutput(planDir, inputPath);
    logger.log(`  ✓ PASS — ${slug} (overall_score=1, ready_for_done_gate=true)`);
    return {
      ok: true,
      verdict: 'PASS',
      slug,
      ready_for_done_gate: true,
      results: validatorOutput.results
    };
  }

  const lastError = translateValidatorOutputToLastError(validatorOutput);
  await cb.recordError(lastError);
  await clearWaitingValidationStatus(cb);
  if (archive) archiveValidatorOutput(planDir, inputPath);
  logger.log(`  ✗ FAIL — ${slug} (${lastError})`);
  return {
    ok: false,
    verdict: 'FAIL',
    slug,
    last_error: lastError,
    ready_for_done_gate: false,
    results: validatorOutput.results
  };
}

/**
 * After consuming validator output, reset `progress.status` if it is still
 * `waiting_validation`. recordError may have set it to `circuit_open`; that
 * state is preserved (more specific). recordSuccess does not change status,
 * so a stale `waiting_validation` would otherwise linger and cause workflow:next
 * to keep routing to @validator forever.
 */
async function clearWaitingValidationStatus(cb) {
  if (cb.progress && cb.progress.status === 'waiting_validation') {
    cb.progress.status = 'in_progress';
    cb.progress.last_updated = new Date().toISOString();
    await cb._save();
  }
}

function archiveValidatorOutput(planDir, inputPath) {
  const runsDir = path.join(planDir, 'validator-runs');
  if (!fs.existsSync(runsDir)) fs.mkdirSync(runsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const archivedPath = path.join(runsDir, `${stamp}.json`);
  fs.renameSync(inputPath, archivedPath);
  return archivedPath;
}

/**
 * aioson harness:validate — Router. Se `last-validator-output.json` existir,
 * consome via apply-validation. Senão, gera o prompt do @validator headless
 * para o user/runner externo executar.
 *
 * Implements AC-HD-09 / AC-HD-10 entry point.
 */
async function runHarnessValidate({ args, options = {}, logger, t }) {
  const targetDir = path.resolve(process.cwd(), args[0] || '.');
  const slug = String(options.slug || '').trim();

  if (!slug) {
    logger.error(t('errors.missing_slug') || 'Error: --slug is required');
    return { ok: false, error: 'missing_slug' };
  }

  const planDir = path.join(targetDir, '.aioson', 'plans', slug);
  const contractPath = path.join(planDir, 'harness-contract.json');
  const progressPath = path.join(planDir, 'progress.json');
  const validatorOutputPath = path.join(planDir, 'last-validator-output.json');
  const promptPath = path.join(planDir, 'validator-prompt.txt');

  if (!fs.existsSync(contractPath)) {
    logger.error(t('harness.contract_not_found') || `Contract not found for slug: ${slug}`);
    return { ok: false, error: 'contract_not_found' };
  }

  const cb = createCircuitBreaker(contractPath, progressPath);
  await cb.load();

  const { allowed, reason } = cb.check();
  if (!allowed) {
    logger.log(t('harness.blocked', { reason }) || `Execution paused: ${reason}`);
    return { ok: false, reason };
  }

  if (fs.existsSync(validatorOutputPath)) {
    logger.log(t('harness.consuming_output', { path: validatorOutputPath }) || `Consuming validator output from ${validatorOutputPath}...`);
    return runHarnessApplyValidation({
      args,
      options: { ...options, slug, input: validatorOutputPath },
      logger,
      t
    });
  }

  logger.log(t('harness.validating', { slug }) || `Generating validator prompt for ${slug}...`);

  const { runAgentPrompt } = require('./agents');
  const promptResult = await runAgentPrompt({
    args: ['validator', targetDir],
    options: {
      ...options,
      headless: true,
      output: promptPath
    },
    logger: { log: () => {}, error: (m) => logger.error(m) },
    t
  });

  if (!promptResult.ok) {
    return { ok: false, error: 'agent_prompt_failed', detail: promptResult };
  }

  // Mark feature as awaiting validation — drives workflow:next routing (AC-HD-14).
  // Reset by runHarnessApplyValidation after the validator output is consumed.
  cb.progress.status = 'waiting_validation';
  cb.progress.last_updated = new Date().toISOString();
  await cb._save();

  logger.log('');
  logger.log(`Validator prompt saved to: ${promptPath}`);
  logger.log('');
  logger.log('Next steps:');
  logger.log(`  1. Open the prompt in an LLM tool (Claude Code, Codex, etc.) with @validator activated`);
  logger.log(`  2. Save the JSON output to: ${validatorOutputPath}`);
  logger.log(`  3. Re-run: aioson harness:validate . --slug=${slug}`);
  logger.log(`     (or:    aioson harness:apply-validation . --slug=${slug})`);

  return {
    ok: true,
    status: 'awaiting_validation',
    slug,
    promptPath,
    expectedOutputPath: validatorOutputPath
  };
}

module.exports = {
  runHarnessInit,
  runHarnessValidate,
  runHarnessApplyValidation,
  validateValidatorOutput,
  translateValidatorOutputToLastError
};
