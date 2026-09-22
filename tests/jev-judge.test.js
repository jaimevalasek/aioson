'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { requestJev } = require('../src/lib/jev-client');
const {
  applyDecision,
  runJevJudgment,
  validateJudgmentSpec
} = require('../src/lib/jev-judgment');
const { buildExample, examples, runJevJudge } = require('../src/commands/jev-judge');

const CONFIG = {
  enabled: true,
  status: 'ready',
  route: 'openrouter',
  endpoint: 'https://openrouter.ai/api/alpha/decisions',
  model: 'typesafe/jev-1.13',
  apiKey: 'secret-openrouter-key'
};

function response(answers, extra = {}) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => ({
      id: 'decision-1',
      model: 'typesafe/jev-1.13-20260917',
      provider: 'TypeSafe',
      usage: { input_tokens: 120, output_tokens: 12, cost: 0.00001 },
      answers,
      ...extra
    })
  };
}

test('shipped examples cover raw, gate, select, and rank with a valid contract', () => {
  assert.deepEqual(Object.keys(examples()), ['raw', 'gate', 'select', 'rank']);
  for (const [kind, spec] of Object.entries(examples())) {
    assert.equal(validateJudgmentSpec(spec).ok, true, `${kind}: ${validateJudgmentSpec(spec).errors.join('; ')}`);
  }
  assert.equal(buildExample('missing'), null);
});

test('validation rejects malformed questions and unsafe policy references before calling Jev', async () => {
  const spec = {
    state: 'x',
    questions: {
      bad: { type: 'choice', instructions: 'pick', criteria: { only: 'one option' } }
    },
    decision: { type: 'gate', rules: [{ question: 'unknown', op: 'gte', value: 0.5 }] }
  };
  const validation = validateJudgmentSpec(spec);
  assert.equal(validation.ok, false);
  assert.match(validation.errors.join('\n'), /2 to 255 options/);
  assert.match(validation.errors.join('\n'), /unknown question/);

  let called = false;
  const result = await runJevJudgment({ spec, config: CONFIG, fetchImpl: async () => { called = true; } });
  assert.equal(result.status, 'invalid_spec');
  assert.equal(called, false);
});

test('gate combines noul, score, confidence, and choice probabilities in deterministic code', () => {
  const spec = {
    state: 'surface',
    questions: {
      premium: { type: 'noul', instructions: 'premium?' },
      craft: { type: 'score', instructions: 'craft?', criteria: ['bad', 'ok', 'great'] },
      route: { type: 'choice', instructions: 'route?', criteria: { refine: 'refine', accept: 'accept' } }
    },
    decision: {
      type: 'gate',
      rules: [
        { question: 'premium', op: 'gte', value: 0.7 },
        { question: 'craft', metric: 'score', op: 'gte', value: 1.5 },
        { question: 'craft', metric: 'confidence', op: 'gte', value: 0.5 },
        { question: 'route', metric: 'probability', option: 'accept', op: 'gte', value: 0.6 }
      ],
      on_pass: 'ship',
      on_fail: 'refine'
    }
  };
  const passed = applyDecision(spec, {
    premium: { type: 'noul', noul: 0.82 },
    craft: { type: 'score', score: 1.8, confidence: 0.71 },
    route: { type: 'choice', choice: 'accept', confidence: 0.65, probabilities: { refine: 0.2, accept: 0.8 } }
  });
  assert.equal(passed.passed, true);
  assert.equal(passed.action, 'ship');
  assert.equal(passed.evaluations.length, 4);
});

test('select confidence-gates routing and rank orders independent semantic scores', () => {
  const select = examples().select;
  const uncertain = applyDecision(select, {
    route: { type: 'choice', choice: 'exploration', confidence: 0.4, probabilities: { dev: 0.2, ux_ui: 0.25, exploration: 0.55 } }
  });
  assert.equal(uncertain.accepted, false);
  assert.equal(uncertain.selected, null);
  assert.equal(uncertain.action, 'human_review');

  const ranked = applyDecision(examples().rank, {
    candidate_a: { type: 'score', score: 2.4, confidence: 0.8 },
    candidate_b: { type: 'score', score: 0.8, confidence: 0.9 },
    candidate_c: { type: 'score', score: 2.8, confidence: 0.75 }
  });
  assert.equal(ranked.winner, 'candidate_c');
  assert.deepEqual(ranked.ranking.map((item) => item.question), ['candidate_c', 'candidate_a', 'candidate_b']);
});

test('generic client retries transient failures, exposes usage, and never returns the key', async () => {
  let calls = 0;
  const delays = [];
  const result = await requestJev({
    config: CONFIG,
    state: 'ticket',
    questions: { bug: { type: 'noul', instructions: 'bug?' } },
    retries: 2,
    sleepImpl: async (ms) => { delays.push(ms); },
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) {
        return { ok: false, status: 529, headers: { get: () => '0' }, json: async () => ({ error: { message: 'overloaded' } }) };
      }
      return response({ bug: { type: 'noul', noul: 0.91 } });
    }
  });
  assert.equal(result.ok, true);
  assert.equal(calls, 2);
  assert.deepEqual(delays, [0]);
  assert.equal(result.usage.input_tokens, 120);
  assert.equal(JSON.stringify(result).includes(CONFIG.apiKey), false);
});

test('judgment execution validates the response contract and applies its policy', async () => {
  const spec = examples().gate;
  const result = await runJevJudgment({
    spec,
    config: CONFIG,
    fetchImpl: async () => response({
      premium_fit: { type: 'noul', noul: 0.87 },
      craft: { type: 'score', score: 2.7, confidence: 0.8, probabilities: { 0: 0.01, 1: 0.04, 2: 0.2, 3: 0.75 } }
    })
  });
  assert.equal(result.ok, true);
  assert.equal(result.decision.passed, true);
  assert.equal(result.decision.action, 'accept');
  assert.equal(result.model, 'typesafe/jev-1.13-20260917');
});

test('CLI command reads the root config, supports dry-run/output, and require-pass exit semantics', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-jev-judge-'));
  await fs.writeFile(path.join(dir, 'aioson-models.json'), `${JSON.stringify({
    providers: { openrouter: { api_key: 'YOUR_OPENROUTER_API_KEY' } },
    jev: { enabled: true, route: 'openrouter' }
  }, null, 2)}\n`);
  await fs.writeFile(path.join(dir, 'gate.json'), `${JSON.stringify(examples().gate, null, 2)}\n`);
  const logger = { log() {}, error() {} };

  const dry = await runJevJudge({
    args: [dir],
    options: { file: 'gate.json', 'dry-run': true, json: true, out: 'out/dry.json' },
    logger,
    env: {}
  });
  assert.equal(dry.ok, true);
  assert.equal(dry.status, 'dry_run');
  assert.equal(JSON.parse(await fs.readFile(path.join(dir, 'out/dry.json'), 'utf8')).valid, true);

  const judged = await runJevJudge({
    args: [dir],
    options: { file: 'gate.json', json: true, 'require-pass': true },
    logger,
    env: { OPENROUTER_API_KEY: 'runtime-secret' },
    fetchImpl: async () => response({
      premium_fit: { type: 'noul', noul: 0.2 },
      craft: { type: 'score', score: 1.1, confidence: 0.8, probabilities: { 0: 0.1, 1: 0.8, 2: 0.1, 3: 0 } }
    })
  });
  assert.equal(judged.ok, true);
  assert.equal(judged.decision.passed, false);
  assert.equal(judged.exitCode, 2);
  assert.equal(JSON.stringify(judged).includes('runtime-secret'), false);
});
