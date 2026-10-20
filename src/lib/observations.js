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
const { withRegistryLock, writeAtomically } = require('./feature-registry-storage');
const { parseFeatureRegistry } = require('./feature-registry');
const { canonicalAgentId } = require('../agents');

const SCHEMA_VERSION = 'project-observations/v1';
const RELATIVE_PATH = '.aioson/context/observations.json';
// Lane workers and parallel terminals each run their own `aioson observe`:
// every read-modify-write holds this lock, or the last writer drops the rest.
const LOCK_NAME = '.observations.lock';
const KINDS = ['defect', 'idea', 'process', 'risk', 'question'];
const RESOLUTIONS = ['fixed', 'planned', 'promoted', 'answered', 'dismissed'];
const STALE_DAYS = 30;
const MIN_SUMMARY_CHARS = 8;
const MAX_SUMMARY_CHARS = 240;
const MAX_DETAIL_CHARS = 1200;
const MAX_PATHS = 12;
const DEFAULT_LIMIT = 5;
const DAY_MS = 24 * 60 * 60 * 1000;
// A binding means something while its feature is live in the registry. An item
// bound to anything else reads as project-wide: a done or abandoned feature
// (abandoned without a close, or closed while the store was unreadable), a
// slug with no row (a typo, `project`, a briefing not yet registered), a row
// in a delivery spelling (`completed`, `shipped`), a folder only under done/.
const CLOSED_FEATURE_STATUSES = new Set(['done', 'abandoned']);
const LIVE_FEATURE_STATUSES = new Set(['planning', 'in_progress', 'paused', 'qa_failed', 'qa_blocked']);
// A feature slug as the registry writes it (dots allowed: `checkout-v2.0`).
const FEATURE_SLUG = /^[a-z0-9][a-z0-9._-]*$/;
const CASE_INSENSITIVE_FS = process.platform === 'win32' || process.platform === 'darwin';
const REPAIR_HINT = 'repair it, or rename it aside and the next observe starts a fresh store; never delete it — it holds the open items';

// Which agents hear about an open item at session start and at handoff. A
// `process` item is the owner's (status, @neo, hygiene), never an agent's.
const AUDIENCE = {
  // @quality owns static analysis and performance: a defect or a risk beside
  // the work is input to its assessment, as it is to the other reviewers.
  defect: ['dev', 'qa', 'tester', 'quality', 'planner'],
  risk: ['dev', 'qa', 'tester', 'pentester', 'quality', 'planner', 'sheldon'],
  idea: ['product', 'briefing', 'refiner', 'sheldon'],
  process: [],
  // @refiner settles scope questions before a PRD exists; @tester the
  // test-strategy ones.
  question: ['refiner', 'product', 'sheldon', 'planner', 'dev', 'qa', 'tester']
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

function observationId(kind, summary, length = 6) {
  const digest = crypto.createHash('sha1').update(`${kind}|${normalizeSummary(summary)}`).digest('hex');
  return `OBS-${digest.slice(0, length)}`;
}

/**
 * The record a (kind, summary) pair maps to. Six hex digits keep ids short
 * enough to type; when one is already held by a different item — a hash
 * collision, not a repeat — the id widens instead of merging the two.
 */
function slotFor(items, kind, summary) {
  const key = normalizeSummary(summary);
  for (const length of [6, 10, 40]) {
    const id = observationId(kind, summary, length);
    const existing = items.find((item) => item && item.id === id);
    if (!existing) return { id, existing: null };
    // A hand-edited summary no longer hashes to its own id: still the same item.
    const selfConsistent = observationId(existing.kind, existing.summary, length) === existing.id;
    if (!selfConsistent || (existing.kind === kind && normalizeSummary(existing.summary) === key)) return { id, existing };
  }
  return { id: observationId(kind, summary, 40), existing: null };
}

// `@Dev`, retired `deyvin`, legacy `briefing-refiner`: one id per agent.
function normalizeAgent(value) {
  return canonicalAgentId(String(value == null ? '' : value)) || null;
}

function normalizeFeature(value) {
  const slug = String(value == null ? '' : value).trim().toLowerCase();
  if (!slug || ['none', '(none)', 'null', '-', 'n/a'].includes(slug)) return null;
  return slug;
}

/** An explicit binding must be a slug: `Checkout` binds as `checkout`, `{slug}` binds nothing. */
function validateFeature(value) {
  const slug = normalizeFeature(value);
  if (slug && !FEATURE_SLUG.test(slug)) {
    throw new Error(`--feature='${value}' is not a feature slug (kebab-case, e.g. checkout); pass the real slug, or omit it for the active feature`);
  }
  return slug;
}

/** The project-relative path of `target`, or null when it lies outside the project. */
function insideProject(targetDir, target) {
  const rel = path.relative(targetDir, path.resolve(targetDir, target));
  // Another drive comes back absolute from path.relative on Windows.
  return rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel) ? null : rel;
}

