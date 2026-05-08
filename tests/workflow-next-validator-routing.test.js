'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createTranslator } = require('../src/i18n');
const {
  runWorkflowNext,
  shouldRouteToValidator
} = require('../src/commands/workflow-next');

async function makeTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-validator-routing-'));
}

function quietLogger() {
  return { log() {}, error() {} };
}

async function writeFileEnsured(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
}

async function setupMediumFeature(dir, slug, { contract = true, status = 'waiting_validation' } = {}) {
  await writeFileEnsured(
    path.join(dir, '.aioson/context/project.context.md'),
    `---\nproject_name: "demo"\nproject_type: "web_app"\nprofile: "developer"\nframework: "Next.js"\nframework_installed: true\nclassification: "MEDIUM"\nconversation_language: "en"\naioson_version: "1.2.1"\n---\n\n# Context\n`
  );
  await writeFileEnsured(
    path.join(dir, '.aioson/context/features.md'),
    `# Features\n\n| slug | status | started | completed |\n|------|--------|---------|-----------|\n| ${slug} | in_progress | 2026-05-07 | — |\n`
  );
  await writeFileEnsured(path.join(dir, `.aioson/context/prd-${slug}.md`), '# Feature PRD\n');
  await writeFileEnsured(path.join(dir, `.aioson/context/spec-${slug}.md`), '# Feature spec\n');

  if (contract) {
    const planDir = path.join(dir, '.aioson/plans', slug);
    await fs.mkdir(planDir, { recursive: true });
    await writeFileEnsured(
      path.join(planDir, 'harness-contract.json'),
      JSON.stringify({
        feature: slug,
        contract_mode: 'BALANCED',
        governor: { max_steps: 50, error_streak_limit: 5 },
        criteria: [{ id: 'C1', description: 'x', assertion: 'y', binary: true }]
      })
    );
    await writeFileEnsured(
      path.join(planDir, 'progress.json'),
      JSON.stringify({
        feature: slug,
        phase: 1,
        status,
        completed_steps: [],
        last_error: null,
        session_count: 1,
        last_updated: new Date().toISOString(),
        circuit_state: 'CLOSED',
        iterations: 0,
        consecutive_errors: 0,
        ready_for_done_gate: false
      })
    );
  }
}

// ---------- shouldRouteToValidator ----------

test('shouldRouteToValidator: true when feature, contract, and waiting_validation status', async () => {
  const dir = await makeTempDir();
  const slug = 'demo';
  await setupMediumFeature(dir, slug, { status: 'waiting_validation' });
  const state = { mode: 'feature', featureSlug: slug };
  assert.strictEqual(shouldRouteToValidator(dir, state), true);
});

test('shouldRouteToValidator: false when status is not waiting_validation', async () => {
  const dir = await makeTempDir();
  const slug = 'demo';
  await setupMediumFeature(dir, slug, { status: 'in_progress' });
  const state = { mode: 'feature', featureSlug: slug };
  assert.strictEqual(shouldRouteToValidator(dir, state), false);
});

test('shouldRouteToValidator: false when no contract present', async () => {
  const dir = await makeTempDir();
  const slug = 'demo-no-contract';
  await setupMediumFeature(dir, slug, { contract: false });
  const state = { mode: 'feature', featureSlug: slug };
  assert.strictEqual(shouldRouteToValidator(dir, state), false);
});

test('shouldRouteToValidator: false when state.mode is project (not feature)', async () => {
  const dir = await makeTempDir();
  const state = { mode: 'project', featureSlug: null };
  assert.strictEqual(shouldRouteToValidator(dir, state), false);
});

test('shouldRouteToValidator: false when progress.json is corrupted', async () => {
  const dir = await makeTempDir();
  const slug = 'corrupt-progress';
  await setupMediumFeature(dir, slug);
  // Overwrite with garbage
  await fs.writeFile(path.join(dir, '.aioson/plans', slug, 'progress.json'), '{ not json', 'utf8');
  const state = { mode: 'feature', featureSlug: slug };
  // Fail-safe: do NOT override routing on parse error
  assert.strictEqual(shouldRouteToValidator(dir, state), false);
});

// ---------- runWorkflowNext routing integration ----------

test('workflow:next routes to @validator when status is waiting_validation', async () => {
  const dir = await makeTempDir();
  const slug = 'route-to-validator';
  await setupMediumFeature(dir, slug, { status: 'waiting_validation' });

  const { t } = createTranslator('en');
  const result = await runWorkflowNext({
    args: [dir],
    options: { tool: 'codex' },
    logger: quietLogger(),
    t
  });

  assert.equal(result.ok, true);
  assert.equal(result.agent, 'validator', 'must route to @validator');
  // detour active so the workflow remembers where to return after validator
  assert.equal(result.detour && result.detour.active, true, 'must activate detour');
  assert.equal(result.detour.agent, 'validator');
});

test('workflow:next does NOT route to validator without a harness contract (regression)', async () => {
  const dir = await makeTempDir();
  const slug = 'no-contract-feature';
  await setupMediumFeature(dir, slug, { contract: false });

  const { t } = createTranslator('en');
  const result = await runWorkflowNext({
    args: [dir],
    options: { tool: 'codex' },
    logger: quietLogger(),
    t
  });

  assert.equal(result.ok, true);
  assert.notEqual(result.agent, 'validator', 'must not route to validator without contract');
});

test('workflow:next does NOT route to validator when status is in_progress (regression)', async () => {
  const dir = await makeTempDir();
  const slug = 'in-progress-feature';
  await setupMediumFeature(dir, slug, { status: 'in_progress' });

  const { t } = createTranslator('en');
  const result = await runWorkflowNext({
    args: [dir],
    options: { tool: 'codex' },
    logger: quietLogger(),
    t
  });

  assert.equal(result.ok, true);
  assert.notEqual(result.agent, 'validator', 'must not route to validator without waiting_validation');
});

test('workflow:next preserves explicit --agent override even when waiting_validation', async () => {
  const dir = await makeTempDir();
  const slug = 'explicit-override-feature';
  await setupMediumFeature(dir, slug, { status: 'waiting_validation' });

  const { t } = createTranslator('en');
  // Use --agent=dev to avoid the qa+MEDIUM security-audit code path which has a
  // pre-existing async-resource leak on HEAD (independent of validator routing).
  // The semantics under test are the same: explicit --agent must beat auto-routing.
  const result = await runWorkflowNext({
    args: [dir],
    options: { tool: 'codex', agent: 'dev' },
    logger: quietLogger(),
    t
  });

  assert.equal(result.ok, true);
  assert.equal(result.agent, 'dev', 'explicit --agent must override auto-routing');
});
