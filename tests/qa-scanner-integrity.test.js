'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const loader = require('../src/lib/playwright-loader');
const sessions = require('../src/lib/browser-session');

async function runCommand(t, mode, fixture = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-scanner-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, 'aios-qa.config.json'), JSON.stringify({ url: fixture.url || 'http://localhost:3000', personas: fixture.personas || ['hacker'], feature: fixture.feature }));
  if (fixture.before) await fixture.before(root);
  if (fixture.prd) {
    const dir = path.join(root, '.aioson/context');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, fixture.feature ? `prd-${fixture.feature}.md` : 'prd.md'), fixture.prd);
  }
  for (const report of fixture.reports || []) {
    const dir = path.join(root, '.aioson/context/features', report.folder, 'browser');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'walk.json'), JSON.stringify({ schema: 1, scope: 'delivery', feature: report.folder, finished_at: '2099-01-01T00:00:00Z', target: { url: 'http://localhost:3000' }, ...report }));
  }
  const page = new EventEmitter();
  let current = 'http://localhost:3000';
  let closed = false;
  // What the fake browser was asked to do: every navigation, every API
  // request, every screenshot and every form the page itself submitted.
  Object.assign(page, { gotos: [], requests: [], shots: [], submitted: [] });
  const sensitive = (url) => fixture.sensitiveBody !== undefined && (!fixture.sensitivePaths || fixture.sensitivePaths.includes(new URL(url).pathname));
  Object.assign(page, {
    goto: async (url) => {
      current = url;
      page.gotos.push(url);
      if (fixture.navigationError || (fixture.failedRoute && url.includes(fixture.failedRoute))) throw new Error('Timeout with secret=do-not-export');
      if (fixture.sensitiveError && new URL(url).pathname === '/.env') throw new Error('Request failed: secret=do-not-export');
      const found = sensitive(url) || new URL(url).pathname === '/' || (fixture.okPaths || []).includes(new URL(url).pathname);
      return { status: () => fixture.httpStatus || (found ? 200 : 404), text: async () => (sensitive(url) ? fixture.sensitiveBody : '') };
    },
    // Playwright's APIRequestContext: answers without navigating the page.
    request: {
      get: async (url, options) => {
        page.requests.push({ url, options });
        const location = fixture.redirect ? fixture.redirect(new URL(url)) : null;
        return { status: () => (location ? 302 : 200), headers: () => (location ? { location } : {}) };
      }
    },
    url: () => current,
    title: async () => 'Fixture',
    close: async () => {},
    content: async () => {
      if (fixture.contentError) throw new Error('Read failed: secret=do-not-export');
      return fixture.html || '<html lang="en"><body></body></html>';
    },
    $$eval: async () => {
      if (fixture.discoveryError) throw new Error('Link enumeration failed');
      return fixture.links || [];
    },
    $$: async (selector) => (selector === 'form' ? fixture.forms || [] : []),
    $: async () => null,
    screenshot: async (options) => { page.shots.push(options); },
    keyboard: { press: async () => {} },
    waitForTimeout: async () => {},
    evaluate: async (fn, arg) => {
      if (fixture.evaluateError) throw new Error('Context destroyed: secret=do-not-export');
      return vm.runInNewContext(`(${fn.toString()})(arg)`, {
        arg,
        window: { innerWidth: 1280, ...(fixture.globals || {}) },
        performance: { getEntriesByType: (type) => type === 'navigation' ? [{ domContentLoadedEventEnd: 10, loadEventEnd: 20, responseStart: 5, requestStart: 0 }] : [] },
        document: { body: { scrollWidth: fixture.scrollWidth || 1280 }, querySelectorAll: () => [], querySelector: () => ({}) },
        HTMLFormElement: { prototype: { submit() { page.submitted.push(this); } } }
      });
    }
  });
  // The mobile persona opens its own context; without `mobile` the fake
  // browser has none, which is the existing "mobile unavailable" case.
  const browser = fixture.mobile ? { newContext: async () => ({ newPage: async () => page, close: async () => {} }) } : {};
  t.mock.method(loader, 'loadPlaywright', () => ({}));
  t.mock.method(sessions, 'openBrowser', async () => ({ ok: true, browser, newPage: async () => page, close: async () => { closed = true; } }));
  const file = require.resolve(`../src/commands/qa-${mode}`);
  delete require.cache[file];
  t.after(() => { delete require.cache[file]; });
  const command = require(file)[mode === 'scan' ? 'runQaScan' : 'runQaRun'];
  const result = await command({ args: [root], options: { json: true, html: true, ...(fixture.options || {}) }, logger: { log() {}, warn() {}, error() {} }, t: (key) => key });
  assert.equal(closed, true);
  return { result, page, root, json: JSON.parse(await fs.readFile(result.jsonPath, 'utf8')), md: await fs.readFile(result.mdPath, 'utf8') };
}

