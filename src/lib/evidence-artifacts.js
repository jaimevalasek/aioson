'use strict';

/**
 * Evidence artifacts on disk — the regenerable by-products of the visual and
 * browser gates: the captures `verify:artifact --kind=visual --screenshots`
 * writes under `visual-screenshots/`, and the per-step snapshots and
 * screenshots a `browser:run` leaves under `browser/{script}/`. The reports
 * beside them (`visual-evidence.json`, `browser/{script}.json|.md`) are the
 * evidence the gates read; the binaries are diagnostics a person or an agent
 * opens once, regenerable from the replay line every report carries.
 *
 * Why this module exists: one consumer's prototype round left 37 stale
 * failure pairs (22 MB) under a walkthrough report that read PASS 102/102,
 * beside 34 full-page captures (31 MB) that no report referenced. Every run
 * added files, nothing removed or even counted them, and the installer's
 * gitignore policy whitelisted them into the repository. Producers now remove
 * what they own and no longer produce, `hygiene:scan` weighs what is left,
 * `evidence:prune` removes it, and `feature:archive` drops it instead of
 * carrying it into `done/`.
 */

const fs = require('node:fs');
const path = require('node:path');

const RUNTIME_SCREENSHOT_DIR = 'visual-screenshots';
const WALKTHROUGH_DIR = 'browser';
const KIND_RUNTIME = 'runtime_screenshots';
const KIND_WALKTHROUGH = 'walkthrough_artifacts';
// Below this a folder is not worth a hygiene line by weight alone.
const HEAVY_BYTES = 1024 * 1024;

function posix(rel) {
  return String(rel).split(path.sep).join('/');
}

function isDir(file) {
  try { return fs.statSync(file).isDirectory(); } catch { return false; }
}

function isFile(file) {
  try { return fs.statSync(file).isFile(); } catch { return false; }
}

// A symlink, or a junction on Windows (lstat reports both as links).
function isLink(file) {
  try { return fs.lstatSync(file).isSymbolicLink(); } catch { return false; }
}

// Where `target` really lives: the real path of its nearest existing
// ancestor, joined with the part that does not exist yet.
function realLocation(target) {
  const absolute = path.resolve(target);
  let probe = absolute;
  for (;;) {
    try { return path.join(fs.realpathSync(probe), path.relative(probe, absolute)); } catch { /* climb */ }
    const parent = path.dirname(probe);
    if (parent === probe) return absolute;
    probe = parent;
  }
}

/**
 * True when `dir` is not a link and really lives strictly inside `root`
 * (a folder yet to be created lives wherever its parent really is). A
 * `visual-screenshots` junction to a folder outside the project was followed
 * by the prune and that folder's files were deleted; nothing an artifact
 * producer or pruner removes may be reached through a link.
 */
function isContainedFolder(dir, root) {
  if (!root || isLink(dir)) return false;
  const rel = path.relative(realLocation(root), realLocation(dir));
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
}

function listSubdirs(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

/** Every file under `dir`, absolute paths, deterministic order. */
function listFiles(dir) {
  const out = [];
  const walk = (current) => {
    let entries;
    try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch { return; }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) out.push(full);
    }
  };
  walk(dir);
  return out;
}

/** `{ files, bytes }` for a directory; a missing directory weighs nothing. */
function dirStats(dir) {
  let bytes = 0;
  const files = listFiles(dir);
  for (const file of files) {
    try { bytes += fs.statSync(file).size; } catch { /* counted as present, weightless */ }
  }
  return { files: files.length, bytes };
}

/**
 * Remove a directory and report what it held. Missing is `{ 0, 0 }`. Never
 * throws: one file an image viewer holds open (EPERM on Windows) escaped the
 * walkthrough before its browser session closed. A failed removal returns
 * what did go (`files`, `bytes`), what stayed (`kept`) and the `error`.
 */
function clearDir(dir) {
  const stats = dirStats(dir);
  if (stats.files > 0 || isDir(dir)) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    } catch (error) {
      const left = dirStats(dir);
      return {
        files: stats.files - left.files,
        bytes: stats.bytes - left.bytes,
        kept: left.files,
        code: (error && error.code) || null,
        error: String((error && error.message) || error)
      };
    }
  }
  return stats;
}

/**
 * Remove the files directly inside `dir` whose names are not in `keep`
 * (compared case-insensitively, as the Windows filesystem does) and report
 * them. Runs only after a measurement produced `keep`: a clear before the
 * browser launched deleted the captures that the carried-forward runtime
 * section still named when no browser opened. Never throws, never touches a
 * subfolder, and never works on a folder reached through a link or outside
 * `root`.
 */
