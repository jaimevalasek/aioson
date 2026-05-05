'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createTranslator } = require('../src/i18n');
const { runAgentsList, runAgentPrompt } = require('../src/commands/agents');
const { openRuntimeDb } = require('../src/runtime-store');

async function makeTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-agents-cmd-'));
}

function createCollectLogger() {
  const lines = [];
  return {
    lines,
    log(line) {
      lines.push(String(line));
    },
    error(line) {
      lines.push(String(line));
    }
  };
}

async function writeProjectContext(dir, classification = 'SMALL') {
  await fs.mkdir(path.join(dir, '.aioson/context'), { recursive: true });
  await fs.writeFile(
    path.join(dir, '.aioson/context/project.context.md'),
    `---\nproject_name: "demo"\nproject_type: "web_app"\nprofile: "developer"\nframework: "Next.js"\nframework_installed: true\nclassification: "${classification}"\nconversation_language: "en"\naioson_version: "1.2.1"\n---\n\n# Context\n`,
    'utf8'
  );
}

test('agents command localizes line formatting in pt-BR', async () => {
  const dir = await makeTempDir();
  const { t } = createTranslator('pt-BR');
  const logger = createCollectLogger();

  const result = await runAgentsList({
    args: [dir],
    options: { lang: 'pt-BR' },
    logger,
    t
  });

  assert.equal(result.count > 0, true);
  assert.equal(logger.lines.some((line) => line.includes('- Agente: ')), true);
  assert.equal(logger.lines.some((line) => line.includes('Caminho: ')), true);
});

test('agent:prompt bootstraps direct runtime handoff for non-workflow agents', async () => {
  const dir = await makeTempDir();
  const { t } = createTranslator('en');
  const logger = createCollectLogger();

  const result = await runAgentPrompt({
    args: ['genome', dir],
    options: { tool: 'codex' },
    logger,
    t
  });

  assert.equal(result.ok, true);
  assert.equal(result.agent, 'genome');
  assert.equal(result.routed, false);
  assert.equal(Boolean(result.runtime), true);
  assert.equal(result.effectiveMode, 'guarded');

  const runtime = await openRuntimeDb(dir, { mustExist: true });
  try {
    const run = runtime.db.prepare("SELECT agent_name, source, status FROM agent_runs ORDER BY updated_at DESC LIMIT 1").get();
    const event = runtime.db.prepare("SELECT event_type, phase FROM execution_events ORDER BY created_at DESC, id DESC LIMIT 1").get();

    assert.equal(run.agent_name, '@genome');
    assert.equal(run.source, 'direct');
    assert.equal(run.status, 'queued');
    assert.equal(event.event_type, 'prompt.generated');
    assert.equal(event.phase, 'handoff');
  } finally {
    runtime.db.close();
  }

  await assert.doesNotReject(() => fs.access(path.join(dir, 'aioson-logs')));
});

test('agent:prompt keeps deyvin as a direct official agent outside workflow routing', async () => {
  const dir = await makeTempDir();
  await writeProjectContext(dir, 'SMALL');
  const { t } = createTranslator('en');
  const logger = createCollectLogger();

  const result = await runAgentPrompt({
    args: ['deyvin', dir],
    options: { tool: 'codex' },
    logger,
    t
  });

  assert.equal(result.ok, true);
  assert.equal(result.agent, 'deyvin');
  assert.equal(result.requestedAgent, 'deyvin');
  assert.equal(result.routed, false);
  assert.equal(Boolean(result.runtime), true);
  assert.equal(result.effectiveMode, 'guarded');

  const runtime = await openRuntimeDb(dir, { mustExist: true });
  try {
    const run = runtime.db.prepare("SELECT agent_name, agent_kind, source, status FROM agent_runs ORDER BY updated_at DESC LIMIT 1").get();

    assert.equal(run.agent_name, '@deyvin');
    assert.equal(run.agent_kind, 'official');
    assert.equal(run.source, 'direct');
    assert.equal(run.status, 'queued');
  } finally {
    runtime.db.close();
  }
});

test('agent:prompt classifies squad handoff as squad runtime activity', async () => {
  const dir = await makeTempDir();
  const { t } = createTranslator('en');
  const logger = createCollectLogger();

  const result = await runAgentPrompt({
    args: ['squad', dir],
    options: { tool: 'codex' },
    logger,
    t
  });

  assert.equal(result.ok, true);
  assert.equal(result.agent, 'squad');
  assert.equal(result.routed, false);

  const runtime = await openRuntimeDb(dir, { mustExist: true });
  try {
    const run = runtime.db.prepare("SELECT agent_name, agent_kind, source, title FROM agent_runs ORDER BY updated_at DESC LIMIT 1").get();

    assert.equal(run.agent_name, '@squad');
    assert.equal(run.agent_kind, 'squad');
    assert.equal(run.source, 'squad_session');
    assert.match(run.title, /squad session handoff/i);
  } finally {
    runtime.db.close();
  }
});

