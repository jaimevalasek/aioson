'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
  parseSemver,
  compareSemver,
  inspectTemplateVersion
} = require('../src/template-version-status');

async function tmp() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-template-version-'));
}

async function install(root, templateVersion) {
  const file = path.join(root, '.aioson/install.json');
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify({ template_version: templateVersion }), 'utf8');
}

test('template version comparison accepts semver suffixes', () => {
  assert.deepEqual(parseSemver('v1.44.0-dev.1'), [1, 44, 0]);
  assert.equal(compareSemver('1.38.0', '1.44.0'), -1);
  assert.equal(compareSemver('1.44.0', '1.44.0'), 0);
  assert.equal(compareSemver('1.45.0', '1.44.0'), 1);
  assert.equal(compareSemver('invalid', '1.44.0'), null);
});

test('outdated installed template produces an actionable routing warning', async () => {
  const root = await tmp();
  await install(root, '1.38.0');
  const status = await inspectTemplateVersion(root, { cliVersion: '1.44.0' });
  assert.equal(status.status, 'outdated');
  assert.equal(status.outdated, true);
  assert.match(status.warning, /template 1\.38\.0 is older than CLI 1\.44\.0/);
  assert.match(status.warning, /--expect-feature=<slug>/);
});

test('a template newer than the running CLI warns and names where that CLI lives', async () => {
  // Two copies of the CLI on one machine: the newer one updated the project,
  // the older one (an app's bundled copy) runs now. The path tells them apart.
  const root = await tmp();
  await install(root, '1.80.0');
  const status = await inspectTemplateVersion(root, { cliVersion: '1.77.0', cliRoot: 'C:/apps/host/bundled-cli' });
  assert.equal(status.status, 'ahead');
  assert.equal(status.outdated, false);
  assert.match(status.warning, /template 1\.80\.0 is newer than this CLI 1\.77\.0 \(C:\/apps\/host\/bundled-cli\)/);
  assert.match(status.warning, /npm install -g @jaimevalasek\/aioson@latest/);
});

test('current template and missing install metadata do not produce false warnings', async () => {
  const currentRoot = await tmp();
  await install(currentRoot, '1.44.0');
  const current = await inspectTemplateVersion(currentRoot, { cliVersion: '1.44.0' });
  assert.equal(current.status, 'current');
  assert.equal(current.warning, null);

  const missing = await inspectTemplateVersion(await tmp(), { cliVersion: '1.44.0' });
  assert.equal(missing.status, 'missing');
  assert.equal(missing.warning, null);
});
