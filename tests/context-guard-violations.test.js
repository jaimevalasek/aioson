'use strict';

// Violation salience: a rule whose checker FINDS a new violation in a pending
// edit is injected even when the edit shares none of its vocabulary. The
// measured gap these tests pin: the naming rule stayed silent while the planner
// wrote `servicoCliente.js` into a plan and while the dev wrote that file.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { buildGuardResponse } = require('../src/context-guard');
const { extractNamedCode, textAfterEdit } = require('../src/lib/edit-time-enforcement');
const { runRulesCheck } = require('../src/commands/rules-check');

const NAMING_RULE = [
  '---',
  'name: source-code-language-convention',
  'description: Source code identifiers, filenames and directories use technical English',
  'agents: [planner, dev]',
  'modes: [planning, executing]',
  'load_tier: trigger',
  'enforcement: source-code-language',
  "paths: ['**/*.js', '**/*.php']",
  '---',
  '',
  '# Source code language',
  '',
  '## Required behavior',
  '- Use English for source code identifiers, filenames, and directories.',
  '- Do not translate technical identifiers into the conversation language.',
  ''
].join('\n');

async function makeProject(rule = NAMING_RULE) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-guard-violations-'));
  await writeFile(dir, '.aioson/context/project.context.md', '---\nframework: Node.js\nconversation_language: pt-BR\n---\n# Project');
  await writeFile(dir, '.aioson/rules/source-code-language-convention.md', rule);
  return dir;
}

async function writeFile(dir, relPath, content) {
  const full = path.join(dir, relPath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, 'utf8');
}

async function guard(dir, agent, toolName, toolInput) {
  const response = await buildGuardResponse({ tool_name: toolName, tool_input: toolInput }, dir, { tool: 'claude', agent });
  return {
    response,
    rules: response._guard ? response._guard.rules : [],
    violations: response._guard ? response._guard.violations : 0,
    text: response.hookSpecificOutput ? response.hookSpecificOutput.additionalContext : ''
  };
}

const RULE_PATH = '.aioson/rules/source-code-language-convention.md';

function planNaming(files) {
  return ['## Fase 1 — cadastro de clientes', '', '| Arquivo | Responsabilidade |', '|---|---|', ...files.map((file) => `| \`${file}\` | camada |`)].join('\n');
}

