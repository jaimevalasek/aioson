'use strict';

// JEV prunes OPTIONAL context the agent was offered over the budget; must_load
// is never sent to the judge, and any failure keeps the local selection.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { pruneOptionalContext, OPTIONAL_BUDGET } = require('../src/lib/jev-context-filter');
const { loadJevConfig } = require('../src/lib/jev-config');
const { buildContextBrief } = require('../src/context-brief');
const { runContextBrief } = require('../src/commands/context-brief');

async function writeProject(files) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-jev-context-'));
  for (const [name, body] of Object.entries(files)) {
    const file = path.join(dir, ...name.split('/'));
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, body);
  }
  return dir;
}

const READY_MODELS = `${JSON.stringify({
  providers: { openrouter: { api_key: 'test-key-from-json' } },
  jev: { enabled: true, route: 'openrouter', min_noul: 0.6 }
}, null, 2)}\n`;

function doc(name, description) {
  return ['---', `name: ${name}`, `description: ${description}`, 'agents: [dev]', 'modes: [executing]', 'triggers: [checkout]', 'load_tier: trigger', '---', `# ${name}`, '', `${description}.`, ''].join('\n');
}

function items(count) {
  return Array.from({ length: count }, (_, index) => ({ path: `.aioson/docs/doc-${index}.md`, reason: 'triggers:checkout' }));
}

function judgeBy(predicate, calls = []) {
  return async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    const answers = {};
    body.state.documents.forEach((document, index) => {
      answers[`needed_${index}`] = { type: 'noul', noul: predicate(document) ? 0.9 : 0.1 };
    });
    return { ok: true, status: 200, json: async () => ({ model: 'typesafe/jev-test', answers }) };
  };
}

test('within the budget nothing is judged; unconfigured or failed JEV keeps the local selection', async () => {
  let called = 0;
  const fetchImpl = async () => { called += 1; throw new Error('should not be called'); };
  const small = await pruneOptionalContext({ projectDir: os.tmpdir(), task: 't', agent: 'dev', mode: 'executing', items: items(OPTIONAL_BUDGET), fetchImpl });
  assert.equal(small.report.status, 'within_budget');
  assert.equal(called, 0);

  const dir = await writeProject({});
  try {
    const unconfigured = await pruneOptionalContext({ projectDir: dir, env: {}, task: 't', agent: 'dev', mode: 'executing', items: items(6), fetchImpl });
    assert.equal(unconfigured.report.status, 'unconfigured');
    assert.equal(unconfigured.items.length, 6);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }

  const ready = await writeProject({ 'aioson-models.json': READY_MODELS });
  try {
    const config = loadJevConfig(ready, {});
    const down = await pruneOptionalContext({ config, task: 't', agent: 'dev', mode: 'executing', items: items(6), fetchImpl: async () => { throw new Error('ECONNRESET'); } });
    assert.equal(down.report.status, 'unavailable');
    assert.equal(down.items.length, 6, 'an outage never removes context');

    const partial = await pruneOptionalContext({
      config, task: 't', agent: 'dev', mode: 'executing', items: items(6),
      fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ answers: { needed_0: { type: 'noul', noul: 0.1 } } }) })
    });
    assert.equal(partial.report.status, 'unavailable');
    assert.equal(partial.report.reason, 'invalid_response');
    assert.equal(partial.items.length, 6, 'a half-answered judgment changes nothing');
  } finally {
    await fs.rm(ready, { recursive: true, force: true });
  }
});

test('the brief offers JEV only its optional references and keeps every must_load', async () => {
  const files = {
    'aioson-models.json': READY_MODELS,
    '.aioson/context/project.context.md': '---\nframework: Node.js\n---\n# Project',
    '.aioson/rules/checkout-money.md': ['---', 'name: checkout-money', 'description: Checkout amounts are integer cents', 'agents: [dev]', 'modes: [executing]', 'triggers: [checkout]', 'load_tier: trigger', '---', '# Checkout money', '', '- Store amounts as integer cents.', ''].join('\n')
  };
  const topics = ['payment retries', 'tax rounding', 'coupon stacking', 'shipping quotes', 'invoice layout', 'refund flow', 'fraud review'];
  topics.forEach((topic, index) => {
    files[`.aioson/docs/checkout-${index}.md`] = doc(`checkout-${index}`, `Checkout ${topic} procedure`);
  });
  const dir = await writeProject(files);
  try {
    const task = 'checkout: apply coupon stacking and tax rounding to the order total';
    const local = await buildContextBrief(dir, { agent: 'dev', mode: 'executing', task, recall: false });
    const offered = local.should_load.length + local.skills.length;
    assert.ok(offered > OPTIONAL_BUDGET, `fixture offers ${offered} optional references`);
    assert.ok(local.must_load.some((item) => item.path === '.aioson/rules/checkout-money.md'));

    const calls = [];
    const config = loadJevConfig(dir, {});
    const judged = await buildContextBrief(dir, {
      agent: 'dev', mode: 'executing', task, recall: false,
      jevFilter: { config, fetchImpl: judgeBy((document) => /coupon|tax/i.test(document.about), calls) }
    });
    assert.equal(judged.jev_filter.status, 'used');
    assert.deepEqual(judged.should_load.map((item) => item.path).sort(), ['.aioson/docs/checkout-1.md', '.aioson/docs/checkout-2.md']);
    assert.ok(judged.pruned.length >= 3);
    assert.deepEqual(judged.must_load.map((item) => item.path), local.must_load.map((item) => item.path), 'the law is never pruned');
    const sentPaths = calls.flatMap((body) => body.state.documents.map((document) => document.path));
    assert.equal(sentPaths.includes('.aioson/rules/checkout-money.md'), false, 'must_load is never offered to the judge');
    assert.equal(calls[0].state.task, task);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('context:brief --no-jev keeps the local selection without asking', async () => {
  const dir = await writeProject({ '.aioson/context/project.context.md': '---\nframework: Node.js\n---\n# Project' });
  try {
    const result = await runContextBrief({ args: [dir], options: { agent: 'dev', task: 'checkout', 'no-jev': true, json: true }, logger: { log() {} } });
    assert.equal(result.jev_filter, undefined);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
