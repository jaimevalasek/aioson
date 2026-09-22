'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { redactText } = require('../src/lib/jev-review');
const { composeAgentDecision, compact, assessEvidence, sha256 } = require('../src/lib/jev-agent-review');
const { validateJudgmentSpec, validateAnswers, applyDecision, runJevJudgment } = require('../src/lib/jev-judgment');
const { requestJev } = require('../src/lib/jev-client');
const { applyJevRelevance } = require('../src/lib/jev-relevance');
const { collectRelations, relationQuestions, composeRelations } = require('../src/lib/jev-relations');
const { runJevAgentReview } = require('../src/commands/jev-agent-review');
const { runJevJudge } = require('../src/commands/jev-judge');
const config = { enabled: true, status: 'ready', route: 'typesafe', model: 'jev-1.13.0', endpoint: 'https://example.invalid', apiKey: 'synthetic-key', minNoul: 0.6 };
const http = (answers) => ({ ok: true, status: 200, json: async () => ({ answers, model: 'jev-1.13.0', usage: { input_tokens: 20 } }) });
const ready = { alignment: { noul: 0.9 }, unresolved_risk: { noul: 0.1 }, evidence_strength: { score: 2.8, confidence: 0.9 }, primary_route: { choice: 'ready_for_qa', confidence: 0.9, probabilities: { ready_for_qa: 0.95 } } };
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-jev-hardening-'));
  t.after(async () => {
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('aioson-jev-hardening-'));
    await fs.rm(root, { recursive: true, force: true });
  });
  return root;
}

test('redacts JSON, YAML blocks and structured credentials before HTTP', async () => {
  for (const value of ['{"password":"SYNTHETIC_PASSWORD"}', "api_key: 'SYNTHETIC_KEY'", 'password: |\n  SYNTHETIC_MULTILINE\n  MORE_SECRET\npublic: fine']) {
    assert.doesNotMatch(redactText(value), /SYNTHETIC_|MORE_SECRET/);
  }
  assert.equal(compact({ nested: { password: 'PRIVATE_VALUE' } }).nested.password, '[secret removed]');
  await requestJev({ config, state: { password: 'PRIVATE_VALUE', text: '{"api_key":"PRIVATE_VALUE"}' },
    questions: { q: { type: 'choice', instructions: 'Choose', criteria: { token: 'a token', password: 'a password' } } },
    fetchImpl: async (_, request) => {
      assert.doesNotMatch(request.body, /PRIVATE_VALUE/);
      assert.deepEqual(Object.keys(JSON.parse(request.body).questions.q.criteria), ['token', 'password']);
      return http({});
    } });
});

test('independent question contradictions never recommend READY', () => {
  const result = composeAgentDecision('dev', { ...ready, unresolved_risk: { noul: 0.95 } });
  assert.equal(result.passed, false);
  assert.equal(result.action, 'review');
  assert.equal(result.proposed_route, 'ready_for_qa');
  assert.equal(composeAgentDecision('dev', { ...ready, primary_route: { choice: 'ready_for_qa' } }).uncertain, true);
});

test('rejects invalid scales, distributions and incompatible gate metrics', () => {
  const question = { type: 'score', criteria: ['bad', 'good'] };
  assert.ok(validateAnswers({ q: question }, { q: { type: 'score', score: 999, confidence: 0.9 } }).length);
  for (const probabilities of [{ 0: 0.8 }, { 0: -1, 1: 2 }, { 0: 0.2, 1: 0.2 }]) {
    assert.ok(validateAnswers({ q: question }, { q: { type: 'score', score: 0.5, confidence: 0.9, probabilities } }).length);
  }
  const spec = { state: 'text', questions: { q: { type: 'noul', instructions: 'Yes?' } }, decision: { type: 'gate', rules: [{ question: 'q', metric: 'score', value: 1 }] } };
  assert.equal(validateJudgmentSpec(spec).ok, false);
});

test('missing probability fails neq and malformed criteria return errors', () => {
  const spec = { state: 'synthetic', questions: { q: { type: 'choice', instructions: 'Choose', criteria: { yes: 'Yes', no: 'No' } } },
    decision: { type: 'gate', rules: [{ question: 'q', metric: 'probability', option: 'yes', op: 'neq', value: 0 }] } };
  assert.equal(applyDecision(spec, { q: { type: 'choice', choice: 'yes', confidence: 0.9 } }).passed, false);
  delete spec.questions.q.criteria;
  assert.equal(validateJudgmentSpec(spec).ok, false);
});

