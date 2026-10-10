'use strict';

/**
 * aioson storage:triage — how much disk aioson itself takes in this project
 * (and, with --global, on this machine), and the cleanup that is safe.
 *
 * Without flags it only reads (src/lib/storage-footprint.js). The mechanical
 * half runs with --apply: doc snapshots and update rollback folders past
 * their retention are removed, oversized logs keep their head and tail, and
 * (--global) the old machine-wide recall index is retired. Heavy
 * paths aioson cannot regenerate — scratch an agent left in .aioson, a backup
 * aioson did not write, raw research output — are the owner's call and go
 * only when named one by one:
 *   --remove=<path>[,<path>]   exactly as the report prints it
 * Every removal is checked before any runs: one unknown path and nothing
 * changes. --dry-run previews either half.
 *
 * Usage:
 *   aioson storage:triage . [--json] [--global]
 *   aioson storage:triage . --apply [--global] [--dry-run]
 *   aioson storage:triage . --remove=.aioson/runtime/scratch-db [--dry-run]
 */

const { resolveTargetDir } = require('../lib/project-root');
const { formatBytes } = require('../lib/evidence-artifacts');
const {
  measureStorage,
  applyAutoFindings,
  findOwnerFinding,
  removeOwnerFinding
} = require('../lib/storage-footprint');

const SILENT = { log() {}, error() {}, warn() {} };

function listPaths(value) {
  if (value === undefined || value === null || value === true || value === false) return [];
  return String(value).split(',').map((item) => item.trim()).filter(Boolean);
}

function logReport(out, report) {
  const { summary, footprint } = report;
  out.log(`storage:triage — ${summary.status}: .aioson weighs ${formatBytes(footprint.aioson_bytes)}; ${summary.auto} mechanical cleanup(s) (${formatBytes(summary.reclaimable_bytes)}), ${summary.owner} owner decision(s) (${formatBytes(summary.owner_bytes)})`);
  if (summary.partial) out.log('  (weights are partial: the walk stopped at its entry budget)');
  const groups = [
    ['auto', 'Mechanical (--apply)'],
    ['owner', 'Owner decisions (--remove=<path>, one by one)']
  ];
  for (const [decides, title] of groups) {
    const items = report.findings.filter((item) => item.decides === decides);
    if (items.length === 0) continue;
    out.log(`\n${title}:`);
    for (const item of items) out.log(`  • ${item.path} — ${item.reason}`);
  }
}

function validateRemovals(paths, report) {
  const chosen = [];
  const refusals = [];
  for (const id of paths) {
    const item = findOwnerFinding(report, id);
    if (item) chosen.push(item);
    else refusals.push({ path: id, reason: `${id} is not a heavy path this report lists — name it exactly as storage:triage prints it` });
  }
  return { chosen, refusals };
}

function refuse(out, refusals) {
  for (const item of refusals) out.log(`✗ remove ${item.path}: ${item.reason}`);
  out.log('Nothing was changed.');
  return { ok: false, reason: 'removal_refused', refusals, exitCode: 1 };
}

function preview(out, report, apply, chosen) {
  const auto = apply ? report.findings.filter((item) => item.decides === 'auto') : [];
  const planned = [...auto, ...chosen];
  for (const item of planned) out.log(`  [dry-run] ${item.decides === 'auto' ? 'clean' : 'remove'} ${item.path} — ${item.reason}`);
  const bytes = planned.reduce((total, item) => total + (item.bytes || 0), 0);
  out.log(`Would free about ${formatBytes(bytes)}. Nothing was changed.`);
  return { ok: true, dryRun: true, plan: { apply: auto, remove: chosen }, would_free_bytes: bytes, summary: report.summary };
}

const STEP_TEXT = {
  doc_snapshots: (step) => `${step.removed} snapshot(s) removed`,
  rollback_backups: (step) => `${step.removed} rollback folder(s) removed`,
  oversized_log: () => 'trimmed to its head and tail',
  legacy_recall_index: () => 'retired',
  heavy_path: () => 'removed'
};

function logSteps(out, steps) {
  for (const step of steps) {
    const text = step.ok ? `${STEP_TEXT[step.kind](step)}, ${formatBytes(step.bytes)} freed` : (step.error || 'failed');
    out.log(`  ${step.ok ? '✓' : '✗'} ${step.id}: ${text}`);
  }
}

async function runStorageTriage({ args = [], options = {}, logger } = {}) {
  const targetDir = resolveTargetDir(args);
  const out = options.json || !logger ? SILENT : logger;
  const global = Boolean(options.global);
  const apply = Boolean(options.apply);
  const removals = listPaths(options.remove);

  const report = measureStorage(targetDir, { global });
  if (!apply && removals.length === 0) {
    logReport(out, report);
    return { ok: true, readonly: true, ...report };
  }

  const { chosen, refusals } = validateRemovals(removals, report);
  if (refusals.length > 0) return refuse(out, refusals);
  if (options['dry-run'] || options.dryRun) return preview(out, report, apply, chosen);

  const steps = [
    ...(apply ? applyAutoFindings(report) : []),
    ...chosen.map((item) => removeOwnerFinding(targetDir, item))
  ];
  logSteps(out, steps);

  const freed = steps.reduce((total, step) => total + (step.bytes || 0), 0);
  const after = measureStorage(targetDir, { global, sizes: false });
  const ok = steps.every((step) => step.ok);
  out.log(`\nFreed ${formatBytes(freed)}. Left: ${after.summary.auto} mechanical cleanup(s), ${after.summary.owner} owner decision(s).`);
  return { ok, steps, freed_bytes: freed, before: report.summary, after: after.summary, ...(ok ? {} : { exitCode: 1 }) };
}

module.exports = { runStorageTriage };
