'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createTranslator } = require('../src/i18n');
const {
  buildLaunchArgs,
  runLiveStart,
  runRuntimeEmit,
  runLiveHandoff,
  runLiveStatus,
  runLiveClose,
  runLiveList,
  sessionKeyToDirName
} = require('../src/commands/live');
const { openRuntimeDb, readAgentSession } = require('../src/runtime-store');

async function makeTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-live-command-'));
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

test('live:start maps permission-mode=yolo through tool capabilities', () => {
  assert.deepEqual(
    buildLaunchArgs({ 'permission-mode': 'yolo' }, 'claude'),
    ['--dangerously-skip-permissions']
  );
  assert.deepEqual(
    buildLaunchArgs({ permissionMode: 'yolo' }, 'codex'),
    ['--dangerously-bypass-approvals-and-sandbox']
  );
});

test('live:start keeps resume before yolo args for codex resume subcommand', () => {
  assert.deepEqual(
    buildLaunchArgs({ resume: true, 'permission-mode': 'yolo' }, 'codex'),
    ['resume', '--last', '--dangerously-bypass-approvals-and-sandbox']
  );
});

test('live:start rejects yolo mode for tools without a mapped permission bypass', () => {
  assert.throws(
    () => buildLaunchArgs({ 'permission-mode': 'yolo' }, 'opencode'),
    /permission_mode_unsupported:opencode:yolo/
  );
});

