'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { runWorkflowStatus } = require('../src/commands/workflow-status');
const { approveAndSealSheldonReview } = require('./helpers/feature-evidence');

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
  await approveAndSealSheldonReview(dir, 'protocol-contracts');
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
      sequence: ['product', 'sheldon', 'planner', 'dev', 'qa'],
      current: 'dev',
      next: 'qa',
      completed: ['product', 'sheldon', 'planner'],
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
  assert.equal(result.suggestion.command, 'aioson workflow:next . --expect-feature=protocol-contracts --agent=planner --tool=codex');
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
  assert.equal(result.suggestion.command, 'aioson workflow:next . --expect-feature=protocol-contracts --complete=dev --auto-heal --tool=codex');
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
      sequence: ['setup', 'product', 'sheldon', 'planner', 'dev', 'qa'],
      current: 'dev',
      next: 'qa',
      completed: ['setup', 'product', 'sheldon', 'planner'],
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
  const statePath = path.join(dir, '.aioson/context/workflow.state.json');
  const staleState = JSON.stringify({
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
    }, null, 2);
  await writeFileEnsured(statePath, staleState);

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
  assert.equal(result.stateNeedsRepair, true);
  assert.equal(result.stateRepaired, false);
  assert.equal(await fs.readFile(statePath, 'utf8'), staleState);
});

test('workflow:status previews missing state without creating workflow.state.json', async () => {
  const dir = await makeTempDir();
  await writeProjectContext(dir, 'SMALL');
  const statePath = path.join(dir, '.aioson/context/workflow.state.json');

  const result = await runWorkflowStatus({
    args: [dir],
    options: { tool: 'codex' },
    logger: createQuietLogger(),
    t: (key) => key
  });

  assert.equal(result.ok, true);
  assert.equal(result.stateCreated, true);
  assert.equal(result.stateNeedsRepair, false);
  assert.equal(result.stateInitializationAvailable, true);
  await assert.rejects(fs.access(statePath), { code: 'ENOENT' });
});

test('workflow:status --repair explicitly persists the reconciled state', async () => {
  const dir = await makeTempDir();
  await writeProjectContext(dir, 'SMALL');
  const statePath = path.join(dir, '.aioson/context/workflow.state.json');

  const result = await runWorkflowStatus({
    args: [dir],
    options: { tool: 'codex', repair: true },
    logger: createQuietLogger(),
    t: (key) => key
  });

  assert.equal(result.ok, true);
  assert.equal(result.stateCreated, true);
  assert.equal(result.stateNeedsRepair, false);
  assert.equal(result.stateRepaired, false);
  assert.equal(result.stateInitialized, true);
  assert.deepEqual(JSON.parse(await fs.readFile(statePath, 'utf8')), result.state);
});

test('workflow:status hides a terminal handoff when the reconciled state has an active stage', async () => {
  const dir = await makeTempDir();
  await seedFeatureWorkflow(dir, { gatePlanApproved: true });
  await writeFileEnsured(
    path.join(dir, '.aioson/context/last-handoff.json'),
    JSON.stringify({
      workflow_mode: 'feature',
      feature_slug: 'protocol-contracts',
      last_agent: '@qa',
      next_agent: null,
      what_was_done: 'Workflow completed'
    }, null, 2)
  );

  const result = await runWorkflowStatus({
    args: [dir],
    options: { tool: 'codex' },
    logger: createQuietLogger(),
    t: (key) => key
  });

  assert.equal(result.activeStage, 'dev');
  assert.equal(result.handoff, null);
});

test('workflow:status inventories only installed squads and counts modular genomes', async () => {
  const dir = await makeTempDir();
  await writeProjectContext(dir, 'SMALL');
  await writeFileEnsured(
    path.join(dir, '.aioson/squads/editorial/squad.manifest.json'),
    JSON.stringify({ name: 'Editorial', status: 'active' })
  );
  await writeFileEnsured(path.join(dir, '.aioson/squads/editorial/agents/writer.md'), '# Writer\n');
  await writeFileEnsured(path.join(dir, '.aioson/squads/.artisan/README.md'), '# Reserved\n');
  await writeFileEnsured(path.join(dir, '.aioson/squads/incomplete/README.md'), '# Not installed\n');
  await writeFileEnsured(path.join(dir, '.aioson/genomes/INDEX.md'), '# Catalog\n');
  await writeFileEnsured(path.join(dir, '.aioson/genomes/legacy.md'), '# Legacy\n');
  await writeFileEnsured(
    path.join(dir, '.aioson/genomes/modular/manifest.json'),
    JSON.stringify({ genome: 'modular', references: [] })
  );

  const result = await runWorkflowStatus({
    args: [dir],
    options: { tool: 'codex' },
    logger: createQuietLogger(),
    t: (key) => key
  });

  assert.deepEqual(result.squads, [{ slug: 'editorial', agentCount: 1, status: 'active' }]);
  assert.equal(result.genomeCount, 2);
});
