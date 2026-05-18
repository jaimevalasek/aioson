'use strict';

const path = require('node:path');
const { detectFramework } = require('../detector');
const { updateInstallation } = require('../updater');
const { validateProjectContextFile, getInteractionLanguage } = require('../context');
const { applyAgentLocale } = require('../locales');

async function runUpdate({ args, options, logger, t }) {
  const targetDir = path.resolve(process.cwd(), args[0] || '.');
  const dryRun = Boolean(options['dry-run']);
  const all = Boolean(options.all);
  const selective = Boolean(options.selective);
  const requestedLanguage = options.lang || options.language;

  const detection = await detectFramework(targetDir);
  const result = await updateInstallation(targetDir, {
    dryRun,
    all,
    selective,
    frameworkDetection: detection.framework
  });

  if (!result.ok) {
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
    localeSync = await applyAgentLocale(targetDir, language, { dryRun });
  }

  logger.log(t('update.done_at', { targetDir }));
  logger.log(t('update.files_updated', { count: result.copied.length }));
  logger.log(t('update.backups_created', { count: result.backedUp.length }));
  if (result.migrations && result.migrations.profileRename && result.migrations.profileRename.changed) {
    logger.log('');
    logger.log(t('update.profile_renamed'));
  }
  if (!dryRun) {
    logger.log('');
    logger.log(t('update.reconfigure_hint'));
  }
  if (localeSync) {
    if (dryRun) {
      logger.log(t('locale_apply.dry_run_applied', { locale: localeSync.locale }));
    } else {
      logger.log(t('locale_apply.applied', { locale: localeSync.locale }));
    }
  }

  return {
    targetDir,
    ...result,
    localeSync
  };
}

module.exports = {
  runUpdate
};
