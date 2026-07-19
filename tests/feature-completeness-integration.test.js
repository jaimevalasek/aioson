'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { runGateCheck } = require('../src/commands/gate-check');
const { runArtifactValidate } = require('../src/commands/artifact-validate');
const { runSpecAnalyze } = require('../src/commands/spec-analyze');
const { runPreflight } = require('../src/commands/preflight');
const { validateHandoffContract } = require('../src/handoff-contract');
const { CANONICAL_LENSES } = require('../src/lib/feature-completeness');
const { runHarnessCheck } = require('../src/commands/harness-check');

async function makeTmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-feature-completeness-integration-'));
}

async function writeFile(dir, relPath, content) {
  const full = path.join(dir, relPath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, 'utf8');
}

function logger() {
  return { log: () => {}, error: () => {} };
}

async function writePresenceOnlyChain(dir) {
  await writeFile(dir, '.aioson/context/project.context.md', '---\nclassification: SMALL\n---\n');
  await writeFile(dir, '.aioson/context/prd-demo.md', [
    '---',
    'classification: SMALL',
    '---',
    '# PRD',
    'A user submits a request, receives a durable result, retries failures, and can inspect the final status.'
  ].join('\n'));
  await writeFile(dir, '.aioson/context/requirements-demo.md', '# Requirements\nREQ-demo-01: submit request.\nAC-demo-01: result is returned.');
  await writeFile(dir, '.aioson/context/spec-demo.md', '---\nversion: 1\ngate_requirements: approved\ngate_design: approved\ngate_plan: approved\n---\n# Spec');
  await writeFile(dir, '.aioson/context/architecture.md', '# Architecture');
  await writeFile(dir, '.aioson/context/design-doc-demo.md', '# Design');
  await writeFile(dir, '.aioson/context/readiness-demo.md', '---\nreadiness: ready\n---\n# Readiness');
  await writeFile(dir, '.aioson/context/implementation-plan-demo.md', '---\nstatus: approved\n---\n# Plan');
}

function completeCapabilityMatrix() {
  return CANONICAL_LENSES.map((lens) => {
    if (lens === 'primary-outcome') {
      return '| CAP-demo-submit | primary-outcome | required | Return the persisted result identifier | REQ-demo-01 | AC-demo-01 |';
    }
    return `| feature-wide | ${lens} | not_applicable | ${lens} has no surface in this bounded command fixture | — | — |`;
  }).join('\n');
}

async function writeCompleteChain(dir) {
  await writeFile(dir, '.aioson/context/project.context.md', '---\nclassification: SMALL\n---\n');
  await writeFile(dir, '.aioson/context/project-pulse.md', '# Project pulse\n');
  await writeFile(dir, '.aioson/context/prd-demo.md', [
    '---',
    'classification: SMALL',
    'feature_completeness: required',
    '---',
    '# PRD',
    '## Feature Capability Map',
    '| CAP | Promised outcome | Actor / trigger | Scope decision | Rationale |',
    '|---|---|---|---|---|',
    '| CAP-demo-submit | A user receives a persisted result identifier | User submits a request | required | Primary approved outcome |'
  ].join('\n'));
  await writeFile(dir, '.aioson/context/requirements-demo.md', [
    '# Requirements',
    'REQ-demo-01 and AC-demo-01 define the submitted result.',
    '## Feature Capability Matrix',
    '| CAP | Lens | Decision | Behavior / rationale | REQ | AC |',
    '|---|---|---|---|---|---|',
    completeCapabilityMatrix()
  ].join('\n'));
  await writeFile(dir, '.aioson/context/spec-demo.md', [
    '---',
    'version: 1',
    'gate_requirements: approved',
    'gate_design: approved',
    'gate_plan: approved',
    '---',
    '# Spec',
    '## QA Sign-off',
    '- **Verdict:** PASS'
  ].join('\n'));
  await writeFile(dir, '.aioson/context/architecture.md', '# Architecture');
  await writeFile(dir, '.aioson/context/design-doc-demo.md', [
    '# Design',
    '## Implementation Leverage Matrix',
    '| CAP | Concern | Decision | Evidence | Target |',
    '|---|---|---|---|---|',
    '| CAP-demo-submit | command handler | reuse | package.json and src/demo.js were inspected | src/demo.js |'
  ].join('\n'));
  await writeFile(dir, '.aioson/context/readiness-demo.md', '---\nreadiness: ready\n---\n# Readiness');
  await writeFile(dir, '.aioson/context/implementation-plan-demo.md', [
    '---',
    'status: approved',
    '---',
    '# Plan',
    '## Capability Delivery Plan',
    '| CAP | Phase | Files | Verification |',
    '|---|---|---|---|',
    '| CAP-demo-submit | 1 | src/demo.js, tests/demo.test.js | npm test -- demo |'
  ].join('\n'));
}

