'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const { buildReviewPayload, resolveBase, truncateDiff } = require('../src/harness/review-payload');
const { runHarnessValidate } = require('../src/commands/harness');

function makeLogger() {
  const lines = [];
  const errors = [];
  return {
    log: (msg = '') => lines.push(String(msg)),
    error: (msg = '') => errors.push(String(msg)),
    lines,
    errors
  };
}

const mockT = () => undefined;

async function makeTmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-review-payload-test-'));
}

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

/** Repo git mínimo com 1 commit base; identidade local para não depender da máquina. */
async function makeGitRepo() {
  const dir = await makeTmpDir();
  git(dir, ['init', '-b', 'main']);
  git(dir, ['config', 'user.email', 'test@aioson.local']);
  git(dir, ['config', 'user.name', 'AIOSON Test']);
  await fs.writeFile(path.join(dir, 'app.js'), 'module.exports = 1;\n', 'utf8');
  git(dir, ['add', '.']);
  git(dir, ['commit', '-m', 'base']);
  return dir;
}

async function writePlan(dir, slug, { contract = null, progress = null, checkOutput = null, baseline = null } = {}) {
  const planDir = path.join(dir, '.aioson', 'plans', slug);
  await fs.mkdir(planDir, { recursive: true });
  if (contract) await fs.writeFile(path.join(planDir, 'harness-contract.json'), JSON.stringify(contract, null, 2), 'utf8');
  if (progress) await fs.writeFile(path.join(planDir, 'progress.json'), JSON.stringify(progress, null, 2), 'utf8');
  if (checkOutput) await fs.writeFile(path.join(planDir, 'last-check-output.json'), JSON.stringify(checkOutput, null, 2), 'utf8');
  if (baseline) await fs.writeFile(path.join(planDir, 'baseline.json'), JSON.stringify(baseline, null, 2), 'utf8');
  return planDir;
}

test('buildReviewPayload: degrada graciosamente fora de repo git', async () => {
  const dir = await makeTmpDir();
  const planDir = path.join(dir, '.aioson', 'plans', 'x');
  const payload = buildReviewPayload(dir, planDir, { slug: 'x' });
  assert.strictEqual(payload.ok, false);
  assert.match(payload.text, /Diff unavailable/);
  assert.match(payload.text, /Review payload/);
});

