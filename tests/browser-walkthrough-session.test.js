'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { normalizeScript, runWalkthrough } = require('../src/lib/browser-walkthrough');
const { isLoopbackUrl } = require('../src/lib/browser-walkthrough/scenario');
const { runBrowserRun } = require('../src/commands/browser-run');
const { ensureProjectGitignorePolicy } = require('../src/installer');

const SECRET = 'hunter2-seeded-secret';
const STATE = '.aioson/runtime/browser-state/owner.json';
const fastClock = { now: () => Date.now(), wait: async () => {} };

async function project(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-walk-session-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

function fakePage({ url = 'http://127.0.0.1:4100/login', aria = '- main', elements = {}, onFill = null } = {}) {
  const listeners = {};
  const trace = [];
  const state = { url };
  const locator = (key) => {
    const api = {
      fill: async (value) => {
        trace.push(`fill:${key}`);
        state.filled = value;
        if (onFill) await onFill(value, page);
      },
      pressSequentially: async (value) => { trace.push(`type:${key}`); state.filled = value; },
      click: async () => { trace.push(`click:${key}`); },
      isVisible: async () => Boolean(elements[key]),
      textContent: async () => (elements[key] ? elements[key].text || '' : null),
      allTextContents: async () => (elements[key] ? [elements[key].text || ''] : []),
      count: async () => (elements[key] ? 1 : 0),
      waitFor: async () => {},
      first: () => api,
      last: () => api,
      nth: () => api,
      ariaSnapshot: async () => aria
    };
    return api;
  };
  const page = {
    trace,
    state,
    emit: (event, payload) => { for (const fn of listeners[event] || []) fn(payload); },
    on: (event, fn) => { (listeners[event] = listeners[event] || []).push(fn); },
    goto: async (target) => { trace.push(`goto:${target}`); state.url = state.redirect || target; },
    reload: async () => {},
    url: () => state.url,
    title: async () => 'App',
    evaluate: async () => '',
    screenshot: async ({ path: file }) => { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, 'png'); },
    waitForLoadState: async () => {},
    getByRole: (role, options = {}) => locator(`role=${role}${options.name ? `[name=${options.name}]` : ''}`),
    getByText: (text) => locator(`text=${text}`),
    getByLabel: (label) => locator(`label=${label}`),
    getByPlaceholder: (p) => locator(`placeholder=${p}`),
    getByTestId: (id) => locator(`testid=${id}`),
    getByTitle: (title) => locator(`title=${title}`),
    getByAltText: (alt) => locator(`alt=${alt}`),
    locator: (css) => locator(`css=${css}`)
  };
  return page;
}

function opener(page, { storage = { cookies: [{ name: 'sid', value: 'live-cookie-value' }], origins: [] } } = {}) {
  const calls = [];
  const open = async (options) => {
    calls.push(options);
    return { ok: true, mode: 'bundled', label: 'fake', version: '1', context: { storageState: async () => storage }, newPage: async () => page, close: async () => {} };
  };
  open.calls = calls;
  return open;
}

const LOGIN = [
  { do: 'goto', url: '/login' },
  { do: 'fill', target: 'label=Password', value_env: 'E2E_PASSWORD' },
  { do: 'click', target: 'role=button[name="Sign in"]' }
];
const script = (steps = LOGIN, extra = {}) => normalizeScript({ name: 'login', steps, ...extra }).script;
const env = { E2E_PASSWORD: SECRET };

test('value_env is a contract the script checker reads', () => {
  assert.equal(normalizeScript({ steps: [{ do: 'fill', target: 'label=A', value_env: 'E2E_A' }] }).ok, true);
  assert.equal(normalizeScript({ steps: [{ do: 'type', target: 'label=A', value_env: 'E2E_A' }] }).ok, true);
  assert.match(normalizeScript({ steps: [{ do: 'fill', target: 'label=A' }] }).errors[0], /fill needs `value`/);
  assert.match(normalizeScript({ steps: [{ do: 'fill', target: 'label=A', value: 'x', value_env: 'E2E_A' }] }).errors[0], /`value` or `value_env`, never both/);
  assert.match(normalizeScript({ steps: [{ do: 'fill', target: 'label=A', value_env: 'not a name' }] }).errors[0], /must name an environment variable/);
  assert.match(normalizeScript({ steps: [{ do: 'select', target: 'label=A', value: 'x', value_env: 'E2E_A' }] }).errors[0], /only works on fill and type/);
});

