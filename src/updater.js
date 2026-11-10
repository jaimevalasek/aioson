'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const {
  detectExistingInstall,
  installTemplate,
  readInstallProfile,
  readInstalledTemplateVersion
} = require('./installer');
const { getCliVersion } = require('./version');
const { compareSemver, CLI_ROOT } = require('./template-version-status');
const { migrateProfileRename } = require('./migrations/profile-rename');
const { migrateAgentRename } = require('./migrations/agent-rename');

// x.y.z compare; returns negative/0/positive, or null when either side is
// unparseable (null disables the downgrade guard rather than guessing). One
// parser with the template status: this one read `v999.0.0` as NaN and let
// the downgrade through while the status warned about the same stamp.
function compareTemplateVersions(a, b) {
  return compareSemver(a, b);
}

// install.json is local-only (the installer gitignores it), so a fresh clone
// or a CI checkout has no stamp and the guard used to switch off — an older
// CLI then rewrote the committed agents. project.context.md is committed and
// records the CLI that set the project up: a lower bound of the template on
// disk, enough to refuse a CLI older than it.
async function readContextAiosonVersion(targetDir) {
  try {
    const raw = await fs.readFile(path.join(targetDir, '.aioson', 'context', 'project.context.md'), 'utf8');
    const match = raw.match(/^aioson_version:[ \t]*["']?([^"'\r\n]+?)["']?[ \t]*$/m);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

// The downgrade guard every overwriting command shares (update, install
// --force, init --force). The template copy comes from the running CLI's own
// bundle, so a stale copy — an old global install, the one an app installer
// ships — would mass-downgrade every managed file. Returns null when the
// command may proceed, else the facts the refusal names: both versions, where
// the project's version was read, and where the running CLI lives (the path
// is what tells one copy of the CLI from another).
async function findDowngrade(targetDir) {
  const cliVersion = await getCliVersion();
  const stamped = await readInstalledTemplateVersion(targetDir);
  const projectVersion = stamped || await readContextAiosonVersion(targetDir);
  if (!projectVersion) return null;
  const cmp = compareTemplateVersions(cliVersion, projectVersion);
  if (cmp === null || cmp >= 0) return null;
  return {
    cliVersion,
    projectVersion,
    projectVersionSource: stamped ? '.aioson/install.json' : '.aioson/context/project.context.md',
    cliRoot: CLI_ROOT
  };
}

async function updateInstallation(targetDir, options = {}) {
  const installed = await detectExistingInstall(targetDir);
  if (!installed) {
    return {
      ok: false,
      reason: 'not-installed',
      message: `No AIOSON installation found in ${path.resolve(targetDir)}.`
    };
  }

  // Downgrade guard (the "old CLI trap"); --allow-downgrade is the deliberate
  // escape hatch.
  if (!options.allowDowngrade) {
    const downgrade = await findDowngrade(targetDir);
    if (downgrade) return { ok: false, reason: 'downgrade-blocked', ...downgrade };
  }
  // Read before the copy restamps it: the update reports the move it made.
  const templateVersionBefore = await readInstalledTemplateVersion(targetDir);
  const templateVersionAfter = await getCliVersion();

  const savedProfile = await readInstallProfile(targetDir);

  // Default: sync everything from the template, including files added by the
  // release that aren't yet in the target. Pre-1.9.2 this defaulted to
  // selective and silently dropped new agents/slash commands between versions.
  // `--selective` restores the legacy conservative mode; `--all` is accepted
  // as a backwards-compat no-op since "all" is now the default.
  const selective = Boolean(options.selective) && !options.all;
  const result = await installTemplate(targetDir, {
    overwrite: true,
    dryRun: Boolean(options.dryRun),
    mode: 'update',
    backupOnOverwrite: true,
    frameworkDetection: options.frameworkDetection || null,
    installProfile: savedProfile,
    selectiveUpdate: selective
  });

  // Post-install migrations. Best-effort: a migration failure must not break
  // the update flow. Skip migrations in dry-run mode.
  let profileMigration = { changed: false, file: null };
  let agentRenameMigration = { changed: false, removed: [] };
  if (!options.dryRun) {
    try {
      profileMigration = await migrateProfileRename(targetDir);
    } catch {
      // swallow — migrations are advisory
    }
    try {
      agentRenameMigration = await migrateAgentRename(targetDir);
    } catch {
      // swallow — migrations are advisory
    }
  }

  return {
    ok: true,
    ...result,
    savedProfile,
    templateVersionBefore,
    templateVersionAfter,
    cliRoot: CLI_ROOT,
    migrations: { profileRename: profileMigration, agentRename: agentRenameMigration }
  };
}

module.exports = {
  updateInstallation,
  compareTemplateVersions,
  findDowngrade
};
