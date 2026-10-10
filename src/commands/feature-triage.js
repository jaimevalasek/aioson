'use strict';

/**
 * aioson feature:triage — see where every feature really stands, then clean
 * the lifecycle through the commands that own it.
 *
 * Without decision flags it only reads (src/lib/feature-lifecycle.js). The
 * mechanical half needs no judgment and runs with --apply: alias statuses are
 * rewritten by feature:tidy, closed features still in the live context go
 * through feature:sweep. The other half is the owner's call and runs only
 * when named slug by slug:
 *   --close=a,b    QA already passed → feature:close with the QA verdict (its
 *                  gates still run; a blocked close is reported, never forced)
 *   --pause=a      open work set aside       → paused
 *   --abandon=a    work that will not ship   → abandoned (archived)
 *   --resume=a     paused work picked up     → in_progress
 * Every decision is checked before any runs: one refusal and nothing changes.
 *
 * Usage:
 *   aioson feature:triage . [--json] [--stale-days=21] [--paused-days=60]
 *   aioson feature:triage . --apply
 *   aioson feature:triage . --close=checkout --abandon=old-import [--include-active] [--dry-run]
 */

const { resolveTargetDir } = require('../lib/project-root');
const { triageFeatures, findingsOf } = require('../lib/feature-lifecycle');
const { tidyFeatureRegistry } = require('../lib/feature-registry');
const { runFeatureSweep } = require('./feature-archive');
const { runFeatureRegister } = require('./feature-registry');
const { runFeatureClose } = require('./feature-close');
const { runPulseUpdate } = require('./pulse-update');

const DECISIONS = ['close', 'pause', 'abandon', 'resume'];
const PAUSABLE = new Set(['planning', 'in_progress', 'qa_failed', 'qa_blocked']);
const ABANDONABLE = new Set([...PAUSABLE, 'paused']);
const SILENT = { log() {}, error() {}, warn() {} };

function listOption(value) {
  if (value === undefined || value === null || value === true || value === false) return [];
  return String(value).split(',').map((slug) => slug.trim().toLowerCase()).filter(Boolean);
}