test('loopback means the real host of the url', () => {
  for (const url of ['http://localhost:3000', 'http://127.0.0.1', 'https://localhost/x', 'http://[::1]:3000/', 'http://LOCALHOST:1']) assert.equal(isLoopbackUrl(url), true, url);
  for (const url of ['http://example.com', 'http://localhost@evil.test', 'http://localhost.evil.test', 'http://127.0.0.1.evil.test', 'http://10.0.0.5', 'file:///C:/x.html', 'ftp://localhost', 'about:blank', '/relative', '']) assert.equal(isLoopbackUrl(url), false, url);
});

test('value_env refuses any other host before a page opens', async (t) => {
  const root = await project(t);
  for (const url of ['https://app.example.com', 'http://localhost@evil.test:3000', 'http://192.168.0.10:3000', 'file:///C:/page.html']) {
    const open = opener(fakePage());
    const report = await runWalkthrough({ targetDir: root, script: script(), url, env, open, clock: fastClock, persist: false });
    assert.equal(report.ok, false, url);
    assert.equal(report.error, 'value_env_requires_loopback', url);
    assert.equal(open.calls.length, 0, `${url}: the browser never opened`);
    assert.doesNotMatch(JSON.stringify(report), new RegExp(SECRET));
  }

  const open = opener(fakePage());
  const leaving = script([{ do: 'goto', url: 'https://sso.example.com/login' }, ...LOGIN.slice(1)]);
  assert.equal((await runWalkthrough({ targetDir: root, script: leaving, url: 'http://127.0.0.1:4100', env, open, clock: fastClock, persist: false })).error, 'value_env_requires_loopback');
  assert.equal(open.calls.length, 0, 'a literal goto that leaves the machine counts');

  const inLoop = script([{ do: 'each', items: [1], steps: LOGIN }]);
  assert.equal((await runWalkthrough({ targetDir: root, script: inLoop, url: 'https://app.example.com', env, open, clock: fastClock, persist: false })).error, 'value_env_requires_loopback', 'a loop child counts');

  // A script without value_env runs against any host, as it always did.
  const plain = script([{ do: 'goto', url: '/' }]);
  assert.equal((await runWalkthrough({ targetDir: root, script: plain, url: 'https://app.example.com', env, open, clock: fastClock, persist: false })).ok, true);
});

test('a page that redirected away gets nothing typed', async (t) => {
  const root = await project(t);
  const page = fakePage();
  page.state.redirect = 'https://accounts.example.com/signin?client=app';
  const report = await runWalkthrough({ targetDir: root, script: script(), url: 'http://127.0.0.1:4100', env, open: opener(page), clock: fastClock, persist: false });
  assert.equal(report.ok, false);
  assert.match(report.steps[1].error, /value_env refused and nothing was typed: the page is on https:\/\/accounts\.example\.com\/signin, not on a loopback host/);
  assert.equal(page.state.filled, undefined);
  assert.equal(page.trace.some((line) => line.startsWith('fill:')), false);
});

test('the value reaches the page and no report, artifact, log or error', async (t) => {
  const root = await project(t);
  // The page echoes it everywhere a careless app does: aria tree, console, page text.
  const page = fakePage({
    aria: `- textbox "Password": ${SECRET}`,
    elements: { 'text=Saved': { text: `Saved ${SECRET}` } },
    onFill: (value, p) => {
      p.emit('console', { type: () => 'error', text: () => `login failed for ${value}` });
      p.state.url = `http://127.0.0.1:4100/next?token=${value}`;
    }
  });
  const steps = [
    ...LOGIN,
    { do: 'snapshot' },
    { do: 'expect', target: 'text=Saved', contains: 'Saved' },
    { do: 'expect', text: 'Never there', timeout: 1 }
  ];
  const report = await runWalkthrough({ targetDir: root, script: script(steps, { timeout: 5 }), url: 'http://127.0.0.1:4100', slug: 'orders', env, open: opener(page), clock: fastClock, continueOnFailure: true });

  assert.equal(page.state.filled, SECRET, 'the page got the value');
  assert.match(report.steps[1].detail, /filled label=Password with \(masked\)/);
  assert.match(report.console.samples[0].text, /login failed for \[env\.E2E_PASSWORD\]/);
  assert.equal(report.steps[0].ok, true);
  assert.equal(report.persisted, true);

  const leaks = [];
  const walk = async (dir) => {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(file);
      else if ((await fs.readFile(file, 'utf8')).includes(SECRET)) leaks.push(file);
    }
  };
  await walk(root);
  assert.deepEqual(leaks, [], 'no file the run wrote holds the value');
  assert.doesNotMatch(JSON.stringify(report), new RegExp(SECRET));
});