async function writeExecutionEvidence(dir, options = {}) {
  await writeFile(dir, 'src/demo.js', 'module.exports = { runDemo: () => "result-1" };\n');
  const ledger = {
    schema_version: 'implementation-ledger/v1',
    feature_slug: 'demo',
    source_artifacts: [{ type: 'prd', path: '.aioson/context/prd-demo.md', role: 'product_authority' }],
    claims: [{
      id: 'CLAIM-demo-submit',
      capability_ids: options.capabilityIds || ['CAP-demo-submit'],
      kind: 'required_behavior',
      summary: 'The submitted request returns its persisted result identifier.',
      owner: 'dev',
      status: 'implemented',
      evidence: options.evidence || [
        { type: 'file', path: 'src/demo.js', lines: '1' },
        { type: 'test', command: 'node --test tests/demo.test.js', status: 'passed' }
      ]
    }],
    known_gaps: options.knownGaps || [],
    verification_commands: [{ command: 'node --test tests/demo.test.js', required: true, last_status: 'passed' }]
  };
  await writeFile(dir, '.aioson/context/features/demo/implementation-ledger.md', [
    '# Implementation Ledger - demo',
    '## Source Of Truth',
    'PRD and requirements.',
    '## Intended Behavior Claims',
    'One bounded capability claim.',
    '## Implementation Evidence',
    'Source and asserting test.',
    '## Verification Commands',
    'The focused Node test.',
    '## Known Gaps',
    'None.',
    '## Handoff Notes',
    'Ready for deterministic closure.',
    '## Machine Ledger',
    '```json',
    JSON.stringify(ledger, null, 2),
    '```'
  ].join('\n'));
  await writeFile(dir, '.aioson/plans/demo/harness-contract.json', JSON.stringify({
    feature: 'demo',
    governor: {},
    criteria: [{
      id: 'CAP-demo-submit-proof',
      description: 'CAP-demo-submit and AC-demo-01 focused executable proof',
      binary: true,
      verification: 'node --test tests/demo.test.js'
    }]
  }));
  const harness = await runHarnessCheck({
    args: [dir],
    options: { slug: 'demo', json: true, strict: true },
    logger: logger(),
    t: () => undefined
  });
  assert.equal(harness.ok, true, JSON.stringify(harness, null, 2));
}

