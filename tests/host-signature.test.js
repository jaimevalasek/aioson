'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const { createAdapter } = require('../src/agent-execution/adapters/base');
const {
  DEFAULT_TTL_HOURS,
  listSignatures,
  lookupSignature,
  probeHostSignature,
  readSignatures,
  signatureKey,
  signatureState,
  writeSignatures
} = require('../src/lib/host-signature');
const { runHostSignature } = require('../src/commands/host-signature');
const { MATRIX, capabilities } = require('../src/agent-execution/capabilities');

const ROOT = path.resolve(__dirname, '..');
const CLI_PATH = path.join(ROOT, 'bin', 'aioson.js');

function fakeAdapter(host, script, { reasoningEffort = false, executable = process.execPath } = {}) {
  const adapter = createAdapter(host, () => ['-e', script]);
  adapter.probe = () => ({
    native_subagent: false,
    fresh_session: false,
    external_process: true,
    additional_workspaces: true,
    model_catalog: false,
    reasoning_effort: reasoningEffort,
    executable,
    source: 'test'
  });
  return adapter;
}

async function tempStore(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-host-signature-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  const file = path.join(dir, 'signatures.json');
  return { dir, file, env: { ...process.env, AIOSON_HOST_SIGNATURES: file } };
}

function silentLogger() {
  const lines = { log: [], error: [] };
  return { lines, log: (line) => lines.log.push(String(line)), error: (line) => lines.error.push(String(line)) };
}

