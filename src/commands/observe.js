'use strict';

/**
 * aioson observe | observation:list | observation:resolve — the project's
 * working memory for what an agent notices outside its current scope.
 *
 *   aioson observe . --kind=defect --summary="Tile in the hall cracked after the floor was laid" \
 *     [--detail="..."] [--paths=src/hall.js,src/floor.js] [--feature=<slug>] [--agent=<self>]
 *   aioson observation:list . [--kind=<kind>] [--feature=<slug>|project] [--all|--resolved] [--json]
 *   aioson observation:resolve . --id=OBS-xxxxxx --as=<fixed|planned|promoted|answered|dismissed> \
 *     [--ref=<plan path|feature slug>] [--why="..."] [--by=<who>]
 *
 * `observe` is one call and never blocks: the feature defaults to the active
 * one (pulse → features.md), the agent to the active one (AIOSON_AGENT → last
 * brief). The owner sees the fan in workflow:status / @neo; the next agent
 * sees its share in context:brief and at the handoff (workflow:next,
 * agent:done, agent:prompt).
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const { resolveTargetDir, resolveProjectRootOrSelf, isProjectRoot } = require('../lib/project-root');
const {
  KINDS, RESOLUTIONS, STALE_DAYS, NEXT_STEP, RELATIVE_PATH, REPAIR_HINT,
  addObservation, listObservations, resolveObservation, describeByKind, validateFeature, closedFeatures, registryFeatureStates
} = require('../lib/observations');

const KIND_LIST = KINDS.join('|');
const RESOLUTION_LIST = RESOLUTIONS.join('|');

function wantsHelp(args, options) {
  return options.help === true || options.h === true || args.includes('--help') || args.includes('-h');
}

function fail(logger, options, message) {
  if (!options.json && logger && logger.error) logger.error(message);
  return { ok: false, exitCode: 1, error: message };
}

// The shell may sit in a subfolder (`cd web && npm test`): walk up to the
// project, as context:guard does, instead of scaffolding `web/.aioson/`.
function projectDir(args) {
  return resolveProjectRootOrSelf(resolveTargetDir(args));
}

function outsideProject(command, targetDir) {
  return isProjectRoot(targetDir) ? null : `${command} — ${targetDir} is not inside an AIOSON project (no .aioson/ here or above); nothing was written`;
}

/** Why observe must not record here, or null. */
function observeRefusal(targetDir, options) {
  const outside = outsideProject('observe', targetDir);
  if (outside) return outside;
  // A bare flag parses as `true`: it would be recorded as the path or detail "true".
  if (options.paths === true || options.path === true) return 'observe — --paths needs a value: --paths=src/a.js,src/b.js';
  if (options.detail === true) return 'observe — --detail needs a value: --detail="..."';
  return null;
}

// What the observer of an item that stays settled does next.
const STAYS_SETTLED = 'it stays settled: continue the current work; record it again with --reopen only for new evidence';

/** `dismissed — cosmetic (owner, 2026-10-20)`: a settled item's outcome. */
function outcomeText(resolution) {
  const ref = resolution.ref ? ` ${resolution.ref}` : '';
  const why = resolution.why ? ` — ${resolution.why}` : '';
  return `${resolution.as}${ref}${why} (${resolution.by}, ${String(resolution.at).slice(0, 10)})`;
}

function recordedVerb({ item, created, reopened, settled }) {
  if (reopened) return 'REOPENED (it came back after being settled)';
  if (created) return 'recorded';
  return `${settled ? 'already settled' : 'already on record'} (seen ${item.seen}×)`;
}

