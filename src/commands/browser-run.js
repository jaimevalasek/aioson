'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');
const { resolveTargetDir } = require('../lib/project-root');
const { loadScript, runWalkthrough, snapshotPage } = require('../lib/browser-walkthrough');

async function loadQaConfig(targetDir) {
  try {
    return JSON.parse(await fs.readFile(path.join(targetDir, 'aios-qa.config.json'), 'utf8'));
  } catch {
    return null;
  }
}

function browserOptions(options) {
  return {
    cdp: String(options.cdp || ''),
    channel: String(options.browser || options.channel || '').toLowerCase(),
    headed: Boolean(options.headed)
  };
}

// `--slow-mo=<ms>`: pace for a person watching a headed run; absent = the script's.
function slowMoOption(options) {
  const raw = options['slow-mo'] ?? options.slowMo;
  return raw === undefined || raw === true ? null : Number(raw);
}

// `--video` records beside the report; `--video=<file>` records there.
function videoOption(options) {
  const raw = options.video;
  if (raw === undefined || raw === false) return false;
  return raw === true ? true : String(raw);
}

// `--state` alone arrives as `true`: a blank file lets the runner name what is missing.
function stateOption(raw) {
  if (raw === undefined || raw === null || raw === false) return '';
  return raw === true ? ' ' : String(raw);
}

// The CLI logger has log/error only; warnings go to stderr without failing.
function warn(logger, message) {
  if (typeof logger.warn === 'function') logger.warn(message);
  else logger.error(message);
}

function failure(logger, t, output, message) {
  logger.error(message);
  if (output.hint) logger.error(t('browser_run.hint', { hint: output.hint }));
  return { ok: false, ...output };
}

/**
 * `aioson browser:run [path] --script=<walkthrough.json> [--url=] [--file=] [--slug=] [--prototype]
 *   [--cdp=] [--browser=chrome|msedge|chromium] [--headed] [--slow-mo=<ms>] [--video[=<file>]] [--state=<file>] [--save-state=<file>] [--continue] [--out=<dir>] [--no-persist] [--json]`
 */