/**
 * Forward-slash, project-relative paths: tools hand agents absolute paths
 * while the brief passes relative ones, and `src/` must overlap `src/a.js`.
 */
function normalizePath(entry, targetDir) {
  const raw = String(entry == null ? '' : entry).trim();
  const rel = targetDir && raw && path.isAbsolute(raw) ? (insideProject(targetDir, raw) ?? raw) : raw;
  return rel.replace(/\\/g, '/').replace(/^(?:\.\/)+/, '').replace(/\/+$/, '');
}

function normalizePaths(value, targetDir) {
  if (value === true) return []; // a bare flag names no path
  const raw = Array.isArray(value) ? value : String(value == null ? '' : value).split(/[,\n]/);
  const out = [];
  for (const entry of raw) {
    const rel = normalizePath(entry, targetDir);
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

// Redact first, cut second: a secret crossing the cut reaches the redactor
// whole, not as a prefix its pattern no longer recognizes.
function cleanText(text, max) {
  return oneLine(redactTelemetryText(String(text == null ? '' : text).replace(/\s+/g, ' ').trim()), max);
}

function ageDays(item, now) {
  const created = Date.parse(item.created_at || '');
  if (!Number.isFinite(created)) return null;
  return Math.max(0, Math.floor(((now == null ? Date.now() : now) - created) / DAY_MS));
}

/**
 * One shape for every surface, whatever a hand edit or a git merge left: the
 * file is meant to be read and edited without the CLI. Nothing is dropped.
 */
function normalizeItem(item, targetDir) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
  item.kind = String(item.kind == null ? '' : item.kind).trim().toLowerCase();
  item.summary = String(item.summary == null ? '' : item.summary);
  item.paths = normalizePaths(item.paths, targetDir);
  item.feature = normalizeFeature(item.feature);
  item.origin_feature = normalizeFeature(item.origin_feature);
  item.seen = Math.max(1, Math.floor(Number(item.seen)) || 1);
  if (item.history != null && !Array.isArray(item.history)) item.history = [item.history];
  if (item.status !== 'open' && item.status !== 'resolved') {
    item.status = item.resolution && typeof item.resolution === 'object' ? 'resolved' : 'open';
  }
  return item;
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
    for (const item of parsed.items) normalizeItem(item, targetDir);
    return { store: parsed, exists: true, error: null };
  } catch (error) {
    return { store: emptyStore(), exists: true, error: `invalid JSON: ${error.message}` };
  }
}

/** Writers refuse to overwrite a store they could not read: a corrupt file is the owner's to look at. */
async function readStoreForWrite(targetDir) {
  const current = await readStore(targetDir);
  if (current.error) throw new Error(`${RELATIVE_PATH} is unreadable (${current.error}); nothing was written — ${REPAIR_HINT}`);
  return current.store;
}

async function writeStore(targetDir, store) {
  const file = observationsPath(targetDir);
  await fs.mkdir(path.dirname(file), { recursive: true });
  // A unique temp per write: two writers never share (and corrupt) one file.
  await writeAtomically(file, `${JSON.stringify(store, null, 2)}\n`);
  return file;
}

/** One read-modify-write of the store at a time, across processes. */
async function withStoreLock(targetDir, action) {
  const dir = path.dirname(observationsPath(targetDir));
  return withRegistryLock(dir, action, { name: LOCK_NAME });
}

