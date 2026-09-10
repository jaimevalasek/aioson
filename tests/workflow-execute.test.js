'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  buildAgenticPolicy,
  quoteCliArg,
  runWorkflowExecute,
  EXECUTION_STATE_RELATIVE_PATH
} = require('../src/commands/workflow-execute');
const { approveAndSealSheldonReview } = require('./helpers/feature-evidence');

async function makeTmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-workflow-exec-'));
}

async function writeFile(dir, relPath, content) {
  const full = path.join(dir, relPath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, 'utf8');
}

function makeLogger() {
  const lines = [];
  const errors = [];
  return {
    log: (msg = '') => lines.push(String(msg)),
    error: (msg = '') => errors.push(String(msg)),
    lines,
    errors
  };
}

test('workflow:execute: requires --feature', async () => {
  const tmpDir = await makeTmpDir();
  const result = await runWorkflowExecute({
    args: [tmpDir],
    options: { json: true, 'dry-run': true },
    logger: makeLogger()
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing_feature');
});

test('workflow:execute: dry-run returns plan without executing', async () => {
  const tmpDir = await makeTmpDir();
  const result = await runWorkflowExecute({
    args: [tmpDir],
    options: { json: true, feature: 'checkout', 'dry-run': true, classification: 'SMALL' },
    logger: makeLogger()
  });
  assert.equal(result.ok, true);
  assert.equal(result.dry_run, true);
  assert.ok(Array.isArray(result.steps));
  assert.ok(result.steps.length > 0);
  assert.equal(result.feature, 'checkout');
  assert.equal(result.execution_state_path, EXECUTION_STATE_RELATIVE_PATH);
  assert.equal(typeof result.resume_command, 'string');
  assert.ok(result.status_snapshot);
  assert.ok(result.suggestion);
  assert.deepEqual(result.autopilot_signal, { enabled: true, source: 'agent_execution_default' });
  assert.equal(result.max_checkpoints, 10);
});

test('workflow:execute --seed: writes the scheme with an enabled agentic_policy and does NOT advance stages', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/project.context.md', '---\nclassification: MEDIUM\n---\n# ctx\n');
  await writeFile(tmpDir, '.aioson/context/prd-cart.md', `---
classification: MEDIUM
product_scope: approved
prd_ready: approved
sheldon_review: pending
---
# PRD

## Feature Capability Map
| CAP | Promised outcome | Actor / trigger | Scope decision | Rationale |
|---|---|---|---|---|
| CAP-cart-01 | User sees cart | User opens cart | required | Core promise |

## Acceptance Criteria
| AC | CAP | Observable behavior | Evidence |
|---|---|---|---|
| AC-cart-01 | CAP-cart-01 | Cart appears | focused test |
`);
  await writeFile(
    tmpDir,
    '.aioson/context/features.md',
    '# Features\n\n| slug | status | started | completed |\n|---|---|---|---|\n| cart | in_progress | 2026-07-01 | |\n'
  );

  const result = await runWorkflowExecute({
    args: [tmpDir],
    options: { json: true, feature: 'cart', seed: true, tool: 'claude' },
    logger: makeLogger()
  });

  assert.equal(result.ok, true);
  assert.equal(result.seeded, true);
  // The scheme records an ENABLED agentic policy — the signal interactive agents follow.
  assert.ok(result.agentic_policy);
  assert.equal(result.agentic_policy.enabled, true);
  assert.equal(result.agentic_policy.review_cycle.feature_close, 'human_gate');
  // Seed persists BOTH state files.
  const scheme = JSON.parse(await fs.readFile(path.join(tmpDir, EXECUTION_STATE_RELATIVE_PATH), 'utf8'));
  assert.equal(scheme.agentic_policy.enabled, true);
  const executionManifest = JSON.parse(
    await fs.readFile(path.join(tmpDir, '.aioson/context/agent-execution-cart.json'), 'utf8')
  );
  assert.deepEqual(executionManifest.cycle_limits, { dev_qa: 1, tester: 1, pentester: 1 });
  assert.ok(Object.values(executionManifest.agents).every(agent => !Object.hasOwn(agent, 'reasoning_effort')));
  const state = JSON.parse(await fs.readFile(path.join(tmpDir, '.aioson/context/workflow.state.json'), 'utf8'));
  assert.equal(state.mode, 'feature');
  // Seed must NOT drive a stage transition — current stays null (no activation happened).
  assert.equal(state.current, null);
  // ...but the sequence + next reflect the feature lane with product inferred done.
  assert.ok(state.sequence.includes('dev'));
  assert.deepEqual(state.completed, ['product']);
});

test('workflow:execute --seed: is idempotent (re-seeding the same slug resumes, does not error)', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/project.context.md', '---\nclassification: SMALL\n---\n# ctx\n');
  await writeFile(tmpDir, '.aioson/context/prd-login.md', '---\nclassification: SMALL\n---\n# prd\n');
  await writeFile(
    tmpDir,
    '.aioson/context/features.md',
    '# Features\n\n| slug | status | started | completed |\n|---|---|---|---|\n| login | in_progress | 2026-07-01 | |\n'
  );
  const opts = { json: true, feature: 'login', seed: true };
  const first = await runWorkflowExecute({ args: [tmpDir], options: opts, logger: makeLogger() });
  const second = await runWorkflowExecute({ args: [tmpDir], options: opts, logger: makeLogger() });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(second.resumed, true);
});

test('workflow:execute: effective project Autopilot derives the default checkpoint budget instead of one', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(
    tmpDir,
    '.aioson/context/project.context.md',
    '---\nclassification: SMALL\nauto_handoff: true\n---\n# ctx\n'
  );
  const result = await runWorkflowExecute({
    args: [tmpDir],
    options: { json: true, feature: 'autopilot-default', 'dry-run': true },
    logger: makeLogger()
  });
  assert.equal(result.ok, true);
  assert.equal(result.autopilot_signal.enabled, true);
  assert.equal(result.autopilot_signal.source, 'frontmatter');
  assert.equal(result.max_checkpoints, 10);
  assert.equal(result.orchestration_policy.max_checkpoints, 10);
  assert.match(result.resume_command, /--max-checkpoints='10'/);
});

test('workflow:execute --seed: explicit cycle options initialize the execution manifest, including zero', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/project.context.md', '---\nclassification: SMALL\n---\n# ctx\n');
  await writeFile(tmpDir, '.aioson/context/prd-review.md', '---\nclassification: SMALL\n---\n# prd\n');
  await writeFile(
    tmpDir,
    '.aioson/context/features.md',
    '# Features\n\n| slug | status | started | completed |\n|---|---|---|---|\n| review | in_progress | 2026-07-01 | |\n'
  );

  const result = await runWorkflowExecute({
    args: [tmpDir],
    options: {
      json: true,
      feature: 'review',
      seed: true,
      'max-dev-qa-cycles': '1',
      'max-tester-cycles': '0',
      'max-pentester-cycles': '2'
    },
    logger: makeLogger()
  });

  assert.equal(result.ok, true);
  const manifest = JSON.parse(
    await fs.readFile(path.join(tmpDir, '.aioson/context/agent-execution-review.json'), 'utf8')
  );
  assert.deepEqual(manifest.cycle_limits, { dev_qa: 1, tester: 0, pentester: 2 });
  assert.equal(result.agentic_policy.review_cycle.max_dev_qa_cycles, 1);
  assert.equal(result.agentic_policy.review_cycle.max_tester_correction_cycles, 0);
  assert.equal(result.agentic_policy.review_cycle.max_pentester_correction_cycles, 2);
});

