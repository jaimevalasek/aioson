'use strict';

// Repeated-sample timing of one argv on this machine, and the paired
// before/after comparison that turns "it feels faster" into a verdict.
// engineering.md always told @quality to "benchmark only an identified
// hotspot, with fixed workload, warmup and repeated samples; preserve raw
// samples" — but no command did it, so a request to make a system faster was
// answered with one timed run or a guess. A replayed baseline (`--baseline`)
// re-runs the exact argv, sample count and metric it recorded: the same
// workload by construction, never by memory.

const os = require('node:os');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { execute, commandFor } = require('./process');
const { writeJson, ensureNewOutput } = require('./files');
const { sourceIdentity } = require('./provenance');
const { seededRandom, resample } = require('./random');

const LABEL = /^[a-z0-9][a-z0-9-]{0,63}$/;
const METRICS = ['wall', 'reported'];
const COMPARABLE = ['node', 'platform', 'arch', 'cpu_model', 'cpus'];
const RESAMPLES = 2000;
// Below five samples a bootstrapped median takes a handful of values: the
// interval would look precise without being so.
const MIN_SAMPLES = 5;
const LIMITATION = 'Timing of this argv on this machine. Compare only paired runs of the same argv and metric in the same environment; a timing delta is evidence for a decision, never a product gate.';

const round = (value) => Math.round(value * 100) / 100;
const digest = (argv) => createHash('sha256').update(JSON.stringify(argv)).digest('hex');
const tail = (value) => String(value || '').slice(-500);

function bounded(value, fallback, min, max, label) {
  const number = Number(value ?? fallback);
  if (!Number.isInteger(number) || number < min || number > max) throw new Error(`${label} must be an integer ${min}..${max}.`);
  return number;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function summarize(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const center = median(sorted);
  const mad = median(sorted.map((value) => Math.abs(value - center)));
  const p95 = sorted[Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1)];
  return { n: sorted.length, min: round(sorted[0]), median: round(center), p95: round(p95), max: round(sorted[sorted.length - 1]),
    mean: round(sorted.reduce((sum, value) => sum + value, 0) / sorted.length), mad: round(mad),
    noise_pct: center > 0 ? round((mad / center) * 100) : null };
}

function environment() {
  const cpus = os.cpus();
  return { node: process.version, platform: process.platform, arch: process.arch,
    cpu_model: cpus[0] ? cpus[0].model.trim() : null, cpus: cpus.length, memory_gb: Math.round(os.totalmem() / 2 ** 30) };
}

function validateResult(run) {
  if (!run || run.schema_version !== 1 || run.kind !== 'bench' || run.status !== 'pass') throw new Error('Comparison requires completed bench results (kind bench, status pass).');
  const spec = run.benchmark || {};
  commandFor(spec.argv);
  if (spec.argv_sha256 !== digest(spec.argv) || !METRICS.includes(spec.metric)) throw new Error('Bench result benchmark identity is not intact.');
  if (!Array.isArray(run.samples_ms) || run.samples_ms.length < MIN_SAMPLES || !run.samples_ms.every((value) => Number.isFinite(value) && value >= 0)) throw new Error(`Bench result needs at least ${MIN_SAMPLES} numeric samples.`);
  return run;
}

async function readResult(root, file) {
  if (typeof file !== 'string' || !file) throw new Error('Pass result files as --baseline=<result.json> / --compare=<result.json>.');
  return validateResult(JSON.parse(await fs.readFile(path.resolve(root, file), 'utf8')));
}

function benchmarkSpec(options, baseline) {
  if (baseline) return { ...baseline.benchmark };
  if (!options.argv) throw new Error('Supply --argv=<JSON argv> --label=<name>, or --baseline=<result.json> to replay a measured benchmark.');
  let argv;
  try { argv = JSON.parse(options.argv); } catch { throw new Error('--argv must be a JSON array of strings.'); }
  commandFor(argv);
  if (typeof options.label !== 'string' || !LABEL.test(options.label)) throw new Error('A benchmark requires --label=<kebab-case name>.');
  const metric = options.metric || 'wall';
  if (!METRICS.includes(metric)) throw new Error('--metric must be wall or reported.');
  return { label: options.label, argv, argv_sha256: digest(argv), metric,
    samples: bounded(options.samples, 10, MIN_SAMPLES, 100, 'Samples'), warmup: bounded(options.warmup, 2, 0, 20, 'Warmup'),
    timeout_ms: bounded(options.timeout, 60000, 1, 600000, 'Timeout') };
}

// `reported`: the harness prints `{"duration_ms": <n>}` as its last stdout line,
// timing only the hot path (process start-up excluded).
function reportedDuration(stdout) {
  const line = String(stdout || '').trim().split(/\r?\n/).filter(Boolean).pop();
  try {
    const value = JSON.parse(line).duration_ms;
    return Number.isFinite(value) && value >= 0 ? value : null;
  } catch { return null; }
}