function validateKind(kind) {
  const value = String(kind == null ? '' : kind).trim().toLowerCase();
  if (!KINDS.includes(value)) throw new Error(`--kind must be one of: ${KINDS.join(', ')} (got '${kind == null ? '' : kind}')`);
  return value;
}

function validateSummary(summary) {
  const value = cleanText(summary, MAX_SUMMARY_CHARS);
  if (value.length < MIN_SUMMARY_CHARS) throw new Error(`--summary needs at least ${MIN_SUMMARY_CHARS} characters, one line, in domain words`);
  return value;
}

// Words too common to say two summaries name the same thing.
const STOPWORDS = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'when', 'after', 'into', 'are', 'was', 'not', 'but', 'que', 'com', 'para', 'uma', 'dos', 'das', 'por', 'nao', 'los', 'las', 'del', 'con']);

function summaryWords(summary) {
  return new Set(normalizeSummary(summary).split(' ').filter((word) => word.length >= 3 && !STOPWORDS.has(word)));
}

/** How likely `other` names what `item` names: near-identical words, the same paths; 0 when neither. */
function similarity(words, item, other) {
  const otherWords = summaryWords(other.summary);
  let shared = 0;
  for (const word of words) if (otherWords.has(word)) shared += 1;
  const overlap = shared / Math.max(1, Math.min(words.size, otherWords.size));
  return (shared >= 3 && overlap >= 0.75 ? overlap : 0) + (pathOverlap(other.paths, item.paths) ? 1 : 0);
}

/**
 * Open items of the same kind that may be the one just recorded in other
 * words — the identity hash only joins identical wording, and agents
 * paraphrase. Advisory, computed on the store already in memory.
 */
function similarOpen(items, item) {
  const words = summaryWords(item.summary);
  return items
    .filter((other) => other && other !== item && other.status === 'open' && other.kind === item.kind)
    .map((other) => ({ id: other.id, summary: other.summary, score: similarity(words, item, other) }))
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map(({ id, summary }) => ({ id, summary }));
}

/**
 * A settled item seen again is news only when its outcome said the thing was
 * gone: `fixed`, or `planned`/`promoted` into something that no longer holds
 * it — a plan or artifact path that is gone, a feature that has since closed.
 * A dismissal or an answer is the owner's word: it stands in any feature, and
 * the observer reads it instead of reopening the item for the owner to settle again.
 */
async function staysSettled(targetDir, resolution) {
  const as = resolution && resolution.as;
  if (as === 'dismissed' || as === 'answered') return true;
  if (as !== 'planned' && as !== 'promoted') return false;
  return refStands(targetDir, String(resolution.ref || '').trim());
}

/** A plan or a promotion stands while its ref does: the path is still there, or the feature has not closed. */
async function refStands(targetDir, ref) {
  if (!ref) return false;
  const pathLike = looksLikePath(ref);
  if (pathLike && await fileExists(path.resolve(targetDir, ref))) return true;
  // A gone path is a plan carried out; `checkout-v2.0` reads like a file name and may still be a slug.
  if (pathLike && (/[\\/]/.test(ref) || !(await knownFeature(targetDir, ref)))) return false;
  return !(await closedFeatures(targetDir)).has(ref.toLowerCase());
}

/**
 * A repeat keeps the first detail; a reopen keeps it too and appends the new
 * evidence after it, trimming the earlier text when both do not fit.
 */
function mergeDetail(item, detail, reopening) {
  if (!detail || item.detail === detail) return;
  if (!item.detail) {
    item.detail = detail;
    return;
  }
  if (!reopening) return;
  const room = MAX_DETAIL_CHARS - detail.length - 3;
  item.detail = room > 1 ? `${oneLine(item.detail, room)} · ${detail}` : detail;
}

