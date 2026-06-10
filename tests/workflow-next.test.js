'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createTranslator } = require('../src/i18n');
const {
  runWorkflowNext,
  EVENTS_RELATIVE_PATH,
  loadOrCreateState
} = require('../src/commands/workflow-next');
const { openRuntimeDb } = require('../src/runtime-store');
const { HANDOFF_PROTOCOL_RELATIVE_PATH } = require('../src/session-handoff');

async function makeTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-workflow-next-'));
}

function createQuietLogger() {
  return {
    log() {},
    error() {}
  };
}

async function writeFileEnsured(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
}

async function writeProjectContext(dir, classification = 'SMALL') {
  const contextPath = path.join(dir, '.aioson/context/project.context.md');
  await writeFileEnsured(
    contextPath,
    `---\nproject_name: "demo"\nproject_type: "web_app"\nprofile: "developer"\nframework: "Next.js"\nframework_installed: true\nclassification: "${classification}"\nconversation_language: "en"\naioson_version: "1.2.1"\n---\n\n# Context\n`
  );
}

async function writeFeatureWorkflowState(dir, payload) {
  await writeFileEnsured(
    path.join(dir, '.aioson/context/workflow.state.json'),
    JSON.stringify({
      version: 1,
      mode: 'feature',
      classification: 'MEDIUM',
      sequence: ['product', 'analyst', 'architect', 'discovery-design-doc', 'scope-check', 'dev', 'pentester', 'qa'],
      current: null,
      next: 'product',
      completed: [],
      skipped: [],
      featureSlug: 'official-dashboard-reform',
      detour: null,
      updatedAt: new Date().toISOString(),
      ...payload
    }, null, 2)
  );
}

async function writeActiveFeature(dir, slug, classification = 'MEDIUM') {
  await writeProjectContext(dir, classification);
  await writeFileEnsured(
    path.join(dir, '.aioson/context/features.md'),
    `# Features\n\n| slug | status | started | completed |\n|------|--------|---------|-----------|\n| ${slug} | in_progress | 2026-06-05 | - |\n`
  );
  await writeFileEnsured(
    path.join(dir, `.aioson/context/prd-${slug}.md`),
    `---\nclassification: ${classification}\n---\n# PRD\n`
  );
}

test('workflow:next infers project progress from existing artifacts', async () => {
  const dir = await makeTempDir();
  await writeProjectContext(dir, 'SMALL');
  await writeFileEnsured(path.join(dir, '.aioson/context/prd.md'), '# PRD\n');

  const { t } = createTranslator('en');
  const result = await runWorkflowNext({
    args: [dir],
    options: { tool: 'codex' },
    logger: createQuietLogger(),
    t
  });

  assert.equal(result.ok, true);
  assert.equal(result.mode, 'project');
  assert.equal(result.agent, 'analyst');
  assert.deepEqual(result.completed, ['setup', 'product']);
  assert.equal(result.current, 'analyst');
});

test('workflow:next infers active feature and routes to analyst after product', async () => {
  const dir = await makeTempDir();
  await writeProjectContext(dir, 'SMALL');
  await writeFileEnsured(path.join(dir, '.aioson/context/prd.md'), '# PRD\n');
  await writeFileEnsured(
    path.join(dir, '.aioson/context/features.md'),
    '# Features\n\n| slug | status | started | completed |\n|------|--------|---------|-----------|\n| compact-layout | in_progress | 2026-03-13 | — |\n'
  );
  await writeFileEnsured(path.join(dir, '.aioson/context/prd-compact-layout.md'), '# Feature PRD\n');

  const { t } = createTranslator('en');
  const result = await runWorkflowNext({
    args: [dir],
    options: { tool: 'codex' },
    logger: createQuietLogger(),
    t
  });

  assert.equal(result.mode, 'feature');
  assert.equal(result.featureSlug, 'compact-layout');
  assert.equal(result.agent, 'analyst');
  assert.deepEqual(result.completed, ['product']);
});

test('workflow:next reconciles stale feature state from approved upstream artifacts', async () => {
  const dir = await makeTempDir();
  const slug = 'official-dashboard-reform';
  await writeActiveFeature(dir, slug, 'MEDIUM');
  await writeFileEnsured(path.join(dir, `.aioson/context/requirements-${slug}.md`), '# Requirements\n');
  await writeFileEnsured(
    path.join(dir, `.aioson/context/spec-${slug}.md`),
    '---\ngate_requirements: approved\n---\n# Spec\n'
  );
  await writeFeatureWorkflowState(dir, { featureSlug: slug });

  const { t } = createTranslator('en');
  const result = await runWorkflowNext({
    args: [dir],
    options: { tool: 'codex' },
    logger: createQuietLogger(),
    t
  });

  assert.equal(result.agent, 'architect');
  assert.equal(result.current, 'architect');
  assert.equal(result.next, 'architect');
  assert.deepEqual(result.completed, ['product', 'analyst']);

  const persisted = JSON.parse(await fs.readFile(path.join(dir, '.aioson/context/workflow.state.json'), 'utf8'));
  assert.equal(persisted.next, 'architect');
  assert.deepEqual(persisted.completed, ['product', 'analyst']);
});

test('workflow:next keeps stale feature state at analyst when Gate A is pending', async () => {
  const dir = await makeTempDir();
  const slug = 'official-dashboard-reform';
  await writeActiveFeature(dir, slug, 'MEDIUM');
  await writeFileEnsured(path.join(dir, `.aioson/context/requirements-${slug}.md`), '# Requirements\n');
  await writeFileEnsured(
    path.join(dir, `.aioson/context/spec-${slug}.md`),
    '---\ngate_requirements: pending\n---\n# Spec\n'
  );
  await writeFeatureWorkflowState(dir, { featureSlug: slug });

  const { t } = createTranslator('en');
  const result = await runWorkflowNext({
    args: [dir],
    options: { tool: 'codex' },
    logger: createQuietLogger(),
    t
  });

  assert.equal(result.agent, 'analyst');
  assert.equal(result.current, 'analyst');
  assert.equal(result.next, 'analyst');
  assert.deepEqual(result.completed, ['product']);

  const persisted = JSON.parse(await fs.readFile(path.join(dir, '.aioson/context/workflow.state.json'), 'utf8'));
  assert.deepEqual(persisted.completed, ['product']);
  assert.equal(persisted.next, 'analyst');
});

