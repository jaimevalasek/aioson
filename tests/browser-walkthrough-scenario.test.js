'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { normalizeScript, runWalkthrough } = require('../src/lib/browser-walkthrough');
const { maskPersonalData, getPath } = require('../src/lib/browser-walkthrough/scenario');
const { applyDecision, validateJudgmentSpec } = require('../src/lib/jev-judgment');

async function tmp() { return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-scenario-')); }

// The Playwright `Page` surface the runner touches, with a static aria tree.
function fakePage({ elements = {}, url = 'http://127.0.0.1:3000/', aria = '- main' } = {}) {
  const trace = [];
  const state = { url, elements: { ...elements }, aria };
  const locator = (key) => {
    const el = () => state.elements[key] || null;
    const api = {
      click: async () => { trace.push(`click:${key}`); if (!el()) throw new Error(`locator "${key}" not found`); },
      fill: async (value) => { trace.push(`fill:${key}=${value}`); if (!el()) throw new Error(`locator "${key}" not found`); el().value = value; },
      isVisible: async () => Boolean(el()),
      allTextContents: async () => (el() ? [el().text || ''] : []),
      textContent: async () => (el() ? el().text || '' : null),
      count: async () => (el() ? 1 : 0),
      waitFor: async () => { if (!el()) throw new Error(`locator "${key}" never appeared`); },
      first: () => api,
      last: () => api,
      nth: () => api,
      ariaSnapshot: async () => state.aria
    };
    return api;
  };
  const page = {
    trace,
    state,
    on: () => {},
    goto: async (target) => { trace.push(`goto:${target}`); state.url = target; },
    reload: async () => { trace.push('reload'); },
    url: () => state.url,
    title: async () => 'Chat',
    keyboard: { press: async () => {} },
    evaluate: async (expression) => expression,
    screenshot: async ({ path: file }) => { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, 'png'); },
    waitForLoadState: async () => {},
    getByRole: (role, options = {}) => locator(`role=${role}${options.name ? `[name=${options.name}]` : ''}`),
    getByText: (text) => locator(`text=${text}`),
    getByLabel: (label) => locator(`label=${label}`),
    getByPlaceholder: (p) => locator(`placeholder=${p}`),
    getByTestId: (id) => locator(`testid=${id}`),
    getByTitle: (t) => locator(`title=${t}`),
    getByAltText: (a) => locator(`alt=${a}`),
    locator: (css) => locator(css === 'body' ? 'body' : `css=${css}`)
  };
  return page;
}

function opener(page) {
  return async () => ({ ok: true, mode: 'bundled', label: 'fake', version: '1', newPage: async () => page, close: async () => {} });
}

// A fetch that answers from a routing function and records every call.
function fakeFetch(route) {
  const calls = [];
  const impl = async (url, init = {}) => {
    const call = { url, method: init.method || 'GET', headers: init.headers || {}, body: init.body };
    calls.push(call);
    const answer = await route(call, calls);
    const text = typeof answer.body === 'string' ? answer.body : JSON.stringify(answer.body === undefined ? {} : answer.body);
    return { status: answer.status || 200, text: async () => text };
  };
  impl.calls = calls;
  return impl;
}

const fastClock = { now: () => Date.now(), wait: async () => {} };

async function run(root, raw, extra = {}) {
  const normalized = normalizeScript(raw);
  assert.equal(normalized.ok, true, normalized.errors.join('; '));
  return runWalkthrough({ targetDir: root, script: normalized.script, clock: fastClock, persist: false, env: {}, ...extra });
}

