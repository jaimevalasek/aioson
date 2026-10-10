'use strict';

/**
 * aioson's own disk footprint — what the framework leaves on disk beside the
 * project's work, and how much of it nothing will read again.
 *
 * Why this module exists: on one operator machine the doc snapshots
 * `agent:done` takes after @product, @sheldon and @planner had grown to
 * 1.66 GB in 164k files under ~/.aioson/backups — each one a full copy of
 * .aioson/context with every closed-feature archive, none ever removed (162 in
 * a single project). Update rollback folders kept thousands of files per
 * project, and an agent's verification loop appended a 215 MB log inside an
 * execution checkpoint. Nothing measured any of it, so the first signal was a
 * full disk. Producers now keep a bounded history (backup-local, installer);
 * this module measures what is left: retention that runs with one approval
 * (`storage:triage --apply`) and heavy paths only the owner removes, by name.
 *
 * The recall index followed the same shape: one machine-wide file in
 * ~/.aioson/search held every project ever indexed, 65 of its 112 partitions
 * for folders long deleted. Each project now keeps its own index in
 * .aioson/runtime/ — gone with the project — and the shared one is retired.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { clearDir, dirStats, isContainedFolder, formatBytes } = require('./evidence-artifacts');
const { isEphemeralProjectDir } = require('./design-seed');

const KB = 1024;
const MB = 1024 * KB;

// Doc snapshots kept per project: enough to undo a bad planning round.
const SNAPSHOT_KEEP = 10;
// Update rollback folders kept per project: nobody rolls back further.
const ROLLBACK_KEEP = 5;
// A text log past this size is never read whole again: its head says what
// ran, its tail how it ended.
const LOG_CAP_BYTES = 20 * MB;
const LOG_HEAD_BYTES = 64 * KB;
const LOG_TAIL_BYTES = 256 * KB;
// A path this heavy that aioson cannot regenerate is worth the owner's look.
const HEAVY_PATH_BYTES = 50 * MB;
// A log written this recently may still be open by whatever writes it.
const LIVE_WINDOW_MS = 10 * 60 * 1000;
// hygiene:scan runs this on every @neo activation; past this many entries the
// walk stops and the summary says its weights are partial.
const WALK_BUDGET = 200000;

const STAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}/;
const LOG_RE = /\.(log|out|err)$/i;
// Kept by the session lifecycle (runtime:storage, agent:recover).
const RUNTIME_MANAGED = new Set(['live', '.sessions', 'checkpoints']);
// Kept by the runtime-storage procedure (runtime:prune, runtime:compact).
const RUNTIME_DB = new Set(['aios.sqlite', 'aios.sqlite-wal', 'aios.sqlite-shm']);
// The recall index (context:search, context:brief --recall): a cache rebuilt
// from the project's Markdown whenever it is missing.
const RECALL_FILES = new Set(['context-search.sqlite', 'context-search.sqlite-wal', 'context-search.sqlite-shm']);
// Written by aioson under .aioson/backups/ without a timestamp name.
const OWN_BACKUP_DIRS = new Set(['features-registry']);
// Top-level .aioson folders whose children are scratch, weighed one child at a time.
const SCRATCH_TOPS = new Set(['runtime', 'tmp']);
const MANAGED = Symbol('managed');

function aiosonHome() {
  return path.join(os.homedir(), '.aioson');
}

/** Where agent:done keeps doc snapshots, one folder per project name. */
function docSnapshotsRoot() {
  return process.env.AIOSON_BACKUPS_DIR || path.join(aiosonHome(), 'backups');
}

/**
 * Where every project's recall index lived before each project kept its own:
 * ~/.aioson/search, or AIOSON_SEARCH_DIR (a test run keeps its own).
 */
function legacyRecallDir() {
  return process.env.AIOSON_SEARCH_DIR || path.join(aiosonHome(), 'search');
}

function projectSnapshotsDir(targetDir) {
  return path.join(docSnapshotsRoot(), path.basename(path.resolve(targetDir)));
}

