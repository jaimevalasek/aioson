'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  collectRoutes,
  runExecutionProfileValidation
} = require('../src/commands/execution-profile-validation');
const {
  profileFallbackOrder,
  resolveProfileFallbacks,
  validateExecutionRoles
} = require('../src/lib/execution-roles');
const { readSignatures, signatureKey } = require('../src/lib/host-signature');

const ROOT = path.resolve(__dirname, '..');
const BIN = path.join(ROOT, 'bin', 'aioson.js');
const logger = { log() {}, error() {}, warn() {} };

const PROFILES = {
  version: 1,
  source: 'test-client',
  enabled: true,
  active_profile: 'primary',
  profiles: {
    primary: {
      enabled: true,
      fallback_use: true,
      fallback_profiles: ['reserve'],
      roles: {
        backend_dev: { host: 'codex', model: 'gpt-primary', reasoning_effort: 'medium' },
        frontend_dev: { host: 'codex', model: 'gpt-shared', reasoning_effort: 'low' },
        qa: { host: 'codex', model: 'gpt-qa', reasoning_effort: 'high' }
      }
    },
    reserve: {
      enabled: true,
      fallback_use: true,
      fallback_profiles: ['last_resort'],
      roles: {
        backend_dev: { host: 'claude', model: 'claude-reserve', reasoning_effort: 'high' },
        frontend_dev: { host: 'codex', model: 'gpt-shared', reasoning_effort: 'low' },
        qa: { host: 'claude', model: 'claude-qa', reasoning_effort: 'medium' }
      }
    },
    last_resort: {
      enabled: true,
      fallback_use: false,
      fallback_profiles: [],
      roles: {
        backend_dev: { host: 'opencode', model: 'open-last', reasoning_effort: null },
        frontend_dev: { host: 'opencode', model: 'open-front', reasoning_effort: null },
        qa: { host: 'opencode', model: 'open-qa', reasoning_effort: null }
      }
    }
  },
  parallel: { max_concurrent_lanes: 10 },
  on_unavailable: 'fallback'
};

async function project(t, roles = PROFILES) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-profile-validation-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }).catch(() => {}));
  await fs.mkdir(path.join(dir, '.aioson', 'config'), { recursive: true });
  await fs.writeFile(path.join(dir, '.aioson', 'config', 'execution-roles.json'), `${JSON.stringify(roles, null, 2)}\n`, 'utf8');
  return { dir, env: { ...process.env, AIOSON_HOST_SIGNATURES: path.join(dir, 'signatures.json') } };
}

function signed(input, status = 'valid', reason = null) {
  return {
    host: input.host,
    model: input.model,
    reasoning_effort: input.reasoning_effort || null,
    status,
    reason,
    checked_at: '2026-09-15T12:00:00.000Z',
    expires_at: '2999-01-01T00:00:00.000Z',
    unattended: { yolo: { state: 'verified' } }
  };
}

test('fallback profiles form one ordered transitive chain, dedupe equivalent routes and reject indirect cycles', () => {
  assert.equal(validateExecutionRoles(PROFILES).ok, true);
  const normalized = {
    ...PROFILES,
    profiles: Object.fromEntries(Object.entries(PROFILES.profiles).map(([name, profile]) => [name, { ...profile, roles: profile.roles }]))
  };
  assert.deepEqual(profileFallbackOrder(normalized), ['reserve', 'last_resort']);
  assert.deepEqual(resolveProfileFallbacks(normalized, 'backend', 'dev').map(item => item.profile), ['reserve', 'last_resort']);
  assert.deepEqual(resolveProfileFallbacks(normalized, 'frontend', 'dev').map(item => item.profile), ['reserve', 'last_resort']);

  const cycle = JSON.parse(JSON.stringify(PROFILES));
  cycle.profiles.last_resort.fallback_use = true;
  cycle.profiles.last_resort.fallback_profiles = ['primary'];
  const checked = validateExecutionRoles(cycle);
  assert.equal(checked.ok, false);
  assert.match(checked.errors.find(error => /cycle/.test(error.message)).message, /primary -> reserve -> last_resort -> primary/);
});

test('execution:profiles:validate runs the real signature contract in a bounded parallel batch and persists one merged store', async t => {
  const ctx = await project(t);
  let active = 0;
  let peak = 0;
  const calls = [];
  const probe = async input => {
    calls.push(input);
    active += 1;
    peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 15));
    active -= 1;
    return { entry: signed(input) };
  };
  const result = await runExecutionProfileValidation({
    projectDir: ctx.dir,
    options: { json: true, concurrency: '2' },
    logger,
    env: ctx.env,
    probe
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.routing.ready, true);
  assert.deepEqual(result.routing.fallback_order, ['reserve', 'last_resort']);
  assert.equal(result.summary.total, 8, 'the duplicated gpt-shared route is probed only once');
  assert.equal(calls.length, 8);
  assert.equal(peak, 2);
  assert.ok(calls.every(call => call.persist === false && call.unattendedProbe === true));
  const store = await readSignatures({ env: ctx.env });
  assert.equal(Object.keys(store.signatures).length, 8, 'parallel results are merged instead of racing writes');
  assert.ok(store.signatures[signatureKey('codex', 'gpt-primary', 'medium')]);
});

test('a valid transitive last-resort keeps active routing ready while the failed alternatives remain visible', async t => {
  const ctx = await project(t);
  const probe = async input => {
    const valid = input.host === 'opencode' || input.model === 'gpt-shared' || input.model === 'gpt-qa';
    return { entry: signed(input, valid ? 'valid' : 'invalid', valid ? null : 'capacity') };
  };
  const result = await runExecutionProfileValidation({ projectDir: ctx.dir, options: { json: true, concurrency: 3 }, logger, env: ctx.env, probe });
  assert.equal(result.ok, false, 'batch validation reports every bad configured backup');
  assert.equal(result.reason, 'profile_route_invalid');
  assert.equal(result.routing.ready, true, 'routing itself remains available through the transitive chain');
  const backend = result.routing.roles.find(item => item.role === 'backend_dev');
  assert.equal(backend.effective.profile, 'last_resort');
  assert.deepEqual(backend.alternatives.map(item => [item.profile, item.state]), [['primary', 'invalid'], ['reserve', 'invalid'], ['last_resort', 'valid']]);

  let called = false;
  const status = await runExecutionProfileValidation({ projectDir: ctx.dir, options: { json: true, status: true }, logger, env: ctx.env, probe: async () => { called = true; } });
  assert.equal(called, false, '--status never launches a harness');
  assert.equal(status.routing.ready, true);
});

test('execution:profiles:validate is registered in focused help and JSON status mode', async t => {
  const ctx = await project(t);
  const help = spawnSync(process.execPath, [BIN, 'execution:profiles:validate', '--help', '--json'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(help.status, 0, help.stderr);
  assert.match(JSON.parse(help.stdout).usage, /^aioson execution:profiles:validate/);

  const status = spawnSync(process.execPath, [BIN, 'execution:profiles:validate', ctx.dir, '--status', '--json'], { cwd: ROOT, env: ctx.env, encoding: 'utf8' });
  assert.equal(status.status, 1, status.stderr);
  const payload = JSON.parse(status.stdout);
  assert.equal(payload.reason, 'routing_unavailable');
  assert.equal(payload.summary.total, collectRoutes(PROFILES).length);
});