test('live session commands track start, plan progress, handoff and close for a no-launch session', async () => {
  const dir = await makeTempDir();
  await fs.writeFile(path.join(dir, 'plan.md'), [
    '# Plano',
    '',
    '### RF-01 - Entregar launcher',
    '### Fase 2 - Handoff entre agentes'
  ].join('\n'));

  const { t } = createTranslator('pt-BR');
  const logger = createCollectLogger();

  const start = await runLiveStart({
    args: [dir],
    options: {
      tool: 'codex',
      'tool-bin': 'node',
      agent: 'deyvin',
      title: 'Sessao viva do deyvin',
      plan: 'plan.md',
      'no-launch': true,
      json: true
    },
    logger,
    t
  });

  assert.equal(start.ok, true);
  assert.equal(start.agent, '@deyvin');
  assert.equal(start.tool, 'codex');
  assert.equal(start.reused, false);
  assert.equal(start.open, true);
  assert.equal(start.pid, null);

  const { db, runtimeDir } = await openRuntimeDb(dir, { mustExist: true });
  try {
    const sessionTask = db.prepare(`
      SELECT task_key, task_kind, meta_json, status
      FROM tasks
      WHERE task_key = ?
    `).get(start.taskKey);
    const sessionMeta = JSON.parse(sessionTask.meta_json);
    assert.equal(sessionTask.task_kind, 'live_session');
    assert.equal(sessionTask.status, 'running');
    assert.equal(sessionMeta.tool_session, 'codex');
    assert.equal(sessionMeta.plan_ref, 'plan.md');
    assert.deepEqual(sessionMeta.plan_steps.map((step) => step.id), ['RF-01', 'Fase 2']);

    const liveRun = db.prepare(`
      SELECT run_key, source, session_key, status
      FROM agent_runs
      WHERE run_key = ?
    `).get(start.runKey);
    assert.equal(liveRun.source, 'live');
    assert.equal(liveRun.session_key, start.sessionKey);
    assert.equal(liveRun.status, 'running');

    const sessionRef = await readAgentSession(runtimeDir, '@deyvin');
    assert.equal(sessionRef.runKey, start.runKey);
    assert.equal(sessionRef.taskKey, start.taskKey);
    assert.equal(sessionRef.sessionKey, start.sessionKey);
  } finally {
    db.close();
  }

  const statePath = path.join(dir, '.aioson', 'runtime', 'live', sessionKeyToDirName(start.sessionKey), 'state.json');
  const initialState = JSON.parse(await fs.readFile(statePath, 'utf8'));
  assert.equal(initialState.phase, 'active');
  assert.equal(initialState.tool_session, 'codex');
  assert.equal(initialState.active_agent, '@deyvin');
  assert.equal(initialState.stats.events_total, 1);
  assert.equal(initialState.stats.plan_steps_total, 2);

  const startedTask = await runRuntimeEmit({
    args: [dir],
    options: {
      agent: 'deyvin',
      type: 'task_started',
      title: 'Corrigir modal de estoque',
      json: true
    },
    logger,
    t
  });

  assert.equal(startedTask.ok, true);
  assert.equal(typeof startedTask.currentTask, 'string');

  const checkpoint = await runRuntimeEmit({
    args: [dir],
    options: {
      agent: 'deyvin',
      type: 'plan_checkpoint',
      'plan-step': 'RF-01',
      summary: 'Launcher entregue',
      json: true
    },
    logger,
    t
  });
  assert.equal(checkpoint.ok, true);
  assert.equal(checkpoint.eventType, 'plan_checkpoint');

  const completedTask = await runRuntimeEmit({
    args: [dir],
    options: {
      agent: '@deyvin',
      type: 'task_completed',
      summary: 'Corrigi o modal de estoque',
      refs: 'src/app.js,src/styles.css',
      json: true
    },
    logger,
    t
  });

  assert.equal(completedTask.ok, true);
  assert.equal(completedTask.currentTask, null);

  const openStatus = await runLiveStatus({
    args: [dir],
    options: {
      agent: 'deyvin',
      json: true
    },
    logger,
    t
  });

  assert.equal(openStatus.ok, true);
  assert.equal(openStatus.phase, 'active');
  assert.equal(openStatus.processState, 'not_tracked');
  assert.equal(openStatus.stats.events_total, 4);
  assert.equal(openStatus.stats.tasks_completed, 1);
  assert.equal(openStatus.stats.plan_steps_done, 1);
  assert.equal(openStatus.stats.plan_steps_total, 2);
  assert.equal(openStatus.recentEvents.some((event) => event.type === 'plan_checkpoint'), true);

  const handoff = await runLiveHandoff({
    args: [dir],
    options: {
      agent: 'deyvin',
      to: 'product',
      reason: 'Escopo exige decisao de produto',
      json: true
    },
    logger,
    t
  });

  assert.equal(handoff.ok, true);
  assert.equal(handoff.agent, '@deyvin');
  assert.equal(handoff.nextAgent, '@product');
  assert.notEqual(handoff.runKey, handoff.previousRunKey);

  const { db: handoffDb, runtimeDir: handoffRuntimeDir } = await openRuntimeDb(dir, { mustExist: true });
  try {
    const previousRun = handoffDb.prepare(`
      SELECT run_key, status
      FROM agent_runs
      WHERE run_key = ?
    `).get(handoff.previousRunKey);
    const nextRun = handoffDb.prepare(`
      SELECT run_key, status, parent_run_key, agent_name
      FROM agent_runs
      WHERE run_key = ?
    `).get(handoff.runKey);
    assert.equal(previousRun.status, 'completed');
    assert.equal(nextRun.status, 'running');
    assert.equal(nextRun.parent_run_key, handoff.previousRunKey);
    assert.equal(nextRun.agent_name, '@product');

    const sessionTask = handoffDb.prepare(`
      SELECT meta_json
      FROM tasks
      WHERE task_key = ?
    `).get(start.taskKey);
    const sessionMeta = JSON.parse(sessionTask.meta_json);
    assert.equal(sessionMeta.plan_steps.find((step) => step.id === 'RF-01').done, true);

    const oldSessionRef = await readAgentSession(handoffRuntimeDir, '@deyvin');
    const newSessionRef = await readAgentSession(handoffRuntimeDir, '@product');
    assert.equal(oldSessionRef, null);
    assert.equal(newSessionRef.runKey, handoff.runKey);
    assert.equal(newSessionRef.taskKey, start.taskKey);
    assert.equal(newSessionRef.sessionKey, start.sessionKey);
  } finally {
    handoffDb.close();
  }

  const handoffState = JSON.parse(await fs.readFile(statePath, 'utf8'));
  assert.equal(handoffState.active_agent, '@product');
  assert.equal(handoffState.current_run_key, handoff.runKey);
  assert.equal(handoffState.stats.plan_steps_done, 1);

  const close = await runLiveClose({
    args: [dir],
    options: {
      agent: 'product',
      summary: 'Sessao encerrada com sucesso',
      json: true
    },
    logger,
    t
  });

  assert.equal(close.ok, true);
  assert.equal(close.closed, true);
  assert.equal(close.status, 'completed');

  const closedStatus = await runLiveStatus({
    args: [dir],
    options: {
      agent: '@product',
      json: true
    },
    logger,
    t
  });

  assert.equal(closedStatus.ok, true);
  assert.equal(closedStatus.phase, 'closed');
  assert.equal(closedStatus.open, false);
  assert.equal(closedStatus.recentEvents.some((event) => event.type === 'session_closed'), true);

  const closedSessionRef = await readAgentSession(runtimeDir, '@product');
  assert.equal(closedSessionRef, null);

  const ndjsonPath = path.join(dir, '.aioson', 'runtime', 'live', sessionKeyToDirName(start.sessionKey), 'events.ndjson');
  const lines = (await fs.readFile(ndjsonPath, 'utf8'))
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  assert.equal(lines.length, 6);
  assert.deepEqual(lines.map((line) => line.type), [
    'session_started',
    'task_started',
    'plan_checkpoint',
    'task_completed',
    'handoff',
    'session_closed'
  ]);

  const summaryPath = path.join(dir, '.aioson', 'runtime', 'live', sessionKeyToDirName(start.sessionKey), 'summary.md');
  const summary = await fs.readFile(summaryPath, 'utf8');
  assert.equal(summary.includes('Sessao encerrada com sucesso'), true);
  assert.equal(summary.includes('Duration:'), true);
});