for (const mode of ['scan', 'run']) {
  test(`${mode}: public Stripe keys do not become secret findings in HTML or globals`, async (t) => {
    const key = 'pk_live_' + 'A'.repeat(24);
    const other = 'pk_test_' + 'B'.repeat(24);
    const { result } = await runCommand(t, mode, { html: `<script>SECRET='${key}'; TOKEN='${other}'</script>`, globals: { ENV: { STRIPE_KEY: key, TEST_KEY: other } } });
    assert.deepEqual(result.findings.filter((f) => /key|secret|token/i.test(f.title)), []);
  });

  test(`${mode}: secret and restricted Stripe keys remain detectable without exposing values`, async (t) => {
    const keys = ['sk_live_', 'sk_test_', 'rk_live_', 'rk_test_'].map((prefix) => prefix + 'C'.repeat(24));
    const { result } = await runCommand(t, mode, { html: keys.join(' '), globals: { ENV: { keys } } });
    for (const label of ['Stripe live secret key', 'Stripe test secret key', 'Stripe live restricted key', 'Stripe test restricted key']) {
      assert.ok(result.findings.some((f) => f.title.includes(label) && /HTML/.test(f.title)), label);
      assert.ok(result.findings.some((f) => f.title.includes(label) && /window/.test(f.title)), label);
    }
    for (const key of keys) assert.ok(!JSON.stringify(result).includes(key));
    if (mode === 'scan') {
      assert.equal(result.execution_complete, true, 'finding severity is separate from execution completeness');
      assert.ok(result.probe_results.some((row) => row.status === 'failed' && row.finding_ids.length));
    }
  });

  test(`${mode}: public Stripe configuration alone is not a sensitive-file leak`, async (t) => {
    const publicKey = 'pk_live_' + 'D'.repeat(24);
    const { result } = await runCommand(t, mode, { sensitiveBody: `STRIPE_PUBLIC_KEY=${publicKey}` });
    assert.deepEqual(result.findings.filter((f) => /Sensitive file/.test(f.title)), []);
  });

  test(`${mode}: a public key never hides neighboring credentials or other provider patterns`, async (t) => {
    const publicKey = 'pk_test_' + 'P'.repeat(24);
    const privateKey = 'sk_live_' + 'S'.repeat(24);
    const config = `STRIPE_PUBLIC_KEY=${publicKey}; PASSWORD=${privateKey}`;
    const html = 'sk-' + 'O'.repeat(24) + ' ghp_' + 'G'.repeat(36);
    const { result } = await runCommand(t, mode, { html, sensitiveBody: config, globals: { ENV: { credential: 'secret=' + 'z'.repeat(24) } } });
    assert.ok(result.findings.some((f) => /Sensitive file/.test(f.title)));
    assert.ok(result.findings.some((f) => /OpenAI key/.test(f.title)));
    assert.ok(result.findings.some((f) => /GitHub token/.test(f.title)));
    assert.ok(result.findings.some((f) => /Generic secret exposed in window/.test(f.title)), 'case-insensitive flag survives browser serialization');
    assert.ok(!JSON.stringify(result).includes(privateKey));
  });

  test(`${mode}: a bare private Stripe key in a sensitive endpoint is still a leak`, async (t) => {
    const { result } = await runCommand(t, mode, { sensitiveBody: 'rk_live_' + 'R'.repeat(24) });
    assert.ok(result.findings.some((f) => /Sensitive file/.test(f.title)));
  });
}

