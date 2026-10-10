'use strict';

/**
 * Feature lifecycle triage — where every registered feature really stands.
 *
 * features.md says what an agent last wrote; the context tree says what
 * happened. Measured on consumer projects: features with a current QA PASS
 * still `in_progress` for weeks (delivered, never closed), rows written as
 * `in-progress`/`active` that no reader matches, closed rows whose documents
 * never left the live context, and open features nobody touched in months.
 * No gate saw any of it — closing only happens when an agent remembers to.
 *
 * This module only measures. Each finding names who decides:
 *   - `auto`     — mechanical, no judgment (alias spelling, archive a closed row);
 *   - `owner`    — needs the owner's call (close what QA passed, pause/abandon
 *                  what went quiet); the CLI refuses to guess it.
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const { contextDir, readFileSafe, readFeatureArtifactSafe, parseFrontmatter, readProjectPulse } = require('../preflight-engine');
const { parseFeatureRegistry, KNOWN_STATUSES } = require('./feature-registry');
const { collectFeatureArtifacts } = require('../commands/feature-archive');

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_STALE_DAYS = 21;
const DEFAULT_PAUSED_STALE_DAYS = 60;
// Tooling writes beside a QA report right after it (dossier, telemetry);
// only a change well after the verdict means the work moved on.
const QA_GRACE_MS = 30 * 60 * 1000;
const WALK_LIMIT = 400;

const OPEN_STATUSES = new Set(['planning', 'in_progress', 'qa_failed', 'qa_blocked', 'paused']);
const CLOSED_STATUSES = new Set(['done', 'abandoned']);
const QA_ACCEPTED = new Set(['pass', 'accepted_with_followups']);
const NONE = new Set(['', '(none)', 'none', 'null', '-', '—', 'n/a']);

function normalizeVerdict(raw) {
  const value = String(raw || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (['pass', 'passed', 'approved', 'aprovado', 'aprovada', 'pass_with_note', 'pass_with_warnings'].includes(value)) return 'pass';
  if (value === 'accepted_with_followups') return 'accepted_with_followups';
  if (['fail', 'failed', 'reprovado', 'reprovada', 'rejected'].includes(value)) return 'fail';
  if (['blocked', 'bloqueado', 'bloqueada'].includes(value)) return 'blocked';
  return value || null;
}

/** The verdict a QA report declares: frontmatter first, then a `Verdict:` line. */
function qaVerdictFrom(content) {
  if (!content) return null;
  const fm = parseFrontmatter(content) || {};
  const body = (String(content).match(/(?:\*\*)?(?:verdict|veredito)(?:\*\*)?\s*:\s*(?:\*\*)?\s*([A-Za-z_-]+)/i) || [])[1];
  return normalizeVerdict(fm.verdict || body || fm.status);
}

async function statSafe(target) {
  try {
    return await fs.stat(target);
  } catch {
    return null;
  }
}

/** Newest mtime under a directory, bounded so a huge folder never stalls a scan. */
async function newestUnder(dir, budget = { left: WALK_LIMIT }) {
  let newest = 0;
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    if (budget.left <= 0) break;
    budget.left -= 1;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // eslint-disable-next-line no-await-in-loop
      newest = Math.max(newest, await newestUnder(full, budget));
    } else {
      // eslint-disable-next-line no-await-in-loop
      const stat = await statSafe(full);
      if (stat) newest = Math.max(newest, stat.mtimeMs);
    }
  }
  return newest;
}

function isoDay(value) {
  return /^\d{4}-\d{2}-\d{2}/.test(String(value || '')) ? String(value).slice(0, 10) : null;
}

function daysBetween(fromMs, toMs) {
  return Math.max(0, Math.floor((toMs - fromMs) / DAY_MS));
}

