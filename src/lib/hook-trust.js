'use strict';

/**
 * Hook trust for the sessions AIOSON launches unattended.
 *
 * Codex runs a new or changed hook only after the user trusts it in its TUI
 * (`/hooks`, kept by the hash of the definition). Nobody sits at the terminal
 * of a lane worker or of a `live:start` session running under the unattended
 * flag, so the hooks AIOSON installed there (`hooks:install --tool=codex`:
 * runtime telemetry, the checkpoint after a compaction) would never run.
 * Codex documents `--dangerously-bypass-hook-trust` for exactly this case,
 * "automation that already vets hook sources", and AIOSON vets the hooks it
 * wrote. The flag is per invocation, not per hook: under it EVERY enabled hook
 * runs unreviewed, so it is added only when the hook file holds AIOSON's
 * handlers and nothing else.
 *
 * The flag is added at the spawn, by the launch paths, never by the argv
 * builders (`resolvePermissionModeArgs`, `resolveSandboxArgs`, an adapter's
 * build()) whose output the tests and `host:signature` pin. It is added only
 * when every condition holds, the cheap deterministic ones first:
 *   1. the host registers `hook_trust_args` (src/lib/tool-capabilities.js);
 *   2. the session is unattended — by the host's own bypass flag (the
 *      registry's, or one of `unattended_flags` the caller passed); a caller
 *      that asked for approvals (`-a on-request`) has a human at the terminal,
 *      and `/hooks` is the right door there;
 *   3. the caller's own args do not carry the flag already (Codex refuses a
 *      flag given twice);
 *   4. the host's hook file holds a hook AIOSON installed: with none there is
 *      nothing of ours to vet;
 *   5. no other hook source Codex would load (`foreign_hooks`, `source` naming
 *      it): another handler in that hook file, a `hooks` table in the same
 *      layer's config.toml, a project layer (`.codex/hooks.json`, `.codex/hooks`
 *      or hooks in `.codex/config.toml`, from the session's directory up to its
 *      repository root, or that directory alone outside a repository) or a
 *      plugin carrying hooks (`hooks/hooks.json` or a `hooks` key in its
 *      plugin.json) — the user's own hooks, which nobody here vetted, keep
 *      their review;
 *   6. the binary that will run lists the flag in its `--help`: an older Codex
 *      refuses an unknown argument and the session would not open at all.
 *      A positive answer is kept per process and command line; a failed or
 *      timed-out probe is asked again on the next launch.
 * Never throws: a launch must not fail over a courtesy flag.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { getToolCapabilities } = require('./tool-capabilities');
const { configPaths, allHandlers, isAiosonHandler } = require('./hook-settings-files');

const HELP_TIMEOUT_MS = 10000;
const HELP_MAX_BYTES = 4 * 1024 * 1024;
const helpProbes = new Map();

/** AIOSON's handlers and everyone else's in the host's hook file. */
function hookFileState(host) {
  const file = configPaths()[host];
  if (!file) return { aioson: 0, foreign: 0 };
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return { aioson: 0, foreign: 0 };
  }
  const handlers = allHandlers(parsed);
  const aioson = handlers.filter(isAiosonHandler).length;
  return { aioson, foreign: handlers.length - aioson };
}

/** True when the host's hook file holds at least one hook AIOSON installed. */
function aiosonHooksInstalled(host) {
  return hookFileState(host).aioson > 0;
}

// ─── The other places Codex loads hooks from ─────────────────────────────────
// The flag covers every enabled hook, wherever Codex found it, so each of these
// counts as foreign: the second representation of the user layer (config.toml),
// the project layers (`.codex/` from the session's directory up to its
// repository root, the way Codex finds them) and the plugins. Seen in codex
// 0.162.1: "loading hooks from both … prefer a single representation for this
// layer", "Failed to read project hooks config file", `plugin.json#hooks`.

