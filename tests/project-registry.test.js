'use strict';

/**
 * ~/.aioson/projects.json — the AIOSON projects this machine's operator works
 * in. Nothing listed them before: 58 projects sat on one machine and no surface
 * could compare what was chosen in each. Every session start (context:digest)
 * records the project it opens; temp folders, data trees and folders without a
 * project context never enter, and gone projects leave on the next write.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  recordProjects,
  livingProjects,
  readRegistry,
  scanForProjects,
  registryPath,
  registryDisabled,
  TOUCH_INTERVAL_MS
} = require('../src/lib/project-registry');

const CLI = path.join(__dirname, '..', 'bin', 'aioson.js');

function sandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-registry-'));
  const home = path.join(root, 'home');
  fs.mkdirSync(home);
  return { root, home };
}

function makeProject(parent, name, { projectName = name } = {}) {
  const dir = path.join(parent, name);
  fs.mkdirSync(path.join(dir, '.aioson', 'context'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.aioson', 'context', 'project.context.md'), [
    '---',
    `project_name: "${projectName}"`,
    'project_type: "web_app"',
    'profile: "developer"',
    'framework: "Node"',
    'framework_installed: true',
    'classification: "MICRO"',
    'interaction_language: "pt-BR"',
    'conversation_language: "pt-BR"',
    '---',
    '',
    '# Project Context',
    ''
  ].join('\n'));
  return dir;
}

test('a project with a context is recorded once, by name; a plain folder and a data tree are not', async () => {
  const { root, home } = sandbox();
  const app = makeProject(root, 'crm-app', { projectName: 'CRM App' });
  const plain = path.join(root, 'plain');
  fs.mkdirSync(plain);
  const inside = makeProject(path.join(app, '.aioson'), 'nested');

  const first = await recordProjects([app, plain, inside], { home });
  assert.deepEqual(first.added, [path.resolve(app)]);
  assert.deepEqual(first.skipped.map((s) => s.reason).sort(), ['inside_data_tree', 'no_project_context']);
  const registry = readRegistry(home);
  assert.equal(registry.projects.length, 1);
  assert.equal(registry.projects[0].name, 'CRM App');
  assert.equal(registry.projects[0].first_seen, registry.projects[0].last_seen);
  assert.ok(fs.existsSync(registryPath(home)));
});

test('a session in the same hour does not rewrite the list; a later one touches it, a scan forces it', async () => {
  const { root, home } = sandbox();
  const app = makeProject(root, 'touch-app');
  const now = Date.parse('2026-11-17T10:00:00.000Z');
  await recordProjects([app], { home, now });
  const before = fs.statSync(registryPath(home)).mtimeMs;

  const soon = await recordProjects([app], { home, now: now + 60 * 1000 });
  assert.deepEqual([soon.added, soon.touched], [[], []], 'no write within the hour');
  assert.equal(fs.statSync(registryPath(home)).mtimeMs, before);

  const later = await recordProjects([app], { home, now: now + TOUCH_INTERVAL_MS });
  assert.deepEqual(later.touched, [path.resolve(app)]);
  assert.equal(readRegistry(home).projects[0].last_seen, new Date(now + TOUCH_INTERVAL_MS).toISOString());
  const forced = await recordProjects([app], { home, now: now + TOUCH_INTERVAL_MS + 1000, force: true });
  assert.deepEqual(forced.touched, [path.resolve(app)]);
});

test('a throwaway folder under the temp dir never enters the operator\'s real list', async () => {
  const { root } = sandbox();
  const probe = makeProject(root, 'probe-app');
  // A home outside the temp dir is the operator's real one: a temp project stays out.
  const realHome = path.join(path.parse(os.tmpdir()).root, `aioson-no-such-home-${process.pid}`);
  const outcome = await recordProjects([probe], { home: realHome });
  assert.deepEqual(outcome.skipped.map((s) => s.reason), ['temporary_folder']);
  assert.equal(fs.existsSync(registryPath(realHome)), false, 'nothing written');
});

test('a removed project leaves the answer at once and the file at the next write; newest first', async () => {
  const { root, home } = sandbox();
  const older = makeProject(root, 'older-app');
  const newer = makeProject(root, 'newer-app');
  const gone = makeProject(root, 'gone-app');
  const now = Date.parse('2026-11-17T10:00:00.000Z');
  await recordProjects([older], { home, now });
  await recordProjects([gone], { home, now: now + 1000 });
  await recordProjects([newer], { home, now: now + 2000 });
  fs.rmSync(gone, { recursive: true, force: true });

  assert.deepEqual(livingProjects(home).map((p) => path.basename(p.path)), ['newer-app', 'older-app']);
  assert.equal(readRegistry(home).projects.length, 3, 'reading rewrites nothing');
  await recordProjects([makeProject(root, 'fourth-app')], { home, now: now + 3000 });
  assert.deepEqual(readRegistry(home).projects.map((p) => path.basename(p.path)), ['fourth-app', 'newer-app', 'older-app']);
});

test('a scan finds AIOSON roots under a folder, never inside a project, a dependency or a hidden folder', async () => {
  const { root } = sandbox();
  const work = path.join(root, 'dev');
  const a = makeProject(work, 'app-a');
  const b = makeProject(path.join(work, 'clients'), 'app-b');
  makeProject(path.join(a, 'packages'), 'inner');
  makeProject(path.join(work, 'node_modules'), 'dep');
  makeProject(path.join(work, '.cache'), 'hidden');
  makeProject(path.join(work, 'x', 'y', 'z'), 'too-deep');

  assert.deepEqual(scanForProjects(work, { depth: 2 }).sort(), [a, b].map((dir) => path.resolve(dir)).sort());
  assert.equal(scanForProjects(work, { depth: 4 }).length, 3, 'deeper reaches the deep one');
});

test('the list is off with AIOSON_PROJECT_REGISTRY=false and with operator memory off', async () => {
  const { root, home } = sandbox();
  const app = makeProject(root, 'off-app');
  assert.equal(registryDisabled({ AIOSON_PROJECT_REGISTRY: 'false' }), true);
  assert.equal(registryDisabled({ AIOSON_OPERATOR_MEMORY: 'FALSE' }), true);
  assert.equal(registryDisabled({}), false);
  const outcome = await recordProjects([app], { home, env: { AIOSON_PROJECT_REGISTRY: 'false' } });
  assert.equal(outcome.disabled, true);
  assert.equal(fs.existsSync(registryPath(home)), false);
});

test('context:digest records the project the session opens', async () => {
  const { root, home } = sandbox();
  const app = makeProject(root, 'digest-app');
  const env = { ...process.env, HOME: home, USERPROFILE: home, AIOSON_OPERATOR_ID: 'registry-digest-bot' };
  delete env.AIOSON_PROJECT_REGISTRY;
  delete env.AIOSON_OPERATOR_MEMORY;
  const res = spawnSync(process.execPath, [CLI, 'context:digest', app, '--json'], { encoding: 'utf8', env });
  assert.equal(res.status, 0, res.stderr);
  assert.deepEqual(livingProjects(home).map((p) => p.name), ['digest-app']);

  const off = makeProject(root, 'memory-off-app');
  const quiet = spawnSync(process.execPath, [CLI, 'context:digest', off, '--json'], { encoding: 'utf8', env: { ...env, AIOSON_OPERATOR_MEMORY: 'false' } });
  assert.equal(quiet.status, 0, quiet.stderr);
  assert.deepEqual(livingProjects(home).map((p) => p.name), ['digest-app'], 'memory off records nothing');
});
