'use strict';

// O `hooks:emit` gravava todo uso de ferramenta numa sessão "[hooks] dev"
// guardada em `.sessions/dev.json` — aberta uma vez e nunca fechada — em vez
// da sessão que o `live:start` abriu. Quem acompanha a sessão aberta (o
// `live:status`, a aba Atividade do Play) não via nenhuma edição nem comando.
// Agora o evento vai para a sessão que abriu a ferramenta.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createTranslator } = require('../src/i18n');
const { runLiveStart, runLiveHandoff, sessionKeyToDirName } = require('../src/commands/live');
const { openRuntimeDb } = require('../src/runtime-store');

const CLI = path.join(__dirname, '..', 'bin', 'aioson.js');
const EDIT_PAYLOAD = { tool_name: 'Edit', tool_input: { file_path: 'src/app.js' } };
const silent = { log() {}, error() {} };
const { t } = createTranslator('pt-BR');

function makeProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-hooks-live-'));
  fs.mkdirSync(path.join(dir, '.aioson'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.aioson', 'config.md'), '# project\n', 'utf8');
  return dir;
}

function cleanEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  if (!('AIOSON_LIVE_SESSION_KEY' in extra)) delete env.AIOSON_LIVE_SESSION_KEY;
  return env;
}

// O mesmo comando que o gancho do Claude Code roda, com o payload na entrada.
function emitHook(dir, env, payload = EDIT_PAYLOAD) {
  const result = spawnSync(process.execPath, [CLI, 'hooks:emit', dir, '--agent=dev', '--source=claude'], {
    input: JSON.stringify(payload),
    env,
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, result.stderr);
}

async function eventsOf(dir, runKey) {
  const { db } = await openRuntimeDb(dir, { mustExist: true });
  try {
    return db.prepare('SELECT event_type, message FROM agent_events WHERE run_key = ? ORDER BY id').all(runKey);
  } finally {
    db.close();
  }
}

function hooksSessionFile(dir) {
  return path.join(dir, '.aioson', 'runtime', '.sessions', 'dev.json');
}

function startNoLaunch(dir, agent = 'product') {
  return runLiveStart({
    args: [dir],
    options: { tool: 'claude', 'tool-bin': 'node', agent, 'no-launch': true, json: true },
    logger: silent,
    t
  });
}

function setChildPid(dir, sessionKey, pid) {
  const statePath = path.join(dir, '.aioson', 'runtime', 'live', sessionKeyToDirName(sessionKey), 'state.json');
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  state.child_pid = pid;
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');
}

test('com AIOSON_LIVE_SESSION_KEY o evento vai para a sessão aberta, e segue o agente no handoff', async () => {
  const dir = makeProject();
  try {
    const start = await startNoLaunch(dir);
    emitHook(dir, cleanEnv({ AIOSON_LIVE_SESSION_KEY: start.sessionKey }));

    assert.deepEqual(
      (await eventsOf(dir, start.runKey)).filter((e) => e.event_type === 'artifact'),
      [{ event_type: 'artifact', message: 'Edit: app.js' }]
    );
    assert.equal(fs.existsSync(hooksSessionFile(dir)), false, 'não abriu a sessão paralela "[hooks] dev"');

    const handoff = await runLiveHandoff({
      args: [dir],
      options: { agent: 'product', to: 'dev', reason: 'implementar', json: true },
      logger: silent,
      t
    });
    emitHook(dir, cleanEnv({ AIOSON_LIVE_SESSION_KEY: start.sessionKey }));

    assert.equal((await eventsOf(dir, handoff.runKey)).filter((e) => e.event_type === 'artifact').length, 1);
    assert.equal((await eventsOf(dir, start.runKey)).filter((e) => e.event_type === 'artifact').length, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('chave de uma sessão de outro projeto não atribui nada aqui', async () => {
  const projectA = makeProject();
  const projectB = makeProject();
  try {
    const start = await startNoLaunch(projectA);
    emitHook(projectB, cleanEnv({ AIOSON_LIVE_SESSION_KEY: start.sessionKey }));

    assert.equal((await eventsOf(projectA, start.runKey)).filter((e) => e.event_type === 'artifact').length, 0);
    assert.equal(fs.existsSync(hooksSessionFile(projectB)), true, 'no projeto B segue o caminho antigo');
  } finally {
    fs.rmSync(projectA, { recursive: true, force: true });
    fs.rmSync(projectB, { recursive: true, force: true });
  }
});

test('sem a chave, a única sessão aberta do projeto com processo vivo recebe o evento', async () => {
  const dir = makeProject();
  try {
    const start = await startNoLaunch(dir);
    setChildPid(dir, start.sessionKey, process.pid);
    emitHook(dir, cleanEnv());

    assert.equal((await eventsOf(dir, start.runKey)).filter((e) => e.event_type === 'artifact').length, 1);
    assert.equal(fs.existsSync(hooksSessionFile(dir)), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('sem a chave, sessão com processo morto ou duas sessões abertas caem no caminho antigo', async () => {
  const dir = makeProject();
  try {
    const first = await startNoLaunch(dir, 'product');
    setChildPid(dir, first.sessionKey, 0);
    emitHook(dir, cleanEnv());
    assert.equal((await eventsOf(dir, first.runKey)).filter((e) => e.event_type === 'artifact').length, 0);

    const second = await startNoLaunch(dir, 'qa');
    setChildPid(dir, first.sessionKey, process.pid);
    setChildPid(dir, second.sessionKey, process.pid);
    emitHook(dir, cleanEnv());
    assert.equal((await eventsOf(dir, first.runKey)).filter((e) => e.event_type === 'artifact').length, 0);
    assert.equal((await eventsOf(dir, second.runKey)).filter((e) => e.event_type === 'artifact').length, 0);
    assert.equal(fs.existsSync(hooksSessionFile(dir)), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// Ferramenta de mentira aberta pelo `live:start` de verdade: faz o papel do
// gancho do Claude Code, rodando `hooks:emit` com o ambiente que herdou.
function writeFakeTool(dir) {
  const script = path.join(dir, 'node_modules', 'fake-claude', 'cli.js');
  fs.mkdirSync(path.dirname(script), { recursive: true });
  fs.writeFileSync(script, [
    '#!/usr/bin/env node',
    "const { spawnSync } = require('node:child_process');",
    `spawnSync(process.execPath, [${JSON.stringify(CLI)}, 'hooks:emit', process.cwd(), '--agent=dev', '--source=claude'], {`,
    `  input: ${JSON.stringify(JSON.stringify(EDIT_PAYLOAD))},`,
    "  stdio: ['pipe', 'ignore', 'ignore']",
    '});',
    ''
  ].join('\n'), 'utf8');
  if (process.platform !== 'win32') {
    fs.chmodSync(script, 0o755);
    return script;
  }
  // Mesmo formato do atalho que o npm grava na pasta global.
  const shim = path.join(dir, 'fake-claude.cmd');
  fs.writeFileSync(
    shim,
    '@ECHO off\r\nSETLOCAL\r\nIF EXIST "%dp0%\\node.exe" (\r\n  SET "_prog=%dp0%\\node.exe"\r\n) ELSE (\r\n  SET "_prog=node"\r\n)\r\n"%_prog%"  "%dp0%\\node_modules\\fake-claude\\cli.js" %*\r\n',
    'utf8'
  );
  return shim;
}

test('live:start entrega a chave da sessão à ferramenta, e o gancho dela grava na sessão', async () => {
  const dir = makeProject();
  const previous = process.env.AIOSON_LIVE_SESSION_KEY;
  delete process.env.AIOSON_LIVE_SESSION_KEY;
  try {
    const start = await runLiveStart({
      args: [dir],
      options: { tool: 'claude', 'tool-bin': writeFakeTool(dir), agent: 'product' },
      logger: silent,
      t
    });

    assert.equal(start.ok, true);
    assert.deepEqual(
      (await eventsOf(dir, start.runKey)).filter((e) => e.event_type === 'artifact'),
      [{ event_type: 'artifact', message: 'Edit: app.js' }]
    );
    assert.equal(fs.existsSync(hooksSessionFile(dir)), false);
  } finally {
    if (previous !== undefined) process.env.AIOSON_LIVE_SESSION_KEY = previous;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
