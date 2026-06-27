'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { MANAGED_FILES } = require('./constants');
const { getCliVersion, getGitBuildInfoSync } = require('./version');
const { exists, ensureDir, copyFileWithDir, nowStamp, toRelativeSafe } = require('./utils');
const { ensureProjectRuntime } = require('./execution-gateway');
const { shouldIncludeForProfile } = require('./install-profile');
const { generatePermissions } = require('./permissions-generator');
const { isConfigMergePath, mergeConfigFile } = require('./installer-config-merge');
const { isGatewayPointerPath, mergeGatewayPointer } = require('./gateway-pointer-merge');

const ROOT_DIR = path.join(__dirname, '..');
const TEMPLATE_DIR = path.join(ROOT_DIR, 'template');
const PROJECT_LOCAL_FILES = new Set([
  'aioson-models.json',
  '.aioson/context/design-doc.md',
  '.aioson/design-docs/code-reuse.md',
  '.aioson/design-docs/componentization.md',
  '.aioson/design-docs/file-size.md',
  '.aioson/design-docs/folder-structure.md',
  '.aioson/design-docs/naming.md',
  '.aioson/git-guard.json'
]);
// Baseline blockPaths merged into every project's git-guard.json on install and update.
// These are never removed — only added if missing. Project-specific entries are preserved.
const GIT_GUARD_BASELINE_BLOCK_PATHS = [
  'node_modules/**',
  'aioson-logs/**'
];

const GITIGNORE_POLICY_LINES = [
  '# AIOSON — keep shared project memory and tool contracts',
  '!AGENTS.md',
  '!CLAUDE.md',
  '!OPENCODE.md',
  '!.claude/',
  '!.claude/**',
  '!.aioson/',
  '!.aioson/**',
  '# AIOSON — managed framework files (do not commit)',
  '.aioson/config.md',
  '.aioson/locales/',
  '.aioson/skills/',
  '.aioson/schemas/',
  '.aioson/tasks/',
  '.aioson/templates/',
  '.aioson/advisors/',
  '.aioson/mcp/servers.md',
  '# AIOSON — user-installed skills (versioned with project)',
  '!.aioson/installed-skills/',
  '!.aioson/installed-skills/**',
  '# AIOSON — custom agents (versioned with project)',
  '!.aioson/my-agents/',
  '!.aioson/my-agents/**',
  '# AIOSON — local-only artifacts',
  'aioson-logs/',
  'aioson-models.json',
  '.aioson/backups/',
  '.aioson/cloud-imports/',
  '.aioson/runtime/',
  '.aioson/mcp/presets/',
  '.aioson/install.json',
  '.aioson/mcp/servers.local.json',
  '.aioson/profiler-reports/*',
  '!.aioson/profiler-reports/.gitkeep',
  '.claude/settings.local.json',
  '*:Zone.Identifier',
  '# AIOSON — shared agent scratch caches (local-only)',
  'researchs/',
  'squad-searches/'
];

async function detectExistingInstall(targetDir) {
  // Check multiple markers — config.md is gitignored (line 42) so a fresh
  // clone will not have it, but committed framework files like agents/dev.md
  // remain present. Any one is enough to confirm the install.
  const markers = [
    '.aioson/config.md',
    '.aioson/agents/dev.md',
    '.aioson/install.json'
  ];
  for (const marker of markers) {
    if (await exists(path.join(targetDir, marker))) return true;
  }
  return false;
}

async function ensureGitignoreEntry(targetDir, entry) {
  const gitignorePath = path.join(targetDir, '.gitignore');
  let content = '';
  if (await exists(gitignorePath)) {
    content = await fs.readFile(gitignorePath, 'utf8');
  }
  if (content.split('\n').some(line => line.trim() === entry)) return false;
  const separator = content.length > 0 && !content.endsWith('\n') ? '\n' : '';
  await fs.writeFile(gitignorePath, `${content}${separator}${entry}\n`, 'utf8');
  return true;
}

