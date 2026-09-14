'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { runEvals } = require('../src/lib/quality/evals');
const { loadSuite } = require('../src/lib/quality/eval-suite');
const { compareRuns } = require('../src/lib/quality/eval-compare');
const { execute } = require('../src/lib/quality/process');
const corpus = require('../template/.aioson/quality/evals/core.json');
const solutions = require('./fixtures/quality/eval-solutions.json');

async function project(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-evals-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

test('all 20 broken seeds fail independent graders; all reference repairs pass', async t => {
  const root = await project(t);
  const seeds = await runEvals(root, { 'validate-seeds': true });
  assert.equal(seeds.ok, true);
  assert.equal(seeds.result.kind, 'seed_validation');
  assert.deepEqual(seeds.result.summary, { tasks: 20, trials: 20, pass: 0, fail: 20, error: 0 });
  const executor = path.join(root, 'repair.cjs');
  await fs.writeFile(executor, `const fs=require('node:fs');const p=JSON.parse(fs.readFileSync(0,'utf8'));const fixes=${JSON.stringify(solutions)};fs.writeFileSync('solution.cjs',fixes[p.task_id]);`);
  const fixed = await runEvals(root, { executor: JSON.stringify(['node', executor]), label: 'reference-fixture-not-a-model' });
  assert.equal(fixed.ok, true);
  assert.equal(fixed.result.summary.pass, 20);
  assert.equal(fixed.result.usage, null);
  assert.match(fixed.result.suite_sha256, /^[a-f0-9]{64}$/);
  assert.notEqual(fixed.output, seeds.output);
  await assert.rejects(runEvals(root, { 'validate-seeds': true, output: seeds.output }), /EEXIST/);
});

test('candidate self-reported success is not the grading authority', async t => {
  const root = await project(t);
  await fs.writeFile(path.join(root, 'suite.json'), JSON.stringify({ ...corpus, tasks: corpus.tasks.slice(0, 1) }));
  const result = await runEvals(root, { suite: 'suite.json', executor: JSON.stringify(['node', '-e', 'process.stdout.write(JSON.stringify({pass:true,score:1}))']), label: 'lying-fixture' });
  assert.equal(result.ok, false);
  assert.equal(result.result.summary.fail, 1);
  await assert.rejects(runEvals(root, {}), /executor/);
  await assert.rejects(runEvals(root, { trials: 0, 'validate-seeds': true }), /trials/);
});

test('comparison pairs tasks and rejects changed graders, missing or duplicate trials, errors and seed runs', () => {
  const before = { schema_version: 1, kind: 'executor', integrity: 'pass', suite_sha256: 'a'.repeat(64), grader_sha256: 'b'.repeat(64), records: [
    { task_id: 'a', trial: 1, status: 'fail' }, { task_id: 'a', trial: 2, status: 'pass' }, { task_id: 'b', trial: 1, status: 'pass' }
  ] };
  const after = structuredClone(before); after.records[0].status = 'pass';
  const result = compareRuns(before, after);
  assert.equal(result.tasks, 2); assert.equal(result.paired_trials, 3); assert.equal(result.pass_rate_delta, 0.25);
  assert.deepEqual(result, compareRuns(before, after));
  for (const changed of [ { ...after, kind: 'seed_validation' }, { ...after, grader_sha256: 'different' },
    { ...after, records: after.records.slice(1) }, { ...after, records: [...after.records, after.records[0]] },
    { ...after, records: after.records.map(r => ({ ...r, status: 'error' })) }]) assert.throws(() => compareRuns(before, changed));
});

test('executor enforces timeout, output bound and executable availability', async t => {
  const root = await project(t);
  const timeout = await execute(['node', '-e', 'setInterval(()=>{},1000)'], { cwd: root, timeout: 100 });
  assert.equal(timeout.status, 'error'); assert.equal(timeout.reason, 'timeout');
  const missing = await execute(['aioson-definitely-missing-executable'], { cwd: root });
  assert.equal(missing.status, 'error');
  const noisy = await execute(['node', '-e', 'process.stdout.write("x".repeat(5*1024*1024))'], { cwd: root });
  assert.equal(noisy.status, 'error'); assert.equal(noisy.reason, 'output_limit');
  await assert.rejects(execute('node', { cwd: root }), /argv/);
  await assert.rejects(execute(['x.cmd'], { cwd: root }), /shim/);
});

test('suite validation rejects duplicate tasks', async t => {
  const root = await project(t), file = path.join(root, 'bad.json');
  await fs.writeFile(file, JSON.stringify({ ...corpus, tasks: [corpus.tasks[0], corpus.tasks[0]] }));
  await assert.rejects(loadSuite(file), /duplicate/);
});

test('early process exit and non-finite results cannot bypass the parent outcome grader', async t => {
  const root = await project(t);
  const suite = { ...corpus, tasks: [{ ...corpus.tasks[0], source: 'process.exit(0);', vectors: [{ input: [], expected: null }] }] };
  await fs.writeFile(path.join(root, 'suite.json'), JSON.stringify(suite));
  const result = await runEvals(root, { suite: 'suite.json', 'validate-seeds': true });
  assert.equal(result.result.summary.fail, 1);
  const { gradeOutcomes } = require('../src/lib/quality/eval-outcomes');
  const { serialize } = require('node:v8');
  const execution = { status: 'pass', stdout: serialize([{ value: NaN, input: [] }]).toString('base64') };
  assert.equal(gradeOutcomes(execution, suite.tasks[0].vectors).status, 'fail');
});

test('public eval command emits machine-readable seed evidence and paired comparisons', async t => {
  const root = await project(t), cli = path.resolve(__dirname, '../bin/aioson.js');
  await fs.writeFile(path.join(root, 'suite.json'), JSON.stringify({ ...corpus, tasks: corpus.tasks.slice(0, 1) }));
  const seeded = await execute(['node', cli, 'quality:evals', '--validate-seeds', root, '--suite=suite.json', '--json'], { cwd: root });
  assert.equal(seeded.status, 'pass', seeded.stderr + seeded.stdout);
  assert.equal(JSON.parse(seeded.stdout).result.kind, 'seed_validation');
  const fixture = { schema_version: 1, kind: 'executor', integrity: 'pass', suite_sha256: 'a'.repeat(64), grader_sha256: 'b'.repeat(64), records: [{ task_id: 'a', trial: 1, status: 'pass' }] };
  await fs.writeFile(path.join(root, 'before.json'), JSON.stringify(fixture));
  await fs.writeFile(path.join(root, 'after.json'), JSON.stringify(fixture));
  const compared = await execute(['node', cli, 'quality:evals', root, '--baseline=before.json', '--compare=after.json', '--output=paired.json', '--json'], { cwd: root });
  assert.equal(compared.status, 'pass', compared.stderr + compared.stdout);
  assert.equal(JSON.parse(compared.stdout).result.pass_rate_delta, 0);
  await fs.access(path.join(root, 'paired.json'));
});

test('an executor deleting its candidate produces persistent error evidence', async t => {
  const root = await project(t);
  await fs.writeFile(path.join(root, 'suite.json'), JSON.stringify({ ...corpus, tasks: corpus.tasks.slice(0, 1) }));
  const result = await runEvals(root, { suite: 'suite.json', label: 'broken-executor',
    executor: JSON.stringify(['node', '-e', 'require("node:fs").unlinkSync("solution.cjs")']) });
  assert.equal(result.exitCode, 2); assert.equal(result.result.summary.error, 1);
  const evidence = JSON.parse(await fs.readFile(path.join(root, result.result.records[0].evidence), 'utf8'));
  assert.equal(evidence.grade.reason, 'candidate_unreadable');
  assert.equal(evidence.solution_sha256, null);
});
