'use strict';

/**
 * Project observations — the working memory of a site in progress.
 *
 * An agent plastering one wall notices a tile someone else laid has cracked,
 * that the stairs could use one more step, that the cement should be delivered
 * closer to the mixer next time, that phase 4 will have to pick mixer-or-floor.
 * None of that is its job right now; all of it is lost the moment the session
 * compacts, or worse, "fixed in passing" outside the approved scope. Every
 * existing carrier is narrower: `op:capture` is the operator's standing
 * decisions, `decide`/`decision:add` are choices that block, the continuity
 * mapping is feature-bound and dies at close, delivery followups exist only
 * for verified minor defects at QA, learnings are written after the fact.
 *
 * This store is the hub between them: one typed line per thing noticed, kept
 * at the project level (a feature-bound item is carried to the project when
 * its feature closes — never deleted), surfaced where the owner already looks
 * (`workflow:status`, @neo, the handoff of `workflow:next`, each agent's
 * `context:brief`, `hygiene:scan` when it goes stale, the compaction recap)
 * and settled once with a recorded outcome (`observation:resolve`). It is
 * noncanonical memory: never scope, never approval, never a gate.
 *
 * File: `.aioson/context/observations.json` — JSON so every harness and the
 * owner can read it without the CLI; the CLI is its single writer.
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { redactTelemetryText } = require('./telemetry-redaction');

const SCHEMA_VERSION = 'project-observations/v1';
const RELATIVE_PATH = '.aioson/context/observations.json';
const KINDS = ['defect', 'idea', 'process', 'risk', 'question'];
const RESOLUTIONS = ['fixed', 'planned', 'promoted', 'answered', 'dismissed'];
const STALE_DAYS = 30;
const MIN_SUMMARY_CHARS = 8;
const MAX_SUMMARY_CHARS = 240;
const MAX_DETAIL_CHARS = 1200;
const MAX_PATHS = 12;
const DEFAULT_LIMIT = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

// Which agents hear about an open item at session start and at handoff. A
// `process` item is the owner's (status, @neo, hygiene), never an agent's.
const AUDIENCE = {
  defect: ['dev', 'qa', 'tester', 'planner'],
  risk: ['dev', 'qa', 'tester', 'pentester', 'planner', 'sheldon'],
  idea: ['product', 'briefing', 'refiner', 'sheldon'],
  process: [],
  question: ['product', 'sheldon', 'planner', 'dev', 'qa']
};

// A defect, a risk or a question concerns the feature (or paths) it was seen
// in; an idea is for whoever scopes the next feature, wherever it was noticed.
const FEATURE_BOUND_KINDS = new Set(['defect', 'risk', 'question']);

// The one line that makes an open item an option instead of a note.
const NEXT_STEP = {
  defect: 'fix it through a Simple Plan (@dev) or inside the feature it belongs to, or dismiss it with a reason',
  idea: 'offer it to @product/@briefing when the next feature is scoped, or dismiss it with a reason',
  process: 'turn it into a rule (rule:new), a learning, or an operator decision (op:capture), or dismiss it',
  risk: 'hand it to @qa/@pentester at the next review, plan it, or dismiss it with a reason',
  question: 'answer it (--as=answered --why="<answer>") before the stage that needs the answer'
};

function observationsPath(targetDir) {
  return path.join(targetDir, RELATIVE_PATH);
}

function nowIso(now) {
  return new Date(now == null ? Date.now() : now).toISOString();
}

function emptyStore() {
  return { schema_version: SCHEMA_VERSION, items: [] };
}

/** Accent-insensitive, punctuation-insensitive form used for the identity hash. */
function normalizeSummary(text) {
  return String(text == null ? '' : text)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function observationId(kind, summary) {
  const digest = crypto.createHash('sha1').update(`${kind}|${normalizeSummary(summary)}`).digest('hex');
  return `OBS-${digest.slice(0, 6)}`;
}

function normalizeAgent(value) {
  const agent = String(value == null ? '' : value).trim().replace(/^@/, '').toLowerCase();
  return agent || null;
}

function normalizeFeature(value) {
  const slug = String(value == null ? '' : value).trim();
  if (!slug || ['none', '(none)', 'null', '-', 'n/a'].includes(slug.toLowerCase())) return null;
  return slug;
}

function normalizePaths(value) {
  const raw = Array.isArray(value) ? value : String(value == null ? '' : value).split(/[,\n]/);
  const out = [];
  for (const entry of raw) {
    const rel = String(entry || '').trim().replace(/\\/g, '/').replace(/^\.\//, '');
    if (!rel || out.includes(rel)) continue;
    out.push(rel);
    if (out.length >= MAX_PATHS) break;
  }
  return out;
}

function oneLine(text, max) {
  const flat = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

function ageDays(item, now) {
  const created = Date.parse(item.created_at || '');
  if (!Number.isFinite(created)) return null;
  return Math.max(0, Math.floor(((now == null ? Date.now() : now) - created) / DAY_MS));
}

/**
 * Tolerant reader for the surfaces (status, brief, hygiene, recap): a missing
 * file is an empty store; a corrupt one is reported, never thrown.
 */
async function readStore(targetDir) {
  let raw;
  try {
    raw = await fs.readFile(observationsPath(targetDir), 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') return { store: emptyStore(), exists: false, error: null };
    return { store: emptyStore(), exists: false, error: error.message };
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.items)) {
      return { store: emptyStore(), exists: true, error: 'observations.json must hold { schema_version, items[] }' };
    }
    return { store: parsed, exists: true, error: null };
  } catch (error) {
    return { store: emptyStore(), exists: true, error: `invalid JSON: ${error.message}` };
  }
}

/** Writers refuse to overwrite a store they could not read: a corrupt file is the owner's to look at. */
async function readStoreForWrite(targetDir) {
  const current = await readStore(targetDir);
  if (current.error) throw new Error(`${RELATIVE_PATH} is unreadable (${current.error}); repair or remove it before writing`);
  return current.store;
}

async function writeStore(targetDir, store) {
  const file = observationsPath(targetDir);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
  let lastError = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      await fs.rename(tmp, file);
      return file;
    } catch (error) {
      lastError = error;
      if (!['EPERM', 'EBUSY', 'EACCES'].includes(error && error.code)) break;
      await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
    }
  }
  try { await fs.rm(tmp, { force: true }); } catch { /* best-effort */ }
  throw lastError;
}

