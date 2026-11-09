'use strict';

/**
 * context:guard runs before every Write/Edit and injected the same rule's lines
 * on every one of them: a session that writes twenty form files read the form
 * rule twenty times. A rule is now said once per session and project, again
 * after a compaction (hooks:recap forgets the session) or an hour later. A
 * measured violation still speaks on every write it is found in, by its
 * finding, without the rule's lines again.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { buildGuardResponse, forgetSessionReminders, SAID_TTL_MS } = require('../src/context-guard');
const { runHooksRecap } = require('../src/commands/hooks-recap');

const FORM_RULE = [
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
  '- Error messages sit under the field they belong to.',
  ''
].join('\n');

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

async function makeProject() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-guard-said-'));
  const write = async (rel, content) => {
    await fs.mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
    await fs.writeFile(path.join(dir, rel), content, 'utf8');
  };
  await write('.aioson/context/project.context.md', '---\nframework: Laravel\nproject_type: web-app\nload_tier: always\n---\n# Project\n');
  await write('.aioson/rules/form-ui.md', FORM_RULE);
  await write('.aioson/rules/naming.md', NAMING_RULE);
  return dir;
}

let sequence = 0;
function formWrite(session, file) {
  sequence += 1;
  return {
    session_id: session,
    tool_use_id: `toolu-${sequence}`,
    tool_name: 'Write',
    tool_input: { file_path: file, content: `<form id="cadastro-${sequence}"><label for="cpf">CPF</label><input id="cpf" name="cpf"></form>` }
  };
}

const textOf = (response) => (response.hookSpecificOutput ? response.hookSpecificOutput.additionalContext : '');

test('a rule is said once per session: twenty form writes inject its lines once', async () => {
  const dir = await makeProject();
  const claimDir = path.join(dir, 'claims');
  try {
    const session = `said-${Date.now()}`;
    const responses = [];
    for (let i = 0; i < 20; i += 1) responses.push(await buildGuardResponse(formWrite(session, `app/forms/form-${i}.html`), dir, { tool: 'claude', agent: 'dev', claimDir }));
    const first = textOf(responses[0]);
    assert.match(first, /Rule \.aioson\/rules\/form-ui\.md:\n- Every structured field gets a live mask/);
    assert.deepEqual(responses.slice(1), Array(19).fill({}), 'the same session is not told again');
    const total = responses.reduce((sum, response) => sum + Buffer.byteLength(textOf(response)), 0);
    assert.equal(total, Buffer.byteLength(first), `20 writes inject ${total} B, not 20 × ${Buffer.byteLength(first)} B`);

    const other = await buildGuardResponse(formWrite(`${session}-other`, 'app/forms/other.html'), dir, { tool: 'claude', agent: 'dev', claimDir });
    assert.equal(textOf(other), first.replace(/form-0\.html/, 'other.html'), 'another session hears the rule');

    const anonymous = formWrite('', 'app/forms/anon.html');
    for (let i = 0; i < 2; i += 1) {
      const response = await buildGuardResponse({ ...anonymous, tool_use_id: `anon-${i}` }, dir, { tool: 'claude', agent: 'dev', claimDir });
      assert.match(textOf(response), /form-ui\.md/, 'a call without a session identity is never remembered');
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('a measured violation speaks on every write, without the rule lines it already said', async () => {
  const dir = await makeProject();
  const claimDir = path.join(dir, 'claims');
  try {
    const session = `said-violation-${Date.now()}`;
    const write = (file, content) => buildGuardResponse({ session_id: session, tool_use_id: `${file}-v`, tool_name: 'Write', tool_input: { file_path: file, content } }, dir, { tool: 'claude', agent: 'dev', claimDir });
    const first = textOf(await write('src/app/customers.js', 'function criarCliente() {}\n'));
    assert.match(first, /Rule \.aioson\/rules\/naming\.md:\n- Use English identifiers\./);
    assert.match(first, /"criarCliente"/);
    const second = textOf(await write('src/app/orders.js', 'function criarPedido() {}\n'));
    assert.match(second, /"criarPedido"/, 'the new finding is reported');
    assert.match(second, /Rule \.aioson\/rules\/naming\.md \(its lines were injected earlier this session\):/);
    assert.doesNotMatch(second, /Use English identifiers/, 'the rule lines are not repeated');
    assert.deepEqual(await write('src/app/clean.js', 'function createOrder() {}\n'), {}, 'a clean write in the same session stays quiet');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('a compaction or an hour makes the guard say the rule again', async () => {
  const dir = await makeProject();
  try {
    // The default directory: hooks:recap forgets the session there.
    const session = `said-compact-${Date.now()}-${process.pid}`;
    const once = await buildGuardResponse(formWrite(session, 'app/forms/a.html'), dir, { tool: 'claude', agent: 'dev' });
    assert.match(textOf(once), /form-ui\.md/);
    assert.deepEqual(await buildGuardResponse(formWrite(session, 'app/forms/b.html'), dir, { tool: 'claude', agent: 'dev' }), {});

    const later = await buildGuardResponse(formWrite(session, 'app/forms/c.html'), dir, { tool: 'claude', agent: 'dev', now: Date.now() + SAID_TTL_MS + 1000 });
    assert.match(textOf(later), /Every structured field/, 'an hour later the rule is restated');

    await runHooksRecap({ args: [dir], options: { payload: { hook_event_name: 'SessionStart', source: 'compact', session_id: session }, json: true }, logger: { log() {} } });
    const afterCompact = await buildGuardResponse(formWrite(session, 'app/forms/d.html'), dir, { tool: 'claude', agent: 'dev' });
    assert.match(textOf(afterCompact), /Every structured field/, 'after a compaction the rule is said again');
    assert.equal(forgetSessionReminders(session), true);
    assert.equal(forgetSessionReminders(''), false);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
