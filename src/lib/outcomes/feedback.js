'use strict';

/**
 * When aioson may ask the person how a delivery went, and what their answer
 * changes. The rule the owner set: ask at the end of a feature or simple
 * plan, never at every turn, and let the person skip, snooze up to a month,
 * or stop being asked.
 *
 * Preferences are the person's, not the project's: `~/.aioson/outcomes.json`.
 *
 *   state            on | off            off = "não perguntar mais"
 *   snooze_until     ISO | null          "lembrar em 1 semana / 1 mês"
 *   last_invited_at  ISO | null          at most one invitation per MIN_GAP
 *
 * Whether to invite is decided here, from facts only; the screen, the CLI and
 * a future desktop client all read the same answer. No invitation ever comes
 * from a test run, a CI job, a headless machine, a project in a temporary
 * folder, or a delivery already answered or skipped.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readRecord, writeRecord, writeFileAtomic } = require('./ledger');
const { scrubComment } = require('./scrub');
const { CHOICES } = require('./schema');

const PREFS_FILE = 'outcomes.json';
const PREFS_SCHEMA = 1;
// Several closes in one working day are one invitation.
const MIN_GAP_MS = 20 * 60 * 60 * 1000;
const SNOOZE_MS = { week: 7 * 24 * 60 * 60 * 1000, month: 30 * 24 * 60 * 60 * 1000 };

function prefsPath(home = os.homedir()) {
  return path.join(home, '.aioson', PREFS_FILE);
}

function emptyPrefs() {
  return { schema: PREFS_SCHEMA, feedback: { state: 'on', snooze_until: null, last_invited_at: null, updated_at: null } };
}

function readPrefs(home = os.homedir()) {
  try {
    const data = JSON.parse(fs.readFileSync(prefsPath(home), 'utf8'));
    const fb = data && data.feedback && typeof data.feedback === 'object' ? data.feedback : {};
    return {
      schema: PREFS_SCHEMA,
      feedback: {
        state: fb.state === 'off' ? 'off' : 'on',
        snooze_until: typeof fb.snooze_until === 'string' ? fb.snooze_until : null,
        last_invited_at: typeof fb.last_invited_at === 'string' ? fb.last_invited_at : null,
        updated_at: typeof fb.updated_at === 'string' ? fb.updated_at : null
      }
    };
  } catch {
    return emptyPrefs();
  }
}

function writePrefs(prefs, home = os.homedir()) {
  writeFileAtomic(prefsPath(home), `${JSON.stringify(prefs, null, 2)}\n`);
  return prefs;
}

function isOff(value) {
  return ['0', 'false', 'off', 'no', 'never'].includes(String(value || '').trim().toLowerCase());
}

function realOrSelf(dir) {
  try { return fs.realpathSync(dir); } catch { return path.resolve(dir); }
}

function under(child, parent) {
  const rel = path.relative(parent, child);
  return rel === '' || (!!rel && !rel.startsWith('..') && !path.isAbsolute(rel));
}

// Build agents that do not all set CI=true.
const BUILD_AGENT_VARS = ['CI', 'CONTINUOUS_INTEGRATION', 'BUILD_NUMBER', 'TF_BUILD', 'JENKINS_URL', 'TEAMCITY_VERSION', 'CODEBUILD_BUILD_ID', 'BUILDKITE', 'GITHUB_ACTIONS', 'GITLAB_CI', 'CIRCLECI', 'TRAVIS', 'BITBUCKET_BUILD_NUMBER', 'DRONE', 'APPVEYOR', 'SEMAPHORE', 'BUDDY', 'HUDSON_URL', 'NETLIFY', 'VERCEL', 'RENDER'];

/** Why this machine must not open a screen at all, or null. */
function environmentRefusal({ env = process.env, targetDir, home = os.homedir() } = {}) {
  if (isOff(env.AIOSON_FEEDBACK)) return 'disabled_by_env';
  if (env.NODE_TEST_CONTEXT) return 'test_run';
  if (BUILD_AGENT_VARS.some((name) => env[name] && !isOff(env[name]))) return 'ci';
  if (env.WSL_DISTRO_NAME || env.WSL_INTEROP) return 'headless';
  if (env.SSH_CLIENT && !env.DISPLAY) return 'headless';
  if (process.platform === 'linux' && !env.DISPLAY && !env.WAYLAND_DISPLAY) return 'headless';
  if (targetDir) {
    const tmp = realOrSelf(os.tmpdir());
    if (under(realOrSelf(targetDir), tmp) && !under(realOrSelf(home), tmp)) return 'temporary_folder';
  }
  return null;
}