test('a fill that throws with the value in its message does not carry it out', async (t) => {
  const root = await project(t);
  const page = fakePage({ onFill: (value) => { throw new Error(`locator.fill("${value}") timed out`); } });
  const report = await runWalkthrough({ targetDir: root, script: script(), url: 'http://127.0.0.1:4100', env, open: opener(page), clock: fastClock, persist: false });
  assert.equal(report.ok, false);
  assert.match(report.steps[1].error, /locator\.fill\("\[env\.E2E_PASSWORD\]"\)/);
  assert.doesNotMatch(JSON.stringify(report), new RegExp(SECRET));
});

test('an unset variable and a value too short to scrub fail the step, and neither is typed', async (t) => {
  const root = await project(t);
  const unset = fakePage();
  const missing = await runWalkthrough({ targetDir: root, script: script(), url: 'http://127.0.0.1:4100', env: {}, open: opener(unset), clock: fastClock, persist: false });
  assert.match(missing.steps[1].error, /value_env E2E_PASSWORD is not set in the environment or the project \.env/);
  assert.equal(unset.state.filled, undefined);

  const short = fakePage();
  const tooShort = await runWalkthrough({ targetDir: root, script: script(), url: 'http://127.0.0.1:4100', env: { E2E_PASSWORD: 'abc' }, open: opener(short), clock: fastClock, persist: false });
  assert.match(tooShort.steps[1].error, /shorter than 4 characters/);
  assert.equal(short.state.filled, undefined);
});

test('a state file is accepted only under .aioson/runtime/', async (t) => {
  const root = await project(t);
  await fs.mkdir(path.join(root, '.aioson/context'), { recursive: true });
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-walk-outside-'));
  t.after(() => fs.rm(outside, { recursive: true, force: true }));
  for (const flag of ['state', 'saveState']) {
    for (const file of ['session.json', '.aioson/context/session.json', '.aioson/runtime', '.aioson/runtime/../session.json', '.aioson/runtimes/session.json', path.join(outside, 'session.json')]) {
      const open = opener(fakePage());
      const report = await runWalkthrough({ targetDir: root, script: script([{ do: 'goto', url: '/' }]), url: 'http://127.0.0.1:4100', [flag]: file, env: {}, open, clock: fastClock, persist: false });
      assert.equal(report.error, 'state_path_outside_runtime', `${flag}=${file}`);
      assert.equal(open.calls.length, 0, `${flag}=${file}: refused before the browser`);
      assert.equal(fsSync.existsSync(path.join(root, 'session.json')), false);
    }
  }
});

test('a link under .aioson/runtime/ cannot carry the state file out', async (t) => {
  const root = await project(t);
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-walk-outside-'));
  t.after(() => fs.rm(outside, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, '.aioson/runtime'), { recursive: true });
  try {
    await fs.symlink(outside, path.join(root, '.aioson/runtime/link'), 'junction');
  } catch {
    t.skip('this machine does not allow links');
    return;
  }
  const open = opener(fakePage());
  const report = await runWalkthrough({ targetDir: root, script: script([{ do: 'goto', url: '/' }]), url: 'http://127.0.0.1:4100', saveState: '.aioson/runtime/link/session.json', env: {}, open, clock: fastClock, persist: false });
  assert.equal(report.error, 'state_path_outside_runtime');
  assert.equal(open.calls.length, 0);
});

