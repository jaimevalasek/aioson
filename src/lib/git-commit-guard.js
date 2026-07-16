'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { collectStagedSecretFindings } = require('./security/staged-secret-detector');

const DEFAULT_CONFIG_REL_PATH = '.aioson/git-guard.json';
const MANAGED_HOOK_MARKER = '# aioson-git-guard-hook';
const BACKUP_HOOK_GIT_PATH = 'hooks/pre-commit.aioson-backup';
const DEFAULT_POLICY = Object.freeze({
  version: 1,
  description: '',
  allowPaths: [],
  contentAllowPaths: [],
  contentAllowRules: [],
  blockPaths: [],
  allowExtensions: [],
  blockExtensions: []
});

const BLOCKED_PATH_RULES = [
  {
    id: 'dependency_dir',
    reason: 'dependency/vendor directory should not be committed',
    test: (relPath) => /(^|\/)(node_modules|vendor)(\/|$)/i.test(relPath)
  },
  {
    id: 'build_output',
    reason: 'generated build output should not be committed',
    test: (relPath) => /(^|\/)(dist|build|coverage|\.next|\.nuxt|\.svelte-kit|\.turbo|\.cache|\.parcel-cache|tmp|temp)(\/|$)/i.test(relPath)
  },
  {
    id: 'ide_config',
    reason: 'IDE/editor local config — usually contains machine-specific paths',
    test: (relPath) => /(^|\/)(\.idea|\.vscode|\.fleet|\.cursor|\.zed|\.vs)(\/|$)/i.test(relPath)
  },
  {
    id: 'lang_cache',
    reason: 'language tool cache should not be committed',
    test: (relPath) => /(^|\/)(__pycache__|\.pytest_cache|\.mypy_cache|\.ruff_cache|\.tox|\.venv|\.gradle|\.mvn\/wrapper|target|\.terraform|\.serverless)(\/|$)/i.test(relPath)
  },
  {
    id: 'dotnet_build',
    reason: '.NET build output should not be committed',
    test: (relPath) => /(^|\/)(bin|obj)\/(Debug|Release)(\/|$)/i.test(relPath)
  },
  {
    id: 'session_artifact',
    reason: 'runtime/session artifact should not be committed',
    test: (relPath) => /(^|\/)(aioson-logs|chat-sessions)(\/|$)/i.test(relPath)
      || /(^|\/)\.aioson\/(?:runtime|output|media)(\/|$)/i.test(relPath)
  },
  {
    id: 'aioson_backup',
    reason: 'AIOSON backup artifact should not be committed',
    test: (relPath) => /(^|\/)\.aioson\/backups(\/|$)/i.test(relPath)
  },
  {
    id: 'env_file',
    reason: 'environment file may contain secrets',
    test: (relPath) => {
      const base = path.posix.basename(relPath).toLowerCase();
      if (!base.startsWith('.env')) return false;
      return !['.env.example', '.env.sample', '.env.template', '.env.dist'].includes(base);
    }
  },
  {
    id: 'secret_file',
    reason: 'secret or credential file should not be committed',
    test: (relPath) => /\.(pem|key|p12|pfx|p8|keystore|mobileprovision|kdbx)$/i.test(relPath)
  },
  {
    id: 'log_file',
    reason: 'log/debug artifact should not be committed',
    test: (relPath) => {
      const base = path.posix.basename(relPath).toLowerCase();
      return base === '.ds_store'
        || base === 'npm-debug.log'
        || base === 'yarn-error.log'
        || base === 'pnpm-debug.log'
        || /\.log$/i.test(base);
    }
  }
];

const WARNING_PATH_RULES = [
  {
    id: 'backup_suffix',
    reason: 'backup or temporary file staged',
    test: (relPath) => /\.(bak|tmp|orig|rej|swp|swo|old|save)$/i.test(relPath)
  },
  {
    id: 'scratch_name',
    reason: 'draft/scratch-style file name staged',
    test: (relPath) => {
      const base = path.posix.basename(relPath);
      return /(^|[._-])(draft|scratch|wip|junk|trash|temp|tmp)([._-]|$)/i.test(base);
    }
  },
  {
    id: 'local_database',
    reason: 'local database or dump file staged',
    test: (relPath) => /\.(sqlite|sqlite3|db|dump)$/i.test(relPath)
  }
];

