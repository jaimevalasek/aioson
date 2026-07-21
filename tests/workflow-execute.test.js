'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  buildAgenticPolicy,
  runWorkflowExecute,
  EXECUTION_STATE_RELATIVE_PATH
} = require('../src/commands/workflow-execute');

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
});

test('workflow:execute --seed: writes the scheme with an enabled agentic_policy and does NOT advance stages', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/project.context.md', '---\nclassification: MEDIUM\n---\n# ctx\n');
  await writeFile(tmpDir, '.aioson/context/prd-cart.md', '---\nclassification: MEDIUM\n---\n# prd\n');
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

test('workflow:execute: dry-run SMALL is the lean lane (product, sheldon, dev, qa)', async () => {
  const tmpDir = await makeTmpDir();
  const result = await runWorkflowExecute({
    args: [tmpDir],
    options: { json: true, feature: 'checkout', 'dry-run': true, classification: 'SMALL' },
    logger: makeLogger()
  });
  const agents = result.steps.map((s) => s.agent);
  assert.ok(agents.includes('product'));
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
  assert.ok(agents.includes('dev'));
  assert.ok(agents.includes('qa'));
});

test('workflow:execute: dry-run skips product when prd already exists', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/prd-checkout.md', '# PRD');
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
  assert.deepEqual(result.steps.map((step) => step.agent), ['product', 'dev', 'qa']);
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

test('workflow:execute: resume command quotes user-controlled arguments', async () => {
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

  assert.equal(result.ok, true);
  assert.match(result.resume_command, /--feature='poc;echo AIOSON_POC'/);
  assert.doesNotMatch(result.resume_command, /--feature=poc;echo/);
  assert.match(result.resume_command, /--tool='codex'/);
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
  assert.equal(result.ok, true);
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
  await writeFile(tmpDir, '.aioson/context/prd-checkout.md', '# PRD');
  await writeFile(tmpDir, '.aioson/context/requirements-checkout.md', '# Requirements');
  await writeFile(tmpDir, '.aioson/context/spec-checkout.md', '---\ngate_requirements: approved\ngate_plan: approved\n---\n# Spec');
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
      sequence: ['product', 'analyst', 'dev', 'qa'],
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
    options: { json: true, feature: 'checkout', tool: 'codex', agentic: true },
    logger: makeLogger()
  });

  assert.equal(result.ok, true);
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
  await writeFile(tmpDir, '.aioson/context/prd-checkout.md', '# PRD');
  await writeFile(tmpDir, '.aioson/context/requirements-checkout.md', '# Requirements');
  await writeFile(
    tmpDir,
    '.aioson/context/spec-checkout.md',
    '---\ngate_requirements: approved\ngate_plan: approved\n---\n# Spec'
  );
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
      sequence: ['product', 'analyst', 'scope-check', 'architect', 'discovery-design-doc', 'dev', 'qa'],
      current: 'product',
      next: 'analyst',
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

  assert.equal(result.ok, true);
  assert.equal(result.max_checkpoints, 2);
  assert.equal(result.active_stage, 'scope-check');
  assert.ok(Array.isArray(result.transitions));
  assert.equal(result.transitions.length, 2);
  assert.deepEqual(
    result.transitions.map((transition) => transition.transition),
    ['complete', 'complete']
  );
  assert.deepEqual(
    result.transitions.map((transition) => transition.agent),
    ['product', 'analyst']
  );
  assert.equal(result.execution_state.checkpoint.active_stage, 'scope-check');
  assert.equal(result.execution_state.status_snapshot.activeStage, 'scope-check');
  assert.equal(result.execution_state.suggestion.action, 'continue_stage');
  assert.ok(result.resume_command.includes("--max-checkpoints='2'"));

  const executionState = JSON.parse(
    await fs.readFile(path.join(tmpDir, EXECUTION_STATE_RELATIVE_PATH), 'utf8')
  );
  assert.equal(executionState.status, 'active');
  assert.equal(executionState.checkpoint.active_stage, 'scope-check');
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

test('workflow:execute: Gate C blocked qa step names @pm or @dev as responsible', async () => {
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
    blockerMsg.toLowerCase().includes('@pm') || blockerMsg.toLowerCase().includes('@dev'),
    `Gate C blocker must mention @pm or @dev, got: ${blockerMsg}`
  );
  assert.ok(
    blockerMsg.includes('--gate=C'),
    `Gate C blocker must include --gate=C, got: ${blockerMsg}`
  );
});

test('workflow:execute --seed: infers the finished lean sheldon stage — next is dev, not sheldon', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/project.context.md', '---\nclassification: SMALL\n---\n# ctx\n');
  await writeFile(
    tmpDir,
    '.aioson/context/features.md',
    '# Features\n\n| slug | status | started | completed |\n|---|---|---|---|\n| checkout | in_progress | 2026-07-01 | |\n'
  );
  await writeFile(tmpDir, '.aioson/context/prd-checkout.md', '---\nclassification: SMALL\n---\n# prd\n');
  // @sheldon finished: spec exists with the collapsed Gates A/B/C approved.
  await writeFile(
    tmpDir,
    '.aioson/context/spec-checkout.md',
    '---\ngate_requirements: approved\ngate_design: approved\ngate_plan: approved\n---\n# spec\n'
  );

  const result = await runWorkflowExecute({
    args: [tmpDir],
    options: { json: true, feature: 'checkout', seed: true, tool: 'claude' },
    logger: makeLogger()
  });

  assert.equal(result.ok, true);
  const state = JSON.parse(await fs.readFile(path.join(tmpDir, '.aioson/context/workflow.state.json'), 'utf8'));
  // A seed run AFTER the spec stage finished must not point the scheme backwards.
  assert.deepEqual(state.completed, ['product', 'sheldon']);
  assert.equal(state.next, 'dev');
  assert.equal(result.next_stage, 'dev');
});

test('workflow:execute --seed: infers the finished maestro orchestrator stage — next is dev', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/project.context.md', '---\nclassification: MEDIUM\n---\n# ctx\n');
  await writeFile(
    tmpDir,
    '.aioson/context/features.md',
    '# Features\n\n| slug | status | started | completed |\n|---|---|---|---|\n| billing | in_progress | 2026-07-01 | |\n'
  );
  await writeFile(tmpDir, '.aioson/context/prd-billing.md', '---\nclassification: MEDIUM\n---\n# prd\n');
  await writeFile(
    tmpDir,
    '.aioson/context/spec-billing.md',
    '---\ngate_requirements: approved\ngate_design: approved\ngate_plan: approved\n---\n# spec\n'
  );

  const result = await runWorkflowExecute({
    args: [tmpDir],
    options: { json: true, feature: 'billing', seed: true, tool: 'claude' },
    logger: makeLogger()
  });

  assert.equal(result.ok, true);
  const state = JSON.parse(await fs.readFile(path.join(tmpDir, '.aioson/context/workflow.state.json'), 'utf8'));
  assert.deepEqual(state.completed, ['product', 'orchestrator']);
  assert.equal(state.next, 'dev');
});

test('workflow:execute --seed: discards a stale workflow.state.json from a no-longer-active feature and reseeds', async () => {
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