test('runtime:emit records a standalone event when no live session is active', async () => {
  const dir = await makeTempDir();
  const { t } = createTranslator('pt-BR');
  const logger = createCollectLogger();

  const emitted = await runRuntimeEmit({
    args: [dir],
    options: {
      agent: 'orchestrator',
      type: 'milestone',
      summary: 'agent-1 completed lane work',
      refs: '.aioson/context/parallel/agent-1.status.md',
      meta: '{"worker":"agent-1"}',
      json: true
    },
    logger,
    t
  });

  assert.equal(emitted.ok, true);
  assert.equal(emitted.standalone, true);
  assert.equal(emitted.open, false);
  assert.equal(emitted.sessionKey, null);
  assert.equal(emitted.agent, '@orchestrator');

  const { db, runtimeDir } = await openRuntimeDb(dir, { mustExist: true });
  try {
    const run = db.prepare(`
      SELECT run_key, agent_name, source, status
      FROM agent_runs
      WHERE run_key = ?
    `).get(emitted.runKey);
    assert.equal(run.agent_name, '@orchestrator');
    assert.equal(run.source, 'direct');
    assert.equal(run.status, 'completed');

    const event = db.prepare(`
      SELECT event_type, message, payload_json
      FROM agent_events
      WHERE run_key = ?
      ORDER BY id DESC
      LIMIT 1
    `).get(emitted.runKey);
    assert.equal(event.event_type, 'milestone');
    assert.equal(event.message, 'agent-1 completed lane work');

    const payload = JSON.parse(event.payload_json);
    assert.equal(payload.worker, 'agent-1');
    assert.equal(payload.standalone, true);
    assert.deepEqual(payload.refs, ['.aioson/context/parallel/agent-1.status.md']);

    const sessionRef = await readAgentSession(runtimeDir, '@orchestrator');
    assert.equal(sessionRef, null);
  } finally {
    db.close();
  }
});

test('live:start auto-closes active session when requested tool changes', async () => {
  const dir = await makeTempDir();
  const { t } = createTranslator('en');
  const logger = createCollectLogger();

  const first = await runLiveStart({
    args: [dir],
    options: { tool: 'codex', 'tool-bin': 'node', agent: 'deyvin', 'no-launch': true, json: true },
    logger,
    t
  });

  const second = await runLiveStart({
    args: [dir],
    options: { tool: 'claude', 'tool-bin': 'node', agent: 'deyvin', 'no-launch': true, json: true },
    logger,
    t
  });

  assert.equal(second.ok, true);
  assert.equal(second.tool, 'claude');
  assert.notEqual(second.sessionKey, first.sessionKey);

  const ref = await readAgentSession(path.join(dir, '.aioson', 'runtime'), '@deyvin');
  assert.equal(ref.sessionKey, second.sessionKey);

  const { db } = await openRuntimeDb(dir, { mustExist: true });
  try {
    const previousRun = db.prepare('SELECT status, summary FROM agent_runs WHERE run_key = ?').get(first.runKey);
    assert.equal(previousRun.status, 'completed');
    assert.match(previousRun.summary, /tool changed from codex to claude/);
  } finally {
    db.close();
  }
});

test('runtime:emit rejects back-to-back task_started without task_completed', async () => {
  const dir = await makeTempDir();
  const { t } = createTranslator('en');
  const logger = createCollectLogger();

  await runLiveStart({
    args: [dir],
    options: { tool: 'codex', 'tool-bin': 'node', agent: 'deyvin', 'no-launch': true, json: true },
    logger,
    t
  });

  await runRuntimeEmit({
    args: [dir],
    options: { agent: 'deyvin', type: 'task_started', title: 'First task', json: true },
    logger,
    t
  });

  await assert.rejects(
    () => runRuntimeEmit({
      args: [dir],
      options: { agent: 'deyvin', type: 'task_started', title: 'Second task', json: true },
      logger,
      t
    }),
    /micro-task/i
  );
});

test('live:handoff rejects same agent for --agent and --to', async () => {
  const dir = await makeTempDir();
  const { t } = createTranslator('en');
  const logger = createCollectLogger();

  await runLiveStart({
    args: [dir],
    options: { tool: 'codex', 'tool-bin': 'node', agent: 'deyvin', 'no-launch': true, json: true },
    logger,
    t
  });

  await assert.rejects(
    () => runLiveHandoff({
      args: [dir],
      options: { agent: 'deyvin', to: 'deyvin', reason: 'test', json: true },
      logger,
      t
    }),
    /different/i
  );
});