async function ensureGitignoreEntries(targetDir, entries) {
  const gitignorePath = path.join(targetDir, '.gitignore');
  let content = '';
  if (await exists(gitignorePath)) {
    content = await fs.readFile(gitignorePath, 'utf8');
  }

  const existing = new Set(content.split('\n').map((line) => line.trim()));
  const missing = entries.filter((entry) => !existing.has(entry));
  if (missing.length === 0) return 0;

  const separator = content.length > 0 && !content.endsWith('\n') ? '\n' : '';
  await fs.writeFile(gitignorePath, `${content}${separator}${missing.join('\n')}\n`, 'utf8');
  return missing.length;
}

async function ensureProjectGitignorePolicy(targetDir) {
  return ensureGitignoreEntries(targetDir, GITIGNORE_POLICY_LINES);
}

// Schema fields that must always exist as arrays in git-guard.json.
// Missing fields are added (initialized to []), never removed or modified.
// Prevents silent downgrade when an older template ships fewer fields than the project uses.
const GIT_GUARD_SCHEMA_ARRAY_FIELDS = [
  'allowPaths',
  'contentAllowPaths',
  'blockPaths',
  'allowExtensions',
  'blockExtensions'
];

async function ensureGitGuardBaseline(targetDir) {
  const guardPath = path.join(targetDir, '.aioson/git-guard.json');
  if (!(await exists(guardPath))) return 0;

  let config;
  try {
    config = JSON.parse(await fs.readFile(guardPath, 'utf8'));
  } catch {
    return 0; // corrupted — do not touch
  }

  let mutations = 0;

  // Ensure every schema field exists as an array. Never remove existing entries.
  for (const field of GIT_GUARD_SCHEMA_ARRAY_FIELDS) {
    if (!Array.isArray(config[field])) {
      config[field] = [];
      mutations++;
    }
  }

  // Merge baseline blockPaths (additive only).
  const existing = new Set(config.blockPaths);
  const toAdd = GIT_GUARD_BASELINE_BLOCK_PATHS.filter((p) => !existing.has(p));
  if (toAdd.length > 0) {
    config.blockPaths = [...config.blockPaths, ...toAdd];
    mutations += toAdd.length;
  }

  if (mutations === 0) return 0;

  await fs.writeFile(guardPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  return mutations;
}

async function countProjectFiles(targetDir) {
  const SKIP = new Set(['.git', 'node_modules', 'vendor', '.aioson', 'dist', 'build', '__pycache__']);
  let count = 0;
  async function walk(dir) {
    let entries;
    try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (SKIP.has(e.name)) continue;
      if (e.isDirectory()) await walk(path.join(dir, e.name));
      else count++;
    }
  }
  await walk(targetDir);
  return count;
}

async function listFilesRecursive(dir) {
  const out = [];

  async function walk(current) {
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else {
        out.push(full);
      }
    }
  }

  await walk(dir);
  return out;
}

/**
 * Returns a skip-reason string if the file should be skipped, or false if it should be installed.
 */
function shouldSkipTemplatePath(rel, profile = null) {
  if (rel === '.gitignore') return 'merge-only';
  if (rel === '.aioson/context/.gitkeep') return false;
  if (rel === '.aioson/context/design-doc.md') return false; // framework default — copied on fresh install, project-local on update
  if (rel === '.aioson/context/_archived/.gitkeep') return false; // active-learning-loop Phase 3 archive convention
  if (rel.startsWith('.aioson/context/')) return 'context-protected';
  // Never overwrite user-installed skills (only the .gitkeep is created)
  if (rel.startsWith('.aioson/installed-skills/') && rel !== '.aioson/installed-skills/.gitkeep') return 'context-protected';
  // Never overwrite custom agents (only the .gitkeep is created)
  if (rel.startsWith('.aioson/my-agents/') && rel !== '.aioson/my-agents/.gitkeep') return 'context-protected';

  // Profile-based filtering
  if (profile && !shouldIncludeForProfile(rel, profile)) return 'not-in-profile';

  return false;
}