function printRecorded(logger, result) {
  const { item, similar } = result;
  const scope = item.feature ? `feature ${item.feature}` : 'project';
  logger.log(`observe — ${item.id} (${item.kind}) ${recordedVerb(result)} · ${scope}${item.agent ? ` · @${item.agent}` : ''}`);
  if (result.note) logger.log(`  ${result.note}`);
  // Agents paraphrase: the same thing in other words would be a twin.
  for (const other of similar) logger.log(`  possibly already on record: ${other.id} — ${other.summary}`);
  // A dismissal or an answer stands: the observer reads it instead of a next step.
  const tail = result.settled
    ? [`  outcome: ${outcomeText(item.resolution)}`, `  ${STAYS_SETTLED}`]
    : [`  next: ${NEXT_STEP[item.kind]}`, `  settle: aioson observation:resolve . --id=${item.id} --as=<${RESOLUTION_LIST}>`];
  for (const line of tail) logger.log(line);
}

async function defaultFeature(targetDir) {
  try {
    const { resolveActiveFeature } = require('./feature-current');
    const active = await resolveActiveFeature(targetDir);
    const slug = active && !active.ambiguous && active.slug ? validateFeature(active.slug) : null;
    // A pulse still naming a done or abandoned feature binds nothing.
    return slug && !(await closedFeatures(targetDir)).has(slug) ? slug : null;
  } catch {
    return null;
  }
}

// An owner settling from a terminal is the owner; an agent session says
// who it is through AIOSON_AGENT (the latest brief is a guess, not an author).
function envAgent() {
  const value = String(process.env.AIOSON_AGENT || '').trim();
  return value && value.toLowerCase() !== 'auto' ? value : null;
}

const given = (value) => (value != null && value !== true ? String(value) : null);

// From a subfolder, `--paths=src/a.js` names `<subfolder>/src/a.js`: relative
// paths are anchored at the directory the command was given, then the store
// keeps them relative to the project root.
function anchoredPaths(value, invocationDir) {
  if (!value || value === true) return value;
  const entries = Array.isArray(value) ? value : String(value).split(/[,\n]/);
  return entries.map((entry) => {
    const raw = String(entry == null ? '' : entry).trim();
    return raw && !path.isAbsolute(raw) ? path.resolve(invocationDir, raw) : raw;
  });
}

// The same for `--ref`: a relative path is read from the directory the command
// was given, then kept relative to the root. A bare word stays as typed unless
// it names a file there — it may be a feature slug (`checkout-v2.0` included).
async function anchoredRef(ref, invocationDir, root) {
  if (!ref || path.isAbsolute(ref) || path.resolve(invocationDir) === path.resolve(root)) return ref;
  const anchored = path.resolve(invocationDir, ref);
  if (!/[\\/]/.test(ref) && !(await fs.access(anchored).then(() => true, () => false))) return ref;
  return path.relative(root, anchored).split(path.sep).join('/');
}

// An explicit --feature the registry does not list as live still binds the new
// item, but it counts as project-wide (its kind's whole audience hears it)
// until that feature is registered: the observer is told once.
async function projectWideNote(targetDir, { item, created }, options) {
  if (!created || !given(options.feature) || !item.feature) return null;
  if ((await registryFeatureStates(targetDir)).live.has(item.feature)) return null;
  const { t } = require('../i18n').createTranslator(options.locale || process.env.AIOS_LITE_LOCALE || 'en');
  return t('observe.feature_not_live', { feature: item.feature });
}

async function defaultAgent(targetDir) {
  try {
    const { resolveActiveAgent } = require('../lib/active-agent');
    const active = await resolveActiveAgent(targetDir);
    return active && active.agent ? active.agent : null;
  } catch {
    return null;
  }
}

function formatItem(item) {
  const scope = item.feature ? `feature ${item.feature}` : (item.origin_feature ? `project (from ${item.origin_feature})` : 'project');
  const age = item.age_days == null ? '' : ` ${item.age_days}d`;
  const seen = item.seen > 1 ? ` · seen ${item.seen}×` : '';
  const paths = item.paths && item.paths.length > 0 ? ` · ${item.paths.join(', ')}` : '';
  const by = item.agent ? ` · @${item.agent}` : '';
  // A settled item that keeps coming back says so: the triage sees the dismissal may be wrong.
  if (item.status === 'resolved' && item.resolution) return `  ◼ ${item.id} ${item.summary} → ${outcomeText(item.resolution)}${seen}`;
  return `  ◻ ${item.id}${age} ${item.summary} (${scope}${by}${paths}${seen})`;
}

