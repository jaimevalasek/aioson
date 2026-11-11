'use strict';

// A host that works with a window too small for the model it runs compacts
// every few minutes, and nothing inside the session says whether the project
// or the host is the cause. PreCompact records how full the context was, and
// the SessionStart after it measures the gap since the previous compaction.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { buildEventFromPayload } = require('../src/commands/hooks-emit');
const { buildCompactionRecap } = require('../src/lib/compaction-recap');
const { contextAtCompaction, compactionPressure, pressureLine, pressureNotice } = require('../src/lib/compaction-pressure');

const CLI = path.join(__dirname, '..', 'bin', 'aioson.js');

const assistant = (usage, extra = {}) => JSON.stringify({ type: 'assistant', message: { model: 'some-model', usage }, ...extra });
const marker = (minute, payload = { trigger: 'auto' }) => ({
  event_type: 'compaction',
  created_at: new Date(Date.UTC(2026, 0, 1, 10, minute)).toISOString(),
  payload_json: JSON.stringify(payload)
});

function tempDir(t, prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function transcript(t, lines) {
  const file = path.join(tempDir(t, 'aioson-pressure-transcript-'), 'session.jsonl');
  fs.writeFileSync(file, `${lines.join('\n')}\n`, 'utf8');
  return file;
}

test('the context at a compaction is what the last main-conversation turn carried in', (t) => {
  const file = transcript(t, [
    assistant({ input_tokens: 10, cache_read_input_tokens: 90000, cache_creation_input_tokens: 500 }),
    assistant({ input_tokens: 3, cache_read_input_tokens: 160000, cache_creation_input_tokens: 7000, output_tokens: 900 }),
    assistant({ input_tokens: 5, cache_read_input_tokens: 20000 }, { isSidechain: true }),
    JSON.stringify({ type: 'user', message: { content: 'next' } }),
    assistant({ input_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 })
  ]);
  assert.deepEqual(contextAtCompaction(file), { context_tokens: 167003 });
});

test('a Codex token count also names the window the harness works with', (t) => {
  const file = transcript(t, [
    JSON.stringify({ type: 'event_msg', payload: { type: 'token_count', info: { last_token_usage: { total_tokens: 251000 }, model_context_window: 272000 } } }),
    JSON.stringify({ type: 'event_msg', payload: { type: 'agent_message', message: 'done' } })
  ]);
  assert.deepEqual(contextAtCompaction(file), { context_tokens: 251000, window_tokens: 272000 });
});

test('only the tail is read, and an entry cut by it is skipped', (t) => {
  const file = transcript(t, [
    assistant({ input_tokens: 999999 }),
    JSON.stringify({ type: 'user', message: { content: 'x'.repeat(1024 * 1024 + 4096) } }),
    assistant({ input_tokens: 150000 })
  ]);
  assert.deepEqual(contextAtCompaction(file), { context_tokens: 150000 });
});

test('no transcript, an unreadable one or an unknown format measures nothing', (t) => {
  assert.deepEqual(contextAtCompaction(undefined), {});
  assert.deepEqual(contextAtCompaction(path.join(os.tmpdir(), 'aioson-no-such-transcript.jsonl')), {});
  assert.deepEqual(contextAtCompaction(transcript(t, ['not json', JSON.stringify({ type: 'other', usage: { input_tokens: 5 } })])), {});
});

test('the compaction marker keeps how full the context was', (t) => {
  const file = transcript(t, [assistant({ input_tokens: 2, cache_read_input_tokens: 165000 })]);
  const event = buildEventFromPayload({ hook_event_name: 'PreCompact', trigger: 'auto', session_id: 's1', transcript_path: file }, 'claude');
  assert.deepEqual(event.extra, { trigger: 'auto', context_tokens: 165002 });
});

test('two automatic compactions a few minutes apart are pressure; hours apart, or asked for, are not', () => {
  assert.deepEqual(
    compactionPressure([marker(0), marker(18, { trigger: 'auto', context_tokens: 167284 })]),
    { count: 2, minutes: 18, context_tokens: 167284, window_tokens: null }
  );
  assert.equal(compactionPressure([marker(0)]), null, 'one compaction says nothing about the window');
  assert.equal(compactionPressure([marker(0), marker(45)]), null, 'the threshold is exclusive');
  assert.equal(compactionPressure([marker(0), marker(200)]), null);
  assert.equal(compactionPressure([marker(0), marker(5, { trigger: 'manual' })]), null, 'a person who typed /compact chose to');
  assert.equal(compactionPressure([marker(0), { event_type: 'compaction', payload_json: '{"trigger":"auto"}' }]), null, 'no timestamp, no gap');
  // A manual compaction between two automatic ones does not hide them.
  assert.equal(compactionPressure([marker(0), marker(10, { trigger: 'manual' }), marker(20)]).minutes, 20);
  assert.equal(compactionPressure([marker(0), marker(6), marker(24), marker(27, { trigger: 'unknown' })]).count, 4);
});

test('the measurement reads as data in the checkpoint and tells the person where to look', () => {
  const pressure = { count: 3, minutes: 18, context_tokens: 167284, window_tokens: null };
  assert.equal(pressureLine(pressure), 'Compaction pressure on record: 3rd automatic compaction of this session, 18 min after the previous one, context at ~167k tokens — the host window is small for this work.');
  assert.match(pressureNotice(pressure), /^AIOSON: 3rd automatic compaction of this session, 18 min after the previous one, context at ~167k tokens\./);
  assert.match(pressureNotice(pressure), /host version/);
  assert.match(pressureLine({ count: 12, minutes: 4, context_tokens: 251000, window_tokens: 272000 }), /12th automatic compaction .* context at ~251k tokens of a 272k window/);
  assert.match(pressureLine({ count: 2, minutes: 9, context_tokens: null, window_tokens: null }), /2nd automatic compaction of this session, 9 min after the previous one — /);
  assert.equal(pressureLine(null), null);
  assert.equal(pressureNotice(null), null);

  const recap = buildCompactionRecap({ events: [{ event_type: 'agent_activated', message: '@dev', payload_json: '{"agent":"@dev"}' }], pressure });
  assert.match(recap, /Agent: @dev\nCompaction pressure on record: 3rd/, 'said right after the agent, so the budget keeps it');
});

test('end to end: the second automatic compaction of a session tells the user, and a first one stays quiet', (t) => {
  const dir = tempDir(t, 'aioson-pressure-');
  fs.mkdirSync(path.join(dir, '.aioson'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.aioson', 'config.md'), '# project\n', 'utf8');
  const file = transcript(t, [assistant({ input_tokens: 4, cache_read_input_tokens: 166000, cache_creation_input_tokens: 1280 })]);
  const hook = (payload, source = 'claude') => {
    const env = { ...process.env };
    delete env.AIOSON_LIVE_SESSION;
    delete env.AIOSON_LIVE_SESSION_KEY;
    const command = payload.hook_event_name === 'SessionStart' ? 'hooks:recap' : 'hooks:emit';
    const extra = command === 'hooks:recap' ? ['--json'] : [];
    const result = spawnSync(process.execPath, [CLI, command, dir, '--agent=dev', `--source=${source}`, ...extra], { input: JSON.stringify(payload), env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  };
  const compact = (session) => hook({ hook_event_name: 'PreCompact', session_id: session, trigger: 'auto', transcript_path: file });
  const restart = (session, source) => JSON.parse(hook({ hook_event_name: 'SessionStart', session_id: session, source: 'compact' }, source));

  hook({ hook_event_name: 'PostToolUse', session_id: 'P1', tool_name: 'Edit', tool_input: { file_path: path.join(dir, 'src', 'a.js') } });
  compact('P1');
  const first = restart('P1');
  assert.equal(first.systemMessage, undefined, 'one compaction says nothing about the window');
  assert.doesNotMatch(first.hookSpecificOutput.additionalContext, /Compaction pressure/);

  // Another window of the same project compacting in between is not this session's pressure.
  compact('P2');
  assert.equal(restart('P2').systemMessage, undefined);

  compact('P1');
  const second = restart('P1');
  assert.match(second.systemMessage, /^AIOSON: 2nd automatic compaction of this session, 1 min after the previous one, context at ~167k tokens\./);
  assert.match(second.hookSpecificOutput.additionalContext, /Compaction pressure on record: 2nd automatic compaction of this session/);

  // A harness not known to show `systemMessage` gets the measurement in the context only.
  const other = restart('P1', 'codex');
  assert.equal(other.systemMessage, undefined);
  assert.match(other.hookSpecificOutput.additionalContext, /Compaction pressure on record/);
});
