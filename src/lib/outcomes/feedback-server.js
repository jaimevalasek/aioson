'use strict';

/**
 * The feedback screen: a local page where the person rates a delivery, says
 * what was good and what was bad, or skips/snoozes the question.
 *
 * It is served by the CLI on 127.0.0.1 only, behind a per-run token in the
 * path, and refuses other Host headers (DNS rebinding) and cross-site
 * requests — the same perimeter as the execution dashboard. It lives until
 * the person answers or skips, or until the timeout; then it closes itself.
 * Nothing here talks to the network beyond the loopback socket.
 */

const http = require('node:http');
const crypto = require('node:crypto');
const { renderFeedbackPage } = require('./feedback-page');
const { scrubComment } = require('./scrub');

const MAX_BODY = 8192;
const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000;
const CSP = "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

function send(res, status, body, type = 'application/json; charset=utf-8') {
  const payload = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, {
    'content-type': type,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    ...(type.startsWith('text/html') ? { 'content-security-policy': CSP } : {})
  });
  res.end(payload);
}

function readJson(req) {
  return new Promise((resolve) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) { resolve({ error: 'too_large' }); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try { resolve({ data: JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') }); } catch { resolve({ error: 'invalid_json' }); }
    });
    req.on('error', () => resolve({ error: 'read_failed' }));
  });
}

/** Loopback Host header and same-site request, or false. */
function trustedRequest(req, port) {
  return [`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host) && req.headers['sec-fetch-site'] !== 'cross-site';
}

async function handleAction(ctx, route, data, res) {
  if (route === '/preview') {
    send(res, 200, { good: scrubComment(data.good, { names: ctx.names }), bad: scrubComment(data.bad, { names: ctx.names }) });
    return;
  }
  if (ctx.finished) { send(res, 409, { error: 'already_answered' }); return; }
  if (route !== '/answer' && route !== '/skip') { send(res, 404, { error: 'not_found' }); return; }
  const answering = route === '/answer';
  const choice = String(data.choice || '');
  const result = answering
    ? await ctx.onAnswer({ rating: data.rating, good: data.good, bad: data.bad })
    : await ctx.onSkip(choice);
  if (!result || !result.ok) { send(res, 400, { error: (result && result.reason) || 'refused' }); return; }
  ctx.finished = true;
  send(res, 200, answering ? { ok: true, feedback: result.feedback } : { ok: true, choice });
  ctx.finish(answering ? { action: 'answered', feedback: result.feedback } : { action: 'skipped', choice });
}

async function handleRequest(ctx, req, res) {
  const port = ctx.server.address() && ctx.server.address().port;
  if (!trustedRequest(req, port)) { send(res, 403, { error: 'forbidden' }); return; }
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  if (!url.pathname.startsWith(ctx.base)) { send(res, 404, { error: 'not_found' }); return; }
  const route = url.pathname.slice(ctx.base.length) || '/';
  if (req.method === 'GET' && route === '/') {
    send(res, 200, renderFeedbackPage({ ...ctx.view, apiBase: ctx.base }), 'text/html; charset=utf-8');
    return;
  }
  if (req.method !== 'POST') { send(res, 405, { error: 'method_not_allowed' }); return; }
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) { send(res, 415, { error: 'json_only' }); return; }
  const body = await readJson(req);
  if (body.error) { send(res, 400, { error: body.error }); return; }
  await handleAction(ctx, route, body.data || {}, res);
}

function closeServer(server, after) {
  server.close(after);
  if (server.closeAllConnections) server.closeAllConnections();
}

/**
 * createFeedbackServer({ view, names, onAnswer, onSkip, timeoutMs, port })
 *   view      what the page shows (feature, kind, locale, measured summary)
 *   names     project names the live preview scrubs
 *   onAnswer  ({ rating, good, bad }) → { ok, feedback?, reason? }
 *   onSkip    (choice) → { ok, reason? }
 * Returns { start() → { url, port, token }, stop(), done: Promise<outcome> }.
 */
function createFeedbackServer({ view, names = [], onAnswer, onSkip, timeoutMs = DEFAULT_TIMEOUT_MS, port = 0 }) {
  let settle;
  const done = new Promise((resolve) => { settle = resolve; });
  let timer = null;
  const ctx = { view, names, onAnswer, onSkip, base: `/f/${crypto.randomBytes(18).toString('base64url')}`, finished: false };
  ctx.server = http.createServer((req, res) => {
    handleRequest(ctx, req, res).catch(() => { if (!res.headersSent) send(res, 500, { error: 'internal' }); });
  });
  // Let the answer's response flush before the socket goes away.
  ctx.finish = (outcome) => {
    clearTimeout(timer);
    const delay = setTimeout(() => closeServer(ctx.server, () => settle(outcome)), 150);
    if (delay.unref) delay.unref();
  };
  const start = () => new Promise((resolve, reject) => {
    ctx.server.once('error', reject);
    ctx.server.listen(port, '127.0.0.1', () => {
      ctx.server.removeListener('error', reject);
      const bound = ctx.server.address().port;
      timer = setTimeout(() => {
        if (ctx.finished) return;
        ctx.finished = true;
        closeServer(ctx.server, () => settle({ action: 'timeout' }));
      }, timeoutMs);
      resolve({ url: `http://127.0.0.1:${bound}${ctx.base}/`, port: bound, token: ctx.base.slice(3) });
    });
  });
  const stop = () => new Promise((resolve) => {
    clearTimeout(timer);
    ctx.finished = true;
    closeServer(ctx.server, () => { settle({ action: 'stopped' }); resolve(); });
  });
  return { server: ctx.server, done, start, stop };
}

module.exports = { createFeedbackServer, DEFAULT_TIMEOUT_MS };
