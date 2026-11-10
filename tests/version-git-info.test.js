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

test('a packaged copy inside another repository stamps no sha of that repository', (t) => {
  // An app that ships the CLI inside its own checkout (or a project's
  // node_modules) made `git -C <package>` answer for the enclosing repo, and
  // the label named a commit of a different codebase.
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { spawnSync } = require('node:child_process');
  const host = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-host-repo-'));
  const git = (...args) => spawnSync('git', ['-C', host, ...args], { encoding: 'utf8' });
  if (git('init', '-q').status !== 0) return t.skip('git unavailable');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'host');
  const pkg = path.join(host, 'node_modules', '@jaimevalasek', 'aioson');
  fs.mkdirSync(path.join(pkg, 'src'), { recursive: true });
  fs.copyFileSync(path.join(__dirname, '..', 'src', 'version.js'), path.join(pkg, 'src', 'version.js'));
  fs.writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({ name: '@jaimevalasek/aioson', version: '1.2.3' }));
  const copy = require(path.join(pkg, 'src', 'version.js'));
  assert.equal(copy.getGitBuildInfoSync(), null);
  assert.equal(copy.getCliVersionLabelSync(), '1.2.3');
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