test('scan: failed navigation is incomplete in command, JSON, Markdown and HTML', async (t) => {
  const { result, json, md, root } = await runCommand(t, 'scan', { navigationError: true });
  assert.equal(result.execution_complete, false);
  assert.equal(json.routes_scanned, 0);
  assert.equal(json.routes_discovered, 1);
  assert.ok(json.limitations.some((row) => row.probe === 'navigation'));
  assert.match(md, /INCOMPLETE/);
  assert.match(await fs.readFile(result.htmlPath, 'utf8'), /INCOMPLETE/);
  const index = await fs.readFile(path.join(root, 'reports/index.html'), 'utf8');
  assert.match(index, /INCOMPLETE/);
  assert.doesNotMatch(index, /&#x2713; Clean/);
  assert.doesNotMatch(JSON.stringify(json), /do-not-export/);
});

for (const [name, fixture] of [['http', { httpStatus: 503 }], ['content', { contentError: true }], ['evaluate', { evaluateError: true }]]) {
  test(`scan: ${name} failure cannot become a clean completed route`, async (t) => {
    const { result, json } = await runCommand(t, 'scan', fixture);
    assert.equal(result.execution_complete, false);
    assert.equal(json.routes_scanned, 0);
    assert.ok(json.probe_results.some((row) => row.status === 'unavailable'));
    assert.doesNotMatch(JSON.stringify(json), /do-not-export/);
  });
}

test('scan: successful execution records explicit non-applicability and cleans console listeners', async (t) => {
  const { result, json, page } = await runCommand(t, 'scan');
  assert.equal(result.execution_complete, true);
  assert.equal(json.routes_scanned, 1);
  assert.deepEqual(json.limitations, []);
  assert.ok(json.probe_results.some((row) => row.status === 'executed'));
  assert.ok(json.probe_results.some((row) => row.probe === 'global_secrets' && row.status === 'not_applicable'));
  assert.equal(page.listenerCount('console'), 0);
});

for (const [name, fixture] of [['discovery', { discoveryError: true }], ['sensitive_file', { sensitiveError: true }]]) {
  test(`scan: ${name} failure remains visible even if the root route was scanned`, async (t) => {
    const { result } = await runCommand(t, 'scan', fixture);
    assert.equal(result.routesScanned, 1);
    assert.equal(result.execution_complete, false);
    assert.ok(result.limitations.some((row) => row.probe === name));
  });
}

test('scan: mixed routes preserve completed work and unavailable targets separately', async (t) => {
  const { result, page } = await runCommand(t, 'scan', { links: ['http://localhost:3000/down'], failedRoute: '/down' });
  assert.equal(result.routesDiscovered, 2);
  assert.equal(result.routesScanned, 1);
  assert.equal(result.execution_complete, false);
  assert.equal(page.listenerCount('console'), 0);
});

for (const [name, fixture] of [['navigation', { navigationError: true }], ['http', { httpStatus: 503 }], ['content', { contentError: true }], ['evaluate', { evaluateError: true }], ['sensitive', { sensitiveError: true }], ['mobile', { personas: ['mobile'] }]]) {
  test(`run: ${name} failure is explicit in every report`, async (t) => {
    const { result, json, md } = await runCommand(t, 'run', fixture);
    assert.equal(result.execution_complete, false);
    assert.equal(json.execution_complete, false);
    assert.ok(json.limitations.length > 0);
    assert.match(md, /INCOMPLETE/);
    assert.match(await fs.readFile(result.htmlPath, 'utf8'), /INCOMPLETE/);
    assert.doesNotMatch(JSON.stringify(json), /do-not-export/);
    assert.ok(result.probe_results.some((row) => row.probe === 'performance'), 'later probes still run');
  });
}

test('run: completed probes remain complete even when findings exist', async (t) => {
  const { result } = await runCommand(t, 'run', { html: 'sk_live_' + 'Q'.repeat(24) });
  assert.equal(result.execution_complete, true);
  assert.ok(result.probe_results.some((row) => row.status === 'failed' && row.finding_ids.length));
});

test('report: regenerated HTML retains incomplete scan execution', async (t) => {
  const { root } = await runCommand(t, 'scan', { navigationError: true });
  const { runQaReport } = require('../src/commands/qa-report');
  const result = await runQaReport({ args: [root], options: { html: true }, logger: { log() {}, error() {} }, t: (key) => key });
  assert.equal(result.ok, true);
  assert.match(await fs.readFile(result.htmlPath, 'utf8'), /INCOMPLETE/);
  assert.match(await fs.readFile(path.join(root, 'reports/index.html'), 'utf8'), /INCOMPLETE/);
});

function criteriaPrd(count = 25) {
  return '# PRD\n\n## Acceptance Criteria\n| AC | CAP | Observable behavior | Evidence |\n|---|---|---|---|\n' + Array.from({ length: count }, (_, i) => `| AC-example-${i + 1} | CAP-example | User action ${i + 1} reaches persistence | node test-${i + 1}.js |`).join('\n');
}

test('run: semantic ACs beyond twenty use only the configured feature evidence', async (t) => {
  const { result } = await runCommand(t, 'run', { feature: 'current', prd: criteriaPrd(), personas: [], reports: [
    { folder: 'unrelated', ids: { 'AC-example-1': { status: 'pass', steps: [0] } } },
    { folder: 'current', ids: { 'AC-example-25': { status: 'pass', steps: [0] } } }
  ] });
  assert.equal(result.acCoverage.length, 25);
  assert.equal(result.acCoverage.find((row) => row.id === 'AC-example-1').status, 'Not exercised');
  assert.equal(result.acCoverage.find((row) => row.id === 'AC-example-25').status, 'Covered');
  assert.equal(result.feature, 'current');
});

for (const [name, report] of [['owner', { feature: 'wrong' }], ['target', { target: { url: 'http://localhost:9999' } }], ['stale', { finished_at: '2000-01-01T00:00:00Z' }]]) {
  test(`run: ${name} mismatch cannot prove an AC`, async (t) => {
    const { result } = await runCommand(t, 'run', { feature: 'current', prd: criteriaPrd(1), personas: [], reports: [
      { folder: 'current', ids: { 'AC-example-1': { status: 'pass', steps: [0] } }, ...report }
    ] });
    assert.equal(result.acCoverage[0].status, 'Not exercised');
  });
}

test('run: legacy PRD does not borrow a walkthrough from another feature', async (t) => {
  const { result } = await runCommand(t, 'run', { prd: '| AC-01 | Save a record |', personas: [], reports: [
    { folder: 'unrelated', ids: { 'AC-01': { status: 'pass', steps: [0] } } }
  ] });
  assert.equal(result.acCoverage[0].status, 'Not exercised');
});

test('run: a recovered probe error keeps neighboring findings and later probes', async (t) => {
  const { result } = await runCommand(t, 'run', { html: 'sk_live_' + 'V'.repeat(24), evaluateError: true });
  assert.equal(result.execution_complete, false);
  const secrets = result.probe_results.find((row) => row.probe === 'exposed_secrets');
  assert.equal(secrets.status, 'unavailable');
  assert.ok(secrets.finding_ids.length > 0);
  assert.ok(result.probe_results.some((row) => row.probe === 'debug_routes'));
});

test('report: real CLI regenerates incomplete HTML from persisted scanner JSON', async (t) => {
  const { root } = await runCommand(t, 'scan', { navigationError: true });
  const { execFileSync } = require('node:child_process');
  const output = execFileSync(process.execPath, [path.resolve(__dirname, '../bin/aioson.js'), 'qa:report', root, '--html'], { encoding: 'utf8', windowsHide: true });
  assert.match(output, /html/i);
  const reportsDir = path.join(root, 'reports');
  const folders = await fs.readdir(reportsDir, { withFileTypes: true });
  for (const folder of folders.filter((entry) => entry.isDirectory())) {
    assert.match(await fs.readFile(path.join(reportsDir, folder.name, 'index.html'), 'utf8'), /INCOMPLETE/);
  }
});

// ---------------------------------------------------------------------------
// Review findings of 2026-09-10 — each test replays the reported defect.
// ---------------------------------------------------------------------------

const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const navigated = (result) => result.probe_results.filter((row) => row.probe === 'navigation').map((row) => row.target).sort();

test('scan: a base URL with a trailing slash scans its root instead of reading zero routes as COMPLETE', async (t) => {
  // The form Vite prints (http://localhost:5173/): discovered URLs lost their
  // slash, the base kept it, so the root never passed the scope check.
  const { result, page } = await runCommand(t, 'scan', { url: 'http://localhost:3000/' });
  assert.equal(result.routesDiscovered, 1);
  assert.equal(result.routesScanned, 1);
  assert.equal(result.execution_complete, true);
  assert.ok(page.gotos.includes('http://localhost:3000/.env'));
  assert.ok(!page.gotos.some((url) => url.includes('//.env')), 'sensitive files are probed at /.env, not //.env');
});

test('scan: a crawl that scanned no route is INCOMPLETE by name, even when every probe that ran was clean', async (t) => {
  const { result, json, md } = await runCommand(t, 'scan', { options: { 'max-pages': '-1' } });
  assert.equal(result.routesScanned, 0);
  assert.equal(result.execution_complete, false);
  assert.ok(json.limitations.some((row) => row.reason === 'no_route_scanned'));
  assert.match(md, /INCOMPLETE/);
});

test('execution: a run in which no probe executed proves nothing', () => {
  const { summarizeProbes } = require('../src/lib/qa-probe-results');
  // Exactly what a 1.65.0 trailing-slash scan persisted: seven absent files, no route.
  const skipped = [{ probe: 'sensitive_file', target: 'http://localhost:3000//.env', status: 'not_applicable', reason: 'resource_absent' }];
  assert.equal(summarizeProbes(skipped).execution_complete, false);
  assert.equal(summarizeProbes([]).execution_complete, false);
  assert.equal(summarizeProbes([...skipped, { probe: 'navigation', target: 'http://localhost:3000', status: 'executed' }]).execution_complete, true);
});

test('scan: crawl scope is the parsed origin, never a string prefix of it', async (t) => {
  const links = [
    'http://127.0.0.1:43171/', // another local service whose port starts with 4317
    'http://127.0.0.1:4317@localhost:43172/', // userinfo: the host is localhost:43172
    'http://operator@127.0.0.1:4317/admin' // credentials the operator never configured
  ];
  const { result, page } = await runCommand(t, 'scan', { url: 'http://127.0.0.1:4317', links, html: '<p>' + 'sk_live_' + 'B'.repeat(24) + '</p>' });
  assert.deepEqual(navigated(result), ['http://127.0.0.1:4317']);
  assert.ok(!page.gotos.some((url) => /43171|43172|operator@/.test(url)), page.gotos.join('\n'));
  assert.ok(result.findings.length > 0 && result.findings.every((f) => new URL(f.location).host === '127.0.0.1:4317'), 'no other origin is blamed on the target');
});

test('scan: a base path scopes the crawl to that path segment, not to every path sharing its letters', async (t) => {
  const links = ['http://127.0.0.1:4317/app/orders', 'http://127.0.0.1:4317/application', 'http://127.0.0.1:4317/'];
  const { result } = await runCommand(t, 'scan', { url: 'http://127.0.0.1:4317/app', links, okPaths: ['/app', '/app/orders'] });
  assert.deepEqual(navigated(result), ['http://127.0.0.1:4317/app', 'http://127.0.0.1:4317/app/orders']);
  assert.equal(result.execution_complete, true);
});

test('run: open redirect is read from the app\'s own 30x, never by navigating to the external host', async (t) => {
  // A navigation went to the external host (unresolvable -> unavailable), could
  // not see the 30x it had already followed, and broke the next probe.
  const { result, page } = await runCommand(t, 'run', { redirect: (url) => url.searchParams.get('next') });
  assert.ok(result.findings.some((f) => f.title === 'Open redirect via ?next= parameter'));
  assert.equal(result.probe_results.find((row) => row.probe === 'open_redirect').status, 'failed');
  assert.ok(page.requests.length > 0 && page.requests.every((request) => request.options.maxRedirects === 0));
  assert.ok(!page.gotos.some((url) => /evil-phishing|[?&](?:redirect|next)=/.test(url)), page.gotos.join('\n'));
  assert.equal(result.probe_results.find((row) => row.probe === 'injection_inputs').status, 'executed');
});

test('run: a redirect is judged by the host it leads to', async (t) => {
  const local = await runCommand(t, 'run', { redirect: (url) => (url.searchParams.get('next') ? '/dashboard' : null) });
  assert.ok(!local.result.findings.some((f) => /Open redirect/.test(f.title)));
  assert.equal(local.result.probe_results.find((row) => row.probe === 'open_redirect').status, 'executed');
});

test('run: a protocol-relative Location that leaves the app is an open redirect', async (t) => {
  const { result } = await runCommand(t, 'run', { redirect: (url) => (url.searchParams.get('goto') ? '//evil-phishing-example.com/login' : null) });
  assert.ok(result.findings.some((f) => f.title === 'Open redirect via ?goto= parameter'));
});

for (const personas of [['hacker', 'mobile'], ['mobile']]) {
  test(`run: no finding screenshots a page that carries a secret (${personas.join(' + ')})`, async (t) => {
    // The mobile overflow finding captured the page whose secret finding had
    // just been refused a screenshot, and --html embedded the key as base64.
    const key = 'sk_live_' + 'M'.repeat(24);
    const { result, page } = await runCommand(t, 'run', { personas, mobile: true, scrollWidth: 2000, html: `<html lang="en"><body><pre>${key}</pre></body></html>` });
    const overflow = result.findings.find((f) => /Horizontal overflow/.test(f.title));
    assert.ok(overflow, 'the overflow finding itself is still reported');
    assert.equal(overflow.screenshot, '');
    assert.deepEqual(page.shots, []);
  });
}

test('run: a page without a secret keeps its finding screenshot', async (t) => {
  const { result, page } = await runCommand(t, 'run', { personas: ['mobile'], mobile: true, scrollWidth: 2000 });
  const overflow = result.findings.find((f) => /Horizontal overflow/.test(f.title));
  assert.equal(page.shots.length, 1);
  assert.equal(overflow.screenshot, path.join(result.screenshotsDir, `${overflow.id}.png`));
});

test('run: a stale capture from an earlier run can never attach to a new finding', async (t) => {
  // A leftover C-01.png was embedded for an unrelated new C-01: the report
  // looked captures up by finding ID and nothing cleared the folder.
  const before = async (root) => {
    await fs.mkdir(path.join(root, 'aios-qa-screenshots'), { recursive: true });
    await fs.writeFile(path.join(root, 'aios-qa-screenshots', 'C-01.png'), PNG_1PX);
  };
  const { result, root } = await runCommand(t, 'run', { before, html: '<p>' + 'sk_live_' + 'N'.repeat(24) + '</p>' });
  assert.ok(result.findings.some((f) => f.id === 'C-01'));
  assert.deepEqual(await fs.readdir(path.join(root, 'aios-qa-screenshots')), []);
  assert.doesNotMatch(await fs.readFile(result.htmlPath, 'utf8'), /alt="screenshot C-01"/);
});

test('report: the HTML embeds only the capture a finding recorded, and only from the screenshot folder', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-qa-html-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const shots = path.join(root, 'aios-qa-screenshots');
  await fs.mkdir(shots, { recursive: true });
  for (const file of [path.join(shots, 'C-01.png'), path.join(shots, 'H-02.png'), path.join(root, 'outside.png')]) await fs.writeFile(file, PNG_1PX);
  const { writeHtmlReport } = require('../src/qa-html-report');
  const base = { severity: 'high', category: 'security', location: 'x', risk: 'r', fix: 'f' };
  const findings = [
    { ...base, id: 'C-01', title: 'refused capture', screenshot: '' },
    { ...base, id: 'H-02', title: 'recorded capture', screenshot: path.join(shots, 'H-02.png') },
    { ...base, id: 'M-03', title: 'capture outside the folder', screenshot: path.join(root, 'outside.png') }
  ];
  const acCoverage = [{ id: 'C-01', description: 'd', status: 'Covered', screenshot: '' }];
  const { htmlPath } = await writeHtmlReport(root, 'Fixture', 'http://127.0.0.1:3000', findings, acCoverage, null, 'run', shots, {});
  const html = await fs.readFile(htmlPath, 'utf8');
  assert.match(html, /alt="screenshot H-02"/);
  assert.doesNotMatch(html, /alt="screenshot C-01"/);
  assert.doesNotMatch(html, /alt="screenshot M-03"/);
  assert.doesNotMatch(html, /id="ac-shot-C-01"/);
});