async function measureActivity(targetDir, ctxDir, slug) {
  const { rootFiles, dirs } = await collectFeatureArtifacts({ ctxDir, targetDir, slug, includeDone: false });
  let newest = 0;
  let newestSpec = 0;
  let qaMtime = 0;
  for (const name of rootFiles) {
    // eslint-disable-next-line no-await-in-loop
    const stat = await statSafe(path.join(ctxDir, name));
    if (!stat) continue;
    newest = Math.max(newest, stat.mtimeMs);
    if (/^qa-report-/i.test(name)) qaMtime = Math.max(qaMtime, stat.mtimeMs);
    else if (!/^(verify-artifact|spec-analyze|rules-check)/i.test(name)) newestSpec = Math.max(newestSpec, stat.mtimeMs);
  }
  for (const dir of dirs) {
    // eslint-disable-next-line no-await-in-loop
    const dirNewest = await newestUnder(dir.sourceDir);
    newest = Math.max(newest, dirNewest);
    if (dir.label === 'plans') newestSpec = Math.max(newestSpec, dirNewest);
  }
  return { liveFiles: rootFiles.length, liveDirs: dirs.map((dir) => dir.label), newest, newestSpec, qaMtime };
}

async function readActiveSignals(targetDir, ctxDir) {
  const pulse = await readProjectPulse(targetDir);
  const pulseSlug = pulse && pulse.exists ? String(pulse.active_feature || '').trim().toLowerCase() : '';
  const devState = parseFrontmatter(await readFileSafe(path.join(ctxDir, 'dev-state.md')) || '') || {};
  const devSlug = String(devState.active_feature || '').trim().toLowerCase();
  const devStatus = String(devState.status || '').trim().toLowerCase();
  return {
    pulse: NONE.has(pulseSlug) ? '' : pulseSlug,
    devState: NONE.has(devSlug) || devStatus !== 'in_progress' ? '' : devSlug
  };
}

function finding(kind, decides, reason, commands, extra = {}) {
  return { kind, decides, reason, commands, ...extra };
}

function closeVerdict(qaVerdict) {
  return qaVerdict === 'accepted_with_followups' ? 'ACCEPTED_WITH_FOLLOWUPS' : 'PASS';
}

function spellingFinding(row) {
  if (row.rawStatus !== row.status) {
    return finding('status_alias', 'auto',
      `status "${row.rawStatus}" is not read by routing, sweep or hygiene — it means ${row.status}`,
      ['aioson feature:tidy .'], { canonical: row.status });
  }
  if (KNOWN_STATUSES.has(row.status)) return null;
  return finding('unknown_status', 'owner',
    `status "${row.status}" has no lifecycle meaning; done comes only from feature:close`,
    [`aioson feature:close . --feature=${row.slug} --verdict=PASS --preflight`, `aioson feature:register . --feature=${row.slug} --status=in_progress|paused|abandoned`]);
}

function closedFinding(row, signals) {
  if (signals.liveFiles === 0 && signals.liveDirs.length === 0) return null;
  const left = [
    signals.liveFiles > 0 ? `${signals.liveFiles} context file(s)` : '',
    signals.liveDirs.length > 0 ? `its ${signals.liveDirs.join('/')} folder(s)` : ''
  ].filter(Boolean).join(' and ');
  return finding('closed_not_archived', 'auto', `feature is ${row.status} but ${left} still sit in the live context`, ['aioson feature:sweep .']);
}

function idleDaysOf(row, signals, now) {
  const started = isoDay(row.started);
  const lastActivityMs = signals.newest || (started ? Date.parse(`${started}T00:00:00Z`) : 0);
  return lastActivityMs ? daysBetween(lastActivityMs, now) : null;
}

function readyFinding(row, signals, idleDays) {
  const { slug } = row;
  const verdict = closeVerdict(signals.qaVerdict);
  const preflight = `aioson feature:close . --feature=${slug} --verdict=${verdict} --preflight`;
  const changedAfterQa = signals.qaMtime > 0 && signals.newestSpec > signals.qaMtime + QA_GRACE_MS;
  const extra = { verdict, changed_after_qa: changedAfterQa, idle_days: idleDays };
  if (changedAfterQa) {
    return finding('ready_to_close', 'owner',
      `QA verdict is ${signals.qaVerdict} but the spec/plan changed after it — re-verify before closing`,
      [`@qa re-verification of ${slug}`, preflight], extra);
  }
  return finding('ready_to_close', 'owner',
    `QA verdict is ${signals.qaVerdict} and the row is still ${row.status} — delivered, never closed`,
    [preflight, `aioson feature:triage . --close=${slug}`], extra);
}