const MAX_PROJECT_DEPTH = 64;
const MAX_PLUGIN_DEPTH = 6;
// A table header (`[hooks]`, `[hooks.Stop]`, `[[hooks.PostToolUse]]`) and a key
// that opens a hooks table (`hooks = …`, `hooks.Stop = …`).
const TOML_HEADER = /^\[\[?\s*([^\]]+?)\s*\]\]?$/;
const TOML_HOOKS_KEY = /^["']?hooks["']?\s*[=.]/;

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

/** Whether a Codex config.toml defines hooks. `[features] hooks = true` switches the feature on: it is not a hook. */
function tomlDefinesHooks(text) {
  let table = '';
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    const header = TOML_HEADER.exec(line);
    if (header) table = header[1].replace(/["'\s]/g, '');
    if (header && table.split('.').includes('hooks')) return true;
    if (!header && table !== 'features' && TOML_HOOKS_KEY.test(line)) return true;
  }
  return false;
}

/** The config.toml of a Codex layer, when it defines hooks. */
function tomlHookSource(layerDir) {
  const file = path.join(layerDir, 'config.toml');
  const text = readText(file);
  return text !== null && tomlDefinesHooks(text) ? file : null;
}

/** A project layer's hooks: its hooks.json (a handler in it, or one Codex cannot parse), a `hooks` entry, or hooks in its config.toml. */
function projectLayerHookSource(layerDir) {
  const hooksJson = path.join(layerDir, 'hooks.json');
  const text = readText(hooksJson);
  let parsed;
  try { parsed = text === null ? null : JSON.parse(text); } catch { return hooksJson; }
  if (parsed && allHandlers(parsed).length > 0) return hooksJson;
  const hooksEntry = path.join(layerDir, 'hooks');
  if (fs.existsSync(hooksEntry)) return hooksEntry;
  return tomlHookSource(layerDir);
}

const samePath = (a, b) => (process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b);

/** The directories whose `.codex/` is a project layer: `cwd` up to its repository root (`.git`), or `cwd` alone outside one. */
function projectLayerDirs(cwd) {
  const start = path.resolve(cwd || process.cwd());
  const dirs = [];
  let dir = start;
  for (let depth = 0; depth < MAX_PROJECT_DEPTH; depth += 1) {
    dirs.push(dir);
    if (fs.existsSync(path.join(dir, '.git'))) return dirs;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return [start];
}

/** The first project layer with hooks (the user layer is not a project). */
function projectHookSource(cwd, codexDir) {
  const userLayers = [path.resolve(codexDir), path.join(os.homedir(), '.codex')];
  for (const dir of projectLayerDirs(cwd)) {
    const layer = path.join(dir, '.codex');
    const found = userLayers.some((user) => samePath(user, layer)) ? null : projectLayerHookSource(layer);
    if (found) return found;
  }
  return null;
}

/** A plugin's hooks: `hooks/hooks.json` beside its `.codex-plugin/`, or a `hooks` key in its plugin.json. */
function pluginRootHookSource(root) {
  const hooksJson = path.join(root, 'hooks', 'hooks.json');
  if (fs.existsSync(hooksJson)) return hooksJson;
  const manifest = [path.join(root, '.codex-plugin', 'plugin.json'), path.join(root, 'plugin.json')].find((file) => {
    try {
      return Boolean(JSON.parse(readText(file) || 'null').hooks);
    } catch {
      return false;
    }
  });
  return manifest ? `${manifest}#hooks` : null;
}

function subdirectories(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name !== 'node_modules')
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

/** The first plugin under `<codexDir>/plugins` that carries hooks; a folder holding `.codex-plugin/` is a plugin root. */
function pluginHookSource(codexDir) {
  const pending = [[path.join(codexDir, 'plugins'), 0]];
  while (pending.length > 0) {
    const [dir, depth] = pending.pop();
    const children = subdirectories(dir);
    const found = children.includes('.codex-plugin') ? pluginRootHookSource(dir) : null;
    if (found) return found;
    if (!children.includes('.codex-plugin') && depth < MAX_PLUGIN_DEPTH) {
      for (const child of children) pending.push([path.join(dir, child), depth + 1]);
    }
  }
  return null;
}

/** The first hook source the host would load besides AIOSON's handlers in its hook file, or null. */
function foreignHookSource(host, state, cwd) {
  if (state.foreign > 0) return configPaths()[host];
  if (host !== 'codex') return null;
  const codexDir = path.dirname(configPaths().codex);
  return tomlHookSource(codexDir) || projectHookSource(cwd, codexDir) || pluginHookSource(codexDir);
}

/**
 * Whether a launch's permission decision (resolveLaunchPermission) leaves
 * nobody to approve: the registry's unattended flag, or a caller flag that is
 * one of the host's own bypass flags. A caller that stated approvals or a
 * sandbox of its own is attended.
 */
function isUnattendedPermission(permission) {
  if (!permission || permission.mode !== 'yolo') return false;
  if (permission.source === 'registry') return true;
  if (permission.source !== 'tool_args') return false;
  const caps = getToolCapabilities(permission.host);
  const bypass = [...((caps && caps.yolo_args) || []), ...((caps && caps.unattended_flags) || [])];
  return bypass.includes(String(permission.flag || '').split('=')[0]);
}

/** What the command line prints as help: stdout and stderr, '' when it cannot run. */
function helpText({ command, args = [], options = {} }) {
  return new Promise((resolve) => {
    try {
      execFile(
        command,
        args,
        { windowsHide: true, timeout: HELP_TIMEOUT_MS, maxBuffer: HELP_MAX_BYTES, encoding: 'utf8', ...options },
        (error, stdout, stderr) => resolve(`${stdout || ''}\n${stderr || ''}`)
      );
    } catch {
      resolve('');
    }
  });
}

/**
 * Whether the help of the command line that will run lists every flag. A yes
 * is kept per process and command line; a no — or a probe that failed or timed
 * out on a cold binary — is asked again on the next launch.
 */
function listsFlags(probe, flags) {
  const key = JSON.stringify([probe.command, probe.args || [], flags]);
  if (!helpProbes.has(key)) {
    const pending = helpText(probe).then((text) => flags.every((flag) => text.includes(flag)));
    helpProbes.set(key, pending);
    pending.then((listed) => { if (!listed) helpProbes.delete(key); });
  }
  return helpProbes.get(key);
}

/**
 * The hook-trust argv for one launch of `host`, and why.
 * `probe` is the command line that prints the binary's help, the way the
 * caller will spawn it: `{ command, args, options }`; `cwd` is the directory
 * the session works in (its project layer), the process's own by default.
 * Returns `{ args, reason }`; reason is one of no_hook_trust (the host
 * registers none), attended, caller_flag, hooks_not_installed, foreign_hooks
 * (another hook source would run unreviewed under the flag — `source` names
 * it), flag_unknown (the binary does not list it, or could not be asked) and
 * added.
 */
async function resolveHookTrustArgs(host, { unattended = true, existingArgs = [], probe = null, cwd } = {}) {
  try {
    const caps = host ? getToolCapabilities(host) : null;
    const flags = caps && Array.isArray(caps.hook_trust_args) ? caps.hook_trust_args.map(String) : [];
    if (flags.length === 0) return { args: [], reason: 'no_hook_trust' };
    if (!unattended) return { args: [], reason: 'attended' };
    if ((existingArgs || []).some((arg) => flags.includes(String(arg)))) return { args: [], reason: 'caller_flag' };
    const state = hookFileState(host);
    if (state.aioson === 0) return { args: [], reason: 'hooks_not_installed' };
    const foreign = foreignHookSource(host, state, cwd);
    if (foreign) return { args: [], reason: 'foreign_hooks', source: foreign };
    if (!probe || !probe.command || !(await listsFlags(probe, flags))) return { args: [], reason: 'flag_unknown' };
    return { args: [...flags], reason: 'added' };
  } catch {
    return { args: [], reason: 'flag_unknown' };
  }
}

/** Test seam: forget the cached help probes. */
function resetHookTrustProbes() {
  helpProbes.clear();
}

module.exports = { resolveHookTrustArgs, aiosonHooksInstalled, isUnattendedPermission, resetHookTrustProbes };
