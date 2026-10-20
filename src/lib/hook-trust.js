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
 * wrote.
 *
 * The flag is added at the spawn, by the launch paths, never by the argv
 * builders (`resolvePermissionModeArgs`, `resolveSandboxArgs`, an adapter's
 * build()) whose output the tests and `host:signature` pin. It is added only
 * when every condition holds, the cheap deterministic ones first:
 *   1. the host registers `hook_trust_args` (src/lib/tool-capabilities.js);
 *   2. the session is unattended: with a human at the terminal, `/hooks` is
 *      the right door;
 *   3. the caller's own args do not carry the flag already (Codex refuses a
 *      flag given twice);
 *   4. the host's hook file holds a hook AIOSON installed: with none there is
 *      nothing of ours to vet, and the user's own untrusted hooks stay so;
 *   5. the binary that will run lists the flag in its `--help`: an older Codex
 *      refuses an unknown argument and the session would not open at all.
 *      Probed once per process and command line.
 * Never throws: a launch must not fail over a courtesy flag.
 */

const fs = require('node:fs');
const { execFile } = require('node:child_process');
const { getToolCapabilities } = require('./tool-capabilities');

const HELP_TIMEOUT_MS = 10000;
const HELP_MAX_BYTES = 4 * 1024 * 1024;
const helpProbes = new Map();

// Lazy: hooks-install loads the agent catalog, which a launch path does not
// need until here. The hook file and the signature test stay its single source.
function hookFileOf(host) {
  const { configPaths, isAiosonHookEntry } = require('../commands/hooks-install');
  const file = configPaths()[host];
  return file ? { file, isAiosonHookEntry } : null;
}

/** True when the host's hook file holds at least one hook AIOSON installed. */
function aiosonHooksInstalled(host) {
  const target = hookFileOf(host);
  if (!target) return false;
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(target.file, 'utf8'));
  } catch {
    return false;
  }
  const events = parsed && typeof parsed === 'object' && parsed.hooks && typeof parsed.hooks === 'object' ? parsed.hooks : {};
  return Object.values(events).some((groups) => Array.isArray(groups) && groups.some((group) => target.isAiosonHookEntry(group)));
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

/** Whether the help of the command line that will run lists every flag; probed once per process and command line. */
function listsFlags(probe, flags) {
  const key = JSON.stringify([probe.command, probe.args || []]);
  if (!helpProbes.has(key)) helpProbes.set(key, helpText(probe));
  return helpProbes.get(key).then((text) => flags.every((flag) => text.includes(flag)));
}

/**
 * The hook-trust argv for one launch of `host`, and why.
 * `probe` is the command line that prints the binary's help, the way the
 * caller will spawn it: `{ command, args, options }`.
 * Returns `{ args, reason }`; reason is one of no_hook_trust (the host
 * registers none), attended, caller_flag, hooks_not_installed, flag_unknown
 * (the binary does not list it, or could not be asked) and added.
 */
async function resolveHookTrustArgs(host, { unattended = true, existingArgs = [], probe = null } = {}) {
  try {
    const caps = host ? getToolCapabilities(host) : null;
    const flags = caps && Array.isArray(caps.hook_trust_args) ? caps.hook_trust_args.map(String) : [];
    if (flags.length === 0) return { args: [], reason: 'no_hook_trust' };
    if (!unattended) return { args: [], reason: 'attended' };
    if ((existingArgs || []).some((arg) => flags.includes(String(arg)))) return { args: [], reason: 'caller_flag' };
    if (!aiosonHooksInstalled(host)) return { args: [], reason: 'hooks_not_installed' };
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

module.exports = { resolveHookTrustArgs, aiosonHooksInstalled, resetHookTrustProbes };
