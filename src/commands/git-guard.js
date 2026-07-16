'use strict';

/**
 * aioson git:guard — inspect staged files before commit
 *
 * Usage:
 *   aioson git:guard .
 *   aioson git:guard . --json
 *   aioson git:guard . --allow-warnings --json
 *   aioson git:guard . --install-hook
 *   aioson git:guard . --uninstall-hook
 */

const path = require('node:path');
const fs = require('node:fs');
const {
  inspectStagedChanges,
  installPreCommitHook,
  uninstallPreCommitHook
} = require('../lib/git-commit-guard');

/**
 * REQ-20 (loop-guardrails, should-have): mescla `forbidden_files` do contrato
 * ATIVO (progress `in_progress`/`human_gate` mais recente) na verificação do
 * guard em tempo de execução — camada 2 do scope guard no pre-commit.
 * Best-effort: nunca quebra o guard; contrato inválido é ignorado (o preflight
 * do self:loop já bloqueia o loop nesse caso). Paths `.aioson/**` ficam fora
 * (estado do framework precisa ser commitável).
 *
 * C-03 (QA 2026-06-09): nesta camada aplicam-se apenas os globs DECLARADOS no
 * contrato. Os defaults não-removíveis (lockfiles, node_modules, .env*, ...)
 * existem para conter o LOOP do agente; no pre-commit pegariam mudanças
 * humanas legítimas (ex.: package-lock.json após `npm install`). Segredos
 * (.env*, *.pem, *.key, secrets/**) continuam bloqueados pela policy baseline
 * do próprio git-guard.
 */
const { findActiveContract } = require('../harness/active-contract');

function applyActiveContractPolicy(targetDir, result) {
  const active = findActiveContract(targetDir);
  if (!active) return null;
  const { validateContract } = require('../harness/contract-schema');
  const { matchGlob, matchAny } = require('../harness/glob-match');
  const contract = JSON.parse(fs.readFileSync(active.contractPath, 'utf8'));
  if (!validateContract(contract).ok) return null;
  const declaredForbidden = Array.isArray(contract.forbidden_files) ? contract.forbidden_files : [];
  if (!declaredForbidden.length) return { slug: active.slug, findings: 0 };

  let added = 0;
  for (const file of result.files) {
    if (matchGlob('.aioson/**', file.path)) continue;
    const matched = matchAny(declaredForbidden, file.path);
    if (!matched) continue;
    const finding = {
      type: 'path',
      severity: 'error',
      id: 'contract_forbidden_file',
      path: file.path,
      reason: `matches forbidden glob "${matched}" from active harness contract "${active.slug}"`,
      line: null
    };
    file.findings.push(finding);
    result.errors.push(finding);
    added += 1;
  }
  if (added > 0) {
    result.ok = false;
    result.summary.errorCount = result.errors.length;
  }
  return { slug: active.slug, findings: added };
}

function formatFinding(prefix, finding) {
  const line = finding.line ? `:${finding.line}` : '';
  return `${prefix} ${finding.path}${line} — ${finding.reason} [${finding.id}]`;
}

