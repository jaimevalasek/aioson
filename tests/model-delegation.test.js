'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  buildDelegationPlan,
  readTask,
  resolveDelegationModel
} = require('../src/model-delegation');
const { runDelegationRun } = require('../src/commands/delegation');

const unavailableCatalog = async () => ({ available: false, reason: 'catalog_unavailable', models: [] });
const codexCatalog = async () => ({
  available: true,
  source: 'fixture',
  models: [
    { slug: 'gpt-5.6-terra', display_name: 'GPT-5.6-Terra', supported_efforts: ['high'] },
    { slug: 'gpt-5.6-luna', display_name: 'GPT-5.6-Luna', supported_efforts: ['high'] }
  ]
});

async function tempProject() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-model-delegation-'));
}

test('delegation requires an explicit user model request', async () => {
  const result = await buildDelegationPlan({
    projectDir: await tempProject(),
    host: 'claude',
    model: 'sonnet-5',
    task: 'Research relevant product references.',
    catalogLoader: unavailableCatalog
  });
  assert.deepEqual(result, { ok: false, reason: 'explicit_model_request_required' });
});

test('same-provider plan binds a normalized display model and preserves provenance', async () => {
  const result = await buildDelegationPlan({
    projectDir: await tempProject(),
    host: 'claude',
    provider: 'claude',
    model: 'Sonnet 5',
    kind: 'image-research',
    task: 'Find editorial workspace images for a calm research product.',
    researchSlug: 'editorial-workspace-images',
    explicitModelRequest: true,
    catalogLoader: unavailableCatalog
  });

  assert.equal(result.ok, true);
  assert.equal(result.mode, 'native');
  assert.equal(result.model_requested, 'Sonnet 5');
  assert.equal(result.model_resolved, 'sonnet-5');
  assert.equal(result.model_resolution_strategy, 'normalized_literal');
  assert.equal(result.native_dispatch.model, 'sonnet-5');
  assert.equal(result.persistence.path, 'researchs/editorial-workspace-images/summary.md');
  assert.match(result.worker_prompt, /Read-only/);
  assert.match(result.worker_prompt, /license\/usage status/);
  assert.match(result.worker_prompt, /parent owns persistence/);
  assert.match(result.worker_prompt, /Do not spawn another subagent/);
});

test('cross-provider work chooses external mode and native cross-provider is forbidden', async () => {
  const base = {
    projectDir: await tempProject(),
    host: 'codex',
    provider: 'claude',
    model: 'sonnet-5',
    task: 'Critique the visual hierarchy.',
    explicitModelRequest: true,
    catalogLoader: unavailableCatalog
  };
  const automatic = await buildDelegationPlan(base);
  assert.equal(automatic.ok, true);
  assert.equal(automatic.mode, 'external');
  assert.equal(automatic.native_dispatch, null);

  const native = await buildDelegationPlan({ ...base, mode: 'native' });
  assert.equal(native.ok, false);
  assert.equal(native.reason, 'native_cross_provider_forbidden');
});

test('invalid host, provider, unsafe model, and configured default fail closed', async () => {
  const base = {
    projectDir: await tempProject(),
    task: 'Research one bounded question.',
    explicitModelRequest: true,
    catalogLoader: unavailableCatalog
  };
  assert.equal((await buildDelegationPlan({ ...base, host: 'shell', model: 'safe-model' })).reason, 'invalid_host');
  assert.equal((await buildDelegationPlan({ ...base, host: 'claude', provider: 'shell', model: 'safe-model' })).reason, 'invalid_provider');
  assert.equal((await buildDelegationPlan({ ...base, host: 'claude', model: 'safe; rm' })).reason, 'invalid_model');
  assert.equal((await buildDelegationPlan({ ...base, host: 'claude', model: 'configured-default' })).reason, 'explicit_model_required');
});

test('fuzzy catalog resolution requires confirmation instead of silently changing model', async () => {
  const result = await resolveDelegationModel('codex', 'gpt-5.6-tera', 'high', codexCatalog);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'model_confirmation_required');
  assert.deepEqual(result.candidates, ['gpt-5.6-terra']);
});

test('verified Codex display names resolve through the catalog', async () => {
  const result = await resolveDelegationModel('codex', 'GPT 5.6 Terra', 'high', codexCatalog);
  assert.equal(result.ok, true);
  assert.equal(result.model_resolved, 'gpt-5.6-terra');
  assert.equal(result.model_resolution_strategy, 'normalized_name');
});

test('task files are project-relative, bounded, and cannot traverse out of the project', async () => {
  const projectDir = await tempProject();
  await fs.mkdir(path.join(projectDir, 'tasks'));
  await fs.writeFile(path.join(projectDir, 'tasks', 'research.md'), 'Find three licensed image references.', 'utf8');

  const valid = await readTask(projectDir, { taskFile: 'tasks/research.md' });
  assert.equal(valid.ok, true);
  assert.equal(valid.task_file, 'tasks/research.md');

  const escaped = await readTask(projectDir, { taskFile: '../outside.md' });
  assert.equal(escaped.ok, false);
});

test('task files cannot escape through a filesystem symlink', async (t) => {
  const projectDir = await tempProject();
  const outsideDir = await tempProject();
  const outside = path.join(outsideDir, 'outside.md');
  const link = path.join(projectDir, 'linked.md');
  await fs.writeFile(outside, 'private external task', 'utf8');
  try {
    await fs.symlink(outside, link, 'file');
  } catch (error) {
    if (error.code === 'EPERM' || error.code === 'EACCES') {
      t.skip('filesystem does not permit symlink creation');
      return;
    }
    throw error;
  }

  const result = await readTask(projectDir, { taskFile: 'linked.md' });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'task_file_symlink_escape');
});

test('external delegation executes the exact resolved model read-only without a shell adapter', async () => {
  const projectDir = await tempProject();
  let invocation;
  const adapterRegistry = {
    claude: {
      async execute(options) {
        invocation = options;
        options.onStdout('Evidence with https://example.com/source');
        return { ok: true };
      }
    }
  };
  const result = await runDelegationRun({
    args: [projectDir],
    options: {
      host: 'codex',
      provider: 'claude',
      model: 'Sonnet 5',
      kind: 'research',
      task: 'Research a bounded visual reference question.',
      'explicit-model-request': true,
      json: true
    },
    logger: { log() {}, error() {} },
    catalogLoader: unavailableCatalog,
    adapterRegistry
  });

  assert.equal(result.ok, true);
  assert.equal(result.mode, 'external');
  assert.equal(result.model_resolved, 'sonnet-5');
  assert.equal(result.result, 'Evidence with https://example.com/source');
  assert.equal(invocation.mode, 'external');
  assert.equal(invocation.model, 'sonnet-5');
  assert.equal(invocation.sandbox_mode, 'read-only');
  assert.deepEqual(invocation.writable_roots, []);
  assert.equal(invocation.cwd, projectDir);
  assert.match(invocation.prompt_text, /Do not write project files/);
});

test('external OpenCode delegation fails closed until a verified read-only adapter exists', async () => {
  const result = await runDelegationRun({
    args: [await tempProject()],
    options: {
      host: 'claude',
      provider: 'opencode',
      model: 'research-model',
      task: 'Research a bounded question.',
      'explicit-model-request': true,
      json: true
    },
    logger: { log() {}, error() {} },
    catalogLoader: unavailableCatalog,
    adapterRegistry: { opencode: { async execute() { throw new Error('must not run'); } } }
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'external_read_only_unavailable');
});