function runGit(gitRoot, args, options = {}) {
  return execFileSync('git', args, {
    cwd: gitRoot,
    encoding: options.encoding || 'utf8',
    maxBuffer: options.maxBuffer || 8 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

function normalizeRelPath(relPath) {
  return String(relPath || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

function resolveGitRoot(projectDir) {
  return String(runGit(projectDir, ['rev-parse', '--show-toplevel'])).trim();
}

function resolveGitPath(gitRoot, gitPath) {
  const resolved = String(runGit(gitRoot, ['rev-parse', '--git-path', gitPath])).trim();
  return path.isAbsolute(resolved) ? resolved : path.join(gitRoot, resolved);
}

function listStagedFiles(gitRoot) {
  const output = runGit(gitRoot, ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'], {
    encoding: 'buffer'
  });
  return String(output)
    .split('\u0000')
    .map((entry) => normalizeRelPath(entry.trim()))
    .filter(Boolean);
}

function readStagedBlob(gitRoot, relPath) {
  return runGit(gitRoot, ['show', `:${relPath}`], {
    encoding: 'buffer',
    maxBuffer: 16 * 1024 * 1024
  });
}

function isBinaryBuffer(buffer) {
  for (let i = 0; i < buffer.length; i += 1) {
    if (buffer[i] === 0) return true;
  }
  return false;
}

function escapeRegExp(value) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

function globToRegExp(pattern) {
  const normalized = normalizeRelPath(pattern).replace(/^\/+/, '');
  let source = '';

  for (let i = 0; i < normalized.length; i += 1) {
    const char = normalized[i];
    const next = normalized[i + 1];

    if (char === '*') {
      if (next === '*') {
        source += '.*';
        i += 1;
      } else {
        source += '[^/]*';
      }
      continue;
    }

    if (char === '?') {
      source += '[^/]';
      continue;
    }

    source += escapeRegExp(char);
  }

  return new RegExp(`^${source}$`, 'i');
}

function matchesAnyPattern(relPath, patterns) {
  return patterns.some((pattern) => globToRegExp(pattern).test(relPath));
}

/**
 * Path-only rule evaluation for a single file. Used by interactive pickers
 * (commit:prepare) to render risk annotations BEFORE the file is staged,
 * so users see "node_modules/foo will be blocked" instead of staging blind.
 *
 * Honors `allowPaths` from project config: paths explicitly allowed are
 * never reported as blocked or warned, even if they match a default rule.
 *
 * Returns:
 *   { blocked: [{ id, reason }, ...], warned: [{ id, reason }, ...] }
 *
 * Both arrays may be empty for safe paths. Content scanning is NOT performed
 * here — that requires reading the staged blob and is the job of
 * inspectStagedChanges() at commit time.
 */
function evaluatePathRules(relPath, config = {}) {
  const normalized = normalizeRelPath(relPath);
  const allowPaths = Array.isArray(config.allowPaths) ? config.allowPaths : [];
  if (allowPaths.length > 0 && matchesAnyPattern(normalized, allowPaths)) {
    return { blocked: [], warned: [] };
  }

  const extraBlock = Array.isArray(config.blockPaths) ? config.blockPaths : [];
  const blockExt = Array.isArray(config.blockExtensions) ? config.blockExtensions : [];

  const blocked = [];
  for (const rule of BLOCKED_PATH_RULES) {
    if (rule.test(normalized)) blocked.push({ id: rule.id, reason: rule.reason });
  }
  if (extraBlock.length > 0 && matchesAnyPattern(normalized, extraBlock)) {
    blocked.push({ id: 'project_block_path', reason: 'matched project blockPaths pattern' });
  }
  if (blockExt.length > 0 && matchesAnyExtension(normalized, blockExt)) {
    blocked.push({ id: 'project_block_extension', reason: 'matched project blockExtensions' });
  }

  const warned = [];
  for (const rule of WARNING_PATH_RULES) {
    if (rule.test(normalized)) warned.push({ id: rule.id, reason: rule.reason });
  }

  return { blocked, warned };
}

function normalizeExtension(value) {
  const ext = String(value || '').trim().toLowerCase();
  if (!ext) return '';
  return ext.startsWith('.') ? ext : `.${ext}`;
}

function matchesAnyExtension(relPath, extensions) {
  const lowered = relPath.toLowerCase();
  return extensions.some((ext) => lowered.endsWith(ext));
}

function validateStringArray(data, key) {
  if (data[key] == null) return [];
  if (!Array.isArray(data[key])) {
    throw new Error(`Invalid git guard config: "${key}" must be an array of strings`);
  }
  return data[key].map((item, index) => {
    if (typeof item !== 'string' || item.trim().length === 0) {
      throw new Error(`Invalid git guard config: "${key}[${index}]" must be a non-empty string`);
    }
    return key.endsWith('Extensions')
      ? normalizeExtension(item)
      : normalizeRelPath(item).replace(/^\/+/, '');
  });
}

function validateContentAllowRules(data) {
  if (data.contentAllowRules == null) return [];
  if (!Array.isArray(data.contentAllowRules)) {
    throw new Error('Invalid git guard config: "contentAllowRules" must be an array');
  }

  return data.contentAllowRules.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`Invalid git guard config: "contentAllowRules[${index}]" must be an object`);
    }
    if (typeof entry.path !== 'string' || entry.path.trim().length === 0) {
      throw new Error(`Invalid git guard config: "contentAllowRules[${index}].path" must be a non-empty string`);
    }
    if (!Array.isArray(entry.rules) || entry.rules.length === 0) {
      throw new Error(`Invalid git guard config: "contentAllowRules[${index}].rules" must be a non-empty array of strings`);
    }
    const rules = entry.rules.map((rule, ruleIndex) => {
      if (typeof rule !== 'string' || rule.trim().length === 0) {
        throw new Error(`Invalid git guard config: "contentAllowRules[${index}].rules[${ruleIndex}]" must be a non-empty string`);
      }
      return rule.trim();
    });
    if (typeof entry.reason !== 'string' || entry.reason.trim().length === 0) {
      throw new Error(`Invalid git guard config: "contentAllowRules[${index}].reason" must be a non-empty string`);
    }
    return {
      path: normalizeRelPath(entry.path).replace(/^\/+/, ''),
      rules: [...new Set(rules)],
      reason: entry.reason.trim()
    };
  });
}