for (const mode of ['scan', 'run']) {
  test(`${mode}: secrets in JSON-serialized globals are detected — the only shape the in-page scan sees`, async (t) => {
    // JSON.stringify puts a quote between every key and its colon; the generic
    // pattern needed the colon right after the key and matched none of these.
    const value = 'fake' + '-value-' + 'q'.repeat(16);
    const globals = { __NEXT_DATA__: { props: { DATABASE_PASSWORD: value } }, __env__: { API_SECRET: value }, ENV: { AUTH_TOKEN: value } };
    const { result } = await runCommand(t, mode, { globals });
    for (const source of ['__NEXT_DATA__', '__env__', 'ENV']) {
      assert.ok(result.findings.some((f) => f.title === `Generic secret exposed in window.${source}`), source);
    }
    assert.ok(!JSON.stringify(result).includes(value));
  });

  test(`${mode}: a 100K sensitive-file body is classified in linear time`, async (t) => {
    // The public-key strip and the KEY= heuristic both backtracked
    // quadratically: 80K word characters held the event loop ~16 s per file.
    const started = Date.now();
    const { result } = await runCommand(t, mode, { sensitiveBody: 'A'.repeat(100000) + '\nPORT=3000', sensitivePaths: ['/.env'] });
    const elapsed = Date.now() - started;
    assert.ok(elapsed < 5000, `took ${elapsed} ms`);
    assert.ok(result.findings.some((f) => /Sensitive file/.test(f.title)), 'the KEY= heuristic still reads the body');
  });
}