test('workflow:next accepts phase_gates requirements approval during stale-state reconciliation', async () => {
  const dir = await makeTempDir();
  const slug = 'official-dashboard-reform';
  await writeActiveFeature(dir, slug, 'MEDIUM');
  await writeFileEnsured(path.join(dir, `.aioson/context/requirements-${slug}.md`), '# Requirements\n');
  await writeFileEnsured(
    path.join(dir, `.aioson/context/spec-${slug}.md`),
    '---\nphase_gates: \'{"requirements":"approved"}\'\n---\n# Spec\n'
  );
  await writeFeatureWorkflowState(dir, { featureSlug: slug });

  const { t } = createTranslator('en');
  const result = await runWorkflowNext({
    args: [dir],
    options: { tool: 'codex' },
    logger: createQuietLogger(),
    t
  });

  assert.equal(result.agent, 'architect');
  assert.deepEqual(result.completed, ['product', 'analyst']);
});

test('workflow:next accepts textual Gate A approval during stale-state reconciliation', async () => {
  const dir = await makeTempDir();
  const slug = 'official-dashboard-reform';
  await writeActiveFeature(dir, slug, 'MEDIUM');
  await writeFileEnsured(path.join(dir, `.aioson/context/requirements-${slug}.md`), '# Requirements\n');
  await writeFileEnsured(
    path.join(dir, `.aioson/context/spec-${slug}.md`),
    '# Spec\n\nGate A: approved\n'
  );
  await writeFeatureWorkflowState(dir, { featureSlug: slug });

  const { t } = createTranslator('en');
  const result = await runWorkflowNext({
    args: [dir],
    options: { tool: 'codex' },
    logger: createQuietLogger(),
    t
  });

  assert.equal(result.agent, 'architect');
  assert.deepEqual(result.completed, ['product', 'analyst']);
});

test('workflow:next repairs stale skipped stages when artifacts prove completion', async () => {
  const dir = await makeTempDir();
  const slug = 'official-dashboard-reform';
  await writeActiveFeature(dir, slug, 'MEDIUM');
  await writeFileEnsured(path.join(dir, `.aioson/context/requirements-${slug}.md`), '# Requirements\n');
  await writeFileEnsured(
    path.join(dir, `.aioson/context/spec-${slug}.md`),
    '---\ngate_requirements: approved\n---\n# Spec\n'
  );
  await writeFeatureWorkflowState(dir, {
    featureSlug: slug,
    skipped: ['analyst']
  });

  const loaded = await loadOrCreateState(dir);

  assert.deepEqual(loaded.state.completed, ['product', 'analyst']);
  assert.deepEqual(loaded.state.skipped, []);
  assert.equal(loaded.state.next, 'architect');
});

test('workflow:next infers scope-check (after discovery-design-doc) in a MEDIUM feature from artifacts', async () => {
  const dir = await makeTempDir();
  const slug = 'official-dashboard-reform';
  await writeActiveFeature(dir, slug, 'MEDIUM');
  await writeFileEnsured(path.join(dir, `.aioson/context/requirements-${slug}.md`), '# Requirements\n');
  await writeFileEnsured(
    path.join(dir, `.aioson/context/spec-${slug}.md`),
    '---\ngate_requirements: approved\ngate_design: approved\n---\n# Spec\n'
  );
  await writeFileEnsured(path.join(dir, '.aioson/context/architecture.md'), '# Architecture\n');
  await writeFileEnsured(path.join(dir, `.aioson/context/design-doc-${slug}.md`), '# Design Doc\n');
  await writeFileEnsured(path.join(dir, `.aioson/context/readiness-${slug}.md`), '# Readiness\n');
  await writeFileEnsured(path.join(dir, `.aioson/context/scope-check-${slug}.md`), '# Scope Check\n');
  await writeFeatureWorkflowState(dir, { featureSlug: slug });

  const loaded = await loadOrCreateState(dir);

  // Before the fix, inference stopped at discovery-design-doc (non-inferable) and
  // scope-check could never be recovered — leaving next stuck at discovery-design-doc.
  assert.deepEqual(loaded.state.completed, ['product', 'analyst', 'architect', 'discovery-design-doc', 'scope-check']);
  assert.deepEqual(loaded.state.skipped, []);
  assert.equal(loaded.state.next, 'dev');
});

test('workflow:next MEDIUM feature: fresh state sequences pm before scope-check and infers it from the implementation plan', async () => {
  const dir = await makeTempDir();
  const slug = 'official-dashboard-reform';
  await writeActiveFeature(dir, slug, 'MEDIUM');
  await writeFileEnsured(path.join(dir, `.aioson/context/requirements-${slug}.md`), '# Requirements\n');
  await writeFileEnsured(
    path.join(dir, `.aioson/context/spec-${slug}.md`),
    '---\ngate_requirements: approved\ngate_design: approved\n---\n# Spec\n'
  );
  await writeFileEnsured(path.join(dir, '.aioson/context/architecture.md'), '# Architecture\n');
  await writeFileEnsured(path.join(dir, `.aioson/context/design-doc-${slug}.md`), '# Design Doc\n');
  await writeFileEnsured(path.join(dir, `.aioson/context/readiness-${slug}.md`), '# Readiness\n');
  await writeFileEnsured(path.join(dir, `.aioson/context/implementation-plan-${slug}.md`), '---\nstatus: approved\n---\n# Plan\n');
  await writeFileEnsured(path.join(dir, `.aioson/context/scope-check-${slug}.md`), '# Scope Check\n');
  // No workflow.state.json — fresh state built from the default MEDIUM feature sequence

  const loaded = await loadOrCreateState(dir);

  assert.deepEqual(
    loaded.state.sequence,
    ['product', 'analyst', 'architect', 'discovery-design-doc', 'pm', 'scope-check', 'dev', 'pentester', 'qa']
  );
  assert.deepEqual(
    loaded.state.completed,
    ['product', 'analyst', 'architect', 'discovery-design-doc', 'pm', 'scope-check']
  );
  assert.equal(loaded.state.next, 'dev');
});

test('workflow:next MEDIUM feature: inference stops at pm while the implementation plan is missing', async () => {
  const dir = await makeTempDir();
  const slug = 'official-dashboard-reform';
  await writeActiveFeature(dir, slug, 'MEDIUM');
  await writeFileEnsured(path.join(dir, `.aioson/context/requirements-${slug}.md`), '# Requirements\n');
  await writeFileEnsured(
    path.join(dir, `.aioson/context/spec-${slug}.md`),
    '---\ngate_requirements: approved\ngate_design: approved\n---\n# Spec\n'
  );
  await writeFileEnsured(path.join(dir, '.aioson/context/architecture.md'), '# Architecture\n');
  await writeFileEnsured(path.join(dir, `.aioson/context/design-doc-${slug}.md`), '# Design Doc\n');
  await writeFileEnsured(path.join(dir, `.aioson/context/readiness-${slug}.md`), '# Readiness\n');
  await writeFileEnsured(path.join(dir, `.aioson/context/scope-check-${slug}.md`), '# Scope Check\n');

  const loaded = await loadOrCreateState(dir);

  assert.deepEqual(loaded.state.completed, ['product', 'analyst', 'architect', 'discovery-design-doc']);
  assert.equal(loaded.state.next, 'pm');
});