/** Timestamp-named folders directly inside `dir`, newest first; links excluded. */
function stampedDirs(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
  return entries
    .filter((entry) => entry.isDirectory() && STAMP_RE.test(entry.name))
    .map((entry) => entry.name)
    .sort()
    .reverse();
}

/**
 * Remove the timestamp-named folders past the newest `keep`. Never follows a
 * link, never touches a folder whose name is not a timestamp, never throws.
 */
function pruneStamped(dir, keep, { dryRun = false } = {}) {
  const all = stampedDirs(dir);
  const result = { total: all.length, removed: 0, files: 0, bytes: 0, failed: [] };
  for (const name of all.slice(keep)) {
    const target = path.join(dir, name);
    if (!isContainedFolder(target, dir)) continue;
    const stats = dryRun ? dirStats(target) : clearDir(target);
    result.files += stats.files;
    result.bytes += stats.bytes;
    if (stats.error) result.failed.push({ name, error: stats.error });
    else result.removed += 1;
  }
  return result;
}

function isLink(target) {
  try { return fs.lstatSync(target).isSymbolicLink(); } catch { return true; }
}

function isDirectory(target) {
  try { return fs.lstatSync(target).isDirectory(); } catch { return false; }
}

function visitFile(file, visit) {
  let stat;
  try { stat = fs.statSync(file); } catch { return; }
  visit(file, stat);
}

/**
 * Visit every file under `dir` as `visit(file, stat)`. Links are never
 * followed; `skip` names first-level entries to leave out.
 */
function walkFiles(dir, visit, state, skip = null) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    if (state.budget <= 0) {
      state.truncated = true;
      return;
    }
    state.budget -= 1;
    if (skip && skip.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, visit, state);
    else if (entry.isFile()) visitFile(full, visit);
  }
}

function weigh(target, state) {
  const total = { bytes: 0, files: 0 };
  const add = (file, stat) => {
    total.bytes += stat.size;
    total.files += 1;
  };
  if (isLink(target)) return total;
  if (isDirectory(target)) walkFiles(target, add, state);
  else visitFile(target, add);
  return total;
}

function addWeight(map, key, size) {
  const weight = map.get(key) || { bytes: 0, files: 0 };
  weight.bytes += size;
  weight.files += 1;
  map.set(key, weight);
}

function posix(rel) {
  return String(rel).split(path.sep).join('/');
}

function displayPath(abs) {
  const home = os.homedir();
  const rel = path.relative(home, abs);
  if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) return `~/${posix(rel)}`;
  return posix(abs);
}

/** The child of runtime/ or tmp/ a file belongs to, MANAGED, or null. */
function scratchUnit(segs) {
  if (!SCRATCH_TOPS.has(segs[0]) || segs.length < 2) return null;
  if (segs[0] === 'runtime' && RUNTIME_MANAGED.has(segs[1])) return MANAGED;
  return `${segs[0]}/${segs[1]}`;
}

function classifyFile(tree, file, stat, now) {
  const segs = path.relative(tree.root, file).split(path.sep);
  addWeight(tree.byTop, segs[0], stat.size);
  const runtimeFile = segs[0] === 'runtime' && segs.length === 2 ? segs[1] : '';
  if (RUNTIME_DB.has(runtimeFile)) {
    tree.dbBytes += stat.size;
    return;
  }
  if (RECALL_FILES.has(runtimeFile)) {
    tree.recallBytes += stat.size;
    return;
  }
  if (LOG_RE.test(file) && stat.size >= LOG_CAP_BYTES) {
    if (now - stat.mtimeMs >= LIVE_WINDOW_MS) tree.logs.push({ abs: file, bytes: stat.size });
    return;
  }
  const unit = scratchUnit(segs);
  if (unit === MANAGED) return;
  if (unit) addWeight(tree.scratch, unit, stat.size);
  else if (stat.size >= HEAVY_PATH_BYTES) tree.heavy.push({ abs: file, bytes: stat.size, files: 1, origin: 'file' });
}

