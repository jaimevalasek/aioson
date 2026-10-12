'use strict';

const { resolveQualityTarget } = require('../lib/quality/target');
const { runBench, compareBench, readResult } = require('../lib/quality/bench');
const { writeJson } = require('../lib/quality/files');

function describeComparison(comparison) {
  const [low, high] = comparison.interval_95_pct;
  return `  vs ${comparison.baseline_run}: ${comparison.delta_pct > 0 ? '+' : ''}${comparison.delta_pct}% (95% interval ${low}..${high}%) → ${comparison.verdict}${comparison.environment_differs.length ? ` (environment differs: ${comparison.environment_differs.join(', ')})` : ''}`;
}

function describe(payload) {
  const result = payload.result;
  if (result.kind === 'bench-comparison') return describeComparison(result).trim();
  const label = result.benchmark.label;
  if (result.status !== 'pass') {
    const failure = result.failure || {};
    return `quality:bench — ${label}: ERROR ${failure.reason || failure.status} at ${failure.phase} #${failure.index} — a failing command is not a timing → ${payload.output}`;
  }
  const s = result.stats;
  const lines = [`quality:bench — ${label}: median ${s.median} ms | p95 ${s.p95} ms | noise ${s.noise_pct ?? 'n/a'}% | n=${s.n} (${result.benchmark.metric}) → ${payload.output}`];
  if (result.comparison) lines.push(describeComparison(result.comparison));
  return lines.join('\n');
}

async function runQualityBench({ args, options = {}, logger }) {
  const root = resolveQualityTarget(args);
  let payload;
  if (options.compare) {
    if (!options.baseline || options.baseline === true) throw new Error('Comparison requires --baseline=<result.json>.');
    const result = compareBench(await readResult(root, options.baseline), await readResult(root, options.compare), options);
    if (options.output) await writeJson(root, options.output, result, { exclusive: true });
    payload = { ok: true, exitCode: 0, result, ...(options.output ? { output: options.output } : {}) };
  } else {
    payload = await runBench(root, options);
  }
  if (!options.json && logger) logger.log(describe(payload));
  return payload;
}

module.exports = { runQualityBench };