async function runGitGuard({ args, options = {}, logger }) {
  const targetDir = path.resolve(process.cwd(), args[0] || '.');
  const allowWarnings = Boolean(options['allow-warnings'] || options.allowWarnings);
  const installHook = Boolean(options['install-hook'] || options.installHook);
  const uninstallHook = Boolean(options['uninstall-hook'] || options.uninstallHook || options['remove-hook'] || options.removeHook);

  if (installHook && uninstallHook) {
    process.exitCode = 1;
    const failure = {
      ok: false,
      error: 'git_guard_invalid_options',
      message: 'Use either --install-hook or --uninstall-hook, not both.',
      projectDir: targetDir
    };
    if (!options.json) logger.error(failure.message);
    return failure;
  }

  if (installHook || uninstallHook) {
    let hookResult;
    try {
      hookResult = installHook
        ? await installPreCommitHook(targetDir, options)
        : await uninstallPreCommitHook(targetDir, options);
    } catch (error) {
      process.exitCode = 1;
      const failure = {
        ok: false,
        error: 'git_guard_hook_failed',
        message: error.message,
        projectDir: targetDir
      };
      if (!options.json) logger.error(`Commit hook operation failed: ${error.message}`);
      return failure;
    }

    if (!hookResult.ok) process.exitCode = 1;
    if (options.json) return hookResult;

    logger.log('');
    logger.log(`Commit hook — ${hookResult.gitRoot}`);
    if (!hookResult.ok) {
      logger.error(hookResult.message);
      return hookResult;
    }

    if (installHook) {
      logger.log(hookResult.dryRun ? 'Pre-commit hook dry-run complete.' : 'Pre-commit hook installed.');
      logger.log(`Hook path: ${hookResult.hookPath}`);
      if (hookResult.backedUpExistingHook) {
        logger.log(`Existing hook backed up to: ${hookResult.backupPath}`);
      }
      if (hookResult.chainedBackupHook) {
        logger.log('AIOSON will chain the backed-up hook after the guard passes.');
      }
      return hookResult;
    }

    if (hookResult.removed || hookResult.dryRun) {
      logger.log(hookResult.dryRun ? 'Pre-commit hook uninstall dry-run complete.' : 'Pre-commit hook removed.');
      if (hookResult.restoredBackup) {
        logger.log(`Restored previous hook from: ${hookResult.backupPath}`);
      }
      return hookResult;
    }

    logger.log(hookResult.message);
    return hookResult;
  }

  let result;
  try {
    result = await inspectStagedChanges(targetDir, {
      allowWarnings,
      config: options.config
    });
  } catch (error) {
    process.exitCode = 1;
    const failure = {
      ok: false,
      error: 'git_guard_failed',
      message: error.message,
      projectDir: targetDir
    };
    if (!options.json) logger.error(`Commit guard failed: ${error.message}`);
    return failure;
  }

  let contractPolicy = null;
  try {
    contractPolicy = applyActiveContractPolicy(targetDir, result);
  } catch { /* best-effort: contrato ilegível nunca quebra o guard */ }

  const output = {
    ok: result.ok,
    projectDir: targetDir,
    contractPolicy,
    gitRoot: result.gitRoot,
    strict: result.strict,
    policy: result.policy,
    stagedFiles: result.stagedFiles,
    files: result.files,
    errors: result.errors,
    warnings: result.warnings,
    suppressed: result.suppressed,
    suggestedCommands: result.suggestedCommands,
    summary: result.summary
  };

  if (!result.ok) process.exitCode = 1;

  if (options.json) return output;

  logger.log('');
  logger.log(`Commit guard — ${result.gitRoot}`);
  logger.log(`Staged files: ${result.summary.stagedCount}`);
  logger.log(`Policy: ${result.policy.loaded ? result.policy.path : 'default built-in policy (no project config found)'}`);
  if (result.summary.suppressedCount > 0) {
    logger.log(`Contextual suppressions: ${result.summary.suppressedCount} (available in --json output)`);
  }

  if (result.summary.stagedCount === 0) {
    logger.error('No staged files found. Stage explicit files before committing.');
    return output;
  }

  if (result.ok) {
    logger.log('Commit guard passed.');
    if (result.warnings.length > 0) {
      logger.log('Warnings accepted by explicit trusted/allow-warnings mode:');
      for (const finding of result.warnings) {
        logger.log(formatFinding('  [WARN] ', finding));
      }
    }
    return output;
  }

  logger.error('Commit guard blocked this commit.');
  if (result.errors.length > 0) {
    logger.error('Errors:');
    for (const finding of result.errors) {
      logger.error(formatFinding('  [ERROR]', finding));
    }
  }
  if (result.warnings.length > 0) {
    logger.error('Warnings:');
    for (const finding of result.warnings) {
      logger.error(formatFinding('  [WARN] ', finding));
    }
  }
  if (result.suggestedCommands.length > 0) {
    logger.error('Suggested next commands:');
    for (const command of result.suggestedCommands) {
      logger.error(`  ${command}`);
    }
  }

  return output;
}

module.exports = { runGitGuard };
