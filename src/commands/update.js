'use strict';

// Namespace require (no destructuring) so tests can stub installDefaultHooks'
// inner runHooksInstall — the real thing mutates machine-global settings.
const hooksInstall = require('./hooks-install');
const { detectFramework } = require('../detector');
const { updateInstallation } = require('../updater');
const { listManagedTrackedIgnoredPaths, formatTrackedIgnoredRemedyOperands, readInstallProfile } = require('../installer');
const { validateProjectContextFile, getInteractionLanguage } = require('../context');
const { applyAgentLocale } = require('../locales');
const { getCliVersionLabelSync } = require('../version');
const { resolveTargetDir } = require('../lib/project-root');
const { inspectDesignDocSeed } = require('../lib/design-doc-seed');
const { inspectFeatureRegistry, featureRegistryParams } = require('../lib/feature-registry');
const { featureLifecycleParams } = require('../lib/feature-lifecycle');
const { diskFootprintParams } = require('../lib/storage-footprint');
const { inspectRetiredDesignPresets } = require('../lib/design-presets');

// Project-local files update never rewrites, so the update is where the
// consumer hears about them: the retired design-doc seed (a framework
// leftover) and a features.md that grew narrative (how to migrate it).
// Returns the design-doc seed inspection, which the update result reports.
async function logProjectLocalAdvisories(targetDir, logger, t) {
  const designDocSeed = await inspectDesignDocSeed(targetDir);
  if (designDocSeed.kind) {
    logger.log('');
    logger.log(t('doctor.retired_design_doc_seed', { kind: designDocSeed.kind }));
    logger.log(t(
      designDocSeed.kind === 'verbatim'
        ? 'doctor.retired_design_doc_seed_hint_verbatim'
        : 'doctor.retired_design_doc_seed_hint_derived',
      { path: designDocSeed.path }
    ));
  }
  const registry = await inspectFeatureRegistry(targetDir);
  if (registry.needsTidy) {
    logger.log('');
    logger.log(t('doctor.feature_registry_noise', featureRegistryParams(registry.measures)));
    logger.log(t('doctor.feature_registry_noise_hint'));
  }
  const lifecycle = await featureLifecycleParams(targetDir);
  logAdvisory(logger, t, 'doctor.feature_lifecycle', lifecycle);
  logAdvisory(logger, t, 'doctor.disk_footprint', diskFootprintParams(targetDir));
  return designDocSeed;
}

// One advisory and its hint (`{key}_hint`), only when it has params.
function logAdvisory(logger, t, key, params) {
  if (!params) return;
  logger.log('');
  logger.log(t(key, params));
  logger.log(t(`${key}_hint`));
}

async function runUpdate({ args, options, logger, t }) {
  const targetDir = resolveTargetDir(args);
  const dryRun = Boolean(options['dry-run']);
  const all = Boolean(options.all);
  const selective = Boolean(options.selective);
  const requestedLanguage = options.lang || options.language;

  const detection = await detectFramework(targetDir);
  const result = await updateInstallation(targetDir, {
    dryRun,
    all,
    selective,
    allowDowngrade: Boolean(options['allow-downgrade']),
    frameworkDetection: detection.framework
  });

  if (!result.ok) {
    if (result.reason === 'downgrade-blocked') {
      throw new Error(t('update.downgrade_blocked', {
        cliVersion: result.cliVersion,
        projectVersion: result.projectVersion
      }));
    }
    throw new Error(t('update.not_installed', { targetDir }));
  }

  let localeSync = null;
  if (!dryRun || requestedLanguage) {
    const context = await validateProjectContextFile(targetDir);
    const language =
      requestedLanguage ||
      (context.parsed && context.data
        ? getInteractionLanguage(context.data, '')
        : null) ||
      (result.savedProfile && result.savedProfile.locale
        ? result.savedProfile.locale
        : 'en');
    localeSync = await applyAgentLocale(targetDir, language, { dryRun, selectiveUpdate: selective && !all });
  }

  logger.log(t('update.done_at', { targetDir }));
  // Surface WHICH template landed — stale-template updates used to be silent
  // (the copy comes from the installed CLI's own bundle, not from npm latest).
  logger.log(t('update.template_version', { version: getCliVersionLabelSync() }));
  logger.log(t('update.files_updated', { count: result.copied.length }));
  logger.log(t('update.backups_created', { count: result.backedUp.length }));
  if (result.migrations && result.migrations.profileRename && result.migrations.profileRename.changed) {
    logger.log('');
    logger.log(t('update.profile_renamed'));
  }
  const agentRename = result.migrations && result.migrations.agentRename;
  if (agentRename && agentRename.changed) {
    logger.log('');
    logger.log(t('update.agent_renamed', { count: agentRename.removed.length }));
    agentRename.removed.forEach((relPath) => logger.log(`    - ${relPath}`));
  }
  if (!dryRun) {
    logger.log('');
    logger.log(t('update.reconfigure_hint'));
  }
  const trackedIgnored = listManagedTrackedIgnoredPaths(targetDir);
  if (trackedIgnored.length > 0) {
    logger.log('');
    logger.log(t('update.tracked_ignored_found', { count: trackedIgnored.length }));
    trackedIgnored.slice(0, 10).forEach((relPath) => logger.log(`    - ${relPath}`));
    logger.log(t('update.tracked_ignored_remedy', { paths: formatTrackedIgnoredRemedyOperands(trackedIgnored).join(' ') }));
  }
  const designDocSeed = await logProjectLocalAdvisories(targetDir, logger, t);
  // Retired fixed design presets: the template ships only the engine now, and
  // update rewrites neither design_skill nor the saved install profile — so
  // this is where the consumer hears a preset is no longer backed.
  const retiredPresets = await inspectRetiredDesignPresets(targetDir, {
    installProfile: await readInstallProfile(targetDir)
  });
  if (retiredPresets.retired_design_skill) {
    logger.log('');
    logger.log(t('doctor.retired_design_preset', { id: retiredPresets.retired_design_skill }));
    logger.log(t(
      retiredPresets.local_path
        ? 'doctor.retired_design_preset_hint_local'
        : 'doctor.retired_design_preset_hint_missing',
      { id: retiredPresets.retired_design_skill, path: retiredPresets.local_path || '' }
    ));
  }
  if (retiredPresets.profile_retired.length > 0) {
    logger.log('');
    logger.log(t('doctor.retired_design_preset_profile', { ids: retiredPresets.profile_retired.join(', ') }));
  }
  if (retiredPresets.retired_trees.length > 0) {
    logger.log('');
    logger.log(t('doctor.retired_skill_trees', { count: retiredPresets.retired_trees.length }));
    logger.log(t('doctor.retired_skill_trees_hint', { paths: retiredPresets.retired_trees.join(', ') }));
  }
  if (localeSync) {
    if (dryRun) {
      logger.log(t('locale_apply.dry_run_applied', { locale: localeSync.locale }));
    } else {
      logger.log(t('locale_apply.applied', { locale: localeSync.locale }));
    }
  }

  // Same default as init/install: updating an older project is exactly when
  // the hooks layer is most likely missing. --no-hooks opts out; a failure
  // never fails the update.
  const hooksResult = await hooksInstall.installDefaultHooks({ targetDir, options, logger, t });

  return {
    targetDir,
    ...result,
    localeSync,
    trackedIgnored,
    retiredDesignDocSeed: designDocSeed,
    retiredDesignPresets: retiredPresets,
    hooksInstall: hooksResult
  };
}

module.exports = {
  runUpdate
};