test('workflow:execute --seed: never rewrites developer-owned manifest settings, even with new overrides', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/project.context.md', '---\nclassification: SMALL\n---\n# ctx\n');
  await writeFile(tmpDir, '.aioson/context/prd-preserve.md', '---\nclassification: SMALL\n---\n# prd\n');
  await writeFile(
    tmpDir,
    '.aioson/context/features.md',
    '# Features\n\n| slug | status | started | completed |\n|---|---|---|---|\n| preserve | in_progress | 2026-07-01 | |\n'
  );
  const initial = await runWorkflowExecute({
    args: [tmpDir],
    options: { json: true, feature: 'preserve', seed: true, tool: 'codex' },
    logger: makeLogger()
  });
  assert.equal(initial.ok, true);
  const manifestPath = path.join(tmpDir, '.aioson/context/agent-execution-preserve.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  manifest.agents.dev.model = 'gpt-custom';
  manifest.agents.dev.reasoning_effort = 'high';
  manifest.agents.qa.enabled = false;
  manifest.cycle_limits = { dev_qa: 2, tester: 0, pentester: 2 };
  const developerOwnedBytes = `${JSON.stringify(manifest, null, 4)}\r\n`;
  await fs.writeFile(manifestPath, developerOwnedBytes, 'utf8');

  const resumed = await runWorkflowExecute({
    args: [tmpDir],
    options: {
      json: true,
      feature: 'preserve',
      seed: true,
      tool: 'codex',
      'max-dev-qa-cycles': '9',
      'max-tester-cycles': '9',
      'max-pentester-cycles': '9'
    },
    logger: makeLogger()
  });

  assert.equal(resumed.ok, true);
  assert.equal(await fs.readFile(manifestPath, 'utf8'), developerOwnedBytes);
  const preserved = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  assert.equal(preserved.agents.dev.model, 'gpt-custom');
  assert.equal(preserved.agents.dev.reasoning_effort, 'high');
  assert.equal(preserved.agents.qa.enabled, false);
  assert.deepEqual(preserved.cycle_limits, { dev_qa: 2, tester: 0, pentester: 2 });
  assert.equal(resumed.agentic_policy.review_cycle.max_dev_qa_cycles, 2);
  assert.equal(resumed.agentic_policy.review_cycle.max_tester_correction_cycles, 0);
  assert.equal(resumed.agentic_policy.review_cycle.max_pentester_correction_cycles, 2);
});

test('workflow:execute: buildAgenticPolicy encodes bounded review loops and sidecars', () => {
  const policy = buildAgenticPolicy({
    agentic: true,
    'max-dev-qa-cycles': '3',
    'max-tester-cycles': '2',
    'max-pentester-cycles': '4'
  }, 'MEDIUM');

  assert.equal(policy.enabled, true);
  assert.equal(policy.mode, 'runtime_policy');
  assert.equal(policy.review_cycle.max_dev_qa_cycles, 3);
  assert.equal(policy.review_cycle.max_tester_correction_cycles, 2);
  assert.equal(policy.review_cycle.max_pentester_correction_cycles, 4);
  assert.equal(policy.review_cycle.feature_close, 'human_gate');
  assert.equal(policy.lanes.enabled, true);
  assert.equal(policy.lanes.strategy, 'parallelize_only_independent_write_scopes');
  assert.ok(policy.sidecars.scouts.allowed_parent_agents.includes('dev'));
  assert.ok(policy.stop_conditions.includes('cycle_limit_reached'));
});

test('workflow:execute: dry-run --agentic returns runtime policy and resumable command', async () => {
  const tmpDir = await makeTmpDir();
  const result = await runWorkflowExecute({
    args: [tmpDir],
    options: {
      json: true,
      feature: 'checkout',
      'dry-run': true,
      classification: 'MEDIUM',
      agentic: true,
      'max-dev-qa-cycles': '4',
      'max-tester-cycles': '2',
      'max-pentester-cycles': '5'
    },
    logger: makeLogger()
  });

  assert.equal(result.ok, true);
  assert.equal(result.agentic_policy.enabled, true);
  assert.equal(result.agentic_policy.review_cycle.max_dev_qa_cycles, 4);
  assert.equal(result.agentic_policy.review_cycle.max_tester_correction_cycles, 2);
  assert.equal(result.agentic_policy.review_cycle.max_pentester_correction_cycles, 5);
  assert.equal(result.agentic_policy.lanes.enabled, true);
  assert.match(result.resume_command, /--agentic/);
  assert.match(result.resume_command, /--max-dev-qa-cycles='4'/);
  assert.match(result.resume_command, /--max-tester-cycles='2'/);
  assert.match(result.resume_command, /--max-pentester-cycles='5'/);
});

test('workflow:execute: dry-run SMALL uses Product, Sheldon, Planner, Dev, and QA', async () => {
  const tmpDir = await makeTmpDir();
  const result = await runWorkflowExecute({
    args: [tmpDir],
    options: { json: true, feature: 'checkout', 'dry-run': true, classification: 'SMALL' },
    logger: makeLogger()
  });
  const agents = result.steps.map((s) => s.agent);
  assert.ok(agents.includes('product'));
  assert.ok(agents.includes('planner'));
  assert.ok(agents.includes('sheldon'));
  assert.ok(agents.includes('dev'));
  assert.ok(agents.includes('qa'));
  assert.ok(!agents.includes('analyst'), 'lean SMALL drops analyst');
  assert.ok(!agents.includes('scope-check'), 'lean SMALL drops scope-check');
});

test('workflow:execute: dry-run MICRO follows the official feature sequence', async () => {
  const tmpDir = await makeTmpDir();
  const result = await runWorkflowExecute({
    args: [tmpDir],
    options: { json: true, feature: 'small-fix', 'dry-run': true, classification: 'MICRO' },
    logger: makeLogger()
  });
  const agents = result.steps.map((s) => s.agent);
  assert.ok(agents.includes('product'));
  assert.ok(agents.includes('planner'));
  assert.ok(agents.includes('dev'));
  assert.ok(agents.includes('qa'));
});

