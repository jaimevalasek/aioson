'use strict';

/**
 * The harness settings files AIOSON's hooks live in — Claude Code's
 * settings.json, Codex's hooks.json, the OpenCode plugin path: where each one
 * is, which handler in it is AIOSON's, and how it is read and written without
 * ever losing what the user keeps there. hooks:install and the hook-trust
 * decision of the unattended launches read the same answers here.
 */

const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');

function envDir(name, fallback) {
  const value = process.env[name];
  return typeof value === 'string' && value.trim() ? path.resolve(value.trim()) : fallback;
}

// Resolved per call, never at load: tests point the home at a temporary
// directory. Each harness's own override wins over the home default, the way
// the harness reads it: CLAUDE_CONFIG_DIR (Claude Code), CODEX_HOME (Codex),
// XDG_CONFIG_HOME (OpenCode reads `$XDG_CONFIG_HOME/opencode` on every OS).
function configPaths() {
  const home = os.homedir();
  const claudeDir = envDir('CLAUDE_CONFIG_DIR', path.join(home, '.claude'));
  const codexDir = envDir('CODEX_HOME', path.join(home, '.codex'));
  const configDir = envDir('XDG_CONFIG_HOME', path.join(home, '.config'));
  return {
    claude: path.join(claudeDir, 'settings.json'),
    antigravity: path.join(home, '.gemini', 'antigravity', 'hooks.json'),
    antigravity_workspace: '.agents/hooks.json', // relative to project
    codex: path.join(codexDir, 'hooks.json'),
    codex_wrapper: path.join(codexDir, 'aioson-wrapper.sh'), // pre-native-hooks workaround
    opencode: path.join(configDir, 'opencode', 'plugins', 'aioson.js')
  };
}

// AIOSON's generated commands, every version of them: `aioson <command>` and
// then `"$PWD"` (POSIX) or `.` (Windows). Anchored at the start, so a user's own
// hook that merely calls aioson (`npx aioson live:start …; notify.py`) is never
// taken for ours, scrubbed or counted as one AIOSON vets.
const AIOSON_COMMAND_RE = /^aioson (?:hooks:emit|hooks:recap|agent:done|context:guard|live:start) (?:"\$PWD"|\.)(?:\s|$)/;

/** True for one handler AIOSON generated. */
function isAiosonHandler(handler) {
  return Boolean(handler && typeof handler.command === 'string' && AIOSON_COMMAND_RE.test(handler.command.trim()));
}

/** The handlers of a matcher group (`{ hooks: [...] }`), or the entry itself when it is a flat handler. */
function handlersOf(entry) {
  if (!entry || typeof entry !== 'object') return [];
  if (Array.isArray(entry.hooks)) return entry.hooks;
  return typeof entry.command === 'string' ? [entry] : [];
}

/** True for a group (or flat entry) whose every handler is AIOSON's. */
function isAiosonHookEntry(entry) {
  const handlers = handlersOf(entry);
  return handlers.length > 0 && handlers.every(isAiosonHandler);
}

/**
 * An event's groups with AIOSON's handlers taken out, handler by handler: a
 * user's handler sharing a group with ours stays, and a group goes only when
 * nothing of the user's is left in it.
 */
function withoutAiosonHandlers(groups) {
  const kept = [];
  for (const entry of groups) {
    if (entry && Array.isArray(entry.hooks)) {
      const own = entry.hooks.filter((handler) => !isAiosonHandler(handler));
      if (own.length === entry.hooks.length) kept.push(entry);
      else if (own.length > 0) kept.push({ ...entry, hooks: own });
    } else if (!isAiosonHandler(entry)) {
      kept.push(entry);
    }
  }
  return kept;
}

function hooksObjectOf(config) {
  const hooks = config && config.hooks;
  if (hooks === undefined || hooks === null) return {};
  if (typeof hooks !== 'object' || Array.isArray(hooks)) throw new Error('"hooks" is not an object; fix the file and re-run');
  return hooks;
}

/** Every handler of a hooks file, flattened across events and groups. */
function allHandlers(config) {
  let hooks;
  try { hooks = hooksObjectOf(config); } catch { return []; }
  return Object.values(hooks).flatMap((groups) => (Array.isArray(groups) ? groups.flatMap(handlersOf) : []));
}

// Read a JSON config as the base of a merge. Only a file that is not there is
// a fresh start. A file that exists and does not parse — or cannot be read
// right now (EBUSY/EPERM: an editor, an antivirus scan, an ACL) — must abort
// the merge for that target: writing "merged" hooks over content we could not
// read would replace the user's whole settings file with a hooks-only object.
async function readJsonForMerge(filePath) {
  let raw;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') return { data: {}, corrupted: false };
    return { data: null, corrupted: false, unreadable: (error && error.code) || 'EUNKNOWN' };
  }
  try {
    return { data: JSON.parse(raw), corrupted: false };
  } catch {
    return { data: null, corrupted: true };
  }
}