test('workflow:next does not infer mainline progress while a detour is active', async () => {
  const dir = await makeTempDir();
  const slug = 'official-dashboard-reform';
  await writeActiveFeature(dir, slug, 'MEDIUM');
  await writeFileEnsured(path.join(dir, `.aioson/context/requirements-${slug}.md`), '# Requirements\n');
  await writeFileEnsured(
    path.join(dir, `.aioson/context/spec-${slug}.md`),
    '---\ngate_requirements: approved\n---\n# Spec\n'
  );
  await writeFeatureWorkflowState(dir, {
    featureSlug: slug,
    current: 'ux-ui',
    next: 'product',
    detour: {
      active: true,
      agent: 'ux-ui',
      returnTo: 'product'
    }
  });

  const loaded = await loadOrCreateState(dir);

  assert.deepEqual(loaded.state.completed, []);
  assert.equal(loaded.state.current, 'ux-ui');
  assert.equal(loaded.state.next, 'product');
  assert.deepEqual(loaded.state.detour, {
    active: true,
    agent: 'ux-ui',
    returnTo: 'product'
  });
});

test('workflow:next does not infer completed stages while a mainline stage is active', async () => {
  const dir = await makeTempDir();
  const slug = 'official-dashboard-reform';
  await writeActiveFeature(dir, slug, 'MEDIUM');
  await writeFileEnsured(path.join(dir, `.aioson/context/requirements-${slug}.md`), '# Requirements\n');
  await writeFileEnsured(
    path.join(dir, `.aioson/context/spec-${slug}.md`),
    '---\ngate_requirements: approved\n---\n# Spec\n'
  );
  await writeFeatureWorkflowState(dir, {
    featureSlug: slug,
    current: 'product',
    next: 'analyst'
  });

  const loaded = await loadOrCreateState(dir);

  assert.deepEqual(loaded.state.completed, []);
  assert.equal(loaded.state.current, 'product');
  assert.equal(loaded.state.next, 'analyst');
});

test('workflow:next reconciles stale project state from upstream artifacts', async () => {
  const dir = await makeTempDir();
  await writeProjectContext(dir, 'MEDIUM');
  await writeFileEnsured(path.join(dir, '.aioson/context/prd.md'), '# PRD\n');
  await writeFileEnsured(path.join(dir, '.aioson/context/discovery.md'), '# Discovery\n');
  await writeFileEnsured(
    path.join(dir, '.aioson/context/workflow.state.json'),
    JSON.stringify({
      version: 1,
      mode: 'project',
      classification: 'MEDIUM',
      sequence: ['setup', 'product', 'analyst', 'architect', 'discovery-design-doc', 'ux-ui', 'pm', 'orchestrator', 'scope-check', 'dev', 'qa'],
      current: null,
      next: 'product',
      completed: [],
      skipped: [],
      featureSlug: null,
      detour: null,
      updatedAt: new Date().toISOString()
    }, null, 2)
  );

  const { t } = createTranslator('en');
  const result = await runWorkflowNext({
    args: [dir],
    options: { tool: 'codex' },
    logger: createQuietLogger(),
    t
  });

  assert.equal(result.mode, 'project');
  assert.equal(result.agent, 'architect');
  assert.deepEqual(result.completed, ['setup', 'product', 'analyst']);
});

test('workflow:next injects dev-state context package when activating dev for a feature', async () => {
  const dir = await makeTempDir();
  const slug = 'quality-governance';
  await writeProjectContext(dir, 'SMALL');
  await writeFileEnsured(
    path.join(dir, '.aioson/context/features.md'),
    `# Features\n\n| slug | status | started | completed |\n|------|--------|---------|-----------|\n| ${slug} | in_progress | 2026-06-02 | — |\n`
  );
  await writeFileEnsured(path.join(dir, `.aioson/context/prd-${slug}.md`), '# Feature PRD\n');
  await writeFileEnsured(path.join(dir, `.aioson/context/requirements-${slug}.md`), '# Requirements\n');
  await writeFileEnsured(path.join(dir, `.aioson/context/spec-${slug}.md`), '# Spec\n');
  await writeFileEnsured(
    path.join(dir, `.aioson/context/sheldon-enrichment-${slug}.md`),
    '# Sheldon enrichment\n'
  );
  await writeFileEnsured(
    path.join(dir, '.aioson/context/dev-state.md'),
    `---\nactive_feature: ${slug}\nactive_phase: 1\nnext_step: "Implement quality audit MVP"\nstatus: in_progress\n---\n\n# Dev State\n\n## Context package\n\n1. project.context.md\n2. spec-${slug}.md\n3. requirements-${slug}.md\n4. sheldon-enrichment-${slug}.md\n`
  );
  await writeFileEnsured(
    path.join(dir, '.aioson/context/workflow.state.json'),
    JSON.stringify({
      version: 1,
      mode: 'feature',
      classification: 'SMALL',
      sequence: ['product', 'analyst', 'dev', 'qa'],
      current: 'dev',
      next: 'dev',
      completed: ['product', 'analyst'],
      skipped: [],
      featureSlug: slug,
      detour: null,
      updatedAt: new Date().toISOString()
    }, null, 2)
  );

  const { t } = createTranslator('en');
  const result = await runWorkflowNext({
    args: [dir],
    options: { tool: 'codex', agent: 'dev' },
    logger: createQuietLogger(),
    t
  });

  assert.equal(result.agent, 'dev');
  assert.match(result.prompt, /Check required context files first: \.aioson\/context\/dev-state\.md/);
  assert.match(result.prompt, new RegExp(`\\.aioson/context/spec-${slug}\\.md`));
  assert.match(result.prompt, new RegExp(`\\.aioson/context/requirements-${slug}\\.md`));
  assert.match(result.prompt, new RegExp(`\\.aioson/context/sheldon-enrichment-${slug}\\.md`));
  assert.doesNotMatch(result.prompt, /Check required context files first: .*\.aioson\/context\/discovery\.md/);
  assert.doesNotMatch(result.prompt, /Check required context files first: .*\.aioson\/context\/architecture\.md/);
  assert.match(result.prompt, /Resume source: \.aioson\/context\/dev-state\.md/);
});

