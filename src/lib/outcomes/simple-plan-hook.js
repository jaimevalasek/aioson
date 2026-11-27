'use strict';

/**
 * A Simple Plan has no close command: @dev sets `status: done` in the plan's
 * frontmatter and ends its session with `agent:done`. That call is the close
 * of a simple plan for the outcome records: every finished plan without a
 * record gets one (kind simple-plan, verdict DONE), and the review screen may
 * open for the most recent of them (feedback.js decides; once a day at most).
 */

const fs = require('node:fs');
const path = require('node:path');
const { readRecord } = require('./ledger');
const { SLUG } = require('./schema');
const { captureAtClose, finishAtClose } = require('./close-hook');

const DAY_MS = 24 * 60 * 60 * 1000;
// Only a plan finished in this window is a delivery that just closed; older
// finished plans (an update into a project with history) are never recorded
// or asked about late.
const RECENT_MS = 2 * DAY_MS;

const DATE_FIELDS = ['completed_at', 'done_at', 'closed_at', 'updated_at'];

/**
 * When the plan says it finished: its own date fields first (a clone, a
 * checkout or a branch switch rewrites every file's time), the file time
 * only for a plan that records none.
 */
function finishedAt(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { return null; }
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  for (const field of DATE_FIELDS) {
    const m = block && new RegExp(`^${field}:\\s*["']?(\\d{4}-\\d{2}-\\d{2}(?:[T ][\\d:.]+Z?)?)`, 'm').exec(block[1]);
    const at = m ? Date.parse(m[1].length === 10 ? `${m[1]}T23:59:59Z` : m[1]) : NaN;
    if (Number.isFinite(at)) return at;
  }
  try { return fs.statSync(file).mtimeMs; } catch { return null; }
}

function touchedRecently(ctxDir, slug, now) {
  const at = finishedAt(path.join(ctxDir, 'simple-plans', `${slug}.md`));
  return at !== null && now - at <= RECENT_MS;
}

async function finishedPlansWithoutRecord(targetDir, now = Date.now()) {
  const { listFinishedSimplePlans, GRACE_DAYS } = require('../simple-plan-archive');
  const ctxDir = path.join(targetDir, '.aioson', 'context');
  // The archive waits GRACE_DAYS before moving a plan; the record must not:
  // asking the list as of GRACE_DAYS from now returns every finished plan.
  const finished = await listFinishedSimplePlans(ctxDir, { now: now + (GRACE_DAYS + 1) * DAY_MS });
  return finished
    .filter((p) => SLUG.test(p.slug) && /^done\b/i.test(p.status) && touchedRecently(ctxDir, p.slug, now))
    .map((p) => p.slug)
    .filter((slug) => !readRecord(targetDir, slug));
}

/** → { recorded: string[], feedback, lines: string[] }; never throws. */
async function closeFinishedSimplePlans(targetDir, { options = {} } = {}) {
  const lines = [];
  const recorded = [];
  try {
    for (const slug of await finishedPlansWithoutRecord(targetDir)) {
      const capture = await captureAtClose({ targetDir, slug, kind: 'simple-plan', verdict: 'DONE' });
      lines.push(capture.line);
      if (capture.ok) recorded.push(slug);
    }
    if (recorded.length === 0) return { recorded, feedback: null, lines };
    const feedback = await finishAtClose({ targetDir, slug: recorded[recorded.length - 1], accepted: true, options });
    if (feedback.line) lines.push(feedback.line);
    return { recorded, feedback: { invited: feedback.invited, reason: feedback.reason }, lines };
  } catch (error) {
    lines.push(`outcome: simple-plan record skipped (${(error && error.message) || error})`);
    return { recorded, feedback: null, lines };
  }
}

module.exports = { closeFinishedSimplePlans };