/** The skip reason (and its warning) when a merge base cannot be used, else null. */
function unusableConfig(read, label, filePath, logger) {
  if (read.corrupted) {
    logger.log(`  ⚠ ${label} — ${filePath} exists but is not valid JSON; leaving it untouched. Fix the file and re-run: aioson hooks:install`);
    return 'invalid-config';
  }
  if (read.unreadable) {
    logger.log(`  ⚠ ${label} — ${filePath} could not be read (${read.unreadable}); leaving it untouched. Re-run once nothing holds it open: aioson hooks:install`);
    return 'unreadable-config';
  }
  return null;
}

async function renameWithRetry(from, to) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await fs.rename(from, to);
      return;
    } catch (error) {
      // Windows refuses a rename over a file another process holds for a moment.
      if (attempt >= 4 || !['EPERM', 'EBUSY', 'EACCES'].includes(error && error.code)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
    }
  }
}

// Written next to the target and renamed over it: a crash or a full disk
// mid-write never leaves a truncated settings file behind.
async function writeFileAtomic(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.aioson-${process.pid}-${Date.now()}.tmp`;
  await fs.writeFile(tmp, content, 'utf8');
  try {
    await renameWithRetry(tmp, filePath);
  } catch (error) {
    await fs.rm(tmp, { force: true }).catch(() => {});
    throw error;
  }
}

// Merge AIOSON hook groups into a Claude-shaped settings object (`hooks` →
// event → groups), keeping the user's own entries: previous AIOSON handlers are
// scrubbed first, so a reinstall never duplicates and an event dropped from
// the build disappears.
function mergeHookEvents(existing, newHooks) {
  const merged = { ...(existing || {}) };
  merged.hooks = { ...hooksObjectOf(merged) };
  for (const event of Object.keys(merged.hooks)) {
    if (!Array.isArray(merged.hooks[event])) continue;
    merged.hooks[event] = withoutAiosonHandlers(merged.hooks[event]);
    if (merged.hooks[event].length === 0) delete merged.hooks[event];
  }
  for (const [event, hookList] of Object.entries(newHooks)) {
    const current = merged.hooks[event];
    if (current !== undefined && !Array.isArray(current)) throw new Error(`"hooks.${event}" is not a list; fix the file and re-run`);
    merged.hooks[event] = [...(current || []), ...hookList];
  }
  return merged;
}

/** AIOSON's handlers of a hooks file, as one comparable text: equal means Codex keeps the trust it gave them. */
function aiosonDefinition(config) {
  let hooks;
  try { hooks = hooksObjectOf(config); } catch { return ''; }
  const out = {};
  for (const event of Object.keys(hooks).sort()) {
    if (!Array.isArray(hooks[event])) continue;
    const own = hooks[event]
      .filter((entry) => handlersOf(entry).some(isAiosonHandler))
      .map((entry) => ({ matcher: entry.matcher || null, hooks: handlersOf(entry).filter(isAiosonHandler) }));
    if (own.length) out[event] = own;
  }
  return JSON.stringify(out);
}

/** Writes a scrubbed hooks file back — or, on a dry run, says what it would remove. */
async function writeScrubbed(tool, filePath, data, dryRun, logger, label) {
  if (!dryRun) {
    await writeFileAtomic(filePath, JSON.stringify(data, null, 2));
    logger.log(`  ✓ ${label} hooks removed — ${filePath}`);
  } else {
    logger.log(`  [dry-run] Would remove AIOSON hooks from: ${filePath}`);
  }
  return { tool, path: filePath, removed: true };
}

// Remove AIOSON handlers from a Claude-shaped hooks file, leaving user hooks alone.
async function scrubHookFile(tool, filePath, dryRun, logger, label) {
  const read = await readJsonForMerge(filePath);
  if (read.unreadable || read.corrupted) {
    return { tool, path: filePath, removed: false, reason: unusableConfig(read, label, filePath, logger) };
  }
  if (!read.data || Object.keys(read.data).length === 0) {
    logger.log(`  ${label} hooks not found — nothing to remove`);
    return { tool, path: filePath, removed: false };
  }
  const existing = read.data;
  const hooks = hooksObjectOf(existing);
  for (const event of Object.keys(hooks)) {
    if (!Array.isArray(hooks[event])) continue;
    hooks[event] = withoutAiosonHandlers(hooks[event]);
    if (hooks[event].length === 0) delete hooks[event];
  }
  if (existing.hooks && Object.keys(existing.hooks).length === 0) delete existing.hooks;
  return writeScrubbed(tool, filePath, existing, dryRun, logger, label);
}

module.exports = {
  configPaths,
  isAiosonHandler,
  isAiosonHookEntry,
  allHandlers,
  readJsonForMerge,
  unusableConfig,
  writeFileAtomic,
  writeScrubbed,
  mergeHookEvents,
  aiosonDefinition,
  scrubHookFile
};
