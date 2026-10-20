'use strict';

// agent:done closes the agent's run and then runs memory reflection. In a
// project without bootstrap/ (every project that never ran /discover) the
// reflection logs `memory_reflect_skipped`, and logAgentEvent auto-started a
// fresh task + run for it that nobody ever finished: one ghost "running" agent
// per agent:done, ten after a single feature cycle.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const Database = require('better-sqlite3');

const { openRuntimeDb, logAgentEvent } = require('../src/runtime-store');
const { runMemoryReflectPrepare, REFLECT_PROMPT_RELATIVE } = require('../src/commands/memory-reflect-prepare');
const { runMemoryReflectCommit } = require('../src/commands/memory-reflect-commit');

const BIN = path.join(__dirname, '..', 'bin', 'aioson.js');

async function tmpProject() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-ghost-run-'));
  await fs.mkdir(path.join(dir, '.aioson', 'context'), { recursive: true });
  return dir;
}

function running(dir) {
  const db = new Database(path.join(dir, '.aioson', 'runtime', 'aios.sqlite'), { readonly: true });
  try {
    return {
      tasks: db.prepare("SELECT count(*) AS n FROM tasks WHERE status = 'running'").get().n,
      runs: db.prepare("SELECT count(*) AS n FROM agent_runs WHERE status = 'running'").get().n
    };
  } finally {
    db.close();
  }
}

test('memory reflection after the run closed attaches to that run instead of opening a ghost one', async () => {
  const dir = await tmpProject();
  const { db, runtimeDir } = await openRuntimeDb(dir);
  let closed;
  try {
    await logAgentEvent(db, runtimeDir, { agentName: 'quality', message: 'assessment started' });
    closed = await logAgentEvent(db, runtimeDir, { agentName: 'quality', message: 'done', finish: true, summary: 'done' });
  } finally {
    db.close();
  }
  assert.deepEqual(running(dir), { tasks: 0, runs: 0 });

  const result = await runMemoryReflectPrepare({ args: [dir], options: { agent: 'quality', json: true }, logger: { log() {}, error() {} } });
  assert.equal(result.reason, 'missing_bootstrap');
  assert.deepEqual(running(dir), { tasks: 0, runs: 0 }, 'the skipped-reflection event opened a run nobody finishes');

  const check = new Database(path.join(dir, '.aioson', 'runtime', 'aios.sqlite'), { readonly: true });
  try {
    const event = check.prepare("SELECT run_key FROM agent_events WHERE event_type = 'memory_reflect_skipped'").get();
    assert.equal(event && event.run_key, closed.runKey, 'the event is kept on the closed run');
  } finally {
    check.close();
  }
});

test('memory:reflect-commit after the run closed attaches to that run instead of opening a ghost one', async () => {
  const dir = await tmpProject();
  await fs.mkdir(path.join(dir, '.aioson', 'context', 'bootstrap'), { recursive: true });
  const { db, runtimeDir } = await openRuntimeDb(dir);
  let closed;
  try {
    await logAgentEvent(db, runtimeDir, { agentName: 'dev', message: 'implementation started' });
    closed = await logAgentEvent(db, runtimeDir, { agentName: 'dev', message: 'done', finish: true, summary: 'done' });
  } finally {
    db.close();
  }
  // The manifest agent:done leaves behind; the agent then commits an output that fails validation.
  await fs.writeFile(path.join(dir, REFLECT_PROMPT_RELATIVE), JSON.stringify({ snapshot_hash: 'x', targets: [], allowed_paths: [] }));
  const result = await runMemoryReflectCommit({ args: [dir], options: { agent: 'dev', json: true, files: { '../escape.md': 'x' } }, logger: { log() {}, error() {} } });
  assert.equal(result.error, 'validation_failed');
  assert.deepEqual(running(dir), { tasks: 0, runs: 0 }, 'the commit event opened a run nobody finishes');

  const check = new Database(path.join(dir, '.aioson', 'runtime', 'aios.sqlite'), { readonly: true });
  try {
    const event = check.prepare("SELECT run_key FROM agent_events WHERE event_type = 'memory_reflect_failed'").get();
    assert.equal(event && event.run_key, closed.runKey, 'the event is kept on the closed run');
  } finally {
    check.close();
  }
});

test('agent:done leaves no running task or run behind', async () => {
  const dir = await tmpProject();
  const r = spawnSync(process.execPath, [BIN, 'agent:done', dir, '--agent=quality', '--summary=Quality assessment: probe'], { encoding: 'utf8', cwd: dir });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.deepEqual(running(dir), { tasks: 0, runs: 0 });
});
