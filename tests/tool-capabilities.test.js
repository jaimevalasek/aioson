'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getToolCapabilities,
  resolvePermissionModeArgs,
} = require('../src/lib/tool-capabilities');

test('tool capabilities expose an unattended flag for every registered CLI — a harness the framework launches never asks for permission', () => {
  const { TOOL_CAPS } = require('../src/lib/tool-capabilities');
  assert.deepEqual(getToolCapabilities('claude').yolo_args, ['--dangerously-skip-permissions']);
  assert.deepEqual(getToolCapabilities('codex').yolo_args, ['--dangerously-bypass-approvals-and-sandbox']);
  assert.deepEqual(getToolCapabilities('opencode').yolo_args, ['--auto'], 'opencode run --auto: auto-approve permissions not explicitly denied');
  assert.deepEqual(getToolCapabilities('grok').yolo_args, ['--always-approve'], 'the installed Grok build has --always-approve, not --yolo');
  assert.deepEqual(getToolCapabilities('antigravity').yolo_args, ['--mode', 'accept-edits', '--dangerously-skip-permissions']);
  for (const [tool, caps] of Object.entries(TOOL_CAPS)) {
    assert.equal(caps.supports_yolo, true, `${tool} must register its unattended flag`);
    assert.ok(Array.isArray(caps.yolo_args) && caps.yolo_args.length > 0, `${tool}.yolo_args`);
  }
  assert.equal(getToolCapabilities('gemini'), null);
});

test('resolvePermissionModeArgs maps default and yolo modes', () => {
  assert.deepEqual(resolvePermissionModeArgs('claude', undefined), []);
  assert.deepEqual(resolvePermissionModeArgs('claude', 'default'), []);
  assert.deepEqual(resolvePermissionModeArgs('claude', 'yolo'), ['--dangerously-skip-permissions']);
  assert.deepEqual(resolvePermissionModeArgs('codex', 'yolo'), ['--dangerously-bypass-approvals-and-sandbox']);
});

test('resolvePermissionModeArgs rejects unknown modes and unknown tools; a session that names no mode defaults to the unattended flag', () => {
  const { resolveDefaultSessionPermission, DEFAULT_SESSION_PERMISSION_MODE } = require('../src/lib/tool-capabilities');
  assert.throws(() => resolvePermissionModeArgs('claude', 'turbo'), /permission_mode_unknown:turbo/);
  assert.throws(() => resolvePermissionModeArgs('gemini', 'yolo'), /tool_unknown:gemini/);
  assert.equal(DEFAULT_SESSION_PERMISSION_MODE, 'yolo');
  assert.deepEqual(resolveDefaultSessionPermission('opencode'), { mode: 'yolo', args: ['--auto'], warning: null });
  const unknown = resolveDefaultSessionPermission('gemini');
  assert.equal(unknown.mode, 'default');
  assert.deepEqual(unknown.args, []);
  assert.match(unknown.warning, /registers no unattended flag/);
});

test('the registry is the single host list: kimi, qwen, grok, muse and agy are known with unattended flags', () => {
  const { TOOL_CAPS, listSupportedTools, listExecutionHosts, getExecutionCapabilities } = require('../src/lib/tool-capabilities');
  assert.deepEqual(listSupportedTools(), ['agy', 'antigravity', 'claude', 'codex', 'grok', 'kimi', 'muse', 'opencode', 'qwen']);
  assert.equal(TOOL_CAPS.kimi.install_command, 'npm install -g @moonshot-ai/kimi-code');
  assert.equal(TOOL_CAPS.qwen.install_command, 'npm install -g @qwen-code/qwen-code');
  assert.equal(TOOL_CAPS.grok.install_command, 'npm install -g @xai-official/grok');
  // Mirrors the unattended flags the live surface already uses per CLI.
  assert.deepEqual(resolvePermissionModeArgs('kimi', 'yolo'), ['--auto']);
  assert.deepEqual(resolvePermissionModeArgs('qwen', 'yolo'), ['--yolo']);
  assert.deepEqual(resolvePermissionModeArgs('grok', 'yolo'), ['--always-approve']);
  assert.deepEqual(resolvePermissionModeArgs('muse', 'yolo'), ['--yolo']);
  assert.deepEqual(resolvePermissionModeArgs('agy', 'yolo'), ['--dangerously-skip-permissions']);
  // No resume contract is claimed for hosts whose resume flags are unverified.
  for (const tool of ['kimi', 'qwen', 'muse']) assert.equal(getToolCapabilities(tool).supports_resume, false);
  // Interactive-only entries stay off the dispatch list until an adapter proves their contract.
  for (const tool of ['muse', 'agy']) assert.equal(getExecutionCapabilities(tool), null);
});

