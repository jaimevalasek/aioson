'use strict';

// The session guard judges a write with the rules of the agent acting NOW.
// Every install and update used to bake `--agent='dev'` into the guard hook,
// so a plan written by the planner was judged with the dev's rules.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { resolveActiveAgent, isAutoAgent, ACTIVE_WINDOW_MS } = require('../src/lib/active-agent');
const { resolveGuardAgentAt, runContextGuard } = require('../src/commands/context-guard');
const { buildClaudeHooks, guardAgentFor } = require('../src/commands/hooks-install');
const { openRuntimeDb, appendContextBriefEvent } = require('../src/runtime-store');
const { cleanupTmpDir } = require('./helpers/sqlite-cleanup');

async function makeProject() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-active-agent-'));
  await fs.mkdir(path.join(dir, '.aioson', 'context'), { recursive: true });
  await fs.writeFile(path.join(dir, '.aioson', 'context', 'project.context.md'), '---\nframework: Node.js\n---\n# Project', 'utf8');
  return dir;
}

async function recordBrief(dir, agent, createdAt) {
  const handle = await openRuntimeDb(dir);
  try {
    appendContextBriefEvent(handle.db, { agentName: agent, message: 'brief_built:planning', payload: {}, createdAt });
  } finally {
    handle.db.close();
  }
}

const NO_ENV = {};

test('the event, then AIOSON_AGENT, then the latest brief name the active agent', async () => {
  const dir = await makeProject();
  try {
    assert.deepEqual(await resolveActiveAgent(dir, { env: NO_ENV }), { agent: null, source: 'none' }, 'no runtime store yet');

    const now = Date.now();
    await recordBrief(dir, 'dev', new Date(now - 60_000).toISOString());
    await recordBrief(dir, 'planner', new Date(now - 10_000).toISOString());
    assert.deepEqual(await resolveActiveAgent(dir, { env: NO_ENV, now }), { agent: 'planner', source: 'runtime' });
    assert.deepEqual(await resolveActiveAgent(dir, { env: { AIOSON_AGENT: '@QA' }, now }), { agent: 'qa', source: 'env' });
    assert.deepEqual(await resolveActiveAgent(dir, { event: { agent_name: 'sheldon' }, env: { AIOSON_AGENT: 'qa' }, now }), { agent: 'sheldon', source: 'event' });
    assert.deepEqual(await resolveActiveAgent(dir, { event: { agent: 'auto' }, env: { AIOSON_AGENT: 'auto' }, now }), { agent: 'planner', source: 'runtime' }, '`auto` is never an agent');

    const later = now + ACTIVE_WINDOW_MS + 60_000;
    assert.deepEqual(await resolveActiveAgent(dir, { env: NO_ENV, now: later }), { agent: null, source: 'none' }, 'a brief older than the window says nothing');
  } finally {
    await cleanupTmpDir(dir);
  }
});

test('agents that consult context:select instead of the brief (briefing, refiner, squad) leave the same trace', async () => {
  const dir = await makeProject();
  try {
    (await openRuntimeDb(dir)).db.close();
    const { runContextSelect } = require('../src/commands/context-select');
    await runContextSelect({ args: [dir], options: { agent: 'refiner', mode: 'planning', task: 'refine the briefing', json: true }, logger: { log() {} } });
    assert.deepEqual(await resolveActiveAgent(dir, { env: NO_ENV }), { agent: 'refiner', source: 'runtime' });
  } finally {
    await cleanupTmpDir(dir);
  }
});

test('an explicit guard agent wins; auto or no flag resolves at runtime; nothing falls back to dev', async () => {
  const dir = await makeProject();
  const saved = process.env.AIOSON_AGENT;
  delete process.env.AIOSON_AGENT;
  try {
    assert.equal(await resolveGuardAgentAt(dir, { agent: 'auto' }, {}), 'dev');
    await recordBrief(dir, 'planner', new Date().toISOString());
    assert.equal(await resolveGuardAgentAt(dir, { agent: 'auto' }, {}), 'planner');
    assert.equal(await resolveGuardAgentAt(dir, {}, {}), 'planner');
    assert.equal(await resolveGuardAgentAt(dir, { agent: 'qa' }, {}), 'qa');
    assert.equal(isAutoAgent('AUTO'), true);
    assert.equal(isAutoAgent('dev'), false);
  } finally {
    if (saved === undefined) delete process.env.AIOSON_AGENT;
    else process.env.AIOSON_AGENT = saved;
    await cleanupTmpDir(dir);
  }
});

test('a default install bakes auto into the guard; an explicit agent is still honored', () => {
  assert.equal(guardAgentFor({}, 'dev'), 'auto');
  assert.equal(guardAgentFor({ agent: 'qa' }, 'qa'), 'qa');
  const hooks = buildClaudeHooks('dev', true, 'auto');
  assert.match(hooks.PreToolUse[0].hooks[0].command, /context:guard .*--agent='auto'/);
  assert.match(hooks.Stop[0].hooks[0].command, /agent:done .*--agent='dev'/, 'session telemetry keeps its install-time agent');
});

test('end to end: a planner-only rule reaches the plan only while the planner is the active agent', async () => {
  const dir = await makeProject();
  const saved = process.env.AIOSON_AGENT;
  delete process.env.AIOSON_AGENT;
  try {
    await fs.mkdir(path.join(dir, '.aioson', 'rules'), { recursive: true });
    await fs.writeFile(path.join(dir, '.aioson', 'rules', 'naming.md'), [
      '---',
      'name: naming',
      'description: Planned file names are English',
      'agents: [planner]',
      'enforcement: source-code-language',
      "paths: ['**/*.js']",
      '---',
      '# Naming',
      '## Required behavior',
      '- Name planned files in technical English.',
      ''
    ].join('\n'), 'utf8');
    const event = JSON.stringify({
      tool_name: 'Write',
      tool_input: { file_path: '.aioson/context/implementation-plan-orders.md', content: '| `src/pedidos/servicoPedido.js` | camada |' }
    });
    const quiet = { log() {} };

    const asDev = await runContextGuard({ args: [dir], options: { agent: 'auto', event, json: true }, logger: quiet });
    assert.equal(JSON.stringify(asDev).includes('naming.md'), false, 'nobody active: the dev fallback does not get a planner-only rule');

    await recordBrief(dir, 'planner', new Date().toISOString());
    const asPlanner = await runContextGuard({ args: [dir], options: { agent: 'auto', event, json: true }, logger: quiet });
    const text = asPlanner.hookSpecificOutput ? asPlanner.hookSpecificOutput.additionalContext : '';
    assert.match(text, /naming\.md/);
    assert.match(text, /"servicoPedido"/);
  } finally {
    if (saved === undefined) delete process.env.AIOSON_AGENT;
    else process.env.AIOSON_AGENT = saved;
    await cleanupTmpDir(dir);
  }
});
