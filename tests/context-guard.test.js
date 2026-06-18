'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { buildGuardResponse } = require('../src/context-guard');
const { runContextGuard } = require('../src/commands/context-guard');

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