test('gates, chain validation, spec analysis, preflight, and handoff all reject the same substantive-but-thin feature', async () => {
  const dir = await makeTmpDir();
  await writePresenceOnlyChain(dir);

  const gate = await runGateCheck({
    args: [dir],
    options: { json: true, feature: 'demo', gate: 'A' },
    logger: logger()
  });
  const artifact = await runArtifactValidate({
    args: [dir],
    options: { json: true, feature: 'demo' },
    logger: logger()
  });
  const spec = await runSpecAnalyze({
    args: [dir],
    options: { json: true, feature: 'demo' },
    logger: logger()
  });
  const preflight = await runPreflight({
    args: [dir],
    options: { json: true, agent: 'dev', feature: 'demo' },
    logger: logger()
  });
  const handoff = await validateHandoffContract(dir, {
    mode: 'feature',
    featureSlug: 'demo',
    classification: 'SMALL',
    sequence: ['product', 'sheldon', 'dev', 'qa']
  }, 'product');
  const pentesterHandoff = await validateHandoffContract(dir, {
    mode: 'feature',
    featureSlug: 'demo',
    classification: 'SMALL',
    sequence: ['pentester']
  }, 'pentester');

  assert.equal(gate.ok, false);
  assert.ok(gate.missing.some((item) => item.includes('feature_capability_map_missing')));
  assert.equal(artifact.ok, false);
  assert.equal(artifact.missing_required.length, 0, 'files exist; content is the blocker');
  assert.equal(artifact.content_integrity.valid, false);
  assert.equal(artifact.next_agent.startsWith('@product'), true);
  assert.equal(spec.ok, false);
  assert.ok(spec.findings.some((item) => item.check === 'feature_capability_matrix_missing'));
  assert.equal(preflight.readiness, 'BLOCKED');
  assert.ok(preflight.readiness_blockers.some((item) => item.includes('feature completeness')));
  assert.equal(handoff.ok, false);
  assert.ok(handoff.missing.some((item) => item.includes('feature_capability_map_missing')));
  assert.equal(pentesterHandoff.ok, false);
  assert.ok(pentesterHandoff.missing.some((item) => item.includes('feature completeness')));
});

test('Gate D rejects empty AC-name-only tests under the completeness contract and passes asserting evidence', async () => {
  const dir = await makeTmpDir();
  await writeCompleteChain(dir);
  await writeFile(dir, 'tests/demo.test.js', "test('AC-demo-01 persisted result', () => {});\n");

  const weak = await runGateCheck({
    args: [dir],
    options: { json: true, feature: 'demo', gate: 'D' },
    logger: logger()
  });

  assert.equal(weak.ok, false);
  assert.ok(weak.missing.some((item) => item.includes('AC test audit failed')));
  assert.ok(weak.evidence.some((item) => item.type === 'ac_test_audit' && item.summary.weak === 1));
  const weakTesterHandoff = await validateHandoffContract(dir, {
    mode: 'feature',
    featureSlug: 'demo',
    classification: 'SMALL',
    sequence: ['tester']
  }, 'tester');
  assert.equal(weakTesterHandoff.ok, false);
  assert.ok(weakTesterHandoff.missing.some((item) => item.includes('AC test audit failed')));

  await writeFile(dir, 'tests/demo.test.js', [
    "const test = require('node:test');",
    "const assert = require('node:assert/strict');",
    "const { runDemo } = require('../src/demo');",
    "test('AC-demo-01 persisted result', () => { assert.equal(runDemo(), 'result-1'); });"
  ].join('\n'));
  await writeExecutionEvidence(dir);
  const strong = await runGateCheck({
    args: [dir],
    options: { json: true, feature: 'demo', gate: 'D' },
    logger: logger()
  });

  assert.equal(strong.ok, true, strong.missing.join('\n'));
  const strongTesterHandoff = await validateHandoffContract(dir, {
    mode: 'feature',
    featureSlug: 'demo',
    classification: 'SMALL',
    sequence: ['tester']
  }, 'tester');
  assert.equal(strongTesterHandoff.ok, true, strongTesterHandoff.missing.join('\n'));
});

