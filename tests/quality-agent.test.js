'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { qualityPlan, runChecks } = require('../src/lib/quality/checks');

async function project(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-quality-product-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, '.aioson'));
  return root;
}

test('consumer pilot executes native checks, retains evidence and detects a real broken assertion', async t => {
  const root = await project(t);
  await fs.writeFile(path.join(root, 'app.cjs'), 'module.exports = (price, quantity) => price * quantity;');
  await fs.writeFile(path.join(root, 'test.cjs'), 'require("node:assert/strict").equal(require("./app.cjs")(199,3),597);');
  await fs.writeFile(path.join(root, '.aioson/quality.json'), JSON.stringify({ schema_version: 1, checks: [{ id: 'money', argv: ['node', 'test.cjs'] }] }));
  const good = await runChecks(root);
  assert.equal(good.result.status, 'pass');
  assert.equal(good.result.profile, 'product');
  await fs.access(path.join(root, good.result.checks[0].log));
  await fs.writeFile(path.join(root, 'app.cjs'), 'module.exports = (price, quantity) => price + quantity;');
  const bad = await runChecks(root);
  assert.equal(bad.exitCode, 1);
  assert.equal(bad.result.checks[0].status, 'fail');
});

test('unconfigured consumer never reports success and plan mode executes nothing', async t => {
  const root = await project(t);
  const planned = await runChecks(root, { 'dry-run': true });
  assert.equal(planned.plan.checks.length, 2);
  const result = await runChecks(root);
  assert.equal(result.exitCode, 2);
  assert.ok(result.result.checks.every(check => check.status === 'not_run'));
  await assert.rejects(qualityPlan(root, { profile: 'made-up' }), /profile/);
  await assert.rejects(qualityPlan(root, { config: 'missing.json' }), /ENOENT/);
});

test('quality is a managed optional specialist with no acceptance gate authority', async () => {
  const { AGENT_DEFINITIONS, MANAGED_FILES } = require('../src/constants');
  assert.ok(AGENT_DEFINITIONS.some(agent => agent.id === 'quality'));
  assert.ok(MANAGED_FILES.includes('.aioson/agents/quality.md'));
  const prompt = await fs.readFile(path.join(__dirname, '../template/.aioson/agents/quality.md'), 'utf8');
  for (const section of ['LANGUAGE BOUNDARY', '## Mission', '## Required input', '## Hard constraints', 'agent:done']) assert.ok(prompt.includes(section));
  assert.match(prompt, /never grants|Never grant/);
  assert.match(prompt, /quality:run/);
  assert.doesNotMatch(prompt, /gate:approve/);
});

test('public CLI discovers and executes native npm scripts on Windows and Unix', async t => {
  const root = await project(t);
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ scripts: { lint: 'node --check app.cjs', test: 'node test.cjs' } }));
  await fs.writeFile(path.join(root, 'app.cjs'), 'module.exports = 7;');
  await fs.writeFile(path.join(root, 'test.cjs'), 'require("node:assert/strict").equal(require("./app.cjs"),7);');
  const { execute } = require('../src/lib/quality/process');
  const cli = path.resolve(__dirname, '../bin/aioson.js');
  const planned = await execute(['node', cli, 'quality:run', '--dry-run', root, '--profile=product', '--json'], { cwd: root });
  assert.equal(planned.status, 'pass', planned.stderr + planned.stdout);
  assert.equal(JSON.parse(planned.stdout).plan.checks.length, 2);
  const measured = await execute(['node', cli, 'quality:run', root, '--profile=product', '--json'], { cwd: root });
  assert.equal(measured.status, 'pass', measured.stderr + measured.stdout);
  const result = JSON.parse(measured.stdout);
  assert.equal(result.result.status, 'pass');
  assert.equal(result.result.checks.length, 2);
});

test('invalid check configuration and unsafe output fail before any command runs', async t => {
  const root = await project(t);
  for (const config of [null, { schema_version: 1, checks: [{ argv: ['node'] }] },
    { schema_version: 1, checks: [{ id: 'one', argv: [] }] },
    { schema_version: 1, checks: [{ id: 'one', argv: ['node'], timeout_ms: 0 }] }]) {
    await fs.writeFile(path.join(root, '.aioson/quality.json'), JSON.stringify(config));
    await assert.rejects(runChecks(root));
  }
  await fs.writeFile(path.join(root, '.aioson/quality.json'), JSON.stringify({ schema_version: 1, checks: [] }));
  await assert.rejects(runChecks(root, { output: '../escape.json' }), /inside/);
  const { execute } = require('../src/lib/quality/process');
  const cli = path.resolve(__dirname, '../bin/aioson.js');
  const invalid = await execute(['node', cli, 'quality:run', root, '--profile=invalid', '--json'], { cwd: root });
  assert.equal(invalid.exit_code, 2);
  assert.equal(JSON.parse(invalid.stdout).result.status, 'error');
});

test('a target inside framework storage cannot execute checks in its owning project', async t => {
  const root = await project(t), storage = path.join(root, '.aioson/runtime/candidate');
  await fs.mkdir(storage, { recursive: true });
  await fs.mkdir(path.join(root, '.aioson/context'));
  await fs.writeFile(path.join(root, 'mark.cjs'), 'require("node:fs").writeFileSync("executed.txt","unexpected");');
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ scripts: { lint: 'node mark.cjs', test: 'node mark.cjs' } }));
  const { execute } = require('../src/lib/quality/process');
  const cli = path.resolve(__dirname, '../bin/aioson.js');
  for (const command of ['quality:run', 'quality:evals']) {
    const measured = await execute(['node', cli, command, storage, '--json'], { cwd: root });
    assert.equal(measured.exit_code, 2, measured.stdout);
    assert.match(JSON.parse(measured.stdout).result.error, /cannot redirect a storage path/);
  }
  await assert.rejects(fs.access(path.join(root, 'executed.txt')), /ENOENT/);
});
