'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { validateContract } = require('./contract-schema');
const { checkContractIntegrity } = require('./contract-integrity');
const { evaluateStaticCriteria } = require('./static-criteria');
const { detectRuntimeFeature, gitChangedFiles } = require('./detect-runtime-feature');
const { runHarnessCheck } = require('../commands/harness-check');

function readJsonSafe(filePath) {
  try {
    if (!fs.existsSync(filePath)) return { exists: false, value: null, error: null };
    return { exists: true, value: JSON.parse(fs.readFileSync(filePath, 'utf8')), error: null };
  } catch (err) {
    return { exists: true, value: null, error: err };
  }
}

function progressCompletedSteps(progress) {
  if (!progress || typeof progress !== 'object') return [];
  return [
    progress.completed_steps,
    progress.changed_files,
    progress.touched_files
  ].flatMap((value) => Array.isArray(value) ? value : []);
}

function makeSilentLogger() {
  return {
    lines: [],
    errors: [],
    log(message = '') { this.lines.push(String(message)); },
    error(message = '') { this.errors.push(String(message)); }
  };
}

async function evaluateContractIntegrityGate(targetDir, slug, options = {}) {
  const planDir = path.join(targetDir, '.aioson', 'plans', slug);
  const contractPath = path.join(planDir, 'harness-contract.json');
  const progressPath = path.join(planDir, 'progress.json');
  const progressRead = readJsonSafe(progressPath);
  const completedSteps = progressRead.value ? progressCompletedSteps(progressRead.value) : [];
  const changedFiles = options.changedFiles || gitChangedFiles(targetDir);
  const runtime = detectRuntimeFeature(targetDir, slug, { completedSteps, changedFiles });

  const contractRead = readJsonSafe(contractPath);
  if (!contractRead.exists) {
    if (!runtime.isRuntimeFeature) {
      return { ok: true, slug, has_contract: false, runtime, errors: [], warnings: [] };
    }
    return {
      ok: false,
      slug,
      has_contract: false,
      runtime,
      errors: [{
        code: 'missing_runtime_contract',
        message: `runtime feature detected (${runtime.signals.join(', ')}) but .aioson/plans/${slug}/harness-contract.json is missing — author it with the §2c RG-* runtime-gate criteria (run \`aioson harness:init . --slug=${slug}\`, or have @sheldon/@dev produce it), then re-run the stage.`
      }],
      warnings: []
    };
  }

  if (contractRead.error) {
    return {
      ok: false,
      slug,
      has_contract: true,
      runtime,
      errors: [{
        code: 'contract_invalid_json',
        message: `invalid JSON in .aioson/plans/${slug}/harness-contract.json: ${contractRead.error.message}`
      }],
      warnings: []
    };
  }

  const schemaResult = validateContract(contractRead.value);
  if (!schemaResult.ok) {
    return {
      ok: false,
      slug,
      has_contract: true,
      runtime,
      errors: schemaResult.errors.map((err) => ({
        code: 'contract_schema_invalid',
        message: `${err.field}: ${err.reason}`
      })),
      warnings: schemaResult.warnings || []
    };
  }

  const integrity = checkContractIntegrity(contractRead.value, {
    isRuntimeFeature: runtime.isRuntimeFeature
  });
  const errors = [...integrity.errors];
  const warnings = [...integrity.warnings];
  let checkReport = null;

  if (options.runChecks) {
    // The full path runs the expensive runtime (RG-*) commands AND re-evaluates
    // the cheap static (SG-*) criteria as part of its report — so it owns both.
    checkReport = await runHarnessCheck({
      args: [targetDir],
      options: {
        slug,
        json: true,
        strict: Boolean(options.strict || runtime.isRuntimeFeature)
      },
      logger: makeSilentLogger(),
      t: () => undefined
    });
    if (!checkReport.ok) {
      errors.push({
        code: 'harness_check_failed',
        message: `aioson harness:check failed for ${slug}; see .aioson/plans/${slug}/last-check-output.json`
      });
    }
  } else {
    // SG-* static criteria are build-independent (pure fs + RegExp + parse) — they
    // gate at EVERY stage, even when the expensive runtime checks are deferred to
    // the last gate (A5). Evaluate them directly here so a stubbed/placeholder
    // implementation cannot pass @dev-done just because the build smoke runs later.
    const staticResult = evaluateStaticCriteria({
      criteria: Array.isArray(contractRead.value.criteria) ? contractRead.value.criteria : [],
      cwd: targetDir
    });
    for (const check of staticResult.checks) {
      if (!check.ok) {
        errors.push({
          code: 'static_criteria_failed',
          message: `${check.id}: ${check.detail}`
        });
      }
    }
  }

  return {
    ok: errors.length === 0,
    slug,
    has_contract: true,
    runtime,
    integrity,
    checkReport,
    errors,
    warnings
  };
}

function formatContractIntegrityGateError(result, stageName = null) {
  const header = stageName
    ? `[Harness Contract Gate BLOCKED] Cannot complete @${stageName} for "${result.slug}".`
    : `[Harness Contract Gate BLOCKED] Feature "${result.slug}" cannot close.`;
  const lines = [header];
  for (const err of result.errors || []) {
    lines.push(`- ${err.code}: ${err.message}`);
  }
  if (result.runtime && result.runtime.signals && result.runtime.signals.length) {
    lines.push(`Runtime signals: ${result.runtime.signals.join(', ')}`);
  }
  lines.push(`Run: aioson harness:check . --slug=${result.slug} --json`);
  return lines.join('\n');
}

module.exports = {
  evaluateContractIntegrityGate,
  formatContractIntegrityGateError,
  gitChangedFiles,
  progressCompletedSteps
};