function resolveGuardConfigPath(projectDir, candidatePath = null) {
  if (!candidatePath) return path.join(projectDir, DEFAULT_CONFIG_REL_PATH);
  return path.isAbsolute(candidatePath)
    ? candidatePath
    : path.resolve(projectDir, String(candidatePath));
}

async function loadGuardConfig(projectDir, options = {}) {
  const configPath = resolveGuardConfigPath(projectDir, options.configPath || options.config);

  let raw;
  try {
    raw = await fs.readFile(configPath, 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return defaultGuardConfigState(configPath, 'working_tree');
    }
    throw error;
  }

  return {
    path: configPath,
    loaded: true,
    source: 'working_tree',
    config: parseGuardConfig(raw, configPath)
  };
}

function parseGuardConfig(raw, configPath) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid git guard config at ${configPath}: ${error.message}`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Invalid git guard config at ${configPath}: root value must be an object`);
  }

  const version = parsed.version == null ? 1 : Number(parsed.version);
  if (!Number.isInteger(version) || version !== 1) {
    throw new Error(`Invalid git guard config at ${configPath}: unsupported version "${parsed.version}"`);
  }

  if (parsed.description != null && typeof parsed.description !== 'string') {
    throw new Error(`Invalid git guard config at ${configPath}: "description" must be a string`);
  }

  return {
    version,
    description: parsed.description || '',
    allowPaths: validateStringArray(parsed, 'allowPaths'),
    contentAllowPaths: validateStringArray(parsed, 'contentAllowPaths'),
    contentAllowRules: validateContentAllowRules(parsed),
    blockPaths: validateStringArray(parsed, 'blockPaths'),
    allowExtensions: validateStringArray(parsed, 'allowExtensions'),
    blockExtensions: validateStringArray(parsed, 'blockExtensions')
  };
}

