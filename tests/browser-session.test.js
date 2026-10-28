'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeCdpEndpoint,
  resolveBrowserRequest,
  probeBrowsers,
  pickMode,
  openBrowser,
  detectChannelBinary
} = require('../src/lib/browser-session');

const NO_ENV = {};

function fakePlaywright({ bundledPath = 'C:/pw/chrome.exe', launchImpl = null, connectImpl = null } = {}) {
  const calls = { launch: [], connect: [] };
  const makeBrowser = (label) => {
    const closed = { browser: false, contexts: 0, pages: 0 };
    const makeContext = () => ({
      newPage: async () => ({ close: async () => { closed.pages += 1; }, setViewportSize: async () => {} }),
      close: async () => { closed.contexts += 1; }
    });
    const existing = [];
    return {
      label,
      closed,
      existing,
      contexts: () => existing,
      newContext: async () => makeContext(),
      version: () => '140.0',
      close: async () => { closed.browser = true; }
    };
  };
  return {
    calls,
    chromium: {
      executablePath: () => bundledPath,
      launch: async (options) => {
        calls.launch.push(options);
        if (launchImpl) return launchImpl(options);
        return makeBrowser(`launched:${options.channel || 'bundled'}`);
      },
      connectOverCDP: async (endpoint) => {
        calls.connect.push(endpoint);
        if (connectImpl) return connectImpl(endpoint);
        const browser = makeBrowser(`cdp:${endpoint}`);
        browser.existing.push({
          newPage: async () => ({ close: async () => { browser.closed.pages += 1; }, setViewportSize: async () => {} }),
          close: async () => { browser.closed.contexts += 1; }
        });
        return browser;
      }
    },
    makeBrowser
  };
}

test('CDP endpoints normalize from a port, host:port, or a full URL', () => {
  assert.equal(normalizeCdpEndpoint('9222'), 'http://127.0.0.1:9222');
  assert.equal(normalizeCdpEndpoint('localhost:9333'), 'http://localhost:9333');
  assert.equal(normalizeCdpEndpoint('http://127.0.0.1:9222/'), 'http://127.0.0.1:9222');
  assert.equal(normalizeCdpEndpoint('ws://127.0.0.1:9222/devtools/browser/abc'), 'ws://127.0.0.1:9222/devtools/browser/abc');
  assert.equal(normalizeCdpEndpoint(''), '');
});

test('the request resolves option → environment → project config, and rejects unknown channels', () => {
  const config = { browser: { cdp: '9000', channel: 'msedge' } };
  assert.deepEqual(resolveBrowserRequest({ env: NO_ENV, config }), { cdp: 'http://127.0.0.1:9000', channel: 'msedge', invalidChannel: '' });
  assert.equal(resolveBrowserRequest({ env: { AIOSON_BROWSER_CDP: '9111' }, config }).cdp, 'http://127.0.0.1:9111');
  assert.equal(resolveBrowserRequest({ cdp: '9222', env: { AIOSON_BROWSER_CDP: '9111' }, config }).cdp, 'http://127.0.0.1:9222');
  assert.equal(resolveBrowserRequest({ channel: 'chrome', env: NO_ENV, config }).channel, 'chrome');
  const bad = resolveBrowserRequest({ channel: 'firefox', env: NO_ENV });
  assert.equal(bad.channel, '');
  assert.equal(bad.invalidChannel, 'firefox');
});

