'use strict';

/**
 * Hook Exit Code Protocol
 *
 * Standardized exit codes for AIOSON hook scripts:
 *   HOOK_ALLOW (0): Allow the operation — continue normally
 *   HOOK_DENY  (2): Deny the operation — abort with error message from stderr
 *   Any other:      Warn — log stderr, continue (non-fatal)
 *
 * Used by squad:autorun to run `hooks.pre_run` scripts declared in squad manifests.
 * Allows squads to gate their own execution based on inter-squad state.
 *
 * Example manifest:
 *   "hooks": {
 *     "pre_run": "sh .aioson/squads/distribution-team/hooks/check-content-ready.sh"
 *   }
 *
 * Example hook script (exits 2 to deny):
 *   #!/bin/sh
 *   STATUS=$(aioson squad:status . --squad=content-team --json | jq -r '.status')
 *   [ "$STATUS" = "active" ] && exit 0
 *   echo "content-team not ready (status: $STATUS)" >&2
 *   exit 2
 */

const { spawnSync } = require('node:child_process');

const HOOK_ALLOW = 0;
const HOOK_DENY = 2;

/**
 * Run a hook script and interpret its exit code.
 *
 * @param {string} script   Shell command to execute (via `sh -c`)
 * @param {object} context  Key-value pairs passed as uppercase env vars to the script
 * @param {object} opts     Options: { timeoutMs }
 *
 * @returns {{ allowed: boolean, denied: boolean, exitCode: number, stdout: string, stderr: string, warn?: boolean }}
 */
function runHook(script, context = {}, opts = {}) {
  const timeoutMs = opts.timeoutMs || 10_000;

  const env = {
    ...process.env,
    ...Object.fromEntries(
      Object.entries(context).map(([k, v]) => [
        'AIOSON_' + k.toUpperCase().replace(/[^A-Z0-9]/g, '_'),
        String(v)
      ])
    )
  };

  const shell = process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : 'sh';
  const result = spawnSync(script, {
    shell,
    env,
    timeout: timeoutMs,
    encoding: 'utf8',
    stdio: 'pipe'
  });

  if (result.error || result.signal || result.status === null) {
    return { allowed: false, denied: true, exitCode: null, stdout: result.stdout || '',
      stderr: result.error?.message || `Hook interrupted: ${result.signal || 'unknown outcome'}` };
  }
  const exitCode = result.status;
  const stdout = (result.stdout || '').trim();
  const stderr = (result.stderr || '').trim();

  if (exitCode === HOOK_DENY) {
    return { allowed: false, denied: true, exitCode, stdout, stderr };
  }

  if (exitCode !== HOOK_ALLOW) {
    return { allowed: true, denied: false, exitCode, stdout, stderr, warn: true };
  }

  return { allowed: true, denied: false, exitCode, stdout, stderr };
}

module.exports = { HOOK_ALLOW, HOOK_DENY, runHook };
