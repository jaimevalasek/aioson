'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const { createTranslator } = require('../src/i18n');
const {
  runRuntimeInit,
  runRuntimeIngest,
  runRuntimeTaskStart,
  runRuntimeStart,
  runRuntimeUpdate,
  runRuntimeTaskFinish,
  runRuntimeFinish,
  runRuntimeStatus,
  runRuntimeSessionStart,
  runRuntimeSessionLog,
  runRuntimeSessionFinish,
  runRuntimeSessionStatus,
  runAgentRecover
} = require('../src/commands/runtime');
const {
  runLiveStart,
  runRuntimeEmit,
  runLiveHandoff
} = require('../src/commands/live');

async function makeTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-runtime-'));
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

test('runtime flow initializes store and tracks start/update/finish lifecycle', async () => {
  const dir = await makeTempDir();
  const { t } = createTranslator('pt-BR');
  const logger = createCollectLogger();

  const init = await runRuntimeInit({ args: [dir], options: {}, logger, t });
  assert.equal(init.ok, true);
  assert.equal(init.dbPath.endsWith(path.join('.aioson', 'runtime', 'aios.sqlite')), true);

  const task = await runRuntimeTaskStart({
    args: [dir],
    options: {
      squad: 'youtube-creator',
      session: 'session-001',
      title: 'Criar roteiro do video',
      goal: 'Entregar roteiro, titulo e hook',
      by: '@orquestrador'
    },
    logger,
    t
  });

  assert.equal(task.ok, true);
  assert.equal(typeof task.taskKey, 'string');

  const start = await runRuntimeStart({
    args: [dir],
    options: {
      task: task.taskKey,
      agent: '@roteirista-viral',
      squad: 'youtube-creator',
      session: 'session-001',
      title: 'Gerar roteiro do video',
      'used-skills': 'hook-clarity,retention-outline'
    },
    logger,
    t
  });

  assert.equal(start.ok, true);
  assert.equal(typeof start.runKey, 'string');
  assert.equal(start.status, 'running');

  const update = await runRuntimeUpdate({
    args: [dir],
    options: {
      run: start.runKey,
      message: 'Estrutura do roteiro pronta',
      summary: 'Abertura e blocos definidos',
      'used-skills': 'hook-clarity,story-flow'
    },
    logger,
    t
  });

  assert.equal(update.ok, true);
  assert.equal(update.status, 'running');

  const finish = await runRuntimeFinish({
    args: [dir],
    options: {
      run: start.runKey,
      task: task.taskKey,
      summary: 'Roteiro final entregue',
      output: 'output/youtube-creator/2026-03-06-video.html'
    },
    logger,
    t
  });

  assert.equal(finish.ok, true);
  assert.equal(finish.status, 'completed');

  const taskFinish = await runRuntimeTaskFinish({
    args: [dir],
    options: {
      task: task.taskKey
    },
    logger,
    t
  });

  assert.equal(taskFinish.ok, true);
  assert.equal(taskFinish.status, 'completed');

  const status = await runRuntimeStatus({
    args: [dir],
    options: { json: true },
    logger,
    t
  });

  assert.equal(status.ok, true);
  assert.equal(status.taskCounts.completed, 1);
  assert.equal(status.counts.running, 0);
  assert.equal(status.counts.completed, 1);
  assert.equal(status.activeTasks.length, 0);
  assert.equal(status.activeRuns.length, 0);
  assert.equal(status.recentTasks[0].task_key, task.taskKey);
  assert.equal(status.recentTasks[0].artifact_count, 1);
  assert.equal(status.recentRuns[0].agent_name, '@roteirista-viral');
  assert.equal(status.recentRuns[0].task_key, task.taskKey);
  assert.equal(status.recentRuns[0].squad_slug, 'youtube-creator');
  assert.equal(status.recentRuns[0].source, 'direct');
  assert.equal(status.recentRuns[0].output_path, 'output/youtube-creator/2026-03-06-video.html');
  assert.deepEqual(status.recentRuns[0].used_skills, ['hook-clarity', 'retention-outline', 'story-flow']);
  assert.equal(status.recentArtifacts[0].task_key, task.taskKey);
  assert.equal(status.recentArtifacts[0].file_path, 'output/youtube-creator/2026-03-06-video.html');
  assert.equal(Array.isArray(status.recentExecutionEvents), true);
  assert.equal(status.recentExecutionEvents.length > 0, true);
  assert.equal(status.recentExecutionEvents.some((event) => event.run_key === start.runKey && event.event_type === 'start'), true);
  assert.equal(status.recentExecutionEvents.some((event) => event.run_key === start.runKey && event.event_type === 'progress'), true);
  assert.equal(status.recentExecutionEvents.some((event) => event.run_key === start.runKey && event.event_type === 'finish'), true);
});

