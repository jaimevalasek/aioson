'use strict';

/**
 * phase:next ends one phase of the plan so the next can start in a new
 * conversation. These tests hold its contract with @dev and with the Play's
 * runtime watcher: the next phase comes from the plan's own numbering (gaps
 * allowed), the note is mandatory and lands in the dossier Agent Trail, an
 * unknown phase writes nothing, the policy resolves project option → Play →
 * terminal default, and `auto` records exactly one `phase_restart_requested`
 * event on the live session's running run, with a kickoff for every harness.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { resolvePhaseRestartPolicy, EVENT_TYPE } = require('../src/commands/phase-next');
const { buildKickoffMap } = require('../src/lib/session-kickoff');
const { listSupportedTools } = require('../src/lib/tool-capabilities');
const { runLiveStart, runLiveHandoff } = require('../src/commands/live');
const { openRuntimeDb } = require('../src/runtime-store');
const { createTranslator } = require('../src/i18n');

const CLI = path.join(__dirname, '..', 'bin', 'aioson.js');
const silent = { log() {}, error() {} };
const { t } = createTranslator('en');

const PLAN = [
  '---', 'feature: billing', '---', '', '# Implementation Plan — billing', '',
  '## Phase 1 — CSV export', '', 'Deliver AC-1.', '',
  '## Phase 3 — Filters', '', 'Deliver AC-2.', '',
  '## Phase 5 — Schedule', '', 'Deliver AC-3.', ''
].join('\n');

function makeProject({ phaseRestart } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-phase-next-'));
  const context = path.join(dir, '.aioson', 'context');
  fs.mkdirSync(context, { recursive: true });
  fs.writeFileSync(path.join(dir, '.aioson', 'config.md'), '# project\n');
  fs.writeFileSync(path.join(context, 'implementation-plan-billing.md'), PLAN);
  fs.writeFileSync(path.join(context, 'prd-billing.md'), '# PRD — billing\n\n## Problem\n\nExport invoices.\n');
  const frontmatter = ['---', 'project_name: "demo"', 'classification: "SMALL"'];
  if (phaseRestart !== undefined) frontmatter.push(`phase_restart: ${phaseRestart}`);
  fs.writeFileSync(path.join(context, 'project.context.md'), `${frontmatter.join('\n')}\n---\n\n# Project Context\n`);
  fs.mkdirSync(path.join(dir, '.claude', 'commands', 'aioson', 'agent'), { recursive: true });
  for (const id of ['dev', 'qa']) fs.writeFileSync(path.join(dir, '.claude', 'commands', 'aioson', 'agent', `${id}.md`), 'stub\n');
  return dir;
}

// A suite run inside the Play inherits AIOSON_PLAY and the live-session keys.
function cleanEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  for (const name of ['AIOSON_LIVE_SESSION_KEY', 'AIOSON_LIVE_SESSION', 'AIOSON_PLAY']) {
    if (!(name in extra)) delete env[name];
  }
  return env;
}

function phaseNext(dir, flags, env = cleanEnv()) {
  const result = spawnSync(process.execPath, [CLI, 'phase:next', dir, '--feature=billing', ...flags, '--json'], { env, encoding: 'utf8' });
  let json = null;
  try { json = JSON.parse(result.stdout); } catch { /* reported below */ }
  assert.ok(json, `no JSON on stdout: ${result.stdout} ${result.stderr}`);
  return { status: result.status, ...json };
}

async function liveSession(dir, tool = 'claude') {
  return runLiveStart({ args: [dir], options: { tool, 'tool-bin': 'node', agent: 'dev', 'no-launch': true, json: true }, logger: silent, t });
}

async function restartEvents(dir) {
  const opened = await openRuntimeDb(dir, { mustExist: true });
  if (!opened) return { execution: [], agent: [] };
  try {
    return {
      execution: opened.db.prepare('SELECT run_key, session_key, event_type, payload_json FROM execution_events WHERE event_type = ? ORDER BY id').all(EVENT_TYPE),
      agent: opened.db.prepare('SELECT run_key, payload_json FROM agent_events WHERE event_type = ? ORDER BY id').all(EVENT_TYPE)
    };
  } finally {
    opened.db.close();
  }
}