/**
 * Whether to invite the person to rate `record` now.
 * Returns { invite: boolean, reason: string, until?: ISO }.
 */
function decideInvitation({ prefs, record, now = Date.now(), env = process.env, targetDir, home = os.homedir() } = {}) {
  const refusal = environmentRefusal({ env, targetDir, home });
  if (refusal) return { invite: false, reason: refusal };
  const fb = (prefs || emptyPrefs()).feedback;
  if (fb.state === 'off') return { invite: false, reason: 'off' };
  if (!record) return { invite: false, reason: 'no_record' };
  if (record.feedback && record.feedback.answered_at) return { invite: false, reason: 'answered' };
  if (record.feedback && record.feedback.skipped_at) return { invite: false, reason: 'skipped' };
  const snooze = Date.parse(fb.snooze_until || '');
  if (Number.isFinite(snooze) && snooze > now) return { invite: false, reason: 'snoozed', until: fb.snooze_until };
  const last = Date.parse(fb.last_invited_at || '');
  if (Number.isFinite(last) && now - last < MIN_GAP_MS) return { invite: false, reason: 'recent', until: new Date(last + MIN_GAP_MS).toISOString() };
  return { invite: true, reason: 'due' };
}

function markInvited(home = os.homedir(), now = Date.now()) {
  const prefs = readPrefs(home);
  prefs.feedback.last_invited_at = new Date(now).toISOString();
  return writePrefs(prefs, home);
}

/**
 * Applies a skip choice. `later` skips this delivery only; `week`/`month`
 * snooze every invitation; `never` turns them off; `on` turns them back on.
 */
function applyChoice({ choice, targetDir, slug, home = os.homedir(), now = Date.now() }) {
  const prefs = readPrefs(home);
  const at = new Date(now).toISOString();
  if (choice === 'on') {
    prefs.feedback.state = 'on';
    prefs.feedback.snooze_until = null;
  } else if (choice === 'never') {
    prefs.feedback.state = 'off';
  } else if (choice === 'week' || choice === 'month') {
    prefs.feedback.snooze_until = new Date(now + SNOOZE_MS[choice]).toISOString();
  } else if (choice !== 'later') {
    throw new Error(`unknown choice: ${choice}`);
  }
  prefs.feedback.updated_at = at;
  writePrefs(prefs, home);
  let record = null;
  if (targetDir && slug && choice !== 'on') {
    record = readRecord(targetDir, slug);
    if (record && !(record.feedback && record.feedback.answered_at)) {
      record.feedback = { skipped_at: at, choice };
      writeRecord(targetDir, record);
    }
  }
  return { prefs, record };
}

function ratingOf(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : NaN;
}

/**
 * Saves the person's answer on the record of `slug`. Comments are scrubbed
 * BEFORE they are stored (scrub.js): what the record holds is what any
 * preview shows. Needs a rating or at least one comment.
 */
function saveFeedback({ targetDir, slug, rating, good, bad, names = [], now = Date.now(), aiosonVersion = null }) {
  const record = readRecord(targetDir, slug);
  if (!record) return { ok: false, reason: 'no_record' };
  const score = ratingOf(rating);
  if (Number.isNaN(score)) return { ok: false, reason: 'invalid_rating' };
  const scrubNames = [...names, slug];
  const goodText = scrubComment(good, { names: scrubNames });
  const badText = scrubComment(bad, { names: scrubNames });
  if (score === null && !goodText && !badText) return { ok: false, reason: 'empty_feedback' };
  record.feedback = {
    rating: score,
    good: goodText,
    bad: badText,
    answered_at: new Date(now).toISOString(),
    ...(aiosonVersion ? { aioson_version: aiosonVersion } : {})
  };
  writeRecord(targetDir, record);
  return { ok: true, record, feedback: record.feedback };
}

module.exports = {
  PREFS_FILE,
  MIN_GAP_MS,
  SNOOZE_MS,
  CHOICES,
  prefsPath,
  readPrefs,
  writePrefs,
  environmentRefusal,
  decideInvitation,
  markInvited,
  applyChoice,
  saveFeedback
};
