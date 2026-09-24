'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

async function makeTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-runtime-json-'));
}

function runCli(args, cwd = process.cwd()) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(process.cwd(), 'bin/aioson.js'), ...args], {
      cwd,
      env: process.env
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

test('runtime commands return structured JSON payloads', async () => {
  const dir = await makeTempDir();

  const init = await runCli(['runtime:init', dir, '--json']);
  assert.equal(init.code, 0);
  const initParsed = JSON.parse(init.stdout);
  assert.equal(initParsed.ok, true);

  const task = await runCli([
    'runtime:task:start',
    dir,
    '--title=Gerar pacote editorial',
    '--squad=youtube-creator',
    '--session=session-002',
    '--json'
  ]);
  assert.equal(task.code, 0);
  const taskParsed = JSON.parse(task.stdout);
  assert.equal(taskParsed.ok, true);
  assert.equal(typeof taskParsed.taskKey, 'string');

  const start = await runCli([
    'runtime:start',
    dir,
    `--task=${taskParsed.taskKey}`,
    '--agent=@copywriter',
    '--squad=youtube-creator',
    '--session=session-002',
    '--title=Gerar titulos',
    '--used-skills=hook-clarity,title-scan',
    '--json'
  ]);
  assert.equal(start.code, 0);
  const startParsed = JSON.parse(start.stdout);
  assert.equal(startParsed.ok, true);
  assert.equal(typeof startParsed.runKey, 'string');

  const status = await runCli(['runtime:status', dir, '--json']);
  assert.equal(status.code, 0);
  const statusParsed = JSON.parse(status.stdout);
  assert.equal(statusParsed.ok, true);
  assert.equal(statusParsed.taskCounts.running, 1);
  assert.equal(statusParsed.counts.running, 1);
  assert.equal(statusParsed.activeTasks[0].task_key, taskParsed.taskKey);
  assert.equal(statusParsed.activeRuns[0].agent_name, '@copywriter');
  assert.deepEqual(statusParsed.activeRuns[0].used_skills, ['hook-clarity', 'title-scan']);
  assert.equal(Array.isArray(statusParsed.recentContentItems), true);
});

test('runtime direct session commands return structured JSON payloads', async () => {
  const dir = await makeTempDir();

  const init = await runCli(['runtime:init', dir, '--json']);
  assert.equal(init.code, 0);

  const start = await runCli([
    'runtime:session:start',
    dir,
    '--agent=deyvin',
    '--title=Sessao de continuidade',
    '--json'
  ]);
  assert.equal(start.code, 0);
  const startParsed = JSON.parse(start.stdout);
  assert.equal(startParsed.ok, true);
  // deyvin is a retired id: the session is canonicalized under @dev.
  assert.equal(startParsed.agent, '@dev');
  assert.equal(startParsed.open, true);

  const log = await runCli([
    'runtime:session:log',
    dir,
    '--agent=@dev',
    '--message=Corrigi o fluxo de entrada de estoque',
    '--json'
  ]);
  assert.equal(log.code, 0);
  const logParsed = JSON.parse(log.stdout);
  assert.equal(logParsed.ok, true);
  assert.equal(logParsed.runKey, startParsed.runKey);

  const statusOpen = await runCli(['runtime:session:status', dir, '--agent=dev', '--json']);
  assert.equal(statusOpen.code, 0);
  const statusOpenParsed = JSON.parse(statusOpen.stdout);
  assert.equal(statusOpenParsed.ok, true);
  assert.equal(statusOpenParsed.open, true);
  assert.equal(statusOpenParsed.run.run_key, startParsed.runKey);

  const finish = await runCli([
    'runtime:session:finish',
    dir,
    '--agent=dev',
    '--summary=Sessao encerrada',
    '--json'
  ]);
  assert.equal(finish.code, 0);
  const finishParsed = JSON.parse(finish.stdout);
  assert.equal(finishParsed.ok, true);
  assert.equal(finishParsed.finished, true);

  const statusClosed = await runCli(['runtime:session:status', dir, '--agent=@dev', '--json']);
  assert.equal(statusClosed.code, 0);
  const statusClosedParsed = JSON.parse(statusClosed.stdout);
  assert.equal(statusClosedParsed.ok, true);
  assert.equal(statusClosedParsed.open, false);
  assert.equal(statusClosedParsed.state, 'closed');
});

test('runtime ingest returns structured JSON payloads', async () => {
  const dir = await makeTempDir();

  const init = await runCli(['runtime:init', dir, '--json']);
  assert.equal(init.code, 0);

  await fs.mkdir(path.join(dir, 'output', 'composicao-gospel'), { recursive: true });
  await fs.writeFile(
    path.join(dir, 'output', 'composicao-gospel', 'musica.md'),
    '# Musica\n\nVerso 1\n\nRefrao',
    'utf8'
  );

  const ingest = await runCli([
    'runtime:ingest',
    dir,
    '--squad=composicao-gospel',
    '--agent=@compositor',
    '--used-skills=gospel-lyrics,chorus-design',
    '--json'
  ]);
  assert.equal(ingest.code, 0);
  const ingestParsed = JSON.parse(ingest.stdout);
  assert.equal(ingestParsed.ok, true);
  assert.equal(ingestParsed.indexed, 1);
  assert.equal(Array.isArray(ingestParsed.reasons), true);

  const status = await runCli(['runtime:status', dir, '--json']);
  assert.equal(status.code, 0);
  const statusParsed = JSON.parse(status.stdout);
  assert.deepEqual(statusParsed.recentContentItems[0].used_skills, ['gospel-lyrics', 'chorus-design']);
});


test('runtime status JSON exposes live sessions, micro-tasks, and handoffs', async () => {
  const dir = await makeTempDir();
  await fs.writeFile(path.join(dir, 'plan.md'), [
    '# Plano',
    '',
    '### RF-01 - Entregar launcher rastreado'
  ].join('\n'));

  const start = await runCli([
    'live:start',
    dir,
    '--tool=codex',
    '--tool-bin=node',
    '--agent=dev',
    '--title=Sessao viva do dev',
    '--plan=plan.md',
    '--no-launch',
    '--json'
  ]);
  assert.equal(start.code, 0);
  const startParsed = JSON.parse(start.stdout);

  await runCli([
    'runtime:emit',
    dir,
    '--agent=dev',
    '--type=task_started',
    '--title=Corrigir modal de estoque',
    '--json'
  ]);
  await runCli([
    'runtime:emit',
    dir,
    '--agent=dev',
    '--type=plan_checkpoint',
    '--plan-step=RF-01',
    '--summary=Launcher entregue',
    '--json'
  ]);
  await runCli([
    'runtime:emit',
    dir,
    '--agent=dev',
    '--type=task_completed',
    '--summary=Corrigi o modal de estoque',
    '--json'
  ]);
  await runCli([
    'live:handoff',
    dir,
    '--agent=dev',
    '--to=product',
    '--reason=Escopo exige decisao de produto',
    '--json'
  ]);

  const status = await runCli(['runtime:status', dir, '--json']);
  assert.equal(status.code, 0);
  const statusParsed = JSON.parse(status.stdout);
  assert.equal(statusParsed.ok, true);
  assert.equal(statusParsed.activeLiveSessions.length, 1);
  assert.equal(statusParsed.activeLiveSessions[0].task_key, startParsed.taskKey);
  assert.equal(statusParsed.activeLiveSessions[0].latest_agent_name, '@product');
  assert.equal(statusParsed.activeLiveSessions[0].plan_steps_done, 1);
  assert.equal(statusParsed.activeLiveSessions[0].plan_steps_total, 1);
  assert.equal(statusParsed.recentMicroTasks.some((task) => task.parent_task_key === startParsed.taskKey), true);
  assert.equal(statusParsed.recentHandoffs.length > 0, true);
  assert.equal(statusParsed.recentHandoffs[0].handoff_to, '@product');
  assert.equal(statusParsed.activeRuns[0].is_handoff_child, true);
});
