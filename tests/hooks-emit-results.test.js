'use strict';

// A aba Atividade do Play contava "testes rodados" sem saber o resultado: o
// `hooks:emit` guardava só os 80 primeiros caracteres do comando. Agora guarda
// passou/falhou e a linha de resumo do runner, a lista de tarefas do agente e a
// mensagem final de cada turno — nunca a saída inteira.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { openRuntimeDb } = require('../src/runtime-store');
const { buildClaudeHooks } = require('../src/commands/hooks-install');

const CLI = path.join(__dirname, '..', 'bin', 'aioson.js');

function makeProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-hooks-results-'));
  fs.mkdirSync(path.join(dir, '.aioson'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.aioson', 'config.md'), '# project\n', 'utf8');
  return dir;
}

function emit(dir, payload) {
  const env = { ...process.env };
  delete env.AIOSON_LIVE_SESSION_KEY;
  const result = spawnSync(process.execPath, [CLI, 'hooks:emit', dir, '--agent=dev', '--source=claude'], {
    input: JSON.stringify(payload),
    env,
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, result.stderr);
}

async function lastEvent(dir) {
  const { db } = await openRuntimeDb(dir, { mustExist: true });
  try {
    const row = db.prepare('SELECT event_type, message, payload_json FROM agent_events ORDER BY id DESC LIMIT 1').get();
    return { ...row, payload: JSON.parse(row.payload_json || '{}') };
  } finally {
    db.close();
  }
}

test('comando de teste guarda passou/falhou e só a linha de resumo', async () => {
  const dir = makeProject();
  try {
    emit(dir, {
      hook_event_name: 'PostToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'cd src-tauri && cargo test --lib narration::' },
      tool_response: { stdout: 'running 40 tests\nTOKEN=abc123\ntest result: ok. 39 passed; 0 failed; 1 ignored', stderr: '', interrupted: false }
    });
    let event = await lastEvent(dir);
    assert.equal(event.event_type, 'step_done');
    assert.equal(event.message, '$ cd src-tauri && cargo test --lib narration::');
    assert.equal(event.payload.outcome, 'passed');
    assert.equal(event.payload.result, 'test result: ok. 39 passed; 0 failed; 1 ignored');
    assert.ok(!event.payload_json.includes('abc123'), 'the rest of the output is never kept');

    emit(dir, {
      hook_event_name: 'PostToolUseFailure',
      tool_name: 'Bash',
      tool_input: { command: 'npx vitest run' },
      error: 'Exit code 1\n FAIL src/a.test.ts\n      Tests  1 failed | 60 passed (61)'
    });
    event = await lastEvent(dir);
    assert.equal(event.payload.outcome, 'failed');
    assert.match(event.payload.result, /1 failed \| 60 passed/);

    emit(dir, {
      hook_event_name: 'PostToolUseFailure',
      tool_name: 'Bash',
      tool_input: { command: 'npm run build' },
      error: 'Exit code 2\nsomething broke'
    });
    event = await lastEvent(dir);
    assert.equal(event.payload.result, 'Exit code 2');

    emit(dir, {
      hook_event_name: 'PostToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'node --test tests/' },
      tool_response: { stdout: 'ℹ tests 40\nℹ pass 40\nℹ fail 0\nℹ duration_ms 10927' }
    });
    event = await lastEvent(dir);
    assert.equal(event.payload.result, 'ℹ pass 40 · ℹ fail 0');

    const long = `echo ${'x'.repeat(400)}`;
    emit(dir, { hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: long }, tool_response: { stdout: 'ok' } });
    event = await lastEvent(dir);
    assert.equal(event.message.length, 2 + 200);
    assert.equal(event.payload.result, undefined, 'no runner summary, nothing kept');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('lista de tarefas e mensagem final do agente viram eventos próprios', async () => {
  const dir = makeProject();
  try {
    emit(dir, {
      hook_event_name: 'PostToolUse',
      tool_name: 'TodoWrite',
      tool_input: {
        todos: [
          { content: 'Corrigir a regra dos testes', status: 'completed' },
          { content: 'Guardar o resultado no hooks:emit', status: 'in_progress' },
          { content: 'Instalar os ganchos novos', status: 'pending' }
        ]
      }
    });
    let event = await lastEvent(dir);
    assert.equal(event.event_type, 'plan_updated');
    assert.equal(event.message, 'Tarefas: 1 de 3 feitas · em andamento: Guardar o resultado no hooks:emit · próximas: Instalar os ganchos novos');

    emit(dir, { hook_event_name: 'Stop', last_assistant_message: 'Corrigi a regra.\n\nFalta instalar os ganchos.' });
    event = await lastEvent(dir);
    assert.equal(event.event_type, 'agent_reply');
    assert.equal(event.message, 'Corrigi a regra. Falta instalar os ganchos.');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('ganchos do Claude Code cobrem falha de comando e a mensagem final antes do agent:done', () => {
  const hooks = buildClaudeHooks('dev', false, 'dev');
  assert.equal(hooks.PostToolUseFailure[0].matcher, 'Bash');
  assert.match(hooks.PostToolUseFailure[0].hooks[0].command, /hooks:emit/);
  const stop = hooks.Stop[0].hooks[0].command;
  assert.ok(stop.indexOf('hooks:emit') < stop.indexOf('agent:done'), stop);
});