function removeStaleFiles(dir, keep, { root } = {}) {
  const result = { files: 0, bytes: 0, failed: [] };
  if (!isContainedFolder(dir, root)) return result;
  const wanted = new Set([...keep].map((name) => String(name).toLowerCase()));
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return result; }
  for (const entry of entries) {
    if (!entry.isFile() || wanted.has(entry.name.toLowerCase())) continue;
    const file = path.join(dir, entry.name);
    let size = 0;
    try { size = fs.statSync(file).size; } catch { /* weightless */ }
    try {
      fs.rmSync(file, { force: true, maxRetries: 3, retryDelay: 50 });
    } catch (error) {
      result.failed.push({ file: entry.name, code: (error && error.code) || null, error: String((error && error.message) || error) });
      continue;
    }
    result.files += 1;
    result.bytes += size;
  }
  return result;
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

/**
 * The basenames the report beside an artifact folder still points at, or
 * `null` when no report references this folder at all (every file is then
 * an orphan: nothing the gates read knows it exists).
 */
function referencedBasenames(kind, reportFile) {
  const report = reportFile ? readJson(reportFile) : null;
  if (!report) return null;
  if (kind === KIND_WALKTHROUGH) {
    const names = new Set();
    for (const step of Array.isArray(report.steps) ? report.steps : []) {
      for (const artifact of Array.isArray(step.artifacts) ? step.artifacts : []) names.add(path.basename(String(artifact)));
    }
    return names;
  }
  const runtime = report.metrics && report.metrics.runtime;
  const shots = runtime && Array.isArray(runtime.screenshots) ? runtime.screenshots : null;
  if (!shots) return null;
  return new Set(shots.map((shot) => path.basename(String(shot))));
}

function ownerOf(rel) {
  const m = rel.match(/(?:^|\/)(features|briefings|done)\/([^/]+)\//);
  if (!m) return { owner: 'project', slug: null };
  const label = m[1] === 'features' ? 'feature' : (m[1] === 'briefings' ? 'briefing' : 'done');
  return { owner: `${label}:${m[2]}`, slug: m[2] };
}

function describe(targetDir, dir, kind, reportFile) {
  const rel = posix(path.relative(targetDir, dir));
  const files = listFiles(dir);
  const referenced = referencedBasenames(kind, reportFile);
  let bytes = 0;
  const orphanFiles = [];
  for (const file of files) {
    let size = 0;
    try { size = fs.statSync(file).size; } catch { /* weightless */ }
    bytes += size;
    if (!referenced || !referenced.has(path.basename(file))) orphanFiles.push({ file, size });
  }
  const { owner, slug } = ownerOf(rel);
  return {
    owner,
    slug,
    kind,
    path: rel,
    report: reportFile && fs.existsSync(reportFile) ? posix(path.relative(targetDir, reportFile)) : null,
    files: files.length,
    bytes,
    referenced: referenced ? files.length - orphanFiles.length : 0,
    orphans: orphanFiles.length,
    _files: files,
    _orphans: orphanFiles
  };
}

// A walkthrough that died before writing its report leaves a folder holding
// nothing but its own `{name}-step-*` artifacts.
function holdsOnlyStepArtifacts(dir, name) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return false; }
  return entries.length > 0 && entries.every((entry) => entry.isFile() && entry.name.startsWith(`${name}-step-`));
}

/**
 * The diagnostic folders an owner directory (`features/{slug}`, `briefings/{slug}`, `done/{slug}/dossier`) can hold.
 * With `root`, a folder whose real location leaves it is not one.
 */
function listDiagnosticDirs(ownerDir, { runtimeReport = null, root = null } = {}) {
  const out = [];
  // A link is never an artifact folder (see isContainedFolder).
  const owned = (dir) => (root ? isContainedFolder(dir, root) : !isLink(dir));
  const shots = path.join(ownerDir, RUNTIME_SCREENSHOT_DIR);
  if (isDir(shots) && owned(shots)) out.push({ dir: shots, kind: KIND_RUNTIME, report: runtimeReport });
  const walkthroughs = path.join(ownerDir, WALKTHROUGH_DIR);
  for (const name of listSubdirs(walkthroughs)) {
    const dir = path.join(walkthroughs, name);
    const report = path.join(walkthroughs, `${name}.json`);
    // `browser/{name}/` is a walkthrough's artifact folder only beside its
    // report `browser/{name}.json` (or when it holds nothing but that
    // script's step artifacts). Any other folder there is a caller's: a
    // walkthrough persisted with `--out=…/browser/round-2` had its own
    // report JSON and Markdown deleted as orphans by the default prune.
    if (!owned(dir) || !(isFile(report) || holdsOnlyStepArtifacts(dir, name))) continue;
    out.push({ dir, kind: KIND_WALKTHROUGH, report });
  }
  return out;
}