function staleFinding(row, signals, idleDays, limits) {
  const paused = row.status === 'paused';
  const limit = paused ? limits.pausedStaleDays : limits.staleDays;
  if (signals.active || idleDays === null || idleDays < limit) return null;
  const { slug } = row;
  const lastQa = signals.qaVerdict ? ` (last QA: ${signals.qaVerdict})` : '';
  const commands = paused
    ? [`aioson feature:triage . --resume=${slug}`, `aioson feature:triage . --abandon=${slug}`]
    : [`aioson feature:triage . --pause=${slug}`, `aioson feature:triage . --abandon=${slug}`, `@dev to resume ${slug}`];
  return finding(paused ? 'stale_paused' : 'stale_open', 'owner',
    `${row.status} with no artifact activity for ${idleDays} day(s)${lastQa}`,
    commands, { idle_days: idleDays, qa_verdict: signals.qaVerdict || null });
}

function lifecycleFinding(row, signals, limits) {
  if (CLOSED_STATUSES.has(row.status)) return closedFinding(row, signals);
  if (!OPEN_STATUSES.has(row.status)) return null;
  const idleDays = idleDaysOf(row, signals, limits.now);
  if (QA_ACCEPTED.has(signals.qaVerdict)) return readyFinding(row, signals, idleDays);
  return staleFinding(row, signals, idleDays, limits);
}

/**
 * Findings for one row: the spelling finding (independent of where the work
 * stands) plus at most one lifecycle finding. A status with no lifecycle
 * meaning stops there — nothing else about it can be read.
 */
function classifyRow(row, signals, limits) {
  const spelling = spellingFinding(row);
  if (spelling && spelling.kind === 'unknown_status') return [spelling];
  return [spelling, lifecycleFinding(row, signals, limits)].filter(Boolean);
}

/**
 * The pulse naming a closed feature keeps routing agents into finished work;
 * naming a slug with no trace at all points them at nothing. Pre-PRD work
 * (a briefing or feature folder, a simple plan) is legitimately unregistered.
 */
async function pulseFindings(targetDir, ctxDir, pulseSlug, rows) {
  if (!pulseSlug || !/^[a-z0-9][a-z0-9_-]*$/.test(pulseSlug)) return [];
  const row = rows.find((entry) => entry.slug === pulseSlug);
  const archivedIn = [];
  for (const bucket of ['done', 'abandoned']) {
    // eslint-disable-next-line no-await-in-loop
    if (await statSafe(path.join(ctxDir, bucket, pulseSlug))) archivedIn.push(bucket);
  }
  if ((row && CLOSED_STATUSES.has(row.status)) || (!row && archivedIn.length > 0)) {
    return [finding('active_is_closed', 'auto',
      `project-pulse still names "${pulseSlug}" as the active feature, but it is ${row ? row.status : `archived in ${archivedIn[0]}/`}`,
      ['aioson pulse:update . --feature=none'], { slug: pulseSlug })];
  }
  if (row) return [];
  const traces = [
    path.join(targetDir, '.aioson', 'briefings', pulseSlug),
    path.join(ctxDir, 'features', pulseSlug),
    path.join(ctxDir, 'simple-plans', pulseSlug),
    path.join(ctxDir, 'simple-plans', `${pulseSlug}.md`),
    path.join(ctxDir, `prd-${pulseSlug}.md`)
  ];
  for (const trace of traces) {
    // eslint-disable-next-line no-await-in-loop
    if (await statSafe(trace)) return [];
  }
  return [finding('active_not_registered', 'owner',
    `project-pulse names "${pulseSlug}" as the active feature but nothing in the project carries that slug`,
    [`aioson feature:register . --feature=${pulseSlug} --status=in_progress`, 'aioson pulse:update . --feature=none'],
    { slug: pulseSlug })];
}