async function runBrowserRun({ args, options = {}, logger, t }) {
  const targetDir = resolveTargetDir(args);
  const scriptArg = String(options.script || '');
  if (!scriptArg) {
    return failure(logger, t, { error: 'script_missing', hint: t('browser_run.script_missing_hint') }, t('browser_run.script_missing'));
  }
  const scriptPath = path.resolve(targetDir, scriptArg);
  const loaded = await loadScript(scriptPath);
  if (!loaded.ok) {
    return failure(logger, t, { error: 'script_invalid', errors: loaded.errors }, t('browser_run.script_invalid', { errors: loaded.errors.join('; ') }));
  }

  const config = await loadQaConfig(targetDir);
  const report = await runWalkthrough({
    targetDir,
    script: loaded.script,
    scriptPath,
    scriptRaw: loaded.raw,
    url: String(options.url || ''),
    file: String(options.file || ''),
    slug: String(options.slug || options.feature || ''),
    prototype: Boolean(options.prototype),
    persist: !(options['no-persist'] || options.noPersist),
    out: String(options.out || ''),
    continueOnFailure: Boolean(options.continue),
    config,
    slowMo: slowMoOption(options),
    video: videoOption(options),
    state: stateOption(options.state),
    saveState: stateOption(options['save-state'] ?? options.saveState),
    ...browserOptions(options)
  });

  if (report.error) {
    return failure(logger, t, { error: report.error, detail: report.detail || '', hint: report.hint || '' }, t('browser_run.failed', { error: report.error, detail: report.detail || '' }));
  }

  if (!options.json) {
    logger.log(t('browser_run.header', { name: report.name, target: report.target.url, browser: report.browser.label }));
    for (const step of report.steps) {
      const line = step.ok
        ? t('browser_run.step_ok', { index: step.index, action: step.do, detail: step.detail, ms: step.ms })
        : t('browser_run.step_fail', { index: step.index, action: step.do, error: step.error || step.detail });
      if (step.ok) logger.log(line); else logger.error(line);
      if (!step.ok && step.failure_snapshot && step.failure_snapshot.preview) {
        logger.log(t('browser_run.failure_snapshot'));
        logger.log(step.failure_snapshot.preview);
      }
    }
    const ids = Object.entries(report.ids);
    if (ids.length > 0) {
      logger.log(t('browser_run.ids_title'));
      for (const [id, row] of ids) logger.log(t('browser_run.id_line', { id, status: row.status, steps: row.steps.join(',') }));
    }
    for (const warning of report.warnings) warn(logger, t('browser_run.warning', { warning }));
    if (report.console.errors > 0 || report.console.page_errors > 0) {
      warn(logger, t('browser_run.console_summary', { errors: report.console.errors, page_errors: report.console.page_errors, warnings: report.console.warnings }));
    }
    logger.log(t(report.ok ? 'browser_run.verdict_pass' : 'browser_run.verdict_fail', {
      passed: report.steps.filter((s) => s.ok).length,
      total: report.steps.length,
      planned: loaded.script.steps.length
    }));
    if (report.persisted) logger.log(t('browser_run.report_written', { path: report.report_path }));
    if (report.video) logger.log(t('browser_run.video_written', { path: report.video }));
    if (report.superseded_artifacts && report.superseded_artifacts.files > 0) {
      logger.log(t('browser_run.superseded', { files: report.superseded_artifacts.files, kb: Math.round(report.superseded_artifacts.bytes / 1024) }));
    }
    logger.log(t('browser_run.replay', { command: report.replay }));
  }

  if (!report.ok) process.exitCode = 1;
  return report;
}

/**
 * `aioson browser:snapshot [path] --url=<page> | --file=<html> [--target=<locator>] [--max-lines=80]
 *   [--cdp=] [--browser=chrome|msedge|chromium] [--headed] [--json]`
 */
async function runBrowserSnapshot({ args, options = {}, logger, t }) {
  const targetDir = resolveTargetDir(args);
  const config = await loadQaConfig(targetDir);
  const url = String(options.url || '');
  const file = String(options.file || '');
  if (!url && !file) {
    return failure(logger, t, { error: 'target_missing', hint: t('browser_snapshot.target_missing_hint') }, t('browser_snapshot.target_missing'));
  }
  const result = await snapshotPage({
    targetDir,
    url,
    file,
    target: String(options.target || ''),
    maxLines: Number(options['max-lines'] || options.maxLines || 0) || undefined,
    config,
    timeout: Number(options.timeout) > 0 ? Number(options.timeout) : undefined,
    ...browserOptions(options)
  });
  if (!result.ok) {
    return failure(logger, t, { error: result.error, detail: result.detail || '', hint: result.hint || '' }, t('browser_snapshot.failed', { error: result.error, detail: result.detail || '' }));
  }
  if (!options.json) {
    logger.log(t('browser_snapshot.header', { url: result.url, title: result.title, browser: result.browser.label }));
    if (result.login_wall) warn(logger, t('browser_snapshot.login_wall'));
    logger.log(result.snapshot.preview || t('browser_snapshot.empty'));
    if (result.snapshot.truncated) logger.log(t('browser_snapshot.truncated', { shown: result.snapshot.preview.split('\n').length, total: result.snapshot.lines }));
    if (result.console.errors > 0 || result.console.page_errors > 0) {
      warn(logger, t('browser_run.console_summary', { errors: result.console.errors, page_errors: result.console.page_errors, warnings: result.console.warnings }));
      for (const sample of result.console.samples) warn(logger, `  [${sample.type}] ${sample.text}`);
    }
  }
  return result;
}

module.exports = { runBrowserRun, runBrowserSnapshot };
