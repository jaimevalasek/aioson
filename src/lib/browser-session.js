'use strict';

/**
 * One browser resolver for every real-browser surface (walkthroughs, qa:run,
 * qa:scan, qa:doctor).
 *
 * Three ways to reach a browser, in this order of explicitness:
 *
 *   1. `cdp`     — attach to a browser the operator already runs, through its
 *                  Chrome DevTools Protocol endpoint (Chrome/Edge/Brave started
 *                  with `--remote-debugging-port`, an Electron app, a WebView2
 *                  shell exposing a port). The operator's real session — their
 *                  profile, extensions, signed-in state — stays theirs: we open
 *                  pages in the existing default context and, on close, only
 *                  disconnect. Never launches, never closes their browser.
 *   2. `channel` — launch the branded browser installed on the machine
 *                  (`chrome`, `msedge`) through Playwright's channel support.
 *                  No download: the Google Chrome the user already has.
 *   3. `bundled` — Playwright's own pinned Chromium (`npx playwright install
 *                  chromium`). Most reproducible when present.
 *
 * Without an explicit choice the resolver prefers the pinned bundle when its
 * binary exists, then an installed Chrome, then Edge — so a machine with Google
 * Chrome and no bundle still gets a real browser instead of a hard failure.
 *
 * Everything here is injectable (`playwright`, `env`, `fetchJson`, `exists`) so
 * the resolution order is tested without a browser on the box.
 */

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const { loadPlaywright } = require('./playwright-loader');
const { containmentArgs, containmentFailure } = require('./browser-walkthrough/refusal-proxy');

const CDP_ENV = 'AIOSON_BROWSER_CDP';
const CHANNEL_ENV = 'AIOSON_BROWSER_CHANNEL';
const KNOWN_CHANNELS = ['chrome', 'msedge', 'chromium'];
const DEFAULT_CDP_PORT = 9222;

// Well-known install locations per platform. Detection only — launching goes
// through Playwright's channel support, which has its own resolution.
function channelCandidates(channel, env = process.env, platform = process.platform) {
  const programFiles = env.PROGRAMFILES || 'C:\\Program Files';
  const programFilesX86 = env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
  const localAppData = env.LOCALAPPDATA || '';
  if (channel === 'chrome') {
    if (platform === 'win32') {
      return [
        path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        localAppData ? path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe') : ''
      ].filter(Boolean);
    }
    if (platform === 'darwin') {
      return ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
    }
    return ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/opt/google/chrome/chrome', '/snap/bin/chromium'];
  }
  if (channel === 'msedge') {
    if (platform === 'win32') {
      return [
        path.join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        path.join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
      ];
    }
    if (platform === 'darwin') {
      return ['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'];
    }
    return ['/usr/bin/microsoft-edge', '/usr/bin/microsoft-edge-stable', '/opt/microsoft/msedge/msedge'];
  }
  return [];
}

function detectChannelBinary(channel, { env = process.env, platform = process.platform, exists = fs.existsSync } = {}) {
  for (const candidate of channelCandidates(channel, env, platform)) {
    try {
      if (exists(candidate)) return candidate;
    } catch { /* keep probing */ }
  }
  return null;
}

function bundledBinary(playwright, { exists = fs.existsSync } = {}) {
  if (!playwright || !playwright.chromium || typeof playwright.chromium.executablePath !== 'function') return null;
  try {
    const binary = playwright.chromium.executablePath();
    return binary && exists(binary) ? binary : null;
  } catch {
    return null;
  }
}

/**
 * `9222`, `localhost:9222`, `http://127.0.0.1:9222`, `ws://…/devtools/browser/…`
 * all name an endpoint. Playwright accepts the http(s) origin and the ws URL.
 */
function normalizeCdpEndpoint(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^\d{2,5}$/.test(raw)) return `http://127.0.0.1:${raw}`;
  if (/^(?:https?|wss?):\/\//i.test(raw)) return raw.replace(/\/+$/, '');
  if (/^[\w.-]+:\d{2,5}$/.test(raw)) return `http://${raw}`;
  return raw;
}

