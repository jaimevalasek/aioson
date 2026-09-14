'use strict';

// Host signatures — machine-level attestation that a (host, model, effort)
// combination actually works on THIS machine: the CLI is installed, the login
// is valid, the model id is accepted and the effort is supported. A signature
// is the answer to "can this lane run here?" BEFORE anything is dispatched,
// instead of discovering `executable_not_found` / `auth` / `invalid_model` in
// the middle of an orchestrated run.
//
// The probe is deterministic and hermetic: it builds the exact argv the
// agent-execution adapter would use (same non-interactive flags, provider
// read-only mode), runs it in an empty temporary cwd with a one-word prompt,
// and classifies the exit through the adapter's own error normalization. It
// never reads project context and never writes into a project.
//
// Store: ~/.aioson/hosts/signatures.json (override: AIOSON_HOST_SIGNATURES),
// keyed by `${host}|${model}|${effort}` with a TTL. Signatures are facts about
// the operator's machine, not about a project — the manifest only references
// (host, model, effort) and `agent:execution:validate --strict` checks them.

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { TOOL_CAPS, LANE_WORKER_MODE, resolveSandboxArgs } = require('./tool-capabilities');
const { resolveExecutable } = require('../agent-execution/executable-resolver');
const { redact } = require('../agent-execution/adapters/base');
const { effortsForHost } = require('../agent-execution/schema');

const SIGNATURES_VERSION = 1;
const DEFAULT_TTL_HOURS = 24;
const DEFAULT_PROBE_TIMEOUT_MS = 120000;
const VERSION_TIMEOUT_MS = 15000;
const PROBE_PROMPT = 'Reply with exactly the word OK and nothing else.';
// The unattended write probe: the read-only probe proves login and model; it
// says nothing about whether the host EDITS without a prompt — which is what
// a lane worker is. The first real orchestrated run had every signature valid
// and one lane sat all night asking for approval. This probe runs the exact
// unattended workspace-write argv a lane worker gets, in an empty temporary
// directory, and looks for the file: written → `verified`; exited without it →
// `unverified` (a warning); timed out → `blocked` (the incident's shape: alive,
// never wrote, never exited); refused → `failed`. Blocked/failed invalidate
// the signature (`host_not_unattended`). Measured on the operator's machine:
// Codex under its own `--sandbox workspace-write` answered DONE after 96 s
// without writing the file (the Windows sandbox setup fails to load); under
// the unattended flag it wrote in 14 s — the probe only ever runs the latter.
const UNATTENDED_PROBE_FILE = 'aioson-unattended-probe.txt';
const UNATTENDED_PROBE_PROMPT = `Create a file named ${UNATTENDED_PROBE_FILE} in the current working directory containing exactly the word OK, then reply with the word DONE. Do not ask for confirmation and do nothing else.`;
const UNATTENDED_STATES = ['verified', 'unverified', 'blocked', 'failed'];
const OUTPUT_EXCERPT_MAX = 200;
const STDOUT_CAP = 4000;
const SIGNATURE_STATES = ['valid', 'invalid', 'expired', 'missing'];
const DEFAULT_MODEL = 'configured-default';

function defaultAdapters() {
  return {
    antigravity: require('../agent-execution/adapters/antigravity'),
    claude: require('../agent-execution/adapters/claude'),
    codex: require('../agent-execution/adapters/codex'),
    opencode: require('../agent-execution/adapters/opencode'),
    kimi: require('../agent-execution/adapters/kimi'),
    qwen: require('../agent-execution/adapters/qwen'),
    grok: require('../agent-execution/adapters/grok')
  };
}

function signaturesPath({ env = process.env, home } = {}) {
  const override = typeof env.AIOSON_HOST_SIGNATURES === 'string' ? env.AIOSON_HOST_SIGNATURES.trim() : '';
  return override || path.join(home || os.homedir(), '.aioson', 'hosts', 'signatures.json');
}

function normalizeHost(host) { return String(host || '').trim().toLowerCase(); }
function normalizeModel(model) {
  const value = typeof model === 'string' ? model.trim() : '';
  return value || DEFAULT_MODEL;
}
function normalizeEffort(effort) {
  if (effort === undefined || effort === null) return null;
  const value = String(effort).trim();
  return value || null;
}
function signatureKey(host, model, effort) {
  return `${normalizeHost(host)}|${normalizeModel(model)}|${normalizeEffort(effort) || ''}`;
}