function validateKind(kind) {
  const value = String(kind == null ? '' : kind).trim().toLowerCase();
  if (!KINDS.includes(value)) throw new Error(`--kind must be one of: ${KINDS.join(', ')} (got '${kind == null ? '' : kind}')`);
  return value;
}

function validateSummary(summary) {
  const value = oneLine(summary, MAX_SUMMARY_CHARS);
  if (value.length < MIN_SUMMARY_CHARS) throw new Error(`--summary needs at least ${MIN_SUMMARY_CHARS} characters, one line, in domain words`);
  return redactTelemetryText(value);
}

/**
 * Record one thing noticed. Idempotent on (kind, summary): a repeat raises
 * `seen` instead of duplicating; a repeat of a resolved item reopens it and
 * keeps the earlier outcome as history — something that came back is news.
 */
async function addObservation(targetDir, input = {}, { now } = {}) {
  const kind = validateKind(input.kind);
  const summary = validateSummary(input.summary);
  const detail = input.detail ? redactTelemetryText(oneLine(input.detail, MAX_DETAIL_CHARS)) : null;
  const paths = normalizePaths(input.paths);
  const feature = normalizeFeature(input.feature);
  const agent = normalizeAgent(input.agent);
  const at = nowIso(now);
  const id = observationId(kind, summary);

  const store = await readStoreForWrite(targetDir);
  const existing = store.items.find((item) => item && item.id === id);
  let created = false;
  let reopened = false;
  let item;
  if (!existing) {
    created = true;
    item = {
      id,
      kind,
      summary,
      detail,
      paths,
      feature,
      origin_feature: null,
      agent,
      status: 'open',
      seen: 1,
      created_at: at,
      updated_at: at,
      resolution: null
    };
    store.items.push(item);
  } else {
    item = existing;
    item.seen = (Number(item.seen) || 1) + 1;
    item.updated_at = at;
    if (detail && !item.detail) item.detail = detail;
    for (const rel of paths) if (!item.paths.includes(rel) && item.paths.length < MAX_PATHS) item.paths.push(rel);
    if (feature && !item.feature && !item.origin_feature) item.feature = feature;
    if (agent && !item.agent) item.agent = agent;
    if (item.status !== 'open') {
      reopened = true;
      item.history = Array.isArray(item.history) ? item.history : [];
      item.history.push({ ...item.resolution, reopened_at: at });
      item.resolution = null;
      item.status = 'open';
      item.created_at = at;
    }
  }
  const file = await writeStore(targetDir, store);
  return { item, created, reopened, path: path.relative(targetDir, file).replace(/\\/g, '/') };
}

