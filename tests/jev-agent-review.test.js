'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { MANAGED_FILES } = require('../src/constants');
const { validateJudgmentSpec } = require('../src/lib/jev-judgment');
const {
  AGENTS,
  MAX_STATE_CHARS,
  PROFILE_DEFINITIONS,
  buildAgentReviewSpec,
  composeAgentDecision,
  sanitizeSecurityArtifact
} = require('../src/lib/jev-agent-review');
const { runJevAgentReview } = require('../src/commands/jev-agent-review');

async function fixture({ configured = true } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-jev-agent-'));
  const syntheticSecret = ['sk-', 'this-must-never-leak-123456'].join('');
  await fs.mkdir(path.join(dir, '.aioson', 'briefings', 'checkout'), { recursive: true });
  await fs.mkdir(path.join(dir, '.aioson', 'context'), { recursive: true });
  await fs.writeFile(path.join(dir, '.aioson', 'briefings', 'checkout', 'briefings.md'), `---
slug: checkout
---
## Context
Customers abandon checkout.
## Problem
Payment failure gives no recovery path.
## Proposed solution
Preserve the cart and offer a retry.
## Themes
Recovery
## Risks
Duplicate payment
## Identified gaps
Provider behavior
## Sources
PROM-checkout-01 — preserve the cart
## Open questions
None.
secret: ${syntheticSecret}
SENTINEL-PROPRIETARY-CONTENT
`);
  await fs.writeFile(path.join(dir, 'aioson-models.json'), JSON.stringify({
    providers: { openrouter: { api_key: configured ? 'fixture-key' : 'YOUR_OPENROUTER_API_KEY' } },
    jev: { enabled: configured, route: 'openrouter' }
  }));
  return dir;
}

function response({ route = 'ready_for_refiner', alignment = 0.9, risk = 0.1, score = 2.6, confidence = 0.8 } = {}) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => ({
      id: 'agent-review-1',
      model: 'typesafe/jev-1.13',
      usage: { input_tokens: 200, output_tokens: 30 },
      answers: {
        alignment: { type: 'noul', noul: alignment },
        unresolved_risk: { type: 'noul', noul: risk },
        evidence_strength: { type: 'score', score, confidence, probabilities: { 0: 0, 1: 0.1, 2: 0.4, 3: 0.5 } },
        primary_route: { type: 'choice', choice: route, confidence, probabilities: { ...Object.fromEntries(Object.keys(PROFILE_DEFINITIONS.briefing.routes).map((key) => [key, 0])), [route]: 0.8, insufficient_evidence: 0.2 } }
      }
    })
  };
}

test('all nine agent profiles build valid narrow Jev contracts', () => {
  assert.deepEqual(AGENTS, ['briefing', 'refiner', 'product', 'sheldon', 'planner', 'dev', 'qa', 'tester', 'pentester']);
  for (const agent of AGENTS) {
    const spec = buildAgentReviewSpec({
      agent,
      slug: 'checkout',
      phase: 'review',
      artifacts: [{ kind: 'test', path: 'test.md', status: 'included', content: 'evidence' }],
      evidence: { deterministic: true }
    });
    const validation = validateJudgmentSpec(spec);
    assert.equal(validation.ok, true, `${agent}: ${validation.errors.join('; ')}`);
    assert.equal(Object.keys(spec.questions).length, 4);
    assert.equal(PROFILE_DEFINITIONS[agent].pass_action.length > 0, true);
  }
});

test('agent state is bounded below the Jev text-context safety budget', () => {
  const huge = 'material evidence '.repeat(20000);
  const spec = buildAgentReviewSpec({
    agent: 'qa',
    slug: 'checkout',
    artifacts: Array.from({ length: 10 }, (_, index) => ({
      kind: `artifact-${index}`,
      path: `artifact-${index}.md`,
      status: 'included',
      content: huge
    })),
    evidence: { traces: Array.from({ length: 100 }, (_, index) => ({ index, detail: huge })) }
  });
  assert.equal(JSON.stringify(spec.state).length <= MAX_STATE_CHARS, true);
  assert.equal(validateJudgmentSpec(spec).ok, true);
});

test('policy keeps uncertainty advisory and only passes the profile ready route', () => {
  const ready = composeAgentDecision('qa', {
    alignment: { noul: 0.9 },
    unresolved_risk: { noul: 0.1 },
    evidence_strength: { score: 2.7, confidence: 0.8 },
    primary_route: { choice: 'acceptance_supported', confidence: 0.8, probabilities: { acceptance_supported: 0.84 } }
  });
  assert.equal(ready.passed, true);
  assert.equal(ready.advisory, true);

  const uncertain = composeAgentDecision('qa', {
    alignment: { noul: 0.9 },
    unresolved_risk: { noul: 0.1 },
    evidence_strength: { score: 2.7, confidence: 0.2 },
    primary_route: { choice: 'acceptance_supported', confidence: 0.2, probabilities: { acceptance_supported: 0.5 } }
  });
  assert.equal(uncertain.passed, false);
  assert.equal(uncertain.uncertain, true);
  assert.equal(uncertain.action, 'human_review');
});

