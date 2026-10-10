'use strict';

const { runDoctor, applyDoctorFixes } = require('../doctor');
const { resolveTargetDir } = require('../lib/project-root');

function printDoctorChecks(report, logger, t) {
  for (const check of report.checks) {
    // An advisory is not a failure: it never flips the diagnosis, so it must not read like one.
    const icon = check.ok ? t('doctor.ok') : t(check.severity === 'warning' ? 'doctor.warn' : 'doctor.fail');
    logger.log(
      t('doctor.check_line', {
        icon,
        message: t(check.key, check.params)
      })
    );
    if (!check.ok && check.hintKey) {
      logger.log(
        t('doctor.hint_line', {
          hint: t(check.hintKey, check.hintParams || check.params)
        })
      );
    }
  }
}

function printFixAction(action, logger, t, dryRun) {
  logger.log(
    t('doctor.fix_action_line', {
      action: t(`doctor.fix_action_${action.id}`)
    })
  );
  if (action.skipped) {
    logger.log(
      t('doctor.detail_line', {
        text: t('doctor.fix_not_applicable')
      })
    );
    return;
  }
  logger.log(
    t('doctor.detail_line', {
      text: t('doctor.fix_target_count', { count: action.missingCount || action.count || 0 })
    })
  );
  logger.log(
    t('doctor.detail_line', {
      text: t(dryRun ? 'doctor.fix_planned_count' : 'doctor.fix_applied_count', {
        count: action.count || 0
      })
    })
  );
  if (action.locale) {
    logger.log(
      t('doctor.detail_line', {
        text: t('doctor.fix_locale', { locale: action.locale })
      })
    );
  }
}

async function runDoctorCommand({ args, options = {}, logger, t }) {
  const targetDir = resolveTargetDir(args);
  const fix = Boolean(options.fix);
  const dryRun = Boolean(options['dry-run']);
  const jsonMode = Boolean(options.json);

  let report = await runDoctor(targetDir);
  let fixResult = null;

  if (fix) {
    if (!jsonMode) {
      logger.log(dryRun ? t('doctor.fix_start_dry_run') : t('doctor.fix_start'));
    }
    fixResult = await applyDoctorFixes(targetDir, report, { dryRun });
    if (!jsonMode) {
      for (const action of fixResult.actions) {
        printFixAction(action, logger, t, dryRun);
      }

      logger.log(
        dryRun
          ? t('doctor.fix_summary_dry_run', { count: fixResult.changedCount })
          : t('doctor.fix_summary', { count: fixResult.changedCount })
      );
      logger.log('');
    }
    report = await runDoctor(targetDir);
  }

  const output = {
    ok: report.ok,
    targetDir,
    fix: {
      enabled: fix,
      dryRun,
      ...(fixResult
        ? {
            changedCount: fixResult.changedCount,
            actions: fixResult.actions
          }
        : {})
    },
    report
  };

  if (jsonMode) {
    return output;
  }

  printDoctorChecks(report, logger, t);

  logger.log('');
  if (!report.ok) {
    logger.log(t('doctor.diagnosis_fail', { count: report.failedCount }));
  } else {
    logger.log(t('doctor.diagnosis_ok'));
  }

  return output;
}

module.exports = {
  runDoctorCommand
};