test('--save-state keeps the session of a passing run, and the report holds only the path', async (t) => {
  const root = await project(t);
  const report = await runWalkthrough({ targetDir: root, script: script(), scriptPath: 'walk.json', url: 'http://127.0.0.1:4100', saveState: STATE, slug: 'orders', env, open: opener(fakePage()), clock: fastClock });
  assert.equal(report.ok, true, JSON.stringify(report.steps.filter((step) => !step.ok)));
  assert.deepEqual(report.session_state, { loaded: '', saved: STATE });
  assert.match(await fs.readFile(path.join(root, STATE), 'utf8'), /live-cookie-value/);
  assert.match(report.replay, /--save-state=\.aioson\/runtime\/browser-state\/owner\.json/);

  const written = await fs.readFile(path.join(root, report.report_path), 'utf8');
  assert.doesNotMatch(written, /live-cookie-value/, 'the session stays in its own file');
  const markdown = await fs.readFile(path.join(root, report.markdown_path), 'utf8');
  assert.doesNotMatch(markdown, /live-cookie-value/);
  assert.match(markdown, /- Session saved to: \.aioson\/runtime\/browser-state\/owner\.json/);
});

test('a failed run saves no session', async (t) => {
  const root = await project(t);
  const steps = [{ do: 'goto', url: '/' }, { do: 'expect', text: 'Never there', timeout: 1 }];
  const report = await runWalkthrough({ targetDir: root, script: script(steps, { timeout: 5 }), url: 'http://127.0.0.1:4100', saveState: STATE, env: {}, open: opener(fakePage()), clock: fastClock, persist: false });
  assert.equal(report.ok, false);
  assert.equal(fsSync.existsSync(path.join(root, STATE)), false);
  assert.equal(report.session_state.saved, '');
  assert.match(report.warnings.join('\n'), /session state not saved: the run did not pass/);
});

test('--state starts the run in the saved session, and a bad file is named before the browser', async (t) => {
  const root = await project(t);
  const plain = script([{ do: 'goto', url: '/' }]);
  const run = (open) => runWalkthrough({ targetDir: root, script: plain, url: 'http://127.0.0.1:4100', state: STATE, env: {}, open, clock: fastClock, persist: false });

  const absent = opener(fakePage());
  assert.equal((await run(absent)).error, 'state_not_found');
  assert.equal(absent.calls.length, 0);

  await fs.mkdir(path.dirname(path.join(root, STATE)), { recursive: true });
  await fs.writeFile(path.join(root, STATE), 'not json');
  const broken = opener(fakePage());
  assert.equal((await run(broken)).error, 'state_invalid');
  assert.equal(broken.calls.length, 0);
  await fs.writeFile(path.join(root, STATE), '{"cookies":"x"}');
  assert.equal((await run(opener(fakePage()))).error, 'state_invalid');

  await fs.writeFile(path.join(root, STATE), JSON.stringify({ cookies: [], origins: [] }));
  const good = opener(fakePage());
  const report = await run(good);
  assert.equal(report.ok, true);
  assert.equal(good.calls[0].storageState, path.join(root, STATE));
  assert.deepEqual(report.session_state, { loaded: STATE, saved: '' });
  assert.match(report.replay, /--state=\.aioson\/runtime\/browser-state\/owner\.json/);
});

test('a login wall under --state points at the expired session', async (t) => {
  const root = await project(t);
  await fs.mkdir(path.dirname(path.join(root, STATE)), { recursive: true });
  await fs.writeFile(path.join(root, STATE), JSON.stringify({ cookies: [], origins: [] }));
  const page = fakePage();
  page.state.redirect = 'http://127.0.0.1:4100/login';
  const report = await runWalkthrough({ targetDir: root, script: script([{ do: 'goto', url: '/orders' }]), url: 'http://127.0.0.1:4100', state: STATE, env: {}, open: opener(page), clock: fastClock, persist: false });
  assert.match(report.warnings.join('\n'), /may have expired, so run the login walkthrough with --save-state again/);
});