async function writeInstallMetadata(targetDir, action, frameworkDetection, installProfile) {
  const metaPath = path.join(targetDir, '.aioson/install.json');
  await ensureDir(path.dirname(metaPath));
  let existing = {};
  if (await exists(metaPath)) {
    try {
      existing = JSON.parse(await fs.readFile(metaPath, 'utf8'));
    } catch {
      // corrupted install.json — reset rather than crash
    }
  }

  const version = await getCliVersion();
  // Stamp the exact framework commit when installing/updating from a git checkout
  // (e.g. an `npm link`ed dev framework). With a plain npm install this is null —
  // template_version alone identifies it. Lets a project record precisely which
  // commit it was last updated from.
  const gitInfo = getGitBuildInfoSync();
  const data = {
    ...existing,
    managed_by: 'aioson',
    template_version: version,
    template_git_sha: gitInfo ? gitInfo.sha : null,
    template_git_date: gitInfo ? gitInfo.date : null,
    last_action: action,
    last_action_at: new Date().toISOString(),
    framework_detected: frameworkDetection || existing.framework_detected || null,
    install_profile: installProfile || existing.install_profile || null
  };

  await fs.writeFile(metaPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

async function readInstallProfile(targetDir) {
  const metaPath = path.join(targetDir, '.aioson/install.json');
  if (!(await exists(metaPath))) return null;
  try {
    const data = JSON.parse(await fs.readFile(metaPath, 'utf8'));
    return data.install_profile || null;
  } catch {
    return null;
  }
}

async function backupManagedFile(targetDir, relPath, backupRoot) {
  const source = path.join(targetDir, relPath);
  if (!(await exists(source))) return null;

  const dest = path.join(backupRoot, relPath);
  await copyFileWithDir(source, dest);
  return dest;
}

async function installTemplate(targetDir, options = {}) {
  const {
    overwrite = false,
    dryRun = false,
    mode = 'install',
    backupOnOverwrite = mode === 'update',
    frameworkDetection = null,
    installProfile = null,
    selectiveUpdate = false,
    onProgress = null
  } = options;

  await ensureDir(targetDir);
  const existingInstall = await detectExistingInstall(targetDir);

  const templateFiles = await listFilesRecursive(TEMPLATE_DIR);
  const copied = [];
  const skipped = [];
  const backedUp = [];
  const failedBackups = [];
  const mergedConfigs = [];
  let runtime = null;

  let backupRoot = null;
  if (backupOnOverwrite) {
    backupRoot = path.join(targetDir, '.aioson/backups', nowStamp());
  }

  for (const absPath of templateFiles) {
    const rel = toRelativeSafe(TEMPLATE_DIR, absPath);
    const skipReason = shouldSkipTemplatePath(rel, installProfile);
    if (skipReason) {
      skipped.push({ path: rel, reason: skipReason });
      continue;
    }

    // M-01: .aioson/config/*.json get additive JSON merge (preserve user
    // customizations) with backup of the prior file before any mutation.
    // This branch handles its own create/update/skip semantics and bypasses
    // selectiveUpdate so a project on an older version still gets new configs.
    if (isConfigMergePath(rel)) {
      const mergeResult = await mergeConfigFile({
        templatePath: absPath,
        targetDir,
        relPath: rel,
        backupRoot,
        dryRun
      });
      if (mergeResult.action === 'invalid_template') {
        skipped.push({ path: rel, reason: 'invalid-template' });
      } else if (mergeResult.action === 'unchanged') {
        skipped.push({ path: rel, reason: 'unchanged' });
      } else {
        copied.push(rel);
        mergedConfigs.push({ path: rel, action: mergeResult.action });
        if (mergeResult.backupPath) {
          backedUp.push(toRelativeSafe(targetDir, mergeResult.backupPath));
        }
        if (mergeResult.backupError) {
          failedBackups.push({ path: rel, error: mergeResult.backupError });
          console.warn(`[aioson update] backup of ${rel} failed; update proceeding without rollback for this file: ${mergeResult.backupError}`);
        }
      }
      if (onProgress) {
        onProgress({ copied: copied.length, total: templateFiles.length, file: rel });
      }
      continue;
    }

    const dest = path.join(targetDir, rel);
    const destExists = await exists(dest);

    // Gateway pointer files (CLAUDE.md, AGENTS.md, OPENCODE.md)
    // get block-merged so that an existing project-authored file keeps its content
    // and only the AIOSON-managed block is created or refreshed in place.
    if (isGatewayPointerPath(rel)) {
      if (!destExists && selectiveUpdate) {
        skipped.push({ path: rel, reason: 'not-installed' });
        continue;
      }
      const mergeResult = await mergeGatewayPointer({
        templatePath: absPath,
        targetPath: dest,
        backupRoot: backupOnOverwrite ? backupRoot : null,
        targetDir,
        dryRun
      });
      if (mergeResult.action === 'unchanged') {
        skipped.push({ path: rel, reason: 'unchanged' });
      } else {
        copied.push(rel);
        mergedConfigs.push({ path: rel, action: mergeResult.action });
        if (mergeResult.backupPath) {
          backedUp.push(toRelativeSafe(targetDir, mergeResult.backupPath));
        }
        if (mergeResult.backupError) {
          failedBackups.push({ path: rel, error: mergeResult.backupError });
          console.warn(`[aioson update] backup of ${rel} failed; update proceeding without rollback for this file: ${mergeResult.backupError}`);
        }
      }
      if (onProgress) {
        onProgress({ copied: copied.length, total: templateFiles.length, file: rel });
      }
      continue;
    }

    // Project-local files are never overwritten from template.
    // On fresh install they are created once; on any subsequent operation they are preserved
    // even if the file was manually deleted.
    if (PROJECT_LOCAL_FILES.has(rel) && (destExists || mode !== 'install')) {
      skipped.push({ path: rel, reason: 'project-local' });
      continue;
    }

    if (!destExists && selectiveUpdate) {
      skipped.push({ path: rel, reason: 'not-installed' });
      continue;
    }

    if (destExists && !overwrite && mode !== 'update') {
      skipped.push({ path: rel, reason: 'already-exists' });
      continue;
    }

    if (destExists && mode === 'update' && backupOnOverwrite && MANAGED_FILES.includes(rel)) {
      if (!dryRun) {
        try {
          const backupPath = await backupManagedFile(targetDir, rel, backupRoot);
          if (backupPath) backedUp.push(toRelativeSafe(targetDir, backupPath));
        } catch (err) {
          // Backup failed — do not block the update, but surface the loss of rollback safety.
          failedBackups.push({ path: rel, error: err && err.message ? err.message : String(err) });
          console.warn(`[aioson update] backup of ${rel} failed; update proceeding without rollback for this file: ${err && err.message ? err.message : err}`);
        }
      } else {
        backedUp.push(toRelativeSafe(targetDir, path.join(backupRoot, rel)));
      }
    }

    if (!dryRun) {
      await copyFileWithDir(absPath, dest);
    }

    copied.push(rel);

    if (onProgress) {
      onProgress({ copied: copied.length, total: templateFiles.length, file: rel });
    }
  }

  if (!dryRun) {
    await ensureDir(path.join(targetDir, '.aioson/context/parallel'));
    await ensureDir(path.join(targetDir, '.aioson/context'));
    const gitkeep = path.join(targetDir, '.aioson/context/.gitkeep');
    if (!(await exists(gitkeep))) {
      await fs.writeFile(gitkeep, '', 'utf8');
    }

    // Squad research cache — created on install so @orache can write without mkdir
    await ensureDir(path.join(targetDir, 'squad-searches', 'standalone'));

    await writeInstallMetadata(targetDir, mode, frameworkDetection, installProfile);

    await ensureProjectGitignorePolicy(targetDir);
    await ensureGitGuardBaseline(targetDir);

    runtime = await ensureProjectRuntime(targetDir);
  }

  // Derive native harness permissions from autonomy-protocol.json
  // (best-effort: never block installation on permissions sync failure).
  let permissions = null;
  if (!dryRun) {
    try {
      permissions = await generatePermissions(targetDir);
    } catch (err) {
      permissions = { error: err && err.message ? err.message : String(err) };
    }
  }

  // Detect if this is an existing project with many files
  const projectFileCount = await countProjectFiles(targetDir);
  const isExistingProject = frameworkDetection && projectFileCount > 20;

  return {
    existingInstall,
    copied,
    skipped,
    backedUp,
    failedBackups,
    mergedConfigs,
    runtime,
    permissions,
    dryRun,
    projectFileCount,
    isExistingProject
  };
}

module.exports = {
  TEMPLATE_DIR,
  detectExistingInstall,
  installTemplate,
  readInstallProfile,
  listFilesRecursive,
  ensureGitignoreEntry,
  ensureGitignoreEntries,
  ensureProjectGitignorePolicy,
  ensureGitGuardBaseline,
  GIT_GUARD_BASELINE_BLOCK_PATHS,
  countProjectFiles
};
