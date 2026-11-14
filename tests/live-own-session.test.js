'use strict';

/**
 * A session the caller owns (`live:start --session=<key> --own-session`) is
 * what lets a launcher keep several sessions in one folder: it is created
 * under its key, found by that key alone, and opening or closing it leaves
 * every other session of the folder — and the label pointer — as they were.
 * The Play's contract for this is `.aioson/docs/integrations/play-session-contract.md`
 * in the Play repository (feature parallel-sessions, AC-parallel-sessions-13,
 * -17, -18 and the AIOSON side of -25).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createTranslator } = require('../src/i18n');
const {
  runLiveStart,
  runLiveStatus,
  runLiveHandoff,
  runLiveClose,
  runLiveList,
  runRuntimeEmit,
  resolveLivePaths
} = require('../src/commands/live');
const { readAgentSession, resolveRuntimePaths } = require('../src/runtime-store');
const { bindSessionFeature, readSessionFeature, SESSION_FEATURE_FILE } = require('../src/lib/session-feature');
const { parseArgv } = require('../src/parser');

const { t } = createTranslator('en');
const silent = { log() {}, error() {} };
const LABEL = '@aioson';

async function makeProject(t0) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-live-own-'));
  t0.after(() => fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  return dir;
}

// `--tool-bin` is the node running the suite: no harness has to be installed.
function startOptions(extra = {}) {
  return { tool: 'claude', 'tool-bin': process.execPath, 'no-launch': true, json: true, 'no-health-check': true, 'no-health': true, ...extra };
}

function openOwn(dir, key, extra = {}) {
  return runLiveStart({ args: [dir], options: startOptions({ session: key, 'own-session': true, ...extra }), logger: silent, t });
}

function openByLabel(dir, extra = {}) {
  return runLiveStart({ args: [dir], options: startOptions(extra), logger: silent, t });
}

function status(dir, options = {}) {
  return runLiveStatus({ args: [dir], options: { json: true, ...options }, logger: silent, t });
}

function close(dir, options = {}) {
  return runLiveClose({ args: [dir], options: { json: true, 'no-health': true, ...options }, logger: silent, t });
}

function keyEnv(key) {
  return { AIOSON_LIVE_SESSION_KEY: key, AIOSON_LIVE_SESSION: key };
}

test('AC-parallel-sessions-17 two own sessions of the same tool open in one folder, each under the key it was given', async (t0) => {
  const dir = await makeProject(t0);
  const first = await openOwn(dir, 'play-session-one');
  const second = await openOwn(dir, 'play-session-two');

  assert.equal(first.sessionKey, 'play-session-one');
  assert.equal(second.sessionKey, 'play-session-two');
  assert.equal(first.ownSession, true);
  assert.deepEqual([first.reused, second.reused], [false, false], 'the second start never reuses the first session');
  assert.notEqual(first.runKey, second.runKey);

  const firstStatus = await status(dir, { session: 'play-session-one' });
  const secondStatus = await status(dir, { session: 'play-session-two' });
  assert.deepEqual(
    [firstStatus.sessionKey, firstStatus.open, firstStatus.run.run_key, firstStatus.ownSession],
    ['play-session-one', true, first.runKey, true]
  );
  assert.deepEqual(
    [secondStatus.sessionKey, secondStatus.open, secondStatus.run.run_key],
    ['play-session-two', true, second.runKey]
  );

  const list = await runLiveList({ args: [dir], options: { json: true }, logger: silent, t });
  assert.deepEqual(
    list.sessions.filter((entry) => entry.phase === 'active').map((entry) => entry.sessionKey).sort(),
    ['play-session-one', 'play-session-two']
  );
});

test('AC-parallel-sessions-13 an own session of another tool does not close the one already open', async (t0) => {
  const dir = await makeProject(t0);
  const claude = await openOwn(dir, 'play-claude-1', { tool: 'claude' });
  const codex = await openOwn(dir, 'play-codex-1', { tool: 'codex' });

  const claudeStatus = await status(dir, { session: claude.sessionKey });
  const codexStatus = await status(dir, { session: codex.sessionKey });
  assert.deepEqual([claudeStatus.open, claudeStatus.tool, claudeStatus.run.status], [true, 'claude', 'running']);
  assert.deepEqual([codexStatus.open, codexStatus.tool, codexStatus.run.status], [true, 'codex', 'running']);
});

test('AC-parallel-sessions-13 live:close --session closes the session asked for and no other', async (t0) => {
  const dir = await makeProject(t0);
  await openOwn(dir, 'play-session-one');
  await openOwn(dir, 'play-session-two');

  const closed = await close(dir, { session: 'play-session-one' });
  assert.deepEqual([closed.closed, closed.sessionKey], [true, 'play-session-one']);

  const first = await status(dir, { session: 'play-session-one' });
  const second = await status(dir, { session: 'play-session-two' });
  assert.deepEqual([first.open, first.phase], [false, 'closed']);
  assert.deepEqual([second.open, second.phase, second.run.status], [true, 'active', 'running']);

  await assert.rejects(() => close(dir, { session: 'play-session-one' }), /already closed/);
  await assert.rejects(() => close(dir, { session: 'play-never-opened' }), /No live session found with key play-never-opened/);
  assert.equal((await status(dir, { session: 'play-session-two' })).open, true, 'a refused close changes nothing');
});

test('AC-parallel-sessions-18 an own session leaves the label pointer alone when it opens and when it closes', async (t0) => {
  const dir = await makeProject(t0);
  const { runtimeDir } = resolveRuntimePaths(dir);

  await openOwn(dir, 'play-session-one');
  assert.equal(await readAgentSession(runtimeDir, LABEL), null, 'an own session writes no label pointer');

  const byLabel = await openByLabel(dir);
  const pointer = await readAgentSession(runtimeDir, LABEL);
  assert.equal(pointer.sessionKey, byLabel.sessionKey);

  await openOwn(dir, 'play-session-two');
  assert.deepEqual(await readAgentSession(runtimeDir, LABEL), pointer, 'opening an own session does not rewrite it');

  await close(dir, { session: 'play-session-two' });
  await close(dir, { session: 'play-session-one' });
  assert.deepEqual(await readAgentSession(runtimeDir, LABEL), pointer, 'closing by key does not clear the pointer of another session');
  assert.equal((await status(dir, { session: byLabel.sessionKey })).open, true);

  await close(dir, { session: byLabel.sessionKey });
  assert.equal(await readAgentSession(runtimeDir, LABEL), null, 'closing by key clears the pointer that names that very session');
});

test('AC-parallel-sessions-18 a start, a status and a close by label never land on an own session', async (t0) => {
  const dir = await makeProject(t0);
  const own = await openOwn(dir, 'play-session-one', { tool: 'claude' });

  // Without the guard this start found the own session by its label, saw
  // another tool and closed it ("tool changed").
  const byLabel = await openByLabel(dir, { tool: 'codex' });
  assert.equal(byLabel.reused, false);
  assert.notEqual(byLabel.sessionKey, own.sessionKey);
  assert.equal((await status(dir, { session: own.sessionKey })).open, true, 'the own session is still open');

  await close(dir, { session: byLabel.sessionKey });
  assert.equal((await status(dir)).sessionKey, byLabel.sessionKey, 'the folder\'s latest session is never the own one');
  await assert.rejects(() => close(dir), /already closed/, 'a close without a key finds the label session, never the own one');
  await assert.rejects(() => close(dir, { agent: 'aioson' }), /No live session found for @aioson|already closed/);
  assert.equal((await status(dir, { session: own.sessionKey })).open, true);
});

test('live:start --own-session refuses a missing, malformed, reused key and tmux', async (t0) => {
  const dir = await makeProject(t0);

  await assert.rejects(
    () => runLiveStart({ args: [dir], options: startOptions({ 'own-session': true }), logger: silent, t }),
    /--own-session requires --session=<key>/
  );
  for (const key of ['short', '-leading-dash', '../escape-the-live-dir', 'has space inside', 'x'.repeat(129)]) {
    await assert.rejects(() => openOwn(dir, key), /Invalid session key/, key);
  }

  await openOwn(dir, 'play-session-one');
  await assert.rejects(() => openOwn(dir, 'play-session-one'), /already used in this project/);
  await close(dir, { session: 'play-session-one' });
  await assert.rejects(() => openOwn(dir, 'play-session-one'), /already used in this project/, 'a closed session does not free its key');

  await assert.rejects(() => openOwn(dir, 'play-session-tmux', { tmux: true }), /cannot be combined with --tmux/);
});

test('--own-session parses as a switch and never swallows the folder', () => {
  const parsed = parseArgv(['node', 'aioson', 'live:start', '--tool=claude', '--session=play-session-one', '--own-session', '.']);
  assert.equal(parsed.options['own-session'], true);
  assert.equal(parsed.options.session, 'play-session-one');
  assert.deepEqual(parsed.args, ['.']);
});

test('AC-parallel-sessions-17 an event emitted inside one own session is recorded in that session only', async (t0) => {
  const dir = await makeProject(t0);
  await openOwn(dir, 'play-session-one');
  await openOwn(dir, 'play-session-two');

  const previous = { key: process.env.AIOSON_LIVE_SESSION_KEY, name: process.env.AIOSON_LIVE_SESSION };
  process.env.AIOSON_LIVE_SESSION_KEY = 'play-session-two';
  process.env.AIOSON_LIVE_SESSION = 'play-session-two';
  try {
    await runRuntimeEmit({
      args: [dir],
      options: { agent: 'dev', type: 'milestone', summary: 'only the second session did this', json: true },
      logger: silent,
      t
    });
  } finally {
    if (previous.key === undefined) delete process.env.AIOSON_LIVE_SESSION_KEY; else process.env.AIOSON_LIVE_SESSION_KEY = previous.key;
    if (previous.name === undefined) delete process.env.AIOSON_LIVE_SESSION; else process.env.AIOSON_LIVE_SESSION = previous.name;
  }

  const first = await status(dir, { session: 'play-session-one' });
  const second = await status(dir, { session: 'play-session-two' });
  assert.equal(first.recentEvents.some((event) => event.type === 'milestone'), false);
  assert.equal(second.recentEvents.filter((event) => event.type === 'milestone').length, 1);
});

/** Runs `work` as a command the tool of that session would run: its key in the environment. */
async function insideSession(key, work) {
  const previous = { key: process.env.AIOSON_LIVE_SESSION_KEY, name: process.env.AIOSON_LIVE_SESSION };
  Object.assign(process.env, keyEnv(key));
  try {
    return await work();
  } finally {
    if (previous.key === undefined) delete process.env.AIOSON_LIVE_SESSION_KEY; else process.env.AIOSON_LIVE_SESSION_KEY = previous.key;
    if (previous.name === undefined) delete process.env.AIOSON_LIVE_SESSION; else process.env.AIOSON_LIVE_SESSION = previous.name;
  }
}

