'use strict';

/**
 * What a walkthrough may do with a session and a test account, checked before
 * any page opens.
 *
 * Logging in by hand on every run cost a Dev minutes per flow, so nobody used the
 * instrument. A seeded account on a local app may log in once (`value_env`), keep
 * the session (`--save-state`) and reuse it (`--state`). Everything else stays as
 * it was: a real account goes through `--cdp`, whose session is the operator's and
 * is never read or written here.
 *
 * A state file holds live session cookies, so it lives only under
 * `.aioson/runtime/`, which the installer's gitignore policy keeps local.
 */

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const { resolveBrowserRequest } = require('../browser-session');
const { isLoopbackUrl } = require('./scenario');

const RUNTIME_RELATIVE = '.aioson/runtime';

function flatten(steps) {
  return (steps || []).flatMap((step) => (step.do === 'each' ? [step, ...flatten(step.steps)] : [step]));
}

function hostOf(url) {
  try {
    return new URL(url).hostname || new URL(url).protocol;
  } catch {
    return String(url);
  }
}

/**
 * Refuses a script with `value_env` when the target or a literal `goto` leaves the
 * machine. A url built from a variable cannot be read here, so the step checks the
 * page it is about to type into as well.
 */
function valueEnvRefusal(script, baseUrl) {
  const steps = flatten(script.steps);
  if (!steps.some((step) => step.value_env !== undefined)) return null;
  const literalGotos = steps
    .filter((step) => step.do === 'goto' && /^[a-z][a-z0-9+.-]*:/i.test(String(step.url)))
    .map((step) => String(step.url));
  const outside = [...(baseUrl ? [baseUrl] : []), ...literalGotos].find((url) => !isLoopbackUrl(url));
  if (!outside) return null;
  return {
    ok: false,
    error: 'value_env_requires_loopback',
    detail: `value_env only runs against a loopback target, and this one reaches ${hostOf(outside)}`,
    hint: 'value_env is for an account seeded on a local app. Attach to the operator\'s signed-in browser with --cdp for anything else, with no credential in the script'
  };
}

function isInside(root, target) {
  const rel = path.relative(root, target);
  return rel !== '' && !rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel);
}

// A link inside the folder must not carry the file out of it.
function realLocationStaysInside(targetDir, runtimeRoot, file) {
  const realProject = fs.realpathSync(targetDir);
  let probe = file;
  while (!fs.existsSync(probe)) {
    const parent = path.dirname(probe);
    if (parent === probe) return false;
    probe = parent;
  }
  const real = fs.realpathSync(probe);
  if (fs.existsSync(runtimeRoot)) {
    const realRoot = fs.realpathSync(runtimeRoot);
    if (!isInside(realProject, realRoot)) return false;
    return real === realRoot || isInside(realRoot, real);
  }
  return real === realProject || isInside(realProject, real);
}

// `git check-ignore` exits 0 ignored, 1 not ignored, 128 outside a repository.
function trackedByGit(targetDir, file) {
  try {
    execFileSync('git', ['check-ignore', '-q', '--', file], { cwd: targetDir, stdio: 'ignore' });
    return false;
  } catch (error) {
    return error.status === 1;
  }
}

function stateFile(targetDir, raw, flag) {
  const refuse = (error, detail, hint) => ({ refusal: { ok: false, error, detail, hint } });
  if (typeof raw !== 'string' || !raw.trim()) {
    return refuse('state_path_missing', `${flag} needs a file`, `name one under ${RUNTIME_RELATIVE}/, such as ${RUNTIME_RELATIVE}/browser-state/owner.json`);
  }
  const project = path.resolve(targetDir);
  const runtimeRoot = path.join(project, '.aioson', 'runtime');
  const file = path.resolve(project, raw.trim());
  if (!isInside(runtimeRoot, file) || !realLocationStaysInside(project, runtimeRoot, file)) {
    return refuse('state_path_outside_runtime', `${flag} is accepted only under ${RUNTIME_RELATIVE}/`, 'a state file holds live session cookies, and that folder is the one the project keeps out of git');
  }
  if (trackedByGit(project, file)) {
    return refuse('state_path_not_ignored', `git would track ${RUNTIME_RELATIVE}/ in this project`, `add ${RUNTIME_RELATIVE}/ to .gitignore, or run aioson update, which adds it`);
  }
  return { file };
}

/**
 * `{ load, save }` absolute paths, or `{ refusal }`. Refused under `--cdp`, the
 * environment's or the project config's included: that session is the operator's.
 */
function resolveStateFiles({ targetDir, state, saveState, cdp, channel, env, config }) {
  const wantsState = state !== undefined && state !== null && state !== '';
  const wantsSave = saveState !== undefined && saveState !== null && saveState !== '';
  if (!wantsState && !wantsSave) return { load: null, save: null };
  if (resolveBrowserRequest({ cdp, channel, env, config }).cdp) {
    return {
      refusal: {
        ok: false,
        error: 'state_with_cdp',
        detail: `${wantsState ? '--state' : '--save-state'} cannot be used with --cdp`,
        hint: 'an attached browser keeps the operator\'s own session, which is never read or replaced. Drop --cdp, or drop the state flags'
      }
    };
  }
  let load = null;
  let save = null;
  if (wantsState) {
    const resolved = stateFile(targetDir, state, '--state');
    if (resolved.refusal) return resolved;
    load = resolved.file;
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(load, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') {
        return { refusal: { ok: false, error: 'state_not_found', detail: `no state file at ${path.relative(targetDir, load).split(path.sep).join('/')}`, hint: 'run the login walkthrough with --save-state first' } };
      }
      return { refusal: { ok: false, error: 'state_invalid', detail: 'the state file is not valid JSON', hint: 'run the login walkthrough with --save-state again' } };
    }
    if (!parsed || !Array.isArray(parsed.cookies) || !Array.isArray(parsed.origins)) {
      return { refusal: { ok: false, error: 'state_invalid', detail: 'the state file has no cookies and origins', hint: 'run the login walkthrough with --save-state again' } };
    }
  }
  if (wantsSave) {
    const resolved = stateFile(targetDir, saveState, '--save-state');
    if (resolved.refusal) return resolved;
    save = resolved.file;
  }
  return { load, save };
}

/** Readable by this user alone where the platform honors the mode. */
async function saveSessionState(session, file) {
  const state = await session.context.storageState();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
}

module.exports = { resolveStateFiles, saveSessionState, valueEnvRefusal };
