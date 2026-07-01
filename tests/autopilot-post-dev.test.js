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

// Full-feature autopilot: o segmento spec→dev também é encadeado.
test('AUTOPILOT_HANDOFF_STAGES inclui product e as spec authorities (full-feature chain)', () => {
  for (const stage of ['product', 'sheldon', 'orchestrator']) {
    assert.equal(AUTOPILOT_HANDOFF_STAGES.has(stage), true, `${stage} deve estar encadeado no autopilot`);
  }
});

// O texto injetado no prompt não pode mais afirmar o modelo antigo (parada pré-@dev).
test('exceção de autopilot injetada descreve a cadeia full-feature, não o modelo antigo', () => {
  const { buildAgentPrompt, getAgentDefinition: getDef, resolveInstructionPath } = require('../src/agents');
  const agent = getDef('sheldon');
  const prompt = buildAgentPrompt(agent, 'claude', {
    instructionPath: resolveInstructionPath(agent, 'en'),
    interactionLanguage: 'en',
    autoHandoff: true
  });
  assert.doesNotMatch(prompt, /stops before the first `@dev`/, 'texto antigo (parada pré-dev) removido');
  assert.match(prompt, /runs the whole feature/, 'texto novo descreve a cadeia completa');
  assert.match(prompt, /dev-state\.md/, 'cruza para @dev via cold-start packet');
  assert.match(prompt, /NEVER auto-runs `feature:close`/, 'gate humano preservado');
});

// resolveAutopilotSignal: flag OU scheme semeado (escopado por slug).
test('resolveAutopilotSignal cobre flag, scheme semeado e escopo por slug', async () => {
  const fsp = require('node:fs/promises');
  const os = require('node:os');
  const path = require('node:path');
  const { resolveAutopilotSignal } = require('../src/autopilot-signal');
  const mk = async () => fsp.mkdtemp(path.join(os.tmpdir(), 'aioson-ap-signal-'));
  const w = async (dir, rel, content) => {
    const f = path.join(dir, rel);
    await fsp.mkdir(path.dirname(f), { recursive: true });
    await fsp.writeFile(f, content, 'utf8');
  };
  const scheme = (feature) => JSON.stringify({ feature, agentic_policy: { enabled: true } });

  // 1. flag true no frontmatter → on (fonte: frontmatter)
  const d1 = await mk();
  await w(d1, '.aioson/context/project.context.md', '---\nauto_handoff: true\n---\n# ctx\n');
  assert.deepEqual(await resolveAutopilotSignal(d1, {}), { enabled: true, source: 'frontmatter' });

  // 2. flag ausente + scheme semeado para a MESMA feature → on (fonte: scheme)
  const d2 = await mk();
  await w(d2, '.aioson/context/project.context.md', '---\nproject_name: "x"\n---\n# ctx\n');
  await w(d2, '.aioson/context/workflow-execute.json', scheme('cart'));
  assert.equal((await resolveAutopilotSignal(d2, { slug: 'cart' })).enabled, true);
  assert.equal((await resolveAutopilotSignal(d2, { slug: 'cart' })).source, 'seeded_scheme');

  // 3. scheme de OUTRA feature não conta quando o slug é conhecido
  assert.equal((await resolveAutopilotSignal(d2, { slug: 'billing' })).enabled, false);

  // 4. flag false explícito vence um scheme órfão (step-by-step é escolha do usuário)
  const d4 = await mk();
  await w(d4, '.aioson/context/project.context.md', '---\nauto_handoff: false\n---\n# ctx\n');
  await w(d4, '.aioson/context/workflow-execute.json', scheme('cart'));
  assert.equal((await resolveAutopilotSignal(d4, { slug: 'cart' })).enabled, false);

  // 5. nada configurado → off
  const d5 = await mk();
  assert.equal((await resolveAutopilotSignal(d5, {})).enabled, false);
});

// --step (desarme por-feature) vence o auto_handoff: true do projeto.
test('resolveAutopilotSignal: scheme desarmado para o slug atual vence o flag do projeto', async () => {
  const fsp = require('node:fs/promises');
  const os = require('node:os');
  const path = require('node:path');
  const { resolveAutopilotSignal } = require('../src/autopilot-signal');
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'aioson-ap-disarm-'));
  const w = async (rel, content) => {
    const f = path.join(dir, rel);
    await fsp.mkdir(path.dirname(f), { recursive: true });
    await fsp.writeFile(f, content, 'utf8');
  };
  await w('.aioson/context/project.context.md', '---\nauto_handoff: true\n---\n# ctx\n');
  await w('.aioson/context/workflow-execute.json', JSON.stringify({ feature: 'cart', agentic_policy: { enabled: false, mode: 'step_by_step' } }));

  // Slug bate -> desarme vence o flag (escolha por-feature > default do projeto).
  const disarmed = await resolveAutopilotSignal(dir, { slug: 'cart' });
  assert.equal(disarmed.enabled, false);
  assert.equal(disarmed.source, 'scheme_disarmed');

  // Slug diferente -> o desarme de OUTRA feature nao afeta; o flag do projeto vale.
  const other = await resolveAutopilotSignal(dir, { slug: 'billing' });
  assert.equal(other.enabled, true);
  assert.equal(other.source, 'frontmatter');
});
