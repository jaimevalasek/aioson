'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { buildGuardResponse, claimGuardEvent, detectSurfaceKinds, outsideProject } = require('../src/context-guard');
const { runContextGuard, resolveGuardAgent } = require('../src/commands/context-guard');

test('context:guard resolves the active agent from explicit options before event metadata', () => {
  assert.equal(resolveGuardAgent({ agent: 'qa' }, { agent: 'dev' }), 'qa');
  assert.equal(resolveGuardAgent({}, { agent_name: '@Genome' }), 'genome');
  assert.equal(resolveGuardAgent({}, { context: { agent: 'setup' } }), 'setup');
});

const DB_NAMING_RULE = [
  '---',
  'source_type: rule',
  'description: "Database table naming — the Workspace domain entity maps to the project table"',
  'agents: all',
  'modes: [executing]',
  'task_types: [migration, schema, database]',
  'triggers: [migration, workspace, table, schema]',
  'aliases: [workspace, project]',
  'entities: [Workspace, Project]',
  'retrieval_intents: [database, naming]',
  'paths: ["**/migrations/**", "**/database/**"]',
  'load_tier: trigger',
  'priority: 8',
  '---',
  '',
  '# Database table naming',
  '',
  '## Required behavior',
  '- The Workspace domain entity is persisted in the table named `project`. Never create or reference a `workspace` table.',
  '- When a migration mentions "workspace", the physical table MUST be named `project`.',
  '',
  '## Review checklist',
  '- Scan migrations for a `workspace` table name; it must be `project`.',
  ''
].join('\n');

const UNRELATED_RULE = [
  '---',
  'source_type: rule',
  'description: "Frontend component spacing and layout conventions"',
  'agents: all',
  'modes: [executing]',
  'task_types: [ui, layout, component]',
  'triggers: [component, layout, css, spacing]',
  'aliases: [frontend, ui]',
  'entities: [Button, Modal]',
  'load_tier: trigger',
  'priority: 3',
  '---',
  '',
  '# UI layout conventions',
  '',
  '## Required behavior',
  '- Use the design token spacing scale for all component margins.',
  ''
].join('\n');

const AGENT_STRUCTURAL_RULE = [
  '---',
  'source_type: rule',
  'description: "Structural contract every AIOSON agent must follow"',
  'agents: all',
  'modes: [executing]',
  'task_types: [agent-contract, agent-authoring]',
  'triggers: [editing agent files, agent prompt, handoff contract]',
  'paths: ["template/.aioson/agents/**", ".aioson/agents/**"]',
  'load_tier: trigger',
  'guard: true',
  'priority: 8',
  '---',
  '',
  '# Agent Structural Contract',
  '',
  '## Required behavior',
  '- Every agent prompt edit must preserve the language boundary, required input, and best-effort telemetry suffixes.',
  '- Best-effort context helper commands must end with `2>/dev/null || true`.',
  '- Do NOT continue into the next agent work.',
  ''
].join('\n');

// The shipped interaction-rule shape: domain entities/aliases plus a
// guard_surfaces binding so it only injects into UI-kind artifacts.
const FORM_UI_RULE = [
  '---',
  'source_type: rule',
  'description: "Structured form fields ship with masks and inline validation"',
  'agents: all',
  'modes: [executing]',
  'task_types: [form, crud]',
  'triggers: [form, mask, validation, cpf, cadastro]',
  'aliases: [formulário, cadastro]',
  'entities: [Form, Input, Mask]',
  'guard_surfaces: [ui]',
  'load_tier: trigger',
  'priority: 8',
  '---',
  '',
  '# Form fields',
  '',
  '## Required behavior',
  '- Every structured field gets a live mask and inline validation.',
  ''
].join('\n');

async function makeTmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-context-guard-'));
}

async function writeFile(dir, relPath, content) {
  const full = path.join(dir, relPath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, 'utf8');
  return full;
}