/** A repeat: count it, merge what it adds, reopen it when it came back. True when it reopened. */
function reobserve(item, { detail, paths, agent, at, targetDir, stays }) {
  const reopening = item.status !== 'open' && !stays;
  item.seen = (Number(item.seen) || 1) + 1;
  item.updated_at = at;
  mergeDetail(item, detail, reopening);
  // The file is readable and editable by hand: never trust its shapes.
  item.paths = normalizePaths(item.paths, targetDir);
  for (const rel of paths) if (!item.paths.includes(rel) && item.paths.length < MAX_PATHS) item.paths.push(rel);
  // Only creation binds a feature: a project-wide item re-seen during a
  // feature would otherwise be carried at its close with an origin it never had.
  if (agent && !item.agent) item.agent = agent;
  if (!reopening) return false;
  item.history = Array.isArray(item.history) ? item.history : [];
  // The evidence that brought it back is kept with the outcome it overturned.
  item.history.push({ ...(item.resolution || {}), reopened_at: at, ...(detail ? { detail } : {}) });
  item.resolution = null;
  item.status = 'open';
  item.created_at = at;
  return true;
}

/**
 * Record one thing noticed. Idempotent on (kind, summary): a repeat raises
 * `seen` instead of duplicating. A repeat of a settled item reopens it, the
 * earlier outcome kept as history, when it came back (see staysSettled) or
 * when the caller says so (`reopen`); otherwise it stays settled and the
 * result carries `settled` with the outcome the observer should read.
 */