test('--cdp refuses both state flags, however it was asked for', async (t) => {
  const root = await project(t);
  await fs.mkdir(path.dirname(path.join(root, STATE)), { recursive: true });
  await fs.writeFile(path.join(root, STATE), JSON.stringify({ cookies: [], origins: [] }));
  const plain = script([{ do: 'goto', url: '/' }]);
  const base = { targetDir: root, script: plain, url: 'http://127.0.0.1:4100', clock: fastClock, persist: false };
  for (const [flag, value] of [['state', STATE], ['saveState', STATE]]) {
    for (const how of [{ cdp: '9222', env: {} }, { env: { AIOSON_BROWSER_CDP: '9222' } }, { env: {}, config: { browser: { cdp: '9222' } } }]) {
      const open = opener(fakePage());
      const report = await runWalkthrough({ ...base, ...how, [flag]: value, open });
      assert.equal(report.error, 'state_with_cdp', JSON.stringify(how));
      assert.match(report.hint, /operator's own session/);
      assert.equal(open.calls.length, 0);
    }
  }
  // Without the flags, an attached browser works as it did.
  const open = opener(fakePage());
  assert.equal((await runWalkthrough({ ...base, cdp: '9222', env: {}, open })).ok, true);
  assert.equal(open.calls[0].storageState, undefined);
});

test('the runtime folder is ignored by the installer policy, and a project that tracks it is refused', async (t) => {
  const root = await project(t);
  execFileSync('git', ['init', '-q'], { cwd: root, stdio: 'ignore' });
  const plain = script([{ do: 'goto', url: '/' }]);
  const run = () => runWalkthrough({ targetDir: root, script: plain, url: 'http://127.0.0.1:4100', saveState: STATE, env: {}, open: opener(fakePage()), clock: fastClock, persist: false });

  const refused = await run();
  assert.equal(refused.error, 'state_path_not_ignored', 'git would track a session file');
  assert.match(refused.hint, /aioson update/);

  await ensureProjectGitignorePolicy(root);
  assert.match(await fs.readFile(path.join(root, '.gitignore'), 'utf8'), /^\.aioson\/runtime\/$/m);
  assert.equal((await run()).ok, true);
  assert.equal(fsSync.existsSync(path.join(root, STATE)), true);
  assert.equal(execFileSync('git', ['status', '--short', '--', '.aioson/runtime'], { cwd: root, encoding: 'utf8' }).trim(), '', 'the session file stays out of git');
});

test('browser:run passes the flags and reports a refusal before any browser', async (t) => {
  const root = await project(t);
  await fs.writeFile(path.join(root, 'walk.json'), JSON.stringify({ name: 'walk', url: 'http://127.0.0.1:4100', steps: [{ do: 'goto', url: '/' }] }));
  const errors = [];
  const logger = { log() {}, error: (line) => errors.push(String(line)) };
  const t2 = (key, values = {}) => `${key} ${JSON.stringify(values)}`;
  const outside = await runBrowserRun({ args: [root], options: { script: 'walk.json', 'save-state': 'session.json', json: true }, logger, t: t2 });
  assert.equal(outside.error, 'state_path_outside_runtime');
  assert.equal((await runBrowserRun({ args: [root], options: { script: 'walk.json', state: true, json: true }, logger, t: t2 })).error, 'state_path_missing');
  assert.equal((await runBrowserRun({ args: [root], options: { script: 'walk.json', state: STATE, cdp: '9222', json: true }, logger, t: t2 })).error, 'state_with_cdp');
});

test('the doc keeps the real-account rule and explains the exception', async () => {
  const root = path.resolve(__dirname, '..');
  for (const rel of ['template/.aioson/docs/qa/browser-walkthrough.md', '.aioson/docs/qa/browser-walkthrough.md']) {
    const doc = await fs.readFile(path.join(root, rel), 'utf8');
    assert.match(doc, /For a real account, attach to the operator's signed-in browser with `--cdp` — never script credentials, never read them from chat, config, or source\./);
    assert.match(doc, /## A test account and a reused session/);
    assert.match(doc, /Nothing here applies to a real account/);
  }
  for (const rel of ['template/.aioson/docs/dev/phase-loop.md', '.aioson/docs/dev/phase-loop.md']) {
    assert.match(await fs.readFile(path.join(root, rel), 'utf8'), /A `Runtime` line is a walkthrough under `\.aioson\/qa\/walkthroughs\/\{slug\}\/`/);
  }
  assert.match(await fs.readFile(path.join(root, 'template/.aioson/skills/process/aioson-spec-driven/references/planner.md'), 'utf8'), /runtime_without_walkthrough/);
});