function handoff(dir, options = {}) {
  return runLiveHandoff({ args: [dir], options: { agent: LABEL, to: '@dev', json: true, ...options }, logger: silent, t });
}

test('AC-parallel-sessions-13 the agent inside an own session hands that session over and no other', async (t0) => {
  const dir = await makeProject(t0);
  const { runtimeDir } = resolveRuntimePaths(dir);
  const first = await openOwn(dir, 'play-session-one');
  const second = await openOwn(dir, 'play-session-two');
  const byLabel = await openByLabel(dir);
  const pointer = await readAgentSession(runtimeDir, LABEL);

  const handed = await insideSession('play-session-two', () => handoff(dir));
  assert.deepEqual(
    [handed.ok, handed.sessionKey, handed.previousRunKey, handed.nextAgent, handed.open],
    [true, 'play-session-two', second.runKey, '@dev', true]
  );

  // The session has a new run under the same key: what the Play's watcher reads as an agent swap.
  const after = await status(dir, { session: 'play-session-two' });
  assert.deepEqual([after.open, after.run.run_key, after.run.agent_name], [true, handed.runKey, '@dev']);
  assert.notEqual(handed.runKey, second.runKey);

  // The other own session and the session found by this very label are as they were.
  const untouched = await status(dir, { session: 'play-session-one' });
  assert.deepEqual([untouched.open, untouched.run.run_key, untouched.run.agent_name], [true, first.runKey, LABEL]);
  const labelled = await status(dir, { session: byLabel.sessionKey });
  assert.deepEqual([labelled.open, labelled.run.run_key], [true, byLabel.runKey]);
  assert.deepEqual(await readAgentSession(runtimeDir, LABEL), pointer, 'the label pointer still names the label session');
  assert.equal(await readAgentSession(runtimeDir, '@dev'), null, 'an own session writes no pointer for the next agent');
});