/**
 * Every artifact folder the gates' producers can leave in a project, with
 * its weight and how much of it the latest report still references.
 */
function scanEvidenceArtifacts(targetDir) {
  const aioson = path.join(targetDir, '.aioson');
  const context = path.join(aioson, 'context');
  const root = aioson;
  const candidates = [];
  // Project scope: a `--kind=visual --screenshots` run without a slug, and
  // slug-less walkthroughs.
  candidates.push(...listDiagnosticDirs(context, { runtimeReport: path.join(context, 'verify-artifact-visual.json'), root }));
  for (const slug of listSubdirs(path.join(context, 'features'))) {
    const owned = path.join(context, 'features', slug);
    candidates.push(...listDiagnosticDirs(owned, { runtimeReport: path.join(owned, 'visual-evidence.json'), root }));
  }
  for (const slug of listSubdirs(path.join(aioson, 'briefings'))) {
    candidates.push(...listDiagnosticDirs(path.join(aioson, 'briefings', slug), { root }));
  }
  for (const slug of listSubdirs(path.join(context, 'done'))) {
    const dossier = path.join(context, 'done', slug, 'dossier');
    candidates.push(...listDiagnosticDirs(dossier, { runtimeReport: path.join(dossier, 'visual-evidence.json'), root }));
    candidates.push(...listDiagnosticDirs(path.join(context, 'done', slug, 'briefings'), { root }));
  }
  return candidates.map((candidate) => describe(targetDir, candidate.dir, candidate.kind, candidate.report));
}

function publicEntry(entry) {
  const { _files, _orphans, ...rest } = entry;
  return rest;
}

/**
 * Remove artifact files. Default: only orphans — files the latest report no
 * longer references. `all`: every file in every artifact folder (the reports
 * stay; every one carries the line that regenerates its folder). `slug`
 * narrows to one owner. `dryRun` counts without deleting.
 */
function pruneEvidenceArtifacts(targetDir, { all = false, slug = null, dryRun = false } = {}) {
  const entries = scanEvidenceArtifacts(targetDir).filter((entry) => !slug || entry.slug === slug);
  const results = [];
  const total = { files: 0, bytes: 0 };
  for (const entry of entries) {
    const targets = all
      ? entry._files.map((file) => ({ file, size: (() => { try { return fs.statSync(file).size; } catch { return 0; } })() }))
      : entry._orphans;
    let removedFiles = 0;
    let removedBytes = 0;
    for (const target of targets) {
      if (!dryRun) {
        try { fs.rmSync(target.file, { force: true, maxRetries: 3, retryDelay: 50 }); } catch { continue; }
      }
      removedFiles += 1;
      removedBytes += target.size;
    }
    if (!dryRun && removedFiles > 0 && removedFiles === entry.files) {
      try { fs.rmSync(path.join(targetDir, entry.path), { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); } catch { /* leave the empty folder */ }
    }
    total.files += removedFiles;
    total.bytes += removedBytes;
    results.push({ ...publicEntry(entry), removed_files: removedFiles, removed_bytes: removedBytes, kept_files: entry.files - removedFiles });
  }
  return { dryRun, all, slug, entries: results, total };
}

/** Folders worth a hygiene line: an orphan on disk, or a heavy folder. */
function heavyEvidenceArtifacts(targetDir) {
  return scanEvidenceArtifacts(targetDir)
    .filter((entry) => entry.orphans > 0 || entry.bytes >= HEAVY_BYTES)
    .map((entry) => ({
      ...publicEntry(entry),
      reason: entry.orphans > 0
        ? `${entry.orphans} of ${entry.files} file(s) are not referenced by the latest report${entry.bytes >= HEAVY_BYTES ? ` (${formatBytes(entry.bytes)})` : ''}`
        : `${formatBytes(entry.bytes)} of regenerable captures`,
      suggested_command: `aioson evidence:prune . --dry-run${entry.slug ? ` --slug=${entry.slug}` : ''}`
    }));
}

function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

module.exports = {
  RUNTIME_SCREENSHOT_DIR,
  WALKTHROUGH_DIR,
  KIND_RUNTIME,
  KIND_WALKTHROUGH,
  HEAVY_BYTES,
  dirStats,
  clearDir,
  removeStaleFiles,
  isContainedFolder,
  listFiles,
  listDiagnosticDirs,
  scanEvidenceArtifacts,
  pruneEvidenceArtifacts,
  heavyEvidenceArtifacts,
  formatBytes
};