async function sampleOnce(root, spec) {
  const started = performance.now();
  const run = await execute(spec.argv, { cwd: root, timeout: spec.timeout_ms });
  const wall = performance.now() - started;
  if (run.status !== 'pass') return { error: { status: run.status, reason: run.reason || 'nonzero_exit', exit_code: run.exit_code, stderr_tail: tail(run.stderr) } };
  if (spec.metric === 'wall') return { value: round(wall) };
  const reported = reportedDuration(run.stdout);
  return reported === null ? { error: { status: 'error', reason: 'reported_metric_missing', stdout_tail: tail(run.stdout) } } : { value: round(reported) };
}

async function collect(root, spec, budget) {
  const warmup = [];
  const samples = [];
  const started = performance.now();
  for (let index = 0; index < spec.warmup + spec.samples; index++) {
    const phase = index < spec.warmup ? 'warmup' : 'sample';
    if (performance.now() - started > budget) return { warmup, samples, failure: { phase, index, status: 'error', reason: 'budget_exhausted' } };
    const measured = await sampleOnce(root, spec);
    if (measured.error) return { warmup, samples, failure: { phase, index, ...measured.error } };
    (phase === 'warmup' ? warmup : samples).push(measured.value);
  }
  return { warmup, samples, failure: null };
}

// Percentile bootstrap of the ratio of medians, resampling each run on its
// own (the runs are independent). Seeded, so the same samples always give the
// same interval; the draw comes from `random.js`, never from `seed % n`.
function bootstrapInterval(before, after) {
  const next = seededRandom(42);
  const ratios = Array.from({ length: RESAMPLES }, () => {
    const a = median(resample(before, next));
    const b = median(resample(after, next));
    return a > 0 ? (b / a - 1) * 100 : 0;
  }).sort((x, y) => x - y);
  return [round(ratios[Math.floor(RESAMPLES * 0.025)]), round(ratios[Math.ceil(RESAMPLES * 0.975) - 1])];
}

function compareBench(before, after, options = {}) {
  validateResult(before);
  validateResult(after);
  if (before.benchmark.argv_sha256 !== after.benchmark.argv_sha256 || before.benchmark.metric !== after.benchmark.metric) {
    throw new Error('Comparison requires the same argv and metric — replay the baseline with --baseline=<result.json>.');
  }
  const minEffect = Number(options['min-effect'] ?? 5);
  if (!Number.isFinite(minEffect) || minEffect < 0 || minEffect > 100) throw new Error('--min-effect must be a percentage 0..100.');
  const baseMedian = median(before.samples_ms);
  if (!(baseMedian > 0)) throw new Error('Baseline median must be positive to compare.');
  const deltaPct = round((median(after.samples_ms) / baseMedian - 1) * 100);
  const interval = bootstrapInterval(before.samples_ms, after.samples_ms);
  const differs = COMPARABLE.filter((key) => (before.environment || {})[key] !== (after.environment || {})[key]);
  let verdict = 'inconclusive';
  if (differs.length) verdict = 'not_comparable';
  else if (interval[1] < 0 && deltaPct <= -minEffect) verdict = 'faster';
  else if (interval[0] > 0 && deltaPct >= minEffect) verdict = 'slower';
  return { schema_version: 1, kind: 'bench-comparison', label: after.benchmark.label, metric: after.benchmark.metric,
    baseline_run: before.run_id, candidate_run: after.run_id,
    baseline_revision: (before.source || {}).revision || null, candidate_revision: (after.source || {}).revision || null,
    baseline_median_ms: round(baseMedian), candidate_median_ms: round(median(after.samples_ms)),
    delta_pct: deltaPct, interval_95_pct: interval, min_effect_pct: minEffect, verdict, environment_differs: differs,
    method: `percentile bootstrap of the median ratio; ${RESAMPLES} resamples; seed 42; faster/slower only when the interval excludes 0 and the change reaches min_effect`,
    limitation: LIMITATION };
}

async function runBench(root, options = {}) {
  if (options.baseline === true) throw new Error('Use --baseline=<result.json> (with "=").');
  const baseline = options.baseline ? await readResult(root, options.baseline) : null;
  const spec = benchmarkSpec(options, baseline);
  const budget = bounded(options.budget, 600000, 1000, 3600000, 'Budget');
  await ensureNewOutput(root, options.output);
  const runId = randomUUID();
  const createdAt = new Date().toISOString();
  const source = await sourceIdentity(root);
  const { warmup, samples, failure } = await collect(root, spec, budget);
  const result = { schema_version: 1, kind: 'bench', run_id: runId, created_at: createdAt, finished_at: new Date().toISOString(),
    benchmark: spec, environment: environment(), source, status: failure ? 'error' : 'pass', ...(failure ? { failure } : {}),
    warmup_ms: warmup, samples_ms: samples, stats: samples.length ? summarize(samples) : null, limitation: LIMITATION };
  if (baseline && !failure) result.comparison = compareBench(baseline, result, options);
  const output = options.output || `.aioson/runtime/quality/bench/${runId}/result.json`;
  await writeJson(root, output, result, { exclusive: true });
  return { ok: !failure, exitCode: failure ? 2 : 0, result, output };
}

module.exports = { runBench, compareBench, readResult, summarize };