function parseDays(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function readDecisions(options) {
  const decisions = [];
  for (const action of DECISIONS) {
    for (const slug of listOption(options[action])) decisions.push({ action, slug });
  }
  return decisions;
}

/** @returns {string|null} why this decision is refused, or null when it may run. */
function refusal(decision, feature, readyBySlug, includeActive) {
  const { action, slug } = decision;
  if (!feature) return `${slug} is not registered in features.md`;
  if (action === 'close') {
    const ready = readyBySlug.get(slug);
    if (!ready) return `${slug} has no current QA PASS — close only what QA passed (route to @qa first)`;
    if (ready.changed_after_qa) return `${slug}: the spec/plan changed after the QA verdict — re-verify with @qa before closing`;
    return null;
  }
  if (feature.active && !includeActive && action !== 'resume') {
    return `${slug} is the active feature — name it with --include-active if the owner really means it`;
  }
  if (action === 'pause' && !PAUSABLE.has(feature.status)) return `${slug} is ${feature.status}; only open work can be paused`;
  if (action === 'abandon' && !ABANDONABLE.has(feature.status)) return `${slug} is ${feature.status}; only open or paused work can be abandoned`;
  if (action === 'resume' && feature.status !== 'paused') return `${slug} is ${feature.status}; only paused work resumes`;
  return null;
}

function validateDecisions(decisions, triage, includeActive) {
  const bySlug = new Map(triage.features.map((feature) => [feature.slug, feature]));
  const readyBySlug = new Map(findingsOf(triage, 'ready_to_close').map((item) => [item.slug, item]));
  const seen = new Map();
  const refusals = [];
  for (const decision of decisions) {
    if (seen.has(decision.slug) && seen.get(decision.slug) !== decision.action) {
      refusals.push({ ...decision, reason: `${decision.slug} is named for both ${seen.get(decision.slug)} and ${decision.action}` });
      continue;
    }
    seen.set(decision.slug, decision.action);
    const reason = refusal(decision, bySlug.get(decision.slug), readyBySlug, includeActive);
    if (reason) refusals.push({ ...decision, reason });
  }
  return { refusals, readyBySlug };
}

const REGISTER_STATUS = { pause: 'paused', abandon: 'abandoned', resume: 'in_progress' };

async function runClose(targetDir, decision, verdict) {
  const result = (await runFeatureClose({ args: [targetDir], options: { feature: decision.slug, verdict, json: true }, logger: SILENT })) || {};
  if (result.ok) return { ...decision, ok: true, verdict };
  return {
    ...decision,
    ok: false,
    verdict,
    reason: result.reason,
    blockers: Array.isArray(result.blockers) ? result.blockers : undefined,
    hint: `aioson feature:close . --feature=${decision.slug} --verdict=${verdict} --preflight`
  };
}

async function runDecision(targetDir, decision, readyBySlug) {
  if (decision.action === 'close') return runClose(targetDir, decision, readyBySlug.get(decision.slug).verdict);
  const status = REGISTER_STATUS[decision.action];
  const result = (await runFeatureRegister({ args: [targetDir], options: { feature: decision.slug, status, json: true }, logger: SILENT })) || {};
  return { ...decision, ok: Boolean(result.ok), status, reason: result.ok ? undefined : result.reason };
}

async function tidyStep(targetDir) {
  const tidy = await tidyFeatureRegistry(targetDir);
  return { step: 'tidy', ok: Boolean(tidy.ok), normalized: tidy.normalized || [], backup: tidy.backup || null };
}

async function pulseStep(targetDir) {
  const pulse = (await runPulseUpdate({ args: [targetDir], options: { feature: 'none', json: true }, logger: SILENT })) || {};
  return { step: 'pulse', ok: Boolean(pulse.ok), cleared: pulse.previous_active_feature || null };
}

async function sweepStep(targetDir) {
  const sweep = (await runFeatureSweep({ args: [targetDir], options: { json: true }, logger: null })) || {};
  return { step: 'sweep', ok: Boolean(sweep.ok && !sweep.failed), archived: sweep.archived || [], failed: sweep.failed || [] };
}

function mechanicalCounts(triage) {
  return {
    status_alias: findingsOf(triage, 'status_alias').length,
    active_is_closed: triage.project.filter((item) => item.kind === 'active_is_closed').length,
    closed_not_archived: findingsOf(triage, 'closed_not_archived').length
  };
}

// Order matters: spellings first (the sweep reads exact statuses), the sweep last.
async function applyMechanical(targetDir, triage) {
  const counts = mechanicalCounts(triage);
  const steps = [];
  if (counts.status_alias > 0) steps.push(await tidyStep(targetDir));
  if (counts.active_is_closed > 0) steps.push(await pulseStep(targetDir));
  if (counts.closed_not_archived > 0) steps.push(await sweepStep(targetDir));
  return steps;
}

function logReport(logger, triage) {
  const { summary } = triage;
  logger.log(`feature:triage — ${summary.status}: ${summary.open_features} open, ${summary.auto} mechanical fix(es), ${summary.owner} owner decision(s)`);
  const groups = [
    ['ready_to_close', 'Delivered, never closed (owner: close?)'],
    ['stale_open', `Open and quiet ≥ ${triage.thresholds.stale_days} days (owner: resume, pause or abandon?)`],
    ['stale_paused', `Paused ≥ ${triage.thresholds.paused_stale_days} days (owner: resume or abandon?)`],
    ['unknown_status', 'Status with no lifecycle meaning (owner)'],
    ['status_alias', 'Status spelled so no reader sees it (mechanical: --apply)'],
    ['closed_not_archived', 'Closed but still in the live context (mechanical: --apply)']
  ];
  for (const [kind, title] of groups) {
    const items = findingsOf(triage, kind);
    if (items.length === 0) continue;
    logger.log(`\n${title}:`);
    for (const item of items) {
      logger.log(`  • ${item.slug} [${item.status}] — ${item.reason}`);
      if (item.decides === 'owner' && item.commands[0]) logger.log(`      ${item.commands[0]}`);
    }
  }
  for (const item of triage.project) logger.log(`\n! ${item.reason}\n      ${item.commands.join('  |  ')}`);
}

const mark = (ok) => (ok ? '✓' : '✗');
const STEP_LINES = {
  tidy: (step) => `  ${mark(step.ok)} features.md: ${step.normalized.length} status spelling(s) rewritten${step.backup ? ` (backup: ${step.backup})` : ''}`,
  pulse: (step) => `  ${mark(step.ok)} project-pulse: active feature ${step.cleared || ''} cleared (it was closed)`,
  sweep: (step) => `  ${mark(step.ok)} sweep: ${step.archived.length} archived, ${step.failed.length} failed`
};

function logAction(logger, action) {
  logger.log(`  ${mark(action.ok)} ${action.action} ${action.slug}${action.ok ? '' : ` — ${action.reason}`}`);
  if (action.ok) return;
  for (const blocker of action.blockers || []) logger.log(`      blocked by ${blocker.gate || blocker.code}`);
  if (action.hint) logger.log(`      ${action.hint}`);
}

function logActions(logger, steps, actions) {
  for (const step of steps) logger.log(STEP_LINES[step.step](step));
  for (const action of actions) logAction(logger, action);
}

function readTriageOptions(options) {
  return {
    staleDays: parseDays(options['stale-days'] ?? options.staleDays, undefined),
    pausedStaleDays: parseDays(options['paused-days'] ?? options.pausedDays, undefined)
  };
}

/** Report-only paths: unreadable index, no index, or no flags. Null when a change was requested. */
function reportOnly(out, triage, requested) {
  if (!triage.ok) {
    out.log('features.md is not a pipe table this command can read — run `aioson feature:tidy . --dry-run` to see why.');
    return { ok: false, reason: triage.reason, exitCode: 1 };
  }
  if (triage.reason === 'no_registry') {
    out.log('No .aioson/context/features.md — nothing to triage.');
    return { ok: true, readonly: true, ...triage };
  }
  if (requested) return null;
  logReport(out, triage);
  return { ok: true, readonly: true, ...triage };
}

function refuse(out, refusals) {
  for (const item of refusals) out.log(`✗ ${item.action} ${item.slug}: ${item.reason}`);
  out.log('Nothing was changed.');
  return { ok: false, reason: 'decision_refused', refusals, exitCode: 1 };
}

function preview(out, triage, apply, decisions) {
  for (const decision of decisions) out.log(`  [dry-run] ${decision.action} ${decision.slug}`);
  return { ok: true, dryRun: true, plan: { mechanical: apply ? mechanicalCounts(triage) : null, decisions }, summary: triage.summary };
}

async function runFeatureTriage({ args = [], options = {}, logger } = {}) {
  const targetDir = resolveTargetDir(args);
  const out = options.json || !logger ? SILENT : logger;
  const triageOptions = readTriageOptions(options);
  const apply = Boolean(options.apply);
  const decisions = readDecisions(options);

  const triage = await triageFeatures(targetDir, triageOptions);
  const report = reportOnly(out, triage, apply || decisions.length > 0);
  if (report) return report;

  const includeActive = Boolean(options['include-active'] || options.includeActive);
  const { refusals, readyBySlug } = validateDecisions(decisions, triage, includeActive);
  if (refusals.length > 0) return refuse(out, refusals);
  if (options['dry-run'] || options.dryRun) return preview(out, triage, apply, decisions);

  const steps = apply ? await applyMechanical(targetDir, triage) : [];
  const actions = [];
  for (const decision of decisions) {
    // eslint-disable-next-line no-await-in-loop
    actions.push(await runDecision(targetDir, decision, readyBySlug));
  }
  logActions(out, steps, actions);

  const after = await triageFeatures(targetDir, triageOptions);
  const ok = steps.every((step) => step.ok) && actions.every((action) => action.ok);
  out.log(`\nAfter: ${after.summary.auto} mechanical fix(es), ${after.summary.owner} owner decision(s) left.`);
  return { ok, steps, actions, before: triage.summary, after: after.summary, ...(ok ? {} : { exitCode: 1 }) };
}


module.exports = { runFeatureTriage };