test('run: an AC the walkthrough never reached is not exercised', async (t) => {
  // rollupUnreached writes `not_reached` for the steps after a stop; it was
  // read as Partial and summed "AC exercised by walkthroughs: 2/2".
  const { result, md } = await runCommand(t, 'run', { feature: 'current', prd: criteriaPrd(2), personas: [], reports: [
    { folder: 'current', ids: { 'AC-example-1': { status: 'pass', steps: [0] }, 'AC-example-2': { status: 'not_reached', steps: [3] } } }
  ] });
  assert.deepEqual(result.acCoverage.map((row) => row.status), ['Covered', 'Not exercised']);
  assert.match(md, /AC exercised by walkthroughs: 1\/2/);
});

test('run: a form whose submit control is named "submit" is still submitted by the naive persona', async (t) => {
  // <input type="submit" name="submit"> shadows form.submit on ordinary pages;
  // the unguarded f.submit() threw and marked persona_naive unavailable.
  const { result, page } = await runCommand(t, 'run', { personas: ['naive'], forms: [{ submit: { tagName: 'INPUT', name: 'submit' } }] });
  assert.equal(result.probe_results.find((row) => row.probe === 'persona_naive').status, 'executed');
  assert.equal(page.submitted.length, 1);
});

test('docs: the QA reference documents the execution fields and no longer promises per-AC screenshots', async () => {
  const doc = await fs.readFile(path.resolve(__dirname, '../docs/en/5-reference/qa-browser.md'), 'utf8');
  assert.doesNotMatch(doc, /For each AC, a screenshot is taken/);
  for (const field of ['execution_complete', 'probe_results', 'limitations', 'routes_discovered', 'ac_coverage_gaps']) {
    assert.match(doc, new RegExp(`\`${field}\``), field);
  }
  for (const prefix of ['template/.aioson', '.aioson']) {
    const playbook = await fs.readFile(path.resolve(__dirname, '..', prefix, 'docs/pentester/browser-dast-playbook.md'), 'utf8');
    assert.match(playbook, /`execution_complete: false`[^\n]*`limitations`[^\n]*`not_tested`/, prefix);
  }
});