test('agent:recover closes stale workflow runs and workflow tasks', async () => {
  const dir = await makeTempDir();
  const { t } = createTranslator('en');
  const logger = createCollectLogger();

  const init = await runRuntimeInit({ args: [dir], options: {}, logger, t });
  assert.equal(init.ok, true);

  const task = await runRuntimeTaskStart({
    args: [dir],
    options: {
      session: 'workflow:feature:feature:demo',
      title: 'Workflow da feature demo',
      goal: 'Govern demo',
      by: '@workflow'
    },
    logger,
    t
  });

  const run = await runRuntimeStart({
    args: [dir],
    options: {
      task: task.taskKey,
      agent: '@dev',
      session: 'workflow:feature:feature:demo',
      title: 'Workflow stage @dev'
    },
    logger,
    t
  });

  const oldIso = '2026-01-01T00:00:00.000Z';
  const db = new Database(init.dbPath);
  try {
    db.prepare(`
      UPDATE tasks
      SET created_by = '@workflow', session_key = 'workflow:feature:feature:demo', status = 'running', created_at = ?, updated_at = ?
      WHERE task_key = ?
    `).run(oldIso, oldIso, task.taskKey);
    db.prepare(`
      UPDATE agent_runs
      SET source = 'workflow', workflow_id = 'workflow:feature:feature:demo', workflow_stage = 'dev', status = 'running', started_at = ?, updated_at = ?
      WHERE run_key = ?
    `).run(oldIso, oldIso, run.runKey);
  } finally {
    db.close();
  }

  const recovered = await runAgentRecover({
    args: [dir],
    options: { 'older-than': '1h', json: true },
    logger
  });

  assert.equal(recovered.ok, true);
  assert.ok(recovered.recovered.some((r) => r.source === 'workflow_run' && r.runKey === run.runKey));

  const verifyDb = new Database(init.dbPath, { readonly: true });
  try {
    assert.equal(
      verifyDb.prepare('SELECT status FROM agent_runs WHERE run_key = ?').get(run.runKey).status,
      'abandoned'
    );
    assert.equal(
      verifyDb.prepare('SELECT status FROM tasks WHERE task_key = ?').get(task.taskKey).status,
      'abandoned'
    );
  } finally {
    verifyDb.close();
  }
});

test('runtime direct session commands keep one tracked session open across multiple logs', async () => {
  const dir = await makeTempDir();
  const { t } = createTranslator('pt-BR');
  const logger = createCollectLogger();

  await runRuntimeInit({ args: [dir], options: {}, logger, t });

  const start = await runRuntimeSessionStart({
    args: [dir],
    options: {
      agent: 'deyvin',
      title: 'Sessao de continuidade'
    },
    logger,
    t
  });

  assert.equal(start.ok, true);
  assert.equal(start.agent, '@deyvin');
  assert.equal(start.open, true);
  assert.equal(start.reused, false);
  assert.equal(typeof start.runKey, 'string');
  assert.equal(typeof start.taskKey, 'string');

  const step = await runRuntimeSessionLog({
    args: [dir],
    options: {
      agent: '@deyvin',
      message: 'Corrigi validacao do modal de estoque'
    },
    logger,
    t
  });

  assert.equal(step.ok, true);
  assert.equal(step.autoStarted, false);
  assert.equal(step.runKey, start.runKey);

  const openStatus = await runRuntimeSessionStatus({
    args: [dir],
    options: {
      agent: 'deyvin',
      json: true
    },
    logger,
    t
  });

  assert.equal(openStatus.ok, true);
  assert.equal(openStatus.open, true);
  assert.equal(openStatus.state, 'open');
  assert.equal(openStatus.run.run_key, start.runKey);
  assert.equal(openStatus.task.task_key, start.taskKey);
  assert.equal(openStatus.recentEvents.some((event) => String(event.message).includes('Corrigi validacao do modal de estoque')), true);

  const finish = await runRuntimeSessionFinish({
    args: [dir],
    options: {
      agent: 'deyvin',
      summary: 'Sessao encerrada com correcoes no estoque'
    },
    logger,
    t
  });

  assert.equal(finish.ok, true);
  assert.equal(finish.finished, true);
  assert.equal(finish.open, false);

  const closedStatus = await runRuntimeSessionStatus({
    args: [dir],
    options: {
      agent: '@deyvin',
      json: true
    },
    logger,
    t
  });

  assert.equal(closedStatus.ok, true);
  assert.equal(closedStatus.open, false);
  assert.equal(closedStatus.state, 'closed');
  assert.equal(closedStatus.run.status, 'completed');
  assert.equal(closedStatus.recentEvents.some((event) => String(event.message).includes('Sessao encerrada com correcoes no estoque')), true);
});