test('missing Retry-After waits and partial relevance falls back visibly', async () => {
  let calls = 0;
  const delays = [];
  await requestJev({ config, state: 'x', questions: {}, retries: 1, sleepImpl: async (ms) => delays.push(ms),
    fetchImpl: async () => ++calls === 1 ? { ok: false, status: 429, headers: { get: () => null }, json: async () => ({}) } : http({}) });
  assert.ok(delays[0] >= 250);
  calls = 0;
  const ranked = [{ url: 'https://example.invalid/a', score: 2 }, { url: 'https://example.invalid/b', score: 1 }];
  const result = await applyJevRelevance({ config, query: 'x', ranked, fetchImpl: async () => { calls++; return http({ relevant_0: { type: 'noul', noul: 2 } }); } });
  assert.equal(calls, 1);
  assert.equal(result.report.trust_candidates, false);
  assert.deepEqual(result.candidates, ranked);
});

test('all deterministic blockers survive beyond prompt compaction and phase respects ownership', () => {
  const gaps = Array.from({ length: 41 }, (_, i) => ({ stage: 'plan', check: `gap-${i}` }));
  assert.deepEqual(compact(gaps).at(-1), { omitted_items: 1 });
  const artifacts = ['prd', 'plan'].map((kind) => ({ kind, status: 'included', content: 'valid' }));
  const evidence = { feature_trace: { ok: true, gaps }, ac_test_audit: { ok: true } };
  const assessment = assessEvidence('dev', 'handoff', artifacts, evidence);
  assert.equal(assessment.blockers.length, 41);
  assert.equal(composeAgentDecision('dev', ready, {}, assessment).action, 'collect_or_fix_evidence');
  assert.equal(assessEvidence('dev', 'preflight', artifacts, { feature_trace: { ok: true, gaps: [] } }).passed, true);
  assert.equal(assessEvidence('planner', 'preflight', artifacts.slice(0, 1), { feature_trace: { ok: true, gaps } }).passed, true);
});

test('require-pass fails missing QA evidence and persists the actual exit code', async (t) => {
  const root = await fixture(t);
  await fs.mkdir(path.join(root, '.aioson/context'), { recursive: true });
  await fs.writeFile(path.join(root, '.aioson/context/prd-audit.md'), '# Draft without ACs');
  const result = await runJevAgentReview({ args: [root], options: { agent: 'qa', feature: 'audit', json: true, 'require-pass': true, 'evidence-only': true, out: 'result.json' } });
  assert.equal(result.spec.state.review.preconditions.passed, false);
  assert.equal(result.exitCode, 2);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(root, 'result.json'), 'utf8')), result);
  await fs.writeFile(path.join(root, 'aioson-models.json'), JSON.stringify({ jev: { enabled: true, route: 'typesafe' } }));
  const reviewed = await runJevAgentReview({ args: [root], env: { TYPESAFE_API_KEY: 'synthetic-key' },
    options: { agent: 'qa', feature: 'audit', json: true, 'require-pass': true },
    fetchImpl: async (_, request) => {
      const body = JSON.parse(request.body);
      return http(Object.fromEntries(Object.entries(body.questions).map(([id, q]) => [id,
        q.type === 'noul' ? { type: 'noul', noul: id === 'alignment' ? 0.99 : 0.01 }
          : q.type === 'score' ? { type: 'score', score: 3, confidence: 1, probabilities: { 0: 0, 1: 0, 2: 0, 3: 1 } }
            : { type: 'choice', choice: 'acceptance_supported', confidence: 1, probabilities: Object.fromEntries(Object.keys(q.criteria).map((key) => [key, key === 'acceptance_supported' ? 1 : 0])) }
      ])));
    } });
  assert.equal(reviewed.status, 'reviewed');
  assert.equal(reviewed.decision.semantic_passed, true);
  assert.equal(reviewed.decision.passed, false);
  assert.equal(reviewed.exitCode, 2);
});

