'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { loadSuite, digest } = require('./eval-suite');
const { execute, commandFor } = require('./process');
const { containedOutput, writeJson, ensureNewOutput } = require('./files');
const { sourceIdentity, executorFiles } = require('./provenance');
const { gradeOutcomes } = require('./eval-outcomes');
const GRADER = path.join(__dirname, 'eval-grader.js');

async function graderDigest() {
  const worker = await fs.readFile(GRADER);
  const judge = await fs.readFile(path.join(__dirname, 'eval-outcomes.js'));
  return digest(Buffer.concat([worker, judge]));
}

async function trial(root, directory, task, number, options) {
  const relative = `${directory}/${task.id}/${number}`;
  const workspace = await containedOutput(root, `${relative}/workspace`);
  await fs.mkdir(workspace, { recursive: true });
  const solution = path.join(workspace, 'solution.cjs');
  await fs.writeFile(solution, task.source, { flag: 'wx' });
  const request = { schema_version: 1, task_id: task.id, trial: number, workspace,
    prompt: `${task.prompt}\nEdit solution.cjs. Export one synchronous function. Preserve the input. Do not edit files outside this workspace.` };
  const execution = options.executor ? await execute(options.executor, { cwd: workspace,
    input: JSON.stringify(request), timeout: options.timeout }) : { status: 'not_run', reason: 'seed_validation', duration_ms: 0 };
  let grade, solutionHash = null;
  try {
    await containedOutput(root, `${relative}/workspace/solution.cjs`);
    solutionHash = digest(await fs.readFile(solution));
    grade = execution.status === 'fail' || execution.status === 'error'
      ? { status: 'error', reason: 'executor_failed' }
      : gradeOutcomes(await execute(['node', GRADER], { cwd: workspace,
        input: JSON.stringify({ solution, inputs: task.vectors.map(vector => vector.input) }), timeout: 10000 }), task.vectors);
  } catch (error) { grade = { status: 'error', reason: 'candidate_unreadable', error: error.message }; }
  const evidence = { execution, grade, solution_sha256: solutionHash };
  await writeJson(root, `${relative}/evidence.json`, evidence, { exclusive: true });
  return { task_id: task.id, trial: number, status: grade.status, duration_ms: execution.duration_ms,
    evidence: `${relative}/evidence.json`, solution_sha256: evidence.solution_sha256 };
}

function executionOptions(options) {
  const trials = Number(options.trials ?? 1);
  if (!Number.isInteger(trials) || trials < 1 || trials > 10) throw new Error('Evaluation trials must be 1..10.');
  const timeout = Number(options.timeout ?? 600000);
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 600000) throw new Error('Invalid executor timeout.');
  let executor = null;
  if (options.executor) {
    executor = JSON.parse(options.executor);
    commandFor(executor);
    if (!options.label || typeof options.label !== 'string') throw new Error('Measured executions require --label=<model/harness/config>.');
  } else if (!options['validate-seeds']) throw new Error('Supply --executor=<JSON argv> or --validate-seeds; no model execution is inferred.');
  if (executor && options['validate-seeds']) throw new Error('Choose seed validation or executor measurement.');
  return { trials, timeout, executor };
}

function verdict(result) {
  if (result.integrity !== 'pass' || result.summary.error) return { ok: false, exitCode: 2 };
  const ok = result.kind === 'seed_validation' ? result.summary.fail === result.records.length : result.summary.pass === result.records.length;
  return { ok, exitCode: ok ? 0 : 1 };
}

async function runEvals(root, options = {}) {
  const loaded = await loadSuite(options.suite && path.resolve(root, options.suite));
  const { trials, timeout, executor } = executionOptions(options);
  await ensureNewOutput(root, options.output);
  const executorHashes = await executorFiles(root, executor);
  const runId = randomUUID();
  const directory = `.aioson/runtime/quality/evals/${runId}`;
  const graderHash = await graderDigest();
  const records = [];
  for (const task of loaded.suite.tasks) {
    for (let number = 1; number <= trials; number++) records.push(await trial(root, directory, task, number, { executor, timeout }));
  }
  const intact = loaded.hash === digest(await fs.readFile(loaded.file)) && graderHash === await graderDigest();
  const result = { schema_version: 1, run_id: runId, kind: executor ? 'executor' : 'seed_validation', label: options.label || null,
    created_at: new Date().toISOString(), suite_id: loaded.suite.id, suite_sha256: loaded.hash, grader_sha256: graderHash,
    environment: { node: process.version, platform: process.platform, arch: process.arch }, executor, executor_files: executorHashes,
    source: await sourceIdentity(root), trials,
    integrity: intact ? 'pass' : 'error', records, summary: { tasks: loaded.suite.tasks.length, trials: records.length,
      pass: records.filter(record => record.status === 'pass').length, fail: records.filter(record => record.status === 'fail').length,
      error: records.filter(record => record.status === 'error').length }, usage: null };
  const output = options.output || `${directory}/run.json`;
  await writeJson(root, output, result, { exclusive: true });
  return { ...verdict(result), result, output };
}

module.exports = { runEvals };