test('runtime finish auto-registers content item when output package has index.html and content.json', async () => {
  const dir = await makeTempDir();
  const { t } = createTranslator('pt-BR');
  const logger = createCollectLogger();

  await runRuntimeInit({ args: [dir], options: {}, logger, t });

  const task = await runRuntimeTaskStart({
    args: [dir],
    options: {
      squad: 'youtube-creator',
      session: 'session-101',
      title: 'Criar pacote editorial',
      goal: 'Gerar roteiro e ativos',
      by: '@orquestrador'
    },
    logger,
    t
  });

  const start = await runRuntimeStart({
    args: [dir],
    options: {
      task: task.taskKey,
      agent: '@orquestrador',
      squad: 'youtube-creator',
      session: 'session-101',
      title: 'Publicar pacote editorial',
      'used-skills': 'editorial-package,seo-titles'
    },
    logger,
    t
  });

  const contentDir = path.join(dir, 'output', 'youtube-creator', 'pacote-editorial-001');
  await fs.mkdir(contentDir, { recursive: true });
  await fs.writeFile(path.join(contentDir, 'index.html'), '<html><body>ok</body></html>', 'utf8');
  await fs.writeFile(
    path.join(contentDir, 'content.json'),
    JSON.stringify(
      {
        schemaVersion: '1.0.0',
        contentKey: 'pacote-editorial-001',
        squadSlug: 'youtube-creator',
        taskKey: task.taskKey,
        title: 'Pacote editorial do video',
        contentType: 'pacote-editorial',
        layoutType: 'tabs',
        blueprint: 'pacote-principal',
        summary: 'Roteiro, titulos, descricao e tags.',
        blocks: [
          {
            type: 'hero',
            title: 'Pacote editorial do video',
            subtitle: 'Roteiro, titulos, descricao e tags.'
          },
          {
            type: 'tabs',
            items: [
              {
                label: 'Roteiro',
                blocks: [
                  {
                    type: 'rich-text',
                    content: 'Abertura, desenvolvimento e fechamento.'
                  }
                ]
              }
            ]
          }
        ]
      },
      null,
      2
    ),
    'utf8'
  );

  await runRuntimeFinish({
    args: [dir],
    options: {
      run: start.runKey,
      task: task.taskKey,
      summary: 'Pacote editorial publicado',
      output: 'output/youtube-creator/pacote-editorial-001/index.html',
      'used-skills': 'editorial-package,package-polish'
    },
    logger,
    t
  });

  const status = await runRuntimeStatus({
    args: [dir],
    options: { json: true },
    logger,
    t
  });

  assert.equal(status.recentContentItems.length, 1);
  assert.equal(status.recentContentItems[0].content_key, 'pacote-editorial-001');
  assert.equal(status.recentContentItems[0].content_type, 'pacote-editorial');
  assert.equal(status.recentContentItems[0].layout_type, 'tabs');
  assert.equal(status.recentContentItems[0].blueprint_slug, 'pacote-principal');
  assert.deepEqual(status.recentContentItems[0].used_skills, ['editorial-package', 'seo-titles', 'package-polish']);
  assert.equal(status.recentContentItems[0].html_path, 'output/youtube-creator/pacote-editorial-001/index.html');
  assert.equal(status.recentContentItems[0].json_path, 'output/youtube-creator/pacote-editorial-001/content.json');
});

