'use strict';

// O Play abria toda sessão como `@product` e a Atividade mostrava "claude ·
// @product" mesmo quando o trabalho inteiro era do @dev: abrir a sessão nunca
// carrega agente nenhum, e a ativação dentro da ferramenta (`/aioson:agent:dev`)
// não chegava a lugar nenhum. Agora `live:start` sem agente abre a sessão
// neutra e o gancho do prompt grava `agent_activated` na sessão.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createTranslator } = require('../src/i18n');
const { runLiveStart, NEUTRAL_LIVE_AGENT } = require('../src/commands/live');
const { agentFromPrompt } = require('../src/commands/hooks-emit');
const { buildClaudeHooks } = require('../src/commands/hooks-install');
const { openRuntimeDb } = require('../src/runtime-store');

const CLI = path.join(__dirname, '..', 'bin', 'aioson.js');
const silent = { log() {}, error() {} };
const { t } = createTranslator('pt-BR');

function makeProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-agent-activation-'));
  fs.mkdirSync(path.join(dir, '.aioson'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.aioson', 'config.md'), '# project\n', 'utf8');
  return dir;
}

function prompt(dir, sessionKey, text) {
  const env = { ...process.env };
  delete env.AIOSON_LIVE_SESSION_KEY;
  if (sessionKey) env.AIOSON_LIVE_SESSION_KEY = sessionKey;
  const result = spawnSync(process.execPath, [CLI, 'hooks:emit', dir, '--agent=dev', '--source=claude'], {
    input: JSON.stringify({ hook_event_name: 'UserPromptSubmit', prompt: text }),
    env,
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, result.stderr);
}

async function activations(dir) {
  const { db } = await openRuntimeDb(dir, { mustExist: true });
  try {
    return db.prepare("SELECT run_key, message, payload_json FROM agent_events WHERE event_type = 'agent_activated' ORDER BY id").all();
  } finally {
    db.close();
  }
}

function startNeutral(dir) {
  return runLiveStart({
    args: [dir],
    options: { tool: 'claude', 'tool-bin': 'node', 'no-launch': true, json: true },
    logger: silent,
    t
  });
}

test('sem --agent a sessão abre neutra, sem nome de agente nenhum', async () => {
  const dir = makeProject();
  try {
    const start = await startNeutral(dir);
    assert.equal(start.agent, NEUTRAL_LIVE_AGENT);
    const { db } = await openRuntimeDb(dir, { mustExist: true });
    try {
      const row = db.prepare("SELECT agent_name, message FROM agent_events e JOIN agent_runs r USING (run_key) WHERE e.event_type = 'session_started'").get();
      assert.equal(row.agent_name, '@aioson');
      assert.equal(row.message, 'Live session started with claude');
    } finally {
      db.close();
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('o comando do agente digitado na sessão vira agent_activated, uma vez por troca', async () => {
  const dir = makeProject();
  try {
    const start = await startNeutral(dir);
    prompt(dir, start.sessionKey, '/aioson:agent:dev implementar a fatia 2');
    prompt(dir, start.sessionKey, 'continua');
    prompt(dir, start.sessionKey, '/aioson:agent:dev de novo');
    prompt(dir, start.sessionKey, '@qa revisa');

    const rows = await activations(dir);
    assert.deepEqual(rows.map((row) => row.message), ['@dev', '@qa']);
    assert.ok(rows.every((row) => row.run_key === start.runKey));
    assert.equal(JSON.parse(rows[0].payload_json).agent, '@dev');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('ativação fora de uma sessão aberta não cria a sessão de ganchos', async () => {
  const dir = makeProject();
  try {
    prompt(dir, null, '/aioson:agent:dev');
    const runtimeDb = path.join(dir, '.aioson', 'runtime', 'aios.sqlite');
    if (fs.existsSync(runtimeDb)) assert.deepEqual(await activations(dir), []);
    assert.equal(fs.existsSync(path.join(dir, '.aioson', 'runtime', '.sessions', 'dev.json')), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('só agente conhecido conta como ativação', () => {
  assert.equal(agentFromPrompt('/aioson:agent:dev faça x'), '@dev');
  assert.equal(agentFromPrompt('/qa'), '@qa');
  assert.equal(agentFromPrompt('@product ideia nova'), '@product');
  assert.equal(agentFromPrompt('<command-message>aioson:agent:dev</command-message>\n<command-name>/aioson:agent:dev</command-name>'), '@dev');
  assert.equal(agentFromPrompt('/help'), null, 'a ajuda da própria ferramenta');
  assert.equal(agentFromPrompt('/compact'), null);
  assert.equal(agentFromPrompt('/aioson:agent:inexistente'), null);
  assert.equal(agentFromPrompt('olha o /dev aqui'), null);
});

test('o gancho do Claude escuta o envio do prompt', () => {
  const hooks = buildClaudeHooks('dev');
  assert.match(hooks.UserPromptSubmit[0].hooks[0].command, /aioson hooks:emit/);
});
