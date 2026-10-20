'use strict';

// agent:done records its run as `@quality` and hands memory reflection the bare
// name `quality`: the trailing event found neither the session nor the run and
// was dropped on every call. One agent is now matched under both spellings; a
// bare-name hooks session a 1.73 hook left open is closed instead of joined;
// and the "context:brief not consulted" window never reaches past a day, since
// Claude never closes its hooks session.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const Database = require('better-sqlite3');

const { openRuntimeDb, startTask, startRun, writeAgentSession, readAgentSession, appendRunEvent } = require('../src/runtime-store');

const BIN = path.join(__dirname, '..', 'bin', 'aioson.js');
const DAY = 24 * 60 * 60 * 1000;

async function tmpProject(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-cycle-reflect-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  await fs.mkdir(path.join(dir, '.aioson', 'context'), { recursive: true });
  return dir;
}

function agentDone(dir, agent, extra = []) {
  const home = path.join(dir, '.home');
  const env = { ...process.env, HOME: home, USERPROFILE: home, AIOSON_OPERATOR_MEMORY: 'false' };
  const r = spawnSync(process.execPath, [BIN, 'agent:done', dir, `--agent=${agent}`, '--summary=probe', ...extra], { encoding: 'utf8', cwd: dir, env });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  return r.stdout;
}

function query(dir, sql, ...params) {
  const db = new Database(path.join(dir, '.aioson', 'runtime', 'aios.sqlite'), { readonly: true });
  try {
    return db.prepare(sql).all(...params);
  } finally {
    db.close();
  }
}

const running = (dir) => ({
  tasks: query(dir, "SELECT task_key FROM tasks WHERE status = 'running'").length,
  runs: query(dir, "SELECT run_key FROM agent_runs WHERE status = 'running'").length
});

test('agent:done stores its reflection event on the @agent run it closed, and leaves nothing running', async (t) => {
  const dir = await tmpProject(t);
  agentDone(dir, 'quality');
  const [run] = query(dir, "SELECT run_key, agent_name, status FROM agent_runs");
  assert.equal(run.agent_name, '@quality');
  assert.equal(run.status, 'completed');
  const events = query(dir, "SELECT run_key FROM agent_events WHERE event_type LIKE 'memory_reflect_%'");
  assert.equal(events.length, 1, 'the reflection event is stored, not dropped');
  assert.equal(events[0].run_key, run.run_key);
  assert.deepEqual(running(dir), { tasks: 0, runs: 0 });
});

test('with a live @agent session open, the reflection event joins that run', async (t) => {
  const dir = await tmpProject(t);
  const log = spawnSync(process.execPath, [BIN, 'runtime-log', dir, '--agent=@quality', '--message=start'], { encoding: 'utf8', cwd: dir });
  assert.equal(log.status, 0, log.stderr);
  const session = await readAgentSession(path.join(dir, '.aioson', 'runtime'), '@quality');
  agentDone(dir, 'quality');
  const events = query(dir, "SELECT run_key FROM agent_events WHERE event_type LIKE 'memory_reflect_%'");
  assert.deepEqual(events.map((e) => e.run_key), [session.runKey]);
});

test('a bare-name hooks session a 1.73 hook left open is closed, never joined', async (t) => {
  const dir = await tmpProject(t);
  const { db, runtimeDir } = await openRuntimeDb(dir);
  let legacy;
  try {
    const taskKey = startTask(db, { title: '[hooks] dev via claude', status: 'running', createdBy: 'dev', sessionKey: 'hooks-dev-1760000000000' });
    const runKey = startRun(db, { taskKey, agentName: 'dev', agentKind: 'official', sessionKey: 'hooks-dev-1760000000000', source: 'live', title: '[hooks] dev via claude' });
    legacy = { runKey, taskKey, sessionKey: 'hooks-dev-1760000000000', startedAt: new Date(Date.now() - 3 * DAY).toISOString(), finished: false, source: 'live' };
    await writeAgentSession(runtimeDir, 'dev', legacy);
  } finally {
    db.close();
  }

  agentDone(dir, 'dev');

  const leftover = await readAgentSession(runtimeDir, 'dev');
  assert.equal(leftover.finished, true, 'the 1.73 session file is finished');
  assert.equal(query(dir, 'SELECT status FROM agent_runs WHERE run_key = ?', legacy.runKey)[0].status, 'completed');
  assert.equal(query(dir, 'SELECT status FROM tasks WHERE task_key = ?', legacy.taskKey)[0].status, 'completed');
  const events = query(dir, "SELECT e.run_key, r.agent_name FROM agent_events e JOIN agent_runs r ON r.run_key = e.run_key WHERE e.event_type LIKE 'memory_reflect_%'");
  assert.equal(events.length, 1);
  assert.equal(events[0].agent_name, '@dev', 'the event lands on the run agent:done closed, not on the stale hooks run');
  assert.deepEqual(running(dir), { tasks: 0, runs: 0 });
});

// The window of "context:brief not consulted" is the session's, capped at a day.
async function liveSessionWithBrief(t, { sessionAgeMs, briefAgeMs }) {
  const dir = await tmpProject(t);
  await fs.mkdir(path.join(dir, '.aioson', 'agents'), { recursive: true });
  await fs.writeFile(path.join(dir, '.aioson', 'agents', 'dev.md'), '# @dev\n\nRun `aioson context:brief . --agent=dev` before the work.\n', 'utf8');
  const { db, runtimeDir } = await openRuntimeDb(dir);
  try {
    const sessionKey = `hooks-dev-${Date.now()}`;
    const taskKey = startTask(db, { title: '[hooks] dev via claude', status: 'running', createdBy: '@dev', sessionKey });
    const runKey = startRun(db, { taskKey, agentName: '@dev', agentKind: 'official', sessionKey, source: 'live', title: '[hooks] dev via claude' });
    appendRunEvent(db, { runKey, eventType: 'brief_built', phase: 'context', message: 'brief', payload: { generic_task: false }, createdAt: new Date(Date.now() - briefAgeMs).toISOString() });
    await writeAgentSession(runtimeDir, '@dev', { runKey, taskKey, sessionKey, startedAt: new Date(Date.now() - sessionAgeMs).toISOString(), finished: false, source: 'live' });
  } finally {
    db.close();
  }
  const stdout = agentDone(dir, 'dev', ['--json']);
  return JSON.parse(stdout.slice(stdout.indexOf('{')));
}

test('a brief from four days ago does not count for a hooks session opened a week ago', async (t) => {
  const result = await liveSessionWithBrief(t, { sessionAgeMs: 7 * DAY, briefAgeMs: 4 * DAY });
  assert.equal(result.mode, 'live_event');
  assert.equal(result.context_brief.state, 'not_consulted');
  assert.ok(Date.now() - Date.parse(result.context_brief.since) <= DAY + 60 * 1000, result.context_brief.since);
});

test('a brief inside the last day still counts for that same old session', async (t) => {
  const result = await liveSessionWithBrief(t, { sessionAgeMs: 7 * DAY, briefAgeMs: 2 * 60 * 60 * 1000 });
  assert.equal(result.context_brief.state, 'consulted');
});