test('agent:prompt enforces workflow and routes to the active stage', async () => {
  const dir = await makeTempDir();
  await writeProjectContext(dir, 'SMALL');
  await fs.writeFile(path.join(dir, '.aioson/context/prd.md'), '# PRD\n', 'utf8');
  const { t } = createTranslator('en');
  const logger = createCollectLogger();

  const result = await runAgentPrompt({
    args: ['dev', dir],
    options: { tool: 'codex' },
    logger,
    t
  });

  assert.equal(result.ok, true);
  assert.equal(result.requestedAgent, 'dev');
  assert.equal(result.agent, 'analyst');
  assert.equal(result.routed, true);
  assert.equal(Boolean(result.runtime), true);

  const runtime = await openRuntimeDb(dir, { mustExist: true });
  try {
    const stageRun = runtime.db.prepare("SELECT agent_name, source, workflow_stage, status FROM agent_runs WHERE agent_name = '@analyst' ORDER BY updated_at DESC LIMIT 1").get();
    const routedEvent = runtime.db.prepare("SELECT event_type, message FROM execution_events WHERE source = 'workflow' ORDER BY created_at DESC, id DESC LIMIT 1").get();

    assert.equal(stageRun.agent_name, '@analyst');
    assert.equal(stageRun.source, 'workflow');
    assert.equal(stageRun.workflow_stage, 'analyst');
    assert.equal(stageRun.status, 'running');
    assert.equal(routedEvent.event_type, 'routed');
    assert.match(routedEvent.message, /direct request for @dev/i);
  } finally {
    runtime.db.close();
  }
});

test('agent:prompt injects capability summary and autonomy mode when manifest and protocol are present', async () => {
  const dir = await makeTempDir();
  await writeProjectContext(dir, 'SMALL');

  await fs.mkdir(path.join(dir, '.aioson/agents/manifests'), { recursive: true });
  await fs.mkdir(path.join(dir, '.aioson/config'), { recursive: true });

  await fs.writeFile(
    path.join(dir, '.aioson/agents/manifests/genome.manifest.json'),
    JSON.stringify({
      agent_id: 'genome',
      version: '1.0',
      capabilities: [
        { id: 'create_genome', category: 'create', description: 'Create a domain genome.' },
        { id: 'apply_genome', category: 'transform', description: 'Apply genome to a squad.' }
      ],
      autonomy_modes: ['guarded', 'trusted'],
      default_mode: 'guarded',
      supported_tools: ['codex', 'claude']
    }),
    'utf8'
  );

  await fs.writeFile(
    path.join(dir, '.aioson/config/autonomy-protocol.json'),
    JSON.stringify({
      version: '1.0',
      global_mode: 'guarded',
      tools: { codex: { mode: 'trusted', requires_tty: false } },
      agents: { genome: { max_mode: 'trusted' } }
    }),
    'utf8'
  );

  const { t } = createTranslator('en');
  const logger = createCollectLogger();

  const result = await runAgentPrompt({
    args: ['genome', dir],
    options: { tool: 'codex' },
    logger,
    t
  });

  assert.equal(result.ok, true);
  assert.equal(result.agent, 'genome');
  assert.equal(result.effectiveMode, 'trusted');
  assert.match(result.prompt, /Autonomy mode:\*\* trusted/);
  assert.match(result.prompt, /create_genome/);
  assert.match(result.prompt, /Declared capabilities:/);
});