test('workflow:next ignores stale dev-state package when activating dev for another feature', async () => {
  const dir = await makeTempDir();
  const slug = 'bridge-apps-integration-builder';
  await writeProjectContext(dir, 'MEDIUM');
  await writeFileEnsured(
    path.join(dir, '.aioson/context/features.md'),
    `# Features\n\n| slug | status | started | completed |\n|------|--------|---------|-----------|\n| maintenance-harness-picker | in_progress | 2026-06-01 | — |\n| ${slug} | in_progress | 2026-06-03 | — |\n`
  );
  await writeFileEnsured(path.join(dir, `.aioson/context/prd-${slug}.md`), '---\nclassification: MEDIUM\n---\n# Feature PRD\n');
  await writeFileEnsured(path.join(dir, `.aioson/context/requirements-${slug}.md`), '# Requirements\n');
  await writeFileEnsured(path.join(dir, `.aioson/context/spec-${slug}.md`), '# Spec\n');
  await writeFileEnsured(path.join(dir, '.aioson/context/design-doc.md'), '# Design Doc\n');
  await writeFileEnsured(path.join(dir, '.aioson/context/readiness.md'), '# Readiness\n');
  await writeFileEnsured(path.join(dir, `.aioson/context/implementation-plan-${slug}.md`), '---\nstatus: approved\n---\n# Plan\n');
  await writeFileEnsured(
    path.join(dir, '.aioson/context/dev-state.md'),
    `---\nactive_feature: maintenance-harness-picker\nactive_phase: 9\nnext_step: "Old feature step"\nstatus: in_progress\n---\n\n# Dev State\n\n## Context package\n\n1. project.context.md\n2. spec-maintenance-harness-picker.md\n3. implementation-plan-maintenance-harness-picker.md\n`
  );
  await writeFileEnsured(
    path.join(dir, '.aioson/context/last-handoff.json'),
    JSON.stringify({ feature_slug: slug }, null, 2)
  );
  await writeFileEnsured(
    path.join(dir, '.aioson/context/workflow.state.json'),
    JSON.stringify({
      version: 1,
      mode: 'feature',
      classification: 'MEDIUM',
      sequence: ['product', 'analyst', 'architect', 'discovery-design-doc', 'scope-check', 'dev', 'qa'],
      current: 'dev',
      next: 'dev',
      completed: ['product', 'analyst', 'architect', 'discovery-design-doc', 'scope-check'],
      skipped: [],
      featureSlug: slug,
      detour: null,
      updatedAt: new Date().toISOString()
    }, null, 2)
  );

  const { t } = createTranslator('en');
  const result = await runWorkflowNext({
    args: [dir],
    options: { tool: 'codex', agent: 'dev' },
    logger: createQuietLogger(),
    t
  });

  assert.equal(result.agent, 'dev');
  assert.match(result.prompt, new RegExp(`\\.aioson/context/spec-${slug}\\.md`));
  assert.match(result.prompt, /\.aioson\/context\/readiness\.md/);
  assert.doesNotMatch(result.prompt, /spec-maintenance-harness-picker/);
  assert.doesNotMatch(result.prompt, /Resume source: \.aioson\/context\/dev-state\.md/);
  assert.match(result.prompt, /Resume source: active feature artifacts/);
});

test('workflow:next ignores dev-state package when active_feature is missing', async () => {
  const dir = await makeTempDir();
  const slug = 'bridge-apps-integration-builder';
  await writeProjectContext(dir, 'MEDIUM');
  await writeFileEnsured(
    path.join(dir, '.aioson/context/features.md'),
    `# Features\n\n| slug | status | started | completed |\n|------|--------|---------|-----------|\n| ${slug} | in_progress | 2026-06-03 | — |\n`
  );
  await writeFileEnsured(path.join(dir, `.aioson/context/prd-${slug}.md`), '---\nclassification: MEDIUM\n---\n# Feature PRD\n');
  await writeFileEnsured(path.join(dir, `.aioson/context/requirements-${slug}.md`), '# Requirements\n');
  await writeFileEnsured(path.join(dir, `.aioson/context/spec-${slug}.md`), '# Spec\n');
  await writeFileEnsured(path.join(dir, `.aioson/context/design-doc-${slug}.md`), '# Feature Design Doc\n');
  await writeFileEnsured(path.join(dir, `.aioson/context/readiness-${slug}.md`), '# Feature Readiness\n');
  await writeFileEnsured(path.join(dir, `.aioson/context/implementation-plan-${slug}.md`), '---\nstatus: approved\n---\n# Plan\n');
  await writeFileEnsured(
    path.join(dir, '.aioson/context/dev-state.md'),
    `---\nactive_phase: 9\nnext_step: "Ambiguous old feature step"\nstatus: in_progress\n---\n\n# Dev State\n\n## Context package\n\n1. project.context.md\n2. spec-old-feature.md\n`
  );
  await writeFileEnsured(
    path.join(dir, '.aioson/context/workflow.state.json'),
    JSON.stringify({
      version: 1,
      mode: 'feature',
      classification: 'MEDIUM',
      sequence: ['product', 'analyst', 'architect', 'discovery-design-doc', 'scope-check', 'dev', 'qa'],
      current: 'dev',
      next: 'dev',
      completed: ['product', 'analyst', 'architect', 'discovery-design-doc', 'scope-check'],
      skipped: [],
      featureSlug: slug,
      detour: null,
      updatedAt: new Date().toISOString()
    }, null, 2)
  );

  const { t } = createTranslator('en');
  const result = await runWorkflowNext({
    args: [dir],
    options: { tool: 'codex', agent: 'dev' },
    logger: createQuietLogger(),
    t
  });

  assert.equal(result.agent, 'dev');
  assert.match(result.prompt, new RegExp(`\\.aioson/context/design-doc-${slug}\\.md`));
  assert.match(result.prompt, new RegExp(`\\.aioson/context/readiness-${slug}\\.md`));
  assert.doesNotMatch(result.prompt, /spec-old-feature/);
  assert.doesNotMatch(result.prompt, /Resume source: \.aioson\/context\/dev-state\.md/);
});

test('workflow:next prefers last-handoff feature when multiple features are in progress', async () => {
  const dir = await makeTempDir();
  await writeProjectContext(dir, 'MEDIUM');
  await writeFileEnsured(
    path.join(dir, '.aioson/context/features.md'),
    '# Features\n\n| slug | status | started | completed |\n|------|--------|---------|-----------|\n| old-feature | in_progress | 2026-06-01 | — |\n| bridge-apps-integration-builder | in_progress | 2026-06-03 | — |\n'
  );
  await writeFileEnsured(
    path.join(dir, '.aioson/context/last-handoff.json'),
    JSON.stringify({ feature_slug: 'bridge-apps-integration-builder' }, null, 2)
  );
  await writeFileEnsured(
    path.join(dir, '.aioson/context/prd-bridge-apps-integration-builder.md'),
    '---\nclassification: MEDIUM\n---\n# PRD\n'
  );

  const loaded = await loadOrCreateState(dir);

  assert.equal(loaded.state.mode, 'feature');
  assert.equal(loaded.state.featureSlug, 'bridge-apps-integration-builder');
});

