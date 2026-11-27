'use strict';

/**
 * aioson outcome:record | outcome:report | outcome:feedback — what each
 * delivery used and how it went, measured without a model, kept in the
 * project, and the person's own review of it.
 *
 *   aioson outcome:record . --feature=<slug> [--verdict=PASS] [--kind=feature|simple-plan] [--json]
 *       (feature:close and the simple-plan close run it; by hand it backfills)
 *   aioson outcome:report . [--portfolio] [--json]
 *       (.aioson/outcomes/REPORT.md — which practices go with better results)
 *   aioson outcome:feedback . [--feature=<slug>] [--no-open] [--json]
 *       (opens the review screen for the latest delivery, or <slug>)
 *   aioson outcome:feedback . --feature=<slug> --rating=1..5 [--good="..."] [--bad="..."]
 *   aioson outcome:feedback . [--feature=<slug>] --later|--snooze=week|month|--never|--on
 *
 * Nothing here sends anything anywhere: records and reviews stay under
 * .aioson/outcomes/, preferences under ~/.aioson/outcomes.json.
 */

const path = require('node:path');
const { resolveTargetDir, resolveProjectRootOrSelf, isProjectRoot } = require('../lib/project-root');
const { readRecord, readRecords } = require('../lib/outcomes/ledger');
const { recordOutcome, refreshReport, projectNames, projectLocale, portfolioRecords } = require('../lib/outcomes/record');
const { analyze } = require('../lib/outcomes/report');
const { renderReport } = require('../lib/outcomes/report-render');
const { applyChoice, saveFeedback, readPrefs, prefsPath } = require('../lib/outcomes/feedback');
const { openFeedbackScreen } = require('../lib/outcomes/screen');

function projectDir(args) {
  return resolveProjectRootOrSelf(resolveTargetDir(args));
}

function fail(logger, options, message, reason) {
  if (!options.json && logger && logger.error) logger.error(message);
  return { ok: false, exitCode: 1, reason, error: message };
}

function slugOption(options) {
  const value = options.feature || options.slug;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

async function runOutcomeRecord({ args = [], options = {}, logger = console } = {}) {
  const targetDir = projectDir(args);
  if (!isProjectRoot(targetDir)) return fail(logger, options, `outcome:record — ${targetDir} is not an AIOSON project`, 'not_a_project');
  const slug = slugOption(options);
  if (!slug) return fail(logger, options, 'outcome:record — --feature=<slug> is required', 'missing_feature');
  const kind = options.kind === 'simple-plan' ? 'simple-plan' : 'feature';
  const verdict = typeof options.verdict === 'string' ? options.verdict.toUpperCase() : (kind === 'simple-plan' ? 'DONE' : 'PASS');
  const result = await recordOutcome(targetDir, slug, { kind, verdict });
  if (!result.ok) return fail(logger, options, `outcome:record — ${result.error || result.reason}`, result.reason);
  refreshReport(targetDir);
  if (!options.json) logger.log(`outcome:record — ${path.relative(targetDir, result.file).replace(/\\/g, '/')} (${result.detected} practice(s) detected)`);
  return { ok: true, file: result.file, record: result.record };
}

async function runOutcomeReport({ args = [], options = {}, logger = console } = {}) {
  const targetDir = projectDir(args);
  if (!isProjectRoot(targetDir)) return fail(logger, options, `outcome:report — ${targetDir} is not an AIOSON project`, 'not_a_project');
  const locale = projectLocale(targetDir);
  if (options.portfolio === true) {
    const { records, projects } = portfolioRecords(targetDir);
    const analysis = analyze(records);
    const markdown = renderReport(analysis, { locale, portfolio: { projects } });
    if (!options.json) logger.log(markdown);
    return { ok: true, scope: 'portfolio', projects, analysis, markdown };
  }
  const { file, analysis, markdown } = refreshReport(targetDir, { locale });
  if (!options.json) logger.log(markdown);
  return { ok: true, scope: 'project', file, analysis, markdown };
}

function latestSlug(targetDir) {
  const records = readRecords(targetDir);
  return records.length > 0 ? records[records.length - 1].feature : null;
}

function choiceOption(options) {
  if (options.on === true) return 'on';
  if (options.never === true) return 'never';
  if (options.later === true) return 'later';
  if (options.snooze === 'week' || options.snooze === 'month') return options.snooze;
  return null;
}

/**
 * --on / --never / --snooze change the person's preferences (~/.aioson), so
 * they work from any folder; inside a project with a recorded delivery they
 * also settle that delivery. --later needs the delivery.
 */
function applyPreference({ choice, args, options, logger }) {
  const targetDir = projectDir(args);
  const inProject = isProjectRoot(targetDir);
  const slug = inProject ? (slugOption(options) || latestSlug(targetDir)) : null;
  const withRecord = slug && readRecord(targetDir, slug) ? slug : null;
  const { record } = applyChoice({ choice, targetDir: withRecord ? targetDir : null, slug: withRecord });
  if (!options.json) logger.log(`outcome:feedback — ${choice}${withRecord ? ` (${withRecord})` : ''} · ${prefsPath()}`);
  return { ok: true, choice, ...(withRecord ? { feature: withRecord, feedback: record ? record.feedback : null } : {}), prefs: readPrefs() };
}

async function runOutcomeFeedback({ args = [], options = {}, logger = console } = {}) {
  const choice = choiceOption(options);
  if (options.snooze !== undefined && choice === null) return fail(logger, options, 'outcome:feedback — --snooze takes week or month', 'invalid_snooze');
  if (choice && choice !== 'later') return applyPreference({ choice, args, options, logger });
  const targetDir = projectDir(args);
  if (!isProjectRoot(targetDir)) return fail(logger, options, `outcome:feedback — ${targetDir} is not an AIOSON project`, 'not_a_project');
  const slug = slugOption(options) || latestSlug(targetDir);
  if (!slug) return fail(logger, options, 'outcome:feedback — no delivery recorded yet (.aioson/outcomes/ is empty)', 'no_record');
  if (!readRecord(targetDir, slug)) return fail(logger, options, `outcome:feedback — no record for ${slug}; run aioson outcome:record . --feature=${slug}`, 'no_record');
  if (choice) {
    const { record } = applyChoice({ choice, targetDir, slug });
    if (!options.json) logger.log(`outcome:feedback — ${slug}: ${choice}`);
    return { ok: true, feature: slug, choice, feedback: record ? record.feedback : null };
  }
  if (options.rating !== undefined || typeof options.good === 'string' || typeof options.bad === 'string') {
    const saved = saveFeedback({ targetDir, slug, rating: options.rating === true ? NaN : options.rating, good: options.good, bad: options.bad, names: projectNames(targetDir) });
    if (!saved.ok) return fail(logger, options, `outcome:feedback — ${saved.reason}`, saved.reason);
    refreshReport(targetDir);
    if (!options.json) logger.log(`outcome:feedback — ${slug}: saved`);
    return { ok: true, feature: slug, feedback: saved.feedback };
  }
  const outcome = await openFeedbackScreen({ targetDir, slug, open: options.open !== false && options['no-open'] !== true, logger: options.json ? null : logger });
  return { ok: true, feature: slug, ...outcome };
}

module.exports = { runOutcomeRecord, runOutcomeReport, runOutcomeFeedback };
