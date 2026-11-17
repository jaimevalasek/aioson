'use strict';

/**
 * The projects this machine's operator works in — `~/.aioson/projects.json`.
 *
 * Operator memory knew decisions but not projects: nothing listed where AIOSON
 * was installed, so no surface could say what the person usually chooses (58
 * projects sat on one machine, each with a project.context.md nobody compared).
 * Every session start (`context:digest`) records the project it runs in; an
 * explicit scan (`scanForProjects`) imports the ones already on disk.
 *
 * Only real AIOSON roots are recorded (a `.aioson/context/project.context.md`,
 * never a folder inside a `.aioson/` data tree), never a throwaway folder under
 * the OS temp dir (a test run or a probe would fill the operator's list) unless
 * the home itself is a sandbox there. Reading prunes nothing on disk: a project
 * whose folder is gone is left out of the answer and dropped at the next write.
 * Writes are best-effort, atomic, and at most once an hour per project.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REGISTRY_FILE = 'projects.json';
const SCHEMA_VERSION = 1;
const MAX_PROJECTS = 500;
const TOUCH_INTERVAL_MS = 60 * 60 * 1000;
const SCAN_SKIP = new Set(['node_modules', 'vendor', 'dist', 'build', 'out', 'target', 'coverage', '__pycache__']);

function registryPath(home = os.homedir()) {
  return path.join(home, '.aioson', REGISTRY_FILE);
}

function contextFile(dir) {
  return path.join(dir, '.aioson', 'context', 'project.context.md');
}

function samePath(a, b) {
  const left = path.resolve(a);
  const right = path.resolve(b);
  return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;
}

function underDir(child, parent) {
  const a = path.resolve(child);
  const b = path.resolve(parent);
  const [x, y] = process.platform === 'win32' ? [a.toLowerCase(), b.toLowerCase()] : [a, b];
  return x === y || x.startsWith(y.endsWith(path.sep) ? y : `${y}${path.sep}`);
}

function realOrSelf(dir) {
  try { return fs.realpathSync.native(dir); } catch { return path.resolve(dir); }
}

/** Disabled by `AIOSON_PROJECT_REGISTRY=false` or by turning operator memory off. */
function registryDisabled(env = process.env) {
  const flag = (name) => String(env[name] || '').trim().toLowerCase() === 'false';
  return flag('AIOSON_PROJECT_REGISTRY') || flag('AIOSON_OPERATOR_MEMORY');
}

/** Why `dir` is not a project to record, or null when it is one. */
function refusal(dir, home) {
  if (!fs.existsSync(contextFile(dir))) return 'no_project_context';
  const parts = path.resolve(dir).split(/[\\/]+/);
  if (parts.includes('.aioson')) return 'inside_data_tree';
  const tmp = realOrSelf(os.tmpdir());
  if (underDir(realOrSelf(dir), tmp) && !underDir(realOrSelf(home), tmp)) return 'temporary_folder';
  return null;
}

function emptyRegistry() {
  return { version: SCHEMA_VERSION, projects: [] };
}

function readRegistry(home = os.homedir()) {
  try {
    const parsed = JSON.parse(fs.readFileSync(registryPath(home), 'utf8'));
    const projects = Array.isArray(parsed && parsed.projects) ? parsed.projects.filter((p) => p && typeof p.path === 'string') : [];
    return { version: SCHEMA_VERSION, projects };
  } catch {
    return emptyRegistry();
  }
}

function writeRegistry(registry, home = os.homedir()) {
  const file = registryPath(home);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const living = registry.projects.filter((p) => fs.existsSync(contextFile(p.path)));
  living.sort((a, b) => String(b.last_seen || '').localeCompare(String(a.last_seen || '')));
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify({ version: SCHEMA_VERSION, projects: living.slice(0, MAX_PROJECTS) }, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, file);
}

function projectName(dir) {
  try {
    const match = fs.readFileSync(contextFile(dir), 'utf8').match(/^project_name:\s*["']?([^"'\r\n]+)["']?\s*$/m);
    if (match && match[1].trim()) return match[1].trim();
  } catch { /* the folder name stands in */ }
  return path.basename(path.resolve(dir));
}

/**
 * Record (or touch) the projects in `dirs`. Returns { added, touched, skipped }.
 * `force` skips the hourly debounce (an explicit scan).
 */
function recordProjects(dirs, { home = os.homedir(), now = Date.now(), env = process.env, force = false } = {}) {
  const outcome = { added: [], touched: [], skipped: [] };
  if (registryDisabled(env)) return { ...outcome, disabled: true };
  const registry = readRegistry(home);
  let changed = false;
  for (const raw of dirs) {
    const dir = path.resolve(raw);
    const why = refusal(dir, home);
    if (why) { outcome.skipped.push({ path: dir, reason: why }); continue; }
    const iso = new Date(now).toISOString();
    const entry = registry.projects.find((p) => samePath(p.path, dir));
    if (!entry) {
      registry.projects.push({ path: dir, name: projectName(dir), first_seen: iso, last_seen: iso });
      outcome.added.push(dir);
      changed = true;
      continue;
    }
    const last = new Date(entry.last_seen || 0).getTime();
    if (!force && last && now - last < TOUCH_INTERVAL_MS) continue;
    entry.last_seen = iso;
    entry.name = projectName(dir);
    outcome.touched.push(dir);
    changed = true;
  }
  if (changed) writeRegistry(registry, home);
  return outcome;
}

/** Best-effort record of one project; never throws. */
function recordProjectQuietly(dir, options = {}) {
  try { return recordProjects([dir], options); } catch { return null; }
}

/** The recorded projects whose folder still holds a project context, newest first. */
function livingProjects(home = os.homedir()) {
  return readRegistry(home).projects
    .filter((p) => fs.existsSync(contextFile(p.path)))
    .sort((a, b) => String(b.last_seen || '').localeCompare(String(a.last_seen || '')));
}

/** AIOSON roots under `root`, `depth` folders deep at most; never inside a data tree or a dependency folder. */
function scanForProjects(root, { depth = 3 } = {}) {
  const found = [];
  const walk = (dir, left) => {
    if (fs.existsSync(contextFile(dir))) { found.push(path.resolve(dir)); return; }
    if (left <= 0) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || SCAN_SKIP.has(entry.name)) continue;
      walk(path.join(dir, entry.name), left - 1);
    }
  };
  walk(path.resolve(root), depth);
  return found;
}

module.exports = {
  recordProjects,
  recordProjectQuietly,
  livingProjects,
  readRegistry,
  scanForProjects,
  registryPath,
  registryDisabled,
  contextFile,
  REGISTRY_FILE,
  TOUCH_INTERVAL_MS
};
