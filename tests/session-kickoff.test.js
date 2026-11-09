'use strict';

/**
 * session:kickoff is the one line that starts an agent in a NEW conversation
 * of a harness — the Play types it into the session it reopens after a phase
 * and never composes one itself. These tests hold the contract: one kickoff per
 * registered harness, each opening with that harness's real activation (the
 * installed Claude Code slash command, else the lead agent:prompt uses), @dev
 * starting from the capsule of a phase the plan really has, @qa from its own
 * preflight, and refusals for anything the plan or the registry does not know.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { buildKickoff, buildKickoffMap, planPhaseIds } = require('../src/lib/session-kickoff');
const { runSessionKickoff } = require('../src/commands/session-kickoff');
const { getAgentDefinition, agentActivationLead, buildAgentPrompt } = require('../src/agents');
const { listSupportedTools } = require('../src/lib/tool-capabilities');
const { agentFromPrompt } = require('../src/commands/hooks-emit');
const { runLiveStart } = require('../src/commands/live');
const { createTranslator } = require('../src/i18n');

const CLI = path.join(__dirname, '..', 'bin', 'aioson.js');
const ROOT = path.join(__dirname, '..');
const silent = { log() {}, error() {} };
const { t } = createTranslator('en');

const PLAN = [
  '---', 'feature: billing', '---', '', '# Implementation Plan — billing', '',
  '## Phase 1 — CSV export', '', 'Deliver AC-1.', '',
  '## Phase 3 — Filters', '', 'Deliver AC-2.', '',
  '## Phase 5 — Schedule', '', 'Deliver AC-3.', ''
].join('\n');

function makeProject({ slashCommands = ['dev', 'qa'] } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-kickoff-'));
  fs.mkdirSync(path.join(dir, '.aioson', 'context'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.aioson', 'config.md'), '# project\n');
  fs.writeFileSync(path.join(dir, '.aioson', 'context', 'implementation-plan-billing.md'), PLAN);
  const commands = path.join(dir, '.claude', 'commands', 'aioson', 'agent');
  fs.mkdirSync(commands, { recursive: true });
  for (const id of slashCommands) fs.writeFileSync(path.join(commands, `${id}.md`), 'stub\n');
  return dir;
}

// A suite run inside a launched session inherits the variables live:start exports.
function cleanEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  for (const name of ['AIOSON_LIVE_SESSION_KEY', 'AIOSON_LIVE_SESSION', 'AIOSON_PLAY']) {
    if (!(name in extra)) delete env[name];
  }
  return env;
}

function cli(args, env = cleanEnv()) {
  const result = spawnSync(process.execPath, [CLI, ...args], { env, encoding: 'utf8' });
  return { status: result.status, json: result.stdout.trim().startsWith('{') ? JSON.parse(result.stdout) : null, stdout: result.stdout, stderr: result.stderr };
}

test('plan phase ids keep plan order and gaps, each once', () => {
  assert.deepEqual(planPhaseIds(PLAN), ['1', '3', '5']);
  assert.deepEqual(planPhaseIds(`${PLAN}\n### Phase 3: repeated subheading\n`), ['1', '3', '5']);
});

test('a kickoff exists for every registered harness, one line each, starting @dev from the phase capsule', () => {
  const dir = makeProject();
  try {
    const kickoffs = buildKickoffMap({ targetDir: dir, agent: 'dev', feature: 'billing', phase: '3' });
    assert.deepEqual(Object.keys(kickoffs).sort(), listSupportedTools().sort());
    for (const [tool, text] of Object.entries(kickoffs)) {
      assert.ok(text.length > 0 && text.length < 400, `${tool}: ${text.length} chars`);
      assert.doesNotMatch(text, /[\r\n]/, `${tool}: an Enter inside the text would send half of it`);
      assert.ok(text.includes('`aioson dev:resume-data . --feature=billing --phase=3 --capsule`'), `${tool}: capsule command`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('each harness opens with its real activation: the installed Claude slash command, else the agent:prompt lead', () => {
  const dir = makeProject();
  const bare = makeProject({ slashCommands: [] });
  try {
    const dev = getAgentDefinition('dev');
    const claude = buildKickoff({ targetDir: dir, agent: 'dev', feature: 'billing', phase: '3', tool: 'claude' });
    assert.ok(claude.startsWith('/aioson:agent:dev '), claude);
    assert.equal(agentFromPrompt(claude), '@dev', 'hooks:emit records the slash command as the agent taking over the session');
    assert.ok(fs.existsSync(path.join(ROOT, 'template', '.claude', 'commands', 'aioson', 'agent', 'dev.md')), 'the installer ships the slash command');

    const withoutSlash = buildKickoff({ targetDir: bare, agent: 'dev', feature: 'billing', phase: '3', tool: 'claude' });
    assert.ok(withoutSlash.startsWith('Read .aioson/agents/dev.md and execute @dev. '), withoutSlash);

    for (const tool of listSupportedTools().filter((name) => name !== 'claude')) {
      const lead = agentActivationLead(dev, tool);
      const text = buildKickoff({ targetDir: dir, agent: 'dev', feature: 'billing', phase: '3', tool });
      assert.ok(text.startsWith(`${lead} `), `${tool}: ${text}`);
      assert.ok(buildAgentPrompt(dev, tool, { instructionPath: dev.path }).startsWith(`${lead} `), `${tool}: agent:prompt opens with the same lead`);
    }
    assert.ok(buildKickoff({ targetDir: dir, agent: 'dev', feature: 'billing', phase: '3', tool: 'codex' }).startsWith('Read AGENTS.md and execute @dev using .aioson/agents/dev.md. '));
    assert.ok(buildKickoff({ targetDir: dir, agent: 'dev', feature: 'billing', phase: '3', tool: 'opencode' }).startsWith('Use agent "dev" from .aioson/agents/dev.md. '));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(bare, { recursive: true, force: true });
  }
});

test('@qa starts at its Deterministic preflight for the feature, never from the capsule', () => {
  const dir = makeProject();
  try {
    for (const [tool, text] of Object.entries(buildKickoffMap({ targetDir: dir, agent: 'qa', feature: 'billing', phase: '3' }))) {
      assert.match(text, /Verify feature billing in this new session: start at your Deterministic preflight with --feature=billing/, tool);
      assert.doesNotMatch(text, /--capsule/, `${tool}: the capsule is Dev's entry`);
    }
    assert.ok(buildKickoff({ targetDir: dir, agent: 'qa', feature: 'billing', tool: 'claude' }).startsWith('/aioson:agent:qa '));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('session:kickoff refuses a phase the plan does not have, a non-number, an unknown agent or harness', async () => {
  const dir = makeProject();
  try {
    const run = (options) => runSessionKickoff({ args: [dir], options: { json: true, tool: 'claude', ...options }, logger: silent });
    assert.deepEqual(await run({ agent: 'dev', feature: 'billing', phase: '2' }), { ok: false, reason: 'unknown_phase', phases: ['1', '3', '5'] });
    assert.equal((await run({ agent: 'dev', feature: 'billing', phase: 'next' })).reason, 'invalid_phase');
    assert.equal((await run({ agent: 'dev', feature: 'other', phase: '1' })).reason, 'plan_not_found');
    assert.equal((await run({ agent: 'nobody', feature: 'billing' })).reason, 'unknown_agent');
    assert.equal((await run({ agent: 'dev', feature: 'billing', tool: 'notepad' })).reason, 'unknown_tool');
    assert.equal((await run({ agent: 'dev' })).reason, 'missing_feature');
    assert.equal((await run({ feature: 'billing' })).reason, 'missing_agent');

    const ok = await run({ agent: 'dev', feature: 'billing', phase: '03' });
    assert.deepEqual({ ...ok, kickoff: undefined }, { ok: true, agent: 'dev', feature: 'billing', phase: 3, tool: 'claude', kickoff: undefined });
    assert.match(ok.kickoff, /--phase=3 --capsule/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the CLI prints the bare kickoff, or JSON, and fails the process on a refusal', () => {
  const dir = makeProject();
  try {
    const text = cli(['session:kickoff', dir, '--agent=dev', '--feature=billing', '--phase=5', '--tool=claude']);
    assert.equal(text.status, 0, text.stderr);
    assert.equal(text.stdout.trim(), buildKickoff({ targetDir: dir, agent: 'dev', feature: 'billing', phase: '5', tool: 'claude' }));

    const json = cli(['session:kickoff', dir, '--agent=qa', '--feature=billing', '--tool=opencode', '--json']);
    assert.equal(json.status, 0, json.stderr);
    assert.equal(json.json.tool, 'opencode');
    assert.ok(json.json.kickoff.startsWith('Use agent "qa" from .aioson/agents/qa.md. '));

    const refused = cli(['session:kickoff', dir, '--agent=dev', '--feature=billing', '--phase=4', '--json']);
    assert.equal(refused.status, 1);
    assert.equal(refused.json.reason, 'unknown_phase');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('without --tool the kickoff is written for the harness of the live session, else claude', async () => {
  const dir = makeProject();
  try {
    const start = await runLiveStart({ args: [dir], options: { tool: 'codex', 'tool-bin': 'node', agent: 'dev', 'no-launch': true, json: true }, logger: silent, t });
    const inSession = cli(['session:kickoff', dir, '--agent=dev', '--feature=billing', '--phase=1', '--json'], cleanEnv({ AIOSON_LIVE_SESSION_KEY: start.sessionKey }));
    assert.equal(inSession.json.tool, 'codex', inSession.stderr);
    assert.ok(inSession.json.kickoff.startsWith('Read AGENTS.md and execute @dev'));

    const outside = cli(['session:kickoff', dir, '--agent=dev', '--feature=billing', '--phase=1', '--json']);
    assert.equal(outside.json.tool, 'claude');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