test('AC-parallel-sessions-13 live:handoff --session hands over the session asked for, and a label never reaches an own one', async (t0) => {
  const dir = await makeProject(t0);
  const first = await openOwn(dir, 'play-session-one');
  await openOwn(dir, 'play-session-two');

  // From outside any session, the label finds no own session.
  await assert.rejects(() => handoff(dir), /No active live session found for @aioson/);

  const handed = await handoff(dir, { session: 'play-session-one' });
  assert.deepEqual([handed.sessionKey, handed.previousRunKey], ['play-session-one', first.runKey]);
  assert.equal((await status(dir, { session: 'play-session-two' })).run.agent_name, LABEL);

  await assert.rejects(() => handoff(dir, { session: 'play-never-opened' }), /No live session found with key play-never-opened/);
  // The agent named must be the one the session is on.
  await assert.rejects(() => handoff(dir, { session: 'play-session-two', agent: '@qa', to: '@dev' }), /No active live session found for @qa/);
});

test('a session found by label is handed over by its label as before, inside it or not', async (t0) => {
  const dir = await makeProject(t0);
  const { runtimeDir } = resolveRuntimePaths(dir);
  const byLabel = await openByLabel(dir);

  const handed = await insideSession(byLabel.sessionKey, () => handoff(dir));
  assert.deepEqual([handed.sessionKey, handed.previousRunKey], [byLabel.sessionKey, byLabel.runKey]);
  assert.equal(await readAgentSession(runtimeDir, LABEL), null, 'the pointer left the old label');
  assert.equal((await readAgentSession(runtimeDir, '@dev')).runKey, handed.runKey, 'and names the session under the next one');
});

