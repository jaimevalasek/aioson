'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const {
  normalizeProviderOutput,
  normalizeBaseline,
  classifyFindings,
  buildQualityResult
} = require('../src/lib/quality/result');
const { runQualityAudit } = require('../src/commands/quality-audit');
const { getChangedPaths } = require('../src/lib/quality/provider');

const mockLogger = { log: () => {}, error: () => {}, warn: () => {} };
const cliPath = path.join(__dirname, '..', 'bin', 'aioson.js');

async function writeFileEnsured(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
}

async function writeJson(filePath, data) {
  await writeFileEnsured(filePath, JSON.stringify(data, null, 2));
}

function fallowLikeOutput(findings) {
  return {
    tool: 'fallow',
    version: '1.0.0-test',
    issues: findings
  };
}

describe('quality:audit — result contract', () => {
  it('normalizes provider output into the AIOSON-owned contract fields', () => {
    const findings = normalizeProviderOutput(fallowLikeOutput([
      {
        rule: 'unused-export',
        file: 'src/example.js',
        startLine: 12,
        level: 'warning',
        message: 'Unused export'
      }
    ]));
    const result = buildQualityResult({
      provider: { name: 'fallow', version: '1.0.0-test', command: 'fixture' },
      scope: { root: '.', changed_paths: ['src/example.js'] },
      baselineRef: null,
      findings: classifyFindings(findings, [], ['src/example.js']),
      advisory: []
    });

    assert.equal(result.status, 'fail');
    assert.equal(result.mode, 'changed-code');
    assert.equal(result.provider.name, 'fallow');
    assert.deepEqual(result.scope.changed_paths, ['src/example.js']);
    assert.equal(result.baseline_ref, null);
    assert.equal(result.findings[0].classification, 'new');
    assert.equal(result.summary.by_classification.new, 1);
    assert.deepEqual(result.advisory, []);
    assert.equal(Object.hasOwn(result, 'issues'), false);
  });

  it('marks the same finding as baseline-only and does not fail', () => {
    const native = fallowLikeOutput([
      { id: 'dead-a', category: 'dead-code', severity: 'high', path: 'src/legacy.js', line: 7, message: 'Unused function' }
    ]);
    const findings = normalizeProviderOutput(native);
    const baseline = normalizeBaseline({ baseline_id: 'base-1', findings: native.issues });
    const result = buildQualityResult({
      provider: { name: 'fallow', version: null, command: 'fixture' },
      scope: { root: '.', changed_paths: ['src/legacy.js'] },
      baselineRef: baseline.ref,
      findings: classifyFindings(findings, baseline.findings, ['src/legacy.js']),
      advisory: []
    });

    assert.equal(result.status, 'warn');
    assert.equal(result.findings[0].classification, 'baseline');
    assert.equal(result.summary.by_classification.baseline, 1);
  });

  it('marks a changed-code finding absent from baseline as a new regression', () => {
    const findings = normalizeProviderOutput(fallowLikeOutput([
      { id: 'dup-a', category: 'duplication', severity: 'medium', path: 'src/new.js', line: 3, message: 'Duplicated branch' }
    ]));
    const baseline = normalizeBaseline({ baseline_id: 'base-1', findings: [] });
    const result = buildQualityResult({
      provider: { name: 'fallow', version: null, command: 'fixture' },
      scope: { root: '.', changed_paths: ['src/new.js'] },
      baselineRef: baseline.ref,
      findings: classifyFindings(findings, baseline.findings, ['src/new.js']),
      advisory: []
    });

    assert.equal(result.status, 'fail');
    assert.equal(result.findings[0].classification, 'new');
  });
});

describe('quality:audit — command behavior', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-quality-audit-'));
    await writeFileEnsured(path.join(tmpDir, '.aioson', 'context', 'dev-state.md'), [
      '---',
      'active_feature: quality-governance-baseline-and-new-regression-gate',
      '---',
      ''
    ].join('\n'));
    await writeFileEnsured(path.join(tmpDir, '.aioson', 'rules', 'agent-structural-contract.md'), '# Agent Structural Contract\n');
    await writeFileEnsured(path.join(tmpDir, '.aioson', 'design-docs', 'file-size.md'), '# File Size\n');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('returns warn when the provider is missing and does not auto-install it', async () => {
    const result = await runQualityAudit({
      args: [tmpDir],
      options: { json: true, changed: 'src/a.js' },
      logger: mockLogger
    });

    assert.equal(result.ok, true);
    assert.equal(result.result.status, 'warn');
    assert.match(result.result.advisory.join('\n'), /does not auto-install/);
  });

  it('returns pass when provider output has no confirmed new regressions', async () => {
    const providerPath = path.join(tmpDir, 'provider.json');
    await writeJson(providerPath, fallowLikeOutput([]));

    const result = await runQualityAudit({
      args: [tmpDir],
      options: { json: true, 'provider-output': providerPath, changed: 'src/a.js' },
      logger: mockLogger
    });

    assert.equal(result.result.status, 'pass');
    assert.equal(result.result.findings.length, 0);
  });

  it('writes a Markdown report with governance sources and limitations', async () => {
    const providerPath = path.join(tmpDir, 'provider.json');
    await writeJson(providerPath, fallowLikeOutput([
      { category: 'governance', severity: 'advisory', path: 'src/a.js', message: 'file size advisory', action: 'Split module' }
    ]));

    const result = await runQualityAudit({
      args: [tmpDir],
      options: { json: true, 'provider-output': providerPath, changed: 'src/a.js' },
      logger: mockLogger
    });
    const report = await fs.readFile(path.join(tmpDir, result.report_path), 'utf8');

    assert.equal(result.report_path, '.aioson/context/quality-report-quality-governance-baseline-and-new-regression-gate.md');
    assert.match(report, /Status: pass/);
    assert.match(report, /\.aioson\/rules\/agent-structural-contract\.md/);
    assert.match(report, /\.aioson\/design-docs\/file-size\.md/);
    assert.match(report, /Provider raw JSON is not written/);
    assert.doesNotMatch(report, /process\.env|SECRET|TOKEN=/);
  });

  it('CLI JSON output includes ok plus result status', async () => {
    const providerPath = path.join(tmpDir, 'provider.json');
    await writeJson(providerPath, fallowLikeOutput([]));
    const cli = spawnSync(process.execPath, [
      cliPath,
      'quality:audit',
      tmpDir,
      '--provider-output',
      providerPath,
      '--changed',
      'src/a.js',
      '--json'
    ], { encoding: 'utf8' });

    assert.equal(cli.status, 0, cli.stderr);
    const parsed = JSON.parse(cli.stdout);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.result.status, 'pass');
  });

  it('CLI help includes quality:audit', () => {
    const cli = spawnSync(process.execPath, [cliPath, 'help'], { encoding: 'utf8' });

    assert.equal(cli.status, 0, cli.stderr);
    assert.match(cli.stdout, /quality:audit/);
  });

  it('changed-code scope includes untracked files', async () => {
    spawnSync('git', ['init'], { cwd: tmpDir, encoding: 'utf8' });
    await writeFileEnsured(path.join(tmpDir, 'src', 'new-quality.js'), 'module.exports = {};\n');

    const changed = await getChangedPaths(tmpDir);

    assert.ok(changed.includes('src/new-quality.js'));
  });
});