/** One walk over .aioson/ (backups/ has its own rules). */
function scanTree(targetDir, now, state) {
  const root = path.join(targetDir, '.aioson');
  const tree = { root, byTop: new Map(), dbBytes: 0, recallBytes: 0, scratch: new Map(), logs: [], heavy: [] };
  walkFiles(root, (file, stat) => classifyFile(tree, file, stat, now), state, new Set(['backups']));
  for (const [unit, weight] of tree.scratch) {
    if (weight.bytes < HEAVY_PATH_BYTES) continue;
    tree.heavy.push({ abs: path.join(root, ...unit.split('/')), ...weight, origin: 'scratch' });
  }
  return tree;
}

function finding(abs, fields) {
  const item = { ...fields };
  Object.defineProperty(item, 'abs', { value: abs, enumerable: false });
  return item;
}

function sized(bytes) {
  return Number.isFinite(bytes) ? ` (${formatBytes(bytes)})` : '';
}

function retentionFinding({ kind, abs, id, scope, keep, label, sizes, state }) {
  const all = stampedDirs(abs);
  const drop = all.slice(keep);
  if (drop.length === 0) return [];
  const weight = sizes
    ? drop.reduce((acc, name) => {
      const w = weigh(path.join(abs, name), state);
      return { bytes: acc.bytes + w.bytes, files: acc.files + w.files };
    }, { bytes: 0, files: 0 })
    : { bytes: null, files: null };
  return [finding(abs, {
    id,
    kind,
    decides: 'auto',
    scope,
    path: id,
    count: drop.length,
    bytes: weight.bytes,
    files: weight.files,
    reason: `${all.length} ${label}; the newest ${keep} stay, ${drop.length} older go${sized(weight.bytes)}`
  })];
}

function snapshotFindings(targetDir, options, state) {
  const root = docSnapshotsRoot();
  const own = path.basename(path.resolve(targetDir));
  let names = [own];
  if (options.global) {
    try { names = fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name); } catch { names = []; }
  }
  return names.flatMap((name) => {
    const abs = path.join(root, name);
    return retentionFinding({
      kind: 'doc_snapshots',
      abs,
      id: displayPath(abs),
      scope: name === own ? 'project' : 'global',
      keep: SNAPSHOT_KEEP,
      label: 'doc snapshots agent:done took of .aioson/context',
      sizes: options.sizes,
      state
    });
  });
}

const HEAVY_REASONS = {
  scratch: (item) => `${formatBytes(item.bytes)} in ${item.files} file(s) an agent or tool left in .aioson; aioson does not regenerate it`,
  file: (item) => `${formatBytes(item.bytes)} single file aioson does not regenerate`,
  backup: (item) => `${formatBytes(item.bytes)} backup aioson did not write`,
  research: (item) => `${formatBytes(item.bytes)} in ${item.files} file(s) of research output; keep it only if the raw files are still needed`,
  recall: (item) => `${formatBytes(item.bytes)} in the old machine-wide recall folder; aioson did not write it`
};

function heavyFinding(targetDir, item, scope) {
  const id = scope === 'global' ? displayPath(item.abs) : posix(path.relative(targetDir, item.abs));
  return finding(item.abs, {
    id,
    kind: 'heavy_path',
    decides: 'owner',
    scope,
    origin: item.origin,
    path: id,
    bytes: item.bytes,
    files: item.files,
    reason: HEAVY_REASONS[item.origin](item)
  });
}

function logFinding(targetDir, item) {
  const id = posix(path.relative(targetDir, item.abs));
  return finding(item.abs, {
    id,
    kind: 'oversized_log',
    decides: 'auto',
    scope: 'project',
    path: id,
    bytes: item.bytes,
    files: 1,
    reason: `${formatBytes(item.bytes)} log; keeps its first ${formatBytes(LOG_HEAD_BYTES)} and last ${formatBytes(LOG_TAIL_BYTES)}`
  });
}

/** Heavy first-level entries of `dir` that `keep(name)` does not claim. */
function heavyChildren(dir, origin, keep, state) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
  const out = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink() || keep(entry.name)) continue;
    const abs = path.join(dir, entry.name);
    const weight = weigh(abs, state);
    if (weight.bytes >= HEAVY_PATH_BYTES) out.push({ abs, ...weight, origin });
  }
  return out;
}