function resolveConfigIndexPath(gitRoot, configPath) {
  const relativePath = path.relative(gitRoot, configPath);
  if (
    relativePath === ''
    || relativePath === '..'
    || relativePath.startsWith(`..${path.sep}`)
    || path.isAbsolute(relativePath)
  ) {
    throw new Error('Git guard config must be inside the Git worktree.');
  }
  return normalizeRelPath(relativePath);
}

function defaultGuardConfigState(configPath, source) {
  return {
    path: configPath,
    loaded: false,
    source,
    config: { ...DEFAULT_POLICY }
  };
}

async function loadStagedGuardConfig(gitRoot, options = {}) {
  const configPath = resolveGuardConfigPath(gitRoot, options.configPath || options.config);
  const indexPath = resolveConfigIndexPath(gitRoot, configPath);

  let raw;
  try {
    raw = readStagedBlob(gitRoot, indexPath).toString('utf8');
  } catch {
    return defaultGuardConfigState(configPath, 'index');
  }

  return {
    path: configPath,
    loaded: true,
    source: 'index',
    config: parseGuardConfig(raw, configPath)
  };
}

function isAllowlistedPath(relPath, policy) {
  return matchesAnyPattern(relPath, policy.allowPaths) || matchesAnyExtension(relPath, policy.allowExtensions);
}

function isContentAllowlistedPath(relPath, policy) {
  return matchesAnyPattern(relPath, policy.contentAllowPaths || []);
}

function findContentRuleAllowance(relPath, finding, policy) {
  return (policy.contentAllowRules || []).find((entry) => (
    globToRegExp(entry.path).test(relPath) && entry.rules.includes(finding.id)
  )) || null;
}

function suppressFinding(finding, suppressionReason) {
  return {
    ...finding,
    severity: 'notice',
    disposition: 'suppressed',
    suppressionReason
  };
}

function collectPathFindings(relPath, rules, severity) {
  const findings = [];
  for (const rule of rules) {
    if (!rule.test(relPath)) continue;
    findings.push({
      type: 'path',
      severity,
      id: rule.id,
      path: relPath,
      reason: rule.reason,
      line: null
    });
  }
  return findings;
}

function collectConfiguredPathFindings(relPath, policy) {
  const findings = [];

  if (matchesAnyPattern(relPath, policy.blockPaths)) {
    findings.push({
      type: 'path',
      severity: 'error',
      id: 'config_block_path',
      path: relPath,
      reason: 'project git guard policy blocks this path',
      line: null
    });
  }

  if (matchesAnyExtension(relPath, policy.blockExtensions)) {
    findings.push({
      type: 'path',
      severity: 'error',
      id: 'config_block_extension',
      path: relPath,
      reason: 'project git guard policy blocks this file extension',
      line: null
    });
  }

  return findings;
}

function buildSuggestedCommands(findings) {
  const paths = [...new Set(findings.map((item) => item.path).filter(Boolean))];
  if (paths.length === 0) return [];
  return paths.map((relPath) => `git restore --staged -- "${relPath}"`);
}

function summarizePolicy(policyState) {
  return {
    path: policyState.path,
    loaded: policyState.loaded,
    source: policyState.source,
    version: policyState.config.version,
    allowPathsCount: policyState.config.allowPaths.length,
    blockPathsCount: policyState.config.blockPaths.length,
    contentAllowPathsCount: policyState.config.contentAllowPaths.length,
    contentAllowRulesCount: policyState.config.contentAllowRules.length,
    allowExtensionsCount: policyState.config.allowExtensions.length,
    blockExtensionsCount: policyState.config.blockExtensions.length
  };
}

