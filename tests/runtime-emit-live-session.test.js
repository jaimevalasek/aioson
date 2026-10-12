'use strict';

// O `runtime:emit` procurava a sessão pelo nome do agente (`--agent=dev`). Na
// sessão que o Play abre, a ferramenta é lançada como outro agente (`product`)
// e quem reporta o marco é o agente ativado depois; o marco caía num run solto
// ou na sessão velha "[hooks] dev". A aba Atividade, que só atualiza o relato
// em marco, nunca via nenhum. Agora o marco vai para a sessão que abriu a
// ferramenta, com a mesma regra do `hooks:emit`.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createTranslator } = require('../src/i18n');
const { runLiveStart, sessionKeyToDirName } = require('../src/commands/live');
const { openRuntimeDb } = require('../src/runtime-store');

const CLI = path.join(__dirname, '..', 'bin', 'aioson.js');
const silent = { log() {}, error() {} };
const { t } = createTranslator('pt-BR');

function makeProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-emit-live-'));
  fs.mkdirSync(path.join(dir, '.aioson'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.aioson', 'config.md'), '# project\n', 'utf8');
  return dir;
}

function cleanEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  if (!('AIOSON_LIVE_SESSION_KEY' in extra)) delete env.AIOSON_LIVE_SESSION_KEY;
  return env;
}

// O mesmo comando que os agentes rodam para registrar um marco.
function emitMilestone(dir, env, summary = 'Fatia vertical pronta') {
  const result = spawnSync(
    process.execPath,
    [CLI, 'runtime:emit', dir, '--agent=dev', '--type=milestone', `--summary=${summary}`, '--json'],
    { env, encoding: 'utf8' }
  );
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

async function milestonesOf(dir, runKey) {
  const { db } = await openRuntimeDb(dir, { mustExist: true });
  try {
    return db.prepare(
      "SELECT message, payload_json FROM agent_events WHERE run_key = ? AND event_type = 'milestone' ORDER BY id"
    ).all(runKey);
  } finally {
    db.close();
  }
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

// Sessão "[hooks] dev" esquecida aberta, como a que existia nos projetos reais.
function emitStaleHooksEvent(dir) {
  const result = spawnSync(process.execPath, [CLI, 'hooks:emit', dir, '--agent=dev', '--source=claude'], {
    input: JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: 'src/app.js' } }),
    env: cleanEnv(),
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, result.stderr);
  const session = JSON.parse(fs.readFileSync(path.join(dir, '.aioson', 'runtime', '.sessions', 'dev.json'), 'utf8'));
  return session.runKey;
}

test('com AIOSON_LIVE_SESSION_KEY o marco do agente vai para a sessão que abriu a ferramenta', async () => {
  const dir = makeProject();
  try {
    const staleRun = emitStaleHooksEvent(dir);
    const start = await startNoLaunch(dir);

    const result = emitMilestone(dir, cleanEnv({ AIOSON_LIVE_SESSION_KEY: start.sessionKey }));

    assert.equal(result.sessionKey, start.sessionKey);
    const [milestone] = await milestonesOf(dir, start.runKey);
    assert.equal(milestone.message, 'Fatia vertical pronta');
    assert.equal(JSON.parse(milestone.payload_json).emitted_by, '@dev');
    assert.deepEqual(await milestonesOf(dir, staleRun), [], 'a sessão velha "[hooks] dev" não recebe o marco');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('sem a chave, a única sessão aberta do projeto com processo vivo recebe o marco', async () => {
  const dir = makeProject();
  try {
    const start = await startNoLaunch(dir);
    setChildPid(dir, start.sessionKey, process.pid);

    emitMilestone(dir, cleanEnv());

    assert.equal((await milestonesOf(dir, start.runKey)).length, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('sem sessão que tenha aberto a ferramenta, o marco segue o caminho antigo', async () => {
  const dir = makeProject();
  try {
    const first = await startNoLaunch(dir, 'product');
    const second = await startNoLaunch(dir, 'qa');
    setChildPid(dir, first.sessionKey, process.pid);
    setChildPid(dir, second.sessionKey, process.pid);

    // Duas sessões abertas: não adivinha qual é a dona.
    const result = emitMilestone(dir, cleanEnv());

    assert.notEqual(result.sessionKey, first.sessionKey);
    assert.notEqual(result.sessionKey, second.sessionKey);
    assert.equal((await milestonesOf(dir, first.runKey)).length, 0);
    assert.equal((await milestonesOf(dir, second.runKey)).length, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('chave de uma sessão de outro projeto não atribui o marco aqui', async () => {
  const projectA = makeProject();
  const projectB = makeProject();
  try {
    const start = await startNoLaunch(projectA);
    await startNoLaunch(projectB);

    emitMilestone(projectB, cleanEnv({ AIOSON_LIVE_SESSION_KEY: start.sessionKey }));

    assert.equal((await milestonesOf(projectA, start.runKey)).length, 0);
  } finally {
    fs.rmSync(projectA, { recursive: true, force: true });
    fs.rmSync(projectB, { recursive: true, force: true });
  }
});