function ownedEntries(targetDir, state) {
  const backups = path.join(targetDir, '.aioson', 'backups');
  return [
    ...heavyChildren(backups, 'backup', (name) => STAMP_RE.test(name) || OWN_BACKUP_DIRS.has(name), state),
    ...heavyChildren(path.join(targetDir, 'researchs'), 'research', () => false, state)
  ];
}

function recallStrays(state) {
  return heavyChildren(legacyRecallDir(), 'recall', (name) => RECALL_FILES.has(name), state);
}

function fileSize(file) {
  try {
    const stat = fs.lstatSync(file);
    return stat.isFile() ? stat.size : null;
  } catch {
    return null;
  }
}

/** The shared recall index files still on disk, with their sizes. */
function legacyRecallFiles() {
  return [...RECALL_FILES]
    .map((name) => path.join(legacyRecallDir(), name))
    .map((file) => ({ file, bytes: fileSize(file) }))
    .filter((entry) => entry.bytes !== null);
}

function legacyRecallFindings() {
  const files = legacyRecallFiles();
  if (files.length === 0) return [];
  const abs = path.join(legacyRecallDir(), 'context-search.sqlite');
  const id = displayPath(abs);
  const bytes = files.reduce((total, entry) => total + entry.bytes, 0);
  return [finding(abs, {
    id,
    kind: 'legacy_recall_index',
    decides: 'auto',
    scope: 'global',
    path: id,
    bytes,
    files: files.length,
    reason: `${formatBytes(bytes)} recall index every project shared before each kept its own in .aioson/runtime/; nothing reads it now`
  })];
}

function withCommands(findings, global) {
  const base = `aioson storage:triage .${global ? ' --global' : ''}`;
  for (const item of findings) {
    const target = /\s/.test(item.id) ? `"${item.id}"` : item.id;
    item.command = item.decides === 'auto' ? `${base} --apply` : `${base} --remove=${target}`;
  }
  return findings;
}

function sumBytes(items) {
  return items.reduce((total, item) => total + (Number.isFinite(item.bytes) ? item.bytes : 0), 0);
}

function summarize(findings, partial) {
  const counts = {};
  for (const item of findings) counts[item.kind] = (counts[item.kind] || 0) + 1;
  const auto = findings.filter((item) => item.decides === 'auto');
  const owner = findings.filter((item) => item.decides === 'owner');
  return {
    status: findings.length === 0 ? 'clean' : 'attention',
    auto: auto.length,
    owner: owner.length,
    reclaimable_bytes: sumBytes(auto),
    owner_bytes: sumBytes(owner),
    counts,
    partial
  };
}

function footprintOf(targetDir, tree, options, state) {
  const byTop = new Map(tree.byTop);
  if (options.sizes) byTop.set('backups', weigh(path.join(targetDir, '.aioson', 'backups'), state));
  const tops = [...byTop.entries()].sort((a, b) => b[1].bytes - a[1].bytes);
  return {
    aioson_bytes: tops.reduce((total, [, weight]) => total + weight.bytes, 0),
    by_top: tops.slice(0, 8).map(([name, weight]) => ({ name, bytes: weight.bytes, files: weight.files })),
    runtime_db_bytes: tree.dbBytes,
    recall_index_bytes: tree.recallBytes,
    doc_snapshots: { path: displayPath(projectSnapshotsDir(targetDir)), count: stampedDirs(projectSnapshotsDir(targetDir)).length }
  };
}

/**
 * Measure the footprint. `global` widens the snapshot retention to every
 * project on this machine and looks in the old machine-wide recall folder;
 * `sizes: false` skips weighing what retention would remove (hygiene:scan, doctor).
 */
