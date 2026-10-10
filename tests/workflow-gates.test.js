'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const {
  detectStack,
  computeImplementationFingerprint,
  runTechnicalGate,
  formatGateError
} = require('../src/workflow-gates');

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

describe('workflow-gates.js — detectStack', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'workflow-gates-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('detects TypeScript stack', async () => {
    await fs.writeFile(path.join(tmpDir, 'tsconfig.json'), '{}');
    const checks = await detectStack(tmpDir);
    assert.ok(checks.some((c) => c.id === 'tsc'));
  });

  it('detects Rust stack', async () => {
    await fs.writeFile(path.join(tmpDir, 'Cargo.toml'), '[package]');
    const checks = await detectStack(tmpDir);
    assert.ok(checks.some((c) => c.id === 'cargo-check'));
    assert.ok(checks.some((c) => c.id === 'cargo-test'));
    assert.ok(checks.find((c) => c.id === 'cargo-test').optional);
  });

  it('detects Node.js stack with npm scripts', async () => {
    const pkg = {
      name: 'test',
      scripts: { test: 'node --test', lint: 'eslint .', 'test:unit': 'jest' }
    };
    await fs.writeFile(path.join(tmpDir, 'package.json'), JSON.stringify(pkg, null, 2));
    const checks = await detectStack(tmpDir);
    assert.ok(checks.some((c) => c.id === 'npm-test'));
    assert.ok(checks.some((c) => c.id === 'npm-lint'));
    assert.ok(!checks.some((c) => c.id === 'npm-test-unit'), 'full test script supersedes unit duplication');
  });

  it('prefers one comprehensive npm ci script', async () => {
    const pkg = {
      name: 'test',
      scripts: { ci: 'npm run lint && npm test', test: 'node --test', lint: 'eslint .' }
    };
    await fs.writeFile(path.join(tmpDir, 'package.json'), JSON.stringify(pkg, null, 2));
    const checks = await detectStack(tmpDir);
    assert.deepEqual(checks.map((check) => check.id), ['npm-ci']);
  });

  it('skips npm test if script is an echo placeholder', async () => {
    const pkg = { name: 'test', scripts: { test: 'echo "Error: no test specified"' } };
    await fs.writeFile(path.join(tmpDir, 'package.json'), JSON.stringify(pkg, null, 2));
    const checks = await detectStack(tmpDir);
    assert.ok(!checks.some((c) => c.id === 'npm-test'));
  });

  it('detects Python stack', async () => {
    await fs.writeFile(path.join(tmpDir, 'pytest.ini'), '[pytest]');
    const checks = await detectStack(tmpDir);
    assert.ok(checks.some((c) => c.id === 'pytest'));
    assert.ok(checks.find((c) => c.id === 'pytest').optional);
  });

  it('detects Python stack via pyproject.toml', async () => {
    await fs.writeFile(path.join(tmpDir, 'pyproject.toml'), '[tool.pytest.ini_options]');
    const checks = await detectStack(tmpDir);
    assert.ok(checks.some((c) => c.id === 'pytest'));
  });

  it('returns empty array when no stack detected', async () => {
    const checks = await detectStack(tmpDir);
    assert.deepEqual(checks, []);
  });
});