test('evidence-only reveals bounded redacted state for inspection', async () => {
  const dir = await fixture();
  const result = await runJevAgentReview({
    args: [dir],
    options: { agent: 'briefing', feature: 'checkout', 'evidence-only': true, json: true },
    logger: { log() {}, error() {} }
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'evidence');
  const payload = JSON.stringify(result.spec);
  assert.equal(payload.includes('SENTINEL-PROPRIETARY-CONTENT'), true);
  assert.equal(payload.includes('sk-this-must-never-leak'), false);
  assert.match(payload, /secret removed/);
  assert.equal(validateJudgmentSpec(result.spec).ok, true);
});

test('review calls Jev, applies the advisory policy, and persists no artifact content', async () => {
  const dir = await fixture();
  const result = await runJevAgentReview({
    args: [dir],
    options: {
      agent: 'briefing',
      feature: 'checkout',
      phase: 'handoff',
      out: '.aioson/context/features/checkout/jev/briefing-handoff.json',
      json: true
    },
    logger: { log() {}, error() {} },
    fetchImpl: async () => response()
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'reviewed');
  assert.equal(result.decision.passed, true);
  assert.equal(result.decision.action, 'ready_for_refiner');
  assert.equal(result.provenance.artifacts[0].content, undefined);
  const persisted = await fs.readFile(path.join(dir, result.out), 'utf8');
  assert.equal(persisted.includes('SENTINEL-PROPRIETARY-CONTENT'), false);
  assert.equal(persisted.includes('fixture-key'), false);
});

test('unconfigured Jev skips without failing the deterministic workflow', async () => {
  const dir = await fixture({ configured: false });
  let called = false;
  const result = await runJevAgentReview({
    args: [dir],
    options: { agent: 'briefing', feature: 'checkout', json: true },
    logger: { log() {}, error() {} },
    fetchImpl: async () => { called = true; }
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'skipped');
  assert.equal(called, false);
  assert.equal(result.exitCode, undefined);
});

test('require-pass is the only mode that makes a negative semantic review exit two', async () => {
  const dir = await fixture();
  const result = await runJevAgentReview({
    args: [dir],
    options: { agent: 'briefing', feature: 'checkout', 'require-pass': true, json: true },
    logger: { log() {}, error() {} },
    fetchImpl: async () => response({ route: 'framing_gap', alignment: 0.4, risk: 0.9, score: 1.2 })
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'reviewed');
  assert.equal(result.decision.passed, false);
  assert.equal(result.exitCode, 2);
});

test('security artifacts omit raw evidence, endpoints, attack paths, and credentials', () => {
  const sanitized = sanitizeSecurityArtifact({
    feature_slug: 'checkout',
    review_contract: { scope_target: 'app_target', target_mode: 'local', report_mode: 'none' },
    findings: [{
      id: 'SEC-1', title: 'Candidate IDOR', severity: 'high', status: 'needs_validation',
      affected_artifacts: ['src/orders.js'], impact: 'Cross-account read', suggested_fix: 'Enforce ownership', owner: 'dev',
      evidence: 'Authorization: Bearer secret-token-value', endpoint: 'https://example.test/users/42', attack_path: ['private exploit step']
    }]
  });
  const text = JSON.stringify(sanitized);
  assert.match(text, /SEC-1/);
  assert.equal(text.includes('secret-token-value'), false);
  assert.equal(text.includes('example.test'), false);
  assert.equal(text.includes('private exploit step'), false);
});

test('agent protocol ships as a managed document and all agent mirrors stay synchronized', async () => {
  const rel = '.aioson/docs/jev-agent-review.md';
  assert.equal(MANAGED_FILES.includes(rel), true);
  assert.equal(await fs.readFile(path.resolve(rel), 'utf8'), await fs.readFile(path.resolve('template', rel), 'utf8'));
  for (const agent of AGENTS) {
    const workspace = await fs.readFile(path.resolve('.aioson', 'agents', `${agent}.md`), 'utf8');
    const template = await fs.readFile(path.resolve('template', '.aioson', 'agents', `${agent}.md`), 'utf8');
    assert.equal(workspace, template, agent);
    assert.match(workspace, /jev-agent-review\.md/);
  }
});