test('workflow:execute: dry-run skips product when prd already exists', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/prd-checkout.md', `---
classification: SMALL
product_scope: approved
prd_ready: approved
---
# PRD
## Feature Capability Map
| CAP | Promised outcome | Actor / trigger | Scope decision | Rationale |
|---|---|---|---|---|
| CAP-checkout-01 | Checkout visible | User opens checkout | required | Core |
## Acceptance Criteria
| AC | CAP | Observable behavior | Evidence |
|---|---|---|---|
| AC-checkout-01 | CAP-checkout-01 | Checkout appears | focused test |
`);
  const result = await runWorkflowExecute({
    args: [tmpDir],
    options: { json: true, feature: 'checkout', 'dry-run': true, classification: 'SMALL' },
    logger: makeLogger()
  });
  const productStep = result.steps.find((s) => s.agent === 'product');
  assert.ok(productStep);
  assert.equal(productStep.status, 'completed');
  assert.equal(productStep.skip, true);
});

test('workflow:execute: reads classification from project.context.md', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/project.context.md', '---\nclassification: MEDIUM\n---');
  const result = await runWorkflowExecute({
    args: [tmpDir],
    options: { json: true, feature: 'feat', 'dry-run': true },
    logger: makeLogger()
  });
  assert.equal(result.classification, 'MEDIUM');
});

test('workflow:execute: explicit --classification overrides project context during dry-run', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/project.context.md', '---\nclassification: MEDIUM\n---');

  const result = await runWorkflowExecute({
    args: [tmpDir],
    options: { json: true, feature: 'small-fix', 'dry-run': true, classification: 'MICRO' },
    logger: makeLogger()
  });

  assert.equal(result.ok, true);
  assert.equal(result.classification, 'MICRO');
  assert.deepEqual(result.steps.map((step) => step.agent), ['product', 'sheldon', 'planner', 'dev', 'qa']);
  assert.equal(result.status_snapshot.classification, 'MICRO');
  assert.equal(Array.isArray(result.status_snapshot.artifacts), true);
  assert.equal(Object.hasOwn(result.status_snapshot.artifacts[0], 'content'), false);
});

test('workflow:execute: dry-run does not create workflow state or execution checkpoint', async () => {
  const tmpDir = await makeTmpDir();

  const result = await runWorkflowExecute({
    args: [tmpDir],
    options: { json: true, feature: 'preview-only', 'dry-run': true, classification: 'SMALL' },
    logger: makeLogger()
  });

  assert.equal(result.ok, true);
  await assert.rejects(
    fs.access(path.join(tmpDir, '.aioson/context/workflow.state.json')),
    { code: 'ENOENT' }
  );
  await assert.rejects(
    fs.access(path.join(tmpDir, EXECUTION_STATE_RELATIVE_PATH)),
    { code: 'ENOENT' }
  );
});

test('workflow:execute rejects a command-shaped feature slug before resume state is built', async () => {
  const tmpDir = await makeTmpDir();
  const result = await runWorkflowExecute({
    args: [tmpDir],
    options: {
      json: true,
      feature: 'poc;echo AIOSON_POC',
      'dry-run': true,
      classification: 'MICRO',
      tool: 'codex'
    },
    logger: makeLogger()
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'invalid_feature_slug');
  assert.equal(result.resume_command, undefined);
  assert.equal(quoteCliArg("codex'; echo AIOSON_POC"), "'codex'\\''; echo AIOSON_POC'");
});

test('workflow:execute: dry-run human output mentions plan', async () => {
  const tmpDir = await makeTmpDir();
  const logger = makeLogger();
  await runWorkflowExecute({
    args: [tmpDir],
    options: { feature: 'checkout', 'dry-run': true, classification: 'SMALL' },
    logger
  });
  assert.ok(logger.lines.some((l) => l.includes('Plan') || l.includes('Step') || l.includes('@')));
});

test('workflow:execute: start-from skips earlier steps', async () => {
  const tmpDir = await makeTmpDir();
  const result = await runWorkflowExecute({
    args: [tmpDir],
    options: {
      json: true, feature: 'checkout', 'dry-run': true,
      classification: 'SMALL', 'start-from': 'dev'
    },
    logger: makeLogger()
  });
  const agents = result.steps.map((s) => s.agent);
  assert.ok(!agents.includes('product'));
  assert.ok(!agents.includes('analyst'));
  assert.ok(agents.includes('dev'));
});

test('workflow:execute: blocks explicit headless mode when tool policy requires tty', async () => {
  const tmpDir = await makeTmpDir();
  const result = await runWorkflowExecute({
    args: [tmpDir],
    options: { json: true, feature: 'checkout', 'dry-run': true, classification: 'SMALL', tool: 'opencode', mode: 'headless' },
    logger: makeLogger()
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'headless_not_supported');
  assert.equal(result.tool, 'opencode');
});

test('workflow:execute: dry-run predicts blockers for an active stage with missing contract items', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/project.context.md', '---\nclassification: SMALL\n---');
  await writeFile(tmpDir, '.aioson/context/prd-checkout.md', '# PRD');
  await writeFile(tmpDir, '.aioson/context/requirements-checkout.md', '# Requirements');
  await writeFile(tmpDir, '.aioson/context/spec-checkout.md', '---\ngate_requirements: approved\ngate_plan: pending\n---\n# Spec');
  await writeFile(
    tmpDir,
    '.aioson/context/features.md',
    '# Features\n\n| slug | status | started | completed |\n|------|--------|---------|-----------|\n| checkout | in_progress | 2026-06-02 | — |\n'
  );
  await writeFile(
    tmpDir,
    '.aioson/context/workflow.state.json',
    JSON.stringify({
      version: 1,
      mode: 'feature',
      classification: 'SMALL',
      sequence: ['product', 'analyst', 'scope-check', 'architect', 'discovery-design-doc', 'dev', 'qa'],
      current: 'dev',
      next: 'qa',
      completed: ['product', 'analyst'],
      skipped: [],
      featureSlug: 'checkout',
      detour: null,
      updatedAt: new Date().toISOString()
    }, null, 2)
  );

  const result = await runWorkflowExecute({
    args: [tmpDir],
    options: { json: true, feature: 'checkout', 'dry-run': true, tool: 'codex' },
    logger: makeLogger()
  });

  const devStep = result.steps.find((step) => step.agent === 'dev');
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.resumed, true);
  assert.equal(devStep.status, 'active');
  assert.ok(devStep.predicted_blockers.some((item) => item.toLowerCase().includes('gate c')));
});

test('workflow:execute: resumes an existing feature workflow and writes a checkpoint file', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(
    tmpDir,
    '.aioson/context/project.context.md',
    `---\nproject_name: "demo"\nproject_type: "api"\nprofile: "developer"\nframework: "Node.js"\nframework_installed: true\nclassification: "SMALL"\nconversation_language: "en"\naioson_version: "1.2.1"\n---\n`
  );
  await writeFile(tmpDir, '.aioson/context/prd-checkout.md', `---
classification: SMALL
product_scope: approved
prd_ready: approved
sheldon_review: pending
---
# PRD

## Feature Capability Map

| CAP | Promised outcome | Actor / trigger | Scope decision | Rationale |
|---|---|---|---|---|
| CAP-checkout-01 | User completes checkout | User submits | required | Core promise |

## Acceptance Criteria

| AC | CAP | Observable behavior | Evidence |
|---|---|---|---|
| AC-checkout-01 | CAP-checkout-01 | Checkout result appears | integration test |
`);
  await approveAndSealSheldonReview(tmpDir, 'checkout');
  await writeFile(tmpDir, '.aioson/context/implementation-plan-checkout.md', `---
status: approved
---
# Plan

## Capability Delivery Plan

| CAP | Phase | Files | Verification |
|---|---|---|---|
| CAP-checkout-01 | 1 | src/checkout.js, tests/checkout.test.js | node --test |
`);
  await writeFile(tmpDir, 'src/checkout.js', 'module.exports = true;\n');
  await writeFile(tmpDir, 'tests/checkout.test.js', "const test=require('node:test'); const assert=require('node:assert/strict'); test('AC-checkout-01',()=>assert.equal(true,true));\n");
  await writeFile(tmpDir, '.aioson/context/project-pulse.md', '# Pulse');
  await writeFile(tmpDir, '.aioson/context/dev-state.md', '# Dev State');
  await writeFile(
    tmpDir,
    '.aioson/context/features.md',
    '# Features\n\n| slug | status | started | completed |\n|------|--------|---------|-----------|\n| checkout | in_progress | 2026-06-02 | — |\n'
  );
  await writeFile(
    tmpDir,
    '.aioson/config/autonomy-protocol.json',
    JSON.stringify({
      version: '1.0',
      global_mode: 'guarded',
      tools: {
        codex: {
          mode: 'trusted',
          requires_tty: false
        }
      },
      agents: {
        dev: {
          max_mode: 'trusted'
        }
      }
    }, null, 2)
  );
  await writeFile(
    tmpDir,
    '.aioson/context/workflow.state.json',
    JSON.stringify({
      version: 1,
      mode: 'feature',
      classification: 'SMALL',
      sequence: ['product', 'sheldon', 'planner', 'dev', 'qa'],
      current: 'dev',
      next: 'qa',
      completed: ['product', 'sheldon', 'planner'],
      skipped: [],
      featureSlug: 'checkout',
      detour: null,
      updatedAt: new Date().toISOString()
    }, null, 2)
  );

  const result = await runWorkflowExecute({
    args: [tmpDir],
    options: { json: true, feature: 'checkout', tool: 'codex', agentic: true },
    logger: makeLogger()
  });

  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.resumed, true);
  assert.equal(result.active_stage, 'qa');
  assert.equal(result.checkpoint.active_stage, 'qa');
  assert.equal(result.checkpoint.effective_mode, 'guarded');
  assert.ok(result.status_snapshot);
  assert.ok(result.suggestion);
  assert.equal(typeof result.resume_command, 'string');
  assert.equal(result.agentic_policy.enabled, true);
  assert.equal(result.agentic_policy.review_cycle.max_dev_qa_cycles, 1);

  const executionState = JSON.parse(
    await fs.readFile(path.join(tmpDir, EXECUTION_STATE_RELATIVE_PATH), 'utf8')
  );
  assert.equal(executionState.feature, 'checkout');
  assert.equal(executionState.status, 'active');
  assert.equal(executionState.checkpoint.active_stage, 'qa');
  assert.ok(Array.isArray(executionState.history));
  assert.equal(executionState.history.length, 1);
  assert.ok(executionState.status_snapshot);
  assert.ok(executionState.suggestion);
  assert.equal(typeof executionState.resume_command, 'string');
  assert.equal(executionState.agentic_policy.enabled, true);
  assert.equal(executionState.agentic_policy.review_cycle.max_dev_qa_cycles, 1);
});

test('workflow:execute: advances multiple checkpoints when --max-checkpoints is provided', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(
    tmpDir,
    '.aioson/context/project.context.md',
    `---\nproject_name: "demo"\nproject_type: "api"\nprofile: "developer"\nframework: "Node.js"\nframework_installed: true\nclassification: "SMALL"\nconversation_language: "en"\naioson_version: "1.2.1"\n---\n`
  );
  await writeFile(tmpDir, '.aioson/context/prd-checkout.md', `---
classification: SMALL
product_scope: approved
prd_ready: approved
---
# PRD
## Feature Capability Map
| CAP | Promised outcome | Actor / trigger | Scope decision | Rationale |
|---|---|---|---|---|
| CAP-checkout-01 | User completes checkout | User submits | required | Core |
## Acceptance Criteria
| AC | CAP | Observable behavior | Evidence |
|---|---|---|---|
| AC-checkout-01 | CAP-checkout-01 | Checkout succeeds | focused test |
`);
  await approveAndSealSheldonReview(tmpDir, 'checkout');
  await writeFile(tmpDir, '.aioson/context/implementation-plan-checkout.md', `---
status: approved
---
# Plan
## Capability Delivery Plan
| CAP | Phase | Files | Verification |
|---|---|---|---|
| CAP-checkout-01 | 1 | src/checkout.js, tests/checkout.test.js | node --test |
`);
  await writeFile(tmpDir, '.aioson/context/project-pulse.md', '# Pulse');
  await writeFile(
    tmpDir,
    '.aioson/context/features.md',
    '# Features\n\n| slug | status | started | completed |\n|------|--------|---------|-----------|\n| checkout | in_progress | 2026-06-02 | — |\n'
  );
  await writeFile(
    tmpDir,
    '.aioson/context/workflow.state.json',
    JSON.stringify({
      version: 1,
      mode: 'feature',
      classification: 'SMALL',
      sequence: ['product', 'sheldon', 'planner', 'dev', 'qa'],
      current: 'product',
      next: 'sheldon',
      completed: [],
      skipped: [],
      featureSlug: 'checkout',
      detour: null,
      updatedAt: new Date().toISOString()
    }, null, 2)
  );

  const result = await runWorkflowExecute({
    args: [tmpDir],
    options: { json: true, feature: 'checkout', tool: 'codex', 'max-checkpoints': 2 },
    logger: makeLogger()
  });

  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.max_checkpoints, 2);
  assert.equal(result.active_stage, 'planner');
  assert.ok(Array.isArray(result.transitions));
  assert.equal(result.transitions.length, 2);
  assert.deepEqual(
    result.transitions.map((transition) => transition.transition),
    ['complete', 'complete']
  );
  assert.deepEqual(
    result.transitions.map((transition) => transition.agent),
    ['product', 'sheldon']
  );
  assert.equal(result.execution_state.checkpoint.active_stage, 'planner');
  assert.equal(result.execution_state.status_snapshot.activeStage, 'planner');
  assert.equal(result.execution_state.suggestion.action, 'complete_stage');
  assert.ok(result.resume_command.includes("--max-checkpoints='2'"));

  const executionState = JSON.parse(
    await fs.readFile(path.join(tmpDir, EXECUTION_STATE_RELATIVE_PATH), 'utf8')
  );
  assert.equal(executionState.status, 'active');
  assert.equal(executionState.checkpoint.active_stage, 'planner');
  assert.ok(Array.isArray(executionState.history));
  assert.equal(executionState.history.length, 1);
});

test('workflow:execute: completes cleanly when the workflow has no pending stage', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(
    tmpDir,
    '.aioson/context/project.context.md',
    `---\nproject_name: "demo"\nproject_type: "api"\nprofile: "developer"\nframework: "Node.js"\nframework_installed: true\nclassification: "SMALL"\nconversation_language: "en"\naioson_version: "1.2.1"\n---\n`
  );
  await writeFile(
    tmpDir,
    '.aioson/context/workflow.state.json',
    JSON.stringify({
      version: 1,
      mode: 'feature',
      classification: 'SMALL',
      sequence: ['product', 'analyst', 'scope-check', 'architect', 'discovery-design-doc', 'dev', 'qa'],
      current: null,
      next: null,
      completed: ['product', 'analyst', 'scope-check', 'architect', 'discovery-design-doc', 'dev', 'qa'],
      skipped: [],
      featureSlug: 'checkout',
      detour: null,
      updatedAt: new Date().toISOString()
    }, null, 2)
  );
  await writeFile(
    tmpDir,
    '.aioson/context/features.md',
    '# Features\n\n| slug | status | started | completed |\n|------|--------|---------|-----------|\n| checkout | in_progress | 2026-06-02 | — |\n'
  );

  const result = await runWorkflowExecute({
    args: [tmpDir],
    options: { json: true, feature: 'checkout', tool: 'codex' },
    logger: makeLogger()
  });

  assert.equal(result.ok, true);
  assert.equal(result.active_stage, null);
  assert.equal(result.checkpoint.active_stage, null);
  assert.equal(result.execution_state.status, 'completed');
  assert.equal(result.suggestion.action, 'workflow_complete');
  assert.deepEqual(result.transitions, []);
});

test('workflow:execute: refuses to override a different active feature workflow', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/project.context.md', '---\nclassification: SMALL\n---');
  await writeFile(
    tmpDir,
    '.aioson/context/features.md',
    '# Features\n\n| slug | status | started | completed |\n|------|--------|---------|-----------|\n| billing | in_progress | 2026-06-02 | — |\n'
  );
  await writeFile(
    tmpDir,
    '.aioson/context/workflow.state.json',
    JSON.stringify({
      version: 1,
      mode: 'feature',
      classification: 'SMALL',
      sequence: ['product', 'analyst', 'dev', 'qa'],
      current: 'dev',
      next: 'qa',
      completed: ['product', 'analyst'],
      skipped: [],
      featureSlug: 'billing',
      detour: null,
      updatedAt: new Date().toISOString()
    }, null, 2)
  );

  const result = await runWorkflowExecute({
    args: [tmpDir],
    options: { json: true, feature: 'checkout', tool: 'codex' },
    logger: makeLogger()
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'different_active_feature');
  assert.equal(result.active_feature, 'billing');
});

test('workflow:execute: --lane skips guard when no parallel workspace exists', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(
    tmpDir,
    '.aioson/context/project.context.md',
    '---\nclassification: SMALL\n---'
  );

  const result = await runWorkflowExecute({
    args: [tmpDir],
    options: { json: true, feature: 'checkout', 'dry-run': true, lane: 1 },
    logger: makeLogger()
  });

  assert.equal(result.ok, true);
  assert.ok(result.parallel_guard);
  assert.equal(result.parallel_guard.skipped, true);
  assert.equal(result.parallel_guard.reason, 'no_parallel_workspace');
});

test('workflow:execute: --lane returns ok=false when lane not found in parallel workspace', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(
    tmpDir,
    '.aioson/context/project.context.md',
    '---\nclassification: MEDIUM\n---'
  );
  await writeFile(
    tmpDir,
    '.aioson/context/parallel/agent-1.status.md',
    '# Lane 1\n- owner: dev\n- status: pending\n\n## Ownership\n- write_paths: src/api/**\n'
  );

  const result = await runWorkflowExecute({
    args: [tmpDir],
    options: { json: true, feature: 'checkout', 'dry-run': true, lane: 9 },
    logger: makeLogger()
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'parallel_lane_not_found');
  assert.equal(result.lane, 9);
});

test('workflow:execute: --lane reports ok=true when lane has write paths with no conflicts', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(
    tmpDir,
    '.aioson/context/project.context.md',
    '---\nclassification: MEDIUM\n---'
  );
  await writeFile(
    tmpDir,
    '.aioson/context/parallel/agent-1.status.md',
    '# Lane 1\n- owner: backend\n- status: pending\n\n## Ownership\n- write_paths: src/api/**\n'
  );
  await writeFile(
    tmpDir,
    '.aioson/context/parallel/agent-2.status.md',
    '# Lane 2\n- owner: frontend\n- status: pending\n\n## Ownership\n- write_paths: src/ui/**\n'
  );

  const result = await runWorkflowExecute({
    args: [tmpDir],
    options: { json: true, feature: 'checkout', 'dry-run': true, lane: 1 },
    logger: makeLogger()
  });

  assert.equal(result.ok, true);
  assert.ok(result.parallel_guard);
  assert.equal(result.parallel_guard.skipped, false);
  assert.equal(result.parallel_guard.ok, true);
  assert.equal(result.parallel_guard.lane, 1);
  assert.equal(result.parallel_guard.conflictCount, 0);
});

test('workflow:execute: --lane warns when lane write paths conflict with another lane', async () => {
  const tmpDir = await makeTmpDir();
  const logger = makeLogger();
  await writeFile(
    tmpDir,
    '.aioson/context/project.context.md',
    '---\nclassification: MEDIUM\n---'
  );
  await writeFile(
    tmpDir,
    '.aioson/context/parallel/agent-1.status.md',
    '# Lane 1\n- owner: dev1\n- status: pending\n\n## Ownership\n- write_paths: src/shared/**\n'
  );
  await writeFile(
    tmpDir,
    '.aioson/context/parallel/agent-2.status.md',
    '# Lane 2\n- owner: dev2\n- status: pending\n\n## Ownership\n- write_paths: src/shared/**\n'
  );

  const result = await runWorkflowExecute({
    args: [tmpDir],
    options: { json: true, feature: 'checkout', 'dry-run': true, lane: 1 },
    logger
  });

  assert.equal(result.ok, true);
  assert.ok(result.parallel_guard);
  assert.equal(result.parallel_guard.ok, false);
  assert.equal(result.parallel_guard.conflictCount, 1);
  assert.ok(logger.errors.some((line) => line.includes('[parallel:guard]')));
});

test('workflow:execute: parallel_guard is null when no --lane is provided', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(
    tmpDir,
    '.aioson/context/project.context.md',
    '---\nclassification: SMALL\n---'
  );

  const result = await runWorkflowExecute({
    args: [tmpDir],
    options: { json: true, feature: 'checkout', 'dry-run': true },
    logger: makeLogger()
  });

  assert.equal(result.ok, true);
  assert.equal(result.parallel_guard, null);
});

// ── AC-SDLC-08: gate-blocked message format (gate:approve + responsible agent) ─

// Note: the default MEDIUM feature sequence includes design, scope-check, dev, pentester, and qa.
// Some tests use custom workflow.config.json to isolate a specific gate.
// These tests use a custom workflow.config.json to include the relevant agent in the sequence,
// or use 'qa' (which has gate_before='C' and IS in the default feature sequence).

test('workflow:execute: blocked step message includes gate:approve command (Gate A → architect custom sequence)', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/project.context.md', '---\nclassification: SMALL\n---');
  await writeFile(tmpDir, '.aioson/context/prd-feat.md', '# PRD');
  // Custom workflow.config.json includes architect so Gate A blocking is visible
  await writeFile(
    tmpDir,
    '.aioson/context/workflow.config.json',
    JSON.stringify({
      version: 1,
      feature: {
        SMALL: ['product', 'analyst', 'architect', 'dev', 'qa']
      }
    }, null, 2)
  );
  // No requirements → Gate A (requirements) not approved → architect blocked

  const result = await runWorkflowExecute({
    args: [tmpDir],
    options: { json: true, feature: 'feat', 'dry-run': true },
    logger: makeLogger()
  });

  assert.equal(result.ok, true);
  const architectStep = result.steps.find((s) => s.agent === 'architect');
  assert.ok(architectStep, 'architect step must exist in custom sequence');
  assert.equal(architectStep.status, 'blocked', 'architect must be blocked without Gate A');
  assert.ok(architectStep.predicted_blockers.length > 0, 'architect must have predicted blockers');

  const blockerMsg = architectStep.predicted_blockers[0];
  assert.ok(
    blockerMsg.includes('gate:approve'),
    `blocker message must include gate:approve command, got: ${blockerMsg}`
  );
  assert.ok(
    blockerMsg.includes('--gate=A'),
    `blocker message must include --gate=A, got: ${blockerMsg}`
  );
  assert.ok(
    blockerMsg.toLowerCase().includes('responsible'),
    `blocker message must include responsible agent, got: ${blockerMsg}`
  );
});

test('workflow:execute: blocked step message includes feature slug in gate:approve command', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/project.context.md', '---\nclassification: SMALL\n---');
  await writeFile(tmpDir, '.aioson/context/prd-my-feature.md', '# PRD');
  await writeFile(
    tmpDir,
    '.aioson/context/workflow.config.json',
    JSON.stringify({ version: 1, feature: { SMALL: ['product', 'analyst', 'architect', 'dev', 'qa'] } }, null, 2)
  );

  const result = await runWorkflowExecute({
    args: [tmpDir],
    options: { json: true, feature: 'my-feature', 'dry-run': true },
    logger: makeLogger()
  });

  assert.equal(result.ok, true);
  const architectStep = result.steps.find((s) => s.agent === 'architect');
  assert.ok(architectStep && architectStep.predicted_blockers.length > 0, 'architect must be blocked and have blockers');

  const blockerMsg = architectStep.predicted_blockers[0];
  assert.ok(
    blockerMsg.includes("--feature='my-feature'"),
    `blocker must include feature slug in gate:approve command, got: ${blockerMsg}`
  );
});

test('workflow:execute: Gate C blocked qa step names @planner as responsible', async () => {
  const tmpDir = await makeTmpDir();
  // qa has gate_before='C' and IS in the default MEDIUM feature sequence
  await writeFile(tmpDir, '.aioson/context/project.context.md', '---\nclassification: MEDIUM\n---');
  await writeFile(tmpDir, '.aioson/context/prd-feat.md', '# PRD');
  await writeFile(tmpDir, '.aioson/context/requirements-feat.md', '# Reqs');
  await writeFile(tmpDir, '.aioson/context/spec-feat.md',
    '---\ngate_requirements: approved\ngate_design: approved\ngate_plan: pending\n---\n# Spec');
  // Gate C (plan) = pending → qa step blocked

  const result = await runWorkflowExecute({
    args: [tmpDir],
    options: { json: true, feature: 'feat', 'dry-run': true, classification: 'MEDIUM' },
    logger: makeLogger()
  });

  assert.equal(result.ok, true);
  // qa is in MEDIUM feature sequence and has gate_before='C'
  const qaStep = result.steps.find((s) => s.agent === 'qa');
  assert.ok(qaStep, 'qa step must exist in MEDIUM feature sequence');
  assert.equal(qaStep.status, 'blocked', 'qa must be blocked when Gate C is pending');
  assert.ok(qaStep.predicted_blockers.length > 0, 'qa must have predicted blockers');

  const blockerMsg = qaStep.predicted_blockers[0];
  assert.ok(
    blockerMsg.toLowerCase().includes('@planner'),
    `Gate C blocker must mention @planner, got: ${blockerMsg}`
  );
  assert.ok(
    blockerMsg.includes('--gate=C'),
    `Gate C blocker must include --gate=C, got: ${blockerMsg}`
  );
});

test('workflow:execute --seed: infers Product-ready PRD — next is Sheldon', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/project.context.md', '---\nclassification: SMALL\n---\n# ctx\n');
  await writeFile(
    tmpDir,
    '.aioson/context/features.md',
    '# Features\n\n| slug | status | started | completed |\n|---|---|---|---|\n| checkout | in_progress | 2026-07-01 | |\n'
  );
  await writeFile(tmpDir, '.aioson/context/prd-checkout.md', `---
classification: SMALL
product_scope: approved
prd_ready: approved
sheldon_review: pending
---
# PRD

## Feature Capability Map

| CAP | Promised outcome | Actor / trigger | Scope decision | Rationale |
|---|---|---|---|---|
| CAP-checkout-01 | User completes checkout | User submits | required | Core promise |

## Acceptance Criteria

| AC | CAP | Observable behavior | Evidence |
|---|---|---|---|
| AC-checkout-01 | CAP-checkout-01 | Checkout succeeds | integration test |
`);

  const result = await runWorkflowExecute({
    args: [tmpDir],
    options: { json: true, feature: 'checkout', seed: true, tool: 'claude' },
    logger: makeLogger()
  });

  assert.equal(result.ok, true, JSON.stringify(result));
  const state = JSON.parse(await fs.readFile(path.join(tmpDir, '.aioson/context/workflow.state.json'), 'utf8'));
  assert.deepEqual(state.completed, ['product']);
  assert.equal(state.next, 'sheldon');
  assert.equal(result.next_stage, 'sheldon');
});

test('workflow:execute --seed: infers the approved Planner stage — next is Dev', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/project.context.md', '---\nclassification: MEDIUM\n---\n# ctx\n');
  await writeFile(
    tmpDir,
    '.aioson/context/features.md',
    '# Features\n\n| slug | status | started | completed |\n|---|---|---|---|\n| billing | in_progress | 2026-07-01 | |\n'
  );
  await writeFile(tmpDir, '.aioson/context/prd-billing.md', `---
classification: MEDIUM
product_scope: approved
prd_ready: approved
sheldon_review: pending
---
# PRD

## Feature Capability Map

| CAP | Promised outcome | Actor / trigger | Scope decision | Rationale |
|---|---|---|---|---|
| CAP-billing-01 | User sees billing result | User submits | required | Core promise |

## Acceptance Criteria

| AC | CAP | Observable behavior | Evidence |
|---|---|---|---|
| AC-billing-01 | CAP-billing-01 | Billing result appears | integration test |
`);
  await approveAndSealSheldonReview(tmpDir, 'billing');
  await writeFile(tmpDir, '.aioson/context/implementation-plan-billing.md', `---
status: approved
---
# Plan

## Capability Delivery Plan

| CAP | Phase | Files | Verification |
|---|---|---|---|
| CAP-billing-01 | 1 | src/billing.js, tests/billing.test.js | node --test |
`);

  const result = await runWorkflowExecute({
    args: [tmpDir],
    options: { json: true, feature: 'billing', seed: true, tool: 'claude' },
    logger: makeLogger()
  });

  assert.equal(result.ok, true);
  const state = JSON.parse(await fs.readFile(path.join(tmpDir, '.aioson/context/workflow.state.json'), 'utf8'));
  assert.deepEqual(state.completed, ['product', 'sheldon', 'planner']);
  assert.equal(state.next, 'dev');
});

test('workflow:execute --seed: reseeds over a workflow.state.json from a no-longer-active feature, archiving its progress', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/project.context.md', '---\nclassification: SMALL\n---\n# ctx\n');
  await writeFile(
    tmpDir,
    '.aioson/context/features.md',
    '# Features\n\n| slug | status | started | completed |\n|---|---|---|---|\n| flow-deck | qa_failed | 2026-06-20 | |\n| profile-page | in_progress | 2026-07-01 | |\n'
  );
  await writeFile(tmpDir, '.aioson/context/prd-profile-page.md', '# prd\n');
  // Stale pointer: the FAIL-closed/abandoned feature still holds the state file.
  await writeFile(
    tmpDir,
    '.aioson/context/workflow.state.json',
    JSON.stringify({
      version: 1,
      mode: 'feature',
      classification: 'SMALL',
      sequence: ['product', 'sheldon', 'dev', 'qa'],
      current: null,
      next: 'qa',
      completed: ['product', 'sheldon', 'dev'],
      skipped: [],
      featureSlug: 'flow-deck',
      detour: null,
      updatedAt: new Date().toISOString()
    })
  );

  const result = await runWorkflowExecute({
    args: [tmpDir],
    options: { json: true, feature: 'profile-page', seed: true, tool: 'claude' },
    logger: makeLogger()
  });

  // The old behavior hard-failed with different_active_feature — silently
  // disarming autopilot for the user who explicitly picked it.
  assert.equal(result.ok, true);
  assert.equal(result.seeded, true);
  const state = JSON.parse(await fs.readFile(path.join(tmpDir, '.aioson/context/workflow.state.json'), 'utf8'));
  assert.equal(state.featureSlug, 'profile-page');
  const scheme = JSON.parse(await fs.readFile(path.join(tmpDir, EXECUTION_STATE_RELATIVE_PATH), 'utf8'));
  assert.equal(scheme.agentic_policy.enabled, true);
  assert.equal(scheme.feature, 'profile-page');
  // ...and the replaced feature's progress is archived, never discarded.
  const archived = JSON.parse(await fs.readFile(path.join(tmpDir, '.aioson/context/features/flow-deck/workflow.state.json'), 'utf8'));
  assert.deepEqual(archived.completed, ['product', 'sheldon', 'dev']);
  assert.equal(archived.next, 'qa');
  assert.equal(result.binding.moved.archived, '.aioson/context/features/flow-deck/workflow.state.json');
  assert.equal(result.binding.moved.persisted, true);
});

function featuresTable(rows) {
  return `# Features\n\n| slug | status | started | completed |\n|---|---|---|---|\n${rows.map(([slug, status]) => `| ${slug} | ${status} | 2026-09-01 | |`).join('\n')}\n`;
}