test('workflow:next completes discovery-design-doc when feature-scoped design artifacts exist', async () => {
  const dir = await makeTempDir();
  const slug = 'bridge-apps-integration-builder';
  await writeProjectContext(dir, 'MEDIUM');
  await writeFileEnsured(
    path.join(dir, '.aioson/context/features.md'),
    `# Features\n\n| slug | status | started | completed |\n|------|--------|---------|-----------|\n| ${slug} | in_progress | 2026-06-03 | — |\n`
  );
  await writeFileEnsured(path.join(dir, `.aioson/context/prd-${slug}.md`), '---\nclassification: MEDIUM\n---\n# PRD\n');
  await writeFileEnsured(path.join(dir, `.aioson/context/requirements-${slug}.md`), '# Requirements\n');
  await writeFileEnsured(path.join(dir, `.aioson/context/spec-${slug}.md`), '# Spec\n');
  await writeFileEnsured(path.join(dir, '.aioson/context/architecture.md'), '# Architecture\n');
  await writeFileEnsured(path.join(dir, `.aioson/context/design-doc-${slug}.md`), '# Feature Design Doc\n');
  await writeFileEnsured(path.join(dir, `.aioson/context/readiness-${slug}.md`), '# Feature Readiness\n');
  await writeFileEnsured(
    path.join(dir, '.aioson/context/workflow.state.json'),
    JSON.stringify({
      version: 1,
      mode: 'feature',
      classification: 'MEDIUM',
      sequence: ['product', 'analyst', 'architect', 'discovery-design-doc', 'scope-check', 'dev', 'qa'],
      current: 'discovery-design-doc',
      next: 'scope-check',
      completed: ['product', 'analyst', 'architect'],
      skipped: [],
      featureSlug: slug,
      detour: null,
      updatedAt: new Date().toISOString()
    }, null, 2)
  );

  const { t } = createTranslator('en');
  const result = await runWorkflowNext({
    args: [dir],
    options: { tool: 'codex', complete: 'discovery-design-doc' },
    logger: createQuietLogger(),
    t
  });

  assert.equal(result.completedStage, 'discovery-design-doc');
  assert.equal(result.agent, 'scope-check');
});

test('workflow:next supports detours and returns to the saved stage', async () => {
  const dir = await makeTempDir();
  await writeProjectContext(dir, 'SMALL');
  await writeFileEnsured(path.join(dir, '.aioson/context/prd.md'), '# PRD\n');
  await writeFileEnsured(
    path.join(dir, '.aioson/context/features.md'),
    '# Features\n\n| slug | status | started | completed |\n|------|--------|---------|-----------|\n| compact-layout | in_progress | 2026-03-13 | — |\n'
  );
  await writeFileEnsured(path.join(dir, '.aioson/context/prd-compact-layout.md'), '# Feature PRD\n');

  const { t } = createTranslator('en');

  const detour = await runWorkflowNext({
    args: [dir],
    options: { tool: 'codex', agent: 'ux-ui' },
    logger: createQuietLogger(),
    t
  });

  assert.equal(detour.agent, 'ux-ui');
  assert.deepEqual(detour.detour, {
    active: true,
    agent: 'ux-ui',
    returnTo: 'analyst'
  });

  await writeFileEnsured(path.join(dir, '.aioson/context/ui-spec.md'), '# UI Spec\n');

  const resumed = await runWorkflowNext({
    args: [dir],
    options: { tool: 'codex', complete: true },
    logger: createQuietLogger(),
    t
  });

  assert.equal(resumed.completedStage, 'ux-ui');
  assert.equal(resumed.agent, 'analyst');
  assert.equal(resumed.detour, null);
});

test('workflow:next allows skip until dev but not past dev', async () => {
  const dir = await makeTempDir();
  await writeProjectContext(dir, 'SMALL');
  await writeFileEnsured(path.join(dir, '.aioson/context/prd.md'), '# PRD\n');

  const { t } = createTranslator('en');
  const skipped = await runWorkflowNext({
    args: [dir],
    options: { tool: 'codex', skip: 'dev' },
    logger: createQuietLogger(),
    t
  });

  assert.equal(skipped.agent, 'dev');
  assert.deepEqual(skipped.skipped, ['analyst', 'scope-check', 'architect', 'discovery-design-doc']);

  await assert.rejects(
    () =>
      runWorkflowNext({
        args: [dir],
        options: { tool: 'codex', skip: 'qa' },
        logger: createQuietLogger(),
        t
      }),
    /Cannot skip past @dev/
  );
});

test('workflow:next routes SMALL project through scope-check after analyst', async () => {
  const dir = await makeTempDir();
  await writeProjectContext(dir, 'SMALL');
  await writeFileEnsured(path.join(dir, '.aioson/context/prd.md'), '# PRD\n');
  await writeFileEnsured(path.join(dir, '.aioson/context/discovery.md'), '# Discovery\n');
  await writeFileEnsured(path.join(dir, '.aioson/context/architecture.md'), '# Architecture\n');

  const { t } = createTranslator('en');
  const result = await runWorkflowNext({
    args: [dir],
    options: { tool: 'codex' },
    logger: createQuietLogger(),
    t
  });

  assert.equal(result.agent, 'scope-check');
  assert.deepEqual(result.completed, ['setup', 'product', 'analyst']);
  assert.match(result.prompt, /scope-check\.md/);
});