function decorate(item, now) {
  return { ...item, age_days: ageDays(item, now), next_step: NEXT_STEP[item.kind] || null };
}

function sortOpenFirstNewest(a, b) {
  if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
  return String(b.updated_at || '').localeCompare(String(a.updated_at || ''));
}

/**
 * @param {object} [filter]
 * @param {'open'|'resolved'|'all'} [filter.status='open']
 * @param {string} [filter.kind]
 * @param {string} [filter.feature]  exact feature, or `project` for unbound items
 */
async function listObservations(targetDir, filter = {}, { now } = {}) {
  const current = await readStore(targetDir);
  const status = filter.status || 'open';
  const kind = filter.kind ? String(filter.kind).trim().toLowerCase() : null;
  const feature = filter.feature ? String(filter.feature).trim() : null;
  const items = current.store.items
    .filter((item) => item && typeof item === 'object' && item.id)
    .filter((item) => status === 'all' || item.status === status)
    .filter((item) => !kind || item.kind === kind)
    .filter((item) => !feature || (feature === 'project' ? !item.feature : item.feature === feature))
    .sort(sortOpenFirstNewest)
    .map((item) => decorate(item, now));
  return { items, exists: current.exists, error: current.error, path: RELATIVE_PATH };
}

function looksLikePath(ref) {
  return /[\\/]/.test(ref) || /\.[a-z0-9]{1,6}$/i.test(ref);
}

async function fileExists(file) {
  try { await fs.access(file); return true; } catch { return false; }
}

async function readTextSafe(file) {
  try { return await fs.readFile(file, 'utf8'); } catch { return ''; }
}

/**
 * A promotion/plan reference must point at something that exists: a path in
 * the project, or a feature known to the registry, a briefing, or the archive.
 * An outcome recorded against nothing is how an item gets lost while "handled".
 */
async function refExists(targetDir, ref) {
  const value = String(ref || '').trim();
  if (!value) return { ok: false, reason: 'empty' };
  if (looksLikePath(value)) {
    const resolved = path.resolve(targetDir, value);
    const inside = !path.relative(targetDir, resolved).startsWith('..');
    if (!inside) return { ok: false, reason: 'outside the project' };
    return (await fileExists(resolved)) ? { ok: true, kind: 'path' } : { ok: false, reason: 'path does not exist' };
  }
  const slug = value;
  const features = await readTextSafe(path.join(targetDir, '.aioson', 'context', 'features.md'));
  const slugRe = new RegExp(`(^|[|\\s\`])${slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([|\\s\`]|$)`, 'm');
  if (slugRe.test(features)) return { ok: true, kind: 'feature' };
  for (const candidate of [
    path.join(targetDir, '.aioson', 'briefings', slug),
    path.join(targetDir, '.aioson', 'context', 'features', slug),
    path.join(targetDir, '.aioson', 'context', 'done', slug),
    path.join(targetDir, '.aioson', 'context', `prd-${slug}.md`)
  ]) {
    if (await fileExists(candidate)) return { ok: true, kind: 'feature' };
  }
  return { ok: false, reason: 'neither an existing path nor a known feature slug' };
}