function cdpVersionUrl(endpoint) {
  if (/^wss?:\/\//i.test(endpoint)) return '';
  return `${endpoint.replace(/\/+$/, '')}/json/version`;
}

function defaultFetchJson(url, timeoutMs = 2500) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => { if (!settled) { settled = true; resolve(value); } };
    try {
      const req = http.get(url, { timeout: timeoutMs }, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { body += chunk; if (body.length > 65536) res.destroy(); });
        res.on('end', () => {
          try { finish(JSON.parse(body)); } catch { finish(null); }
        });
        res.on('error', () => finish(null));
      });
      req.on('error', () => finish(null));
      req.on('timeout', () => { req.destroy(); finish(null); });
    } catch {
      finish(null);
    }
  });
}

/**
 * Reachability of a CDP endpoint without Playwright: `GET /json/version`.
 * Returns `{ reachable, browser, webSocketDebuggerUrl }`.
 */
async function probeCdp(endpoint, { fetchJson = defaultFetchJson } = {}) {
  const normalized = normalizeCdpEndpoint(endpoint);
  if (!normalized) return { endpoint: '', reachable: false, browser: '', webSocketDebuggerUrl: '' };
  const url = cdpVersionUrl(normalized);
  if (!url) return { endpoint: normalized, reachable: true, browser: '', webSocketDebuggerUrl: normalized, assumed: true };
  const info = await fetchJson(url);
  return {
    endpoint: normalized,
    reachable: Boolean(info && typeof info === 'object'),
    browser: info && info.Browser ? String(info.Browser) : '',
    webSocketDebuggerUrl: info && info.webSocketDebuggerUrl ? String(info.webSocketDebuggerUrl) : ''
  };
}

function readBrowserConfig(config) {
  const browser = config && typeof config === 'object' && config.browser && typeof config.browser === 'object'
    ? config.browser
    : {};
  return {
    cdp: typeof browser.cdp === 'string' ? browser.cdp : '',
    channel: typeof browser.channel === 'string' ? browser.channel.toLowerCase() : ''
  };
}

/**
 * What the operator asked for, by precedence: explicit option → environment →
 * project config. `channel: 'chromium'` names the bundled engine explicitly.
 */
function resolveBrowserRequest({ cdp = '', channel = '', env = process.env, config = null } = {}) {
  const fromConfig = readBrowserConfig(config);
  const cdpEndpoint = normalizeCdpEndpoint(cdp || env[CDP_ENV] || fromConfig.cdp);
  const requestedChannel = String(channel || env[CHANNEL_ENV] || fromConfig.channel || '').toLowerCase();
  return {
    cdp: cdpEndpoint,
    channel: KNOWN_CHANNELS.includes(requestedChannel) ? requestedChannel : '',
    invalidChannel: requestedChannel && !KNOWN_CHANNELS.includes(requestedChannel) ? requestedChannel : ''
  };
}

/**
 * Every way this machine can reach a browser, as the doctor reports it.
 */
async function probeBrowsers({ projectDir = null, playwright = undefined, env = process.env, config = null, cdp = '', channel = '', exists = fs.existsSync, fetchJson = defaultFetchJson, platform = process.platform } = {}) {
  const pw = playwright === undefined ? loadPlaywright([projectDir]) : playwright;
  const request = resolveBrowserRequest({ cdp, channel, env, config });
  const cdpProbe = request.cdp ? await probeCdp(request.cdp, { fetchJson }) : { endpoint: '', reachable: false, browser: '', webSocketDebuggerUrl: '' };
  const modes = {
    cdp: { requested: Boolean(request.cdp), endpoint: cdpProbe.endpoint, available: cdpProbe.reachable, browser: cdpProbe.browser },
    chrome: { available: Boolean(detectChannelBinary('chrome', { env, platform, exists })), binary: detectChannelBinary('chrome', { env, platform, exists }) },
    msedge: { available: Boolean(detectChannelBinary('msedge', { env, platform, exists })), binary: detectChannelBinary('msedge', { env, platform, exists }) },
    bundled: { available: Boolean(pw) && Boolean(bundledBinary(pw, { exists })), binary: pw ? bundledBinary(pw, { exists }) : null }
  };
  const preferred = pickMode(request, modes);
  return {
    playwright: Boolean(pw),
    request,
    modes,
    preferred,
    available: Boolean(pw) && Boolean(preferred)
  };
}