test('agent:prompt keeps workflow routing when project context is invalid but workflow state exists', async () => {
  const dir = await makeTempDir();
  await fs.mkdir(path.join(dir, '.aioson/context'), { recursive: true });
  await fs.writeFile(
    path.join(dir, '.aioson/context/project.context.md'),
    '---\nproject_name: "demo"\nproject_type: "landpage"\nprofile: "developer"\nframework: "null"\nframework_installed: true\nclassification: "SMALL"\nconversation_language: "en"\naioson_version: "1.2.1"\n---\n\n# Context\n',
    'utf8'
  );
  await fs.writeFile(
    path.join(dir, '.aioson/context/workflow.state.json'),
    `${JSON.stringify({
      version: 1,
      mode: 'project',
      classification: 'SMALL',
      sequence: ['setup', 'product', 'analyst', 'architect', 'dev', 'qa'],
      current: null,
      next: 'analyst',
      completed: ['setup', 'product'],
      skipped: [],
      featureSlug: null,
      detour: null,
      updatedAt: new Date().toISOString()
    }, null, 2)}\n`,
    'utf8'
  );

  const { t } = createTranslator('en');
  const logger = createCollectLogger();
  const result = await runAgentPrompt({
    args: ['dev', dir],
    options: { tool: 'codex' },
    logger,
    t
  });

  assert.equal(result.ok, true);
  assert.equal(result.requestedAgent, 'dev');
  assert.equal(result.agent, 'analyst');
  assert.equal(result.routed, true);

  const runtime = await openRuntimeDb(dir, { mustExist: true });
  try {
    const stageRun = runtime.db.prepare("SELECT agent_name, source, workflow_stage, status FROM agent_runs WHERE agent_name = '@analyst' ORDER BY updated_at DESC LIMIT 1").get();
    const task = runtime.db.prepare('SELECT session_key, status FROM tasks ORDER BY updated_at DESC LIMIT 1').get();

    assert.equal(stageRun.agent_name, '@analyst');
    assert.equal(stageRun.source, 'workflow');
    assert.equal(stageRun.workflow_stage, 'analyst');
    assert.equal(task.session_key, 'workflow:project:project:default');
    assert.equal(task.status, 'running');
  } finally {
    runtime.db.close();
  }

  await assert.doesNotReject(() => fs.access(path.join(dir, 'aioson-logs')));
});

test('agent:prompt includes pentester app_target activation context', async () => {
  const dir = await makeTempDir();
  await writeProjectContext(dir, 'MEDIUM');
  const { t } = createTranslator('en');
  const logger = createCollectLogger();

  const result = await runAgentPrompt({
    args: ['pentester', dir],
    options: {
      tool: 'codex',
      mode: 'app_target',
      feature: 'secure-by-default',
      scope: 'refund-flow'
    },
    logger,
    t
  });

  assert.equal(result.ok, true);
  assert.equal(result.agent, 'pentester');
  assert.match(result.prompt, /Requested target mode: app_target\./);
  assert.match(result.prompt, /Feature slug: secure-by-default\./);
  assert.match(result.prompt, /Requested scope: refund-flow\./);
  assert.match(result.prompt, /app_target_ownership_idor/);
});

test('agent:prompt records pentester_app_target_invoked in runtime for app_target mode', async () => {
  const dir = await makeTempDir();
  await writeProjectContext(dir, 'MEDIUM');
  const { t } = createTranslator('en');
  const logger = createCollectLogger();

  const result = await runAgentPrompt({
    args: ['pentester', dir],
    options: {
      tool: 'codex',
      mode: 'app_target',
      feature: 'secure-by-default',
      scope: 'refund-flow'
    },
    logger,
    t
  });

  assert.equal(result.ok, true);
  const runtime = await openRuntimeDb(dir, { mustExist: true });
  try {
    const event = runtime.db.prepare(`
      SELECT event_type, phase, status, payload_json
      FROM execution_events
      WHERE event_type = 'pentester_app_target_invoked'
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `).get();

    assert.equal(event.event_type, 'pentester_app_target_invoked');
    assert.equal(event.phase, 'security');
    assert.equal(event.status, 'queued');
    const payload = JSON.parse(event.payload_json);
    assert.equal(payload.target_mode, 'app_target');
    assert.equal(payload.feature_slug, 'secure-by-default');
    assert.equal(payload.target_scope, 'refund-flow');
  } finally {
    runtime.db.close();
  }
});

test('agent:prompt rejects pentester app_target without feature and scope', async () => {
  const dir = await makeTempDir();
  await writeProjectContext(dir, 'MEDIUM');
  const { t } = createTranslator('en');
  const logger = createCollectLogger();

  await assert.rejects(
    () => runAgentPrompt({
      args: ['pentester', dir],
      options: {
        tool: 'codex',
        mode: 'app_target',
        scope: 'auth-flow'
      },
      logger,
      t
    }),
    /requires --feature=<slug>/
  );

  await assert.rejects(
    () => runAgentPrompt({
      args: ['pentester', dir],
      options: {
        tool: 'codex',
        mode: 'app_target',
        feature: 'secure-by-default'
      },
      logger,
      t
    }),
    /requires --scope=<area>/
  );
});
