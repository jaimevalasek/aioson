'use strict';

// The CLI dispatch is one if/else chain read top to bottom, so a prefix branch
// (`command.startsWith('learning:')`) answers for every later exact branch it
// covers. `learning:auto-promote` sat below the `learning:` prefix: the colon
// form ran the generic learning command, printed `{"error": true}` and exited 0,
// while the dash form reached runLearningAutoPromote.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const BIN = path.join(ROOT, 'bin', 'aioson.js');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-cli-dispatch-'));
const HOME = path.join(TMP, 'home');
const PROJECT = path.join(TMP, 'project');
fs.mkdirSync(HOME);
fs.mkdirSync(PROJECT);

function cli(args) {
  const run = spawnSync(process.execPath, [BIN, ...args], {
    cwd: PROJECT,
    encoding: 'utf8',
    input: '',
    env: { ...process.env, HOME, USERPROFILE: HOME, AIOSON_OPERATOR_MEMORY: 'false' }
  });
  return { status: run.status, json: JSON.parse(run.stdout), stderr: run.stderr };
}

test('learning:auto-promote reaches the same handler as learning-auto-promote', () => {
  const colon = cli(['learning:auto-promote', PROJECT, '--json']);
  const dash = cli(['learning-auto-promote', PROJECT, '--json']);
  // A project without a runtime database: runLearningAutoPromote's own answer.
  assert.equal(dash.json.reason, 'no_runtime', JSON.stringify(dash.json));
  assert.deepEqual(colon.json, dash.json);
  assert.equal(colon.status, dash.status);
  assert.equal(colon.status, 1);
});

test('no exact command branch sits below a prefix branch that covers it', () => {
  const source = fs.readFileSync(path.join(ROOT, 'src', 'cli.js'), 'utf8');
  const chain = source.slice(source.indexOf('let result = null'), source.lastIndexOf('} catch (error)'));
  const prefixes = [];
  const shadowed = [];
  for (const [, prefix, exact] of chain.matchAll(/command\.startsWith\('([^']+)'\)|command\s*===\s*'([^']+)'/g)) {
    if (prefix) prefixes.push(prefix);
    else {
      const cover = prefixes.find((candidate) => exact.startsWith(candidate));
      if (cover) shadowed.push(`${exact} (below the '${cover}' prefix branch)`);
    }
  }
  assert.ok(prefixes.includes('learning:'), 'the prefix branches are still parsed');
  assert.deepEqual(shadowed, []);
});
