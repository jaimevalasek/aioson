'use strict';

/**
 * The two points where a delivery's close touches the outcome records:
 *
 *   captureAtClose   right after the close gates, before the workflow state,
 *                    the features.md row and the feature folder change —
 *                    the practices and results are read while they exist.
 *   finishAtClose    at the end of the close: the report is regenerated and,
 *                    for an accepted delivery, the review screen may open
 *                    (feedback.js decides; invite.js launches it detached).
 *
 * Both are best-effort and return a line for the close summary; neither can
 * fail a close.
 */

const path = require('node:path');
const { recordOutcome, refreshReport } = require('./record');
const { maybeInviteAfterClose } = require('./invite');

function rel(targetDir, file) {
  return path.relative(targetDir, file).replace(/\\/g, '/');
}

async function captureAtClose({ targetDir, slug, kind = 'feature', verdict, integrity = null, forceBypass = null }) {
  const result = await recordOutcome(targetDir, slug, { kind, verdict, integrity, forceBypass });
  if (!result.ok) return { ok: false, line: `outcome: not recorded (${result.reason}: ${result.error})` };
  return {
    ok: true,
    file: rel(targetDir, result.file),
    detected: result.detected,
    line: `outcome: ${rel(targetDir, result.file)} — ${result.detected} practice(s) detected, measured without a model`
  };
}

const REASON_LINES = {
  due: 'feedback: review screen opened in the browser (once a day at most; skip, snooze or turn off there)',
  snoozed: 'feedback: not asked — snoozed until {until}',
  off: 'feedback: not asked — turned off (aioson outcome:feedback --on turns it back on)',
  recent: 'feedback: not asked — already asked today; review it any time with aioson outcome:feedback',
  answered: 'feedback: already answered for this delivery',
  skipped: 'feedback: skipped for this delivery'
};

async function finishAtClose({ targetDir, slug, accepted, options = {} }) {
  try { refreshReport(targetDir); } catch { /* the report is a view */ }
  if (!accepted) return { invited: false, reason: 'not_accepted', line: null };
  const invitation = await maybeInviteAfterClose({ targetDir, slug, options });
  const template = invitation.invited ? REASON_LINES.due : REASON_LINES[invitation.reason];
  const line = template ? template.replace('{until}', String(invitation.until || '').slice(0, 10)) : null;
  return { ...invitation, line };
}

module.exports = { captureAtClose, finishAtClose };