/**
 * Settle an item once, with the outcome the next reader needs. `planned` and
 * `promoted` need an existing `ref`; `dismissed` and `answered` need a `why`.
 */
async function resolveObservation(targetDir, input = {}, { now } = {}) {
  // Ids print as `OBS-` + lowercase hex; accept any casing the owner types.
  const id = String(input.id == null ? '' : input.id).trim().replace(/^obs-/i, 'OBS-').replace(/^(OBS-)(.*)$/, (_m, p, hex) => p + hex.toLowerCase());
  if (!id) throw new Error('--id=<OBS-xxxxxx> is required');
  const as = String(input.as == null ? '' : input.as).trim().toLowerCase();
  if (!RESOLUTIONS.includes(as)) throw new Error(`--as must be one of: ${RESOLUTIONS.join(', ')} (got '${input.as == null ? '' : input.as}')`);
  const ref = input.ref ? String(input.ref).trim() : null;
  const why = input.why ? redactTelemetryText(oneLine(input.why, MAX_DETAIL_CHARS)) : null;
  if ((as === 'dismissed' || as === 'answered') && !why) throw new Error(`--as=${as} needs --why="<reason or answer>"`);
  if ((as === 'planned' || as === 'promoted') && !ref) throw new Error(`--as=${as} needs --ref=<existing plan path or feature slug>`);
  if (ref) {
    const check = await refExists(targetDir, ref);
    if (!check.ok) throw new Error(`--ref='${ref}' is ${check.reason} — record the outcome against something that exists`);
  }

  const store = await readStoreForWrite(targetDir);
  const item = store.items.find((entry) => entry && entry.id === id);
  if (!item) throw new Error(`${id} is not on record (aioson observation:list . --all)`);
  const at = nowIso(now);
  const previous = item.status === 'resolved' ? item.resolution : null;
  if (previous) {
    item.history = Array.isArray(item.history) ? item.history : [];
    item.history.push({ ...previous, superseded_at: at });
  }
  item.status = 'resolved';
  item.updated_at = at;
  item.resolution = { as, ref, why, by: normalizeAgent(input.by) || 'owner', at };
  await writeStore(targetDir, store);
  return { item: decorate(item, now), superseded: Boolean(previous), path: RELATIVE_PATH };
}

/** What the owner's cockpit shows: counts by kind, stale count, the head. */
async function summarizeOpen(targetDir, { now, limit = DEFAULT_LIMIT } = {}) {
  const listed = await listObservations(targetDir, { status: 'open' }, { now });
  const byKind = {};
  for (const kind of KINDS) byKind[kind] = 0;
  let stale = 0;
  for (const item of listed.items) {
    byKind[item.kind] = (byKind[item.kind] || 0) + 1;
    if (item.age_days != null && item.age_days >= STALE_DAYS) stale += 1;
  }
  const items = listed.items.slice(0, limit).map((item) => ({
    id: item.id, kind: item.kind, summary: item.summary, feature: item.feature, age_days: item.age_days
  }));
  return { total: listed.items.length, by_kind: byKind, stale, items, error: listed.error, path: RELATIVE_PATH };
}

/** `defect 2, idea 1` — only the non-zero kinds, in canonical order. */
function describeByKind(byKind) {
  return KINDS.filter((kind) => byKind && byKind[kind] > 0).map((kind) => `${kind} ${byKind[kind]}`).join(', ');
}