async function writeProject(dir) {
  await writeFile(dir, '.aioson/context/project.context.md', [
    '---',
    'framework: Laravel',
    'project_type: web-app',
    'conversation_language: pt-BR',
    'load_tier: always',
    '---',
    '# Project'
  ].join('\n'));
  await writeFile(dir, '.aioson/rules/db-naming.md', DB_NAMING_RULE);
  await writeFile(dir, '.aioson/rules/unrelated-ui.md', UNRELATED_RULE);
}

function logger() {
  const lines = [];
  return {
    lines,
    log(value) { lines.push(String(value)); }
  };
}

function migrationEvent() {
  return {
    tool_name: 'Write',
    tool_input: {
      file_path: 'database/migrations/2026_06_18_create_workspace_table.php',
      content: "Schema::create('workspace', function (Blueprint $table) { $table->id(); $table->timestamps(); });"
    }
  };
}

test('context:guard injects the workspace→project rule for a matching migration write', async () => {
  const dir = await makeTmpDir();
  try {
    await writeProject(dir);

    const response = await buildGuardResponse(migrationEvent(), dir, { tool: 'claude', agent: 'dev' });

    assert.equal(response.hookSpecificOutput.hookEventName, 'PreToolUse');
    const injected = response.hookSpecificOutput.additionalContext;
    assert.match(injected, /db-naming\.md/);
    assert.match(injected, /table named `project`|MUST be named `project`/);
    assert.equal(response._guard.injected, true);
    assert.ok(response._guard.rules.includes('.aioson/rules/db-naming.md'));
    // Discrimination: the unrelated UI rule must not leak in.
    assert.equal(response._guard.rules.includes('.aioson/rules/unrelated-ui.md'), false);
    // Per-rule attribution: db-naming's own constraint, never the generic concern lines.
    assert.match(injected, /Rule \.aioson\/rules\/db-naming\.md:/);
    assert.doesNotMatch(injected, /technical English|controllers and route handlers thin/i);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('context:guard stays silent for an edit that matches no project rule', async () => {
  const dir = await makeTmpDir();
  try {
    await writeProject(dir);

    const event = {
      tool_name: 'Write',
      tool_input: {
        file_path: 'src/math/sum.js',
        content: 'export function sum(a, b) { return a + b; }'
      }
    };
    const response = await buildGuardResponse(event, dir, { tool: 'claude' });

    assert.deepEqual(response, {});
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('context:guard ignores non-mutating tools even when the path looks relevant', async () => {
  const dir = await makeTmpDir();
  try {
    await writeProject(dir);

    const event = {
      tool_name: 'Read',
      tool_input: { file_path: 'database/migrations/2026_06_18_create_workspace_table.php' }
    };
    const response = await buildGuardResponse(event, dir, { tool: 'claude' });

    assert.deepEqual(response, {});
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('context:guard does not false-inject a rule via a short alias substring (P1)', async () => {
  const dir = await makeTmpDir();
  try {
    await writeProject(dir);

    // "build" and "require" both contain "ui" as a substring. The unrelated UI
    // rule's only short domain signal is alias `ui`; a bare substring match used
    // to false-fire here and inject it on a plain backend file.
    const event = {
      tool_name: 'Write',
      tool_input: {
        file_path: 'src/server/auth.js',
        content: 'const crypto = require("crypto");\nfunction build() { return crypto.randomBytes(8); }'
      }
    };
    const response = await buildGuardResponse(event, dir, { tool: 'claude', agent: 'dev' });

    const injectedRules = response._guard ? response._guard.rules : [];
    assert.equal(
      injectedRules.includes('.aioson/rules/unrelated-ui.md'),
      false,
      'short alias "ui" must not substring-match build/require'
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('runContextGuard emits {} (not an ok:false envelope) when the engine throws (P5)', async () => {
  const guardMod = require('../src/context-guard');
  const original = guardMod.buildGuardResponse;
  guardMod.buildGuardResponse = async () => { throw new Error('boom'); };
  // The command destructures buildGuardResponse at load time, so re-require it
  // after stubbing to pick up the throwing version.
  delete require.cache[require.resolve('../src/commands/context-guard')];
  try {
    const { runContextGuard: freshRun } = require('../src/commands/context-guard');
    const out = logger();
    // Pass the event inline so resolveEvent never falls through to readStdinEvent
    // (which would block waiting for stdin to end under the test runner).
    const event = JSON.stringify({ tool_name: 'Write', tool_input: { file_path: 'x.js', content: 'y' } });
    const wire = await freshRun({ args: ['.'], options: { json: true, event }, logger: out });
    assert.deepEqual(wire, {}, 'guard failures surface as an empty injection, never {ok:false}');
  } finally {
    guardMod.buildGuardResponse = original;
    delete require.cache[require.resolve('../src/commands/context-guard')];
  }
});

test('context:guard does not fire for a baseline rule matched only via a generic trigger', async () => {
  const dir = await makeTmpDir();
  try {
    await writeProject(dir);
    // Ambient baseline rule: a generic trigger plus a broad path glob, but NO
    // entities/aliases — it must not inject on every edit (cry-wolf guard).
    await writeFile(dir, '.aioson/rules/code-style.md', [
      '---',
      'source_type: rule',
      'description: "Code style baseline"',
      'agents: all',
      'modes: [executing]',
      'triggers: [function, helper]',
      'paths: ["src/**"]',
      'load_tier: trigger',
      '---',
      '# Code style',
      '## Required behavior',
      '- Use clear names.'
    ].join('\n'));

    const event = {
      tool_name: 'Write',
      tool_input: { file_path: 'src/util/helper.js', content: 'function helper() { return 1; }' }
    };
    const response = await buildGuardResponse(event, dir, { tool: 'claude' });

    assert.deepEqual(response, {}); // matched only via a trigger -> no injection
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('context:guard injects a real-style guard opt-in rule without aliases/entities', async () => {
  const dir = await makeTmpDir();
  try {
    await writeProject(dir);
    await writeFile(dir, '.aioson/rules/agent-structural-contract.md', AGENT_STRUCTURAL_RULE);

    const event = {
      tool_name: 'Edit',
      tool_input: {
        file_path: 'template/.aioson/agents/dev.md',
        old_string: 'aioson context:select',
        new_string: 'aioson context:brief'
      }
    };
    const response = await buildGuardResponse(event, dir, { tool: 'claude', agent: 'dev' });

    assert.equal(response.hookSpecificOutput.hookEventName, 'PreToolUse');
    const injected = response.hookSpecificOutput.additionalContext;
    assert.match(injected, /agent-structural-contract\.md/);
    assert.match(injected, /best-effort telemetry suffixes|2>\/dev\/null \|\| true/);
    assert.equal((injected.match(/Do NOT continue into the next agent work/g) || []).length, 1);
    assert.doesNotMatch(injected, /\(forbidden\) Do NOT continue into the next agent work/);
    assert.ok(response._guard.rules.includes('.aioson/rules/agent-structural-contract.md'));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('context:guard does NOT inject a path-scoped guard rule when editing an out-of-scope file', async () => {
  const dir = await makeTmpDir();
  try {
    await writeProject(dir);
    await writeFile(dir, '.aioson/rules/agent-structural-contract.md', AGENT_STRUCTURAL_RULE);

    // Editing a source file OUTSIDE the rule's `.aioson/agents/**` scope. The
    // content deliberately echoes the rule's triggers ("agent prompt",
    // "handoff contract") so it surfaces in the brief via fuzzy keyword overlap
    // — but a path-scoped guard rule must stay silent unless the path matches.
    const event = {
      tool_name: 'Edit',
      tool_input: {
        file_path: 'src/commands/hooks-install.js',
        old_string: 'const agent = "dev";',
        new_string: 'const agent = "dev"; // agent prompt handoff contract observability block'
      }
    };
    const response = await buildGuardResponse(event, dir, { tool: 'claude', agent: 'dev' });

    assert.deepEqual(response, {}); // out-of-scope path -> no cry-wolf injection
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('detectSurfaceKinds separates UI artifacts from files that merely mention UI', () => {
  assert.ok(detectSurfaceKinds('app/cadastro.html', '').has('ui'));
  assert.ok(detectSurfaceKinds('styles/form.css', '').has('ui'));
  assert.ok(detectSurfaceKinds('docs/briefing.md', '').has('ui'));
  assert.ok(detectSurfaceKinds('src/ui/form.js', "document.querySelector('#cpf').addEventListener('input', aplicar);").has('ui'));
  assert.equal(detectSurfaceKinds('src/lib/telemetry.js', 'const STRUCTURED = /cpf|mask|form/; module.exports = {};').size, 0);
  assert.equal(detectSurfaceKinds('brains/_index.json', '{"tags": ["forms", "kanban"]}').size, 0);
});

test('a guard_surfaces:[ui] rule stays out of non-UI files that mention its keywords (P1)', async () => {
  const dir = await makeTmpDir();
  try {
    await writeProject(dir);
    await writeFile(dir, '.aioson/rules/form-ui.md', FORM_UI_RULE);

    // A measurement library ABOUT forms: keywords everywhere, no DOM in sight.
    const nonUi = {
      tool_name: 'Write',
      tool_input: {
        file_path: 'src/lib/telemetry.js',
        content: 'const STRUCTURED = /cpf|mask|validation|cadastro/;\nfunction scanForm(source) { return STRUCTURED.test(source); }'
      }
    };
    const silent = await buildGuardResponse(nonUi, dir, { tool: 'claude', agent: 'dev' });
    const silentRules = silent._guard ? silent._guard.rules : [];
    assert.equal(silentRules.includes('.aioson/rules/form-ui.md'), false, 'files about forms are not forms');

    // The same keywords inside real markup: the rule applies.
    const markup = {
      tool_name: 'Write',
      tool_input: {
        file_path: 'app/cadastro/form.html',
        content: '<form id="cadastro"><label for="cpf">CPF</label><input id="cpf" name="cpf" placeholder="CPF"></form>'
      }
    };
    const injected = await buildGuardResponse(markup, dir, { tool: 'claude', agent: 'dev' });
    assert.equal(injected._guard.injected, true);
    assert.ok(injected._guard.rules.includes('.aioson/rules/form-ui.md'));

    // A DOM-flavored script counts as UI even with a .js extension.
    const domScript = {
      tool_name: 'Write',
      tool_input: {
        file_path: 'src/ui/mascara.js',
        content: "const campo = document.querySelector('#cpf');\ncampo.addEventListener('input', () => { campo.value = mascaraCPF(campo.value); });"
      }
    };
    const scriptInjected = await buildGuardResponse(domScript, dir, { tool: 'claude', agent: 'dev' });
    assert.ok(scriptInjected._guard && scriptInjected._guard.rules.includes('.aioson/rules/form-ui.md'));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('a test file is about the surface, not the surface: fixture markup never draws product-UI rules', async () => {
  const dir = await makeTmpDir();
  try {
    await writeProject(dir);
    await writeFile(dir, '.aioson/rules/form-ui.md', FORM_UI_RULE);
    const markup = '<form id="cadastro"><label for="cpf">CPF</label><input id="cpf" name="cpf" placeholder="CPF"></form>';
    for (const testPath of ['tests/form-render.test.js', '__tests__/cadastro.spec.ts', 'tests/fixtures/cadastro.html']) {
      const event = { tool_name: 'Write', tool_input: { file_path: testPath, content: `const html = '${markup}';` } };
      const response = await buildGuardResponse(event, dir, { tool: 'claude', agent: 'dev' });
      const rules = response._guard ? response._guard.rules : [];
      assert.equal(rules.includes('.aioson/rules/form-ui.md'), false, `${testPath} is a fixture, not a form`);
    }
    // The identical markup as a product file still draws the rule.
    const product = { tool_name: 'Write', tool_input: { file_path: 'app/cadastro/form.html', content: markup } };
    const injected = await buildGuardResponse(product, dir, { tool: 'claude', agent: 'dev' });
    assert.ok(injected._guard && injected._guard.rules.includes('.aioson/rules/form-ui.md'));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('an accented alias is a first-class needle — the NFD fold, not its unaccented siblings, carries the match', async () => {
  const dir = await makeTmpDir();
  try {
    await writeProject(dir);
    await writeFile(dir, '.aioson/rules/form-ui.md', FORM_UI_RULE);
    // No unaccented trigger appears anywhere ("formulário" never contains a
    // whole-word "form"): the ONLY path to the rule is the accented alias,
    // upper- and lower-case. A regression in the accent fold breaks this.
    const accented = {
      tool_name: 'Write',
      tool_input: {
        file_path: 'app/paginas/inscricao.html',
        content: '<section class="inscricao"><h2>Preencha o FORMULÁRIO abaixo</h2><p>Os dados seguem ao concluir o formulário.</p><textarea name="nome"></textarea></section>'
      }
    };
    const injected = await buildGuardResponse(accented, dir, { tool: 'claude', agent: 'dev' });
    assert.equal(Boolean(injected._guard && injected._guard.injected), true, JSON.stringify((injected && injected._guard) || null));
    assert.ok(injected._guard.rules.includes('.aioson/rules/form-ui.md'));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('declared paths bind injection even for a domain-signal rule (P1)', async () => {
  const dir = await makeTmpDir();
  try {
    await writeProject(dir);

    // db-naming declares paths over migrations/database. Echoing its entities
    // and triggers from an unrelated source file used to inject via the domain
    // signal alone; declared scope must win.
    const event = {
      tool_name: 'Write',
      tool_input: {
        file_path: 'src/notes/todo.js',
        content: 'remember: the workspace migration renames the project table schema'
      }
    };
    const response = await buildGuardResponse(event, dir, { tool: 'claude', agent: 'dev' });
    const rules = response._guard ? response._guard.rules : [];
    assert.equal(rules.includes('.aioson/rules/db-naming.md'), false, 'out-of-scope path must stay silent');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('context:guard command emits a pristine wire payload in JSON mode', async () => {
  const dir = await makeTmpDir();
  try {
    await writeProject(dir);

    const out = logger();
    const result = await runContextGuard({
      args: [dir],
      options: { json: true, tool: 'claude', event: JSON.stringify(migrationEvent()) },
      logger: out
    });

    assert.match(result.hookSpecificOutput.additionalContext, /`project`/);
    assert.equal(result._guard, undefined); // stripped from the wire payload
    assert.deepEqual(out.lines, []); // json mode prints nothing itself
    JSON.stringify(result);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('context:guard command logs a human summary when not in JSON mode', async () => {
  const dir = await makeTmpDir();
  try {
    await writeProject(dir);

    const out = logger();
    await runContextGuard({
      args: [dir],
      options: { tool: 'claude', event: JSON.stringify(migrationEvent()) },
      logger: out
    });

    assert.equal(out.lines.length, 1);
    assert.match(out.lines[0], /injected .*db-naming\.md/);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

// ─── the shipped interaction rules must not fire on files that merely contain their words as substrings ───

const KANBAN_RULE = [
  '---',
  'source_type: rule',
  'description: "Recurrent status flows use drag-and-drop"',
  'agents: all',
  'modes: [executing]',
  'task_types: [workflow, kanban, board]',
  'triggers: [kanban, board, pipeline, stage, column, drag and drop, move card, status flow]',
  'aliases: [quadro, funil]',
  'entities: [Kanban, Board, Pipeline, Stage, Column, Card, Lane, Queue]',
  'guard_surfaces: [ui]',
  'load_tier: trigger',
  'priority: 10',
  '---',
  '',
  '# Drag-and-drop for status flows',
  '',
  '## Required behavior',
  '- Keep buttons for one-shot transitions; drag-and-drop owns the recurring flow.',
  ''
].join('\n');

test('a long entity or trigger never matches as a substring: "format" is not Form, "discard" is not Card, "remove cards" is not "move card" (P1)', async () => {
  const dir = await makeTmpDir();
  try {
    await writeProject(dir);
    await writeFile(dir, '.aioson/rules/form-ui.md', FORM_UI_RULE);
    await writeFile(dir, '.aioson/rules/kanban.md', KANBAN_RULE);

    // Orchestration-engine code: "lane"/"stage" are its own words, `<id>` is
    // placeholder notation, "format"/"discard"/"platform" carry the entities
    // only as substrings.
    const engine = {
      tool_name: 'Write',
      tool_input: {
        file_path: 'src/agent-execution/execution-run.js',
        content: [
          "const MESSAGE_TARGET = /^(?:lane:[a-z0-9]+|unit:[a-z0-9-]+|integration|orchestrator)$/; // to: lane:<id>|unit:<id>",
          'function formatReport(report) { const platform = process.platform; return discardEmpty(report); }',
          'const pipelineStage = { stage: 1, lane: "backend" };'
        ].join('\n')
      }
    };
    const silent = await buildGuardResponse(engine, dir, { tool: 'claude', agent: 'dev' });
    const rules = silent._guard ? silent._guard.rules : [];
    assert.equal(rules.includes('.aioson/rules/form-ui.md'), false, JSON.stringify(rules));
    assert.equal(rules.includes('.aioson/rules/kanban.md'), false, JSON.stringify(rules));

    // A changelog is repository housekeeping, never a product surface — even when
    // it names cards, boards and forms as whole words.
    const changelog = {
      tool_name: 'Edit',
      tool_input: {
        file_path: 'CHANGELOG.md',
        new_string: '### Changed\n- The card on the kanban board moves between stages with drag and drop; the cadastro form validates the CPF mask inline.'
      }
    };
    assert.deepEqual(await buildGuardResponse(changelog, dir, { tool: 'claude', agent: 'dev' }), {});

    // The same rule still fires on a real board component.
    const board = {
      tool_name: 'Write',
      tool_input: {
        file_path: 'src/ui/Board.tsx',
        content: 'export function Board({ columns }) {\n  return <div className="kanban board">{columns.map((column) => <Column key={column.id} stage={column.stage} onDragEnd={moveCard} />)}</div>;\n}'
      }
    };
    const injected = await buildGuardResponse(board, dir, { tool: 'claude', agent: 'dev' });
    assert.ok(injected._guard && injected._guard.rules.includes('.aioson/rules/kanban.md'), JSON.stringify(injected._guard || {}));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('detectSurfaceKinds: placeholder tags and housekeeping markdown are not UI; real markup still is', () => {
  assert.equal(detectSurfaceKinds('src/engine/run.js', "const target = 'lane:<id>|unit:<id>'; // <slug> is replaced at dispatch").size, 0);
  assert.equal(detectSurfaceKinds('CHANGELOG.md', '## [1.2.0]\n- forms and boards').size, 0);
  assert.equal(detectSurfaceKinds('README.md', '').size, 0);
  assert.equal(detectSurfaceKinds('docs/CONTRIBUTING.md', '').size, 0);
  assert.ok(detectSurfaceKinds('docs/prd-orders.md', '').has('ui'));
  assert.ok(detectSurfaceKinds('src/ui/form.js', 'render(<form id="cadastro"><input name="cpf" /></form>)').has('ui'));
  assert.ok(detectSurfaceKinds('src/ui/list.js', 'return `<ul>${items}</ul>`;').has('ui'));
  assert.ok(detectSurfaceKinds('src/ui/box.ts', 'el.innerHTML = "<br/>";').has('ui'));
});

test('a file outside the project owns none of its rules: operator memory and scratch files never get an injection', async () => {
  const dir = await makeTmpDir();
  try {
    await writeProject(dir);
    await writeFile(dir, '.aioson/rules/form-ui.md', FORM_UI_RULE);
    const outside = path.join(os.tmpdir(), 'aioson-elsewhere', 'memory', 'note.md');
    const event = {
      tool_name: 'Write',
      tool_input: { file_path: outside, content: '# cadastro form\n- every field gets a mask and inline validation (cpf)' }
    };
    assert.deepEqual(await buildGuardResponse(event, dir, { tool: 'claude', agent: 'dev' }), {});
    assert.equal(outsideProject(dir, outside), true);
    assert.equal(outsideProject(dir, path.join(dir, 'src', 'x.js')), false);
    assert.equal(outsideProject(dir, 'src/x.js'), false, 'relative paths are the project\'s');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('detectSurfaceKinds: help placeholders and TypeScript generics are notation; custom elements are markup', () => {
  assert.equal(detectSurfaceKinds('src/commands/decide.js', "logger.error('decide --record needs --choice=\"<the option chosen>\".');").size, 0);
  assert.equal(detectSurfaceKinds('src/lib/collections.ts', 'export function first<T extends object>(items: T[]): T { return items[0]; }').size, 0);
  assert.ok(detectSurfaceKinds('src/ui/widget.js', 'return html`<my-card heading="Orders"></my-card>`;').has('ui'));
  assert.ok(detectSurfaceKinds('src/ui/badge.js', "const node = '<span class=\"badge\">';").has('ui'));
});

test('detectSurfaceKinds: research captures and planning notes are about the product; AIOSON plans stay a surface', () => {
  assert.equal(detectSurfaceKinds('plans/contextual-intelligence.md', '').size, 0);
  assert.equal(detectSurfaceKinds('researchs/checkout-patterns/summary.md', '').size, 0);
  assert.equal(detectSurfaceKinds('docs/research/forms.md', '').size, 0);
  assert.ok(detectSurfaceKinds('.aioson/plans/orders/manifest.md', '').has('ui'));
  assert.ok(detectSurfaceKinds('docs/prd-orders.md', '').has('ui'));
  assert.ok(detectSurfaceKinds('plans/board.tsx', '').has('ui'), 'only markdown notes are exempt — markup is still markup');
});

test('surfaces are classified by the project-relative path, never by folders above the project root', async () => {
  const base = await makeTmpDir();
  const dir = path.join(base, 'research', 'app');
  try {
    await writeProject(dir);
    await writeFile(dir, '.aioson/rules/form-ui.md', FORM_UI_RULE);
    const content = '# Cadastro\n\nO formulário de cadastro valida o CPF com máscara e validação inline.';
    const spec = await buildGuardResponse({
      tool_name: 'Write',
      tool_input: { file_path: path.join(dir, 'docs', 'cadastro-form.md'), content }
    }, dir, { tool: 'claude', agent: 'dev' });
    assert.ok(spec._guard && spec._guard.rules.includes('.aioson/rules/form-ui.md'), 'a checkout under research/ still has product docs');

    const note = await buildGuardResponse({
      tool_name: 'Write',
      tool_input: { file_path: path.join(dir, 'plans', 'cadastro-ideas.md'), content }
    }, dir, { tool: 'claude', agent: 'dev' });
    const noteRules = note._guard ? note._guard.rules : [];
    assert.equal(noteRules.includes('.aioson/rules/form-ui.md'), false, 'a planning note about forms is not a form');
  } finally {
    await fs.rm(base, { recursive: true, force: true });
  }
});

test('one tool event injects once even when the hook is installed twice', async () => {
  const dir = await makeTmpDir();
  const claimDir = path.join(dir, 'claims');
  try {
    await writeProject(dir);
    await writeFile(dir, '.aioson/rules/form-ui.md', FORM_UI_RULE);
    const event = {
      session_id: 'session-1',
      tool_use_id: 'toolu_1',
      tool_name: 'Write',
      tool_input: {
        file_path: 'app/cadastro/form.html',
        content: '<form id="cadastro"><label for="cpf">CPF</label><input id="cpf" name="cpf"></form>'
      }
    };
    const [first, second] = await Promise.all([
      buildGuardResponse(event, dir, { tool: 'claude', agent: 'dev', claimDir }),
      buildGuardResponse(event, dir, { tool: 'claude', agent: 'dev', claimDir })
    ]);
    const injected = [first, second].filter((response) => response._guard && response._guard.injected);
    assert.equal(injected.length, 1, 'exactly one of the two hook processes answers');

    const nextEdit = { ...event, tool_use_id: 'toolu_2' };
    const again = await buildGuardResponse(nextEdit, dir, { tool: 'claude', agent: 'dev', claimDir });
    assert.equal(again._guard && again._guard.injected, true, 'a new tool call is a new event');

    const anonymous = { tool_name: event.tool_name, tool_input: event.tool_input };
    assert.equal(claimGuardEvent(anonymous, claimDir), true);
    assert.equal(claimGuardEvent(anonymous, claimDir), true, 'an event without a session identity is never deduplicated');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
