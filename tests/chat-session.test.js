'use strict';

// Two chats on one folder, each opened straight in its host (no live:start).
// project-pulse.md `active_feature` is one per project: the chat that ran
// `pulse:update --feature` last answered "which feature is mine?" for both —
// feature:current, the observation tag, context:select — and the other chat
// continued that feature as its own. Every host measured names its chat to
// the commands it runs (TOOL_CAPS `chat_env`); each chat now keeps its own.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { TOOL_CAPS } = require('../src/lib/tool-capabilities');
const {
  resolveChatIdentity,
  writeChatFeature,
  readChatRecord,
  otherActiveChats,
  CHAT_ACTIVE_WINDOW_MS,
  CHAT_RECORD_RETENTION_MS
} = require('../src/lib/chat-session');
const { readSessionFeature, featureNamedByCommands } = require('../src/lib/session-feature');
const { resolveActiveFeature } = require('../src/commands/feature-current');

const CLI = path.join(__dirname, '..', 'bin', 'aioson.js');

function makeProject(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-chat-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const ctx = path.join(dir, '.aioson', 'context');
  fs.mkdirSync(ctx, { recursive: true });
  fs.writeFileSync(path.join(ctx, 'project.context.md'), '---\nproject_name: chat-test\nframework: node\n---\n');
  writeFeatures(dir, [['alpha', 'in_progress'], ['beta', 'in_progress']]);
  return dir;
}

function writeFeatures(dir, rows) {
  fs.writeFileSync(path.join(dir, '.aioson', 'context', 'features.md'), [
    '# Features',
    '',
    '| slug | status | started | completed |',
    '|------|--------|---------|-----------|',
    ...rows.map(([slug, status]) => `| ${slug} | ${status} | 2026-11-26 | — |`),
    ''
  ].join('\n'));
}

// The environment of a shell command one host's chat runs, nothing inherited.
function hostEnv(vars) {
  const env = { ...process.env };
  for (const caps of Object.values(TOOL_CAPS)) for (const name of caps.chat_env || []) delete env[name];
  delete env.AIOSON_LIVE_SESSION;
  delete env.AIOSON_LIVE_SESSION_KEY;
  return { ...env, ...vars };
}

function aioson(dir, env, argv) {
  const result = spawnSync(process.execPath, [CLI, argv[0], dir, ...argv.slice(1)], { env, encoding: 'utf8' });
  assert.equal(result.status, 0, `${argv.join(' ')}\n${result.stdout}\n${result.stderr}`);
  return result;
}

const json = (result) => JSON.parse(result.stdout);

test('AC-parallel-sessions-28 the four measured hosts name their chat, and an unmeasured one names none', () => {
  for (const host of ['claude', 'codex', 'opencode', 'agy', 'antigravity']) {
    assert.ok(Array.isArray(TOOL_CAPS[host].chat_env) && TOOL_CAPS[host].chat_env.length > 0, host);
  }
  const claude = resolveChatIdentity({ CLAUDE_CODE_SESSION_ID: '48bd5665-87c9-4677-b8d1-74f8990224ad' });
  assert.match(claude.key, /^[a-f0-9]{16}$/);
  assert.deepEqual(claude.hosts, ['claude']);
  assert.equal(resolveChatIdentity({ CLAUDE_CODE_SESSION_ID: '48bd5665-87c9-4677-b8d1-74f8990224ad' }).key, claude.key, 'stable for one chat');
  assert.notEqual(resolveChatIdentity({ CLAUDE_CODE_SESSION_ID: '35c213ef-1f3d-4f6b-8173-962d7e4ff85c' }).key, claude.key, 'another chat, another key');

  // Codex sets both names to the thread id; the older one alone is the same chat.
  const codex = resolveChatIdentity({ CODEX_THREAD_ID: '01a218e6', CODEX_SESSION_ID: '01a218e6' });
  assert.equal(resolveChatIdentity({ CODEX_SESSION_ID: '01a218e6' }).key, codex.key);
  assert.deepEqual(codex.hosts, ['codex']);
  // agy and antigravity are one binary: one variable, one host.
  assert.deepEqual(resolveChatIdentity({ ANTIGRAVITY_CONVERSATION_ID: '6d250e64' }).hosts, ['agy']);
  // OpenCode exports no session id: the chat is the host process.
  assert.deepEqual(resolveChatIdentity({ OPENCODE: '1', OPENCODE_PID: '46552' }).hosts, ['opencode']);

  assert.equal(resolveChatIdentity({}), null, 'a terminal of its own');
  assert.equal(resolveChatIdentity({ OPENCODE: '1' }), null, 'a flag is no name');
  assert.equal(resolveChatIdentity({ CLAUDE_CODE_SESSION_ID: 'x'.repeat(600) }), null);
});

