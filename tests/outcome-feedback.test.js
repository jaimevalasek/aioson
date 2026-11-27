'use strict';

/**
 * The review screen — asked at the end of a delivery, never at every turn.
 * The person can answer, skip this one, snooze a week or a month, or stop
 * being asked; no invitation ever comes from a test run, CI, a headless
 * machine or a project in a temporary folder. The screen itself is a
 * loopback page that refuses foreign hosts and cross-site requests, and saves
 * only the scrubbed comment.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const fb = require('../src/lib/outcomes/feedback');
const { writeRecord, readRecord } = require('../src/lib/outcomes/ledger');
const { createFeedbackServer } = require('../src/lib/outcomes/feedback-server');
const { renderFeedbackPage } = require('../src/lib/outcomes/feedback-page');
const { maybeInviteAfterClose } = require('../src/lib/outcomes/invite');

const NOW = Date.parse('2026-11-27T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
// A machine with a display, outside CI and outside a test run.
const DESKTOP_ENV = { DISPLAY: ':0' };

function tmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function project() {
  const dir = tmp('aioson-fb-');
  fs.mkdirSync(path.join(dir, '.aioson', 'context'), { recursive: true });
  return dir;
}

function baseRecord(feature = 'checkout-flow') {
  return {
    schema: 1, feature, kind: 'feature', classification: 'SMALL', verdict: 'PASS',
    closed_at: '2026-11-27T11:00:00.000Z', aioson_version: '1.84.2', catalog_version: 1,
    shape: 'single-dev', autopilot: false, practices: { visual_inputs: true }, outcome: { first_pass: true }
  };
}

function decide(overrides = {}) {
  const home = overrides.home || tmp('aioson-fb-home-');
  return fb.decideInvitation({ prefs: fb.readPrefs(home), record: baseRecord(), now: NOW, env: DESKTOP_ENV, home, ...overrides });
}

test('a fresh delivery on a desktop is due', () => {
  assert.deepEqual(decide(), { invite: true, reason: 'due' });
});

test('no invitation from a test run, CI, a headless machine, an env opt-out or a temporary project', () => {
  assert.equal(decide({ env: { DISPLAY: ':0', NODE_TEST_CONTEXT: 'child-v8' } }).reason, 'test_run');
  assert.equal(decide({ env: { DISPLAY: ':0', CI: 'true' } }).reason, 'ci');
  assert.equal(decide({ env: { DISPLAY: ':0', AIOSON_FEEDBACK: 'off' } }).reason, 'disabled_by_env');
  assert.equal(decide({ env: { WSL_DISTRO_NAME: 'Ubuntu' } }).reason, 'headless');
  // The project lives in the temporary folder and the home does not.
  assert.equal(decide({ targetDir: project(), home: path.join(os.homedir(), '.aioson-never-created-' + process.pid) }).reason, 'temporary_folder');
});

test('answered, skipped, snoozed, off and recently invited deliveries are not asked', () => {
  const home = tmp('aioson-fb-home-');
  const answered = { ...baseRecord(), feedback: { rating: 4, good: '', bad: '', answered_at: '2026-11-27T11:30:00.000Z' } };
  assert.equal(decide({ home, record: answered }).reason, 'answered');
  const skipped = { ...baseRecord(), feedback: { skipped_at: '2026-11-27T11:30:00.000Z', choice: 'later' } };
  assert.equal(decide({ home, record: skipped }).reason, 'skipped');

  fb.markInvited(home, NOW - 2 * 60 * 60 * 1000);
  assert.equal(decide({ home }).reason, 'recent', 'several closes in one day are one invitation');
  assert.equal(decide({ home, now: NOW + DAY }).reason, 'due');

  fb.applyChoice({ choice: 'week', home, now: NOW });
  assert.equal(decide({ home, now: NOW + 6 * DAY }).reason, 'snoozed');
  assert.equal(decide({ home, now: NOW + 8 * DAY }).reason, 'due');

  fb.applyChoice({ choice: 'month', home, now: NOW });
  assert.equal(decide({ home, now: NOW + 29 * DAY }).reason, 'snoozed');
  assert.equal(decide({ home, now: NOW + 31 * DAY }).reason, 'due');

  fb.applyChoice({ choice: 'never', home, now: NOW });
  assert.equal(decide({ home, now: NOW + 365 * DAY }).reason, 'off');
  fb.applyChoice({ choice: 'on', home, now: NOW });
  assert.equal(decide({ home, now: NOW + DAY }).reason, 'due');
});

test('"not now" skips only this delivery and is written on its record', () => {
  const dir = project();
  const home = tmp('aioson-fb-home-');
  writeRecord(dir, baseRecord());
  fb.applyChoice({ choice: 'later', targetDir: dir, slug: 'checkout-flow', home, now: NOW });
  assert.deepEqual(readRecord(dir, 'checkout-flow').feedback, { skipped_at: '2026-11-27T12:00:00.000Z', choice: 'later' });
  assert.equal(fb.readPrefs(home).feedback.state, 'on');
});

test('the saved answer holds the scrubbed comment and the rating, nothing else', () => {
  const dir = project();
  writeRecord(dir, baseRecord());
  const saved = fb.saveFeedback({ targetDir: dir, slug: 'checkout-flow', rating: '5', good: 'O protótipo da Loja Bella em C:\\dev\\loja\\x.vue acertou', bad: '', names: ['Loja Bella'], now: NOW });
  assert.equal(saved.ok, true);
  assert.deepEqual(readRecord(dir, 'checkout-flow').feedback, {
    rating: 5, good: 'O protótipo da [removido] em [removido] acertou', bad: '', answered_at: '2026-11-27T12:00:00.000Z'
  });
  assert.equal(fb.saveFeedback({ targetDir: dir, slug: 'checkout-flow', rating: 9 }).reason, 'invalid_rating');
  assert.equal(fb.saveFeedback({ targetDir: dir, slug: 'checkout-flow' }).reason, 'empty_feedback');
});

test('the close never opens a screen in a test run, and records the invitation only when it launches', async () => {
  const dir = project();
  const home = tmp('aioson-fb-home-');
  writeRecord(dir, baseRecord());
  let launched = 0;
  const launch = async () => { launched += 1; };
  const inTest = await maybeInviteAfterClose({ targetDir: dir, slug: 'checkout-flow', home, now: NOW, launch });
  assert.deepEqual([inTest.invited, inTest.reason, launched], [false, 'test_run', 0]);
  const flagged = await maybeInviteAfterClose({ targetDir: dir, slug: 'checkout-flow', options: { 'no-feedback': true }, env: DESKTOP_ENV, home, now: NOW, launch });
  assert.equal(flagged.reason, 'flag');
  // Outside the temporary-folder guard the decision is "due"; the launch is injected.
  const desktopHome = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-fb-home-'));
  const due = await maybeInviteAfterClose({ targetDir: dir, slug: 'checkout-flow', env: DESKTOP_ENV, home: desktopHome, now: NOW, launch });
  assert.deepEqual([due.invited, launched], [true, 1]);
  assert.equal(fb.readPrefs(desktopHome).feedback.last_invited_at, '2026-11-27T12:00:00.000Z');
});

function request(port, { method = 'GET', pathName, host, body, headers = {} }) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: pathName, headers: { host: host || `127.0.0.1:${port}`, ...(body ? { 'content-type': 'application/json' } : {}), ...headers } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

test('the screen serves only loopback same-site requests behind its token, and saves the answer once', async () => {
  const answers = [];
  const screen = createFeedbackServer({
    view: { locale: 'pt-BR', feature: 'checkout-flow', kind: 'feature', measured: [], practices: [] },
    names: ['Loja Bella'],
    timeoutMs: 10000,
    onAnswer: (a) => { answers.push(a); return { ok: true, feedback: { rating: a.rating } }; },
    onSkip: () => ({ ok: true })
  });
  const { port, url } = await screen.start();
  const base = new URL(url).pathname.replace(/\/$/, '');
  assert.equal((await request(port, { pathName: '/' })).status, 404, 'no token, no page');
  assert.equal((await request(port, { pathName: `${base}/`, host: 'evil.example:80' })).status, 403);
  assert.equal((await request(port, { method: 'POST', pathName: `${base}/answer`, body: { rating: 5 }, headers: { 'sec-fetch-site': 'cross-site' } })).status, 403);
  const page = await request(port, { pathName: `${base}/` });
  assert.equal(page.status, 200);
  assert.match(page.headers['content-security-policy'], /default-src 'none'/);
  assert.match(page.text, /Como foi esta entrega\?/);
  assert.match(page.text, /Não perguntar mais/);
  const preview = JSON.parse((await request(port, { method: 'POST', pathName: `${base}/preview`, body: { good: 'A Loja Bella ficou ótima', bad: '' } })).text);
  assert.equal(preview.good, 'A [removido] ficou ótima');
  assert.equal((await request(port, { method: 'POST', pathName: `${base}/answer`, body: { rating: 5, good: 'ok', bad: '' } })).status, 200);
  assert.equal((await request(port, { method: 'POST', pathName: `${base}/skip`, body: { choice: 'never' } }).catch(() => ({ status: 409 }))).status, 409);
  assert.deepEqual(await screen.done, { action: 'answered', feedback: { rating: 5 } });
  assert.equal(answers.length, 1);
});

test('the page escapes project values and keeps the view out of the markup', () => {
  const html = renderFeedbackPage({ locale: 'en', feature: '<script>x</script>', kind: 'feature', measured: [{ label: '<b>', value: '</script>' }], practices: [], apiBase: '/f/t' });
  assert.ok(!html.includes('<script>x</script>'));
  assert.ok(!html.includes('<b></span>'));
  assert.match(html, /How did this delivery go\?/);
  const island = /<script type="application\/json" id="view">([\s\S]*?)<\/script>/.exec(html)[1];
  assert.ok(!island.includes('<'), 'the JSON island cannot close its script element');
});
