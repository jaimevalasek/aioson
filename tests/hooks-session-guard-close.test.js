'use strict';

// session:guard closed an idle session with `updateRun(db, runKey, {...})` and
// `updateTask(db, taskKey, {...})`, while the store takes one options object:
// "Run not found: undefined" — the run stayed running, the session file stayed,
// and the polling loop appended another `session_ended` row every 30 s, now on
// the session file hooks:emit and agent:done share (`@dev.json`).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { openRuntimeDb } = require('../src/runtime-store');

const CLI = path.join(__dirname, '..', 'bin', 'aioson.js');

test('session:guard --idle-minutes=0 closes the idle session: run and task completed, session file gone', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-guard-close-'));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-guard-close-home-'));
  t.after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  });
  fs.mkdirSync(path.join(dir, '.aioson'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.aioson', 'config.md'), '# project\n', 'utf8');
  const env = { ...process.env, HOME: home, USERPROFILE: home, AIOSON_OPERATOR_MEMORY: 'false' };
  delete env.AIOSON_LIVE_SESSION;
  delete env.AIOSON_LIVE_SESSION_KEY;
  const guard = (extra = []) => spawnSync(process.execPath, [CLI, 'session:guard', dir, '--agent=dev', '--tool=claude', '--once', ...extra], { env, encoding: 'utf8' });

  const started = guard();
  assert.equal(started.status, 0, started.stderr);
  const sessionFile = path.join(dir, '.aioson', 'runtime', '.sessions', '@dev.json');
  const { runKey, taskKey, sessionKey } = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
  // The last recorded activity, long ago: the session is idle whatever the clock says.
  fs.writeFileSync(path.join(dir, '.aioson', 'runtime', 'live', sessionKey, 'events.ndjson'), `${JSON.stringify({ ts: '2020-01-01T00:00:00.000Z', type: 'artifact' })}\n`, 'utf8');

  const closed = guard(['--idle-minutes=0']);
  assert.equal(closed.status, 0, closed.stderr);
  assert.equal(fs.existsSync(sessionFile), false, 'the session file is cleared');
  const { db } = await openRuntimeDb(dir, { mustExist: true });
  try {
    assert.equal(db.prepare('SELECT status FROM agent_runs WHERE run_key = ?').get(runKey).status, 'completed');
    assert.equal(db.prepare('SELECT status FROM tasks WHERE task_key = ?').get(taskKey).status, 'completed');
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM agent_events WHERE run_key = ? AND event_type = 'session_ended'").get(runKey).n, 1);
  } finally {
    db.close();
  }
  const state = JSON.parse(fs.readFileSync(path.join(dir, '.aioson', 'runtime', 'live', sessionKey, 'state.json'), 'utf8'));
  assert.equal(state.status, 'closed');
});
