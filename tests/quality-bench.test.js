'use strict';

// quality:bench — the measuring instrument @quality's performance method always
// named and never had: repeated samples of one argv, a replayable baseline
// (same workload by construction) and a paired verdict that only says
// faster/slower when the bootstrap interval excludes zero.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { runBench, compareBench, summarize } = require('../src/lib/quality/bench');
const { execute } = require('../src/lib/quality/process');

const CLI = path.resolve(__dirname, '../bin/aioson.js');

async function project(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-quality-bench-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, '.aioson'));
  return root;
}

// A harness whose reported duration is read from a file: the samples are exact,
// so verdicts are deterministic instead of depending on the test machine.
async function scriptedHarness(root, values) {
  await fs.writeFile(path.join(root, 'durations.json'), JSON.stringify(values));
  await fs.writeFile(path.join(root, 'harness.cjs'), [
    "const fs = require('node:fs');",
    "const values = JSON.parse(fs.readFileSync('durations.json', 'utf8'));",
    "const count = fs.existsSync('count.txt') ? Number(fs.readFileSync('count.txt', 'utf8')) : 0;",
    "fs.writeFileSync('count.txt', String(count + 1));",
    'console.log(JSON.stringify({ duration_ms: values[count % values.length] }));'
  ].join('\n'));
  await fs.rm(path.join(root, 'count.txt'), { force: true });
}

function result(samples, overrides = {}) {
  const argv = ['node', 'harness.cjs'];
  const digest = require('node:crypto').createHash('sha256').update(JSON.stringify(argv)).digest('hex');
  return {
    schema_version: 1, kind: 'bench', run_id: overrides.run_id || 'run', status: 'pass',
    benchmark: { label: 'orders-list', argv, argv_sha256: digest, metric: 'reported', samples: samples.length, warmup: 0, timeout_ms: 1000 },
    environment: { node: 'v22.0.0', platform: 'linux', arch: 'x64', cpu_model: 'cpu', cpus: 8, memory_gb: 16, ...(overrides.environment || {}) },
    source: { revision: null, dirty: null }, samples_ms: samples, warmup_ms: [], stats: summarize(samples)
  };
}

test('measures repeated samples and replays the baseline with the exact same benchmark', async (t) => {
  const root = await project(t);
  await scriptedHarness(root, [100, 102, 98, 101, 99]);
  const before = await runBench(root, { argv: '["node","harness.cjs"]', label: 'orders-list', metric: 'reported', samples: '5', warmup: '1' });
  assert.equal(before.ok, true, JSON.stringify(before.result.failure || {}));
  assert.equal(before.exitCode, 0);
  assert.equal(before.result.samples_ms.length, 5);
  assert.equal(before.result.warmup_ms.length, 1, 'warmup runs are kept apart from the measured samples');
  assert.equal(before.result.stats.n, 5);
  assert.equal(before.result.benchmark.metric, 'reported');
  assert.match(before.output, /^\.aioson\/runtime\/quality\/bench\/[0-9a-f-]+\/result\.json$/);
  const persisted = JSON.parse(await fs.readFile(path.join(root, before.output), 'utf8'));
  assert.deepEqual(persisted.samples_ms, before.result.samples_ms, 'raw samples are preserved');

  // The "optimization": the same argv now reports ~40% less.
  await scriptedHarness(root, [60, 61, 59, 62, 58]);
  const after = await runBench(root, { baseline: before.output });
  assert.deepEqual(after.result.benchmark, before.result.benchmark, 'the replay re-runs the recorded benchmark, never a remembered one');
  assert.equal(after.result.warmup_ms.length, 1);
  assert.equal(after.result.comparison.verdict, 'faster');
  assert.ok(after.result.comparison.delta_pct < -35);
  assert.ok(after.result.comparison.interval_95_pct[1] < 0);
});

test('the paired verdict needs both an interval that excludes zero and the minimum effect', () => {
  const base = result([100, 102, 98, 101, 99, 100, 103, 97], { run_id: 'a' });
  assert.equal(compareBench(base, result([60, 61, 59, 62, 58, 60, 63, 57], { run_id: 'b' })).verdict, 'faster');
  assert.equal(compareBench(base, result([140, 141, 139, 142, 138, 140, 143, 137], { run_id: 'c' })).verdict, 'slower');
  assert.equal(compareBench(base, result([99, 101, 100, 103, 97, 102, 98, 100], { run_id: 'd' })).verdict, 'inconclusive');
  // A real but tiny change: the interval excludes zero, and the default 5%
  // effect floor still holds the verdict back.
  const tightBase = result([100, 100, 101, 99, 100, 101, 99, 100], { run_id: 'a2' });
  const tightCandidate = result([97, 97, 98, 96, 97, 98, 96, 97], { run_id: 'e' });
  const tiny = compareBench(tightBase, tightCandidate);
  assert.equal(tiny.verdict, 'inconclusive');
  assert.ok(tiny.interval_95_pct[1] < 0, `interval ${tiny.interval_95_pct} should exclude zero`);
  assert.equal(compareBench(tightBase, tightCandidate, { 'min-effect': '1' }).verdict, 'faster');
  // Deterministic: the seeded bootstrap returns the same interval every time.
  assert.deepEqual(compareBench(base, result([60, 61, 59, 62, 58], { run_id: 'f' })).interval_95_pct,
    compareBench(base, result([60, 61, 59, 62, 58], { run_id: 'f' })).interval_95_pct);
});

