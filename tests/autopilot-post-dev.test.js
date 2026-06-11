'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { AUTOPILOT_HANDOFF_STAGES } = require('../src/commands/workflow-next');
const { getAgentDefinition } = require('../src/agents');

// As 4 agents do ciclo pós-dev + validator devem estar SEMPRE encadeados no autopilot.
test('AUTOPILOT_HANDOFF_STAGES inclui o ciclo de review pós-dev', () => {
  for (const stage of ['dev', 'qa', 'tester', 'pentester', 'validator']) {
    assert.equal(AUTOPILOT_HANDOFF_STAGES.has(stage), true, `${stage} deve estar encadeado no autopilot`);
  }
  // e mantém o segmento pré-dev existente
  for (const stage of ['analyst', 'scope-check', 'architect', 'discovery-design-doc', 'pm']) {
    assert.equal(AUTOPILOT_HANDOFF_STAGES.has(stage), true, `${stage} (pré-dev) preservado`);
  }
});

// Cada agente do ciclo carrega a seção de autopilot no seu prompt (modo direto).
test('os 5 agentes do ciclo têm a seção "Autopilot handoff (post-dev" no prompt', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  for (const id of ['dev', 'qa', 'tester', 'pentester', 'validator']) {
    const agent = getAgentDefinition(id);
    assert.ok(agent, `agente ${id} existe`);
    const file = path.resolve(__dirname, '..', '.aioson', 'agents', `${id}.md`);
    const text = fs.readFileSync(file, 'utf8');
    assert.match(text, /Autopilot handoff \(post-dev/, `${id}.md deve ter a seção de autopilot pós-dev`);
    assert.match(text, /feature:close/, `${id}.md deve referenciar o gate humano feature:close`);
  }
});

// O gate humano: nenhum prompt do ciclo deve auto-rodar feature:close.
test('nenhum agente do ciclo auto-roda feature:close (gate humano preservado)', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  for (const id of ['dev', 'qa', 'tester', 'pentester', 'validator']) {
    const text = fs.readFileSync(path.resolve(__dirname, '..', '.aioson', 'agents', `${id}.md`), 'utf8');
    assert.match(text, /[Nn]ever auto-run `feature:close`|recommend .*feature:close|fall back|hand off manually/,
      `${id}.md deve tratar feature:close como gate humano`);
  }
});

test('autopilot usa limite de 3 ciclos qa-dev', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  for (const file of [
    '.aioson/agents/qa.md',
    'template/.aioson/agents/qa.md',
    '.aioson/docs/autopilot-handoff.md',
    'template/.aioson/docs/autopilot-handoff.md'
  ]) {
    const text = fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
    assert.match(text, /cap (?:= )?3|bounded at 3|3 rounds/, `${file} deve manter limite 3`);
    assert.doesNotMatch(text, /cap (?:= )?2|bounded at 2|2 rounds/, `${file} nao deve manter limite 2`);
  }
});
