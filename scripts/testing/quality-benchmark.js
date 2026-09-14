'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { normalizeProviderOutput, normalizeBaseline, classifyFindings } = require('../../src/lib/quality/result');
const { digest } = require('../../src/lib/quality/eval-suite');
const { writeJson } = require('../../src/lib/quality/files');

async function main() {
  const root = path.resolve(__dirname, '../..');
  const fixture = await fs.readFile(path.join(root, 'tests/fixtures/quality/fallow-3.23.0.json'));
  const native = JSON.parse(fixture), normalized = normalizeProviderOutput(native);
  const baseline = normalizeBaseline({ findings: normalized });
  const workload = () => { for (let i = 0; i < 1000; i++) classifyFindings(normalizeProviderOutput(native), baseline.findings, [], { all: true }); };
  for (let i = 0; i < 5; i++) workload();
  const samples = [];
  for (let i = 0; i < 30; i++) { const start = performance.now(); workload(); samples.push(performance.now() - start); }
  const sorted = [...samples].sort((a, b) => a - b);
  const result = { schema_version: 1, created_at: new Date().toISOString(), workload: '1000 captured-provider normalizations and baseline classifications',
    fixture_sha256: digest(fixture), warmup: 5, samples_ms: samples, median_ms: (sorted[14] + sorted[15]) / 2, p95_ms: sorted[28],
    environment: { node: process.version, platform: process.platform, arch: process.arch, cpu: os.cpus()[0]?.model },
    revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim(),
    dirty: Boolean(execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim()),
    limitation: 'Microbenchmark of adapter overhead only; not Fallow runtime, app latency or model quality. Informational until a stable platform baseline exists.' };
  const output = `.aioson/runtime/quality/benchmarks/${Date.now()}.json`;
  await writeJson(root, output, result, { exclusive: true });
  process.stdout.write(`${JSON.stringify({ output, median_ms: result.median_ms, p95_ms: result.p95_ms })}\n`);
}

main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 2; });
