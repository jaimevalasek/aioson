'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { AGENT_DEFINITIONS } = require('../src/constants');
const { runTestAgents } = require('../src/commands/test-agents');

const logger = { log() {}, error() {} };

async function makeTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-test-agents-'));
}

function validAgent(agentId) {
  return [
    `# Agent @${agentId}`,
    '',
    '> **LANGUAGE BOUNDARY:** Canonical English instructions; localize user-facing output.',
    '',
    '## Mission',
    'Test mission.',
    '',
    '## Required input',
    '- Test input.',
    '',
    '## Hard constraints',
    '- Test constraint.',
    '',
    '## Observability',
    `aioson agent:done . --agent=${agentId} --summary="done" 2>/dev/null || true`,
    ''
  ].join('\n');
}

async function writeAgentSet(root) {
  await fs.mkdir(root, { recursive: true });
  for (const agent of AGENT_DEFINITIONS) {
    await fs.writeFile(path.join(root, path.basename(agent.path)), validAgent(agent.id), 'utf8');
  }
  await fs.writeFile(
    path.join(root, 'pair.md'),
    '# Agent @pair\n\n> **LANGUAGE BOUNDARY:** Canonical English.\n\nCompatibility alias for `@deyvin`.\nRead `.aioson/agents/deyvin.md`.\n',
    'utf8'
  );
}

test('test:agents validates the complete canonical catalog without legacy locale assumptions', async (t) => {
  const dir = await makeTempDir();
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const templateRoot = path.join(dir, 'template', '.aioson', 'agents');
  const workspaceRoot = path.join(dir, '.aioson', 'agents');
  await writeAgentSet(templateRoot);
  await writeAgentSet(workspaceRoot);

  const result = await runTestAgents({ args: [dir], options: { json: true }, logger });

  assert.equal(result.ok, true);
  assert.equal(result.source, 'source_template');
  assert.equal(result.agentCount, AGENT_DEFINITIONS.length);
  assert.equal(result.failed, 0);
  assert.equal(result.checks.some((check) => check.id === 'locales:canonical_only'), true);
  assert.equal(result.checks.some((check) => check.name.includes('(pt-BR) exists')), false);
  assert.equal(result.checks.some((check) => check.name.startsWith('skill:')), false);
});

test('test:agents honors an explicit installed-workspace path', async (t) => {
  const dir = await makeTempDir();
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  await writeAgentSet(path.join(dir, '.aioson', 'agents'));

  const result = await runTestAgents({ args: [dir], options: { json: true }, logger });

  assert.equal(result.ok, true);
  assert.equal(result.source, 'workspace');
  assert.equal(result.parityRoot, null);
});

test('test:agents reports a missing catalog agent with a stable check id', async (t) => {
  const dir = await makeTempDir();
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const root = path.join(dir, '.aioson', 'agents');
  await writeAgentSet(root);
  await fs.unlink(path.join(root, 'dev.md'));

  const result = await runTestAgents({ args: [dir], options: { json: true }, logger });

  assert.equal(result.ok, false);
  assert.equal(result.checks.find((check) => check.id === 'agent:dev:exists').ok, false);
});

test('test:agents detects template/workspace drift', async (t) => {
  const dir = await makeTempDir();
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const templateRoot = path.join(dir, 'template', '.aioson', 'agents');
  const workspaceRoot = path.join(dir, '.aioson', 'agents');
  await writeAgentSet(templateRoot);
  await writeAgentSet(workspaceRoot);
  await fs.appendFile(path.join(workspaceRoot, 'qa.md'), '\nworkspace drift\n', 'utf8');

  const result = await runTestAgents({ args: [dir], options: { json: true }, logger });

  assert.equal(result.ok, false);
  const parity = result.checks.find((check) => check.id === 'parity:qa');
  assert.equal(parity.ok, false);
  assert.match(parity.detail, /Content drift/);
});

test('test:agents rejects legacy locale prompt packs', async (t) => {
  const dir = await makeTempDir();
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  await writeAgentSet(path.join(dir, '.aioson', 'agents'));
  const legacyPath = path.join(dir, '.aioson', 'locales', 'pt-BR', 'agents', 'dev.md');
  await fs.mkdir(path.dirname(legacyPath), { recursive: true });
  await fs.writeFile(legacyPath, validAgent('dev'), 'utf8');

  const result = await runTestAgents({ args: [dir], options: { json: true }, logger });

  assert.equal(result.ok, false);
  assert.equal(result.checks.find((check) => check.id === 'locales:canonical_only').ok, false);
});

test('test:agents does not silently fall back to the package for an invalid explicit path', async (t) => {
  const dir = await makeTempDir();
  t.after(() => fs.rm(dir, { recursive: true, force: true }));

  const result = await runTestAgents({ args: [dir], options: { json: true }, logger });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'agents_not_found');
});