test('scripts validate request, judge, each and vars with step-precise errors', () => {
  const bad = normalizeScript({
    vars: { env: 'x' },
    steps: [
      { do: 'request' },
      { do: 'request', url: '/x', method: 'FETCH', status: 999, save: { run: 'id' } },
      { do: 'judge' },
      { do: 'judge', question: 'Is it fine?', type: 'score', criteria: ['bad', 'good'] },
      { do: 'judge', question: 'Which sector?', type: 'choice', criteria: { a: 'A', b: 'B' }, equals: 'c' },
      { do: 'each', steps: [] },
      { do: 'each', items: [1], steps: [{ do: 'each', items: [], steps: [{ do: 'reload' }] }] }
    ]
  });
  assert.equal(bad.ok, false);
  const text = bad.errors.join('\n');
  assert.match(text, /vars\.env: .*reserved/);
  assert.match(text, /step 0: request needs `url`/);
  assert.match(text, /step 1: request method must be one of/);
  assert.match(text, /step 1: request status must be an HTTP status/);
  assert.match(text, /step 1: save\.run is not a variable name/);
  assert.match(text, /step 2: judge needs `question`/);
  assert.match(text, /step 3: judge score needs min_score/);
  assert.match(text, /step 4: judge choice equals names an option that is not in criteria/);
  assert.match(text, /step 5: each needs `from` .* or `items`/);
  assert.match(text, /step 5: each needs a non-empty `steps` array/);
  assert.match(text, /step 6\.steps\[0\]: each cannot be nested/);

  const good = normalizeScript({ vars: { base: 'x' }, steps: [{ do: 'each', items: [1], ac: 'AC-01', steps: [{ do: 'reload', ac: 'AC-02' }] }] });
  assert.equal(good.ok, true, good.errors.join('; '));
  assert.deepEqual(good.script.vars, { base: 'x' });
  assert.deepEqual(good.script.steps[0].own_ids, ['AC-01']);
  assert.deepEqual(good.script.steps[0].ids, ['AC-01', 'AC-02']);
  assert.equal(good.script.steps[0].steps[0].index, 0);
});

test('paths read dotted and bracketed indexes; personal data is masked before a judge reads it', () => {
  assert.equal(getPath({ data: { items: [{ id: 'a' }, { id: 'b' }] } }, '$.data.items[1].id'), 'b');
  assert.equal(getPath([{ status: 'ok' }], '0.status'), 'ok');
  assert.equal(getPath({ a: 1 }, 'a.b'), undefined);
  const masked = maskPersonalData('Ana <ana.lima@example.com> (11) 92526-2700, CPF 123.456.789-09, plano 300 mega, R$ 99,90, 22/10/2026');
  assert.doesNotMatch(masked, /ana\.lima|92526|123\.456/);
  assert.match(masked, /\[email\].*\[number\].*CPF \[number\], plano 300 mega, R\$ 99,90, 22\/10\/2026/);
});

test('a request plays the outside system: polls, saves, feeds later steps, and proves the path from its entry', async () => {
  const root = await tmp();
  const page = fakePage();
  let checks = 0;
  const fetchImpl = fakeFetch((call) => {
    if (call.method === 'POST' && call.url.endsWith('/hook')) return { status: 202, body: { id: 'm1' } };
    if (call.url.endsWith('/status/m1')) {
      checks += 1;
      return { body: checks < 2 ? { state: 'pending' } : { state: 'done', column: 'financeiro' } };
    }
    return { status: 404, body: { error: 'not found' } };
  });
  const report = await run(root, {
    url: 'http://127.0.0.1:3000',
    steps: [
      { do: 'request', method: 'POST', url: '/hook', body: { text: 'segunda via', uid: '{{run.uid}}' }, status: 202, save: { message: 'id' }, ac: 'AC-01' },
      { do: 'request', url: '/status/{{message}}', poll: true, interval: 1, json: { state: 'done', column: '/financ/' }, ac: 'AC-01' },
      { do: 'goto', url: '/messages/{{message}}', ac: 'AC-02' }
    ]
  }, { fetchImpl, open: opener(page) });

  assert.equal(report.ok, true, JSON.stringify(report.steps.map((s) => s.error || s.detail)));
  const sent = JSON.parse(fetchImpl.calls[0].body);
  assert.equal(sent.text, 'segunda via');
  assert.match(sent.uid, /^\d{8}T\d{6}Z-[0-9a-f]{6}-1$/);
  assert.equal(fetchImpl.calls[0].headers['content-type'], 'application/json');
  assert.equal(report.steps[1].request.attempts, 2);
  assert.deepEqual(report.steps[0].request.saved, ['message']);
  assert.ok(page.trace.includes('goto:http://127.0.0.1:3000/messages/m1'));
  assert.equal(report.ids['AC-01'].status, 'pass');
  assert.equal(report.scenario.requests, 2);
  assert.match(report.smoke.trigger, /POST http:\/\/127\.0\.0\.1:3000\/hook → 202/);
  assert.match(report.smoke.boundary, /^request POST/);
});

