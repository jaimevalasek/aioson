'use strict';

const path = require('node:path');
const { detectExistingInstall, installTemplate, readInstallProfile } = require('./installer');
const { migrateProfileRename } = require('./migrations/profile-rename');

async function updateInstallation(targetDir, options = {}) {
  const installed = await detectExistingInstall(targetDir);
  if (!installed) {
    return {
      ok: false,
      reason: 'not-installed',
      message: `No AIOSON installation found in ${path.resolve(targetDir)}.`
    };
  }

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
  if (!options.dryRun) {
    try {
      profileMigration = await migrateProfileRename(targetDir);
    } catch {
      // swallow — migrations are advisory
    }
  }

  return {
    ok: true,
    ...result,
    savedProfile,
    migrations: { profileRename: profileMigration }
  };
}

module.exports = {
  updateInstallation
};