function measureStorage(targetDir, { global = false, sizes = true, now = Date.now() } = {}) {
  const options = { global, sizes };
  const state = { budget: WALK_BUDGET, truncated: false };
  const tree = scanTree(targetDir, now, state);
  const findings = withCommands([
    ...snapshotFindings(targetDir, options, state),
    ...retentionFinding({
      kind: 'rollback_backups',
      abs: path.join(targetDir, '.aioson', 'backups'),
      id: '.aioson/backups',
      scope: 'project',
      keep: ROLLBACK_KEEP,
      label: 'update rollback folders',
      sizes,
      state
    }),
    ...tree.logs.map((item) => logFinding(targetDir, item)),
    ...[...tree.heavy, ...ownedEntries(targetDir, state)].map((item) => heavyFinding(targetDir, item, 'project')),
    ...(global ? legacyRecallFindings() : []),
    ...(global ? recallStrays(state).map((item) => heavyFinding(targetDir, item, 'global')) : [])
  ], global);
  return {
    ok: true,
    targetDir,
    global,
    thresholds: {
      snapshot_keep: SNAPSHOT_KEEP,
      rollback_keep: ROLLBACK_KEEP,
      log_cap_bytes: LOG_CAP_BYTES,
      heavy_bytes: HEAVY_PATH_BYTES
    },
    footprint: footprintOf(targetDir, tree, options, state),
    findings,
    summary: summarize(findings, state.truncated)
  };
}

function readSlice(file, position, length) {
  const fd = fs.openSync(file, 'r');
  try {
    const buffer = Buffer.alloc(length);
    const read = fs.readSync(fd, buffer, 0, length, Math.max(0, position));
    return buffer.subarray(0, read);
  } finally {
    fs.closeSync(fd);
  }
}

/** Keep the head up to its last line break and the tail from its first one. */
function trimmedParts(file, size) {
  const head = readSlice(file, 0, LOG_HEAD_BYTES);
  const tail = readSlice(file, size - LOG_TAIL_BYTES, LOG_TAIL_BYTES);
  const headEnd = head.lastIndexOf(0x0a);
  const tailStart = tail.indexOf(0x0a);
  return {
    head: headEnd > 0 ? head.subarray(0, headEnd + 1) : head,
    tail: tailStart >= 0 && tailStart < tail.length - 1 ? tail.subarray(tailStart + 1) : tail
  };
}

function trimLog(item, now = new Date()) {
  const step = { id: item.id, kind: item.kind, ok: false, files: 0, bytes: 0 };
  const temp = `${item.abs}.aioson-trim`;
  try {
    const size = fs.statSync(item.abs).size;
    if (size <= LOG_CAP_BYTES) return { ...step, ok: true };
    const { head, tail } = trimmedParts(item.abs, size);
    const cut = size - head.length - tail.length;
    const marker = Buffer.from(`\n[aioson storage:triage ${now.toISOString()}: ${formatBytes(cut)} cut from the middle of this log; head and tail kept]\n`);
    const kept = Buffer.concat([head, marker, tail]);
    fs.writeFileSync(temp, kept);
    fs.renameSync(temp, item.abs);
    return { ...step, ok: true, files: 1, bytes: size - kept.length };
  } catch (error) {
    try { fs.rmSync(temp, { force: true }); } catch { /* nothing to clean */ }
    return { ...step, error: String((error && error.message) || error) };
  }
}

function pruneStep(item, result) {
  return {
    id: item.id,
    kind: item.kind,
    ok: result.failed.length === 0,
    removed: result.removed,
    files: result.files,
    bytes: result.bytes,
    failed: result.failed
  };
}

function retireLegacyRecall() {
  const result = { files: 0, bytes: 0, error: undefined };
  for (const { file } of legacyRecallFiles()) {
    const removed = removeFile(file);
    result.files += removed.files;
    result.bytes += removed.bytes;
    result.error = result.error || removed.error;
  }
  return result;
}

/**
 * Every open of a project's own recall index retires the shared one it
 * replaced. A project under the OS temp folder (a test fixture) never reaches
 * into the operator's default store.
 */
function retireLegacyRecallIndex(projectDir) {
  if (legacyRecallFiles().length === 0) return null;
  if (!process.env.AIOSON_SEARCH_DIR && isEphemeralProjectDir(projectDir)) return null;
  return retireLegacyRecall();
}