test('workflow:next can invoke optional post-dev scope-check detour', async () => {
  const dir = await makeTempDir();
  await writeProjectContext(dir, 'SMALL');
  await writeFileEnsured(path.join(dir, '.aioson/context/prd.md'), '# PRD\n');
  await writeFileEnsured(path.join(dir, '.aioson/context/discovery.md'), '# Discovery\n');
  await writeFileEnsured(path.join(dir, '.aioson/context/scope-check.md'), '# Scope Check\n');
  await writeFileEnsured(path.join(dir, '.aioson/context/architecture.md'), '# Architecture\n');
  await writeFileEnsured(path.join(dir, '.aioson/context/design-doc.md'), '# Design Doc\n');
  await writeFileEnsured(path.join(dir, '.aioson/context/readiness.md'), '# Readiness\n');
  await writeFileEnsured(
    path.join(dir, '.aioson/context/workflow.state.json'),
    JSON.stringify({
      version: 1,
      mode: 'project',
      classification: 'SMALL',
      sequence: ['setup', 'product', 'analyst', 'scope-check', 'architect', 'discovery-design-doc', 'dev', 'qa'],
      current: 'qa',
      next: 'qa',
      completed: ['setup', 'product', 'analyst', 'scope-check', 'architect', 'discovery-design-doc', 'dev'],
      skipped: [],
      featureSlug: null,
      detour: null,
      updatedAt: new Date().toISOString()
    }, null, 2)
  );

  const { t } = createTranslator('en');
  const result = await runWorkflowNext({
    args: [dir],
    options: { tool: 'codex', agent: 'scope-check', 'scope-mode': 'post-dev' },
    logger: createQuietLogger(),
    t
  });

  assert.equal(result.agent, 'scope-check');
  assert.equal(result.detour.active, true);
  assert.equal(result.detour.returnTo, 'qa');
  assert.match(result.prompt, /Scope-check mode: post-dev/);
  assert.match(result.prompt, /actual implementation diff/);
});

test('workflow:next routes SMALL project through discovery-design-doc after scope-check and architect', async () => {
  const dir = await makeTempDir();
  await writeProjectContext(dir, 'SMALL');
  await writeFileEnsured(path.join(dir, '.aioson/context/prd.md'), '# PRD\n');
  await writeFileEnsured(path.join(dir, '.aioson/context/discovery.md'), '# Discovery\n');
  await writeFileEnsured(path.join(dir, '.aioson/context/scope-check.md'), '# Scope Check\n');
  await writeFileEnsured(path.join(dir, '.aioson/context/architecture.md'), '# Architecture\n');

  const { t } = createTranslator('en');
  const result = await runWorkflowNext({
    args: [dir],
    options: { tool: 'codex' },
    logger: createQuietLogger(),
    t
  });

  assert.equal(result.agent, 'discovery-design-doc');
  assert.deepEqual(result.completed, ['setup', 'product', 'analyst', 'scope-check', 'architect']);
  assert.match(result.prompt, /design-doc\.md/);
});

test('workflow:next blocks discovery-design-doc completion until design-doc and readiness exist', async () => {
  const dir = await makeTempDir();
  await writeProjectContext(dir, 'SMALL');
  await writeFileEnsured(path.join(dir, '.aioson/context/prd.md'), '# PRD\n');
  await writeFileEnsured(path.join(dir, '.aioson/context/discovery.md'), '# Discovery\n');
  await writeFileEnsured(path.join(dir, '.aioson/context/architecture.md'), '# Architecture\n');
  await writeFileEnsured(
    path.join(dir, '.aioson/context/workflow.state.json'),
    JSON.stringify({
      version: 1,
      mode: 'project',
      classification: 'SMALL',
      sequence: ['setup', 'product', 'analyst', 'scope-check', 'architect', 'discovery-design-doc', 'dev', 'qa'],
      current: 'discovery-design-doc',
      next: 'dev',
      completed: ['setup', 'product', 'analyst', 'scope-check', 'architect'],
      skipped: [],
      featureSlug: null,
      detour: null,
      updatedAt: new Date().toISOString()
    }, null, 2)
  );

  const { t } = createTranslator('en');
  await assert.rejects(
    () => runWorkflowNext({
      args: [dir],
      options: { tool: 'codex', complete: 'discovery-design-doc' },
      logger: createQuietLogger(),
      t
    }),
    /expected artifacts are missing/
  );
});

test('workflow:next appends workflow events for dashboard visibility', async () => {
  const dir = await makeTempDir();
  await writeProjectContext(dir, 'SMALL');
  await writeFileEnsured(path.join(dir, '.aioson/context/prd.md'), '# PRD\n');

  const { t } = createTranslator('en');
  await runWorkflowNext({
    args: [dir],
    options: { tool: 'codex' },
    logger: createQuietLogger(),
    t
  });

  const eventsPath = path.join(dir, EVENTS_RELATIVE_PATH);
  const raw = await fs.readFile(eventsPath, 'utf8');
  const lines = raw.trim().split(/\r?\n/).filter(Boolean);
  assert.equal(lines.length, 1);

  const event = JSON.parse(lines[0]);
  assert.equal(event.kind, 'workflow');
  assert.equal(event.eventType, 'start');
  assert.equal(event.current, 'analyst');
  assert.equal(event.next, 'analyst');
  assert.match(event.message, /Stage @analyst is active|Workflow initialized at @analyst/);
});

test('workflow:next syncs workflow task, runs, and canonical events into runtime sqlite', async () => {
  const dir = await makeTempDir();
  await writeProjectContext(dir, 'SMALL');
  await writeFileEnsured(path.join(dir, '.aioson/context/prd.md'), '# PRD\n');

  const { t } = createTranslator('en');
  const result = await runWorkflowNext({
    args: [dir],
    options: { tool: 'codex' },
    logger: createQuietLogger(),
    t
  });

  assert.equal(result.runtime.ok, true);

  const runtime = await openRuntimeDb(dir, { mustExist: true });
  try {
    const task = runtime.db.prepare('SELECT task_key, session_key, status FROM tasks ORDER BY updated_at DESC LIMIT 1').get();
    const workflowRun = runtime.db.prepare("SELECT agent_name, agent_kind, source, workflow_id FROM agent_runs WHERE agent_name = '@workflow' ORDER BY updated_at DESC LIMIT 1").get();
    const stageRun = runtime.db.prepare("SELECT agent_name, agent_kind, source, workflow_stage, parent_run_key, status FROM agent_runs WHERE agent_name = '@analyst' ORDER BY updated_at DESC LIMIT 1").get();
    const events = runtime.db.prepare('SELECT event_type, phase, source, workflow_stage FROM execution_events ORDER BY created_at DESC, id DESC LIMIT 10').all();

    assert.equal(task.session_key, 'workflow:project:project:default');
    assert.equal(task.status, 'running');
    assert.equal(workflowRun.agent_kind, 'workflow');
    assert.equal(workflowRun.source, 'workflow');
    assert.equal(workflowRun.workflow_id, 'workflow:project:project:default');
    assert.equal(stageRun.agent_kind, 'official');
    assert.equal(stageRun.source, 'workflow');
    assert.equal(stageRun.workflow_stage, 'analyst');
    assert.equal(stageRun.status, 'running');
    assert.equal(typeof stageRun.parent_run_key, 'string');
    assert.equal(events.some((event) => event.source === 'workflow'), true);
    assert.equal(events.some((event) => event.workflow_stage === 'analyst'), true);
  } finally {
    runtime.db.close();
  }

  await assert.doesNotReject(() => fs.access(path.join(dir, 'aioson-logs')));
});

