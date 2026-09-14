'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const exec = promisify(execFile);
const cli = path.resolve(__dirname, '../bin/aioson.js');

async function project(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-closure-cli-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, '.aioson/context'), { recursive: true });
  return root;
}
async function run(root, command, flags = []) {
  const result = await exec(process.execPath, [cli, command, root, ...flags, '--json']);
  return JSON.parse(result.stdout);
}

test('closure CLI persists explicit policy, supports dash alias and lists resolved debt only on request', async t => {
  const root = await project(t);
  assert.equal((await run(root, 'feature:closure')).policy.enabled, false);
  const enabled = await run(root, 'feature:closure', ['--enable', '--auto', '--allow-secondary', '--by=fixture-owner']);
  assert.equal(enabled.policy.enabled, true);
  assert.equal(enabled.policy.auto_close, true);
  assert.equal(enabled.policy.allow_secondary_ac_deferral, true);
  await fs.mkdir(path.join(root, '.aioson/context/simple-plans'));
  await fs.writeFile(path.join(root, '.aioson/context/simple-plans/demo-followup-caption.md'), '---\nsource_feature: demo\nsource_finding: caption\nstatus: done\n---\n');
  assert.equal((await run(root, 'feature-closure', ['--list'])).plans.length, 0);
  assert.equal((await run(root, 'feature:closure', ['--list', '--include-resolved'])).plans.length, 1);
  assert.equal((await run(root, 'feature:closure', ['--disable', '--by=fixture-owner'])).policy.enabled, false);
});

test('plan bind CLI is reachable and evaluator returns hashes without a semantic self-score', async t => {
  const root = await project(t);
  await fs.writeFile(path.join(root, '.aioson/context/prd-demo.md'), '# Approved PRD\n');
  await fs.writeFile(path.join(root, '.aioson/context/implementation-plan-demo.md'), '# Plan\n');
  const bound = await run(root, 'plan:bind', ['--feature=demo']);
  assert.equal(bound.ok, true);
  assert.match(bound.hash, /^[a-f0-9]{64}$/);
  assert.equal((await run(root, 'plan-bind', ['--feature=demo'])).hash, bound.hash);
  const report = await require('../scripts/testing/sdd-delivery-evals').measure(root, 'demo');
  assert.equal(report.artifact_hashes.prd, bound.hash);
  assert.equal(report.semantic_review.status, 'required');
  assert.equal(report.semantic_review.score, undefined);
});