test('AC-parallel-sessions-28 a Codex started from a Claude Code chat inherits its id and still is a chat of its own', () => {
  // Measured: the inner host keeps the outer CLAUDE_CODE_SESSION_ID and adds its own.
  const outer = resolveChatIdentity({ CLAUDE_CODE_SESSION_ID: 'outer' });
  const innerOne = resolveChatIdentity({ CLAUDE_CODE_SESSION_ID: 'outer', CODEX_THREAD_ID: 'one' });
  const innerTwo = resolveChatIdentity({ CLAUDE_CODE_SESSION_ID: 'outer', CODEX_THREAD_ID: 'two' });
  assert.notEqual(innerOne.key, outer.key);
  assert.notEqual(innerOne.key, innerTwo.key);
  assert.deepEqual(innerOne.hosts, ['claude', 'codex']);
});

test('AC-parallel-sessions-28 end to end: two chats of two hosts each keep their own feature; a third that named none is told whose the pulse is', (t) => {
  const dir = makeProject(t);
  const chatA = hostEnv({ CLAUDE_CODE_SESSION_ID: 'chat-a' });
  const chatB = hostEnv({ CODEX_THREAD_ID: 'chat-b', CODEX_SESSION_ID: 'chat-b' });
  const chatC = hostEnv({ ANTIGRAVITY_CONVERSATION_ID: 'chat-c' });
  const terminal = hostEnv({});

  aioson(dir, chatA, ['pulse:update', '--agent=dev', '--feature=alpha', '--action=phase 1']);
  const moved = aioson(dir, chatB, ['pulse:update', '--agent=dev', '--feature=beta', '--action=cards', '--json']);
  assert.equal(json(moved).active_feature, 'beta', 'the pulse still moves: it is the project record');
  assert.equal(json(moved).other_chat.feature, 'alpha', 'and says the feature it left is another chat\'s');
  assert.deepEqual(json(moved).other_chat.hosts, ['claude']);

  // Before: both chats answered beta, the pulse's last writer.
  const a = json(aioson(dir, chatA, ['feature:current', '--json']));
  assert.equal(a.slug, 'alpha');
  assert.equal(a.source, 'chat');
  const b = json(aioson(dir, chatB, ['feature:current', '--json']));
  assert.equal(b.slug, 'beta');
  assert.equal(b.source, 'chat');

  // A chat that named none is never handed another chat's front.
  const c = json(aioson(dir, chatC, ['feature:current', '--json']));
  assert.equal(c.slug, '');
  assert.equal(c.ambiguous, true);
  assert.equal(c.held_by_other_chat.feature, 'beta');
  assert.deepEqual(c.held_by_other_chat.hosts, ['codex']);
  const plain = aioson(dir, chatC, ['feature:current']);
  assert.equal(plain.stdout, '', 'stdout stays usable in $(...)');
  assert.match(plain.stderr, /names beta, the front of a codex chat, last seen \d+ min ago on this folder; this chat named none — ask which feature it continues/);

  // A terminal no host names reads the pulse, as it always did.
  assert.equal(json(aioson(dir, terminal, ['feature:current', '--json'])).slug, 'beta');

  // What the other readers answer now follows the chat, not the last writer.
  assert.equal(json(aioson(dir, chatA, ['context:select', '--agent=dev', '--task=continue the work', '--json'])).active_feature, 'alpha');
  assert.equal(json(aioson(dir, chatC, ['context:select', '--agent=dev', '--task=continue the work', '--json'])).active_feature, null);
  aioson(dir, chatA, ['observe', '--kind=defect', '--summary=a defect seen while on alpha']);
  const observations = JSON.parse(fs.readFileSync(path.join(dir, '.aioson', 'context', 'observations.json'), 'utf8'));
  const items = Array.isArray(observations) ? observations : observations.items;
  assert.equal(items.find((item) => item.summary === 'a defect seen while on alpha').feature, 'alpha', 'tagged with the observer\'s feature, not the pulse\'s');

  // The records live under the runtime, one per chat.
  const records = fs.readdirSync(path.join(dir, '.aioson', 'runtime', 'chats')).filter((name) => name.endsWith('.json'));
  assert.equal(records.length, 2);

  // A folder aioson was never installed in gets nothing.
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-bare-'));
  t.after(() => fs.rmSync(bare, { recursive: true, force: true }));
  spawnSync(process.execPath, [CLI, 'context:brief', bare, '--agent=dev', '--feature=alpha', '--json'], { env: chatA, encoding: 'utf8' });
  assert.equal(fs.existsSync(path.join(bare, '.aioson', 'runtime', 'chats')), false);
});