test('runtime finish does not register malformed content item payloads', async () => {
  const dir = await makeTempDir();
  const { t } = createTranslator('pt-BR');
  const logger = createCollectLogger();

  await runRuntimeInit({ args: [dir], options: {}, logger, t });

  const task = await runRuntimeTaskStart({
    args: [dir],
    options: {
      squad: 'legal-research',
      session: 'session-202',
      title: 'Gerar parecer',
      goal: 'Estruturar pacote juridico',
      by: '@orquestrador'
    },
    logger,
    t
  });

  const start = await runRuntimeStart({
    args: [dir],
    options: {
      task: task.taskKey,
      agent: '@orquestrador',
      squad: 'legal-research',
      session: 'session-202',
      title: 'Publicar pacote juridico'
    },
    logger,
    t
  });

  const contentDir = path.join(dir, 'output', 'legal-research', 'parecer-001');
  await fs.mkdir(contentDir, { recursive: true });
  await fs.writeFile(path.join(contentDir, 'index.html'), '<html><body>ok</body></html>', 'utf8');
  await fs.writeFile(
    path.join(contentDir, 'content.json'),
    JSON.stringify(
      {
        schemaVersion: '1.0.0',
        contentKey: 'parecer-001',
        layoutType: 'tabs',
        blocks: []
      },
      null,
      2
    ),
    'utf8'
  );

  await runRuntimeFinish({
    args: [dir],
    options: {
      run: start.runKey,
      task: task.taskKey,
      summary: 'Pacote juridico publicado',
      output: 'output/legal-research/parecer-001/index.html'
    },
    logger,
    t
  });

  const status = await runRuntimeStatus({
    args: [dir],
    options: { json: true },
    logger,
    t
  });

  assert.equal(status.recentContentItems.length, 0);
  assert.equal(status.recentArtifacts.length, 1);
  assert.match(logger.lines.join('\n'), /skipped content indexing/i);
});

test('runtime ingest indexes standalone markdown and html outputs for content-only squads', async () => {
  const dir = await makeTempDir();
  const { t } = createTranslator('pt-BR');
  const logger = createCollectLogger();

  await runRuntimeInit({ args: [dir], options: {}, logger, t });

  const outputDir = path.join(dir, 'output', 'composicao-gospel');
  await fs.mkdir(path.join(outputDir, 'hino-de-esperanca'), { recursive: true });
  await fs.writeFile(
    path.join(outputDir, 'hino-de-esperanca', 'letra.md'),
    '# Hino de Esperanca\n\nVerso 1\n\nRefrao',
    'utf8'
  );
  await fs.writeFile(
    path.join(outputDir, 'hino-de-esperanca', 'preview.html'),
    '<html><body><h1>Hino de Esperanca</h1><p>Verso 1</p><p>Refrao</p></body></html>',
    'utf8'
  );

  const ingest = await runRuntimeIngest({
    args: [dir],
    options: {
      squad: 'composicao-gospel',
      agent: '@compositor'
    },
    logger,
    t
  });

  assert.equal(ingest.ok, true);
  assert.equal(ingest.indexed, 2);

  const status = await runRuntimeStatus({
    args: [dir],
    options: { json: true },
    logger,
    t
  });

  assert.equal(status.recentContentItems.length, 2);
  assert.equal(status.recentContentItems[0].squad_slug, 'composicao-gospel');
  assert.equal(status.recentContentItems.some((item) => item.content_type === 'text-content'), true);
  assert.equal(status.recentContentItems.some((item) => item.content_type === 'html-content'), true);
});

test('runtime finish accepts simple content.json payloads without explicit blocks', async () => {
  const dir = await makeTempDir();
  const { t } = createTranslator('pt-BR');
  const logger = createCollectLogger();

  await runRuntimeInit({ args: [dir], options: {}, logger, t });

  const task = await runRuntimeTaskStart({
    args: [dir],
    options: {
      squad: 'composicao-gospel',
      session: 'session-404',
      title: 'Gerar musica',
      by: '@orquestrador'
    },
    logger,
    t
  });

  const start = await runRuntimeStart({
    args: [dir],
    options: {
      task: task.taskKey,
      agent: '@compositor',
      squad: 'composicao-gospel',
      session: 'session-404',
      title: 'Escrever musica'
    },
    logger,
    t
  });

  const contentDir = path.join(dir, 'output', 'composicao-gospel', 'musica-01');
  await fs.mkdir(contentDir, { recursive: true });
  await fs.writeFile(path.join(contentDir, 'index.html'), '<html><body>ok</body></html>', 'utf8');
  await fs.writeFile(
    path.join(contentDir, 'content.json'),
    JSON.stringify(
      {
        contentKey: 'musica-01',
        title: 'Musica 01',
        contentType: 'song',
        layoutType: 'document',
        lyrics: 'Verso 1\n\nRefrao'
      },
      null,
      2
    ),
    'utf8'
  );

  await runRuntimeFinish({
    args: [dir],
    options: {
      run: start.runKey,
      task: task.taskKey,
      output: 'output/composicao-gospel/musica-01/index.html'
    },
    logger,
    t
  });

  const status = await runRuntimeStatus({
    args: [dir],
    options: { json: true },
    logger,
    t
  });

  assert.equal(status.recentContentItems.length, 1);
  assert.equal(status.recentContentItems[0].content_type, 'song');
  assert.equal(status.recentContentItems[0].layout_type, 'document');
});

