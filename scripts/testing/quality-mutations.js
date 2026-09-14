'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execute } = require('../../src/lib/quality/process');
const { writeJson } = require('../../src/lib/quality/files');

const probes = [
  { id: 'unknown-schema-as-pass', file: 'src/lib/quality/result.js', before: "throw new Error('Unrecognized quality provider schema; no analysis can be inferred.');", after: 'return [];' },
  { id: 'line-sensitive-baseline', file: 'src/lib/quality/result.js', before: "finding.fingerprint || '',", after: "String(finding.line || '')," },
  { id: 'provider-crash-as-success', file: 'src/lib/quality/provider.js', before: 'error.code !== 1 || error.killed', after: '![1, 2].includes(error.code) || error.killed' },
  { id: 'ignore-severity-regression', file: 'src/lib/quality/result.js', before: 'severityOrder.indexOf(finding.severity) > severityOrder.indexOf(previous.severity)', after: 'false' },
  { id: 'ignore-metric-regression', file: 'src/lib/quality/result.js', before: 'value > previous.metrics[metric]', after: 'false' }
];

async function main() {
  const root = path.resolve(__dirname, '../..');
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-mutations-'));
  try {
    for (const dir of ['src', 'bin']) await fs.cp(path.join(root, dir), path.join(workspace, dir), { recursive: true });
    await fs.mkdir(path.join(workspace, 'tests'), { recursive: true });
    await fs.copyFile(path.join(root, 'tests/quality-audit-regressions.test.js'), path.join(workspace, 'tests/quality-audit-regressions.test.js'));
    await fs.cp(path.join(root, 'tests/fixtures/quality'), path.join(workspace, 'tests/fixtures/quality'), { recursive: true });
    await fs.symlink(path.join(root, 'node_modules'), path.join(workspace, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    const argv = ['node', '--test', '--test-concurrency=1', 'tests/quality-audit-regressions.test.js'];
    const baseline = await execute(argv, { cwd: workspace, timeout: 120000 });
    if (baseline.status !== 'pass') throw new Error(`Mutation baseline failed: ${baseline.stdout}\n${baseline.stderr}`);
    const results = [];
    for (const probe of probes) {
      const file = path.join(workspace, probe.file), original = await fs.readFile(file, 'utf8');
      if (original.split(probe.before).length !== 2) throw new Error(`Mutation anchor changed: ${probe.id}`);
      await fs.writeFile(file, original.replace(probe.before, probe.after));
      const syntax = await execute(['node', '--check', probe.file], { cwd: workspace });
      const measured = syntax.status === 'pass' ? await execute(argv, { cwd: workspace, timeout: 120000 }) : syntax;
      results.push({ id: probe.id, status: syntax.status !== 'pass' || measured.status === 'error' ? 'error' : measured.status === 'fail' ? 'killed' : 'survived', ...probe, evidence: measured });
      await fs.writeFile(file, original);
    }
    const result = { schema_version: 1, kind: 'targeted-mutation-probes', total: results.length, killed: results.filter(r => r.status === 'killed').length,
      limitation: 'Five curated fault injections; not a whole-repository mutation score.', results };
    const output = `.aioson/runtime/quality/mutations/${Date.now()}.json`;
    await writeJson(root, output, result, { exclusive: true });
    process.stdout.write(`${JSON.stringify({ output, killed: result.killed, total: result.total })}\n`);
    process.exitCode = result.killed === result.total ? 0 : 1;
  } finally { await fs.rm(workspace, { recursive: true, force: true }); }
}

main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 2; });
