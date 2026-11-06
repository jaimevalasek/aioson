'use strict';

/**
 * What the runner does around a contained run: which hosts its pages asked for, what
 * fails a step, and what the report says it touched. The proxy is `refusal-proxy.js`.
 */

const { hostOf } = require('./session-state');
const { isLoopbackUrl } = require('./scenario');

// The proxy also refuses the browser's own traffic (updates, sign-in, autofill), and
// no step should be blamed on that. What a page asked for is what a step can cite.
function watchPageHosts(session, page) {
  const watched = { asked: new Set(), lastNavigation: '', reported: '' };
  const onSocket = (socket) => watched.asked.add(hostOf(socket.url()));
  const watchPage = (opened) => { if (typeof opened.on === 'function') opened.on('websocket', onSocket); };
  // A new tab's first request has no frame yet, and Playwright throws on asking.
  const isMainNavigation = (request) => {
    try { return request.isNavigationRequest() && request.frame() === page.mainFrame(); } catch { return false; }
  };
  const onRequest = (request) => {
    watched.asked.add(hostOf(request.url()));
    if (isMainNavigation(request)) watched.lastNavigation = request.url();
  };
  watchPage(page);
  if (session.context && typeof session.context.on === 'function') {
    session.context.on('request', onRequest);
    session.context.on('page', watchPage);
  }
  return watched;
}

// A refused tunnel leaves the page on chrome-error, with no address of its own.
function offMachineHost(page, watched) {
  let url = '';
  try { url = page.url(); } catch { /* the page is gone */ }
  if (/^chrome-error:/i.test(url)) url = watched.lastNavigation;
  return /^https?:/i.test(url) && !isLoopbackUrl(url) ? hostOf(url) : '';
}

// A main frame off this machine is on a page the proxy refused, so the step that left
// it there fails, once, naming the host. A new tab is not the page under test.
function containedStepFailure(record, page, refusalProxy, watched) {
  const host = offMachineHost(page, watched);
  const justLeft = host && host !== watched.reported;
  watched.reported = host;
  if (justLeft) {
    const refusal = `the browser could not reach ${host}: the pages of this run only reach loopback, and the request was refused before it left the machine`;
    return { ok: false, error: record.error ? `${refusal} (${record.error})` : refusal };
  }
  const refused = refusalProxy.hosts().filter((name) => watched.asked.has(name));
  if (!record.ok && refused.length > 0) return { error: `${record.error || record.detail} (the pages of this run were refused ${refused.join(', ')}: they only reach loopback)` };
  return null;
}

// What this run touched outside what its pages reached. `blocked_hosts` is all the
// proxy refused, `request_hosts` is what left through the runner, off this machine.
function hostsOutsideTheRun(refusalProxy, watched, records) {
  const refused = refusalProxy ? refusalProxy.hosts() : [];
  const requested = records.filter((record) => record.request).map((record) => record.request.url);
  return {
    blocked_hosts: refused,
    blocked_hosts_from_pages: refused.filter((name) => watched && watched.asked.has(name)),
    request_hosts: [...new Set(requested.filter((url) => !isLoopbackUrl(url)).map(hostOf))]
  };
}

// A browser that never opened must not leave the proxy holding the process.
async function openOrClose(open, options, refusalProxy) {
  let session = null;
  try {
    session = await open(options);
    return session;
  } finally {
    if (refusalProxy && !(session && session.ok)) await refusalProxy.close();
  }
}

module.exports = { containedStepFailure, hostsOutsideTheRun, openOrClose, watchPageHosts };
