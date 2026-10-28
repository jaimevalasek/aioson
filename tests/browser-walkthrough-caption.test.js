'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { normalizeScript, runWalkthrough } = require('../src/lib/browser-walkthrough');
const { renderCaption } = require('../src/lib/browser-walkthrough/steps');
const { buildMarkdown } = require('../src/lib/browser-walkthrough/report');

// The Playwright `Page` surface a caption run touches.
function fakePage() {
  const evaluated = [];
  const page = {
    evaluated,
    on: () => {},
    goto: async () => {},
    url: () => 'http://127.0.0.1:3000/',
    title: async () => 'Demo',
    evaluate: async (fn, arg) => { evaluated.push({ fn, arg }); return 'shown'; },
    locator: () => ({ ariaSnapshot: async () => '- main' }),
    screenshot: async () => {}
  };
  return page;
}

function recordingClock() {
  const waits = [];
  return { waits, now: () => Date.now(), wait: async (ms) => { waits.push(ms); } };
}

async function run(raw, { film = false, ...extra } = {}) {
  const normalized = normalizeScript(raw);
  assert.equal(normalized.ok, true, normalized.errors.join('; '));
  const page = fakePage();
  const opened = [];
  // A launched browser films into the dir it was handed; an attached one has no video().
  if (film) {
    page.video = () => ({
      path: async () => {
        const file = path.join(opened[0].recordVideo.dir, 'raw-page.webm');
        fs.writeFileSync(file, 'webm bytes');
        return file;
      }
    });
  }
  const clock = recordingClock();
  const report = await runWalkthrough({
    targetDir: process.cwd(),
    script: normalized.script,
    url: 'http://127.0.0.1:3000',
    persist: false,
    env: {},
    clock,
    open: async (options) => { opened.push(options); return { ok: true, mode: 'bundled', label: 'fake', version: '1', newPage: async () => page, close: async () => {} }; },
    ...extra
  });
  return { report, page, opened, clock };
}

test('caption steps validate text, hold, position and refuse ids', () => {
  const bad = normalizeScript({
    steps: [
      { do: 'caption', text: 42 },
      { do: 'caption', text: 'x', ms: 90000 },
      { do: 'caption', text: 'x', position: 'left' },
      { do: 'caption', text: 'x', ac: 'AC-01' }
    ]
  });
  assert.equal(bad.ok, false);
  const text = bad.errors.join('\n');
  assert.match(text, /step 0: caption `text` must be a string/);
  assert.match(text, /step 1: caption `ms` must be 0\.\.60000/);
  assert.match(text, /step 2: caption `position` must be top or bottom/);
  assert.match(text, /step 3: a caption is narration and proves nothing — move AC-01/);

  const good = normalizeScript({ steps: [{ do: 'caption', text: 'Hello', ms: 1500, position: 'top' }, { do: 'caption', text: '' }] });
  assert.equal(good.ok, true, good.errors.join('; '));
});

test('slow_mo is clamped to 0..5000 ms and defaults to no pause', () => {
  const pace = (value) => normalizeScript({ slow_mo: value, steps: [{ do: 'reload' }] }).script.slow_mo;
  assert.equal(pace(undefined), 0);
  assert.equal(pace(-5), 0);
  assert.equal(pace('abc'), 0);
  assert.equal(pace(250.7), 250);
  assert.equal(pace(9000), 5000);
});

test('a caption renders in the page and holds only for a person watching', async () => {
  const script = { steps: [{ do: 'caption', text: 'Client {{who}} wrote', ms: 2000, position: 'top' }, { do: 'caption', text: '' }], vars: { who: 'Ana' } };

  const headless = await run(script);
  assert.equal(headless.report.ok, true);
  assert.equal(headless.page.evaluated.length, 2);
  assert.equal(headless.page.evaluated[0].fn, renderCaption);
  assert.deepEqual(headless.page.evaluated[0].arg, { text: 'Client Ana wrote', position: 'top' });
  assert.deepEqual(headless.page.evaluated[1].arg, { text: '', position: 'bottom' });
  assert.deepEqual(headless.clock.waits, [], 'a headless run never waits on a caption');
  assert.equal(headless.report.steps[0].detail, 'caption "Client Ana wrote"');
  assert.equal(headless.report.steps[1].detail, 'caption cleared');
  assert.deepEqual(headless.report.ids, {});

  const headed = await run(script, { headed: true });
  assert.deepEqual(headed.clock.waits, [2000]);
  assert.equal(headed.report.steps[0].detail, 'caption "Client Ana wrote" (held 2000ms)');
});