test('execution capabilities live in the registry and interactive-only hosts are not dispatchable', () => {
  const { listExecutionHosts, getExecutionCapabilities } = require('../src/lib/tool-capabilities');
  assert.deepEqual(listExecutionHosts(), ['antigravity', 'claude', 'codex', 'grok', 'kimi', 'opencode', 'qwen']);
  assert.deepEqual(getExecutionCapabilities('codex'), {
    binary: 'codex',
    install_command: 'npm install -g @openai/codex',
    additional_workspaces: true,
    model_catalog: true,
    reasoning_effort: true,
  });
  assert.equal(getExecutionCapabilities('claude').reasoning_effort, true);
  assert.equal(getExecutionCapabilities('muse'), null);
  assert.deepEqual(getExecutionCapabilities('grok'), { binary: 'grok', install_command: 'npm install -g @xai-official/grok', additional_workspaces: false, model_catalog: false, reasoning_effort: true });
  assert.equal(getExecutionCapabilities('gemini'), null);
});

// The unattended default was "append the --tool's flag, always": Codex refused
// its bypass flag passed twice ("cannot be used multiple times"), and
// `--tool=opencode --tool-bin=agy` sent opencode's `--auto` to Antigravity,
// which printed its help instead of opening.
test('the registry recognizes each host\'s own permission flags (aliases included) and names the host a --tool-bin launches; the launch permission follows that host and never doubles the caller\'s flag', () => {
  const { TOOL_CAPS, findPermissionFlag, hostForBinary, resolveLaunchPermission } = require('../src/lib/tool-capabilities');
  for (const [tool, caps] of Object.entries(TOOL_CAPS)) {
    assert.ok(Array.isArray(caps.permission_flags) && caps.permission_flags.length > 0, `${tool}.permission_flags sits next to its unattended flag`);
    for (const flag of caps.yolo_args.filter(token => token.startsWith('-'))) assert.equal(findPermissionFlag(tool, ['--model', 'x', flag]), flag, `${tool} recognizes its own ${flag}`);
  }
  assert.equal(findPermissionFlag('codex', ['--yolo']), '--yolo', 'the CLI alias of the bypass');
  assert.equal(findPermissionFlag('codex', ['--sandbox=read-only']), '--sandbox=read-only', 'the inline-value form');
  assert.equal(findPermissionFlag('codex', ['-a', 'on-request']), '-a');
  assert.equal(findPermissionFlag('codex', ['--model', 'gpt-5.6']), null);
  assert.equal(findPermissionFlag('gemini', ['--yolo']), null);

  assert.equal(hostForBinary('agy'), 'agy');
  assert.equal(hostForBinary('C:\\Users\\op\\AppData\\Roaming\\npm\\codex.cmd'), 'codex');
  assert.equal(hostForBinary('/usr/local/bin/claude'), 'claude');
  assert.equal(hostForBinary('Grok.EXE'), 'grok');
  assert.equal(hostForBinary('claude-wrapper'), null);
  assert.equal(hostForBinary(''), null);

  assert.deepEqual(resolveLaunchPermission('opencode', { binary: 'agy' }), { mode: 'yolo', host: 'agy', binary: 'agy', args: ['--dangerously-skip-permissions'], source: 'registry', flag: null, warning: null });
  assert.deepEqual(resolveLaunchPermission('codex', { userArgs: ['--sandbox', 'workspace-write'] }), { mode: 'yolo', host: 'codex', binary: 'codex', args: [], source: 'tool_args', flag: '--sandbox', warning: null });
  assert.deepEqual(resolveLaunchPermission('antigravity'), { mode: 'yolo', host: 'antigravity', binary: 'agy', args: ['--mode', 'accept-edits', '--dangerously-skip-permissions'], source: 'registry', flag: null, warning: null });
  const unknown = resolveLaunchPermission('claude', { binary: 'node' });
  assert.equal(unknown.host, null);
  assert.equal(unknown.mode, 'default');
  assert.deepEqual(unknown.args, []);
  assert.match(unknown.warning, /--tool-bin node is not a registered host \(.*\) — no unattended flag was added and the session will ask for permissions/);
  assert.throws(() => resolveLaunchPermission('claude', { binary: 'node', permissionMode: 'yolo' }), /permission_mode_unsupported:node:yolo/, 'an explicit yolo that cannot be translated is refused, not guessed');
  assert.deepEqual(resolveLaunchPermission('claude', { binary: 'node', permissionMode: 'default' }).args, []);
  assert.throws(() => resolveLaunchPermission('claude', { permissionMode: 'turbo' }), /permission_mode_unknown:turbo/);
});

test('every existing tool:capabilities field survives for the Play contract', () => {
  const { TOOL_CAPS } = require('../src/lib/tool-capabilities');
  const required = ['install_command', 'binary', 'supports_resume', 'resume_last', 'supports_session_id',
    'resume_session_id', 'supports_session_picker', 'session_picker', 'supports_yolo', 'yolo_args'];
  for (const [tool, caps] of Object.entries(TOOL_CAPS)) {
    for (const key of required) assert.ok(Object.hasOwn(caps, key), `${tool}.${key}`);
  }
});
