'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
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

test('workflow:execute: dry-run SMALL has product, analyst, scope-check, dev, qa steps', async () => {
  const tmpDir = await makeTmpDir();
  const result = await runWorkflowExecute({
    args: [tmpDir],
    options: { json: true, feature: 'checkout', 'dry-run': true, classification: 'SMALL' },
    logger: makeLogger()
  });
  const agents = result.steps.map((s) => s.agent);
  assert.ok(agents.includes('product'));
  assert.ok(agents.includes('analyst'));
  assert.ok(agents.includes('scope-check'));
  assert.ok(agents.includes('dev'));
  assert.ok(agents.includes('qa'));
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
    options: { json: true, feature: 'checkout', tool: 'codex' },
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