function featureState(slug, overrides = {}) {
  return {
    version: 1,
    mode: 'feature',
    classification: 'SMALL',
    sequence: ['product', 'sheldon', 'planner', 'dev', 'qa'],
    current: 'qa',
    next: 'qa',
    completed: ['product', 'sheldon', 'planner', 'dev'],
    skipped: [],
    featureSlug: slug,
    detour: null,
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides
  };
}

async function readEvents(dir) {
  const raw = await fs.readFile(path.join(dir, '.aioson/context/workflow.events.jsonl'), 'utf8').catch(() => '');
  return raw.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

test('workflow:execute --seed moving the binding archives the outgoing feature\'s progress, and it comes back when the registry returns', async () => {
  // The pulse moved to beta while alpha's live workflow sat at QA; the last
  // handoff still named alpha. Seeding beta once dropped alpha's
  // product..dev with no archive, and back on alpha the workflow restarted
  // at @product (`restored: null`).
  const { loadOrCreateState } = require('../src/commands/workflow-next');
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/project.context.md', '---\nclassification: SMALL\n---\n# ctx\n');
  await writeFile(tmpDir, '.aioson/context/features.md', featuresTable([['alpha', 'in_progress'], ['beta', 'in_progress']]));
  await writeFile(tmpDir, '.aioson/context/prd-alpha.md', '---\nclassification: SMALL\nproduct_scope: approved\nprd_ready: approved\nsheldon_review: pending\n---\n# Alpha\n\n## Feature Capability Map\n| CAP | Promised outcome | Actor / trigger | Scope decision | Rationale |\n|---|---|---|---|---|\n| CAP-alpha-01 | User sees a saved result | User submits | required | Core promise |\n\n## Acceptance Criteria\n| AC | CAP | Observable behavior | Evidence |\n|---|---|---|---|\n| AC-alpha-01 | CAP-alpha-01 | Saved result appears | focused test |\n');
  await approveAndSealSheldonReview(tmpDir, 'alpha');
  await writeFile(tmpDir, '.aioson/context/last-handoff.json', JSON.stringify({ feature_slug: 'alpha', workflow_mode: 'feature' }));
  await writeFile(tmpDir, '.aioson/context/workflow.state.json', JSON.stringify(featureState('alpha')));
  const setPulse = (slug) => writeFile(tmpDir, '.aioson/context/project-pulse.md', `---\nactive_feature: ${slug}\n---\n# Pulse\n`);
  await setPulse('alpha');
  // What the engine makes of alpha's progress while it stays bound — a restore must land exactly here.
  const reference = await loadOrCreateState(tmpDir, { persist: false });
  assert.deepEqual(reference.state.completed, ['product', 'sheldon', 'planner', 'dev']);
  await setPulse('beta');

  const result = await runWorkflowExecute({
    args: [tmpDir],
    options: { json: true, feature: 'beta', seed: true, tool: 'claude' },
    logger: makeLogger()
  });

  assert.equal(result.ok, true);
  assert.equal(result.feature, 'beta');
  const live = JSON.parse(await fs.readFile(path.join(tmpDir, '.aioson/context/workflow.state.json'), 'utf8'));
  assert.equal(live.featureSlug, 'beta');
  const archivePath = path.join(tmpDir, '.aioson/context/features/alpha/workflow.state.json');
  assert.equal(await fs.access(archivePath).then(() => true, () => false), true, 'alpha\'s progress is archived, not dropped');
  const archived = JSON.parse(await fs.readFile(archivePath, 'utf8'));
  assert.deepEqual(archived.completed, ['product', 'sheldon', 'planner', 'dev']);
  assert.equal(archived.current, 'qa');
  assert.deepEqual(result.binding.moved, { from: 'alpha', to: 'beta', mode: 'feature', archived: '.aioson/context/features/alpha/workflow.state.json', persisted: true });
  const event = (await readEvents(tmpDir)).find((entry) => entry.event === 'binding_moved');
  assert.equal(event.from, 'alpha');
  assert.equal(event.to, 'beta');
  assert.equal(event.source, 'workflow:execute');
  assert.equal(event.archived, '.aioson/context/features/alpha/workflow.state.json');

  await setPulse('alpha');
  const back = await loadOrCreateState(tmpDir, { persist: true });
  assert.deepEqual(back.binding.restored, { feature: 'alpha', from: '.aioson/context/features/alpha/workflow.state.json' });
  assert.deepEqual(back.state.completed, reference.state.completed, 'alpha resumes where it left, not at @product');
  assert.equal(back.state.current, reference.state.current);
});

test('workflow:execute --seed on a feature with an archive resumes that archive and archives the live feature first; the dry-run only previews both', async () => {
  // Seeding alpha while alpha waited in its archive once reseeded it at
  // @product, ignored the archive, and dropped beta's live progress unarchived.
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/project.context.md', '---\nclassification: SMALL\n---\n# ctx\n');
  await writeFile(tmpDir, '.aioson/context/features.md', featuresTable([['alpha', 'in_progress'], ['beta', 'in_progress']]));
  await writeFile(tmpDir, '.aioson/context/project-pulse.md', '---\nactive_feature: alpha\n---\n# Pulse\n');
  await writeFile(tmpDir, '.aioson/context/workflow.state.json', JSON.stringify(featureState('beta', { current: 'dev', next: 'qa', completed: ['product', 'sheldon', 'planner'] })));
  await writeFile(tmpDir, '.aioson/context/features/alpha/workflow.state.json', JSON.stringify({ ...featureState('alpha'), archived_at: '2026-09-02T00:00:00.000Z' }));
  const betaArchive = path.join(tmpDir, '.aioson/context/features/beta/workflow.state.json');
  const alphaArchive = path.join(tmpDir, '.aioson/context/features/alpha/workflow.state.json');
  const present = (file) => fs.access(file).then(() => true, () => false);

  const preview = await runWorkflowExecute({
    args: [tmpDir],
    options: { json: true, feature: 'alpha', 'dry-run': true, tool: 'claude' },
    logger: makeLogger()
  });
  assert.equal(preview.ok, true);
  assert.equal(preview.resumed, true, 'the preview resumes the archive a real run would restore');
  assert.deepEqual(preview.binding.moved, { from: 'beta', to: 'alpha', mode: 'feature', archived: '.aioson/context/features/beta/workflow.state.json', persisted: false });
  assert.deepEqual(preview.binding.restored, { feature: 'alpha', from: '.aioson/context/features/alpha/workflow.state.json' });
  assert.equal(JSON.parse(await fs.readFile(path.join(tmpDir, '.aioson/context/workflow.state.json'), 'utf8')).featureSlug, 'beta', 'a dry-run writes nothing');
  assert.equal(await present(betaArchive), false);
  assert.equal(await present(alphaArchive), true);

  const seeded = await runWorkflowExecute({
    args: [tmpDir],
    options: { json: true, feature: 'alpha', seed: true, tool: 'claude' },
    logger: makeLogger()
  });
  assert.equal(seeded.ok, true);
  assert.equal(seeded.resumed, true);
  assert.equal(seeded.next_stage, 'qa', 'alpha resumes at QA, not at @product');
  const live = JSON.parse(await fs.readFile(path.join(tmpDir, '.aioson/context/workflow.state.json'), 'utf8'));
  assert.equal(live.featureSlug, 'alpha');
  assert.deepEqual(live.completed, ['product', 'sheldon', 'planner', 'dev']);
  assert.equal(live.archived_at, undefined);
  const betaKept = JSON.parse(await fs.readFile(betaArchive, 'utf8'));
  assert.deepEqual(betaKept.completed, ['product', 'sheldon', 'planner']);
  assert.equal(betaKept.current, 'dev');
  assert.equal(await present(alphaArchive), false, 'the restored archive is consumed');
  const event = (await readEvents(tmpDir)).find((entry) => entry.event === 'binding_moved');
  assert.equal(event.from, 'beta');
  assert.equal(event.to, 'alpha');
  assert.equal(event.archived, '.aioson/context/features/beta/workflow.state.json');
  assert.equal(event.restored, '.aioson/context/features/alpha/workflow.state.json');
});

test('workflow:execute --seed: still refuses when a DIFFERENT feature is genuinely active', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/project.context.md', '---\nclassification: SMALL\n---\n# ctx\n');
  await writeFile(
    tmpDir,
    '.aioson/context/features.md',
    '# Features\n\n| slug | status | started | completed |\n|---|---|---|---|\n| flow-deck | in_progress | 2026-06-20 | |\n'
  );
  await writeFile(
    tmpDir,
    '.aioson/context/workflow.state.json',
    JSON.stringify({
      version: 1,
      mode: 'feature',
      classification: 'SMALL',
      sequence: ['product', 'sheldon', 'dev', 'qa'],
      current: 'dev',
      next: 'dev',
      completed: ['product', 'sheldon'],
      skipped: [],
      featureSlug: 'flow-deck',
      detour: null,
      updatedAt: new Date().toISOString()
    })
  );

  const result = await runWorkflowExecute({
    args: [tmpDir],
    options: { json: true, feature: 'profile-page', seed: true, tool: 'claude' },
    logger: makeLogger()
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'different_active_feature');
  assert.equal(result.active_feature, 'flow-deck');
});

test('workflow:execute --seed: resume_command records --seed and history never leaks across features', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/project.context.md', '---\nclassification: SMALL\n---\n# ctx\n');
  await writeFile(
    tmpDir,
    '.aioson/context/features.md',
    '# Features\n\n| slug | status | started | completed |\n|---|---|---|---|\n| alpha | in_progress | 2026-07-01 | |\n'
  );
  await writeFile(tmpDir, '.aioson/context/prd-alpha.md', '# prd\n');

  const first = await runWorkflowExecute({
    args: [tmpDir],
    options: { json: true, feature: 'alpha', seed: true, tool: 'claude' },
    logger: makeLogger()
  });
  assert.equal(first.ok, true);
  // A seed run must resume as a seed run, not as the CLI-advancing --agentic runner.
  assert.match(first.resume_command, /--seed/);
  assert.doesNotMatch(first.resume_command, /--agentic/);

  // Feature switch: alpha done, beta active. The new scheme must start with a
  // FRESH history — no checkpoints inherited from alpha.
  await writeFile(
    tmpDir,
    '.aioson/context/features.md',
    '# Features\n\n| slug | status | started | completed |\n|---|---|---|---|\n| alpha | done | 2026-07-01 | 2026-07-01 |\n| beta | in_progress | 2026-07-01 | |\n'
  );
  await writeFile(tmpDir, '.aioson/context/prd-beta.md', '# prd\n');
  const second = await runWorkflowExecute({
    args: [tmpDir],
    options: { json: true, feature: 'beta', seed: true, tool: 'claude' },
    logger: makeLogger()
  });
  assert.equal(second.ok, true);
  const scheme = JSON.parse(await fs.readFile(path.join(tmpDir, EXECUTION_STATE_RELATIVE_PATH), 'utf8'));
  assert.equal(scheme.feature, 'beta');
  assert.ok(scheme.history.length <= 1, `history must reset on feature change, got ${scheme.history.length}`);
});

