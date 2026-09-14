'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { normalizeProviderOutput, normalizeBaseline, classifyFindings } = require('../src/lib/quality/result');
const { runProvider, getChangedPaths } = require('../src/lib/quality/provider');
const { runQualityAudit, detectFeatureSlug } = require('../src/commands/quality-audit');
const native = require('./fixtures/quality/fallow-3.23.0.json');

async function project(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-quality-regression-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

async function write(root, file, value) {
  await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
  await fs.writeFile(path.join(root, file), typeof value === 'string' ? value : JSON.stringify(value));
}

test('real Fallow 3.23 combined output retains dead file and export findings', () => {
  const findings = normalizeProviderOutput(native);
  assert.equal(findings.length, 2);
  assert.ok(findings.some(f => f.path === 'src/orphan.js' && f.category === 'dead-code'));
  assert.ok(findings.some(f => f.path === 'src/helpers.js' && f.message.includes('unused')));
});

test('real health, size and duplication records survive normalization and clone ranking changes', () => {
  const captured = require('./fixtures/quality/fallow-health-dupes-3.23.0.json');
  const before = normalizeProviderOutput(captured);
  assert.ok(before.some(f => f.rule === 'function-size'));
  assert.ok(before.some(f => f.rule === 'complexity'));
  assert.ok(before.some(f => f.rule === 'code-duplication'));
  const moved = structuredClone(captured);
  moved.dupes.clone_groups[0].fingerprint += '-r999';
  for (const instance of moved.dupes.clone_groups[0].instances) instance.start_line += 1;
  const after = normalizeProviderOutput(moved);
  assert.ok(classifyFindings(after, before, [], { all: true }).every(f => f.classification === 'baseline'));
  const truncated = structuredClone(captured); truncated.health.findings = [];
  assert.throws(() => normalizeProviderOutput(truncated), /Incomplete/);
});

test('unknown, truncated and error provider envelopes cannot become empty success', () => {
  for (const output of [{}, null, { unexpected_schema: { diagnostics: [] } },
    { kind: 'combined', schema_version: 999, check: {} }, { error: true, issues: [] },
    { issues: [null] }, { issues: [{ message: 'missing location' }] }]) {
    assert.throws(() => normalizeProviderOutput(output));
  }
  assert.deepEqual(normalizeProviderOutput({ issues: [] }), []);
});

test('baseline matching survives line movement and distinguishes repeated new findings', () => {
  const finding = { fingerprint: 'stable', path: 'src/a.js', line: 10, category: 'complexity', severity: 'high', message: 'Complex branch' };
  const baseline = normalizeBaseline({ findings: [finding] });
  const candidate = normalizeProviderOutput({ findings: [{ ...finding, line: 11 }, { ...finding, fingerprint: 'new', line: 20 }] });
  assert.deepEqual(classifyFindings(candidate, baseline.findings, ['src/a.js']).map(f => f.classification), ['baseline', 'new']);
});

test('rule id is not treated as a unique occurrence fingerprint', () => {
  const finding = { ruleId: 'complexity', path: 'src/a.js', line: 10, message: 'Complex branch', severity: 'high' };
  const baseline = normalizeBaseline({ findings: [finding] });
  const candidate = normalizeProviderOutput({ findings: [{ ...finding, line: 11 }, { ...finding, line: 20 }] });
  assert.deepEqual(classifyFindings(candidate, baseline.findings, ['src/a.js']).map(f => f.classification), ['baseline', 'new']);
});

test('persisted baseline identity survives normalization; severity and metric increases remain new', () => {
  const raw = { ruleId: 'complexity', path: 'src/a.js', line: 1, message: 'Complex branch', severity: 'medium', metrics: { cognitive: 10 } };
  const before = normalizeProviderOutput({ findings: [raw] });
  const saved = normalizeBaseline(JSON.parse(JSON.stringify({ findings: before })));
  assert.equal(classifyFindings(before, saved.findings, [], { all: true })[0].classification, 'baseline');
  for (const change of [{ severity: 'high' }, { metrics: { cognitive: 11 } }]) {
    const after = normalizeProviderOutput({ findings: [{ ...raw, ...change }] });
    assert.equal(classifyFindings(after, saved.findings, [], { all: true })[0].classification, 'new');
  }
  assert.equal(classifyFindings([{ ...before[0], path: 'src/b.js' }], saved.findings, ['src/b.js'], { renames: { 'src/a.js': 'src/b.js' } })[0].classification, 'baseline');
});

test('output containment rejects parent traversal and directory junctions', async t => {
  const { containedOutput } = require('../src/lib/quality/files');
  const root = await project(t), outside = await project(t);
  await assert.rejects(containedOutput(root, '../escaped.json'), /inside/);
  await fs.symlink(outside, path.join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(containedOutput(root, 'linked/report.json'), /symbolic link/);
});

test('committed CI changes use explicit base/head, including filenames with spaces', async t => {
  const root = await project(t);
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true });
  git('init', '-q');
  await write(root, 'base.js', 'module.exports = 1;');
  git('add', '.'); git('-c', 'user.name=Quality Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'base');
  const base = git('rev-parse', 'HEAD').trim();
  await write(root, 'src/new file.js', 'module.exports = 2;');
  git('add', '.'); git('-c', 'user.name=Quality Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'change');
  assert.deepEqual(await getChangedPaths(root, { base, head: 'HEAD' }), ['src/new file.js']);
  await assert.rejects(getChangedPaths(root, { base: 'does-not-exist', head: 'HEAD' }));
  await assert.rejects(getChangedPaths(root, { base: '--help' }));
});

test('npm provider entrypoint executes through Node on every platform', async t => {
  const root = await project(t);
  await write(root, 'node_modules/fallow/package.json', { name: 'fallow', version: '3.23.0', bin: { fallow: 'bin/fallow' } });
  await write(root, 'node_modules/fallow/bin/fallow', "process.stdout.write(JSON.stringify({issues: [], args: process.argv.slice(2)}));");
  const result = await runProvider(root);
  assert.equal(result.ok, true, result.advisory);
  assert.ok(result.output.args.includes('--format'));
  assert.ok(result.output.args.includes('json'));
});

test('a provider crash remains error even with parseable output', async t => {
  const root = await project(t);
  await write(root, 'node_modules/fallow/package.json', { name: 'fallow', version: '3.23.0', bin: 'bin/fallow' });
  await write(root, 'node_modules/fallow/bin/fallow', "console.log(JSON.stringify({issues: []})); process.exitCode = 2;");
  const result = await runProvider(root);
  assert.equal(result.ok, false);
});

test('strict audit cannot approve a missing provider or unreadable baseline', async t => {
  const root = await project(t);
  const missing = await runQualityAudit({ args: [root], options: { strict: true, json: true, changed: 'src/a.js' } });
  assert.equal(missing.ok, false);
  assert.equal(missing.exitCode, 2);
  assert.equal(missing.result.measurement.status, 'not_run');
  await write(root, 'provider.json', { issues: [] });
  const broken = await runQualityAudit({ args: [root], options: { strict: true, json: true, changed: 'src/a.js', baseline: 'missing.json', 'provider-output': 'provider.json' } });
  assert.equal(broken.ok, false);
  assert.equal(broken.exitCode, 2);
});

test('baseline provider and configuration drift are explicit measurement errors', async t => {
  const root = await project(t);
  await write(root, 'provider.json', { version: '3.23.0', findings: [] });
  const options = { feature: 'project', all: true, strict: true, baseline: 'baseline.json', 'provider-output': 'provider.json', 'no-persist': true };
  for (const baseline of [null, { findings: [], provider_version: '0.0.0' }, { findings: [], provider: { version: '0.0.0' } }, { findings: [], config_sha256: 'different' }]) {
    await write(root, 'baseline.json', baseline);
    const result = await runQualityAudit({ args: [root], options });
    assert.equal(result.exitCode, 2); assert.equal(result.result.measurement.status, 'error');
  }
});

test('malformed output is an error in the public audit command', async t => {
  const root = await project(t);
  await write(root, 'provider.json', { unexpected_schema: { diagnostics: [] } });
  const result = await runQualityAudit({ args: [root], options: { json: true, changed: 'src/a.js', 'provider-output': 'provider.json' } });
  assert.equal(result.ok, false);
  assert.equal(result.exitCode, 2);
  assert.equal(result.result.status, 'error');
});

test('audit follows canonical feature resolution and rejects report escape', async t => {
  const root = await project(t);
  await write(root, '.aioson/context/project-pulse.md', '---\nactive_feature: current-feature\n---\n');
  await write(root, '.aioson/context/dev-state.md', '---\nactive_feature: stale-feature\n---\n');
  assert.equal(await detectFeatureSlug(root), 'current-feature');
  await assert.rejects(runQualityAudit({ args: [root], options: { report: '../escape.md', json: true } }));
});
