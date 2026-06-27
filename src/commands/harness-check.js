'use strict';

/**
 * aioson harness:check [path] --slug=<slug> [--criteria=C1,C2] [--timeout=<ms>]
 * [--json] — runner standalone e determinístico de criteria[].verification.
 *
 * Executa os checks executáveis do contrato FORA do self:loop, para consumo
 * pelo @validator (verificação binária antes de julgamento LLM), pelo @dev
 * (feedback rápido pré-done) ou por CI. Reusa runCriteria/executeInSandbox —
 * NÃO cria runner novo.
 *
 * Read-only sobre progress.json: quem muda estado do circuito continua sendo
 * o ciclo harness:validate/apply-validation. Persiste o resultado em
 * `last-check-output.json` no plan dir (espelha a convenção
 * last-validator-output.json) e emite telemetria criteria_check_failed
 * (best-effort, nunca quebra).
 */

const fs = require('node:fs');
const path = require('node:path');

const { validateContract, resolveContract } = require('../harness/contract-schema');
const { runCriteria, DEFAULT_CHECK_TIMEOUT_MS } = require('../harness/criteria-runner');
const { emitGuardEvent } = require('../harness/guard-events');
const { findActiveContract } = require('../harness/active-contract');
const { checkContractIntegrity } = require('../harness/contract-integrity');
const { detectRuntimeFeature } = require('../harness/detect-runtime-feature');

function readCompletedSteps(planDir) {
  try {
    const progressPath = path.join(planDir, 'progress.json');
    if (!fs.existsSync(progressPath)) return [];
    const progress = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
    return Array.isArray(progress.completed_steps) ? progress.completed_steps : [];
  } catch {
    return [];
  }
}

function resolveSlug(targetDir, options) {
  const explicit = String(options.slug || '').trim();
  if (explicit) return explicit;
  try {
    const active = findActiveContract(targetDir);
    return active ? active.slug : '';
  } catch {
    return '';
  }
}

