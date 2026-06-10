'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { checkScope, checkDiffLimits, countDiffLines, buildRollbackFeedback } = require('../src/harness/scope-guard');
const { parsePorcelain, captureBaseline, loadBaseline, computeChangedSet } = require('../src/harness/git-baseline');
const { DEFAULT_FORBIDDEN_GLOBS } = require('../src/harness/contract-schema');
const { writeAttemptArtifacts } = require('../src/harness/attempt-artifacts');

// ─── pure scope-guard ────────────────────────────────────────────────────────

describe('harness/scope-guard — checkScope', () => {
  test('deny vence allow (REQ-5)', () => {
    const result = checkScope({
      changedFiles: [{ path: 'src/auth/.env', status: 'added' }],
      allowedGlobs: ['src/**'],
      forbiddenGlobs: ['.env*']
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.violations[0].glob, '.env*');
  });

  test('defaults proibidos pegam secrets e lockfiles (REQ-4)', () => {
    const result = checkScope({
      changedFiles: [
        { path: 'secrets/api.txt', status: 'added' },
        { path: 'package-lock.json', status: 'modified' },
        { path: 'src/ok.js', status: 'modified' }
      ],
      allowedGlobs: null,
      forbiddenGlobs: [...DEFAULT_FORBIDDEN_GLOBS]
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.violations.length, 2);
  });

  test('allowlist nula permite qualquer path não proibido', () => {
    const result = checkScope({
      changedFiles: [{ path: 'anything/anywhere.js', status: 'added' }],
      allowedGlobs: null,
      forbiddenGlobs: [...DEFAULT_FORBIDDEN_GLOBS]
    });
    assert.strictEqual(result.ok, true);
  });

  test('fora da allowlist é violação', () => {
    const result = checkScope({
      changedFiles: [{ path: 'docs/readme.md', status: 'modified' }],
      allowedGlobs: ['src/**'],
      forbiddenGlobs: []
    });
    assert.strictEqual(result.ok, false);
    assert.match(result.violations[0].reason, /outside allowed_files/);
  });

  test('deleção de arquivo proibido é violação (EC-4)', () => {
    const result = checkScope({
      changedFiles: [{ path: 'server.pem', status: 'deleted' }],
      allowedGlobs: null,
      forbiddenGlobs: ['*.pem']
    });
    assert.strictEqual(result.ok, false);
    assert.match(result.violations[0].reason, /deletion counts/);
  });

  test('rehash violations (D2) entram como violação', () => {
    const result = checkScope({
      changedFiles: [],
      rehashViolations: [{ path: '.env', reason: 'forbidden dirty path was re-modified after baseline (content hash changed)' }],
      allowedGlobs: null,
      forbiddenGlobs: ['.env*']
    });
    assert.strictEqual(result.ok, false);
    assert.match(result.violations[0].reason, /re-modified/);
  });

  test('buildRollbackFeedback lista paths e instrução de rollback (REQ-6)', () => {
    const feedback = buildRollbackFeedback([{ path: '.env', reason: 'matches forbidden glob ".env*"' }]);
    assert.match(feedback, /SCOPE VIOLATION/);
    assert.match(feedback, /\.env/);
    assert.match(feedback, /Revert/);
  });
});

describe('harness/scope-guard — checkDiffLimits (REQ-10)', () => {
  const patch = ['--- a/x', '+++ b/x', '+line1', '+line2', '-line3', ' ctx'].join('\n');

  test('countDiffLines ignora headers', () => {
    assert.strictEqual(countDiffLines(patch), 3);
  });

  test('null = sem limite', () => {
    const result = checkDiffLimits({ changedFiles: new Array(100).fill({ path: 'x', status: 'modified' }), diffPatch: patch, maxChangedFiles: null, maxDiffLines: null });
    assert.strictEqual(result.ok, true);
  });

  test('max_changed_files e max_diff_lines excedidos', () => {
    const result = checkDiffLimits({
      changedFiles: [{ path: 'a' }, { path: 'b' }],
      diffPatch: patch,
      maxChangedFiles: 1,
      maxDiffLines: 2
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.exceeded.length, 2);
    assert.deepStrictEqual(result.exceeded.map((e) => e.limit).sort(), ['max_changed_files', 'max_diff_lines']);
  });
});

// ─── parsePorcelain (pure) ───────────────────────────────────────────────────

describe('harness/git-baseline — parsePorcelain', () => {
  test('untracked, modified, deleted, added', () => {
    const entries = parsePorcelain('?? new.js\n M src/mod.js\nD  gone.js\nA  staged.js\n');
    assert.deepStrictEqual(entries, [
      { path: 'new.js', status: 'added' },
      { path: 'src/mod.js', status: 'modified' },
      { path: 'gone.js', status: 'deleted' },
      { path: 'staged.js', status: 'added' }
    ]);
  });

  test('rename conta os dois paths (EC-3)', () => {
    const entries = parsePorcelain('R  old/name.js -> new/name.js\n');
    assert.strictEqual(entries.length, 2);
    assert.strictEqual(entries[0].path, 'old/name.js');
    assert.strictEqual(entries[1].path, 'new/name.js');
    assert.ok(entries.every((e) => e.status === 'renamed'));
  });

  test('paths citados são desserializados', () => {
    const entries = parsePorcelain('?? "with space.js"\n');
    assert.strictEqual(entries[0].path, 'with space.js');
  });
});

// ─── git fixture integration ─────────────────────────────────────────────────

describe('harness/git-baseline — fixture git temporária', () => {
  let repoDir;
  let planDir;

  function gitIn(args) {
    execFileSync('git', args, { cwd: repoDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  }

  before(() => {
    repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-baseline-'));
    planDir = path.join(repoDir, '.aioson', 'plans', 'demo');
    gitIn(['init', '-q']);
    gitIn(['config', 'user.email', 'test@aioson.dev']);
    gitIn(['config', 'user.name', 'AIOSON Test']);
    fs.writeFileSync(path.join(repoDir, 'committed.js'), 'module.exports = 1;\n');
    fs.writeFileSync(path.join(repoDir, '.env'), 'SECRET=pre-existing\n');
    gitIn(['add', 'committed.js']);
    gitIn(['commit', '-q', '-m', 'init', '--no-gpg-sign']);
  });

  after(() => {
    try { fs.rmSync(repoDir, { recursive: true, force: true }); } catch { /* win cleanup race */ }
  });

  test('baseline captura HEAD, dirty paths e hashes D2 + warning de path sujo proibido (EC-2)', () => {
    const { baseline, warnings } = captureBaseline(repoDir, planDir, { forbiddenGlobs: ['.env*'] });
    assert.ok(baseline.head, 'head should exist');
    assert.ok(baseline.dirty_paths.includes('.env'));
    assert.ok(Object.prototype.hasOwnProperty.call(baseline.forbidden_dirty_hashes, '.env'));
    assert.ok(baseline.forbidden_dirty_hashes['.env'], 'hash should be captured');
    assert.strictEqual(warnings.length, 1);
    assert.strictEqual(warnings[0].path, '.env');
    assert.ok(fs.existsSync(path.join(planDir, 'baseline.json')));
    assert.ok(loadBaseline(planDir));
  });

  test('untracked novo é detectado (EC-1); dirty paths do baseline excluídos (EC-2)', () => {
    const baseline = loadBaseline(planDir);
    fs.writeFileSync(path.join(repoDir, 'untracked-new.js'), 'x\n');
    const { files } = computeChangedSet(repoDir, baseline);
    const paths = files.map((f) => f.path);
    assert.ok(paths.includes('untracked-new.js'), 'untracked must be detected (git diff would miss it)');
    assert.ok(!paths.includes('.env'), 'pre-existing dirty path must not count');
  });

  test('re-modificação de dirty path proibido viola via re-hash (D2)', () => {
    const baseline = loadBaseline(planDir);
    fs.appendFileSync(path.join(repoDir, '.env'), 'INJECTED=true\n');
    const { rehashViolations } = computeChangedSet(repoDir, baseline);
    assert.strictEqual(rehashViolations.length, 1);
    assert.strictEqual(rehashViolations[0].path, '.env');
  });

  test('deleção de arquivo commitado entra no changed set (EC-4)', () => {
    const baseline = loadBaseline(planDir);
    fs.rmSync(path.join(repoDir, 'committed.js'));
    const { files } = computeChangedSet(repoDir, baseline);
    const entry = files.find((f) => f.path === 'committed.js');
    assert.ok(entry, 'deleted file must appear');
    assert.strictEqual(entry.status, 'deleted');
  });

  test('attempt-artifacts grava changed-files.json, checks e diff.patch (REQ-9)', () => {
    const result = writeAttemptArtifacts(planDir, 1, {
      changedFiles: [{ path: 'untracked-new.js', status: 'added' }],
      checks: [{ id: 'C1', command: 'npm test', exitCode: 0, durationMs: 120, stdout: 'ok', stderr: '' }],
      diffPatch: 'diff --git a/x b/x\n+1\n'
    });
    assert.strictEqual(result.ok, true);
    const attemptDir = path.join(planDir, 'attempts', '1');
    const changed = JSON.parse(fs.readFileSync(path.join(attemptDir, 'changed-files.json'), 'utf8'));
    assert.strictEqual(changed.attempt, 1);
    assert.strictEqual(changed.files[0].path, 'untracked-new.js');
    const log = fs.readFileSync(path.join(attemptDir, 'checks', 'C1.log'), 'utf8');
    assert.match(log, /exit_code: 0/);
    assert.ok(fs.existsSync(path.join(attemptDir, 'diff.patch')));
  });
});