test('workflow:execute --seed --step: writes an explicitly DISARMED scheme (per-feature step-by-step)', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/project.context.md', '---\nclassification: SMALL\nauto_handoff: true\n---\n# ctx\n');
  await writeFile(
    tmpDir,
    '.aioson/context/features.md',
    '# Features\n\n| slug | status | started | completed |\n|---|---|---|---|\n| manual-run | in_progress | 2026-07-01 | |\n'
  );
  await writeFile(tmpDir, '.aioson/context/prd-manual-run.md', '# prd\n');

  const result = await runWorkflowExecute({
    args: [tmpDir],
    options: { json: true, feature: 'manual-run', seed: true, step: true, tool: 'claude' },
    logger: makeLogger()
  });

  assert.equal(result.ok, true);
  assert.equal(result.seeded, true);
  assert.ok(result.agentic_policy, 'disarm still writes an explicit policy object');
  assert.equal(result.agentic_policy.enabled, false);
  assert.equal(result.agentic_policy.mode, 'step_by_step');
  const scheme = JSON.parse(await fs.readFile(path.join(tmpDir, EXECUTION_STATE_RELATIVE_PATH), 'utf8'));
  assert.equal(scheme.agentic_policy.enabled, false);
  // Replaying the resume command must keep the disarm, never re-arm.
  assert.match(result.resume_command, /--step/);
  assert.doesNotMatch(result.resume_command, /--agentic/);
});

test('workflow:execute --step alone is record-only (never drives stage transitions)', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/project.context.md', '---\nclassification: SMALL\n---\n# ctx\n');
  await writeFile(
    tmpDir,
    '.aioson/context/features.md',
    '# Features\n\n| slug | status | started | completed |\n|---|---|---|---|\n| manual-two | in_progress | 2026-07-01 | |\n'
  );
  await writeFile(tmpDir, '.aioson/context/prd-manual-two.md', '# prd\n');

  const result = await runWorkflowExecute({
    args: [tmpDir],
    options: { json: true, feature: 'manual-two', step: true, tool: 'claude' },
    logger: makeLogger()
  });

  assert.equal(result.ok, true);
  assert.equal(result.seeded, true, '--step implies seed-only');
  const state = JSON.parse(await fs.readFile(path.join(tmpDir, '.aioson/context/workflow.state.json'), 'utf8'));
  assert.equal(state.current, null, 'no stage activation happened');
});
