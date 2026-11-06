'use strict';

/**
 * What a walkthrough may do with a session and a test account, checked before
 * any page opens, and the guard that holds while the pages run.
 *
 * Logging in by hand on every run cost a Dev minutes per flow, so nobody used the
 * instrument. A seeded account on a local app may log in once (`value_env`), keep
 * the session (`--save-state`) and reuse it (`--state`). Everything else stays as
 * it was: a real account goes through `--cdp`, whose session is the operator's and
 * is never read or written here, and no credential travels in its script.
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
    const parsed = new URL(url);
    return parsed.hostname || parsed.protocol;
  } catch {
    return String(url);
  }
}

function usesValueEnv(script) {
  return flatten(script && script.steps).some((step) => step.value_env !== undefined);
}

/**
 * Where a `goto` of the script would land, read before any page opens: a script
 * variable is filled in and the url is resolved against the base, so `//host` and
 * `/\host` count. What depends on the run (`{{env.X}}`, a saved value) stays out,
 * and the navigation guard answers for it.
 */
function literalDestinations(script, baseUrl) {
  const vars = (script && script.vars) || {};
  const out = [];
  for (const step of flatten(script && script.steps)) {
    if (step.do !== 'goto') continue;
    const text = String(step.url).replace(/\{\{\s*([A-Za-z_][\w-]*)\s*\}\}/g, (whole, name) => (typeof vars[name] === 'string' ? vars[name] : whole));
    if (text.includes('{{')) continue;
    try {
      out.push(new URL(text, baseUrl || undefined).href);
    } catch {
      // A relative url with no base has nowhere to go; one that names a host does.
      if (/^[/\\]{2}/.test(text)) out.push(text);
    }
  }
  return out;
}

function firstOutside(script, baseUrl) {
  return [...(baseUrl ? [baseUrl] : []), ...literalDestinations(script, baseUrl)].find((url) => !isLoopbackUrl(url));
}

/**
 * Refuses a script with `value_env` when the target or a `goto` leaves the machine,
 * and under `--cdp`, where no credential travels in the script at all. What the run
 * decides later is the guard's and the step's to refuse.
 */
function valueEnvRefusal(script, baseUrl, { cdp = '', channel = '', env = process.env, config = null } = {}) {
  if (!usesValueEnv(script)) return null;
  if (resolveBrowserRequest({ cdp, channel, env, config }).cdp) {
    return {
      ok: false,
      error: 'value_env_with_cdp',
      detail: 'value_env cannot be used with --cdp',
      hint: 'an attached browser is the operator\'s signed-in session, and no credential travels in its script. Drop --cdp for a seeded account on a local app, or drop value_env'
    };
  }
  const outside = firstOutside(script, baseUrl);
  if (!outside) return null;
  return {
    ok: false,
    error: 'value_env_requires_loopback',
    detail: `value_env only runs against a loopback target, and this one reaches ${hostOf(outside)}`,
    hint: 'value_env is for an account seeded on a local app. Attach to the operator\'s signed-in browser with --cdp for anything else, with no credential in the script'
  };
}

/** A saved session is a seeded account's on a local app: a real one goes through `--cdp`. */
function stateTargetRefusal(script, baseUrl, stateFiles) {
  if (!stateFiles.load && !stateFiles.save) return null;
  const outside = firstOutside(script, baseUrl);
  if (!outside) return null;
  return {
    ok: false,
    error: 'session_state_requires_loopback',
    detail: `--state and --save-state only run against a loopback target, and this one reaches ${hostOf(outside)}`,
    hint: 'a live session of another host does not belong on disk. Attach to the operator\'s signed-in browser with --cdp instead'
  };
}

function isInside(root, target) {
  const rel = path.relative(root, target);
  return rel !== '' && !rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel);
}

// Every component below the project, the file included and whether or not what it
// points at exists: a dangling link would carry the write out of the folder.
function crossesALink(project, file) {
  let current = project;
  for (const part of path.relative(project, file).split(path.sep)) {
    current = path.join(current, part);
    let stat;
    try {
      stat = fs.lstatSync(current);
    } catch (error) {
      if (error.code === 'ENOENT') return false;
      return true;
    }
    if (stat.isSymbolicLink()) return true;
  }
  return false;
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
  if (!isInside(runtimeRoot, file) || crossesALink(project, file)) {
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

/**
 * Written beside the target and renamed over it, so a link planted after the path
 * check is replaced instead of followed, and an older file with wider permissions
 * does not keep them. Readable by this user alone where the platform honors the mode.
 */
async function saveSessionState(session, file) {
  const state = await session.context.storageState();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(state, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  fs.renameSync(temp, file);
}

function isMainFrameNavigation(request) {
  if (!request.isNavigationRequest()) return false;
  try {
    return request.frame().parentFrame() === null;
  } catch {
    // A popup's first navigation has no frame yet, and it is a main frame.
    return true;
  }
}

/**
 * Holds the main frame of every page on this machine while a run handles a test
 * credential or keeps a session. The check of an address is not enough on its own:
 * a page can navigate between the check and the keystroke, and a local app that
 * redirects to an external sign-in after `load` is an ordinary shape.
 *
 * `route` aborts what it sees. A server redirect is not routed past its first url,
 * so `watch` catches a main frame that landed elsewhere anyway; the step that needs
 * the page refuses. Subresources are left alone: a page's own requests are its code.
 */
async function installNavigationGuard(session) {
  const guard = {
    blocked: null,
    reported: false,
    waiters: [],
    trip(url) {
      if (!guard.blocked) guard.blocked = hostOf(url);
      for (const resolve of guard.waiters.splice(0)) resolve();
    },
    whenBlocked() {
      return guard.blocked ? Promise.resolve() : new Promise((resolve) => { guard.waiters.push(resolve); });
    },
    watch(page) {
      if (typeof page.on !== 'function') return;
      page.on('framenavigated', (frame) => {
        if (typeof page.mainFrame === 'function' && frame !== page.mainFrame()) return;
        const url = String(frame.url());
        if (/^https?:/i.test(url) && !isLoopbackUrl(url)) guard.trip(url);
      });
    }
  };
  const context = session.context;
  if (context && typeof context.route === 'function') {
    await context.route((url) => !isLoopbackUrl(url.href), async (route) => {
      const request = route.request();
      if (!isMainFrameNavigation(request)) return route.fallback();
      guard.trip(request.url());
      return route.abort('blockedbyclient');
    });
  }
  return guard;
}

module.exports = {
  installNavigationGuard,
  resolveStateFiles,
  saveSessionState,
  stateTargetRefusal,
  usesValueEnv,
  valueEnvRefusal,
  hostOf
};
