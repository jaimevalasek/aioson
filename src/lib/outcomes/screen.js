'use strict';

/**
 * Runs the feedback screen for one delivery in the foreground: start the
 * loopback server, open the browser, wait for the answer, the skip or the
 * timeout. `outcome:feedback` calls it directly; the close of a delivery
 * calls it through a detached process (invite.js) so the close never waits.
 */

const { spawn } = require('node:child_process');
const { createFeedbackServer } = require('./feedback-server');
const { saveFeedback, applyChoice, CHOICES } = require('./feedback');
const { readRecord } = require('./ledger');
const { describeRecord } = require('./describe');
const { projectNames, projectLocale, refreshReport, aiosonVersion } = require('./record');

/** Opens an http(s) URL in the default browser; resolves false when it cannot. */
function openInBrowser(url, { spawnImpl = spawn, platform = process.platform } = {}) {
  return new Promise((resolve) => {
    let parsed;
    try { parsed = new URL(url); } catch { resolve(false); return; }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') { resolve(false); return; }
    const target = parsed.toString();
    const command = platform === 'darwin' ? 'open' : platform === 'win32' ? 'cmd' : 'xdg-open';
    const args = platform === 'win32' ? ['/c', 'start', '', target] : [target];
    try {
      const child = spawnImpl(command, args, { stdio: 'ignore', detached: true, windowsHide: true });
      child.once('error', () => resolve(false));
      child.once('spawn', () => { child.unref(); resolve(true); });
    } catch {
      resolve(false);
    }
  });
}

/**
 * openFeedbackScreen({ targetDir, slug, open, logger, timeoutMs, opener })
 * → { action: answered|skipped|timeout, url, opened, choice?, feedback? }
 */
async function openFeedbackScreen({ targetDir, slug, open = true, logger = null, timeoutMs, opener = openInBrowser }) {
  const record = readRecord(targetDir, slug);
  const locale = projectLocale(targetDir);
  const names = projectNames(targetDir);
  const view = { locale, feature: slug, kind: record ? record.kind : 'feature', ...describeRecord(record, locale) };
  const screen = createFeedbackServer({
    view,
    names: [...names, slug],
    timeoutMs,
    onAnswer: ({ rating, good, bad }) => {
      const saved = saveFeedback({ targetDir, slug, rating, good, bad, names, aiosonVersion: aiosonVersion() });
      if (saved.ok) refreshReport(targetDir, { locale });
      return saved;
    },
    onSkip: (choice) => {
      if (!CHOICES.includes(choice)) return { ok: false, reason: 'unknown_choice' };
      applyChoice({ choice, targetDir, slug });
      return { ok: true };
    }
  });
  const { url } = await screen.start();
  const opened = open ? await opener(url) : false;
  if (logger) logger.log(opened ? `outcome:feedback — review screen open: ${url}` : `outcome:feedback — open this address to review the delivery: ${url}`);
  const outcome = await screen.done;
  if (logger) logger.log(`outcome:feedback — ${outcome.action}${outcome.choice ? ` (${outcome.choice})` : ''}`);
  return { ...outcome, url, opened };
}

module.exports = { openFeedbackScreen, openInBrowser };
