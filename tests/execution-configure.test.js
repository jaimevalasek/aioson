'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { runExecution } = require('../src/commands/execution');
const { readExecutionRoles, readConfirmation, rolesDigest, validateExecutionRoles, checkExecutionConfirmation } = require('../src/lib/execution-roles');

const ROOT = path.resolve(__dirname, '..');
const logger = { log() {}, error() {}, warn() {} };
const locate = async binary => ['codex', 'claude'].includes(binary) ? `/fixture/${binary}` : null;
const catalogLoader = async host => ({ source: 'fixture', models: host === 'codex' ? [
  { slug: 'implementation-model', display_name: 'Implementation model', supported_efforts: ['medium', 'high', 'ultra'] },
  { slug: 'no-effort-model', display_name: 'No effort model', supported_efforts: [] }
] : [] });

async function setup(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-configure-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  const env = { ...process.env, AIOSON_HOST_SIGNATURES: path.join(dir, 'signatures.json') };
  delete env.AIOSON_EXECUTION_SPAWNER;
  const configure = options => runExecution({ args: [dir], options: { sub: 'configure', feature: 'orders', lanes: 'backend,frontend', json: true, ...options }, logger, env, engineOptions: { configureOptions: { locate, catalogLoader } } });
  return { dir, env, configure };
}

function chosen(document, suffix = '') {
  const result = structuredClone(document);
  const roles = result.profiles ? result.profiles[result.active_profile].roles : result.roles;
  for (const [key, role] of Object.entries(roles)) {
    role.host = key === 'qa' ? 'claude' : 'codex';
    role.model = key === 'qa' ? 'review-model' : `implementation-model${suffix}`;
    role.reasoning_effort = key === 'qa' ? 'medium' : 'high';
  }
  return result;
}

async function file(dir, name, value) {
  const target = path.join(dir, name);
  await fs.writeFile(target, JSON.stringify(value));
  return target;
}

test('the chat wizard asks model AND effort for every real role, offers model-specific efforts, and writes nothing on preview', async t => {
  const { dir, configure } = await setup(t);
  const wizard = await configure();
  assert.equal(wizard.ok, true);
  assert.equal(wizard.state, 'awaiting_confirmation');
  assert.equal(wizard.written, false);
  assert.equal((await readExecutionRoles(dir)).present, false);
  assert.equal((await readConfirmation(dir)).present, false);
  assert.deepEqual(wizard.roles.map(role => role.role), ['backend_dev', 'frontend_dev', 'qa', 'integration_dev']);
  for (const role of wizard.roles) {
    assert.deepEqual(role.required_answers, ['host', 'model', 'reasoning_effort']);
    assert.deepEqual(role.questions.map(question => question.field), ['host', 'model', 'reasoning_effort']);
  }
  const models = wizard.hosts.find(host => host.host === 'codex').models;
  assert.deepEqual(models.find(model => model.id === 'implementation-model').effort_options.map(option => option.value), ['medium', 'high', 'ultra', null]);
  assert.equal(models[0].effort_options.find(option => option.value === 'high').recommended, true);
  assert.deepEqual(models.find(model => model.id === 'no-effort-model').effort_options.map(option => option.value), [null]);
  assert.ok(models.find(model => model.id === 'configured-default').effort_options.every(option => !option.recommended), 'an unknown CLI-default model never inherits a model-specific effort recommendation');
  assert.match(wizard.instructions, /Never substitute configured-default or null for an unanswered field/);
  assert.equal(wizard.coordinator.mode, 'current-session');
});

test('confirmation requires a reviewed document and explicit effort choices; neither --confirm alone nor omitted effort accepts defaults', async t => {
  const { dir, configure } = await setup(t);
  const wizard = await configure();
  assert.equal((await configure({ confirm: true, 'expect-digest': wizard.expected_digest })).reason, 'choices_required');
  const incomplete = chosen(wizard.configuration);
  delete incomplete.profiles[incomplete.active_profile].roles.qa.reasoning_effort;
  const config = await file(dir, 'incomplete.json', incomplete);
  const rejected = await configure({ config, confirm: true, 'expect-digest': wizard.expected_digest });
  assert.equal(rejected.reason, 'choices_required');
  assert.deepEqual(rejected.roles, ['qa']);
  assert.equal((await readExecutionRoles(dir)).present, false);
  const complete = await file(dir, 'complete.json', chosen(wizard.configuration));
  assert.equal((await configure({ config: complete, confirm: true })).reason, 'configuration_changed');
  assert.equal((await configure({ config: complete })).written, false, 'editing a proposed choice never saves without final confirmation');
});