async function runObserve({ args = [], options = {}, logger }) {
  if (wantsHelp(args, options)) {
    const text = `observe — record something noticed outside the current scope; never fix it in passing, never drop it.
Usage:
  aioson observe [path] --kind=<${KIND_LIST}> --summary="<one line>" [--detail="..."] [--paths=a,b] [--feature=<slug>] [--agent=<self>] [--reopen] [--json]
Kinds: defect (something broken, not yours to fix now) · idea (a product/design improvement) · process (how the work could run better next time) · risk (may break later) · question (a choice a later stage will need).
Defaults: --feature = the active feature (a slug; a done or abandoned one binds nothing; a slug that is not live in features.md binds the item, which counts as project-wide until that feature is registered), --agent = the active agent; relative --paths are read from the directory the command runs in. Repeating the same summary raises its seen count. A settled item seen again reopens when it was fixed, or planned/promoted against a plan path that is gone or a feature that has since closed; a dismissed or answered one stays settled in any feature — the answer stands — and prints its outcome (--reopen reopens it for new evidence; its --detail is appended to the earlier one). An open item of the same kind on the same paths or in near-identical words is named as "possibly already on record".
Settle it later: aioson observation:resolve . --id=<id> --as=<${RESOLUTION_LIST}>`;
    if (options.json) return { ok: true, help: true, kinds: KINDS, resolutions: RESOLUTIONS };
    if (logger) logger.log(text);
    return { ok: true, help: true };
  }
  const targetDir = projectDir(args);
  const refusal = observeRefusal(targetDir, options);
  if (refusal) return fail(logger, options, refusal);
  const feature = given(options.feature) || await defaultFeature(targetDir);
  const agent = given(options.agent) || await defaultAgent(targetDir);
  let result;
  try {
    result = await addObservation(targetDir, {
      kind: options.kind,
      summary: options.summary,
      detail: options.detail,
      paths: anchoredPaths(options.paths || options.path || '', resolveTargetDir(args)),
      feature,
      agent,
      reopen: options.reopen === true
    });
  } catch (error) {
    return fail(logger, options, `observe — ${error.message}`);
  }
  const { item, created, reopened, settled, similar = [] } = result;
  const note = await projectWideNote(targetDir, result, options);
  const payload = { ok: true, id: item.id, kind: item.kind, created, reopened, settled, resolution: item.resolution, seen: item.seen, feature: item.feature, agent: item.agent, path: result.path, next_step: settled ? STAYS_SETTLED : NEXT_STEP[item.kind], similar, note };
  if (!options.json) printRecorded(logger, { ...result, note });
  return payload;
}