function pickMode(request, modes) {
  if (request.cdp) return modes.cdp.available ? 'cdp' : null;
  if (request.channel === 'chromium') return modes.bundled.available ? 'bundled' : null;
  if (request.channel) return modes[request.channel] && modes[request.channel].available ? request.channel : null;
  if (modes.bundled.available) return 'bundled';
  if (modes.chrome.available) return 'chrome';
  if (modes.msedge.available) return 'msedge';
  return null;
}

function modeLabel(mode, details = {}) {
  if (mode === 'cdp') return `attached over CDP (${details.browser || details.endpoint || 'remote browser'})`;
  if (mode === 'chrome') return 'Google Chrome (installed, channel=chrome)';
  if (mode === 'msedge') return 'Microsoft Edge (installed, channel=msedge)';
  if (mode === 'bundled') return 'Playwright Chromium (bundled)';
  return 'no browser';
}

async function attachSession({ pw, probe, mode, viewport, slowMo }) {
  const pagesOpened = [];
  let browser;
  try {
    browser = await pw.chromium.connectOverCDP(probe.modes.cdp.endpoint, slowMo > 0 ? { slowMo } : undefined);
  } catch (error) {
    return { ok: false, error: 'cdp_connect_failed', detail: String(error && error.message || error), hint: 'the endpoint answered /json/version but refused the DevTools connection' };
  }
  // The operator's live session lives in the default context; a fresh
  // context would be an anonymous profile, which is not what attaching is for.
  const existing = typeof browser.contexts === 'function' ? browser.contexts() : [];
  const context = existing.length > 0 ? existing[0] : await browser.newContext(viewport ? { viewport } : {});
  const ownedContext = existing.length === 0;
  return {
    ok: true,
    mode,
    label: modeLabel(mode, probe.modes.cdp),
    browser,
    context,
    version: probe.modes.cdp.browser || (typeof browser.version === 'function' ? browser.version() : ''),
    newPage: async () => {
      const page = await context.newPage();
      if (viewport && typeof page.setViewportSize === 'function') await page.setViewportSize(viewport).catch(() => {});
      pagesOpened.push(page);
      return page;
    },
    close: async () => {
      for (const page of pagesOpened) await page.close().catch(() => {});
      if (ownedContext) await context.close().catch(() => {});
      // Disconnect only: the browser belongs to the operator.
      await browser.close().catch(() => {});
    }
  };
}

/**
 * Open a browser session. Resolves the same way `probeBrowsers` reports, then
 * either attaches (CDP) or launches (channel / bundled).
 *
 * `recordVideo` ({ dir, size }) records a launched browser's pages; an attached
 * (CDP) session never records — the operator's browser is not ours to film.
 * `storageState` (a file) starts a launched browser in a saved session; an attached
 * one keeps its own. `refusalProxy` keeps a launched browser on this machine, and a
 * run that cannot prove it is refused: an attached browser is never contained.
 *
 * @returns {Promise<{ok: boolean, mode?: string, label?: string, browser?: object, context?: object, newPage?: Function, close?: Function, error?: string, hint?: string}>}
 */