test('confirmed model and effort choices persist exactly, with a bound confirmation and a valid desktop-compatible configuration', async t => {
  const { dir, configure } = await setup(t);
  const wizard = await configure();
  const document = chosen(wizard.configuration);
  const config = await file(dir, 'choices.json', document);
  const applied = await configure({ config, confirm: true, 'expect-digest': wizard.expected_digest });
  assert.equal(applied.state, 'confirmed', JSON.stringify(applied));
  const read = await readExecutionRoles(dir);
  assert.equal(read.enabled, true);
  assert.equal(read.roles.roles.backend_dev.model, 'implementation-model');
  assert.equal(read.roles.roles.backend_dev.reasoning_effort, 'high');
  assert.equal(read.roles.roles.frontend_dev.reasoning_effort, 'high');
  assert.equal(read.roles.roles.qa.reasoning_effort, 'medium');
  assert.equal(read.roles.roles.integration_dev.model, 'implementation-model');
  assert.equal((await readConfirmation(dir)).digest, rolesDigest(read.roles));
  assert.equal((await checkExecutionConfirmation(dir, read.roles)).ok, true);
  const raw = JSON.parse(await fs.readFile(path.join(dir, applied.path), 'utf8'));
  assert.equal(validateExecutionRoles(raw).ok, true);
  assert.deepEqual(raw, document, 'wizard adds no unsupported root fields');
  assert.equal(await fs.access(path.join(dir, 'signatures.json')).then(() => true).catch(() => false), false, 'configuration never probes hosts');
  raw.profiles[raw.active_profile].roles.backend_dev.reasoning_effort = 'ultra';
  await fs.writeFile(path.join(dir, applied.path), JSON.stringify(raw));
  const changed = await checkExecutionConfirmation(dir, (await readExecutionRoles(dir)).roles);
  assert.equal(changed.ok, false);
  assert.equal(changed.reason, 'configuration_unconfirmed', 'a changed effort needs a new explicit answer even for named models');
});

test('reconfiguration preserves other profiles and client settings, and a stale summary cannot overwrite newer choices', async t => {
  const { dir, configure } = await setup(t);
  const first = await configure();
  const initial = chosen(first.configuration);
  initial.profiles.alternate = { enabled: true, fallback_use: false, fallback_profiles: [], roles: { qa: { host: 'claude', model: 'other-reviewer', reasoning_effort: 'high' } } };
  initial.execution = { spawner: { command: 'client-wrapper', args: ['--unit'] } };
  const config = await file(dir, 'initial.json', initial);
  await configure({ config, confirm: true, 'expect-digest': first.expected_digest });
  const next = await configure();
  const update = chosen(next.configuration, '-new');
  const updatedFile = await file(dir, 'updated.json', update);
  assert.equal((await configure({ config: updatedFile, confirm: true, 'expect-digest': next.expected_digest })).state, 'confirmed');
  const stale = await configure({ config, confirm: true, 'expect-digest': next.expected_digest });
  assert.equal(stale.reason, 'configuration_changed');
  const saved = JSON.parse(await fs.readFile(path.join(dir, '.aioson/config/execution-roles.json'), 'utf8'));
  assert.deepEqual(saved.profiles.alternate, initial.profiles.alternate);
  assert.deepEqual(saved.execution, initial.execution);
  assert.equal(saved.profiles[saved.active_profile].roles.backend_dev.model, 'implementation-model-new');
});