test('Gate D blocks a planned capability until files and compact per-CAP execution evidence exist', async () => {
  const dir = await makeTmpDir();
  await writeCompleteChain(dir);
  await writeFile(dir, 'tests/demo.test.js', [
    "const test = require('node:test');",
    "const assert = require('node:assert/strict');",
    "const { runDemo } = require('../src/demo');",
    "test('AC-demo-01 persisted result', () => { assert.equal(runDemo(), 'result-1'); });"
  ].join('\n'));

  const missing = await runGateCheck({
    args: [dir],
    options: { json: true, feature: 'demo', gate: 'D' },
    logger: logger()
  });
  assert.equal(missing.ok, false);
  assert.ok(missing.missing.some((item) => item.includes('capability_delivery_files_missing')));
  assert.ok(missing.missing.some((item) => item.includes('implementation_ledger_not_ready')));

  await writeExecutionEvidence(dir, { capabilityIds: ['CAP-demo-other'] });
  const unrelated = await runGateCheck({
    args: [dir],
    options: { json: true, feature: 'demo', gate: 'D' },
    logger: logger()
  });
  assert.equal(unrelated.ok, false);
  assert.ok(unrelated.missing.some((item) => item.includes('capability_implementation_claim_missing')));

  await writeExecutionEvidence(dir);
  const complete = await runGateCheck({
    args: [dir],
    options: { json: true, feature: 'demo', gate: 'D' },
    logger: logger()
  });
  assert.equal(complete.ok, true, complete.missing.join('\n'));
  assert.equal(complete.evidence.find((item) => item.type === 'feature_completeness').summary.executed_capabilities, 1);
});

test('Gate D rejects self-attested passed ledger evidence without a fresh harness result', async () => {
  const dir = await makeTmpDir();
  await writeCompleteChain(dir);
  await writeFile(dir, 'src/demo.js', 'module.exports = { runDemo: () => "result-1" };\n');
  await writeFile(dir, 'tests/demo.test.js', [
    "const test = require('node:test');",
    "const assert = require('node:assert/strict');",
    "const { runDemo } = require('../src/demo');",
    "test('AC-demo-01 persisted result', () => { assert.equal(runDemo(), 'result-1'); });"
  ].join('\n'));
  await writeExecutionEvidence(dir);
  await fs.rm(path.join(dir, '.aioson/plans/demo/last-check-output.json'));

  const result = await runGateCheck({
    args: [dir],
    options: { json: true, feature: 'demo', gate: 'D' },
    logger: logger()
  });

  assert.equal(result.ok, false);
  assert.ok(result.missing.some((item) => item.includes('missing_or_failed_harness_report')));
});

test('Gate D rejects unresolved blocking gaps even when harness proof passes', async () => {
  const dir = await makeTmpDir();
  await writeCompleteChain(dir);
  await writeFile(dir, 'tests/demo.test.js', [
    "const test = require('node:test');",
    "const assert = require('node:assert/strict');",
    "const { runDemo } = require('../src/demo');",
    "test('AC-demo-01 persisted result', () => { assert.equal(runDemo(), 'result-1'); });"
  ].join('\n'));
  await writeExecutionEvidence(dir, {
    knownGaps: [{ id: 'GAP-demo-data-loss', gap: 'Data-loss path unresolved', owner: 'dev', blocks: true }]
  });

  const result = await runGateCheck({
    args: [dir],
    options: { json: true, feature: 'demo', gate: 'D' },
    logger: logger()
  });

  assert.equal(result.ok, false);
  assert.ok(result.missing.some((item) => item.includes('implementation_ledger_blocking_gaps')));
});

test('Gate D rejects a harness report made stale by a later implementation change', async () => {
  const dir = await makeTmpDir();
  await writeCompleteChain(dir);
  await writeFile(dir, 'tests/demo.test.js', [
    "const test = require('node:test');",
    "const assert = require('node:assert/strict');",
    "const { runDemo } = require('../src/demo');",
    "test('AC-demo-01 persisted result', () => { assert.equal(runDemo(), 'result-1'); });"
  ].join('\n'));
  await writeExecutionEvidence(dir);
  await new Promise((resolve) => setTimeout(resolve, 20));
  await writeFile(dir, 'src/demo.js', 'module.exports = { runDemo: () => "changed-after-check" };\n');

  const result = await runGateCheck({
    args: [dir],
    options: { json: true, feature: 'demo', gate: 'D' },
    logger: logger()
  });

  assert.equal(result.ok, false);
  assert.ok(result.missing.some((item) => item.includes('stale_harness_report')));
});