const AUTO_ACTIONS = {
  doc_snapshots: (item) => pruneStep(item, pruneStamped(item.abs, SNAPSHOT_KEEP)),
  rollback_backups: (item) => pruneStep(item, pruneStamped(item.abs, ROLLBACK_KEEP)),
  oversized_log: (item) => trimLog(item),
  legacy_recall_index: (item) => {
    const result = retireLegacyRecall();
    return { id: item.id, kind: item.kind, ok: !result.error, files: result.files, bytes: result.bytes, error: result.error };
  }
};

/** Run every mechanical finding of a measurement. */
function applyAutoFindings(measurement) {
  return measurement.findings
    .filter((item) => item.decides === 'auto')
    .map((item) => AUTO_ACTIONS[item.kind](item));
}

function samePath(a, b) {
  const norm = (value) => {
    const out = String(value).replace(/\\/g, '/').replace(/\/+$/, '');
    return process.platform === 'win32' ? out.toLowerCase() : out;
  };
  return norm(a) === norm(b);
}

/** The owner finding a `--remove` names, exactly as the report prints it. */
function findOwnerFinding(measurement, id) {
  return measurement.findings.find((item) => item.decides === 'owner' && samePath(item.id, id)) || null;
}

function removeFile(file) {
  let size;
  try { size = fs.statSync(file).size; } catch { return { files: 0, bytes: 0 }; }
  try {
    fs.rmSync(file, { force: true, maxRetries: 3, retryDelay: 50 });
  } catch (error) {
    return { files: 0, bytes: 0, error: String((error && error.message) || error) };
  }
  return { files: 1, bytes: size };
}

/**
 * Remove one heavy path the owner named. It must still live inside a folder
 * aioson owns (the project's .aioson/ or researchs/, or the machine-wide
 * ~/.aioson stores) and must not be a link.
 */
function removeOwnerFinding(targetDir, item) {
  const step = { id: item.id, kind: item.kind, ok: false, files: 0, bytes: 0 };
  const roots = item.scope === 'global'
    ? [aiosonHome(), legacyRecallDir()]
    : [path.join(targetDir, '.aioson'), path.join(targetDir, 'researchs')];
  if (!roots.some((root) => isContainedFolder(item.abs, root))) {
    return { ...step, error: 'not inside a folder aioson owns (or reached through a link)' };
  }
  const result = isDirectory(item.abs) ? clearDir(item.abs) : removeFile(item.abs);
  return { ...step, ok: !result.error, files: result.files, bytes: result.bytes, error: result.error };
}

/** hygiene:scan items: every finding except owner paths the owner chose to keep. */
function storageHygieneItems(targetDir, retained = new Set()) {
  return measureStorage(targetDir, { sizes: false }).findings
    .filter((item) => item.decides === 'auto' || !retained.has(item.path))
    .map((item) => ({
      path: item.path,
      kind: item.kind,
      decides: item.decides,
      bytes: item.bytes,
      reason: item.reason,
      suggested_command: `${item.command} --dry-run`
    }));
}

/** doctor/update advisory params, or null when retention has nothing to do. */
function diskFootprintParams(targetDir) {
  try {
    const { findings } = measureStorage(targetDir, { sizes: false });
    const count = (kind) => findings.filter((item) => item.kind === kind).reduce((total, item) => total + (item.count || 1), 0);
    const params = { snapshots: count('doc_snapshots'), rollback: count('rollback_backups'), logs: count('oversized_log') };
    return params.snapshots + params.rollback + params.logs > 0 ? params : null;
  } catch {
    return null;
  }
}

module.exports = {
  SNAPSHOT_KEEP,
  ROLLBACK_KEEP,
  LOG_CAP_BYTES,
  HEAVY_PATH_BYTES,
  retireLegacyRecallIndex,
  projectSnapshotsDir,
  stampedDirs,
  pruneStamped,
  measureStorage,
  applyAutoFindings,
  findOwnerFinding,
  removeOwnerFinding,
  storageHygieneItems,
  diskFootprintParams
};
