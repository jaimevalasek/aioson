'use strict';

// Offered → honored: the guard records each injection with the measured
// violations it carried; context:usage re-checks the files as they are now and
// tells a fixed violation from one that landed and stayed.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { runContextGuard } = require('../src/commands/context-guard');
const { runContextUsageCommand } = require('../src/commands/context-usage');
const { collectGuardOutcomes } = require('../src/lib/guard-outcomes');
const { openRuntimeDb } = require('../src/runtime-store');
const { cleanupTmpDir } = require('./helpers/sqlite-cleanup');

const NAMING_RULE = [
  '---',
  'name: naming',
  'description: Identifiers are English',
  'enforcement: source-code-language',
  "paths: ['**/*.js']",
  '---',
  '# Naming',
  '## Required behavior',
  '- Use English identifiers.',
  ''
].join('\n');

const quiet = { log() {} };

async function makeProject() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-guard-outcomes-'));
  await fs.mkdir(path.join(dir, '.aioson', 'context'), { recursive: true });
  await fs.mkdir(path.join(dir, '.aioson', 'rules'), { recursive: true });
  await fs.writeFile(path.join(dir, '.aioson', 'context', 'project.context.md'), '---\nframework: Node.js\n---\n# Project', 'utf8');
  await fs.writeFile(path.join(dir, '.aioson', 'rules', 'naming.md'), NAMING_RULE, 'utf8');
  (await openRuntimeDb(dir)).db.close();
  return dir;
}

async function write(dir, rel, content, session) {
  const event = JSON.stringify({ session_id: session, tool_use_id: `${session}-${rel}`, tool_name: 'Write', tool_input: { file_path: rel, content } });
  const response = await runContextGuard({ args: [dir], options: { agent: 'dev', event, json: true }, logger: quiet });
  await fs.mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
  await fs.writeFile(path.join(dir, rel), content, 'utf8');
  return response;
}

test('a violation the agent fixed and one that landed and stayed are told apart', async () => {
  const dir = await makeProject();
  const session = `outcomes-${Date.now()}`;
  try {
    const injected = await write(dir, 'src/app/customers.js', 'function criarCliente() {}\n', session);
    assert.match(injected.hookSpecificOutput.additionalContext, /"criarCliente"/);
    await fs.writeFile(path.join(dir, 'src/app/customers.js'), 'function createCustomer() {}\n', 'utf8');

    await write(dir, 'src/app/orders.js', 'function criarPedido() {}\n', session);

    const outcomes = await collectGuardOutcomes(dir);
    assert.equal(outcomes.available, true);
    assert.equal(outcomes.totals.injections, 2);
    assert.equal(outcomes.totals.violations_fixed, 1);
    assert.equal(outcomes.totals.violations_still_present, 1);
    const rule = outcomes.rules.find((entry) => entry.path === '.aioson/rules/naming.md');
    assert.deepEqual({ injections: rule.injections, fixed: rule.fixed, still: rule.still_present }, { injections: 2, fixed: 1, still: 1 });

    const lines = [];
    const report = await runContextUsageCommand({ args: [dir], options: {}, logger: { log: (line) => lines.push(String(line)) } });
    assert.equal(report.guard.totals.violations_still_present, 1);
    assert.ok(lines.some((line) => /Guard at write time: 2 injections — measured violations fixed 1, still present 1/.test(line)), lines.join('\n'));
  } finally {
    await cleanupTmpDir(dir);
  }
});

test('no runtime store means nothing recorded, never an error', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-guard-outcomes-empty-'));
  try {
    assert.deepEqual(await collectGuardOutcomes(dir), { available: false });
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