async function inspectStagedChanges(projectDir, options = {}) {
  const gitRoot = resolveGitRoot(projectDir);
  // Scan and policy must come from the same Git index snapshot. A permissive
  // working-tree config cannot authorize a secret in a staged source file.
  const policyState = await loadStagedGuardConfig(gitRoot, options);
  const stagedFiles = listStagedFiles(gitRoot);
  const allowWarnings = Boolean(options.allowWarnings);
  const findings = [];
  const suppressed = [];
  const files = [];

  for (const relPath of stagedFiles) {
    const allowlisted = isAllowlistedPath(relPath, policyState.config);
    const fileFindings = [
      ...(allowlisted ? [] : collectPathFindings(relPath, BLOCKED_PATH_RULES, 'error')),
      ...(allowlisted ? [] : collectPathFindings(relPath, WARNING_PATH_RULES, 'warning')),
      ...collectConfiguredPathFindings(relPath, policyState.config)
    ];
    const fileSuppressed = [];

    let size = 0;
    let binary = false;
    try {
      const buffer = readStagedBlob(gitRoot, relPath);
      size = buffer.length;
      binary = isBinaryBuffer(buffer);
      if (!binary) {
        if (isContentAllowlistedPath(relPath, policyState.config)) {
          fileSuppressed.push({
            type: 'content',
            severity: 'notice',
            confidence: 'policy',
            id: 'legacy_content_allow_path',
            path: relPath,
            reason: 'content scanning bypassed by legacy contentAllowPaths policy',
            line: null,
            disposition: 'suppressed',
            suppressionReason: 'legacy whole-file content allowlist'
          });
        } else {
          const detected = collectStagedSecretFindings(relPath, buffer.toString('utf8'));
          fileSuppressed.push(...detected.suppressed);
          for (const finding of detected.findings) {
            const allowance = findContentRuleAllowance(relPath, finding, policyState.config);
            if (allowance) {
              fileSuppressed.push(suppressFinding(finding, `project policy: ${allowance.reason}`));
            } else {
              fileFindings.push(finding);
            }
          }
        }
      }
    } catch (error) {
      fileFindings.push({
        type: 'content',
        severity: 'error',
        id: 'staged_read_failed',
        path: relPath,
        reason: `failed to inspect staged content: ${error.message}`,
        line: null
      });
    }

    findings.push(...fileFindings);
    suppressed.push(...fileSuppressed);
    files.push({
      path: relPath,
      size,
      binary,
      allowlisted,
      findings: fileFindings,
      suppressed: fileSuppressed
    });
  }

  const errors = findings.filter((item) => item.severity === 'error');
  const warnings = findings.filter((item) => item.severity === 'warning');
  const ok = stagedFiles.length > 0 && errors.length === 0 && (allowWarnings || warnings.length === 0);

  return {
    ok,
    gitRoot,
    stagedFiles,
    strict: !allowWarnings,
    policy: summarizePolicy(policyState),
    files,
    errors,
    warnings,
    suppressed,
    suggestedCommands: buildSuggestedCommands([...errors, ...warnings]),
    summary: {
      stagedCount: stagedFiles.length,
      errorCount: errors.length,
      warningCount: warnings.length,
      suppressedCount: suppressed.length
    }
  };
}

function isManagedHook(content) {
  return String(content || '').includes(MANAGED_HOOK_MARKER);
}