test('a request only reaches loopback hosts or the walkthrough origin unless the step says external', async () => {
  const root = await tmp();
  const fetchImpl = fakeFetch(() => ({ body: { ok: true } }));
  const refused = await run(root, { url: 'http://127.0.0.1:3000', steps: [{ do: 'request', url: 'https://api.example.com/charge' }] }, { fetchImpl, open: opener(fakePage()) });
  assert.equal(refused.ok, false);
  assert.match(refused.steps[0].error, /refused: only loopback hosts and the walkthrough's own origin/);
  assert.equal(fetchImpl.calls.length, 0);

  const allowed = await run(root, { url: 'http://127.0.0.1:3000', steps: [{ do: 'request', url: 'https://api.example.com/charge', external: true, json: { ok: true } }] }, { fetchImpl, open: opener(fakePage()) });
  assert.equal(allowed.ok, true);
  assert.equal(fetchImpl.calls.length, 1);
});

test('secrets come from the environment or the project .env and never reach the report', async () => {
  const root = await tmp();
  await fs.writeFile(path.join(root, '.env'), 'PROVIDER_TOKEN=tok-secret-123456\n');
  const page = fakePage({ elements: { 'label=Key': {} }, aria: '- textbox "Key": sk-live-abcdef123456' });
  // The provider echoes what it received — the answer carries the secret too.
  const fetchImpl = fakeFetch((call) => {
    if (call.url.endsWith('/login')) return { body: { access_token: 'session-token-abcdef' } };
    if (call.url.endsWith('/me')) return { body: `signed in with ${call.headers.authorization}` };
    return { body: { received: JSON.parse(call.body), auth: call.headers.authorization } };
  });
  const normalized = normalizeScript({
    name: 'secrets',
    feature: 'checkout',
    url: 'http://127.0.0.1:3000',
    steps: [
      { do: 'fill', target: 'label=Key', value: '{{env.API_KEY}}' },
      { do: 'request', method: 'POST', url: '/hook', headers: { authorization: 'Bearer {{env.PROVIDER_TOKEN}}' }, body: { token: '{{env.PROVIDER_TOKEN}}' } },
      { do: 'snapshot' },
      { do: 'request', method: 'POST', url: '/login', body: { user: 'owner' }, save: { session: 'access_token' }, secret: true },
      { do: 'request', url: '/me', headers: { authorization: 'Bearer {{session}}' }, contains: 'signed in' },
      { do: 'request', url: '/missing/{{env.NOT_SET_ANYWHERE}}' }
    ]
  });
  assert.equal(normalized.ok, true, normalized.errors.join('; '));
  const report = await runWalkthrough({
    targetDir: root, script: normalized.script, clock: fastClock, env: { API_KEY: 'sk-live-abcdef123456' }, fetchImpl, open: opener(page)
  });

  assert.equal(fetchImpl.calls[0].headers.authorization, 'Bearer tok-secret-123456');
  assert.equal(report.steps[0].detail, 'filled label=Key with (masked)');
  assert.doesNotMatch(report.steps[1].value, /tok-secret-123456/);
  assert.deepEqual(report.steps[1].request.headers, ['authorization', 'content-type']);
  assert.match(report.steps[2].snapshot.preview, /\[env\.API_KEY\]/);
  assert.equal(fetchImpl.calls[2].headers.authorization, 'Bearer session-token-abcdef');
  assert.equal(report.steps[4].ok, true, report.steps[4].error);
  assert.equal(report.steps[4].value, 'signed in with Bearer [secret removed]');
  assert.match(report.steps[5].error, /\{\{env\.NOT_SET_ANYWHERE\}\} is not set in the environment or the project \.env/);
  assert.equal(report.persisted, true);
  for (const rel of [report.report_path, report.markdown_path]) {
    const written = await fs.readFile(path.join(root, rel), 'utf8');
    assert.doesNotMatch(written, /sk-live-abcdef123456|tok-secret-123456/, rel);
  }
  const artifacts = report.steps.flatMap((s) => s.artifacts);
  for (const rel of artifacts.filter((a) => a.endsWith('.txt'))) {
    assert.doesNotMatch(await fs.readFile(path.join(root, rel), 'utf8'), /sk-live-abcdef123456/, rel);
  }
});

test('each runs the steps for every case of a fixture, labels each record, and stops at the first failing case', async () => {
  const root = await tmp();
  await fs.mkdir(path.join(root, 'fixtures'), { recursive: true });
  await fs.writeFile(path.join(root, 'fixtures', 'cases.json'), JSON.stringify({ cases: [
    { id: 'c1', text: 'boleto', kind: 'text' },
    { id: 'c2', text: 'audio', kind: 'audio' },
    { id: 'c3', text: 'internet caiu', kind: 'text' }
  ] }));
  const script = (fail) => ({
    url: 'http://127.0.0.1:3000',
    steps: [
      {
        do: 'each', from: 'fixtures/cases.json', select: 'cases', where: { kind: 'text' }, as: 'case', label: '{{case.id}}', ac: 'AC-01',
        steps: [{ do: 'request', method: 'POST', url: '/hook', body: { text: '{{case.text}}', n: '{{loop.index}}', of: '{{loop.count}}' }, ac: 'AC-02', ...(fail ? { status: 200 } : {}) }]
      },
      { do: 'reload', ac: 'AC-09' }
    ]
  });

  const passing = fakeFetch(() => ({ status: 200, body: { ok: true } }));
  const report = await run(root, script(false), { fetchImpl: passing, open: opener(fakePage()) });
  assert.equal(report.ok, true, JSON.stringify(report.steps.map((s) => s.error || s.detail)));
  assert.deepEqual(passing.calls.map((c) => JSON.parse(c.body)), [{ text: 'boleto', n: 1, of: 2 }, { text: 'internet caiu', n: 2, of: 2 }]);
  assert.deepEqual(report.steps.map((s) => [s.index, s.label || '']), [[0, ''], ['0.1.0', 'c1'], ['0.2.0', 'c3'], [1, '']]);
  assert.match(report.steps[0].detail, /2\/2 item\(s\) run, every step ok/);
  assert.equal(report.scenario.iterations, 2);
  assert.equal(report.ids['AC-02'].status, 'pass');

  const failing = fakeFetch((call) => ({ status: JSON.parse(call.body).text === 'internet caiu' ? 500 : 200, body: {} }));
  const failed = await run(root, script(true), { fetchImpl: failing, open: opener(fakePage()) });
  assert.equal(failed.ok, false);
  assert.equal(failed.stopped_at, 0);
  assert.match(failed.steps[0].error, /first failure at step 0\.2\.0/);
  assert.equal(failed.ids['AC-02'].status, 'fail');
  assert.equal(failed.ids['AC-09'].status, 'not_reached');

  const outside = await run(root, { url: 'http://127.0.0.1:3000', steps: [{ do: 'each', from: '../cases.json', steps: [{ do: 'reload' }] }] }, { open: opener(fakePage()) });
  assert.equal(outside.ok, false);
  assert.match(outside.steps[0].error, /each from must be a file inside the project/);
});

test('an optional step handles what only sometimes appears: skipped when absent, never proving an id', async () => {
  const root = await tmp();
  const page = fakePage({ elements: { 'role=button[name=Fechar]': {}, 'role=button[name=Assumir]': {} } });
  const report = await run(root, {
    url: 'http://127.0.0.1:3000',
    steps: [
      { do: 'click', target: 'role=button[name="Fechar"]', optional: true, timeout: 50 },
      { do: 'click', target: 'role=button[name="Dicas"]', optional: true, timeout: 50, ac: 'AC-07' },
      { do: 'click', target: 'role=button[name="Assumir"]', ac: 'AC-08' }
    ]
  }, { open: opener(page) });
  assert.equal(report.ok, true, JSON.stringify(report.steps.map((s) => s.error || s.detail)));
  assert.deepEqual(page.trace, ['click:role=button[name=Fechar]', 'click:role=button[name=Dicas]', 'click:role=button[name=Assumir]']);
  assert.equal(report.steps[0].skipped, undefined);
  assert.equal(report.steps[1].skipped, true);
  assert.match(report.steps[1].detail, /optional step did not apply: locator "role=button\[name=Dicas\]" not found/);
  assert.equal(report.ids['AC-07'], undefined);
  assert.equal(report.ids['AC-08'].status, 'pass');
  assert.match(report.smoke.trigger, /Assumir|Fechar/);

  const invalid = normalizeScript({ steps: [{ do: 'judge', question: 'Ok?', optional: true }, { do: 'reload', optional: 'yes' }] });
  assert.match(invalid.errors.join('\n'), /step 0: judge cannot be optional[\s\S]*step 1: optional must be true or false/);
});

// A Jev double that validates the spec the runner builds and applies the real decision policy.
function fakeJev(answerFor, { status = 'ready' } = {}) {
  const specs = [];
  return {
    specs,
    loadConfig: () => (status === 'ready' ? { status: 'ready', model: 'jev-test', minNoul: 0.6 } : { status, reason: 'no key' }),
    judge: async ({ spec }) => {
      specs.push(spec);
      const valid = validateJudgmentSpec(spec);
      assert.equal(valid.ok, true, valid.errors.join('; '));
      const answers = { verdict: answerFor(spec, specs.length) };
      return { ok: true, model: 'jev-test', answers, usage: { cost: 0.00004 }, cache: { status: 'disabled' }, decision: applyDecision(spec, answers) };
    }
  };
}

test('judge asks Jev about what the page shows: personal data and secrets masked, no id credit, soft concerns', async () => {
  const root = await tmp();
  const page = fakePage({
    elements: { 'label=Key': {} },
    aria: '- main:\n  - text: "Cliente Ana ana@example.com (11) 92526-2700 CPF 123.456.789-09: minha internet caiu"\n  - textbox "Key": sk-live-abcdef123456'
  });
  const jev = fakeJev((spec, n) => {
    if (n === 2) return { type: 'choice', choice: 'suporte', confidence: 0.82, probabilities: { suporte: 0.82, financeiro: 0.18 } };
    return { type: 'noul', noul: n === 1 ? 0.92 : 0.2 };
  });
  const report = await run(root, {
    url: 'http://127.0.0.1:3000',
    steps: [
      { do: 'fill', target: 'label=Key', value: '{{env.API_KEY}}' },
      { do: 'judge', question: 'Does the open conversation show the customer complaint about the connection?', ac: 'AC-05' },
      { do: 'judge', question: 'Which sector should handle this conversation?', type: 'choice', criteria: { suporte: 'Connection problems', financeiro: 'Bills' }, equals: 'suporte', min_confidence: 0.6, context: { expected: 'suporte' } },
      { do: 'judge', question: 'Is the reply polite?', soft: true },
      { do: 'judge', question: 'Does the page promise the cancellation was done?' },
      { do: 'reload' }
    ]
  }, { env: { API_KEY: 'sk-live-abcdef123456' }, jev, open: opener(page) });

  const aria = jev.specs[0].state.page.aria;
  assert.doesNotMatch(aria, /ana@example|92526|123\.456|sk-live/);
  assert.match(aria, /\[email\].*\[number\].*CPF \[number\]/);
  assert.match(aria, /\[env\.API_KEY\]/);
  assert.deepEqual(jev.specs[1].decision.rules.map((r) => r.metric), ['choice', 'confidence']);
  assert.deepEqual(jev.specs[1].state.context, { expected: 'suporte' });

  assert.equal(report.steps[1].judge.verdict, 'pass');
  assert.equal(report.steps[2].judge.verdict, 'pass');
  assert.equal(report.steps[3].ok, true);
  assert.equal(report.steps[3].warning, 'judge_concern');
  assert.ok(report.warnings.some((w) => /Jev raised a semantic concern/.test(w)));
  assert.equal(report.steps[4].ok, false);
  assert.match(report.steps[4].error, /Jev judged against/);
  assert.equal(report.ok, false);
  assert.equal(report.ids['AC-05'], undefined, 'a judgment never proves an id');
  assert.deepEqual(report.scenario.judgments, { pass: 2, fail: 1, skipped: 0, concerns: 1 });

  const { buildMarkdown } = require('../src/lib/browser-walkthrough');
  const markdown = buildMarkdown(report);
  assert.match(markdown, /## Semantic judgments \(Jev — a critic, never the authority/);
  assert.match(markdown, /\| 3 \| concern \|/);
});

test('an unavailable Jev is a skipped judgment — never a pass, and a failure only when required', async () => {
  const root = await tmp();
  const jev = fakeJev(() => ({ type: 'noul', noul: 1 }), { status: 'unconfigured' });
  const report = await run(root, {
    url: 'http://127.0.0.1:3000',
    steps: [
      { do: 'judge', question: 'Is the order list visible?', ac: 'AC-01' },
      { do: 'judge', question: 'Is the order list visible?', required: true }
    ]
  }, { jev, open: opener(fakePage()) });
  assert.equal(jev.specs.length, 0);
  assert.equal(report.steps[0].ok, true);
  assert.equal(report.steps[0].skipped, true);
  assert.match(report.steps[0].detail, /judgment skipped; it proves nothing/);
  assert.equal(report.steps[1].ok, false);
  assert.match(report.steps[1].error, /required/);
  assert.equal(report.ids['AC-01'], undefined);
  assert.deepEqual(report.scenario.judgments, { pass: 0, fail: 0, skipped: 2, concerns: 0 });
});
