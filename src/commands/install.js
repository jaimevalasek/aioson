'use strict';

const path = require('node:path');
const { detectFramework } = require('../detector');
const { installTemplate, readInstallProfile } = require('../installer');
const { applyAgentLocale, normalizeInteractionLanguage } = require('../locales');
const { resolvePromptTool } = require('../prompt-tool');
const { runInstallWizard } = require('../install-wizard');
const { renderRevealAnimation, renderInstallSummary, renderProgress } = require('../install-animation');
const { getCliVersion } = require('../version');

async function runInstall({ args, options, logger, t }) {
  const targetDir = path.resolve(process.cwd(), args[0] || '.');
  const force = Boolean(options.force);
  const dryRun = Boolean(options['dry-run']);
  const noInteractive = Boolean(options['no-interactive']);
  const reconfigure = Boolean(options.reconfigure);
  const requestedLanguage = options.lang || options.language;
  const promptTool = resolvePromptTool(options.tool);

  const detection = await detectFramework(targetDir);
  if (detection.installed) {
    logger.log(t('install.framework_detected', {
      framework: detection.framework,
      evidence: detection.evidence
    }));
  } else {
    logger.log(t('install.framework_not_detected'));
  }

  // Decide install profile.
  //
  // UX contract:
  //   - Interactive (TTY + !no-interactive + !dry-run) → wizard ALWAYS appears,
  //     pre-populated from saved profile if any. The user no longer needs to
  //     remember `--reconfigure` to change settings — it's the default flow.
  //   - Non-interactive → honor saved profile if present, else loud fallback.
  //   - Contradictions (`--reconfigure --no-interactive`) → fail loudly.
  //   - Wizard returning null (user pressed q/ctrl+c) → fall back to saved
  //     profile if any, else explicit "install-all" with warning. Never silent.
  let installProfile = null;
  const isTTY = process.stdin.isTTY && process.stdout.isTTY;
  const canRunWizard = !noInteractive && isTTY && !dryRun;
  const existingProfile = await readInstallProfile(targetDir);

  // --reconfigure needs the wizard. Without one we cannot ask the user
  // anything, and silently falling back to "install everything" hides the
  // intent of the flag.
  if (reconfigure && !canRunWizard) {
    const reason = noInteractive ? '--no-interactive' : (!isTTY ? 'non-TTY environment' : '--dry-run');
    throw new Error(t('install.reconfigure_needs_tty', { reason }));
  }

  if (canRunWizard) {
    // Diagnostic on stderr — guarantees the user sees something even if the
    // wizard's first render gets clobbered by terminal escape sequences in
    // certain emulators. stderr is unbuffered for TTYs.
    process.stderr.write(`${t('install.opening_wizard')}\n`);

    installProfile = await runInstallWizard({
      noInteractive,
      existingProfile,
      t
    });

    if (installProfile === null) {
      // The wizard didn't return a profile. This happens when the user pressed
      // q/ctrl+c OR when the wizard's internal TTY check failed (some terminal
      // emulators report isTTY=true but can't actually do raw-mode keypress).
      // Either way: do NOT silently install-all — fall back to saved profile.
      if (existingProfile) {
        installProfile = existingProfile;
        process.stderr.write(`${t('install.wizard_cancelled_using_saved')}\n`);
      } else {
        process.stderr.write(`${t('install.wizard_cancelled_install_all')}\n`);
      }
    }
  } else if (existingProfile) {
    // Non-interactive: honor the saved profile instead of falling through to null.
    installProfile = existingProfile;
    logger.log(t('install.using_saved_profile'));
  } else {
    // Non-interactive AND no saved profile: install-all is the only safe fallback,
    // but it must be announced so the user understands why every file was copied.
    logger.log(t('install.fallback_no_saved_profile'));
  }

  // When reconfigure, we need overwrite=true so changed profile is reflected
  const overwrite = force || reconfigure;

  const result = await installTemplate(targetDir, {
    overwrite,
    dryRun,
    mode: 'install',
    frameworkDetection: detection.framework,
    installProfile,
    onProgress: isTTY && !dryRun ? renderProgress : null
  });

  // Locale: explicit --lang flag wins over profile, profile wins over nothing
  const effectiveLocale = requestedLanguage || (installProfile && installProfile.locale) || null;
  let localeApply = null;
  if (effectiveLocale) {
    localeApply = await applyAgentLocale(
      targetDir,
      normalizeInteractionLanguage(effectiveLocale),
      { dryRun }
    );
    if (dryRun) {
      logger.log(t('locale_apply.dry_run_applied', { locale: localeApply.locale }));
    } else {
      logger.log(t('locale_apply.applied', { locale: localeApply.locale }));
    }
  }

  // Reveal animation + summary (TTY only, not dry-run)
  if (isTTY && !dryRun) {
    const version = await getCliVersion();
    await renderRevealAnimation(version);
    renderInstallSummary({ result, installProfile });
  } else if (dryRun) {
    // bug-found-001: dry-run must be visually distinct from a real install.
    // Past-tense verbs ("Installation completed", "Files copied") on a no-op
    // run mislead operators into believing files were written. Use a banner
    // marker and the conditional form ("would be copied") instead.
    logger.log(t('install.dry_run_header'));
    logger.log(t('install.dry_run_done_at', { targetDir }));
    logger.log(t('install.dry_run_files_copied', { count: result.copied.length }));
    logger.log(t('install.dry_run_files_skipped', { count: result.skipped.length }));
    logger.log(t('install.next_steps'));
    logger.log(t('install.step_setup_context'));
    logger.log(t('install.step_agents'));
    logger.log(t('install.step_agent_prompt', { tool: promptTool }));
  } else {
    logger.log(t('install.done_at', { targetDir }));
    logger.log(t('install.files_copied', { count: result.copied.length }));
    logger.log(t('install.files_skipped', { count: result.skipped.length }));
    logger.log(t('install.next_steps'));
    logger.log(t('install.step_setup_context'));
    logger.log(t('install.step_agents'));
    logger.log(t('install.step_agent_prompt', { tool: promptTool }));
  }

  if (result.isExistingProject) {
    logger.log('');
    logger.log(t('install.existing_project_detected', { count: result.projectFileCount }));
    logger.log(t('install.existing_project_scan_hint'));
  }

  return {
    ok: true,
    targetDir,
    detection,
    ...result,
    localeApply,
    installProfile
  };
}

module.exports = {
  runInstall
};