test('the planner hears the naming rule when the plan names translated files — and only once per directory', async () => {
  const dir = await makeProject();
  try {
    const result = await guard(dir, 'planner', 'Write', {
      file_path: '.aioson/context/implementation-plan-clientes.md',
      content: planNaming(['src/modulos/clientes/servicoCliente.js', 'src/modulos/clientes/repositorioCliente.js'])
    });
    assert.ok(result.rules.includes(RULE_PATH), result.text);
    assert.match(result.text, /Detected in the code this document names/);
    assert.match(result.text, /"servicoCliente"/);
    assert.match(result.text, /"repositorioCliente"/);
    assert.equal(result.text.match(/directory "modulos"/g).length, 1, 'a directory is one decision');

    const english = await guard(dir, 'planner', 'Write', {
      file_path: '.aioson/context/implementation-plan-customers.md',
      content: planNaming(['src/modules/customers/customerService.js', 'src/modules/customers/customerRepository.js'])
    });
    assert.equal(english.rules.includes(RULE_PATH), false, english.text);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('the dev hears the naming rule when the file being written breaks it, never when it complies', async () => {
  const dir = await makeProject();
  try {
    const result = await guard(dir, 'dev', 'Write', {
      file_path: 'src/modulos/clientes/servicoCliente.js',
      content: 'export function criarCliente(dados) {\n  return dados;\n}\n'
    });
    assert.ok(result.rules.includes(RULE_PATH));
    assert.match(result.text, /Detected in this change — fix it in this edit/);
    assert.match(result.text, /identifier "criarCliente"/);
    assert.ok(result.violations >= 3);

    const english = await guard(dir, 'dev', 'Write', {
      file_path: 'src/modules/customers/customerService.js',
      content: 'export function createCustomer(data) {\n  return data;\n}\n'
    });
    assert.equal(english.rules.includes(RULE_PATH), false);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('only the violations an edit introduces count: a legacy file does not replay its old debt', async () => {
  const dir = await makeProject();
  try {
    await writeFile(dir, 'src/servidor/app.js', 'function iniciarServidor() {}\n');
    const clean = await guard(dir, 'dev', 'Edit', {
      file_path: 'src/servidor/app.js',
      old_string: 'function iniciarServidor() {}',
      new_string: 'function iniciarServidor() {}\nfunction stop() {}'
    });
    assert.equal(clean.rules.includes(RULE_PATH), false, clean.text);

    const added = await guard(dir, 'dev', 'Edit', {
      file_path: 'src/servidor/app.js',
      old_string: 'function iniciarServidor() {}',
      new_string: 'function iniciarServidor() {}\nfunction pararServidor() {}'
    });
    assert.ok(added.rules.includes(RULE_PATH));
    assert.match(added.text, /"pararServidor"/);
    assert.doesNotMatch(added.text, /directory "servidor"|"iniciarServidor"/, 'pre-existing debt is not this edit\'s');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('an LF edit anchor still replays inside a CRLF file (Windows checkouts)', async () => {
  const dir = await makeProject();
  try {
    await writeFile(dir, 'src/app/server.js', 'function start() {}\r\nfunction stop() {}\r\n');
    const result = await guard(dir, 'dev', 'Edit', {
      file_path: 'src/app/server.js',
      old_string: 'function start() {}\nfunction stop() {}',
      new_string: 'function start() {}\nfunction stop() {}\nfunction reiniciarServidor() {}'
    });
    assert.ok(result.rules.includes(RULE_PATH), 'the anchor matched across line endings');
    assert.match(result.text, /"reiniciarServidor"/);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('debt accepted in the rules baseline stays accepted at edit time', async () => {
  const dir = await makeProject();
  try {
    await writeFile(dir, 'src/servidor/app.js', 'function start() {}\n');
    await runRulesCheck({ args: [dir], options: { baseline: true, json: true, suppressExitCode: true }, logger: { log() {} } });
    const result = await guard(dir, 'dev', 'Write', {
      file_path: 'src/servidor/rotas.js',
      content: 'function listen() {}\n'
    });
    assert.ok(result.rules.includes(RULE_PATH), result.text);
    assert.match(result.text, /filename "rotas"/);
    assert.doesNotMatch(result.text, /directory "servidor"/, 'the accepted directory is not charged again');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('a rule addressed to other agents stays out of this agent\'s edits', async () => {
  const dir = await makeProject(NAMING_RULE.replace('agents: [planner, dev]', 'agents: [dev]'));
  try {
    const result = await guard(dir, 'planner', 'Write', {
      file_path: '.aioson/context/implementation-plan-clientes.md',
      content: planNaming(['src/modulos/clientes/servicoCliente.js'])
    });
    assert.equal(result.rules.includes(RULE_PATH), false, result.text);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('notes and governance files quote names — they are never judged by the naming checker', async () => {
  const dir = await makeProject();
  try {
    const note = await guard(dir, 'dev', 'Write', {
      file_path: 'plans/naming-ideas.md',
      content: 'Evitar `src/modulos/servicoCliente.js` e `criarCliente()`.'
    });
    assert.equal(note.violations || 0, 0, note.text);
    const ruleEdit = await guard(dir, 'dev', 'Write', {
      file_path: '.aioson/rules/naming-examples.md',
      content: '---\nname: naming-examples\ndescription: x\n---\n# Examples\n- Avoid `PedidoController` and `criarUsuario()`.'
    });
    assert.equal(ruleEdit.violations || 0, 0, ruleEdit.text);
    const projectDoc = await guard(dir, 'dev', 'Write', {
      file_path: 'docs/naming-guide.md',
      content: '# Guia\nNunca `src/modulos/servicoCliente.js`; prefira `src/modules/customerService.js`.'
    });
    assert.equal(projectDoc.violations || 0, 0, 'docs outside .aioson are about the product: ' + projectDoc.text);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('identifiers and fenced code a plan asks for are judged like declarations', async () => {
  const dir = await makeProject();
  try {
    const result = await guard(dir, 'planner', 'Write', {
      file_path: '.aioson/context/spec-pedidos.md',
      content: [
        '# Pedidos',
        'O handler `criarPedido()` recebe o payload; `OrderStatus` continua igual.',
        '',
        '```php',
        'class ControladorPedidos extends Controller {}',
        '```'
      ].join('\n')
    });
    assert.ok(result.rules.includes(RULE_PATH), result.text);
    assert.match(result.text, /"criarPedido"/);
    assert.match(result.text, /"ControladorPedidos"/);
    assert.doesNotMatch(result.text, /OrderStatus/);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('extractNamedCode keeps code references and drops prose, commands, links, and docs', () => {
  const named = extractNamedCode([
    'Rodar `aioson context:brief .` e ler `docs/guia.md`.',
    'Ver https://example.com/app/main.js e `src/core/order.service.ts:42`.',
    '| src/billing/invoice.php | camada |',
    'Chamar `createOrder()` e `valor`.'
  ].join('\n'));
  assert.deepEqual(named.paths.sort(), ['src/billing/invoice.php', 'src/core/order.service.ts']);
  assert.deepEqual(named.identifiers, ['createOrder']);
});

test('textAfterEdit reproduces Write, Edit, replace_all and MultiEdit, and gives up on a missing anchor', () => {
  assert.equal(textAfterEdit(null, 'Write', { content: 'a' }), 'a');
  assert.equal(textAfterEdit('x y x', 'Edit', { old_string: 'x', new_string: 'z' }), 'z y x');
  assert.equal(textAfterEdit('x y x', 'Edit', { old_string: 'x', new_string: 'z', replace_all: true }), 'z y z');
  assert.equal(textAfterEdit('a b', 'MultiEdit', { edits: [{ old_string: 'a', new_string: 'c' }, { old_string: 'b', new_string: 'd' }] }), 'c d');
  assert.equal(textAfterEdit('a b', 'Edit', { old_string: 'q', new_string: 'z' }), null);
  assert.equal(textAfterEdit(null, 'Edit', { old_string: 'a', new_string: 'b' }), null);
  assert.equal(textAfterEdit('$&', 'Edit', { old_string: '$&', new_string: '$1' }), '$1', 'replacement patterns are literal');
});