async function runHarnessCheck({ args, options = {}, logger, t }) {
  const targetDir = path.resolve(process.cwd(), args?.[0] || '.');
  const slug = resolveSlug(targetDir, options);

  if (!slug) {
    logger.error(t('errors.missing_slug') || 'Error: --slug is required');
    return { ok: false, error: 'missing_slug' };
  }

  const planDir = path.join(targetDir, '.aioson', 'plans', slug);
  const contractPath = path.join(planDir, 'harness-contract.json');

  if (!fs.existsSync(contractPath)) {
    logger.error(t('harness.contract_not_found', { slug }) || `Contract not found for slug: ${slug}`);
    return { ok: false, error: 'contract_not_found', slug };
  }

  let contract;
  try {
    contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  } catch (err) {
    logger.error(`Invalid JSON in contract: ${err.message}`);
    return { ok: false, error: 'invalid_json', slug, detail: err.message };
  }

  const schemaResult = validateContract(contract);
  if (!schemaResult.ok) {
    const first = schemaResult.errors[0];
    logger.error(`Contract schema invalid: ${first.field} — ${first.reason}`);
    await emitGuardEvent(targetDir, {
      eventType: 'contract_invalid',
      agent: 'harness-check',
      message: `${first.field}: ${first.reason}`,
      payload: { slug }
    });
    return { ok: false, error: 'contract_schema_invalid', slug, errors: schemaResult.errors };
  }

  const resolved = resolveContract(contract);

  // ── Contract-integrity precheck (§2c, deterministic core of @validator Step 0) ──
  // A runtime feature whose contract has no RG-* criterion, or that pads binary
  // criteria with duplicate verification commands, cannot prove the app runs.
  // Detection only fires on signals the framework locates reliably (prototype
  // manifest, migration steps); the Play has_api trigger stays with @validator.
  const runtime = detectRuntimeFeature(targetDir, slug, {
    completedSteps: readCompletedSteps(planDir)
  });
  const integrity = checkContractIntegrity(contract, { isRuntimeFeature: runtime.isRuntimeFeature });
  for (const err of integrity.errors) {
    await emitGuardEvent(targetDir, {
      eventType: 'contract_integrity_failed',
      agent: 'harness-check',
      message: `${err.code}: ${err.message}`,
      payload: { slug, code: err.code, signals: runtime.signals }
    });
  }

  let criteria = resolved.criteria;
  if (options.criteria) {
    const wanted = new Set(
      String(options.criteria).split(',').map((id) => id.trim()).filter(Boolean)
    );
    criteria = criteria.filter((c) => c && wanted.has(c.id));
    const found = new Set(criteria.map((c) => c.id));
    const missing = [...wanted].filter((id) => !found.has(id));
    if (missing.length) {
      logger.error(t('harness.check_unknown_criteria', { ids: missing.join(', ') }) || `Unknown criteria ids: ${missing.join(', ')}`);
      return { ok: false, error: 'unknown_criteria', slug, missing };
    }
  }

  const timeoutMs = Number.isInteger(Number(options.timeout)) && Number(options.timeout) > 0
    ? Number(options.timeout)
    : DEFAULT_CHECK_TIMEOUT_MS;

  const executable = criteria.filter(
    (c) => c && typeof c.verification === 'string' && c.verification.trim()
  );
  const skipped = criteria.length - executable.length;
  const strict = Boolean(options.strict);
  const binaryWithoutVerification = criteria.filter(
    (c) => c && c.binary === true && !(typeof c.verification === 'string' && c.verification.trim())
  );
  const strictErrors = [];
  if (strict && criteria.length > 0 && executable.length === 0) {
    strictErrors.push('strict mode requires at least one executable verification criterion');
  }
  if (strict && binaryWithoutVerification.length > 0) {
    strictErrors.push(`strict mode requires verification for binary criteria: ${binaryWithoutVerification.map((c) => c.id).join(', ')}`);
  }

  const checks = await runCriteria({ criteria, cwd: targetDir, timeoutMs });
  const failed = checks.filter((c) => !c.ok);

  for (const check of failed) {
    await emitGuardEvent(targetDir, {
      eventType: 'criteria_check_failed',
      agent: 'harness-check',
      message: `${check.id}: exit ${check.exitCode}${check.timedOut ? ' (timeout)' : ''}`,
      payload: { slug, criterion_id: check.id, exit_code: check.exitCode, signature: check.signature }
    });
  }

  const report = {
    ok: failed.length === 0 && strictErrors.length === 0 && integrity.ok,
    slug,
    checked_at: new Date().toISOString(),
    strict,
    criteria_total: criteria.length,
    executable_total: executable.length,
    passed: checks.length - failed.length,
    failed: failed.length,
    skipped_no_verification: skipped,
    strict_errors: strictErrors,
    integrity: {
      ok: integrity.ok,
      is_runtime_feature: runtime.isRuntimeFeature,
      runtime_signals: runtime.signals,
      errors: integrity.errors,
      warnings: integrity.warnings
    },
    checks
  };

  try {
    if (!fs.existsSync(planDir)) fs.mkdirSync(planDir, { recursive: true });
    fs.writeFileSync(
      path.join(planDir, 'last-check-output.json'),
      JSON.stringify(report, null, 2),
      'utf8'
    );
  } catch (err) {
    // Persistência é conveniência, não gate — reporta sem falhar o run.
    logger.error(`Could not persist last-check-output.json: ${err.message}`);
  }

  if (options.json) {
    logger.log(JSON.stringify(report, null, 2));
    return report;
  }

  logger.log(t('harness.check_header', { slug }) || `Harness check — ${slug}`);
  for (const err of integrity.errors) {
    logger.log(`  ✗ contract-integrity (${err.code}): ${err.message}`);
  }
  for (const warn of integrity.warnings) {
    logger.log(`  ⚠ contract-integrity (${warn.code}): ${warn.message}`);
  }
  for (const error of strictErrors) {
    logger.log(`  ✗ ${error}`);
  }
  if (executable.length === 0) {
    logger.log(t('harness.check_no_executable', { total: criteria.length }) || `  No criteria with verification commands (${criteria.length} criteria total). @validator judges them all.`);
    return report;
  }
  for (const check of checks) {
    const mark = check.ok ? '✓' : '✗';
    const extra = check.ok ? '' : ` (exit ${check.exitCode}${check.timedOut ? ', timeout' : ''})`;
    logger.log(`  ${mark} ${check.id} — ${check.command}${extra} [${check.durationMs}ms]`);
  }
  logger.log(
    t('harness.check_summary', { passed: report.passed, executable: executable.length, skipped }) ||
    `  Checks: ${report.passed}/${executable.length} passed (${skipped} without verification — judged by @validator)`
  );
  return report;
}

module.exports = { runHarnessCheck };