test('loadOrCreateState reconciles stale persisted stages when a later stage is already completed', async () => {
  const dir = await makeTempDir();
  await writeProjectContext(dir, 'MEDIUM');
  await writeFileEnsured(
    path.join(dir, '.aioson/context/features.md'),
    '# Features\n\n| slug | status | started | completed |\n|------|--------|---------|-----------|\n| secure-by-default | in_progress | 2026-04-28 | — |\n'
  );
  await writeFileEnsured(path.join(dir, '.aioson/context/prd-secure-by-default.md'), '# Feature PRD\n');

  const statePath = path.join(dir, '.aioson/context/workflow.state.json');
  await writeFileEnsured(
    statePath,
    JSON.stringify({
      version: 1,
      mode: 'feature',
      classification: 'MEDIUM',
      sequence: ['product', 'analyst', 'dev', 'pentester', 'qa'],
      current: 'pentester',
      next: 'pentester',
      completed: ['product', 'analyst', 'dev', 'qa'],
      skipped: [],
      featureSlug: 'secure-by-default',
      detour: null,
      updatedAt: new Date().toISOString()
    }, null, 2)
  );

  const loaded = await loadOrCreateState(dir);
  assert.equal(loaded.created, false);
  assert.equal(loaded.state.current, null);
  assert.equal(loaded.state.next, null);
  assert.deepEqual(loaded.state.skipped, ['pentester']);
  assert.deepEqual(loaded.state.completed, ['product', 'analyst', 'dev', 'qa']);

  const persisted = JSON.parse(await fs.readFile(statePath, 'utf8'));
  assert.equal(persisted.current, null);
  assert.equal(persisted.next, null);
  assert.deepEqual(persisted.skipped, ['pentester']);
});

test('loadOrCreateState discards feature state when the only feature is paused', async () => {
  const dir = await makeTempDir();
  await writeProjectContext(dir, 'SMALL');
  await writeFileEnsured(path.join(dir, '.aioson/context/prd.md'), '# Project PRD\n');
  await writeFileEnsured(
    path.join(dir, '.aioson/context/features.md'),
    '# Features\n\n| slug | status | started | completed |\n|------|--------|---------|-----------|\n| gemini-phaseout | paused | 2026-05-23 | — |\n'
  );

  const statePath = path.join(dir, '.aioson/context/workflow.state.json');
  await writeFileEnsured(
    statePath,
    JSON.stringify({
      version: 1,
      mode: 'feature',
      classification: 'SMALL',
      sequence: ['product', 'analyst', 'dev', 'qa'],
      current: null,
      next: null,
      completed: ['product', 'analyst', 'dev', 'qa'],
      skipped: [],
      featureSlug: 'gemini-phaseout',
      detour: null,
      updatedAt: new Date().toISOString()
    }, null, 2)
  );

  const loaded = await loadOrCreateState(dir);
  assert.equal(loaded.created, true);
  assert.equal(loaded.state.mode, 'project');
  assert.equal(loaded.state.featureSlug, null);
});

test('loadOrCreateState discards project state when a new feature is opened', async () => {
  const dir = await makeTempDir();
  await writeProjectContext(dir, 'MEDIUM');
  await writeFileEnsured(path.join(dir, '.aioson/context/prd.md'), '# Project PRD\n');
  await writeFileEnsured(
    path.join(dir, '.aioson/context/features.md'),
    '# Features\n\n| slug | status | started | completed |\n|------|--------|---------|-----------|\n| cost-context-optimization | in_progress | 2026-06-01 | — |\n'
  );
  await writeFileEnsured(
    path.join(dir, '.aioson/context/prd-cost-context-optimization.md'),
    '---\nclassification: SMALL\n---\n# Feature PRD\n'
  );

  await writeFileEnsured(
    path.join(dir, '.aioson/context/workflow.state.json'),
    JSON.stringify({
      version: 1,
      mode: 'project',
      classification: 'MEDIUM',
      sequence: ['setup', 'product', 'analyst', 'architect', 'ux-ui', 'pm', 'orchestrator', 'dev', 'qa'],
      current: 'ux-ui',
      next: 'ux-ui',
      completed: ['setup', 'product', 'analyst', 'architect'],
      skipped: [],
      featureSlug: null,
      detour: null,
      updatedAt: new Date().toISOString()
    }, null, 2)
  );

  const loaded = await loadOrCreateState(dir);
  assert.equal(loaded.created, true);
  assert.equal(loaded.state.mode, 'feature');
  assert.equal(loaded.state.featureSlug, 'cost-context-optimization');
  assert.equal(loaded.state.classification, 'SMALL');
  assert.deepEqual(loaded.state.completed, ['product']);
});

test('workflow:next writes handoff-protocol.json in parallel with last-handoff.json', async () => {
  const dir = await makeTempDir();
  await writeProjectContext(dir, 'SMALL');
  await writeFileEnsured(
    path.join(dir, '.aioson/config/autonomy-protocol.json'),
    JSON.stringify({
      version: '1.0',
      global_mode: 'guarded',
      tools: {
        codex: {
          mode: 'trusted',
          requires_tty: false
        }
      },
      agents: {
        dev: {
          max_mode: 'trusted'
        }
      }
    }, null, 2)
  );
  await writeFileEnsured(
    path.join(dir, '.aioson/context/features.md'),
    '# Features\n\n| slug | status | started | completed |\n|------|--------|---------|-----------|\n| protocol-contracts | in_progress | 2026-04-16 | — |\n'
  );
  await writeFileEnsured(path.join(dir, '.aioson/context/prd-protocol-contracts.md'), '# Feature PRD\n');
  await writeFileEnsured(path.join(dir, '.aioson/context/requirements-protocol-contracts.md'), '# Requirements\n');
  await writeFileEnsured(
    path.join(dir, '.aioson/context/spec-protocol-contracts.md'),
    '---\ngate_requirements: approved\ngate_design: approved\n---\n# Spec\n'
  );
  await writeFileEnsured(path.join(dir, '.aioson/context/discovery.md'), '# Discovery\n');
  await writeFileEnsured(path.join(dir, '.aioson/context/architecture.md'), '# Architecture\n');
  await writeFileEnsured(path.join(dir, '.aioson/context/project-pulse.md'), '# Pulse\n');
  await writeFileEnsured(
    path.join(dir, '.aioson/context/workflow.state.json'),
    JSON.stringify({
      version: 1,
      mode: 'feature',
      classification: 'SMALL',
      sequence: ['product', 'analyst', 'architect', 'dev', 'qa'],
      current: 'architect',
      next: 'architect',
      completed: ['product', 'analyst'],
      skipped: [],
      featureSlug: 'protocol-contracts',
      detour: null,
      updatedAt: new Date().toISOString()
    }, null, 2)
  );

  const { t } = createTranslator('en');
  const result = await runWorkflowNext({
    args: [dir],
    options: { tool: 'codex', complete: 'architect' },
    logger: createQuietLogger(),
    t
  });

  assert.equal(result.completedStage, 'architect');

  const protocolPath = path.join(dir, HANDOFF_PROTOCOL_RELATIVE_PATH);
  const raw = await fs.readFile(protocolPath, 'utf8');
  const protocol = JSON.parse(raw);

  assert.equal(protocol.version, '1.0');
  assert.equal(protocol.from.agent_id, 'architect');
  assert.equal(protocol.to.agent_id, 'dev');
  assert.equal(protocol.to.capability_required, 'implement_feature');
  assert.equal(protocol.autonomy_mode, 'trusted');
  assert.equal(protocol.validation.handoff_contract_ok, true);
  assert.equal(protocol.validation.technical_gate_ok, true);
});