/**
 * Classify every row of features.md.
 *
 * @returns {Promise<{ok: boolean, reason?: string, active: {pulse: string, devState: string},
 *   features: object[], project: object[], summary: object}>}
 */
async function triageFeatures(targetDir, options = {}) {
  const now = options.now ? options.now() : Date.now();
  const staleDays = Number.isFinite(options.staleDays) ? options.staleDays : DEFAULT_STALE_DAYS;
  const pausedStaleDays = Number.isFinite(options.pausedStaleDays) ? options.pausedStaleDays : DEFAULT_PAUSED_STALE_DAYS;
  const ctxDir = contextDir(targetDir);
  const content = await readFileSafe(path.join(ctxDir, 'features.md'));
  if (content === null || content === undefined || content === '') {
    return { ok: true, reason: 'no_registry', active: { pulse: '', devState: '' }, features: [], project: [], summary: summarize([], []) };
  }
  const registry = parseFeatureRegistry(content);
  if (!registry.recognized) return { ok: false, reason: 'unrecognized_format', features: [], project: [], summary: summarize([], []) };

  const active = await readActiveSignals(targetDir, ctxDir);
  const activeSlugs = new Set([active.pulse, active.devState].filter(Boolean));
  const features = [];
  for (const row of registry.rows) {
    const closed = CLOSED_STATUSES.has(row.status);
    // eslint-disable-next-line no-await-in-loop
    const activity = await measureActivity(targetDir, ctxDir, row.slug);
    // eslint-disable-next-line no-await-in-loop
    const qaVerdict = closed ? null : qaVerdictFrom(await readFeatureArtifactSafe(targetDir, row.slug, `qa-report-${row.slug}.md`));
    const signals = { ...activity, qaVerdict, active: activeSlugs.has(row.slug) };
    const findings = classifyRow(row, signals, { now, staleDays, pausedStaleDays });
    features.push({
      slug: row.slug,
      status: row.status,
      raw_status: row.rawStatus,
      started: isoDay(row.started),
      active: signals.active,
      qa_verdict: qaVerdict,
      last_activity: activity.newest ? new Date(activity.newest).toISOString().slice(0, 10) : null,
      live_files: activity.liveFiles,
      findings
    });
  }

  const project = await pulseFindings(targetDir, ctxDir, active.pulse, registry.rows);
  const open = registry.rows.filter((row) => ['in_progress', 'qa_failed', 'qa_blocked'].includes(row.status));
  return { ok: true, active, thresholds: { stale_days: staleDays, paused_stale_days: pausedStaleDays }, features, project, summary: summarize(features, project, open.length) };
}

function summarize(features, project, openCount = 0) {
  const counts = {};
  let auto = 0;
  let owner = 0;
  for (const item of [...features.flatMap((feature) => feature.findings), ...project]) {
    counts[item.kind] = (counts[item.kind] || 0) + 1;
    if (item.decides === 'auto') auto += 1;
    else owner += 1;
  }
  return {
    status: auto + owner === 0 ? 'clean' : 'attention',
    open_features: openCount,
    auto,
    owner,
    counts
  };
}

/** Flat list of `{slug, ...finding}` for one kind. */
function findingsOf(triage, kind) {
  return triage.features.flatMap((feature) => feature.findings
    .filter((item) => item.kind === kind)
    .map((item) => ({ slug: feature.slug, status: feature.status, ...item })));
}

/**
 * i18n params for the doctor/update advisory, or null when nothing is
 * pending. Never throws: an unreadable tree is not an advisory.
 */
async function featureLifecycleParams(targetDir) {
  let triage;
  try {
    triage = await triageFeatures(targetDir);
  } catch {
    return null;
  }
  if (!triage || !triage.ok) return null;
  const count = (kind) => findingsOf(triage, kind).length;
  const params = {
    ready: count('ready_to_close'),
    stale: count('stale_open') + count('stale_paused'),
    unarchived: count('closed_not_archived')
  };
  return params.ready + params.stale + params.unarchived > 0 ? params : null;
}

module.exports = {
  featureLifecycleParams,
  findingsOf,
  qaVerdictFrom,
  triageFeatures
};