test('the bootstrap resamples with replacement: eight noisy samples never give a zero-width interval', () => {
  // The first implementation drew `seed % n` from a 32-bit LCG, whose low bits
  // cycle with period 2^k: for n = 8 every resample was a permutation of the
  // original, so a -2% delta came back as the "interval" [-2, -2] and any
  // nonzero delta excluded zero.
  const base = result([100, 102, 98, 101, 99, 100, 103, 97], { run_id: 'a' });
  const near = compareBench(base, result([98, 99, 97, 98, 96, 98, 100, 95], { run_id: 'n' }));
  const [low, high] = near.interval_95_pct;
  assert.ok(high - low > 1, `interval ${low}..${high} is too narrow for eight noisy samples`);
  assert.ok(low <= near.delta_pct && near.delta_pct <= high, 'the point estimate lies inside its interval');
  assert.equal(near.verdict, 'inconclusive');
});

test('a different machine is not comparable and a different benchmark is refused', () => {
  const base = result([100, 102, 98, 101, 99]);
  const elsewhere = compareBench(base, result([60, 61, 59, 62, 58], { environment: { cpu_model: 'other cpu' } }));
  assert.equal(elsewhere.verdict, 'not_comparable');
  assert.deepEqual(elsewhere.environment_differs, ['cpu_model']);
  const otherArgv = result([60, 61, 59, 62, 58]);
  otherArgv.benchmark = { ...otherArgv.benchmark, argv: ['node', 'other.cjs'] };
  assert.throws(() => compareBench(base, otherArgv), /identity|same argv/);
  const otherMetric = result([60, 61, 59, 62, 58]);
  otherMetric.benchmark = { ...otherMetric.benchmark, metric: 'wall' };
  assert.throws(() => compareBench(base, otherMetric), /same argv and metric/);
  assert.throws(() => compareBench(base, { ...result([1, 2]), samples_ms: [1, 2] }), /at least 5/);
});

test('a failing command or a missing reported metric is an error, never a timing', async (t) => {
  const root = await project(t);
  const failing = await runBench(root, { argv: '["node","-e","process.exit(3)"]', label: 'broken', samples: '5', warmup: '0' });
  assert.equal(failing.ok, false);
  assert.equal(failing.exitCode, 2);
  assert.equal(failing.result.status, 'error');
  assert.equal(failing.result.failure.exit_code, 3);
  assert.equal(failing.result.stats, null);
  const silent = await runBench(root, { argv: '["node","-e","console.log(1)"]', label: 'silent', metric: 'reported', samples: '5', warmup: '0' });
  assert.equal(silent.result.status, 'error');
  assert.equal(silent.result.failure.reason, 'reported_metric_missing');
  await assert.rejects(runBench(root, { baseline: failing.output }), /completed bench results/);
});

test('invalid input fails before any command runs, and evidence never escapes or overwrites', async (t) => {
  const root = await project(t);
  await assert.rejects(runBench(root, {}), /--argv=<JSON argv>/);
  await assert.rejects(runBench(root, { argv: 'node app.js', label: 'x' }), /JSON array/);
  await assert.rejects(runBench(root, { argv: '["node","-e","0"]' }), /--label/);
  await assert.rejects(runBench(root, { argv: '["node","-e","0"]', label: 'Bad Label' }), /--label/);
  await assert.rejects(runBench(root, { argv: '["node","-e","0"]', label: 'x', samples: '3' }), /Samples/);
  await assert.rejects(runBench(root, { argv: '["node","-e","0"]', label: 'x', metric: 'cpu' }), /--metric/);
  await assert.rejects(runBench(root, { baseline: true }), /--baseline=<result\.json>/);
  await assert.rejects(runBench(root, { argv: '["node","-e","0"]', label: 'x', output: '../escape.json' }), /inside/);
  const first = await runBench(root, { argv: '["node","-e","0"]', label: 'x', samples: '5', warmup: '0', output: 'bench.json' });
  assert.equal(first.ok, true);
  await assert.rejects(runBench(root, { argv: '["node","-e","0"]', label: 'x', samples: '5', warmup: '0', output: 'bench.json' }), /EEXIST|overwrite/);
});

test('the public CLI measures, replays and compares with explicit exit codes', async (t) => {
  const root = await project(t);
  await scriptedHarness(root, [100, 102, 98, 101, 99]);
  const measured = await execute(['node', CLI, 'quality:bench', root, '--argv=["node","harness.cjs"]', '--label=orders-list', '--metric=reported', '--samples=5', '--warmup=0', '--json'], { cwd: root });
  assert.equal(measured.status, 'pass', measured.stderr + measured.stdout);
  const before = JSON.parse(measured.stdout);
  await scriptedHarness(root, [100, 101, 99, 102, 98]);
  const replay = await execute(['node', CLI, 'quality:bench', root, `--baseline=${before.output}`, '--json'], { cwd: root });
  assert.equal(replay.status, 'pass', replay.stderr + replay.stdout);
  const after = JSON.parse(replay.stdout);
  assert.equal(after.result.comparison.verdict, 'inconclusive', 'an unchanged workload is never reported as an improvement');
  const compared = await execute(['node', CLI, 'quality:bench', root, `--baseline=${before.output}`, `--compare=${after.output}`], { cwd: root });
  assert.equal(compared.status, 'pass', compared.stderr + compared.stdout);
  assert.match(compared.stdout, /→ inconclusive/);
  const invalid = await execute(['node', CLI, 'quality:bench', root, '--argv=nope', '--label=x', '--json'], { cwd: root });
  assert.equal(invalid.exit_code, 2);
});