async function addObservation(targetDir, input = {}, { now } = {}) {
  const kind = validateKind(input.kind);
  const summary = validateSummary(input.summary);
  const detail = input.detail ? cleanText(input.detail, MAX_DETAIL_CHARS) : null;
  const paths = normalizePaths(input.paths, targetDir);
  const feature = validateFeature(input.feature);
  const agent = normalizeAgent(input.agent);
  const reopen = input.reopen === true;
  const at = nowIso(now);

  return withStoreLock(targetDir, async () => {
    const store = await readStoreForWrite(targetDir);
    const { id, existing } = slotFor(store.items, kind, summary);
    const created = !existing;
    // The registry and the ref are read only when a settled item comes back.
    const stays = Boolean(existing) && existing.status === 'resolved' && !reopen && await staysSettled(targetDir, existing.resolution);
    const reopened = existing ? reobserve(existing, { detail, paths, agent, at, targetDir, stays }) : false;
    const item = existing || {
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
    if (created) store.items.push(item);
    const file = await writeStore(targetDir, store);
    const similar = created ? similarOpen(store.items, item) : [];
    return { item, created, reopened, settled: item.status === 'resolved', similar, path: path.relative(targetDir, file).replace(/\\/g, '/') };
  });
}

function decorate(item, now) {
  return { ...item, age_days: ageDays(item, now), next_step: NEXT_STEP[item.kind] || null };
}

function sortOpenFirstNewest(a, b) {
  if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
  return String(b.updated_at || '').localeCompare(String(a.updated_at || ''));
}

// `project` (or `none`) lists what no live feature owns: unbound items and
// items bound to a slug the registry does not list as live.
async function featureFilter(targetDir, feature) {
  if (!feature) return () => true;
  if (feature !== 'project' && feature !== 'none') return (item) => item.feature === feature;
  const { live } = await registryFeatureStates(targetDir);
  return (item) => !live.has(item.feature);
}

/**
 * @param {object} [filter]
 * @param {'open'|'resolved'|'all'} [filter.status='open']
 * @param {string} [filter.kind]
 * @param {string} [filter.feature]  exact feature, or `project` for what no live feature owns
 */
async function listObservations(targetDir, filter = {}, { now } = {}) {
  const current = await readStore(targetDir);
  const status = filter.status || 'open';
  const kind = filter.kind ? String(filter.kind).trim().toLowerCase() : null;
  const ofFeature = await featureFilter(targetDir, filter.feature ? String(filter.feature).trim().toLowerCase() : null);
  const items = current.store.items
    .filter((item) => item && typeof item === 'object' && item.id)
    .filter((item) => status === 'all' || item.status === status)
    .filter((item) => !kind || item.kind === kind)
    .filter(ofFeature)
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
 * A feature the project knows: the slug cell of a registry row (never a
 * header word, a status or a date), or its briefing, feature or done folder,
 * or its PRD file.
 */
async function knownFeature(targetDir, slug) {
  if (!FEATURE_SLUG.test(slug.toLowerCase())) return false;
  const ctx = path.join(targetDir, '.aioson', 'context');
  const { rows } = parseFeatureRegistry(await readTextSafe(path.join(ctx, 'features.md')));
  if (rows.some((row) => String(row.slug).toLowerCase() === slug.toLowerCase())) return true;
  for (const [candidate, folder] of [
    [path.join(targetDir, '.aioson', 'briefings', slug), true],
    [path.join(ctx, 'features', slug), true],
    [path.join(ctx, 'done', slug), true],
    [path.join(ctx, `prd-${slug}.md`), false]
  ]) {
    try {
      const stat = await fs.stat(candidate);
      if (folder ? stat.isDirectory() : stat.isFile()) return true;
    } catch { /* absent */ }
  }
  return false;
}

/**
 * A promotion/plan reference must point at something that exists: a path in
 * the project (never the store itself), or a feature the project knows.
 * An outcome recorded against nothing is how an item gets lost while "handled".
 */
async function refExists(targetDir, ref) {
  const value = String(ref || '').trim();
  if (!value) return { ok: false, reason: 'empty' };
  if (looksLikePath(value)) {
    const rel = insideProject(targetDir, value);
    if (rel === null) return { ok: false, reason: 'outside the project' };
    const store = path.relative(targetDir, observationsPath(targetDir));
    if (CASE_INSENSITIVE_FS ? rel.toLowerCase() === store.toLowerCase() : rel === store) return { ok: false, reason: 'the observations store itself' };
    if (await fileExists(path.resolve(targetDir, value))) return { ok: true, kind: 'path' };
    // `checkout-v2.0` reads like a file name and may still be a feature slug.
    if (/[\\/]/.test(value)) return { ok: false, reason: 'path does not exist' };
  }
  if (await knownFeature(targetDir, value)) return { ok: true, kind: 'feature' };
  return { ok: false, reason: 'neither an existing path nor a known feature slug' };
}

/** The settle request, validated: `planned`/`promoted` carry a ref, `dismissed`/`answered` a why. */
function resolutionInput(input) {
  // Ids print as `OBS-` + lowercase hex; accept any casing the owner types.
  const id = String(input.id == null ? '' : input.id).trim().replace(/^obs-/i, 'OBS-').replace(/^(OBS-)(.*)$/, (_m, p, hex) => p + hex.toLowerCase());
  if (!id) throw new Error('--id=<OBS-xxxxxx> is required');
  const as = String(input.as == null ? '' : input.as).trim().toLowerCase();
  if (!RESOLUTIONS.includes(as)) throw new Error(`--as must be one of: ${RESOLUTIONS.join(', ')} (got '${input.as == null ? '' : input.as}')`);
  const ref = input.ref ? String(input.ref).trim() : null;
  const why = input.why ? cleanText(input.why, MAX_DETAIL_CHARS) : null;
  if ((as === 'dismissed' || as === 'answered') && !why) throw new Error(`--as=${as} needs --why="<reason or answer>"`);
  if ((as === 'planned' || as === 'promoted') && !ref) throw new Error(`--as=${as} needs --ref=<existing plan path or feature slug>`);
  return { id, as, ref, why };
}

/**
 * Settle an item once, with the outcome the next reader needs. `planned` and
 * `promoted` need an existing `ref`; `dismissed` and `answered` need a `why`.
 */
async function resolveObservation(targetDir, input = {}, { now } = {}) {
  const { id, as, ref, why } = resolutionInput(input);
  if (ref) {
    const check = await refExists(targetDir, ref);
    if (!check.ok) throw new Error(`--ref='${ref}' is ${check.reason} — record the outcome against something that exists`);
  }

  return withStoreLock(targetDir, async () => {
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
  });
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
  if (!Array.isArray(itemPaths) || itemPaths.length === 0 || !Array.isArray(paths) || paths.length === 0) return false;
  const fold = (value) => (CASE_INSENSITIVE_FS ? String(value).toLowerCase() : String(value));
  return itemPaths.some((x) => paths.some((y) => {
    const a = fold(x);
    const b = fold(y);
    return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
  }));
}

/** The registry's live and closed slugs, from one read; both empty without a registry. */
async function registryFeatureStates(targetDir) {
  const content = await readTextSafe(path.join(targetDir, '.aioson', 'context', 'features.md'));
  const rows = content ? parseFeatureRegistry(content).rows : [];
  const slugs = (statuses) => new Set(rows.filter((row) => statuses.has(row.status)).map((row) => String(row.slug).toLowerCase()));
  return { live: slugs(LIVE_FEATURE_STATUSES), closed: slugs(CLOSED_FEATURE_STATUSES) };
}

/** Slugs the registry marks done or abandoned; empty without a registry. */
async function closedFeatures(targetDir) {
  return (await registryFeatureStates(targetDir)).closed;
}

/**
 * The fan one agent sees at session start and at handoff: open items whose
 * kind addresses it and that belong to its feature, to the paths it is about
 * to touch, or to no feature — ranked in that order, newest first within a
 * tier, so project-wide leftovers never push the feature's own items out of
 * the first `limit`. `total` counts every open item that matched; `answered`
 * holds the feature's answered questions, which the stage that needs the
 * answer reads until the feature closes.
 */
async function fanFor(targetDir, agent, { feature, paths, limit = DEFAULT_LIMIT, now } = {}) {
  const who = normalizeAgent(agent);
  if (!who) return { items: [], total: 0, answered: [] };
  const slug = normalizeFeature(feature);
  const touched = normalizePaths(paths, targetDir);
  const listed = await listObservations(targetDir, { status: 'all' }, { now });
  const addressed = listed.items.filter((item) => (AUDIENCE[item.kind] || []).includes(who));
  const open = addressed.filter((item) => item.status === 'open');
  const answers = addressed.filter((item) => item.status !== 'open' && isFeatureAnswer(item, slug));
  // The registry is read only when a binding has to be judged.
  const judged = answers.length > 0 || open.some((item) => item.feature && item.feature !== slug);
  const registry = judged ? await registryFeatureStates(targetDir) : { live: new Set(), closed: new Set() };
  const ranked = open
    .map((item) => ({ item, tier: fanTier(item, slug, touched, registry.live) }))
    .filter((entry) => entry.tier !== null)
    .sort((a, b) => a.tier - b.tier || String(b.item.updated_at || '').localeCompare(String(a.item.updated_at || '')));
  const answered = registry.closed.has(slug) ? [] : answers.slice(0, limit).map((item) => ({ ...item, answer: item.resolution.why || '' }));
  return { items: ranked.slice(0, limit).map((entry) => entry.item), total: ranked.length, answered };
}

/** Where an open item ranks in an agent's fan; null when it belongs to another live feature. */
function fanTier(item, slug, touched, live) {
  // Bound to a slug the registry does not list as live: project-wide (see LIVE_FEATURE_STATUSES).
  const bound = item.feature && item.feature !== slug && !live.has(item.feature) ? null : item.feature;
  if (bound && bound === slug) return 0;
  if (pathOverlap(item.paths, touched)) return 1;
  if (!bound || !FEATURE_BOUND_KINDS.has(item.kind)) return 2;
  return null;
}

/** An answered question of this feature: the decision the stage that needs it reads. */
function isFeatureAnswer(item, slug) {
  return Boolean(slug) && item.kind === 'question' && item.feature === slug && Boolean(item.resolution) && item.resolution.as === 'answered';
}

async function observationsForAgent(targetDir, agent, options = {}) {
  return (await fanFor(targetDir, agent, options)).items;
}

/**
 * The fan a session-start surface attaches (context:brief, and context:select
 * for the agents whose kernels start there: @briefing, @refiner). Advisory:
 * a broken store never blocks the session.
 */
async function sessionFan(targetDir, agent, { feature, paths } = {}) {
  try {
    return await fanFor(targetDir, agent, { feature, paths });
  } catch {
    return { items: [], total: 0, answered: [] };
  }
}

function itemPathsSuffix(item) {
  return Array.isArray(item.paths) && item.paths.length > 0 ? ` [${item.paths.join(', ')}]` : '';
}

function answerOf(item) {
  return item.answer || (item.resolution && item.resolution.why) || '';
}

function ageOf(item) {
  return item.age_days != null ? `, ${item.age_days}d` : '';
}

/** Both blocks — the session-start fan and the handoff — in one shape; `style` words them. */
function renderFan(observations, total, answered, style) {
  const open = Array.isArray(observations) ? observations : [];
  const settled = Array.isArray(answered) ? answered : [];
  const count = Math.max(open.length, Number(total) || 0);
  const more = count > open.length ? [`${style.bullet}+${count - open.length} more — aioson observation:list .`] : [];
  return [
    ...(open.length > 0 ? [style.header(count), ...open.map(style.item), ...more] : []),
    ...(settled.length > 0 ? [style.answeredHeader(settled.length), ...settled.map(style.answered)] : [])
  ];
}

const SESSION_STYLE = {
  bullet: '- ',
  header: (count) => `Open observations for you (${count}) — settle or carry them, never fix in passing (aioson observation:list .):`,
  item: (item) => `- ${item.id} (${item.kind}${ageOf(item)}) ${item.summary}${itemPathsSuffix(item)} → ${item.next_step || NEXT_STEP[item.kind] || ''}`,
  answeredHeader: (count) => `Answered questions on this feature (${count}) — the answer stands, do not ask again:`,
  answered: (item) => `- ${item.id} (question, answered) ${item.summary} → answer: ${answerOf(item)}`
};

/** The lines those surfaces print for the fan; none when it is empty. */
function fanLines(observations, total, answered = []) {
  return renderFan(observations, total, answered, SESSION_STYLE);
}

/** The handoff block (workflow:next, agent:done): a line for every item it counts. */
function handoffLines(observations, total, agent, answered = []) {
  return renderFan(observations, total, answered, {
    bullet: '  - ',
    header: (count) => `[Observations] ${count} open for @${agent} — settle or carry, never fix in passing (aioson observation:list .):`,
    item: (item) => `  - ${item.id} (${item.kind}${ageOf(item)}) ${item.summary}${itemPathsSuffix(item)}`,
    answeredHeader: (count) => `[Observations] ${count} answered question(s) on this feature for @${agent} — the answer stands:`,
    answered: (item) => `  - ${item.id} (question, answered) ${item.summary} — answer: ${answerOf(item)}`
  });
}

/**
 * Attach the agent's fan to a context:brief or context:select result; the
 * active feature binds when the call names none (@tester, @pentester and
 * @quality brief without --feature; @briefing and @refiner start at select).
 */
async function attachFan(targetDir, result, options = {}) {
  const fan = await sessionFan(targetDir, result.agent, {
    feature: options.feature || options.slug || result.active_feature || '',
    paths: options.paths || options.path || ''
  });
  result.observations = fan.items;
  result.observations_total = fan.total;
  result.observations_answered = fan.answered;
  return result;
}

function printFan(logger, result) {
  for (const line of fanLines(result.observations, result.observations_total, result.observations_answered)) logger.log(line);
}

/** The handoff fields a workflow:next payload carries; agent:done re-prints them. */
function handoffFields(fan) {
  return {
    observations: fan.items.map((item) => ({ id: item.id, kind: item.kind, summary: item.summary, feature: item.feature, paths: item.paths, age_days: item.age_days })),
    observations_total: fan.total,
    observations_answered: fan.answered.map((item) => ({ id: item.id, kind: item.kind, summary: item.summary, feature: item.feature, answer: item.answer }))
  };
}

/** Print the handoff block a workflow:next payload carries, for the agent it activates. */
function printHandoff(logger, payload, agent = payload.agent || payload.next) {
  for (const line of handoffLines(payload.observations, payload.observations_total, agent, payload.observations_answered)) logger.log(line);
}

/** Open items bound to a feature — what a close would carry. */
async function openForFeature(targetDir, slug, { now } = {}) {
  const feature = normalizeFeature(slug);
  if (!feature) return [];
  return (await listObservations(targetDir, { status: 'open', feature }, { now })).items;
}

/** The line feature:close --preflight prints about the hub, or null when nothing would move. */
async function carryPreview(targetDir, slug) {
  const feature = normalizeFeature(slug);
  if (!feature) return null;
  const listed = await listObservations(targetDir, { status: 'open', feature });
  if (listed.error) return `${RELATIVE_PATH} is unreadable (${listed.error}): nothing bound to ${feature} can be carried at close — ${REPAIR_HINT}`;
  if (listed.items.length === 0) return null;
  return `${listed.items.length} open observation(s) bound to ${feature} would be carried to the project hub at close, never deleted: ${listed.items.map((o) => `${o.id} (${o.kind})`).join(', ')} — aioson observation:list . --feature=${feature}`;
}

/** The store itself when no surface can read it — hygiene names it. */
async function unreadableStore(targetDir) {
  const current = await readStore(targetDir);
  if (!current.error) return [];
  return [{ path: RELATIVE_PATH, reason: `unreadable (${current.error}): every surface shows no observation until it is fixed — ${REPAIR_HINT}` }];
}

/**
 * At feature close, open items bound to the feature move to the project hub
 * (`origin_feature` keeps where they came from). Nothing is deleted: the
 * cracked tile outlives the wall that was being plastered when it was seen.
 */
async function carryFeatureObservations(targetDir, slug, { now } = {}) {
  const feature = normalizeFeature(slug);
  if (!feature) return { carried: [] };
  if (!(await fileExists(observationsPath(targetDir)))) return { carried: [], path: RELATIVE_PATH };
  return withStoreLock(targetDir, async () => {
    const current = await readStore(targetDir);
    if (current.error || !current.exists) return { carried: [], error: current.error };
    const at = nowIso(now);
    const carried = [];
    for (const item of current.store.items) {
      if (!item || item.status !== 'open' || item.feature !== feature) continue;
      item.origin_feature = feature;
      item.feature = null;
      // Not `updated_at`: a carried item keeps its place in every fan instead
      // of jumping above the next feature's own items.
      item.carried_at = at;
      carried.push({ id: item.id, kind: item.kind, summary: item.summary });
    }
    if (carried.length > 0) await writeStore(targetDir, current.store);
    return { carried, path: RELATIVE_PATH };
  });
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

// The recap prints its items on one line capped at 480 chars
// (lib/compaction-recap.js): five summaries of this size fit whole.
const RECAP_SUMMARY_CHARS = 48;

/** Shortened at a word boundary: a summary cut mid-word reads as another thing. */
function shortSummary(text, max) {
  const flat = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const head = flat.slice(0, max - 1);
  const boundary = flat[max - 1] === ' ' ? head.length : head.lastIndexOf(' ');
  const kept = boundary >= Math.floor(max / 2) ? head.slice(0, boundary) : head;
  return `${kept.replace(/[\s,;:]+$/, '')}…`;
}

/**
 * Items touched in the last `hours` — the compaction recap's "you recorded":
 * open ones first (settled ones never push them out), then the settled ones,
 * newest first within each, summaries shortened at a word boundary.
 */
async function recentObservations(targetDir, { hours = 24, limit = DEFAULT_LIMIT, now, summaryChars = RECAP_SUMMARY_CHARS } = {}) {
  const listed = await listObservations(targetDir, { status: 'all' }, { now });
  const since = (now == null ? Date.now() : now) - hours * 60 * 60 * 1000;
  return listed.items
    .filter((item) => Date.parse(item.updated_at || '') >= since)
    .slice(0, limit)
    .map((item) => ({ ...item, summary: shortSummary(item.summary, summaryChars) }));
}

module.exports = {
  SCHEMA_VERSION, RELATIVE_PATH, KINDS, RESOLUTIONS, STALE_DAYS, AUDIENCE, NEXT_STEP, REPAIR_HINT,
  observationsPath, observationId, normalizeSummary, normalizePaths, validateFeature, closedFeatures, registryFeatureStates,
  readStore, addObservation, listObservations, resolveObservation, refExists, summarizeOpen, describeByKind,
  fanFor, observationsForAgent, sessionFan, fanLines, handoffLines, attachFan, printFan, handoffFields, printHandoff,
  openForFeature, carryPreview, unreadableStore, carryFeatureObservations, staleObservations, recentObservations
};
