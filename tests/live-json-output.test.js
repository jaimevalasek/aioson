'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { sessionKeyToDirName } = require('../src/commands/live');

async function makeTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-live-json-'));
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

test('live session commands return structured JSON payloads with plan progress and handoff', async () => {
  const dir = await makeTempDir();
  await fs.writeFile(path.join(dir, 'plan.md'), [
    '# Plano',
    '',
    '### RF-01 - Entregar launcher',
    '### RF-02 - Documentar fluxo'
  ].join('\n'));

  const start = await runCli([
    'live:start',
    dir,
    '--tool=codex',
    '--tool-bin=node',
    '--agent=deyvin',
    '--title=Sessao viva do deyvin',
    '--plan=plan.md',
    '--no-launch',
    '--json'
  ]);
  assert.equal(start.code, 0);
  const startParsed = JSON.parse(start.stdout);
  assert.equal(startParsed.ok, true);
  assert.equal(startParsed.agent, '@deyvin');
  assert.equal(startParsed.tool, 'codex');
  assert.equal(startParsed.reused, false);

  const taskStarted = await runCli([
    'runtime:emit',
    dir,
    '--agent=deyvin',
    '--type=task_started',
    '--title=Corrigir modal de estoque',
    '--json'
  ]);
  assert.equal(taskStarted.code, 0);
  const taskStartedParsed = JSON.parse(taskStarted.stdout);
  assert.equal(taskStartedParsed.ok, true);
  assert.equal(typeof taskStartedParsed.currentTask, 'string');

  const checkpoint = await runCli([
    'runtime:emit',
    dir,
    '--agent=deyvin',
    '--type=plan_checkpoint',
    '--plan-step=RF-01',
    '--summary=Launcher entregue',
    '--json'
  ]);
  assert.equal(checkpoint.code, 0);
  const checkpointParsed = JSON.parse(checkpoint.stdout);
  assert.equal(checkpointParsed.ok, true);
  assert.equal(checkpointParsed.eventType, 'plan_checkpoint');

  const taskCompleted = await runCli([
    'runtime:emit',
    dir,
    '--agent=@deyvin',
    '--type=task_completed',
    '--summary=Corrigi o modal de estoque',
    '--refs=src/app.js,src/styles.css',
    '--json'
  ]);
  assert.equal(taskCompleted.code, 0);
  const taskCompletedParsed = JSON.parse(taskCompleted.stdout);
  assert.equal(taskCompletedParsed.ok, true);
  assert.equal(taskCompletedParsed.currentTask, null);

  const handoff = await runCli([
    'live:handoff',
    dir,
    '--agent=deyvin',
    '--to=product',
    '--reason=Escopo exige decisao de produto',
    '--json'
  ]);
  assert.equal(handoff.code, 0);
  const handoffParsed = JSON.parse(handoff.stdout);
  assert.equal(handoffParsed.ok, true);
  assert.equal(handoffParsed.agent, '@deyvin');
  assert.equal(handoffParsed.nextAgent, '@product');

  const statusOpen = await runCli([
    'live:status',
    dir,
    '--agent=product',
    '--json'
  ]);
  assert.equal(statusOpen.code, 0);
  const statusOpenParsed = JSON.parse(statusOpen.stdout);
  assert.equal(statusOpenParsed.ok, true);
  assert.equal(statusOpenParsed.phase, 'active');
  assert.equal(statusOpenParsed.agent, '@product');
  assert.equal(statusOpenParsed.stats.events_total, 5);
  assert.equal(statusOpenParsed.stats.tasks_completed, 1);
  assert.equal(statusOpenParsed.stats.plan_steps_done, 1);
  assert.equal(statusOpenParsed.stats.plan_steps_total, 2);

  const close = await runCli([
    'live:close',
    dir,
    '--agent=product',
    '--summary=Sessao encerrada via CLI',
    '--json'
  ]);
  assert.equal(close.code, 0);
  const closeParsed = JSON.parse(close.stdout);
  assert.equal(closeParsed.ok, true);
  assert.equal(closeParsed.closed, true);
  assert.equal(closeParsed.status, 'completed');

  const statusClosed = await runCli([
    'live:status',
    dir,
    '--agent=@product',
    '--json'
  ]);
  assert.equal(statusClosed.code, 0);
  const statusClosedParsed = JSON.parse(statusClosed.stdout);
  assert.equal(statusClosedParsed.ok, true);
  assert.equal(statusClosedParsed.phase, 'closed');
  assert.equal(statusClosedParsed.open, false);

  const summaryPath = path.join(dir, '.aioson', 'runtime', 'live', sessionKeyToDirName(startParsed.sessionKey), 'summary.md');
  const summary = await fs.readFile(summaryPath, 'utf8');
  assert.equal(summary.includes('Sessao encerrada via CLI'), true);
});