async function openBrowser({ projectDir = null, playwright = undefined, env = process.env, config = null, cdp = '', channel = '', headless = true, viewport = null, slowMo = 0, recordVideo = null, storageState = null, refusalProxy = null, exists = fs.existsSync, fetchJson = defaultFetchJson, platform = process.platform } = {}) {
  const pw = playwright === undefined ? loadPlaywright([projectDir]) : playwright;
  if (!pw) {
    return { ok: false, error: 'playwright_not_installed', hint: 'npm install -D playwright (the project) or run from a tree that has it' };
  }
  const probe = await probeBrowsers({ projectDir, playwright: pw, env, config, cdp, channel, exists, fetchJson, platform });
  if (probe.request.invalidChannel) {
    return { ok: false, error: 'browser_channel_unknown', detail: probe.request.invalidChannel, hint: `use one of: ${KNOWN_CHANNELS.join(', ')}` };
  }
  const mode = probe.preferred;
  if (!mode) {
    if (probe.request.cdp) {
      return { ok: false, error: 'cdp_unreachable', detail: probe.request.cdp, hint: 'start the browser with --remote-debugging-port=9222 (and a dedicated --user-data-dir), or enable it at chrome://inspect/#remote-debugging' };
    }
    if (probe.request.channel) {
      return { ok: false, error: 'browser_channel_missing', detail: probe.request.channel, hint: probe.request.channel === 'chromium' ? 'npx playwright install chromium' : `install ${probe.request.channel} or pick another --browser` };
    }
    return { ok: false, error: 'browser_unavailable', hint: 'install Google Chrome/Edge, run `npx playwright install chromium`, or attach with --cdp=http://127.0.0.1:9222' };
  }

  if (mode === 'cdp') {
    if (refusalProxy) return { ok: false, error: 'network_containment_failed', detail: 'an attached browser cannot be contained', hint: 'drop --cdp for a run with value_env or --save-state' };
    return attachSession({ pw, probe, mode, viewport, slowMo });
  }

  const pagesOpened = [];
  const launchOptions = { headless, ...(slowMo > 0 ? { slowMo } : {}), ...(refusalProxy ? { args: containmentArgs(refusalProxy.port) } : {}) };
  if (mode === 'chrome' || mode === 'msedge') launchOptions.channel = mode;
  let browser;
  try {
    browser = await pw.chromium.launch(launchOptions);
  } catch (error) {
    return { ok: false, error: 'browser_launch_failed', detail: String(error && error.message || error), mode, hint: mode === 'bundled' ? 'npx playwright install chromium' : `Playwright could not launch channel=${mode}` };
  }
  const context = await browser.newContext({ ...(viewport ? { viewport } : {}), ...(recordVideo ? { recordVideo } : {}), ...(storageState ? { storageState } : {}) });
  // A proof that breaks is not a proof.
  const uncontained = refusalProxy ? await containmentFailure(context, refusalProxy).catch((error) => String(error && error.message || error)) : null;
  if (uncontained) {
    await browser.close().catch(() => {});
    return { ok: false, error: 'network_containment_failed', detail: uncontained, hint: 'a browser policy or version may be overriding its network flags; use another browser or machine' };
  }
  return {
    ok: true,
    mode,
    label: modeLabel(mode),
    browser,
    context,
    version: typeof browser.version === 'function' ? browser.version() : '',
    newPage: async () => {
      const page = await context.newPage();
      pagesOpened.push(page);
      return page;
    },
    close: async () => {
      await context.close().catch(() => {});
      await browser.close().catch(() => {});
    }
  };
}

module.exports = {
  CDP_ENV,
  CHANNEL_ENV,
  DEFAULT_CDP_PORT,
  KNOWN_CHANNELS,
  channelCandidates,
  detectChannelBinary,
  bundledBinary,
  normalizeCdpEndpoint,
  probeCdp,
  resolveBrowserRequest,
  probeBrowsers,
  pickMode,
  modeLabel,
  openBrowser,
  _defaultFetchJson: defaultFetchJson
};
