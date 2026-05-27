'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getToolCapabilities,
  resolvePermissionModeArgs,
} = require('../src/lib/tool-capabilities');

test('tool capabilities expose yolo support only for mapped CLIs', () => {
  assert.deepEqual(getToolCapabilities('claude').yolo_args, ['--dangerously-skip-permissions']);
  assert.deepEqual(getToolCapabilities('codex').yolo_args, ['--dangerously-bypass-approvals-and-sandbox']);
  assert.equal(getToolCapabilities('opencode').supports_yolo, false);
  assert.equal(getToolCapabilities('gemini').supports_yolo, false);
});

test('resolvePermissionModeArgs maps default and yolo modes', () => {
  assert.deepEqual(resolvePermissionModeArgs('claude', undefined), []);
  assert.deepEqual(resolvePermissionModeArgs('claude', 'default'), []);
  assert.deepEqual(resolvePermissionModeArgs('claude', 'yolo'), ['--dangerously-skip-permissions']);
  assert.deepEqual(resolvePermissionModeArgs('codex', 'yolo'), ['--dangerously-bypass-approvals-and-sandbox']);
});

test('resolvePermissionModeArgs rejects unknown and unsupported modes', () => {
  assert.throws(() => resolvePermissionModeArgs('claude', 'turbo'), /permission_mode_unknown:turbo/);
  assert.throws(() => resolvePermissionModeArgs('opencode', 'yolo'), /permission_mode_unsupported:opencode:yolo/);
});