function pathOverlap(itemPaths, paths) {
  if (!Array.isArray(itemPaths) || itemPaths.length === 0 || paths.length === 0) return false;
  return itemPaths.some((a) => paths.some((b) => a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`)));
}

/**
 * The fan one agent sees at session start and at handoff: open items whose
 * kind addresses it and that belong to its feature, to no feature, or to the
 * paths it is about to touch.
 */
async function observationsForAgent(targetDir, agent, { feature, paths, limit = DEFAULT_LIMIT, now } = {}) {
  const who = normalizeAgent(agent);
  if (!who) return [];
  const slug = normalizeFeature(feature);
  const touched = normalizePaths(paths);
  const listed = await listObservations(targetDir, { status: 'open' }, { now });
  return listed.items
    .filter((item) => (AUDIENCE[item.kind] || []).includes(who))
    .filter((item) => !FEATURE_BOUND_KINDS.has(item.kind) || !item.feature || item.feature === slug || pathOverlap(item.paths, touched))
    .slice(0, limit);
}

/** Open items bound to a feature — what a close would carry. */
async function openForFeature(targetDir, slug, { now } = {}) {
  const feature = normalizeFeature(slug);
  if (!feature) return [];
  return (await listObservations(targetDir, { status: 'open', feature }, { now })).items;
}

/**
 * At feature close, open items bound to the feature move to the project hub
 * (`origin_feature` keeps where they came from). Nothing is deleted: the
 * cracked tile outlives the wall that was being plastered when it was seen.
 */
async function carryFeatureObservations(targetDir, slug, { now } = {}) {
  const feature = normalizeFeature(slug);
  if (!feature) return { carried: [] };
  const current = await readStore(targetDir);
  if (current.error || !current.exists) return { carried: [], error: current.error };
  const at = nowIso(now);
  const carried = [];
  for (const item of current.store.items) {
    if (!item || item.status !== 'open' || item.feature !== feature) continue;
    item.origin_feature = feature;
    item.feature = null;
    item.updated_at = at;
    carried.push({ id: item.id, kind: item.kind, summary: item.summary });
  }
  if (carried.length > 0) await writeStore(targetDir, current.store);
  return { carried, path: RELATIVE_PATH };
}

/** Open items older than STALE_DAYS — hygiene, not a verdict. */
async function staleObservations(targetDir, { now, days = STALE_DAYS } = {}) {
  const listed = await listObservations(targetDir, { status: 'open' }, { now });
  return listed.items
    .filter((item) => item.age_days != null && item.age_days >= days)
    .map((item) => ({
      id: item.id,
      kind: item.kind,
      path: RELATIVE_PATH,
      age_days: item.age_days,
      reason: `${item.id} (${item.kind}) open for ${item.age_days} days: ${oneLine(item.summary, 80)} — aioson observation:resolve . --id=${item.id} --as=<fixed|planned|promoted|answered|dismissed>`
    }));
}

/** Items touched in the last `hours` — the compaction recap's "you recorded". */
async function recentObservations(targetDir, { hours = 24, limit = DEFAULT_LIMIT, now } = {}) {
  const listed = await listObservations(targetDir, { status: 'all' }, { now });
  const since = (now == null ? Date.now() : now) - hours * 60 * 60 * 1000;
  return listed.items
    .filter((item) => Date.parse(item.updated_at || '') >= since)
    .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')))
    .slice(0, limit);
}

module.exports = {
  SCHEMA_VERSION,
  RELATIVE_PATH,
  KINDS,
  RESOLUTIONS,
  STALE_DAYS,
  AUDIENCE,
  NEXT_STEP,
  observationsPath,
  observationId,
  normalizeSummary,
  readStore,
  addObservation,
  listObservations,
  resolveObservation,
  refExists,
  summarizeOpen,
  describeByKind,
  observationsForAgent,
  openForFeature,
  carryFeatureObservations,
  staleObservations,
  recentObservations
};