test('buildReviewPayload: captura arquivo modificado e untracked com base HEAD', async () => {
  const dir = await makeGitRepo();
  const planDir = await writePlan(dir, 'feat-x');
  await fs.writeFile(path.join(dir, 'app.js'), 'module.exports = 2;\n', 'utf8');
  await fs.writeFile(path.join(dir, 'novo.js'), 'module.exports = 3;\n', 'utf8');

  const payload = buildReviewPayload(dir, planDir, { slug: 'feat-x' });
  assert.strictEqual(payload.ok, true);
  assert.strictEqual(payload.base, 'HEAD');
  assert.ok(payload.changedFiles.some((f) => f.path === 'app.js'), 'app.js deve aparecer como alterado');
  assert.ok(payload.untracked.includes('novo.js'), 'novo.js deve aparecer como untracked');
  assert.match(payload.text, /```diff/);
  assert.match(payload.text, /module.exports = 2;/);
});

test('buildReviewPayload: base explícita via opts.baseRef vence o fallback', async () => {
  const dir = await makeGitRepo();
  const planDir = await writePlan(dir, 'feat-x');
  const baseSha = git(dir, ['rev-parse', 'HEAD']).trim();
  await fs.writeFile(path.join(dir, 'app.js'), 'module.exports = 2;\n', 'utf8');
  git(dir, ['add', '.']);
  git(dir, ['commit', '-m', 'change']);

  const payload = buildReviewPayload(dir, planDir, { slug: 'feat-x', baseRef: baseSha });
  assert.strictEqual(payload.ok, true);
  assert.strictEqual(payload.base, baseSha);
  assert.strictEqual(payload.baseSource, 'explicit --base');
  assert.ok(payload.changedFiles.some((f) => f.path === 'app.js'), 'diff vs base deve incluir o commit novo');
});

test('buildReviewPayload: baseline.json do plan dir é usado como base quando presente', async () => {
  const dir = await makeGitRepo();
  const baseSha = git(dir, ['rev-parse', 'HEAD']).trim();
  const planDir = await writePlan(dir, 'feat-x', {
    baseline: { captured_at: '2026-06-11T00:00:00Z', head: baseSha, dirty_paths: [], forbidden_dirty_hashes: {} }
  });
  await fs.writeFile(path.join(dir, 'app.js'), 'module.exports = 2;\n', 'utf8');
  git(dir, ['add', '.']);
  git(dir, ['commit', '-m', 'change']);

  const payload = buildReviewPayload(dir, planDir, { slug: 'feat-x' });
  assert.strictEqual(payload.base, baseSha);
  assert.match(payload.baseSource, /baseline\.json/);
});

test('buildReviewPayload: inclui sumário do last-check-output.json quando existe', async () => {
  const dir = await makeGitRepo();
  const planDir = await writePlan(dir, 'feat-x', {
    checkOutput: {
      slug: 'feat-x',
      checked_at: '2026-06-11T01:00:00Z',
      executable_total: 2,
      passed: 1,
      failed: 1,
      skipped_no_verification: 1,
      checks: [
        { id: 'C1', command: 'node -e "process.exit(0)"', exitCode: 0, ok: true, timedOut: false },
        { id: 'C2', command: 'node -e "process.exit(1)"', exitCode: 1, ok: false, timedOut: false }
      ]
    }
  });
  const payload = buildReviewPayload(dir, planDir, { slug: 'feat-x' });
  assert.strictEqual(payload.hasChecks, true);
  assert.match(payload.text, /1\/2 executable checks passed/);
  assert.match(payload.text, /PASS C1/);
  assert.match(payload.text, /FAIL C2/);
  assert.match(payload.text, /verbatim/);
});

test('truncateDiff: corta em fronteira de linha com marcador', () => {
  const diff = Array.from({ length: 100 }, (_, i) => `line-${i}`).join('\n');
  const result = truncateDiff(diff, 200);
  assert.strictEqual(result.truncated, true);
  assert.match(result.diff, /\[diff truncated at 200 bytes/);
  assert.ok(!result.diff.includes('line-99'), 'conteúdo além do corte não deve aparecer');
});

test('resolveBase: fallback final é HEAD em repo de branch única', async () => {
  const dir = await makeGitRepo();
  const planDir = path.join(dir, '.aioson', 'plans', 'x');
  const { base, source } = resolveBase(dir, planDir, null);
  assert.strictEqual(base, 'HEAD');
  assert.match(source, /fallback/);
});

test('harness:validate: prompt gerado contém o review payload com diff e instrução de saída', async () => {
  const dir = await makeGitRepo();
  const slug = 'fresh-review';
  await writePlan(dir, slug, {
    contract: {
      feature: slug,
      contract_mode: 'BALANCED',
      governor: { max_steps: 50, error_streak_limit: 5 },
      criteria: [{ id: 'C1', description: 'x', assertion: 'y', binary: true }]
    },
    progress: {
      feature: slug,
      phase: 1,
      status: 'in_progress',
      completed_steps: [],
      last_error: null,
      session_count: 1,
      last_updated: '2026-06-11T00:00:00Z',
      circuit_state: 'CLOSED',
      iterations: 0,
      consecutive_errors: 0
    }
  });
  await fs.writeFile(path.join(dir, 'app.js'), 'module.exports = 42;\n', 'utf8');

  const result = await runHarnessValidate({
    args: [dir],
    options: { slug },
    logger: makeLogger(),
    t: mockT
  });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.status, 'awaiting_validation');
  assert.ok(result.reviewPayload, 'resultado deve expor o resumo do payload');
  assert.strictEqual(result.reviewPayload.ok, true);

  const prompt = fsSync.readFileSync(result.promptPath, 'utf8');
  assert.match(prompt, /## Review payload/);
  assert.match(prompt, /module.exports = 42;/);
  assert.match(prompt, /fresh, isolated context/i);
  assert.match(prompt, /last-validator-output\.json/);
  assert.ok(!prompt.includes('?? .aioson/'), 'estado do framework não deve aparecer como untracked sob revisão');
});

test('harness:validate: --no-diff omite o payload', async () => {
  const dir = await makeGitRepo();
  const slug = 'no-diff-mode';
  await writePlan(dir, slug, {
    contract: {
      feature: slug,
      contract_mode: 'BALANCED',
      governor: { max_steps: 50, error_streak_limit: 5 },
      criteria: [{ id: 'C1', description: 'x', assertion: 'y', binary: true }]
    }
  });

  const result = await runHarnessValidate({
    args: [dir],
    options: { slug, 'no-diff': true },
    logger: makeLogger(),
    t: mockT
  });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.reviewPayload, null);
  const prompt = fsSync.readFileSync(result.promptPath, 'utf8');
  assert.ok(!prompt.includes('## Review payload'), 'payload não deve ser anexado com --no-diff');
});