test('AC-parallel-sessions-25 the feature of a session is kept beside its state and read back by live:status --session', async (t0) => {
  const dir = await makeProject(t0);
  const { runtimeDir } = resolveRuntimePaths(dir);
  const born = await openOwn(dir, 'play-session-one', { feature: 'checkout' });
  await openOwn(dir, 'play-session-two');

  assert.equal(born.feature, 'checkout');
  assert.equal((await status(dir, { session: 'play-session-one' })).feature, 'checkout');
  assert.equal((await status(dir, { session: 'play-session-two' })).feature, null);

  const bound = await bindSessionFeature(dir, 'billing', { env: keyEnv('play-session-two'), source: 'test' });
  assert.deepEqual([bound.bound, bound.feature, bound.previous], [true, 'billing', null]);
  assert.equal((await status(dir, { session: 'play-session-two' })).feature, 'billing');
  assert.equal((await status(dir, { session: 'play-session-one' })).feature, 'checkout', 'the other session keeps its own');

  // The feature has a file of its own: an event rewriting state.json keeps it.
  const { sessionDir, statePath } = resolveLivePaths(runtimeDir, 'play-session-two');
  const record = JSON.parse(await fs.readFile(path.join(sessionDir, SESSION_FEATURE_FILE), 'utf8'));
  assert.deepEqual([record.session_key, record.feature, record.bound_by], ['play-session-two', 'billing', 'test']);
  assert.equal(Object.hasOwn(JSON.parse(await fs.readFile(statePath, 'utf8')), 'feature'), false);
});

test('AC-parallel-sessions-25 a key binds nothing once its session is closed, in another project, or when it is not a slug', async (t0) => {
  const dir = await makeProject(t0);
  const other = await makeProject(t0);
  await openOwn(dir, 'play-session-one');
  await openOwn(other, 'play-other-project');

  assert.deepEqual(await readSessionFeature(dir, {}), null, 'no key in the environment: outside a live session');
  assert.deepEqual(await readSessionFeature(dir, { AIOSON_LIVE_SESSION: 'none' }), null, 'a lane worker owns no session');
  assert.equal((await bindSessionFeature(dir, 'checkout', { env: {} })).bound, false);
  assert.equal((await bindSessionFeature(dir, 'checkout', { env: keyEnv('play-other-project') })).bound, false, 'a session of another project');
  assert.equal((await bindSessionFeature(dir, '../escape', { env: keyEnv('play-session-one') })).bound, false);
  assert.equal((await bindSessionFeature(dir, true, { env: keyEnv('play-session-one') })).bound, false, 'a bare --feature names nothing');

  assert.equal((await bindSessionFeature(dir, 'checkout', { env: keyEnv('play-session-one') })).bound, true);
  assert.deepEqual(await readSessionFeature(dir, keyEnv('play-session-one')), { sessionKey: 'play-session-one', feature: 'checkout' });

  await close(dir, { session: 'play-session-one' });
  assert.equal(await readSessionFeature(dir, keyEnv('play-session-one')), null, 'a closed session answers for nothing');
  assert.equal((await bindSessionFeature(dir, 'billing', { env: keyEnv('play-session-one') })).bound, false);
});