describe('workflow-gates.js — runTechnicalGate', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'workflow-gates-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('returns forced ok when options.force is true', async () => {
    const result = await runTechnicalGate(tmpDir, 'dev', { force: true });
    assert.equal(result.ok, true);
    assert.equal(result.forced, true);
    assert.equal(result.stage, 'dev');
  });

  it('skips gate for non-dev/qa stages when stack exists', async () => {
    // Create a TypeScript stack so detectStack returns checks
    await fs.writeFile(path.join(tmpDir, 'tsconfig.json'), '{"compilerOptions": {}}');
    const result = await runTechnicalGate(tmpDir, 'product');
    assert.equal(result.ok, true);
    assert.ok(result.reason.includes('No technical gate for this stage'));
  });

  it('skips gate when no stack is detected regardless of stage', async () => {
    const result = await runTechnicalGate(tmpDir, 'product');
    assert.equal(result.ok, true);
    assert.ok(result.reason.includes('No detectable stack'));
  });

  it('skips when no stack is detected', async () => {
    const result = await runTechnicalGate(tmpDir, 'dev');
    assert.equal(result.ok, true);
    assert.ok(result.reason.includes('No detectable stack'));
  });

  it('does not rerun Node.js regression checks at dev completion', async () => {
    const pkg = { name: 'test', scripts: { test: 'node --test' } };
    await fs.writeFile(path.join(tmpDir, 'package.json'), JSON.stringify(pkg, null, 2));
    const result = await runTechnicalGate(tmpDir, 'dev');
    assert.equal(result.ok, true);
    assert.equal(result.status, 'not_run');
    assert.equal(result.results.length, 0);
    assert.match(result.reason, /No compile gate/);
  });

  it('runs configured commands for an unknown stack, with required failures and optional warnings', async () => {
    await ensureDir(path.join(tmpDir, '.aioson'));
    await fs.writeFile(path.join(tmpDir, 'go.mod'), 'module example.local/project\n');
    const configPath = path.join(tmpDir, '.aioson/quality.json');
    const config = { schema_version: 1, checks: [{ id: 'native-tests', argv: ['node', '-e', 'console.error("assertion failed");process.exit(1)'] }] };
    await fs.writeFile(configPath, JSON.stringify(config));
    const dev = await runTechnicalGate(tmpDir, 'dev');
    assert.equal(dev.status, 'not_run');
    const qa = await runTechnicalGate(tmpDir, 'qa');
    assert.equal(qa.ok, false);
    assert.equal(qa.status, 'fail');
    assert.equal(qa.results[0].exit_code, 1);
    assert.match(qa.results[0].output, /assertion failed/);
    assert.ok(qa.result_path);
    config.checks[0].required = false;
    await fs.writeFile(configPath, JSON.stringify(config));
    const advisory = await runTechnicalGate(tmpDir, 'qa');
    assert.equal(advisory.ok, true);
    assert.equal(advisory.status, 'warn');
    assert.equal(advisory.results[0].ok, false);
    await fs.writeFile(configPath, '{');
    assert.equal((await runTechnicalGate(tmpDir, 'qa')).status, 'error');
    const forced = await runTechnicalGate(tmpDir, 'qa', { force: true });
    assert.equal(forced.ok, true);
    assert.equal(forced.status, 'not_run');
  });

  it('invalidates cached evidence when code or configured commands change and rejects edits during a check', async () => {
    await ensureDir(path.join(tmpDir, '.aioson'));
    await fs.writeFile(path.join(tmpDir, 'app.cjs'), 'module.exports = 1;');
    await fs.writeFile(path.join(tmpDir, 'check.cjs'), 'require("node:assert/strict").equal(require("./app.cjs"),1);');
    const config = { schema_version: 1, checks: [{ id: 'tests', argv: ['node', 'check.cjs'] }] };
    const configPath = path.join(tmpDir, '.aioson/quality.json');
    await fs.writeFile(configPath, JSON.stringify(config));
    execFileSync('git', ['init'], { cwd: tmpDir, stdio: 'ignore' });
    execFileSync('git', ['add', '.'], { cwd: tmpDir, stdio: 'ignore' });
    execFileSync('git', ['-c', 'user.name=AIOSON Test', '-c', 'user.email=test@aioson.local', 'commit', '-m', 'fixture'], { cwd: tmpDir, stdio: 'ignore' });
    const first = await runTechnicalGate(tmpDir, 'qa');
    assert.equal(first.ok, true);
    assert.equal((await runTechnicalGate(tmpDir, 'qa')).cached, true);
    await fs.writeFile(path.join(tmpDir, 'app.cjs'), 'module.exports = 2;');
    assert.equal((await runTechnicalGate(tmpDir, 'qa')).status, 'fail');
    config.checks[0].argv = ['node', '-e', 'process.exit(0)'];
    await fs.writeFile(configPath, JSON.stringify(config));
    const newCommand = await runTechnicalGate(tmpDir, 'qa');
    assert.equal(newCommand.cached, false);
    assert.equal(newCommand.status, 'pass');
    config.checks[0].argv = ['node', '-e', 'require("node:fs").writeFileSync("app.cjs","module.exports = 3;")'];
    await fs.writeFile(configPath, JSON.stringify(config));
    const changedDuringRun = await runTechnicalGate(tmpDir, 'qa');
    assert.equal(changedDuringRun.status, 'error');
    assert.equal(changedDuringRun.blocked, true);
    assert.ok(changedDuringRun.reasons.includes('implementation_changed_during_checks'));
  });

  it('fingerprints untracked files relative to a nested project rather than the repository root', async () => {
    await fs.writeFile(path.join(tmpDir, 'root.txt'), 'root');
    execFileSync('git', ['init'], { cwd: tmpDir, stdio: 'ignore' });
    execFileSync('git', ['add', '.'], { cwd: tmpDir, stdio: 'ignore' });
    execFileSync('git', ['-c', 'user.name=AIOSON Test', '-c', 'user.email=test@aioson.local', 'commit', '-m', 'fixture'], { cwd: tmpDir, stdio: 'ignore' });
    const nested = path.join(tmpDir, 'packages', 'app');
    await ensureDir(nested);
    await fs.writeFile(path.join(nested, 'new.cjs'), 'module.exports=1;');
    const first = computeImplementationFingerprint(nested, []);
    assert.match(first, /^sha256:/);
    await fs.writeFile(path.join(nested, 'new.cjs'), 'module.exports=2;');
    assert.notEqual(computeImplementationFingerprint(nested, []), first);
  });

  it('runs checks for qa stage with Node.js stack', async () => {
    const pkg = { name: 'test', scripts: { test: 'node --test' } };
    await fs.writeFile(path.join(tmpDir, 'package.json'), JSON.stringify(pkg, null, 2));
    const result = await runTechnicalGate(tmpDir, 'qa');
    assert.equal(result.ok, true);
    assert.ok(result.results.length > 0);
    assert.ok(result.results.some((entry) => entry.check === 'npm-test'));
  });

  it('QA verification failures are blocking', async () => {
    const pkg = { name: 'test', scripts: { test: 'node -e "process.exit(1)"' } };
    await fs.writeFile(path.join(tmpDir, 'package.json'), JSON.stringify(pkg, null, 2));
    const result = await runTechnicalGate(tmpDir, 'qa');
    assert.equal(result.ok, false);
    assert.equal(result.blocked, true);
    assert.deepEqual(result.reasons, ['npm test failed']);
  });

  it('reuses successful QA evidence for the same implementation fingerprint', async () => {
    const pkg = {
      name: 'test',
      scripts: {
        test: 'node -e "const fs=require(\'fs\'); const p=\'runs.txt\'; fs.appendFileSync(p, \'run\\\\n\')"'
      }
    };
    await fs.writeFile(path.join(tmpDir, 'package.json'), JSON.stringify(pkg, null, 2));
    const first = await runTechnicalGate(tmpDir, 'qa', { fingerprint: 'sha256:fixed' });
    const second = await runTechnicalGate(tmpDir, 'qa', { fingerprint: 'sha256:fixed' });
    const runs = await fs.readFile(path.join(tmpDir, 'runs.txt'), 'utf8');
    assert.equal(first.cached, false);
    assert.equal(second.cached, true);
    assert.equal(runs.trim().split(/\r?\n/).length, 1);
  });

  it('fingerprint ignores workflow evidence but changes with implementation files', async () => {
    await fs.writeFile(path.join(tmpDir, 'package.json'), '{"name":"fingerprint"}\n');
    await fs.writeFile(path.join(tmpDir, 'index.js'), 'module.exports = 1;\n');
    execFileSync('git', ['init'], { cwd: tmpDir, stdio: 'ignore' });
    execFileSync('git', ['add', '.'], { cwd: tmpDir, stdio: 'ignore' });
    execFileSync(
      'git',
      ['-c', 'user.name=AIOSON Test', '-c', 'user.email=test@aioson.local', 'commit', '-m', 'fixture'],
      { cwd: tmpDir, stdio: 'ignore' }
    );
    const checks = [{ id: 'fixture', command: 'node --test' }];
    const before = computeImplementationFingerprint(tmpDir, checks);

    await ensureDir(path.join(tmpDir, '.aioson', 'runtime'));
    await ensureDir(path.join(tmpDir, '.aioson', 'context'));
    await fs.writeFile(path.join(tmpDir, '.aioson', 'runtime', 'technical-evidence.json'), '{}\n');
    await fs.writeFile(path.join(tmpDir, '.aioson', 'context', 'qa-report-demo.md'), 'PASS\n');
    const afterEvidence = computeImplementationFingerprint(tmpDir, checks);
    await fs.writeFile(path.join(tmpDir, 'index.js'), 'module.exports = 2;\n');
    const afterCode = computeImplementationFingerprint(tmpDir, checks);

    assert.match(before, /^sha256:/);
    assert.equal(afterEvidence, before);
    assert.notEqual(afterCode, before);
  });

  it('fingerprint fails safe instead of reading oversized untracked files into memory', async () => {
    await fs.writeFile(path.join(tmpDir, 'package.json'), '{"name":"fingerprint-limits"}\n');
    execFileSync('git', ['init'], { cwd: tmpDir, stdio: 'ignore' });
    execFileSync('git', ['add', 'package.json'], { cwd: tmpDir, stdio: 'ignore' });
    execFileSync(
      'git',
      ['-c', 'user.name=AIOSON Test', '-c', 'user.email=test@aioson.local', 'commit', '-m', 'fixture'],
      { cwd: tmpDir, stdio: 'ignore' }
    );
    await fs.writeFile(path.join(tmpDir, 'large-untracked.bin'), Buffer.alloc(32, 1));

    const fingerprint = computeImplementationFingerprint(
      tmpDir,
      [{ id: 'fixture', command: 'node --test' }],
      { maxFileBytes: 16, maxTotalBytes: 64 }
    );

    assert.equal(fingerprint, null);
  });

  it('blocks dev stage when TypeScript compilation fails', async () => {
    await fs.writeFile(path.join(tmpDir, 'tsconfig.json'), '{"compilerOptions": {}}');
    // Create a TS file with syntax error to make tsc fail
    await fs.writeFile(path.join(tmpDir, 'index.ts'), 'const x: = 1;');
    const result = await runTechnicalGate(tmpDir, 'dev');
    assert.equal(result.ok, false);
    assert.equal(result.blocked, true);
    assert.ok(result.reasons.length > 0);
  });
});

describe('workflow-gates.js — formatGateError', () => {
  it('formats blocked gate with reasons and results', () => {
    const gateResult = {
      stage: 'dev',
      reasons: ['npm test failed'],
      results: [
        { ok: false, name: 'npm test', command: 'npm test', output: 'Error: 1 test failed' }
      ]
    };
    const msg = formatGateError(gateResult);
    assert.ok(msg.includes('[Technical Gate BLOCKED]'));
    assert.ok(msg.includes('Stage: @dev'));
    assert.ok(msg.includes('npm test failed'));
    assert.ok(msg.includes('Fix the errors above'));
    assert.ok(msg.includes('--force'));
    assert.ok(msg.includes('[npm test] npm test'));
    assert.ok(!msg.includes('$npm test'));
  });
});
