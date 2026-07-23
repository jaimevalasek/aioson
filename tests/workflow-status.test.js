'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { runWorkflowStatus } = require('../src/commands/workflow-status');

async function makeTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-workflow-status-'));
}

async function writeFileEnsured(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
}

async function writeProjectContext(dir, classification = 'SMALL') {
  await writeFileEnsured(
    path.join(dir, '.aioson/context/project.context.md'),
    `---\nproject_name: "demo"\nproject_type: "web_app"\nprofile: "developer"\nframework: "Next.js"\nframework_installed: true\nclassification: "${classification}"\nconversation_language: "en"\naioson_version: "1.2.1"\n---\n\n# Context\n`
  );
}

function createQuietLogger() {
  return {
    log() {},
    error() {}
  };
}

async function seedFeatureWorkflow(dir, { gatePlanApproved = false } = {}) {
  await writeProjectContext(dir, 'SMALL');
  await writeFileEnsured(
    path.join(dir, '.aioson/config/autonomy-protocol.json'),
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
  await writeFileEnsured(
    path.join(dir, '.aioson/context/features.md'),
    '# Features\n\n| slug | status | started | completed |\n|------|--------|---------|-----------|\n| protocol-contracts | in_progress | 2026-04-16 | — |\n'
  );
  await writeFileEnsured(
    path.join(dir, '.aioson/context/prd-protocol-contracts.md'),
    `---\nclassification: SMALL\nproduct_scope: approved\nprd_ready: approved\n---\n# Feature PRD\n\n## Feature Capability Map\n\n| CAP | Promised outcome | Actor / trigger | Scope decision | Rationale |\n|---|---|---|---|---|\n| CAP-protocol-01 | Protocol behavior is delivered | User starts the app | required | Core promise |\n\n## Acceptance Criteria\n\n| AC | CAP | Observable behavior | Evidence |\n|---|---|---|---|\n| AC-protocol-01 | CAP-protocol-01 | Protocol behavior works | focused test |\n`
  );
  if (gatePlanApproved) {
    await writeFileEnsured(
      path.join(dir, '.aioson/context/implementation-plan-protocol-contracts.md'),
      `---\nstatus: approved\n---\n# Plan\n\n## Capability Delivery Plan\n\n| CAP | Phase | Files | Verification |\n|---|---|---|---|\n| CAP-protocol-01 | 1 | src/protocol.js, tests/protocol.test.js | node --test |\n`
    );
    await writeFileEnsured(path.join(dir, 'src/protocol.js'), 'module.exports = true;\n');
    await writeFileEnsured(path.join(dir, 'tests/protocol.test.js'), "const test=require('node:test'); const assert=require('node:assert/strict'); test('AC-protocol-01',()=>assert.ok(true));\n");
  }
  await writeFileEnsured(path.join(dir, '.aioson/context/project-pulse.md'), '# Pulse\n');
  await writeFileEnsured(path.join(dir, '.aioson/context/dev-state.md'), '# Dev State\n');
  await writeFileEnsured(
    path.join(dir, '.aioson/context/workflow.state.json'),
    JSON.stringify({
      version: 1,
      mode: 'feature',
      classification: 'SMALL',
      sequence: ['product', 'planner', 'dev', 'qa'],
      current: 'dev',
      next: 'qa',
      completed: ['product', 'planner'],
      skipped: [],
      featureSlug: 'protocol-contracts',
      detour: null,
      updatedAt: new Date().toISOString()
    }, null, 2)
  );
}

test('workflow:status reports effective autonomy mode and pending gate for active stage', async () => {
  const dir = await makeTempDir();
  await seedFeatureWorkflow(dir, { gatePlanApproved: false });

  const result = await runWorkflowStatus({
    args: [dir],
    options: { tool: 'codex' },
    logger: createQuietLogger(),
    t: (key) => key
  });

  assert.equal(result.ok, true);
  assert.equal(result.activeStage, 'dev');
  assert.equal(result.queuedNextStage, 'qa');
  assert.equal(result.effectiveMode, 'trusted');
  assert.deepEqual(result.pendingGates, ['C']);
  assert.equal(result.contractCheck.ok, false);
  assert.equal(result.suggestion.action, 'resolve_gate_c');
  assert.equal(result.suggestion.agent, 'planner');
  assert.equal(result.suggestion.command, 'aioson workflow:next . --agent=planner --tool=codex');
});

test('workflow:status --suggest recommends completion when the handoff contract is ready', async () => {
  const dir = await makeTempDir();
  await seedFeatureWorkflow(dir, { gatePlanApproved: true });

  const result = await runWorkflowStatus({
    args: [dir],
    options: { tool: 'codex', suggest: true },
    logger: createQuietLogger(),
    t: (key) => key
  });

  assert.equal(result.ok, true);
  assert.equal(result.suggestion.action, 'complete_stage');
  assert.equal(result.suggestion.command, 'aioson workflow:next . --complete=dev --auto-heal --tool=codex');
  assert.equal(result.contractCheck.ok, true);
  assert.deepEqual(result.pendingGates, []);
});

test('workflow:status does not recommend completion while context evidence is missing', async () => {
  const dir = await makeTempDir();
  await writeProjectContext(dir, 'SMALL');
  await writeFileEnsured(path.join(dir, '.aioson/context/project-pulse.md'), '# Pulse\n');
  await writeFileEnsured(
    path.join(dir, '.aioson/context/workflow.state.json'),
    JSON.stringify({
      version: 1,
      mode: 'project',
      classification: 'SMALL',
      sequence: ['product', 'planner', 'dev', 'qa'],
      current: 'dev',
      next: 'qa',
      completed: ['product', 'planner'],
      skipped: [],
      featureSlug: null,
      detour: null,
      updatedAt: new Date().toISOString()
    }, null, 2)
  );

  const result = await runWorkflowStatus({
    args: [dir],
    options: { tool: 'codex', suggest: true },
    logger: createQuietLogger(),
    t: (key) => key
  });

  assert.equal(result.contractCheck.ok, true, 'recommended context files remain soft contract warnings');
  assert.equal(result.suggestion.action, 'continue_stage');
  assert.equal(result.suggestion.agent, 'dev');
  assert.match(result.suggestion.reason, /completion evidence is still incomplete/);
  assert.ok(result.suggestion.details.some((item) => item.includes('dev-state.md')));
});

test('workflow:status reports feature-scoped design-doc and readiness artifacts', async () => {
  const dir = await makeTempDir();
  await seedFeatureWorkflow(dir, { gatePlanApproved: true });
  await writeFileEnsured(
    path.join(dir, '.aioson/context/design-doc-protocol-contracts.md'),
    '# Feature Design Doc\n'
  );
  await writeFileEnsured(
    path.join(dir, '.aioson/context/readiness-protocol-contracts.md'),
    '# Feature Readiness\n'
  );

  const result = await runWorkflowStatus({
    args: [dir],
    options: { tool: 'codex' },
    logger: createQuietLogger(),
    t: (key) => key
  });

  assert.equal(result.ok, true);
  assert.ok(result.artifacts.some((artifact) => artifact.label === 'design-doc-protocol-contracts.md' && artifact.exists));
  assert.ok(result.artifacts.some((artifact) => artifact.label === 'readiness-protocol-contracts.md' && artifact.exists));
});

test('workflow:status hides stale feature handoff when active workflow is project mode', async () => {
  const dir = await makeTempDir();
  await writeProjectContext(dir, 'MEDIUM');
  await writeFileEnsured(
    path.join(dir, '.aioson/context/workflow.state.json'),
    JSON.stringify({
      version: 1,
      mode: 'project',
      classification: 'MEDIUM',
      sequence: ['setup', 'dev'],
      current: null,
      next: 'dev',
      completed: ['setup'],
      skipped: [],
      featureSlug: null,
      detour: null,
      updatedAt: new Date().toISOString()
    }, null, 2)
  );
  await writeFileEnsured(
    path.join(dir, '.aioson/context/last-handoff.json'),
    JSON.stringify({
      version: 1,
      session_ended_at: new Date().toISOString(),
      last_agent: '@dev',
      workflow_mode: 'feature',
      feature_slug: 'old-feature',
      next_agent: '@qa'
    }, null, 2)
  );
  await writeFileEnsured(
    path.join(dir, '.aioson/context/handoff-protocol.json'),
    JSON.stringify({
      version: '1.0',
      workflow_mode: 'feature',
      feature_slug: 'old-feature',
      from: { agent_id: 'dev' },
      to: { agent_id: 'qa' },
      artifact_uris: []
    }, null, 2)
  );

  const result = await runWorkflowStatus({
    args: [dir],
    options: { tool: 'codex' },
    logger: createQuietLogger(),
    t: (key) => key
  });

  assert.equal(result.ok, true);
  assert.equal(result.mode, 'project');
  assert.equal(result.featureSlug, null);
  assert.equal(result.handoff, null);
  assert.equal(result.handoffProtocol, null);
});

test('workflow:status keeps handoff when feature slug matches active workflow', async () => {
  const dir = await makeTempDir();
  await seedFeatureWorkflow(dir, { gatePlanApproved: true });
  await writeFileEnsured(
    path.join(dir, '.aioson/context/last-handoff.json'),
    JSON.stringify({
      version: 1,
      session_ended_at: new Date().toISOString(),
      last_agent: '@architect',
      workflow_mode: 'feature',
      feature_slug: 'protocol-contracts',
      next_agent: '@dev'
    }, null, 2)
  );
  await writeFileEnsured(
    path.join(dir, '.aioson/context/handoff-protocol.json'),
    JSON.stringify({
      version: '1.0',
      workflow_mode: 'feature',
      feature_slug: 'protocol-contracts',
      from: { agent_id: 'architect' },
      to: { agent_id: 'dev' },
      artifact_uris: []
    }, null, 2)
  );

  const result = await runWorkflowStatus({
    args: [dir],
    options: { tool: 'codex' },
    logger: createQuietLogger(),
    t: (key) => key
  });

  assert.equal(result.ok, true);
  assert.equal(result.handoff.feature_slug, 'protocol-contracts');
  assert.equal(result.handoffProtocol.feature_slug, 'protocol-contracts');
});

test('workflow:status reconciles stale active stages before building the suggestion', async () => {
  const dir = await makeTempDir();
  await writeProjectContext(dir, 'MEDIUM');
  await writeFileEnsured(
    path.join(dir, '.aioson/context/features.md'),
    '# Features\n\n| slug | status | started | completed |\n|------|--------|---------|-----------|\n| secure-by-default | in_progress | 2026-04-28 | — |\n'
  );
  await writeFileEnsured(path.join(dir, '.aioson/context/prd-secure-by-default.md'), '# PRD\n');
  await writeFileEnsured(
    path.join(dir, '.aioson/context/workflow.state.json'),
    JSON.stringify({
      version: 1,
      mode: 'feature',
      classification: 'MEDIUM',
      sequence: ['product', 'analyst', 'dev', 'pentester', 'qa'],
      current: 'pentester',
      next: 'pentester',
      completed: ['product', 'analyst', 'dev', 'qa'],
      skipped: [],
      featureSlug: 'secure-by-default',
      detour: null,
      updatedAt: new Date().toISOString()
    }, null, 2)
  );

  const result = await runWorkflowStatus({
    args: [dir],
    options: { tool: 'codex' },
    logger: createQuietLogger(),
    t: (key) => key
  });

  assert.equal(result.ok, true);
  assert.equal(result.activeStage, null);
  assert.equal(result.queuedNextStage, null);
  assert.equal(result.suggestion.action, 'workflow_complete');
  assert.equal(result.suggestion.reason, 'The workflow has no pending stage.');
  assert.deepEqual(result.state.skipped, ['pentester']);
});
