'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const DEFAULT_CONFIG_REL_PATH = '.aioson/git-guard.json';
const MANAGED_HOOK_MARKER = '# aioson-git-guard-hook';
const BACKUP_HOOK_GIT_PATH = 'hooks/pre-commit.aioson-backup';
const DEFAULT_POLICY = Object.freeze({
  version: 1,
  description: '',
  allowPaths: [],
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
    id: 'session_artifact',
    reason: 'runtime/session artifact should not be committed',
    test: (relPath) => /(^|\/)(aioson-logs|output|media)(\/|$)/i.test(relPath)
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

const CONTENT_RULES = [
  {
    id: 'private_key_block',
    severity: 'error',
    reason: 'private key material detected',
    pattern: /-----BEGIN(?: [A-Z0-9]+)? PRIVATE KEY-----/m
  },
  {
    id: 'aws_access_key',
    severity: 'error',
    reason: 'AWS access key detected',
    pattern: /\bAKIA[0-9A-Z]{16}\b/
  },
  {
    id: 'github_token',
    severity: 'error',
    reason: 'GitHub token detected',
    pattern: /\b(?:github_pat_[A-Za-z0-9_]{20,}|ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|ghu_[A-Za-z0-9]{20,}|ghs_[A-Za-z0-9]{20,}|ghr_[A-Za-z0-9]{20,})\b/
  },
  {
    id: 'slack_token',
    severity: 'error',
    reason: 'Slack token detected',
    pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/
  },
  {
    id: 'google_api_key',
    severity: 'error',
    reason: 'Google API key detected',
    pattern: /\bAIza[0-9A-Za-z\-_]{35}\b/
  },
  {
    id: 'stripe_secret',
    severity: 'error',
    reason: 'Stripe secret key detected',
    pattern: /\bsk_(?:live|test)_[0-9A-Za-z]{16,}\b/
  },
  {
    id: 'openai_secret',
    severity: 'error',
    reason: 'OpenAI-style secret detected',
    pattern: /\bsk-[A-Za-z0-9]{20,}\b/
  },
  {
    id: 'npm_token',
    severity: 'error',
    reason: 'npm token detected',
    pattern: /\bnpm_[A-Za-z0-9]{20,}\b/
  }
];

// Detects literal secret assignments. Quotes are required so that function
// calls (e.g. `const token = requireToken(config)`) are not flagged: only the
// value inside the matched quote pair counts toward the 8-char minimum.
const GENERIC_SECRET_ASSIGNMENT = /\b([A-Z0-9_]*(?:SECRET|TOKEN|API_KEY|ACCESS_KEY|PRIVATE_KEY|PASSWORD|PASSWD|CLIENT_SECRET)[A-Z0-9_]*)\b\s*[:=]\s*(['"`])([^'"`\n\r]{8,})\2/gi;
const PLACEHOLDER_VALUE = /^(?:example|sample|placeholder|dummy|changeme|change-me|replace[-_]?me|your[_-]?value|your[_-]?token|test|local|localhost|xxx+)$/i;

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

function findLineFromIndex(text, index) {
  if (index == null || index < 0) return null;
  return text.slice(0, index).split('\n').length;
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
      return {
        path: configPath,
        loaded: false,
        config: { ...DEFAULT_POLICY }
      };
    }
    throw error;
  }

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
    path: configPath,
    loaded: true,
    config: {
      version,
      description: parsed.description || '',
      allowPaths: validateStringArray(parsed, 'allowPaths'),
      contentAllowPaths: validateStringArray(parsed, 'contentAllowPaths'),
      blockPaths: validateStringArray(parsed, 'blockPaths'),
      allowExtensions: validateStringArray(parsed, 'allowExtensions'),
      blockExtensions: validateStringArray(parsed, 'blockExtensions')
    }
  };
}

function isAllowlistedPath(relPath, policy) {
  return matchesAnyPattern(relPath, policy.allowPaths) || matchesAnyExtension(relPath, policy.allowExtensions);
}

function isContentAllowlistedPath(relPath, policy) {
  return matchesAnyPattern(relPath, policy.contentAllowPaths || []);
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

function collectContentFindings(relPath, text) {
  const findings = [];

  for (const rule of CONTENT_RULES) {
    const match = text.match(rule.pattern);
    if (!match || match.index == null) continue;
    findings.push({
      type: 'content',
      severity: rule.severity,
      id: rule.id,
      path: relPath,
      reason: rule.reason,
      line: findLineFromIndex(text, match.index)
    });
  }

  let genericMatch;
  GENERIC_SECRET_ASSIGNMENT.lastIndex = 0;
  while ((genericMatch = GENERIC_SECRET_ASSIGNMENT.exec(text)) !== null) {
    const variableName = String(genericMatch[1] || '');
    const value = String(genericMatch[3] || '');
    const lowered = value.toLowerCase();
    if (PLACEHOLDER_VALUE.test(value)) continue;
    if (/(example|sample|dummy|placeholder|changeme|localhost|local[_-]?dev)/i.test(lowered)) continue;
    if (/(public|publishable)/i.test(variableName)) continue;
    findings.push({
      type: 'content',
      severity: 'warning',
      id: 'generic_secret_assignment',
      path: relPath,
      reason: `possible secret assignment detected for ${variableName}`,
      line: findLineFromIndex(text, genericMatch.index)
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
    version: policyState.config.version,
    allowPathsCount: policyState.config.allowPaths.length,
    blockPathsCount: policyState.config.blockPaths.length,
    allowExtensionsCount: policyState.config.allowExtensions.length,
    blockExtensionsCount: policyState.config.blockExtensions.length
  };
}

async function inspectStagedChanges(projectDir, options = {}) {
  const gitRoot = resolveGitRoot(projectDir);
  const policyState = await loadGuardConfig(gitRoot, options);
  const stagedFiles = listStagedFiles(gitRoot);
  const allowWarnings = Boolean(options.allowWarnings);
  const findings = [];
  const files = [];

  for (const relPath of stagedFiles) {
    const allowlisted = isAllowlistedPath(relPath, policyState.config);
    const fileFindings = [
      ...(allowlisted ? [] : collectPathFindings(relPath, BLOCKED_PATH_RULES, 'error')),
      ...(allowlisted ? [] : collectPathFindings(relPath, WARNING_PATH_RULES, 'warning')),
      ...collectConfiguredPathFindings(relPath, policyState.config)
    ];

    let size = 0;
    let binary = false;
    try {
      const buffer = readStagedBlob(gitRoot, relPath);
      size = buffer.length;
      binary = isBinaryBuffer(buffer);
      if (!binary && !isContentAllowlistedPath(relPath, policyState.config)) {
        const text = buffer.toString('utf8');
        fileFindings.push(...collectContentFindings(relPath, text));
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
    files.push({
      path: relPath,
      size,
      binary,
      allowlisted,
      findings: fileFindings
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
    suggestedCommands: buildSuggestedCommands([...errors, ...warnings]),
    summary: {
      stagedCount: stagedFiles.length,
      errorCount: errors.length,
      warningCount: warnings.length
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
  listStagedFiles,
  readStagedBlob,
  normalizeRelPath,
  installPreCommitHook,
  uninstallPreCommitHook,
  buildPreCommitHookScript,
  isManagedHook,
  BLOCKED_PATH_RULES,
  WARNING_PATH_RULES,
  DEFAULT_CONFIG_REL_PATH,
  BACKUP_HOOK_GIT_PATH,
  MANAGED_HOOK_MARKER
};