test('relations verify ranges, consent, stale source bindings and localized results', async (t) => {
  const root = await fixture(t);
  const dir = path.join(root, '.aioson/context/features/audit/jev');
  await fs.mkdir(dir, { recursive: true });
  const prd = '.aioson/context/prd-audit.md';
  const source = 'source.txt';
  await fs.writeFile(path.join(root, prd), 'AC-1 Cart survives failure.');
  await fs.writeFile(path.join(root, source), 'Cart is preserved after failed payment.');
  const ref = (p, text) => ({ path: p, sha256: sha256(text), start_line: 1, end_line: 1 });
  const manifest = { version: 1, relations: [{ id: 'AC-1', kind: 'promise_acceptance', claim: ref(prd, 'AC-1 Cart survives failure.'), evidence: ref(source, 'Cart is preserved after failed payment.') }] };
  await fs.writeFile(path.join(dir, 'evidence.json'), JSON.stringify(manifest));
  assert.equal((await collectRelations(root, 'audit')).errors[0].reason, 'include_source_required');
  const collected = await collectRelations(root, 'audit', { includeSource: true });
  assert.equal(collected.items.length, 1);
  assert.equal(validateJudgmentSpec({ state: { relations: collected.items }, questions: relationQuestions(collected.items) }).ok, true);
  const findings = composeRelations(collected.items, { relation_0: { choice: 'contradicts', confidence: 0.99 } });
  assert.equal(findings[0].id, 'AC-1');
  assert.equal(findings[0].supported, false);
  await fs.writeFile(path.join(root, source), 'Changed');
  assert.equal((await collectRelations(root, 'audit', { includeSource: true })).errors[0].reason, 'stale_or_missing_hash');
});

test('cache reuses answers, reapplies policy, invalidates state and never persists content', async (t) => {
  const root = await fixture(t);
  const spec = { state: 'SYNTHETIC_PROPRIETARY_TEXT', questions: { q: { type: 'noul', instructions: 'Supported?' } }, decision: { type: 'gate', rules: [{ question: 'q', value: 0.7 }] } };
  let calls = 0;
  const run = () => runJevJudgment({ spec, projectDir: root, config: { ...config, cacheEnabled: true }, fetchImpl: async () => { calls++; return http({ q: { type: 'noul', noul: 0.8 } }); } });
  assert.equal((await run()).cache.status, 'miss');
  spec.decision.rules[0].value = 0.9;
  const cached = await run();
  assert.equal(cached.cache.status, 'hit');
  assert.equal(cached.decision.passed, false);
  assert.equal(calls, 1);
  spec.state = 'changed';
  assert.equal((await run()).cache.status, 'miss');
  assert.equal(calls, 2);
  for (const name of await fs.readdir(path.join(root, '.aioson/cache/jev'))) {
    assert.doesNotMatch(await fs.readFile(path.join(root, '.aioson/cache/jev', name), 'utf8'), /SYNTHETIC_PROPRIETARY_TEXT|synthetic-key/);
  }
});

test('dry-run cannot satisfy require-pass and byte budgeting rejects oversized state', async (t) => {
  const root = await fixture(t);
  const spec = { state: 'small', questions: { q: { type: 'noul', instructions: 'Supported?' } } };
  await fs.writeFile(path.join(root, 'spec.json'), JSON.stringify(spec));
  const result = await runJevJudge({ args: [root], options: { file: 'spec.json', json: true, 'dry-run': true, 'require-pass': true } });
  assert.equal(result.exitCode, 2);
  spec.state = '界'.repeat(20000);
  assert.match(validateJudgmentSpec(spec).errors.join(' '), /context_budget/);
});

test('evaluation metrics separate abstention and false-ready from accuracy', () => {
  const { metrics } = require('../scripts/testing/jev-evals');
  const cases = [{ id: 'a', expected: 'supports' }, { id: 'b', expected: 'contradicts' }, { id: 'c', expected: 'supports' }];
  const results = [{ id: 'a', ok: true, answers: { relation_0: { choice: 'contradicts', confidence: 0.9 } } },
    { id: 'b', ok: true, answers: { relation_0: { choice: 'supports', confidence: 0.9 } } }];
  const report = metrics(cases, results);
  assert.equal(report.false_ready, 1);
  assert.equal(report.false_alarm, 1);
  assert.equal(report.abstained, 1);
  assert.equal(report.accuracy, 0);
});

test('installed consumer exposes both new roles through the actual CLI', async (t) => {
  const root = await fixture(t);
  const { installTemplate } = require('../src/installer');
  await installTemplate(root);
  const { spawnSync } = require('node:child_process');
  for (const agent of ['refiner', 'planner']) {
    const content = await fs.readFile(path.join(root, '.aioson/agents', `${agent}.md`), 'utf8');
    assert.match(content, /jev-agent-review/);
    const run = spawnSync(process.execPath, [path.resolve('bin/aioson.js'), 'jev:agent-review', root, `--agent=${agent}`, '--feature=audit', '--evidence-only', '--json'], { encoding: 'utf8', windowsHide: true });
    assert.equal(run.status, 0, run.stderr || run.stdout);
    const result = JSON.parse(run.stdout);
    assert.equal(result.agent, agent);
    assert.equal(result.status, 'evidence');
    assert.equal(result.spec.state.review.preconditions.passed, false);
  }
});