function dossier(dir) {
  const file = path.join(dir, '.aioson', 'context', 'features', 'billing', 'dossier.md');
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

test('the next phase follows the plan numbering with gaps, and QA comes after the last phase', () => {
  const dir = makeProject();
  try {
    const first = phaseNext(dir, ['--finished=1', '--note=none']);
    assert.deepEqual([first.ok, first.finished, first.next_phase, first.next_stage], [true, 1, 3, 'dev']);
    assert.match(first.kickoff, /--phase=3 --capsule/);

    const middle = phaseNext(dir, ['--finished=3', '--note=none']);
    assert.deepEqual([middle.next_phase, middle.next_stage], [5, 'dev']);

    const last = phaseNext(dir, ['--finished=5', '--note=none']);
    assert.deepEqual([last.finished, last.next_phase, last.next_stage], [5, null, 'qa']);
    assert.ok(last.kickoff.startsWith('/aioson:agent:qa '), last.kickoff);
    assert.match(last.kickoff, /Deterministic preflight with --feature=billing/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the note is required, "none" and "nenhuma" count, and it lands in the dossier Agent Trail', () => {
  const dir = makeProject();
  try {
    for (const flags of [[], ['--note='], ['--note']]) {
      const refused = phaseNext(dir, ['--finished=1', ...flags]);
      assert.deepEqual([refused.status, refused.ok, refused.reason], [1, false, 'missing_note'], flags.join(' '));
    }
    assert.equal(dossier(dir), '', 'a refused call writes nothing');

    const noted = phaseNext(dir, ['--finished=1', '--note=CSV header stays in English; amounts use a dot']);
    assert.equal(noted.note.recorded, true);
    const trail = dossier(dir).split(/^## /m).find((section) => section.startsWith('Agent Trail'));
    assert.ok(trail, 'the dossier has an Agent Trail section');
    assert.match(trail, /@dev/);
    assert.match(trail, /Phase 1 closed; next: phase 3\. Decisions not on disk: CSV header stays in English; amounts use a dot/);

    assert.equal(phaseNext(dir, ['--finished=3', '--note=nenhuma']).note.text, 'none');
    assert.match(dossier(dir), /Phase 3 closed; next: phase 5\. Decisions not on disk: none/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a phase the plan does not have is refused before anything is written', async () => {
  const dir = makeProject();
  try {
    const live = await liveSession(dir);
    const env = cleanEnv({ AIOSON_PLAY: '1', AIOSON_LIVE_SESSION_KEY: live.sessionKey });
    for (const finished of ['2', '6']) {
      const refused = phaseNext(dir, [`--finished=${finished}`, '--note=none'], env);
      assert.deepEqual([refused.status, refused.reason, refused.phases], [1, 'unknown_phase', ['1', '3', '5']]);
    }
    assert.equal(phaseNext(dir, ['--finished=last', '--note=none'], env).reason, 'invalid_finished');
    assert.equal(phaseNext(dir, ['--note=none'], env).reason, 'missing_finished');
    assert.equal(dossier(dir), '');
    assert.equal((await restartEvents(dir)).execution.length, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('policy order: the project option, then auto inside the Play, then suggest', async () => {
  const dirs = [];
  const project = (value) => { const dir = makeProject({ phaseRestart: value }); dirs.push(dir); return dir; };
  try {
    assert.deepEqual(await resolvePhaseRestartPolicy(project(undefined), {}), { policy: 'suggest', source: 'default', warning: null });
    assert.deepEqual(await resolvePhaseRestartPolicy(project(undefined), { AIOSON_PLAY: '1' }), { policy: 'auto', source: 'play', warning: null });
    assert.deepEqual(await resolvePhaseRestartPolicy(project('off'), { AIOSON_PLAY: '1' }), { policy: 'off', source: 'project', warning: null });
    assert.deepEqual(await resolvePhaseRestartPolicy(project('suggest'), { AIOSON_PLAY: '1' }), { policy: 'suggest', source: 'project', warning: null });
    assert.deepEqual(await resolvePhaseRestartPolicy(project('"auto"'), {}), { policy: 'auto', source: 'project', warning: null });
    const unknown = await resolvePhaseRestartPolicy(project('always'), { AIOSON_PLAY: '1' });
    assert.deepEqual([unknown.policy, unknown.source], ['auto', 'play']);
    assert.match(unknown.warning, /phase_restart: "always" is not auto, suggest or off/);
    assert.equal((await resolvePhaseRestartPolicy(project(undefined), { AIOSON_PLAY: '0' })).policy, 'suggest');

    // The same order through the CLI, where AIOSON_PLAY comes from the environment.
    assert.equal(phaseNext(project(undefined), ['--finished=1', '--note=none']).policy, 'suggest');
    assert.equal(phaseNext(project('off'), ['--finished=1', '--note=none'], cleanEnv({ AIOSON_PLAY: '1' })).policy, 'off');
  } finally {
    for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('auto records one phase_restart_requested on the live session\'s running run, with a kickoff per harness', async () => {
  const dir = makeProject();
  try {
    const live = await liveSession(dir);
    const env = cleanEnv({ AIOSON_PLAY: '1', AIOSON_LIVE_SESSION_KEY: live.sessionKey });
    const result = phaseNext(dir, ['--finished=3', '--note=filters persist per user'], env);
    assert.deepEqual([result.ok, result.policy, result.policy_source, result.tool], [true, 'auto', 'play', 'claude']);
    assert.deepEqual(result.event, { recorded: true, id: result.event.id, run_key: live.runKey, session_key: live.sessionKey });
    assert.match(result.directive, /the Play continues with phase 5\. End your reply now/);

    const rows = await restartEvents(dir);
    assert.equal(rows.execution.length, 1);
    assert.equal(rows.agent.length, 1);
    assert.deepEqual([rows.execution[0].run_key, rows.execution[0].session_key], [live.runKey, live.sessionKey]);
    const payload = JSON.parse(rows.execution[0].payload_json);
    assert.deepEqual(payload, {
      feature: 'billing',
      finished: 3,
      next_phase: 5,
      next_stage: 'dev',
      kickoff: buildKickoffMap({ targetDir: dir, agent: 'dev', feature: 'billing', phase: '5' })
    });
    assert.deepEqual(Object.keys(payload.kickoff).sort(), listSupportedTools().sort());
    assert.equal(payload.kickoff.claude, result.kickoff);

    const retried = phaseNext(dir, ['--finished=3', '--note=filters persist per user'], env);
    assert.deepEqual([retried.policy, retried.event.recorded, retried.event.reason], ['auto', false, 'already_recorded']);
    assert.equal((await restartEvents(dir)).execution.length, 1, 'a retried phase:next never asks for a second restart');

    const toQa = phaseNext(dir, ['--finished=5', '--note=none'], env);
    assert.equal(toQa.event.recorded, true);
    const qaPayload = JSON.parse((await restartEvents(dir)).execution[1].payload_json);
    assert.deepEqual([qaPayload.finished, qaPayload.next_phase, qaPayload.next_stage], [5, null, 'qa']);
    assert.ok(qaPayload.kickoff.claude.startsWith('/aioson:agent:qa '));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the event follows the session to the run a handoff opened, as hooks:emit does', async () => {
  const dir = makeProject();
  try {
    const live = await liveSession(dir);
    const handoff = await runLiveHandoff({ args: [dir], options: { agent: 'dev', to: 'qa', reason: 'verify', json: true }, logger: silent, t });
    const result = phaseNext(dir, ['--finished=1', '--note=none'], cleanEnv({ AIOSON_PLAY: '1', AIOSON_LIVE_SESSION_KEY: live.sessionKey }));
    assert.equal(result.event.run_key, handoff.runKey);
    assert.equal((await restartEvents(dir)).execution[0].run_key, handoff.runKey);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('suggest and off write no event; auto with no live session drops to suggest and says why', async () => {
  const dir = makeProject();
  const off = makeProject({ phaseRestart: 'off' });
  try {
    const live = await liveSession(off);
    const quiet = phaseNext(off, ['--finished=1', '--note=none'], cleanEnv({ AIOSON_PLAY: '1', AIOSON_LIVE_SESSION_KEY: live.sessionKey }));
    assert.deepEqual([quiet.policy, quiet.event], ['off', null]);
    assert.equal(quiet.directive, 'Continue with phase 3 in this conversation.');
    assert.equal((await restartEvents(off)).execution.length, 0);

    const suggested = phaseNext(dir, ['--finished=1', '--note=none']);
    assert.deepEqual([suggested.policy, suggested.event], ['suggest', null]);
    assert.ok(suggested.directive.endsWith(suggested.kickoff), 'suggest quotes the kickoff once');

    const orphan = phaseNext(dir, ['--finished=3', '--note=none'], cleanEnv({ AIOSON_PLAY: '1' }));
    assert.deepEqual([orphan.policy, orphan.policy_requested, orphan.downgrade_reason], ['suggest', 'auto', 'no_live_session']);
    assert.equal((await restartEvents(dir)).execution.length, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(off, { recursive: true, force: true });
  }
});

test('a note the dossier could not take keeps the conversation: auto drops to suggest, unless the note is none', async () => {
  const dir = makeProject();
  try {
    fs.rmSync(path.join(dir, '.aioson', 'context', 'prd-billing.md'));
    const live = await liveSession(dir);
    const env = cleanEnv({ AIOSON_PLAY: '1', AIOSON_LIVE_SESSION_KEY: live.sessionKey });
    const kept = phaseNext(dir, ['--finished=1', '--note=amounts use a dot'], env);
    assert.deepEqual([kept.note.recorded, kept.note.reason], [false, 'not_found']);
    assert.deepEqual([kept.policy, kept.downgrade_reason, kept.event], ['suggest', 'note_not_recorded', null]);

    const nothingToLose = phaseNext(dir, ['--finished=1', '--note=none'], env);
    assert.deepEqual([nothingToLose.policy, nothingToLose.event.recorded], ['auto', true]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the output kickoff is for --tool, else the live session\'s harness, and an unknown --tool is refused', async () => {
  const dir = makeProject();
  try {
    const live = await liveSession(dir, 'codex');
    const env = cleanEnv({ AIOSON_PLAY: '1', AIOSON_LIVE_SESSION_KEY: live.sessionKey });
    const inSession = phaseNext(dir, ['--finished=1', '--note=none'], env);
    assert.equal(inSession.tool, 'codex');
    assert.ok(inSession.kickoff.startsWith('Read AGENTS.md and execute @dev using .aioson/agents/dev.md. '));

    const named = phaseNext(dir, ['--finished=3', '--note=none', '--tool=opencode'], env);
    assert.equal(named.tool, 'opencode');
    assert.ok(named.kickoff.startsWith('Use agent "dev" from .aioson/agents/dev.md. '));

    assert.equal(phaseNext(dir, ['--finished=3', '--note=none', '--tool=notepad'], env).reason, 'unknown_tool');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