test('AC-parallel-sessions-28 workflow:next of each chat binds its own feature instead of aborting on the other chat\'s pulse', (t) => {
  const dir = makeProject(t);
  fs.writeFileSync(path.join(dir, '.aioson', 'context', 'project.context.md'), '---\nproject_name: "chat-test"\nproject_type: "web_app"\nclassification: "SMALL"\ninteraction_language: "en"\n---\n# Project Context\n');
  const chatA = hostEnv({ CLAUDE_CODE_SESSION_ID: 'chat-a' });
  const chatB = hostEnv({ OPENCODE: '1', OPENCODE_PID: '4242' });

  aioson(dir, chatA, ['pulse:update', '--agent=dev', '--feature=alpha']);
  aioson(dir, chatB, ['pulse:update', '--agent=dev', '--feature=beta']);
  // Before: chat A met `Workflow binding mismatch` — the pulse was chat B's.
  const a = json(aioson(dir, chatA, ['workflow:next', '--expect-feature=alpha', '--json']));
  assert.equal(a.featureSlug || (a.state && a.state.featureSlug), 'alpha', JSON.stringify(a).slice(0, 400));
  assert.equal(a.binding.registry_source, 'chat');
  const b = json(aioson(dir, chatB, ['workflow:next', '--expect-feature=beta', '--json']));
  assert.equal(b.featureSlug || (b.state && b.state.featureSlug), 'beta');
  assert.equal(b.binding.moved.from, 'alpha', 'the binding is still one per project: it moves, and alpha\'s progress waits archived');
});

test('AC-parallel-sessions-28 a chat whose feature closed, or another chat gone quiet, gives the pulse back', async (t) => {
  const dir = makeProject(t);
  const mine = resolveChatIdentity({ CLAUDE_CODE_SESSION_ID: 'mine' });
  const other = resolveChatIdentity({ CODEX_THREAD_ID: 'other' });
  fs.writeFileSync(path.join(dir, '.aioson', 'context', 'project-pulse.md'), '---\nactive_feature: beta\n---\n');
  const env = { CLAUDE_CODE_SESSION_ID: 'mine' };

  // No record anywhere: the pulse answers.
  assert.equal((await resolveActiveFeature(dir, { env })).slug, 'beta');
  assert.deepEqual(await readSessionFeature(dir, env), { sessionKey: `chat:${mine.key}`, feature: null, chat: mine });

  // Another chat is on beta, seen an hour ago: not mine.
  const now = Date.now();
  await writeChatFeature(dir, other, 'beta', { now: now - 60 * 60 * 1000 });
  const held = await resolveActiveFeature(dir, { env });
  assert.equal(held.ambiguous, true);
  assert.deepEqual(held.candidates, ['alpha', 'beta']);
  assert.equal((await otherActiveChats(dir, mine.key))[0].minutes_ago, 60);

  // Quiet past the window: its pointer is history.
  await writeChatFeature(dir, other, 'beta', { now: now - CHAT_ACTIVE_WINDOW_MS - 60000 });
  assert.equal((await resolveActiveFeature(dir, { env })).slug, 'beta');

  // My own feature, once closed, is mine no longer.
  await writeChatFeature(dir, mine, 'alpha', { now });
  assert.equal((await resolveActiveFeature(dir, { env })).source, 'chat');
  writeFeatures(dir, [['alpha', 'done'], ['beta', 'in_progress']]);
  assert.equal((await resolveActiveFeature(dir, { env })).slug, 'beta');

  // A record of a chat that ended two weeks ago goes at the next write.
  await writeChatFeature(dir, other, 'beta', { now: now - CHAT_RECORD_RETENTION_MS - 60000 });
  await writeChatFeature(dir, mine, 'alpha', { now });
  assert.equal(await readChatRecord(dir, other.key), null);
  assert.equal((await readChatRecord(dir, mine.key)).feature, 'alpha');
});

test('AC-parallel-sessions-28 a command aimed at another folder names that folder\'s front, not this chat\'s', (t) => {
  const dir = makeProject(t);
  const other = path.join(path.dirname(dir), 'some-other-app');
  const named = (commands) => featureNamedByCommands(commands, { targetDir: dir });
  assert.equal(named([`$ node bin/aioson.js context:brief ${other} --agent=dev --feature=elsewhere`]), null);
  assert.equal(named([`$ cd ${other} && aioson dev:state:write . --feature=elsewhere --next=x`]), null);
  assert.equal(named([`$ cd ${other} && aioson dev:state:write ${dir} --feature=here --next=x`]), 'here');
  assert.equal(named(['$ aioson context:brief --agent=dev --feature=here']), 'here', 'no project argument: this folder');
  assert.equal(named(['$ cd src/app && aioson dev:state:write . --feature=here --next=x']), 'here', 'a subfolder is this project');
  assert.equal(named([`$ aioson dev:state:write "${dir}" --feature=here --next=x`, `$ aioson pulse:update ${other} --feature=elsewhere`]), 'here');
  if (process.platform === 'win32') {
    const msys = `/${dir[0].toLowerCase()}${dir.slice(2).replace(/\\/g, '/')}`;
    assert.equal(named([`$ aioson dev:state:write ${msys} --feature=here --next=x`]), 'here', 'a Bash tool writes /c/... for C:\\...');
  }
});
