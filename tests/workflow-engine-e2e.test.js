'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('os');
const { execSync } = require('node:child_process');
const {
  runWorkflowNext,
  loadOrCreateState
} = require('../src/commands/workflow-next');

describe('workflow engine hardening — end-to-end', () => {
  let tmpDir;

  async function setupMinimalProject() {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-e2e-'));
    await fs.mkdir(path.join(tmpDir, '.aioson', 'context'), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, '.aioson', 'context', 'project.context.md'),
      `---\nproject_name: "e2e-test"\nproject_type: "api"\nprofile: "developer"\nframework: "Node.js"\nframework_installed: true\nclassification: "SMALL"\ninteraction_language: "pt-BR"\naioson_version: "1.7.3"\n---\n`
    );
    // TypeScript project
    await fs.writeFile(
      path.join(tmpDir, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: { strict: true, noEmit: true }, include: ['src/**/*'] })
    );
    await fs.writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'e2e-test', scripts: { test: 'node --test' } })
    );
    execSync('npm install typescript --save-dev', { cwd: tmpDir, stdio: 'ignore' });
    return tmpDir;
  }

  async function writeProductAndPlan(dir) {
    await fs.writeFile(
      path.join(dir, '.aioson', 'context', 'features.md'),
      '# Features\n\n| slug | status | started | completed |\n|------|--------|---------|-----------|\n| test-feature | in_progress | 2026-06-02 | — |\n'
    );
    await fs.writeFile(
      path.join(dir, '.aioson', 'context', 'prd-test-feature.md'),
      `---\nclassification: SMALL\nproduct_scope: approved\nprd_ready: approved\nsheldon_review: not_requested\n---\n# PRD\n\n## Feature Capability Map\n\n| CAP | Promised outcome | Actor / trigger | Scope decision | Rationale |\n|---|---|---|---|---|\n| CAP-test-01 | Type-safe behavior is delivered | User starts the app | required | Core promise |\n\n## Acceptance Criteria\n\n| AC | CAP | Observable behavior | Evidence |\n|---|---|---|---|\n| AC-test-01 | CAP-test-01 | App compiles through the normal project command | focused test |\n`
    );
    await fs.writeFile(
      path.join(dir, '.aioson', 'context', 'implementation-plan-test-feature.md'),
      `---\nstatus: approved\n---\n# Implementation Plan\n\n## Capability Delivery Plan\n\n| CAP | Phase | Files | Verification |\n|---|---|---|---|\n| CAP-test-01 | 1 | src/index.ts, tests/index.test.js | npm test and npx tsc --noEmit |\n`
    );
    await fs.mkdir(path.join(dir, 'tests'), { recursive: true });
    await fs.writeFile(
      path.join(dir, 'tests', 'index.test.js'),
      "const test = require('node:test'); const assert = require('node:assert/strict'); test('AC-test-01', () => assert.ok(true));\n"
    );
  }

  it('bloqueia dev quando typescript está quebrado', async () => {
    const dir = await setupMinimalProject();
    await fs.mkdir(path.join(dir, 'src'), { recursive: true });
    await fs.writeFile(path.join(dir, 'src', 'index.ts'), 'const x: number = "broken";');
    await writeProductAndPlan(dir);

    // Setup workflow state at dev
    const statePath = path.join(dir, '.aioson', 'context', 'workflow.state.json');
    await fs.writeFile(statePath, JSON.stringify({
      version: 1,
      mode: 'feature',
      classification: 'SMALL',
      sequence: ['product', 'planner', 'dev', 'qa'],
      current: 'dev',
      next: 'qa',
      completed: ['product', 'planner'],
      skipped: [],
      featureSlug: 'test-feature',
      detour: null,
      updatedAt: new Date().toISOString()
    }));

    const logger = { log: () => {} };
    await assert.rejects(
      async () => runWorkflowNext({ args: [dir], options: { complete: true, tool: 'claude' }, logger, t: (k, p) => p?.agent || k }),
      /Technical Gate BLOCKED/
    );
  });

  it('fluxo completo: dev quebrado → auto-heal → dev corrige → passa para qa com test briefing', async () => {
    const dir = await setupMinimalProject();
    await fs.mkdir(path.join(dir, 'src'), { recursive: true });
    await fs.writeFile(path.join(dir, 'src', 'index.ts'), 'const x: number = "broken";');
    await writeProductAndPlan(dir);

    // Create a mock helper and a component to verify test briefing later
    await fs.mkdir(path.join(dir, 'tests', 'helpers'), { recursive: true });
    await fs.writeFile(path.join(dir, 'tests', 'helpers', 'mocks.ts'), 'export const mockFn = vi.fn();');
    await fs.writeFile(path.join(dir, 'src', 'Button.ts'), 'export const BUTTON_TEXT = "Salvar";');

    // Setup workflow state at dev
    const statePath = path.join(dir, '.aioson', 'context', 'workflow.state.json');
    await fs.writeFile(statePath, JSON.stringify({
      version: 1,
      mode: 'feature',
      classification: 'SMALL',
      sequence: ['product', 'planner', 'dev', 'qa'],
      current: 'dev',
      next: 'qa',
      completed: ['product', 'planner'],
      skipped: [],
      featureSlug: 'test-feature',
      detour: null,
      updatedAt: new Date().toISOString()
    }));

    const logger = { log: () => {} };

    // Step 1: try to complete dev --auto-heal should intercept and return healing prompt
    const healResult = await runWorkflowNext({
      args: [dir],
      options: { complete: true, tool: 'claude', 'auto-heal': true },
      logger,
      t: (k, p) => p?.stage || p?.agent || k
    });

    assert.strictEqual(healResult.autoHealed, true);
    assert.strictEqual(healResult.agent, 'dev');
    assert.ok(healResult.prompt.includes('Self-Healing Context'), 'healing context should be in prompt');
    assert.ok(healResult.prompt.includes('TypeScript compilation failed') || healResult.prompt.includes('broken'), 'error should be in healing prompt');

    // Step 2: fix the code
    await fs.writeFile(path.join(dir, 'src', 'index.ts'), 'const x: number = 1;');

    // Step 3: complete dev again -- should pass now
    const devResult = await runWorkflowNext({
      args: [dir],
      options: { complete: true, tool: 'claude' },
      logger,
      t: (k, p) => p?.agent || k
    });

    assert.strictEqual(devResult.completedStage, 'dev');
    assert.strictEqual(devResult.next, 'qa');

    // Step 4: advance to qa -- should inject test briefing
    const qaResult = await runWorkflowNext({
      args: [dir],
      options: { agent: 'qa', tool: 'claude' },
      logger,
      t: (k, p) => p?.agent || k
    });

    assert.strictEqual(qaResult.agent, 'qa');
    assert.ok(qaResult.prompt.includes('Auto-generated Test Context'), 'test briefing should be injected');
    assert.ok(qaResult.prompt.includes('mocks.ts'), 'mock helper should be referenced');

    // Step 5: complete qa -- should require the canonical QA report
    await assert.rejects(
      async () => runWorkflowNext({ args: [dir], options: { complete: true, tool: 'claude' }, logger, t: (k, p) => p?.agent || k }),
      /Handoff Contract BLOCKED/
    );

    // Step 6: add the independent QA verdict so Gate D passes
    await fs.writeFile(
      path.join(dir, '.aioson', 'context', 'qa-report-test-feature.md'),
      `---\nverdict: PASS\n---\n# QA Report\n\n- AC-test-01: PASS\n- Normal-entry smoke: PASS\n`
    );

    const qaComplete = await runWorkflowNext({
      args: [dir],
      options: { complete: true, tool: 'claude' },
      logger,
      t: (k, p) => p?.agent || k
    });

    assert.strictEqual(qaComplete.completedStage, 'qa');
  });

  it('workflow:harden aplica auto-fixes após erros simulados', async () => {
    const dir = await setupMinimalProject();
    await fs.mkdir(path.join(dir, '.aioson', 'context'), { recursive: true });

    // Simulate git staging errors
    await fs.appendFile(
      path.join(dir, '.aioson', 'context', 'workflow.errors.jsonl'),
      JSON.stringify({ ts: new Date().toISOString(), stage: 'committer', gateType: 'git', error: 'node_modules staged accidentally' }) + '\n'
    );
    await fs.appendFile(
      path.join(dir, '.aioson', 'context', 'workflow.errors.jsonl'),
      JSON.stringify({ ts: new Date().toISOString(), stage: 'committer', gateType: 'git', error: 'dist folder in stage' }) + '\n'
    );

    const { runWorkflowHarden } = require('../src/commands/workflow-harden');
    const logger = { log: () => {}, error: () => {} };
    const result = await runWorkflowHarden({ args: [dir], options: {}, logger, t: () => {} });

    assert.strictEqual(result.ok, true);
    assert.ok(result.fixes.some((f) => f.action.includes('.gitignore')), 'should update gitignore');

    const gitignore = await fs.readFile(path.join(dir, '.gitignore'), 'utf8');
    assert.ok(gitignore.includes('node_modules/'));
    assert.ok(gitignore.includes('dist/'));
  });
});
