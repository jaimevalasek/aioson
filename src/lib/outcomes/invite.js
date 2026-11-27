'use strict';

/**
 * Opening the feedback screen at the end of a delivery without holding the
 * caller: `feature:close` (usually run by an agent's shell tool) returns at
 * once; a detached `aioson outcome:feedback --serve` process serves the page,
 * opens the browser, and exits when the person answers, skips, or after the
 * timeout. decideInvitation (feedback.js) is the only gate; this module only
 * launches.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { readPrefs, writePrefs, decideInvitation, markInvited } = require('./feedback');
const { readRecord } = require('./ledger');

const LOCK_FILE = 'outcomes.invite.lock';
const LOCK_STALE_MS = 60 * 1000;

/**
 * Two chats closing at the same moment are one invitation: the slot is an
 * exclusively created lock file under ~/.aioson. Returns a release function,
 * or null when another invitation holds the slot (a lock older than
 * LOCK_STALE_MS is a crashed holder and is taken over).
 */
function claimInviteSlot(home = os.homedir()) {
  const dir = path.join(home, '.aioson');
  fs.mkdirSync(dir, { recursive: true });
  const lock = path.join(dir, LOCK_FILE);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      fs.closeSync(fs.openSync(lock, 'wx'));
      return () => { try { fs.unlinkSync(lock); } catch { /* already gone */ } };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let age;
      try { age = Date.now() - fs.statSync(lock).mtimeMs; } catch { continue; }
      if (age < LOCK_STALE_MS) return null;
      try { fs.unlinkSync(lock); } catch { /* another process took it over */ }
    }
  }
  return null;
}

function serveArgs(targetDir, slug) {
  return ['outcome:feedback', targetDir, `--feature=${slug}`, '--serve'];
}

/** Spawns the screen process detached; resolves { pid } once it started. */
function launchDetachedScreen({ targetDir, slug, env = process.env, spawnImpl = spawn }) {
  const logDir = path.join(targetDir, '.aioson', 'runtime', 'outcome-feedback');
  fs.mkdirSync(logDir, { recursive: true });
  const log = fs.openSync(path.join(logDir, `${slug}.log`), 'w');
  const cli = path.resolve(__dirname, '../../../bin/aioson.js');
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawnImpl(process.execPath, [cli, ...serveArgs(targetDir, slug)], { cwd: targetDir, env, detached: true, windowsHide: true, stdio: ['ignore', log, log] });
    } catch (error) { reject(error); return; } finally { fs.closeSync(log); }
    child.once('error', reject);
    child.once('spawn', () => { child.unref(); resolve({ pid: child.pid }); });
  });
}

/**
 * maybeInviteAfterClose({ targetDir, slug, options, env, home, now, launch })
 * → { invited, reason, until? }. Never throws: a screen that cannot open is
 * a reason, never a failed close.
 */
async function maybeInviteAfterClose({ targetDir, slug, options = {}, env = process.env, home, now = Date.now(), launch = launchDetachedScreen }) {
  if (options['no-feedback'] === true || options.feedback === false) return { invited: false, reason: 'flag' };
  const refused = (decision) => ({ invited: false, reason: decision.reason, ...(decision.until ? { until: decision.until } : {}) });
  let release = null;
  let before = null;
  try {
    const record = readRecord(targetDir, slug);
    const first = decideInvitation({ prefs: readPrefs(home), record, now, env, targetDir, home });
    if (!first.invite) return refused(first);
    release = claimInviteSlot(home);
    if (!release) return { invited: false, reason: 'recent' };
    // Decided again inside the slot: the other chat may have just invited.
    before = readPrefs(home);
    const second = decideInvitation({ prefs: before, record, now, env, targetDir, home });
    if (!second.invite) return refused(second);
    markInvited(home, now);
    await launch({ targetDir, slug, env });
    return { invited: true, reason: 'due' };
  } catch (error) {
    if (before) { try { writePrefs(before, home); } catch { /* best effort */ } }
    return { invited: false, reason: 'launch_failed', error: String((error && error.message) || error).slice(0, 200) };
  } finally {
    if (release) release();
  }
}

module.exports = { maybeInviteAfterClose, launchDetachedScreen, claimInviteSlot, serveArgs };