async function runObservationList({ args = [], options = {}, logger }) {
  if (wantsHelp(args, options)) {
    const text = `observation:list — the fan of open observations, grouped by kind with the next step each one offers.
Usage:
  aioson observation:list [path] [--kind=<${KIND_LIST}>] [--feature=<slug>|project] [--all] [--resolved] [--json]
Open items older than ${STALE_DAYS} days are stale (hygiene:scan names them). An unreadable store exits 1.`;
    if (options.json) return { ok: true, help: true };
    if (logger) logger.log(text);
    return { ok: true, help: true };
  }
  const targetDir = projectDir(args);
  const status = options.resolved ? 'resolved' : (options.all ? 'all' : 'open');
  const kind = options.kind != null && options.kind !== true ? String(options.kind).trim().toLowerCase() : null;
  if (kind && !KINDS.includes(kind)) return fail(logger, options, `observation:list — --kind must be one of: ${KINDS.join(', ')}`);
  const feature = given(options.feature);
  const listed = await listObservations(targetDir, { status, kind, feature });
  // "Nothing open" over a file nobody can read would be a lie.
  if (listed.error) return fail(logger, options, `observation:list — ${RELATIVE_PATH} is unreadable (${listed.error}): ${REPAIR_HINT}`);
  const open = listed.items.filter((item) => item.status === 'open');
  const resolved = listed.items.filter((item) => item.status === 'resolved');
  const byKind = {};
  for (const item of open) byKind[item.kind] = (byKind[item.kind] || 0) + 1;
  const stale = open.filter((item) => item.age_days != null && item.age_days >= STALE_DAYS).length;
  const payload = { ok: true, status, path: listed.path, exists: listed.exists, open: open.length, resolved: resolved.length, stale, by_kind: byKind, items: listed.items };
  if (options.json) return payload;

  if (listed.items.length === 0) {
    logger.log(`observations — nothing ${status === 'all' ? 'on record' : status}${kind ? ` of kind ${kind}` : ''}${feature ? ` for ${feature}` : ''}.`);
    if (status !== 'resolved') logger.log(`  record one: aioson observe . --kind=<${KIND_LIST}> --summary="<one line>"`);
    return payload;
  }
  const head = status === 'resolved'
    ? `observations — ${resolved.length} resolved`
    : `observations — ${open.length} open${open.length ? ` (${describeByKind(byKind)})` : ''}${stale ? ` · ${stale} stale (≥${STALE_DAYS}d)` : ''}${status === 'all' ? ` · ${resolved.length} resolved` : ''}`;
  logger.log(head);
  for (const k of KINDS) {
    const group = open.filter((item) => item.kind === k);
    if (group.length === 0) continue;
    logger.log(`${k} (${group.length}) — next: ${NEXT_STEP[k]}`);
    for (const item of group) logger.log(formatItem(item));
  }
  if (resolved.length > 0 && status !== 'open') {
    logger.log(`resolved (${resolved.length})`);
    for (const item of resolved) logger.log(formatItem(item));
  }
  if (open.length > 0) logger.log(`settle one: aioson observation:resolve . --id=<id> --as=<${RESOLUTION_LIST}> [--ref=<plan|feature>] [--why="..."]`);
  return payload;
}

async function runObservationResolve({ args = [], options = {}, logger }) {
  if (wantsHelp(args, options)) {
    const text = `observation:resolve — settle one observation with the outcome the next reader needs.
Usage:
  aioson observation:resolve [path] --id=OBS-xxxxxx --as=<${RESOLUTION_LIST}> [--ref=<plan path|feature slug>] [--why="..."] [--by=<who>] [--json]
planned/promoted need an existing --ref (a Simple Plan path, a feature slug); dismissed/answered need --why. --by defaults to AIOSON_AGENT, else owner. Observed again, a fixed item reopens, a planned/promoted one reopens once its plan path is gone or its feature has closed, and a dismissed or answered one stays settled in any feature — the answer stands (aioson observe --reopen brings it back for new evidence).`;
    if (options.json) return { ok: true, help: true };
    if (logger) logger.log(text);
    return { ok: true, help: true };
  }
  const targetDir = projectDir(args);
  const outside = outsideProject('observation:resolve', targetDir);
  if (outside) return fail(logger, options, outside);
  let result;
  try {
    result = await resolveObservation(targetDir, {
      id: options.id,
      as: options.as,
      ref: await anchoredRef(given(options.ref), resolveTargetDir(args), targetDir),
      why: given(options.why),
      by: given(options.by) || given(options.agent) || envAgent() || 'owner'
    });
  } catch (error) {
    return fail(logger, options, `observation:resolve — ${error.message}`);
  }
  const { item } = result;
  const payload = { ok: true, id: item.id, kind: item.kind, status: item.status, resolution: item.resolution, superseded: result.superseded, path: result.path };
  if (options.json) return payload;
  const r = item.resolution;
  logger.log(`observation:resolve — ${item.id} (${item.kind}) → ${r.as}${r.ref ? ` ${r.ref}` : ''}${r.why ? ` — ${r.why}` : ''} (by ${r.by})${result.superseded ? ' · earlier outcome kept as history' : ''}`);
  return payload;
}

module.exports = { runObserve, runObservationList, runObservationResolve, defaultFeature };