function runCli(args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI_PATH, ...args], {
      cwd: options.cwd || ROOT,
      env: { ...process.env, ...(options.env || {}) }
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

test('the execution capability matrix is derived from the single host registry, unchanged for every dispatchable host', () => {
  assert.deepEqual(Object.keys(MATRIX).sort(), ['antigravity', 'claude', 'codex', 'grok', 'kimi', 'opencode', 'qwen']);
  assert.deepEqual(capabilities('codex'), {
    native_subagent: false,
    fresh_session: false,
    external_process: true,
    additional_workspaces: true,
    model_catalog: true,
    reasoning_effort: true,
    executable: 'codex',
    source: 'registered_adapter'
  });
  assert.equal(capabilities('claude').reasoning_effort, true);
  assert.equal(capabilities('kimi').additional_workspaces, true);
  assert.equal(capabilities('qwen').additional_workspaces, false);
  // Interactive-only registry entries never become dispatchable by accident.
  assert.deepEqual(capabilities('muse'), { source: 'registered_adapter' });
  assert.deepEqual(capabilities('agy'), { source: 'registered_adapter' });
  assert.equal(capabilities('grok').external_process, true, 'grok is dispatchable: its headless contract was proven by a real signature probe');
});

test('an unknown host is refused and nothing is persisted', async (t) => {
  const store = await tempStore(t);
  const probed = await probeHostSignature({ host: 'gemini', model: 'x', env: store.env });
  assert.equal(probed.entry.status, 'invalid');
  assert.equal(probed.entry.reason, 'unknown_host');
  assert.equal(probed.persisted, false);
  await assert.rejects(fs.access(store.file));
});

test('an interactive-only host (muse) and an unsupported effort fail deterministically from the registry', async (t) => {
  const store = await tempStore(t);
  const muse = await probeHostSignature({ host: 'muse', model: 'muse-1', env: store.env });
  assert.equal(muse.entry.reason, 'unsupported_host_execution');
  assert.equal(muse.entry.install_command, null);
  assert.equal(muse.persisted, true);

  const noEffortHost = await probeHostSignature({ host: 'opencode', model: 'grok-code-fast', reasoning_effort: 'high', env: store.env });
  assert.equal(noEffortHost.entry.reason, 'effort_unsupported_by_host');
  assert.equal(noEffortHost.entry.effort_verification, 'registry');

  const badEffort = await probeHostSignature({ host: 'codex', model: 'gpt-5.6', reasoning_effort: 'turbo', env: store.env });
  assert.equal(badEffort.entry.reason, 'invalid_reasoning_effort');
  assert.ok(badEffort.entry.supported.includes('high'));

  // Effort vocabulary is per host: `ultra` is codex vocabulary, the claude CLI rejects it.
  const ultraClaude = await probeHostSignature({ host: 'claude', model: 'claude-sonnet-5', reasoning_effort: 'ultra', env: store.env });
  assert.equal(ultraClaude.entry.reason, 'invalid_reasoning_effort');
  assert.equal(ultraClaude.entry.supported.includes('ultra'), false);

  const persisted = await readSignatures({ env: store.env });
  assert.equal(signatureState(persisted.signatures[signatureKey('muse', 'muse-1', null)]), 'invalid');
  assert.equal(signatureState(persisted.signatures[signatureKey('opencode', 'grok-code-fast', 'high')]), 'invalid');
});

test('a missing executable is a first-class fact carrying the install command on every platform', async (t) => {
  const store = await tempStore(t);
  const adapter = fakeAdapter('kimi', 'console.log("OK")', { executable: 'definitely-missing-aioson-cli' });
  for (const platform of ['win32', 'linux']) {
    const probed = await probeHostSignature({
      host: 'kimi',
      model: 'kimi-k3',
      env: store.env,
      adapterRegistry: { kimi: adapter },
      resolverOptions: { env: { PATH: store.dir, Path: store.dir }, platform }
    });
    assert.equal(probed.entry.status, 'invalid', platform);
    assert.equal(probed.entry.reason, 'executable_not_found', platform);
    assert.equal(probed.entry.install_command, 'npm install -g @moonshot-ai/kimi-code');
    assert.equal(probed.persisted, true);
  }
});

test('a working host/model records a valid signature with version, fingerprint and TTL, probed in a hermetic temporary cwd', async (t) => {
  const store = await tempStore(t);
  const fixed = Date.parse('2026-08-25T12:00:00.000Z');
  const adapter = fakeAdapter('claude', 'console.log("CWD=" + process.cwd()); console.log("OK")');
  const probed = await probeHostSignature({
    host: 'claude',
    model: 'claude-opus-5',
    ttlHours: 1,
    env: store.env,
    adapterRegistry: { claude: adapter },
    now: () => fixed
  });
  const entry = probed.entry;
  assert.equal(entry.status, 'valid');
  assert.equal(entry.reason, null);
  assert.equal(entry.auth, 'ok');
  assert.equal(entry.model_accepted, true);
  assert.equal(entry.probe.mode, 'external');
  assert.equal(entry.probe.sandbox, 'read-only');
  assert.equal(entry.probe.exit_code, 0);
  assert.equal(entry.probe.output_matched, true);
  assert.match(entry.version || '', /\d/);
  assert.match(entry.fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(entry.checked_at, '2026-08-25T12:00:00.000Z');
  assert.equal(entry.expires_at, '2026-08-25T13:00:00.000Z');
  assert.equal(entry.ttl_hours, 1);
  assert.equal(probed.persisted, true);
  assert.equal(probed.path, store.file);

  const cwdMatch = entry.probe.output_excerpt.match(/CWD=(\S+)/);
  assert.ok(cwdMatch, `probe cwd missing from excerpt: ${entry.probe.output_excerpt}`);
  assert.ok(path.basename(cwdMatch[1]).startsWith('aioson-host-probe-'));
  await assert.rejects(fs.access(cwdMatch[1]), 'the temporary probe cwd must be removed');

  const persisted = await readSignatures({ env: store.env });
  assert.deepEqual(Object.keys(persisted.signatures), [signatureKey('claude', 'claude-opus-5', null)]);
  assert.equal(signatureState(entry, fixed + 1000), 'valid');
  assert.equal(signatureState(entry, fixed + 3600 * 1000), 'expired');
  const lookup = await lookupSignature({ host: 'claude', model: 'claude-opus-5' }, { env: store.env, now: fixed + 1000 });
  assert.equal(lookup.state, 'valid');
  assert.equal(lookup.entry.fingerprint, entry.fingerprint);
});

test('auth and invalid-model failures are classified through the adapter normalization and persisted as invalid', async (t) => {
  const store = await tempStore(t);
  const auth = await probeHostSignature({
    host: 'qwen',
    model: 'qwen-3.8-max',
    env: store.env,
    adapterRegistry: { qwen: fakeAdapter('qwen', 'console.error("Unauthorized: not authenticated"); process.exit(1)') }
  });
  assert.equal(auth.entry.status, 'invalid');
  assert.equal(auth.entry.reason, 'auth');
  assert.equal(auth.entry.auth, 'failed');

  const model = await probeHostSignature({
    host: 'kimi',
    model: 'kimi-k9',
    env: store.env,
    adapterRegistry: { kimi: fakeAdapter('kimi', 'console.error("unknown model kimi-k9"); process.exit(2)') }
  });
  assert.equal(model.entry.reason, 'invalid_model');
  assert.equal(model.entry.model_accepted, false);
  assert.equal(model.entry.probe.exit_code, 2);

  const listed = listSignatures(await readSignatures({ env: store.env }));
  assert.deepEqual(listed.map((item) => [item.host, item.state]), [['kimi', 'invalid'], ['qwen', 'invalid']]);
});

test('effort is probed only on hosts whose registry entry declares it, with the effort inside the signature key', async (t) => {
  const store = await tempStore(t);
  const probed = await probeHostSignature({
    host: 'codex',
    model: 'gpt-5.6',
    reasoning_effort: 'high',
    env: store.env,
    adapterRegistry: { codex: fakeAdapter('codex', 'console.log("OK")', { reasoningEffort: true }) }
  });
  assert.equal(probed.entry.status, 'valid');
  assert.equal(probed.entry.reasoning_effort, 'high');
  assert.equal(probed.entry.effort_verification, 'registry');
  const persisted = await readSignatures({ env: store.env });
  assert.ok(persisted.signatures[signatureKey('codex', 'gpt-5.6', 'high')]);
  assert.equal(persisted.signatures[signatureKey('codex', 'gpt-5.6', null)], undefined);
});

test('expired and unreadable stores degrade to explicit states instead of throwing', async (t) => {
  const store = await tempStore(t);
  await writeSignatures({
    signatures: {
      [signatureKey('claude', 'configured-default', null)]: {
        host: 'claude', model: 'configured-default', reasoning_effort: null, status: 'valid',
        checked_at: '2026-01-01T00:00:00.000Z', expires_at: '2026-01-02T00:00:00.000Z'
      }
    }
  }, { env: store.env });
  const lookup = await lookupSignature({ host: 'claude' }, { env: store.env });
  assert.equal(lookup.state, 'expired');
  assert.equal(listSignatures(await readSignatures({ env: store.env }))[0].state, 'expired');

  await fs.writeFile(store.file, '{not json');
  const broken = await readSignatures({ env: store.env });
  assert.equal(broken.unreadable, true);
  assert.deepEqual(broken.signatures, {});
  assert.equal((await lookupSignature({ host: 'claude' }, { env: store.env })).state, 'missing');
});

test('the default store lives under ~/.aioson/hosts and the TTL defaults to 24h', async () => {
  const { signaturesPath } = require('../src/lib/host-signature');
  assert.equal(signaturesPath({ env: {}, home: '/h' }), path.join('/h', '.aioson', 'hosts', 'signatures.json'));
  assert.equal(signaturesPath({ env: { AIOSON_HOST_SIGNATURES: '/x/s.json' } }), '/x/s.json');
  assert.equal(DEFAULT_TTL_HOURS, 24);
});

test('host:signature command: --list and --status are read-only verdicts, the probe is the real one', async (t) => {
  const store = await tempStore(t);
  const logger = silentLogger();
  let result = await runHostSignature({ args: [], options: { list: true, json: true }, logger, env: store.env });
  assert.equal(result.ok, true);
  assert.equal(result.count, 0);

  result = await runHostSignature({ args: [], options: { json: true }, logger, env: store.env });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'host_required');
  assert.deepEqual(result.hosts, ['antigravity', 'claude', 'codex', 'grok', 'kimi', 'opencode', 'qwen']);

  result = await runHostSignature({ args: [], options: { host: 'kimi', model: 'kimi-k3', status: true, json: true }, logger, env: store.env });
  assert.equal(result.ok, true);
  assert.equal(result.state, 'missing');

  result = await runHostSignature({
    args: [], logger, env: store.env,
    options: { host: 'kimi', model: 'kimi-k3', ttl: '2', json: true },
    adapterRegistry: { kimi: fakeAdapter('kimi', 'console.log("OK")') }
  });
  assert.equal(result.ok, true);
  assert.equal(result.state, 'valid');
  assert.equal(result.signature.ttl_hours, 2);
  assert.equal(result.persisted, true);

  result = await runHostSignature({ args: [], options: { host: 'kimi', model: 'kimi-k3', status: true }, logger, env: store.env });
  assert.equal(result.state, 'valid');
  assert.match(logger.lines.log.at(-1), /^valid: kimi kimi-k3/);

  result = await runHostSignature({
    args: [], logger, env: store.env,
    options: { host: 'qwen', model: 'qwen-3.8-max' },
    adapterRegistry: { qwen: fakeAdapter('qwen', 'console.error("rate limit exceeded"); process.exit(1)') }
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'capacity');
  assert.match(logger.lines.error.at(-1), /Signature invalid: qwen qwen-3.8-max — capacity/);

  result = await runHostSignature({ args: [], options: { list: true }, logger, env: store.env });
  assert.equal(result.count, 2);
  assert.deepEqual(result.signatures.map((item) => item.state), ['valid', 'invalid']);
});

test('host:signature is registered in the CLI with JSON output, focused help and a clean exit for read-only modes', async (t) => {
  const store = await tempStore(t);
  const env = { AIOSON_HOST_SIGNATURES: store.file };

  const help = await runCli(['host:signature', '--help', '--json']);
  assert.equal(help.code, 0, help.stderr);
  assert.match(JSON.parse(help.stdout).usage, /^aioson host:signature/);

  const list = await runCli(['host:signature', store.dir, '--list', '--json'], { env });
  assert.equal(list.code, 0, list.stderr);
  const payload = JSON.parse(list.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.count, 0);
  assert.equal(payload.path, store.file);

  const status = await runCli(['host-signature', '--host=claude', '--model=claude-opus-5', '--status', '--json'], { env });
  assert.equal(status.code, 0, status.stderr);
  assert.equal(JSON.parse(status.stdout).state, 'missing');

  const unknown = await runCli(['host:signature', '--host=gemini', '--json'], { env });
  assert.equal(unknown.code, 1);
  assert.equal(JSON.parse(unknown.stdout).reason, 'unknown_host');
  await assert.rejects(fs.access(store.file), 'a refused probe must not create the store');
});