test('runtime finish auto-indexes standalone markdown outputs', async () => {
  const dir = await makeTempDir();
  const { t } = createTranslator('pt-BR');
  const logger = createCollectLogger();

  await runRuntimeInit({ args: [dir], options: {}, logger, t });

  const task = await runRuntimeTaskStart({
    args: [dir],
    options: {
      squad: 'composicao-gospel',
      session: 'session-505',
      title: 'Gerar letra',
      by: '@orquestrador'
    },
    logger,
    t
  });

  const start = await runRuntimeStart({
    args: [dir],
    options: {
      task: task.taskKey,
      agent: '@compositor',
      squad: 'composicao-gospel',
      session: 'session-505',
      title: 'Escrever letra'
    },
    logger,
    t
  });

  const outputPath = path.join(dir, 'output', 'composicao-gospel', 'letra-final.md');
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, '# Letra final\n\nVerso 1\n\nRefrao', 'utf8');

  await runRuntimeFinish({
    args: [dir],
    options: {
      run: start.runKey,
      task: task.taskKey,
      output: 'output/composicao-gospel/letra-final.md'
    },
    logger,
    t
  });

  const status = await runRuntimeStatus({
    args: [dir],
    options: { json: true },
    logger,
    t
  });

  assert.equal(status.recentContentItems.length, 1);
  assert.equal(status.recentContentItems[0].content_type, 'text-content');
  assert.equal(status.recentContentItems[0].squad_slug, 'composicao-gospel');
});


test('runtime status exposes live sessions, micro-tasks, and handoffs from the live runtime flow', async () => {
  const dir = await makeTempDir();
  const { t } = createTranslator('pt-BR');
  const logger = createCollectLogger();

  await fs.writeFile(path.join(dir, 'plan.md'), [
    '# Plano',
    '',
    '### RF-01 - Entregar launcher rastreado'
  ].join('\n'));

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

  await runRuntimeEmit({
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

  await runRuntimeEmit({
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

  await runRuntimeEmit({
    args: [dir],
    options: {
      agent: 'deyvin',
      type: 'task_completed',
      summary: 'Corrigi o modal de estoque',
      json: true
    },
    logger,
    t
  });

  await runLiveHandoff({
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

  const status = await runRuntimeStatus({
    args: [dir],
    options: { json: true },
    logger,
    t
  });

  assert.equal(status.ok, true);
  assert.equal(status.activeLiveSessions.length, 1);
  assert.equal(status.activeLiveSessions[0].task_key, start.taskKey);
  assert.equal(status.activeLiveSessions[0].latest_agent_name, '@product');
  assert.equal(status.activeLiveSessions[0].plan_steps_done, 1);
  assert.equal(status.activeLiveSessions[0].plan_steps_total, 1);
  assert.equal(status.activeLiveSessions[0].child_task_count, 1);
  assert.equal(status.activeLiveSessions[0].completed_child_task_count, 1);
  assert.equal(status.activeLiveSessions[0].handoff_count, 1);
  assert.equal(status.activeMicroTasks.length, 0);
  assert.equal(status.recentMicroTasks.some((task) => task.parent_task_key === start.taskKey), true);
  assert.equal(status.recentHandoffs.length > 0, true);
  assert.equal(status.recentHandoffs[0].handoff_to, '@product');
  assert.equal(status.recentHandoffs[0].handoff_from, '@deyvin');
  assert.equal(status.activeRuns[0].agent_name, '@product');
  assert.equal(status.activeRuns[0].is_handoff_child, true);
  assert.equal(status.recentExecutionEvents.some((event) => event.is_handoff), true);
});