test('live:close with --status=failed marks session as failed', async () => {
  const dir = await makeTempDir();
  const { t } = createTranslator('en');
  const logger = createCollectLogger();

  const start = await runLiveStart({
    args: [dir],
    options: { tool: 'codex', 'tool-bin': 'node', agent: 'deyvin', 'no-launch': true, json: true },
    logger,
    t
  });

  const close = await runLiveClose({
    args: [dir],
    options: { agent: 'deyvin', status: 'failed', summary: 'Process crashed', json: true },
    logger,
    t
  });

  assert.equal(close.ok, true);
  assert.equal(close.status, 'failed');

  const { db } = await openRuntimeDb(dir, { mustExist: true });
  try {
    const task = db.prepare('SELECT status FROM tasks WHERE task_key = ?').get(start.taskKey);
    assert.equal(task.status, 'failed');
    const run = db.prepare('SELECT status FROM agent_runs WHERE run_key = ?').get(start.runKey);
    assert.equal(run.status, 'failed');
  } finally {
    db.close();
  }
});

test('live:list returns sessions after start and close', async () => {
  const dir = await makeTempDir();
  const { t } = createTranslator('en');
  const logger = createCollectLogger();

  // Initialize the runtime DB first via live:start
  await runLiveStart({
    args: [dir],
    options: { tool: 'codex', 'tool-bin': 'node', agent: 'deyvin', 'no-launch': true, json: true },
    logger,
    t
  });

  const active = await runLiveList({
    args: [dir],
    options: { json: true },
    logger,
    t
  });
  assert.equal(active.ok, true);
  assert.equal(active.count, 1);
  assert.equal(active.sessions[0].phase, 'active');
  assert.equal(active.sessions[0].tool, 'codex');

  await runLiveClose({
    args: [dir],
    options: { agent: 'deyvin', summary: 'Done', json: true },
    logger,
    t
  });

  const afterClose = await runLiveList({
    args: [dir],
    options: { json: true },
    logger,
    t
  });
  assert.equal(afterClose.count, 1);
  assert.equal(afterClose.sessions[0].phase, 'closed');
});

test('state.json contains events_by_type breakdown after emit', async () => {
  const dir = await makeTempDir();
  const { t } = createTranslator('en');
  const logger = createCollectLogger();

  const start = await runLiveStart({
    args: [dir],
    options: { tool: 'codex', 'tool-bin': 'node', agent: 'deyvin', 'no-launch': true, json: true },
    logger,
    t
  });

  await runRuntimeEmit({
    args: [dir],
    options: { agent: 'deyvin', type: 'milestone', summary: 'First milestone', json: true },
    logger,
    t
  });

  await runRuntimeEmit({
    args: [dir],
    options: { agent: 'deyvin', type: 'milestone', summary: 'Second milestone', json: true },
    logger,
    t
  });

  await runRuntimeEmit({
    args: [dir],
    options: { agent: 'deyvin', type: 'block', summary: 'Blocked on API', json: true },
    logger,
    t
  });

  const statePath = path.join(dir, '.aioson', 'runtime', 'live', sessionKeyToDirName(start.sessionKey), 'state.json');
  const state = JSON.parse(await fs.readFile(statePath, 'utf8'));
  assert.equal(state.stats.events_by_type.milestone, 2);
  assert.equal(state.stats.events_by_type.block, 1);
  assert.equal(state.stats.events_total, 4);
});

test('execution_events in SQLite are consistent with ndjson events', async () => {
  const dir = await makeTempDir();
  const { t } = createTranslator('en');
  const logger = createCollectLogger();

  const start = await runLiveStart({
    args: [dir],
    options: { tool: 'codex', 'tool-bin': 'node', agent: 'deyvin', 'no-launch': true, json: true },
    logger,
    t
  });

  await runRuntimeEmit({
    args: [dir],
    options: { agent: 'deyvin', type: 'task_completed', summary: 'Done something', json: true },
    logger,
    t
  });

  await runLiveClose({
    args: [dir],
    options: { agent: 'deyvin', summary: 'All done', json: true },
    logger,
    t
  });

  const { db } = await openRuntimeDb(dir, { mustExist: true });
  try {
    const dbEvents = db.prepare(`
      SELECT event_type FROM execution_events
      WHERE session_key = ?
      ORDER BY sequence_no ASC, created_at ASC
    `).all(start.sessionKey);

    const types = dbEvents.map((row) => row.event_type);
    assert.equal(types.includes('session_started'), true);
    assert.equal(types.includes('task_completed'), true);
    assert.equal(types.includes('session_closed'), true);
  } finally {
    db.close();
  }
});