test('workflow:next emits handoff protocol warning when next agent has no capability manifest', async () => {
  const dir = await makeTempDir();
  await writeProjectContext(dir, 'SMALL');

  await writeFileEnsured(path.join(dir, '.aioson/context/features.md'),
    '# Features\n\n| slug | status | started | completed |\n|------|--------|---------|-----------|\n| my-feat | in_progress | 2026-04-17 | — |\n'
  );
  await writeFileEnsured(path.join(dir, '.aioson/context/prd-my-feat.md'), '# PRD\n');
  await writeFileEnsured(path.join(dir, '.aioson/context/requirements-my-feat.md'), '# Requirements\n');
  await writeFileEnsured(
    path.join(dir, '.aioson/context/spec-my-feat.md'),
    '---\ngate_requirements: approved\ngate_design: approved\n---\n# Spec\n'
  );
  await writeFileEnsured(path.join(dir, '.aioson/context/discovery.md'), '# Discovery\n');
  await writeFileEnsured(path.join(dir, '.aioson/context/architecture.md'), '# Architecture\n');
  await writeFileEnsured(path.join(dir, '.aioson/context/project-pulse.md'), '# Pulse\n');
  await writeFileEnsured(
    path.join(dir, '.aioson/context/workflow.state.json'),
    JSON.stringify({
      version: 1,
      mode: 'feature',
      classification: 'SMALL',
      sequence: ['product', 'analyst', 'architect', 'dev', 'qa'],
      current: 'architect',
      next: 'architect',
      completed: ['product', 'analyst'],
      skipped: [],
      featureSlug: 'my-feat',
      detour: null,
      updatedAt: new Date().toISOString()
    }, null, 2)
  );

  const warnings = [];
  const { t } = createTranslator('en');
  const result = await runWorkflowNext({
    args: [dir],
    options: { tool: 'codex', complete: 'architect' },
    logger: { log() {}, error(line) { warnings.push(String(line)); } },
    t
  });

  assert.equal(result.completedStage, 'architect');
  assert.equal(warnings.some((line) => line.includes('Handoff protocol warning')), true);
  assert.equal(warnings.some((line) => line.includes('dev') && line.includes('no capability manifest')), true);
});

test('workflow:next completes architect in project mode without spec.md when architecture.md exists', async () => {
  const dir = await makeTempDir();
  await writeProjectContext(dir, 'SMALL');
  await writeFileEnsured(path.join(dir, '.aioson/context/prd.md'), '# PRD\n');
  await writeFileEnsured(path.join(dir, '.aioson/context/discovery.md'), '# Discovery\n');
  await writeFileEnsured(
    path.join(dir, '.aioson/context/architecture.md'),
    '# Architecture\n\n> **Gate B:** Architecture approved — @dev can proceed.\n'
  );
  await writeFileEnsured(path.join(dir, '.aioson/context/project-pulse.md'), '# Pulse\n');
  await writeFileEnsured(
    path.join(dir, '.aioson/context/workflow.state.json'),
    JSON.stringify({
      version: 1,
      mode: 'project',
      classification: 'SMALL',
      sequence: ['setup', 'product', 'analyst', 'architect', 'dev', 'qa'],
      current: 'architect',
      next: 'architect',
      completed: ['setup', 'product', 'analyst'],
      skipped: [],
      featureSlug: null,
      detour: null,
      updatedAt: new Date().toISOString()
    }, null, 2)
  );

  const { t } = createTranslator('en');
  const result = await runWorkflowNext({
    args: [dir],
    options: { tool: 'codex', complete: 'architect' },
    logger: createQuietLogger(),
    t
  });

  assert.equal(result.completedStage, 'architect');
  assert.equal(result.mode, 'project');
  assert.equal(result.agent, 'dev');
  assert.equal(result.current, 'dev');
  assert.equal(result.next, 'dev');
});

test('workflow:next blocks architect in project mode when spec.md explicitly keeps Gate B pending', async () => {
  const dir = await makeTempDir();
  await writeProjectContext(dir, 'SMALL');
  await writeFileEnsured(path.join(dir, '.aioson/context/prd.md'), '# PRD\n');
  await writeFileEnsured(path.join(dir, '.aioson/context/discovery.md'), '# Discovery\n');
  await writeFileEnsured(path.join(dir, '.aioson/context/architecture.md'), '# Architecture\n');
  await writeFileEnsured(
    path.join(dir, '.aioson/context/spec.md'),
    '---\ngate_design: pending\n---\n# Spec\n'
  );
  await writeFileEnsured(path.join(dir, '.aioson/context/project-pulse.md'), '# Pulse\n');
  await writeFileEnsured(
    path.join(dir, '.aioson/context/workflow.state.json'),
    JSON.stringify({
      version: 1,
      mode: 'project',
      classification: 'SMALL',
      sequence: ['setup', 'product', 'analyst', 'architect', 'dev', 'qa'],
      current: 'architect',
      next: 'architect',
      completed: ['setup', 'product', 'analyst'],
      skipped: [],
      featureSlug: null,
      detour: null,
      updatedAt: new Date().toISOString()
    }, null, 2)
  );

  const { t } = createTranslator('en');
  await assert.rejects(
    () =>
      runWorkflowNext({
        args: [dir],
        options: { tool: 'codex', complete: 'architect' },
        logger: createQuietLogger(),
        t
      }),
    /gate B not approved/
  );
});