test('custom lanes stay custom; invalid host/effort choices fail without saving', async t => {
  const { dir, configure } = await setup(t);
  const wizard = await configure({ lanes: 'mobile-app' });
  assert.deepEqual(wizard.roles.map(role => role.role), ['mobile_app_dev', 'qa', 'integration_dev']);
  const invalid = chosen(wizard.configuration);
  invalid.profiles[invalid.active_profile].roles.mobile_app_dev.reasoning_effort = 'invented-effort';
  const config = await file(dir, 'invalid.json', invalid);
  assert.equal((await configure({ lanes: 'mobile-app', config, confirm: true, 'expect-digest': wizard.expected_digest })).reason, 'roles_invalid');
  assert.equal((await readExecutionRoles(dir)).present, false);
  invalid.profiles[invalid.active_profile].roles.mobile_app_dev.model = 'no-effort-model';
  invalid.profiles[invalid.active_profile].roles.mobile_app_dev.reasoning_effort = 'high';
  await file(dir, 'invalid.json', invalid);
  assert.equal((await configure({ lanes: 'mobile-app', config, confirm: true, 'expect-digest': wizard.expected_digest })).reason, 'effort_unsupported_by_model');
  assert.equal((await readExecutionRoles(dir)).present, false);
  invalid.profiles[invalid.active_profile].roles.mobile_app_dev.host = 'qwen';
  invalid.profiles[invalid.active_profile].roles.mobile_app_dev.reasoning_effort = null;
  await file(dir, 'invalid.json', invalid);
  assert.equal((await configure({ lanes: 'mobile-app', config, confirm: true, 'expect-digest': wizard.expected_digest })).reason, 'host_not_installed');
});

test('other CLIs offer actual saved model IDs when no catalog is available, without inventing model-specific effort support', async t => {
  const { dir, configure } = await setup(t);
  await file(dir, 'signatures.json', { version: 1, signatures: {
    'claude|reviewer-from-signature|medium': { host: 'claude', model: 'reviewer-from-signature', reasoning_effort: 'medium', status: 'valid' }
  } });
  const wizard = await configure();
  const choice = wizard.hosts.find(host => host.host === 'claude').models.find(model => model.id === 'reviewer-from-signature');
  assert.equal(choice.source, 'saved_selection');
  assert.ok(choice.effort_options.every(option => !option.recommended));
  assert.equal((await readExecutionRoles(dir)).present, false);
});

test('a machine without an execution CLI receives installation guidance and writes no configuration', async t => {
  const { dir, env } = await setup(t);
  const result = await runExecution({ args: [dir], options: { sub: 'configure', feature: 'orders', lanes: 'backend', json: true }, logger, env, engineOptions: { configureOptions: { locate: async () => null, catalogLoader } } });
  assert.equal(result.reason, 'no_execution_host');
  assert.ok(result.install.some(item => item.host === 'codex' && item.command));
  assert.equal((await readExecutionRoles(dir)).present, false);
});

function cli(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'bin/aioson.js'), ...args], { cwd: ROOT, env, windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', code => {
      try { resolve({ code, result: JSON.parse(stdout), stderr }); }
      catch (error) { reject(new Error(`${error.message}: ${stdout} ${stderr}`)); }
    });
  });
}

test('two separate CLI processes confirming the same summary admit one writer and refuse the stale writer', async t => {
  const { dir, env, configure } = await setup(t);
  const bin = path.join(dir, 'bin');
  await fs.mkdir(bin);
  for (const host of ['codex', 'claude']) {
    const executable = path.join(bin, process.platform === 'win32' ? `${host}.cmd` : host);
    await fs.writeFile(executable, process.platform === 'win32' ? '@exit /b 0' : '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  }
  const wizard = await configure();
  const configs = await Promise.all(['-a', '-b'].map((suffix, index) => file(dir, `choice${index}.json`, chosen(wizard.configuration, suffix))));
  const cliEnv = { ...env, PATH: bin, Path: bin, AIOSON_OPERATOR_MEMORY: 'false' };
  const results = await Promise.all(configs.map(config => cli(['execution:configure', dir, '--feature=orders', '--lanes=backend,frontend', `--config=${config}`, '--confirm', '--expect-digest=missing', '--json'], cliEnv)));
  assert.deepEqual(results.map(item => item.code).sort(), [0, 1], JSON.stringify(results));
  assert.deepEqual(results.map(item => item.result.state || item.result.reason).sort(), ['configuration_changed', 'confirmed']);
  const saved = await readExecutionRoles(dir);
  assert.equal((await readConfirmation(dir)).digest, rolesDigest(saved.roles));
});
