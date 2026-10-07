'use strict';

// With JEV ready, a rule the guard picked only by vocabulary must also be
// judged to govern the write; a measured violation is never judged away, a
// failed judge never silences the guard, and a verdict holds for the session.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { buildGuardResponse } = require('../src/context-guard');
const { loadJevConfig } = require('../src/lib/jev-config');

const FORM_RULE = [
  '---',
  'name: form-fields',
  'description: Structured form fields ship with masks and inline validation',
  'agents: all',
  'modes: [executing]',
  'triggers: [form, mask, cadastro]',
  'aliases: [formulário, cadastro]',
  'entities: [Form, Input, Mask]',
  'load_tier: trigger',
  '---',
  '# Form fields',
  '## Required behavior',
  '- Every structured field gets a live mask and inline validation.',
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
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-guard-jev-'));
  const files = {
    'aioson-models.json': JSON.stringify({ providers: { openrouter: { api_key: 'test-key-from-json' } }, jev: { enabled: true, route: 'openrouter', min_noul: 0.6 } }),
    '.aioson/context/project.context.md': '---\nframework: Node.js\n---\n# Project',
    '.aioson/rules/form-fields.md': FORM_RULE,
    '.aioson/rules/naming.md': NAMING_RULE
  };
  for (const [rel, body] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
    await fs.writeFile(path.join(dir, rel), body, 'utf8');
  }
  return dir;
}

function judge(noul, calls) {
  return async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    const answers = {};
    body.state.rules.forEach((_, index) => { answers[`applies_${index}`] = { type: 'noul', noul }; });
    return { ok: true, status: 200, json: async () => ({ answers }) };
  };
}

const DOC_EDIT = {
  session_id: 'session-jev',
  tool_name: 'Write',
  tool_input: { file_path: 'docs/cli-reference.md', content: '# CLI\n\nO comando de cadastro do formulário exporta o CSV.' }
};

test('a vocabulary-only injection the judge rejects is dropped, and the verdict holds for the session', async () => {
  const dir = await makeProject();
  const claimDir = path.join(dir, 'claims');
  try {
    const plain = await buildGuardResponse({ ...DOC_EDIT, tool_use_id: 'plain' }, dir, { tool: 'claude', agent: 'dev', claimDir });
    assert.ok(plain._guard && plain._guard.rules.includes('.aioson/rules/form-fields.md'), 'without JEV the vocabulary injection stands');

    const calls = [];
    const config = loadJevConfig(dir, {});
    const first = await buildGuardResponse({ ...DOC_EDIT, tool_use_id: 'a' }, dir, { tool: 'claude', agent: 'dev', claimDir, jevFilter: { config, fetchImpl: judge(0.1, calls) } });
    assert.deepEqual(first, {}, 'the judged-away rule leaves nothing to inject');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].state.file, 'docs/cli-reference.md');

    const again = await buildGuardResponse({ ...DOC_EDIT, tool_use_id: 'b' }, dir, { tool: 'claude', agent: 'dev', claimDir, jevFilter: { config, fetchImpl: judge(0.9, calls) } });
    assert.deepEqual(again, {}, 'the session verdict is reused');
    assert.equal(calls.length, 1, 'no second request for the same rule and file');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('a judge that agrees keeps the rule; a judge that fails never silences the guard', async () => {
  const dir = await makeProject();
  const claimDir = path.join(dir, 'claims');
  try {
    const config = loadJevConfig(dir, {});
    const kept = await buildGuardResponse({ ...DOC_EDIT, session_id: 'agree', tool_use_id: 'k' }, dir, { tool: 'claude', agent: 'dev', claimDir, jevFilter: { config, fetchImpl: judge(0.9, []) } });
    assert.ok(kept._guard.rules.includes('.aioson/rules/form-fields.md'));
    assert.equal(kept._guard.jev.status, 'used');

    const down = await buildGuardResponse({ ...DOC_EDIT, session_id: 'down', tool_use_id: 'd' }, dir, { tool: 'claude', agent: 'dev', claimDir, jevFilter: { config, fetchImpl: async () => { throw new Error('ETIMEDOUT'); } } });
    assert.ok(down._guard.rules.includes('.aioson/rules/form-fields.md'));
    assert.equal(down._guard.jev.status, 'unavailable');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('a measured violation is never put to the judge', async () => {
  const dir = await makeProject();
  try {
    const calls = [];
    const config = loadJevConfig(dir, {});
    const result = await buildGuardResponse({
      tool_name: 'Write',
      tool_input: { file_path: 'src/app/servicoCliente.js', content: 'function criarCliente() {}\n' }
    }, dir, { tool: 'claude', agent: 'dev', jevFilter: { config, fetchImpl: judge(0.0, calls) } });
    assert.ok(result._guard.rules.includes('.aioson/rules/naming.md'));
    const judgedRules = calls.flatMap((body) => body.state.rules.map((rule) => rule.path));
    assert.equal(judgedRules.includes('.aioson/rules/naming.md'), false);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
