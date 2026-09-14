'use strict';

function validateMetadata(run) {
  if (run.schema_version !== 1 || run.kind !== 'executor' || run.integrity !== 'pass' || !Array.isArray(run.records) || !run.records.length) throw new Error('Comparison requires intact executor runs.');
  for (const field of ['suite_sha256', 'grader_sha256']) {
    if (typeof run[field] !== 'string' || !/^[a-f0-9]{64}$/.test(run[field])) throw new Error('Comparison requires corpus and grader hashes.');
  }
}

function validatedRecords(run) {
  validateMetadata(run);
  const records = new Map();
  for (const record of run.records) {
    if (typeof record.task_id !== 'string' || !/^[a-z0-9-]+$/.test(record.task_id) || !Number.isInteger(record.trial) || record.trial < 1) throw new Error('Invalid trial identity.');
    const key = `${record.task_id}:${record.trial}`;
    if (records.has(key) || !['pass', 'fail', 'error'].includes(record.status)) throw new Error('Invalid or duplicate trial.');
    records.set(key, record);
  }
  return records;
}

function compareRuns(baseline, candidate) {
  const before = validatedRecords(baseline), after = validatedRecords(candidate);
  if (baseline.suite_sha256 !== candidate.suite_sha256 || baseline.grader_sha256 !== candidate.grader_sha256
    || before.size !== after.size || [...before.keys()].some(key => !after.has(key))) throw new Error('Runs require the same corpus, grader, tasks and trial numbers.');
  const tasks = new Map();
  let regressions = 0, improvements = 0;
  for (const [key, first] of before) {
    const last = after.get(key);
    if (first.status === 'error' || last.status === 'error') throw new Error('Infrastructure errors invalidate paired comparisons.');
    const delta = Number(last.status === 'pass') - Number(first.status === 'pass');
    if (delta < 0) regressions++;
    if (delta > 0) improvements++;
    const values = tasks.get(first.task_id) || [];
    values.push(delta); tasks.set(first.task_id, values);
  }
  const deltas = [...tasks.values()].map(values => values.reduce((a, b) => a + b, 0) / values.length);
  // Cluster by task: repeated trials of one task are not independent samples.
  let seed = 42;
  const samples = Array.from({ length: 2000 }, () => {
    let sum = 0;
    for (let i = 0; i < deltas.length; i++) {
      seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
      sum += deltas[seed % deltas.length];
    }
    return sum / deltas.length;
  }).sort((a, b) => a - b);
  return { schema_version: 1, baseline_run: baseline.run_id, candidate_run: candidate.run_id,
    tasks: tasks.size, paired_trials: before.size, regressions, improvements,
    pass_rate_delta: deltas.reduce((a, b) => a + b, 0) / deltas.length,
    interval_95: [samples[50], samples[1949]], method: 'paired task-cluster percentile bootstrap; 2000 resamples; seed 42',
    environment_match: JSON.stringify(baseline.environment) === JSON.stringify(candidate.environment),
    limitation: 'Descriptive pilot evidence; microtasks do not establish end-to-end product quality or model superiority.' };
}

module.exports = { compareRuns };