test('slow motion reaches the browser: the flag wins over the script', async () => {
  const script = { slow_mo: 300, steps: [{ do: 'caption', text: 'x' }] };
  assert.equal((await run(script)).opened[0].slowMo, 300);
  assert.equal((await run(script, { slowMo: 800 })).opened[0].slowMo, 800);
  assert.equal((await run(script, { slowMo: 0 })).opened[0].slowMo, undefined, '--slow-mo=0 turns the script pace off');
  assert.equal((await run({ steps: [{ do: 'caption', text: 'x' }] })).opened[0].slowMo, undefined);
});

// A minimal DOM: enough to run renderCaption outside a browser.
function fakeDocument() {
  const byId = new Map();
  const make = (tag) => {
    const el = {
      tag,
      id: '',
      attributes: {},
      style: { cssText: '' },
      children: [],
      textContent: '',
      shadow: null,
      setAttribute(name, value) { this.attributes[name] = value; },
      attachShadow(options) { this.shadow = { mode: options.mode, children: [], appendChild(child) { this.children.push(child); } }; return this.shadow; },
      appendChild(child) { this.children.push(child); if (child.id) byId.set(child.id, child); },
      remove() { byId.delete(this.id); this.removed = true; }
    };
    return el;
  };
  const documentElement = make('html');
  return { documentElement, createElement: make, getElementById: (id) => byId.get(id) || null };
}

test('renderCaption keeps the narration out of reach of locators and clicks', () => {
  /* global document */
  const original = global.document;
  global.document = fakeDocument();
  try {
    assert.equal(renderCaption({ text: 'The attendant answers', position: 'bottom' }), 'shown');
    const host = document.getElementById('aioson-walkthrough-caption');
    assert.equal(host.attributes['aria-hidden'], 'true');
    assert.match(host.style.cssText, /pointer-events:none/);
    assert.equal(host.shadow.mode, 'closed');
    assert.equal(host.__aiosonCaption.textContent, 'The attendant answers');
    assert.equal(host.style.bottom, '24px');

    renderCaption({ text: 'Next', position: 'top' });
    assert.equal(document.getElementById('aioson-walkthrough-caption'), host, 'the same box is reused');
    assert.equal(host.__aiosonCaption.textContent, 'Next');
    assert.equal(host.style.top, '16px');

    assert.equal(renderCaption({ text: '', position: 'bottom' }), 'cleared');
    assert.equal(host.removed, true);
    assert.equal(document.getElementById('aioson-walkthrough-caption'), null);
  } finally {
    global.document = original;
  }
});

test('a recorded run films the browser, holds its captions and lands the video where asked', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-video-test-'));
  try {
    const target = path.join(tmp, 'Downloads', 'demo.webm');
    const { report, opened, clock } = await run({ steps: [{ do: 'caption', text: 'Watch this', ms: 1500 }] }, { film: true, video: target });
    assert.equal(report.ok, true);
    assert.deepEqual(opened[0].recordVideo.size, { width: 1280, height: 720 }, 'no viewport in the script: the default page size');
    assert.deepEqual(clock.waits, [1500], 'headless, but filmed: the caption holds for whoever watches the video');
    assert.equal(report.video, target, 'outside the project the path stays absolute');
    assert.equal(fs.readFileSync(target, 'utf8'), 'webm bytes');
    assert.equal(fs.existsSync(opened[0].recordVideo.dir), false, 'the recording dir is temporary');
    assert.ok(buildMarkdown(report).includes(`- Video: ${target}`), 'the markdown report names the video');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('an attached browser is never filmed: the run warns and still reports its steps', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-video-test-'));
  try {
    const { report, opened } = await run({ steps: [{ do: 'caption', text: 'x', ms: 100 }] }, { video: path.join(tmp, 'never.webm') });
    assert.equal(report.ok, true);
    assert.equal(report.video, '');
    assert.ok(report.warnings.some((w) => /never filmed/.test(w)), report.warnings.join('; '));
    assert.equal(fs.existsSync(path.join(tmp, 'never.webm')), false);
    assert.equal(fs.existsSync(opened[0].recordVideo.dir), false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