function buildPreCommitHookScript({ backupPath = '' } = {}) {
  const backupLiteral = backupPath ? JSON.stringify(backupPath) : '""';

  return `#!/bin/sh
${MANAGED_HOOK_MARKER}
# Managed by: aioson git:guard --install-hook

set -eu

GIT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
HOOK_BACKUP=${backupLiteral}

run_guard() {
  if command -v aioson >/dev/null 2>&1; then
    aioson git:guard "$GIT_ROOT"
    return $?
  fi

  if [ -x "$GIT_ROOT/node_modules/.bin/aioson" ]; then
    "$GIT_ROOT/node_modules/.bin/aioson" git:guard "$GIT_ROOT"
    return $?
  fi

  if [ -f "$GIT_ROOT/bin/aioson.js" ]; then
    node "$GIT_ROOT/bin/aioson.js" git:guard "$GIT_ROOT"
    return $?
  fi

  echo "AIOSON pre-commit hook blocked this commit: aioson CLI was not found." >&2
  echo "Install AIOSON CLI or remove the hook with 'aioson git:guard <project> --uninstall-hook'." >&2
  return 1
}

run_guard

if [ -n "$HOOK_BACKUP" ] && [ -x "$HOOK_BACKUP" ]; then
  "$HOOK_BACKUP" "$@"
fi
`;
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function installPreCommitHook(projectDir, options = {}) {
  const gitRoot = resolveGitRoot(projectDir);
  const hookPath = resolveGitPath(gitRoot, 'hooks/pre-commit');
  const backupPath = resolveGitPath(gitRoot, BACKUP_HOOK_GIT_PATH);
  const dryRun = Boolean(options.dryRun || options['dry-run']);
  const force = Boolean(options.force);

  let existingContent = null;
  try {
    existingContent = await fs.readFile(hookPath, 'utf8');
  } catch (error) {
    if (!error || error.code !== 'ENOENT') throw error;
  }

  const hookExists = typeof existingContent === 'string';
  const managedExistingHook = isManagedHook(existingContent);
  const backupExists = await exists(backupPath);

  if (hookExists && !managedExistingHook && !force) {
    return {
      ok: false,
      error: 'hook_exists',
      message: 'A non-AIOSON pre-commit hook already exists. Re-run with --force to back it up and chain it.',
      gitRoot,
      hookPath,
      backupPath
    };
  }

  if (hookExists && !managedExistingHook && force && backupExists) {
    return {
      ok: false,
      error: 'hook_backup_exists',
      message: 'Cannot back up the existing pre-commit hook because an AIOSON backup hook already exists.',
      gitRoot,
      hookPath,
      backupPath
    };
  }

  const shouldChainBackup = backupExists || (hookExists && !managedExistingHook && force);
  const script = buildPreCommitHookScript({
    backupPath: shouldChainBackup ? backupPath : ''
  });

  if (!dryRun) {
    await fs.mkdir(path.dirname(hookPath), { recursive: true });
    if (hookExists && !managedExistingHook && force) {
      await fs.rename(hookPath, backupPath);
    }
    await fs.writeFile(hookPath, script, 'utf8');
    await fs.chmod(hookPath, 0o755);
  }

  return {
    ok: true,
    gitRoot,
    hookPath,
    backupPath,
    installed: !dryRun,
    dryRun,
    replacedExistingHook: hookExists,
    backedUpExistingHook: hookExists && !managedExistingHook && force,
    chainedBackupHook: shouldChainBackup
  };
}

async function uninstallPreCommitHook(projectDir, options = {}) {
  const gitRoot = resolveGitRoot(projectDir);
  const hookPath = resolveGitPath(gitRoot, 'hooks/pre-commit');
  const backupPath = resolveGitPath(gitRoot, BACKUP_HOOK_GIT_PATH);
  const dryRun = Boolean(options.dryRun || options['dry-run']);

  let hookContent = null;
  try {
    hookContent = await fs.readFile(hookPath, 'utf8');
  } catch (error) {
    if (!error || error.code !== 'ENOENT') throw error;
  }

  if (hookContent == null) {
    return {
      ok: true,
      gitRoot,
      hookPath,
      backupPath,
      removed: false,
      restoredBackup: false,
      message: 'No pre-commit hook is installed.'
    };
  }

  if (!isManagedHook(hookContent)) {
    return {
      ok: false,
      error: 'hook_not_managed',
      message: 'The current pre-commit hook is not managed by AIOSON.',
      gitRoot,
      hookPath,
      backupPath
    };
  }

  const backupExists = await exists(backupPath);
  if (!dryRun) {
    await fs.unlink(hookPath);
    if (backupExists) {
      await fs.rename(backupPath, hookPath);
      await fs.chmod(hookPath, 0o755);
    }
  }

  return {
    ok: true,
    gitRoot,
    hookPath,
    backupPath,
    removed: !dryRun,
    restoredBackup: backupExists,
    dryRun
  };
}

module.exports = {
  inspectStagedChanges,
  resolveGitRoot,
  resolveGitPath,
  resolveGuardConfigPath,
  loadGuardConfig,
  loadStagedGuardConfig,
  listStagedFiles,
  readStagedBlob,
  normalizeRelPath,
  installPreCommitHook,
  uninstallPreCommitHook,
  buildPreCommitHookScript,
  isManagedHook,
  BLOCKED_PATH_RULES,
  WARNING_PATH_RULES,
  evaluatePathRules,
  DEFAULT_CONFIG_REL_PATH,
  BACKUP_HOOK_GIT_PATH,
  MANAGED_HOOK_MARKER
};
