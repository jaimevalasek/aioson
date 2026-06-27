'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getCliVersionSync,
  getGitBuildInfoSync,
  getCliVersionLabelSync
} = require('../src/version');

test('getCliVersionSync returns a bare semver (no build suffix)', () => {
  const version = getCliVersionSync();
  assert.match(version, /^\d+\.\d+\.\d+/);
  assert.ok(!version.includes('('), 'bare version must not carry the git suffix');
});

test('getGitBuildInfoSync returns {sha,date} in a git checkout, or null', () => {
  const info = getGitBuildInfoSync();
  // The framework repo is a git checkout, so this normally returns an object;
  // tolerate null so the test also passes in a non-git (tarball) environment.
  if (info !== null) {
    assert.match(info.sha, /^[0-9a-f]{7,}$/);
    assert.ok(info.date === null || /^\d{4}-\d{2}-\d{2}$/.test(info.date));
  }
});

test('getCliVersionLabelSync appends (sha[, date]) when git info is present', () => {
  const label = getCliVersionLabelSync();
  const version = getCliVersionSync();
  const git = getGitBuildInfoSync();
  if (git) {
    assert.ok(label.startsWith(`${version} (`), `label should start with "${version} ("`);
    assert.ok(label.includes(git.sha), 'label should include the short sha');
  } else {
    assert.equal(label, version);
  }
});