test('installed browsers are detected from well-known paths per platform', () => {
  const exists = (file) => file.replace(/\\/g, '/') === 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  const env = { PROGRAMFILES: 'C:\\Program Files', 'PROGRAMFILES(X86)': 'C:\\Program Files (x86)' };
  assert.match(detectChannelBinary('chrome', { env, platform: 'win32', exists }) || '', /chrome\.exe$/);
  assert.equal(detectChannelBinary('msedge', { env, platform: 'win32', exists }), null);
  assert.equal(detectChannelBinary('chrome', { env, platform: 'linux', exists: () => false }), null);
  assert.equal(detectChannelBinary('chrome', { env, platform: 'darwin', exists: (f) => f.endsWith('Google Chrome') }), '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
});

test('without an explicit choice: bundled first, then installed Chrome, then Edge, then nothing', () => {
  const modes = (bundled, chrome, msedge) => ({ cdp: { available: false }, bundled: { available: bundled }, chrome: { available: chrome }, msedge: { available: msedge } });
  const none = { cdp: '', channel: '' };
  assert.equal(pickMode(none, modes(true, true, true)), 'bundled');
  assert.equal(pickMode(none, modes(false, true, true)), 'chrome');
  assert.equal(pickMode(none, modes(false, false, true)), 'msedge');
  assert.equal(pickMode(none, modes(false, false, false)), null);
  assert.equal(pickMode({ cdp: 'http://x', channel: '' }, { ...modes(true, true, true), cdp: { available: false } }), null, 'a requested CDP endpoint never silently falls back to a launch');
  assert.equal(pickMode({ cdp: '', channel: 'chrome' }, modes(true, false, true)), null, 'a requested channel never silently falls back');
  assert.equal(pickMode({ cdp: '', channel: 'chromium' }, modes(true, true, true)), 'bundled');
});

test('probeBrowsers reports every mode and reaches a CDP endpoint through /json/version', async () => {
  const pw = fakePlaywright();
  const fetched = [];
  const result = await probeBrowsers({
    playwright: pw,
    env: NO_ENV,
    cdp: '9222',
    exists: (file) => file === 'C:/pw/chrome.exe',
    fetchJson: async (url) => { fetched.push(url); return { Browser: 'Chrome/140.0', webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/browser/1' }; },
    platform: 'linux'
  });
  assert.deepEqual(fetched, ['http://127.0.0.1:9222/json/version']);
  assert.equal(result.preferred, 'cdp');
  assert.equal(result.modes.cdp.browser, 'Chrome/140.0');
  assert.equal(result.modes.bundled.available, true);
  assert.equal(result.modes.chrome.available, false);
  assert.equal(result.available, true);
});

test('openBrowser attaches over CDP into the live context and only disconnects on close', async () => {
  const pw = fakePlaywright();
  const session = await openBrowser({
    playwright: pw,
    env: NO_ENV,
    cdp: 'http://127.0.0.1:9222',
    exists: () => false,
    fetchJson: async () => ({ Browser: 'Chrome/140.0' })
  });
  assert.equal(session.ok, true, JSON.stringify(session));
  assert.equal(session.mode, 'cdp');
  assert.match(session.label, /attached over CDP/);
  assert.deepEqual(pw.calls.connect, ['http://127.0.0.1:9222']);
  assert.equal(pw.calls.launch.length, 0);
  const page = await session.newPage();
  assert.ok(page);
  await session.close();
  assert.equal(session.browser.closed.pages, 1, 'pages we opened are closed');
  assert.equal(session.browser.closed.contexts, 0, 'the operator\'s live context is never closed');
  assert.equal(session.browser.closed.browser, true, 'close() on a connected browser is a disconnect');
});

test('openBrowser launches the installed Chrome through the channel when the bundle is absent', async () => {
  const pw = fakePlaywright();
  const env = { PROGRAMFILES: 'C:\\Program Files', 'PROGRAMFILES(X86)': 'C:\\Program Files (x86)' };
  const session = await openBrowser({
    playwright: pw,
    env,
    platform: 'win32',
    exists: (file) => file.replace(/\\/g, '/') === 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    fetchJson: async () => null,
    headless: false
  });
  assert.equal(session.ok, true, JSON.stringify(session));
  assert.equal(session.mode, 'chrome');
  assert.deepEqual(pw.calls.launch, [{ headless: false, channel: 'chrome' }]);
  await session.close();
  assert.equal(session.browser.closed.browser, true);
  assert.equal(session.browser.closed.contexts, 1);
});

test('openBrowser passes slow motion to a launched or attached browser only when asked', async () => {
  const launched = fakePlaywright();
  const exists = (file) => file.replace(/\\/g, '/') === 'C:/pw/chrome.exe';
  await openBrowser({ playwright: launched, env: NO_ENV, exists, fetchJson: async () => null, headless: false, slowMo: 400 });
  assert.deepEqual(launched.calls.launch, [{ headless: false, slowMo: 400 }]);
  await openBrowser({ playwright: launched, env: NO_ENV, exists, fetchJson: async () => null });
  assert.deepEqual(launched.calls.launch[1], { headless: true }, 'no pace unless asked');

  const attached = fakePlaywright();
  const connect = [];
  attached.chromium.connectOverCDP = async (endpoint, options) => {
    connect.push(options);
    const browser = attached.makeBrowser(`cdp:${endpoint}`);
    browser.existing.push({ newPage: async () => ({ close: async () => {}, setViewportSize: async () => {} }), close: async () => {} });
    return browser;
  };
  const session = await openBrowser({ playwright: attached, env: NO_ENV, cdp: '9222', fetchJson: async () => ({ Browser: 'Chrome/140' }), slowMo: 250 });
  assert.equal(session.ok, true, JSON.stringify(session));
  assert.deepEqual(connect, [{ slowMo: 250 }]);
});

test('openBrowser hands the video recording to the context it launches, only when asked', async () => {
  const contexts = [];
  const pw = fakePlaywright({
    launchImpl: async () => ({
      newContext: async (options) => { contexts.push(options); return { newPage: async () => ({}), close: async () => {} }; },
      version: () => '140.0',
      close: async () => {}
    })
  });
  const exists = (file) => file.replace(/\\/g, '/') === 'C:/pw/chrome.exe';
  const viewport = { width: 1366, height: 800 };
  const recordVideo = { dir: 'C:/tmp/aioson-video-x', size: viewport };
  await openBrowser({ playwright: pw, env: NO_ENV, exists, fetchJson: async () => null, viewport, recordVideo });
  await openBrowser({ playwright: pw, env: NO_ENV, exists, fetchJson: async () => null });
  assert.deepEqual(contexts, [{ viewport, recordVideo }, {}]);
});

test('openBrowser reports the missing prerequisite instead of throwing', async () => {
  const pw = fakePlaywright();
  const nothing = await openBrowser({ playwright: pw, env: NO_ENV, exists: () => false, fetchJson: async () => null, platform: 'linux' });
  assert.equal(nothing.ok, false);
  assert.equal(nothing.error, 'browser_unavailable');
  assert.match(nothing.hint, /--cdp=/);

  const cdpDown = await openBrowser({ playwright: pw, env: NO_ENV, cdp: '9222', exists: () => true, fetchJson: async () => null });
  assert.equal(cdpDown.error, 'cdp_unreachable');
  assert.match(cdpDown.hint, /remote-debugging-port/);

  const badChannel = await openBrowser({ playwright: pw, env: NO_ENV, channel: 'firefox', exists: () => true, fetchJson: async () => null });
  assert.equal(badChannel.error, 'browser_channel_unknown');

  const noPlaywright = await openBrowser({ playwright: null, env: NO_ENV });
  assert.equal(noPlaywright.error, 'playwright_not_installed');

  const launchFails = fakePlaywright({ launchImpl: async () => { throw new Error('boom'); } });
  const failed = await openBrowser({ playwright: launchFails, env: NO_ENV, exists: (f) => f === 'C:/pw/chrome.exe', fetchJson: async () => null, platform: 'linux' });
  assert.equal(failed.error, 'browser_launch_failed');
  assert.equal(failed.mode, 'bundled');
});