async function readSignatures(options = {}) {
  const file = signaturesPath(options);
  try {
    const parsed = JSON.parse(await fs.readFile(file, 'utf8'));
    const signatures = parsed && typeof parsed === 'object' && parsed.signatures && typeof parsed.signatures === 'object'
      ? parsed.signatures
      : {};
    return { version: SIGNATURES_VERSION, path: file, signatures };
  } catch (error) {
    if (error.code === 'ENOENT') return { version: SIGNATURES_VERSION, path: file, signatures: {} };
    return { version: SIGNATURES_VERSION, path: file, signatures: {}, unreadable: true, error: error.message };
  }
}

async function writeSignatures(store, options = {}) {
  const file = signaturesPath(options);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const payload = {
    version: SIGNATURES_VERSION,
    updated_at: new Date().toISOString(),
    signatures: store.signatures || {}
  };
  const tmp = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(payload, null, 2)}\n`);
  await fs.rename(tmp, file);
  return file;
}

function signatureState(entry, now = Date.now()) {
  if (!entry || typeof entry !== 'object') return 'missing';
  if (entry.status !== 'valid') return 'invalid';
  const expires = Date.parse(entry.expires_at);
  if (!Number.isFinite(expires) || expires <= now) return 'expired';
  return 'valid';
}

function findSignature(store, { host, model, reasoning_effort } = {}) {
  const signatures = store && store.signatures ? store.signatures : {};
  return signatures[signatureKey(host, model, reasoning_effort)] || null;
}

async function lookupSignature({ host, model, reasoning_effort } = {}, options = {}) {
  const store = await readSignatures(options);
  const entry = findSignature(store, { host, model, reasoning_effort });
  return { state: signatureState(entry, options.now ?? Date.now()), entry, path: store.path };
}

function listSignatures(store, now = Date.now()) {
  const signatures = store && store.signatures ? store.signatures : {};
  return Object.entries(signatures)
    .map(([key, entry]) => ({ key, ...entry, state: signatureState(entry, now) }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

async function isExecutableFile(file) {
  try {
    await fs.access(file, fs.constants.X_OK);
    return (await fs.stat(file)).isFile();
  } catch {
    return false;
  }
}

// The shared resolver trusts PATH on POSIX (the OS resolves at spawn). For a
// signature we want `executable_not_found` to be a first-class fact, so locate
// the binary ourselves when the resolver returned a bare name.
async function locateOnPath(command, env = process.env) {
  if (path.isAbsolute(command)) return (await isExecutableFile(command)) ? command : null;
  const dirs = String(env.PATH || env.Path || '').split(path.delimiter).filter(Boolean);
  // Windows CLIs land as `.exe` (installers) or `.cmd` (npm shims): a
  // bare-name probe misses essentially every properly installed host. Same
  // extension rule as the shared executable resolver.
  const extensions = process.platform === 'win32' ? ['.exe', '.cmd', ''] : [''];
  for (const dir of dirs) {
    for (const extension of extensions) {
      const candidate = path.join(dir, `${command}${extension}`);
      if (await isExecutableFile(candidate)) return candidate;
    }
  }
  return null;
}

function probeVersion(resolved, { timeout = VERSION_TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(resolved.executable, [...(resolved.prefixArgs || []), '--version'], {
        cwd: os.tmpdir(),
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
      });
    } catch {
      resolve(null);
      return;
    }
    let output = '';
    let settled = false;
    const finish = (value) => { if (settled) return; settled = true; clearTimeout(timer); resolve(value); };
    const timer = setTimeout(() => { try { child.kill(); } catch { /* already gone */ } finish(null); }, timeout);
    timer.unref?.();
    child.stdout.on('data', (chunk) => { if (output.length < STDOUT_CAP) output += String(chunk); });
    child.stderr.on('data', (chunk) => { if (output.length < STDOUT_CAP) output += String(chunk); });
    child.on('error', () => finish(null));
    child.on('exit', (code) => {
      const line = redact(output).split(/\r?\n/).map((item) => item.trim()).find(Boolean) || '';
      finish(code === 0 && line ? line.slice(0, 120) : (line ? line.slice(0, 120) : null));
    });
  });
}

function fingerprint(parts) {
  return crypto.createHash('sha256').update(parts.map((part) => String(part ?? '')).join('|')).digest('hex');
}

async function persistEntry(entry, { env, home, persist }) {
  if (persist === false) return { entry, persisted: false, path: null };
  const store = await readSignatures({ env, home });
  store.signatures[signatureKey(entry.host, entry.model, entry.reasoning_effort)] = entry;
  const file = await writeSignatures(store, { env, home });
  return { entry, persisted: true, path: file };
}

/** The unattended write probe; never throws, always one of UNATTENDED_STATES. */
async function probeUnattendedWrite({ adapter, modelId, effort, timeoutMs, resolverOptions, now }) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-host-probe-write-'));
  const startedAt = now();
  let stdout = '';
  let result;
  let wrote = false;
  try {
    result = await adapter.execute({
      mode: 'external',
      model: modelId,
      reasoning_effort: effort,
      sandbox_mode: 'workspace-write',
      cwd: tempDir,
      prompt_text: UNATTENDED_PROBE_PROMPT,
      timeout: timeoutMs,
      resolverOptions,
      onStdout: (chunk) => { if (stdout.length < STDOUT_CAP) stdout += String(chunk); }
    });
    wrote = await fs.access(path.join(tempDir, UNATTENDED_PROBE_FILE)).then(() => true).catch(() => false);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
  const common = {
    mode: LANE_WORKER_MODE,
    duration_ms: Math.max(0, now() - startedAt),
    exit_code: Number.isInteger(result.code) ? result.code : null,
    wrote,
    output_excerpt: redact(stdout).replace(/\s+/g, ' ').trim().slice(0, OUTPUT_EXCERPT_MAX),
    checked_at: new Date(now()).toISOString()
  };
  if (!result.ok) {
    const reason = result.reason || 'crash';
    return {
      ...common,
      // Alive past the budget without exiting is the blocked shape whether or
      // not a file appeared: a lane worker that never exits never reports.
      state: reason === 'timeout' ? 'blocked' : 'failed',
      reason,
      error: result.error ? redact(String(result.error)).slice(0, 300) : null
    };
  }
  return { ...common, state: wrote ? 'verified' : 'unverified', reason: wrote ? null : 'no_file_written', error: null };
}

async function probeHostSignature({
  host,
  model,
  reasoning_effort,
  ttlHours,
  timeout,
  prompt = PROBE_PROMPT,
  registry = TOOL_CAPS,
  adapterRegistry,
  resolverOptions,
  env = process.env,
  home,
  now = () => Date.now(),
  persist = true,
  unattendedProbe = true
} = {}) {
  const hostId = normalizeHost(host);
  const modelId = normalizeModel(model);
  const effort = normalizeEffort(reasoning_effort);
  const mode = LANE_WORKER_MODE;
  const ttl = Number.isFinite(Number(ttlHours)) && Number(ttlHours) > 0 ? Number(ttlHours) : DEFAULT_TTL_HOURS;
  const persistOptions = { env, home, persist };
  const base = { host: hostId, model: modelId, reasoning_effort: effort, ttl_hours: ttl };
  const stamp = () => {
    const at = now();
    return { checked_at: new Date(at).toISOString(), expires_at: new Date(at + ttl * 3600 * 1000).toISOString() };
  };
  const fail = (reason, extra = {}) => ({ ...base, status: 'invalid', reason, ...extra, ...stamp() });

  const registered = registry[hostId];
  if (!registered) {
    return { entry: fail('unknown_host', { known_hosts: Object.keys(registry).sort() }), persisted: false, path: null };
  }
  if (!registered.execution) {
    return persistEntry(fail('unsupported_host_execution', { install_command: registered.install_command }), persistOptions);
  }
  if (effort && !effortsForHost(hostId).includes(effort)) {
    return persistEntry(fail('invalid_reasoning_effort', { supported: [...effortsForHost(hostId)] }), persistOptions);
  }
  if (effort && registered.execution.reasoning_effort !== true) {
    return persistEntry(fail('effort_unsupported_by_host', { effort_verification: 'registry' }), persistOptions);
  }
  const adapters = adapterRegistry || defaultAdapters();
  const adapter = adapters[hostId];
  if (!adapter) {
    return persistEntry(fail('unsupported_host_execution', { install_command: registered.install_command }), persistOptions);
  }

  const cap = adapter.probe();
  let resolved;
  try {
    resolved = await resolveExecutable(cap.executable, resolverOptions);
  } catch (error) {
    return persistEntry(fail('executable_not_found', {
      binary: registered.binary,
      install_command: registered.install_command,
      error: redact(error.message).slice(0, 300)
    }), persistOptions);
  }
  let executable = resolved.executable;
  if (resolved.source === 'path') {
    const located = await locateOnPath(resolved.executable, (resolverOptions && resolverOptions.env) || env);
    if (!located) {
      return persistEntry(fail('executable_not_found', {
        binary: registered.binary,
        install_command: registered.install_command,
        error: `Executable not found on PATH: ${resolved.executable}`
      }), persistOptions);
    }
    executable = located;
  }

  const version = await probeVersion(resolved);

  // The first probe asks for one word and never edits; the provider's
  // read-only mode is a precaution where the host registers one, and a host
  // without one (OpenCode) is probed without it — refusing it here would keep
  // an unattended-capable host out of the lanes for lack of a precaution.
  const readOnly = resolveSandboxArgs(hostId, 'read-only');
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-host-probe-'));
  let stdout = '';
  const startedAt = now();
  let result;
  try {
    result = await adapter.execute({
      mode: 'external',
      model: modelId,
      reasoning_effort: effort,
      ...(readOnly.ok ? { sandbox_mode: 'read-only' } : {}),
      cwd: tempDir,
      prompt_text: prompt,
      timeout: Number.isFinite(Number(timeout)) && Number(timeout) > 0 ? Number(timeout) : DEFAULT_PROBE_TIMEOUT_MS,
      resolverOptions,
      onStdout: (chunk) => { if (stdout.length < STDOUT_CAP) stdout += String(chunk); }
    });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
  const durationMs = Math.max(0, now() - startedAt);
  const excerpt = redact(stdout).replace(/\s+/g, ' ').trim().slice(0, OUTPUT_EXCERPT_MAX);
  const probe = {
    mode: 'external',
    sandbox: readOnly.ok ? 'read-only' : 'none',
    exit_code: Number.isInteger(result.code) ? result.code : null,
    duration_ms: durationMs,
    output_matched: /\bOK\b/i.test(stdout),
    output_excerpt: excerpt,
    resolver_source: result.resolver_source || resolved.source
  };
  // Earlier probes of other permission modes survive a re-sign of this one.
  const previous = findSignature(await readSignatures({ env, home }), { host: hostId, model: modelId, reasoning_effort: effort });
  const unattended = { ...(previous && previous.unattended && typeof previous.unattended === 'object' ? previous.unattended : {}) };
  const common = {
    ...base,
    binary: registered.binary,
    executable,
    version,
    install_command: registered.install_command,
    effort_verification: effort ? 'registry' : null,
    probe,
    unattended,
    ...stamp(),
    fingerprint: fingerprint([hostId, modelId, effort || '', executable, version || ''])
  };
  if (!result.ok) {
    const reason = result.reason || 'crash';
    return persistEntry({
      ...common,
      status: 'invalid',
      reason,
      error: result.error ? redact(String(result.error)).slice(0, 300) : null,
      auth: reason === 'auth' ? 'failed' : 'unknown',
      model_accepted: reason === 'invalid_model' ? false : null
    }, persistOptions);
  }
  if (unattendedProbe) {
    const translation = resolveSandboxArgs(hostId, 'workspace-write');
    if (!translation.ok) {
      return persistEntry({ ...common, status: 'invalid', reason: translation.reason, error: translation.message || null, auth: 'ok', model_accepted: true }, persistOptions);
    }
    unattended[mode] = await probeUnattendedWrite({
      adapter,
      modelId,
      effort,
      timeoutMs: Number.isFinite(Number(timeout)) && Number(timeout) > 0 ? Number(timeout) : DEFAULT_PROBE_TIMEOUT_MS,
      resolverOptions,
      now
    });
    if (unattended[mode].state === 'blocked' || unattended[mode].state === 'failed') {
      return persistEntry({
        ...common,
        status: 'invalid',
        reason: 'host_not_unattended',
        error: `the unattended write probe ${unattended[mode].state} (${unattended[mode].reason})${unattended[mode].error ? `: ${unattended[mode].error}` : ''}`,
        auth: 'ok',
        model_accepted: true
      }, persistOptions);
    }
  }
  return persistEntry({ ...common, status: 'valid', reason: null, error: null, auth: 'ok', model_accepted: true }, persistOptions);
}

module.exports = {
  DEFAULT_MODEL,
  DEFAULT_PROBE_TIMEOUT_MS,
  DEFAULT_TTL_HOURS,
  PROBE_PROMPT,
  SIGNATURES_VERSION,
  SIGNATURE_STATES,
  UNATTENDED_PROBE_FILE,
  UNATTENDED_PROBE_PROMPT,
  UNATTENDED_STATES,
  probeUnattendedWrite,
  findSignature,
  listSignatures,
  locateOnPath,
  lookupSignature,
  normalizeEffort,
  normalizeModel,
  probeHostSignature,
  readSignatures,
  signatureKey,
  signatureState,
  signaturesPath,
  writeSignatures
};
