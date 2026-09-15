'use strict';

/**
 * Spawner adapter — the node becomes a process the supervising client owns.
 *
 * With a spawner configured (`AIOSON_EXECUTION_SPAWNER` in the session's
 * environment, or `execution.spawner` in the roles file) the engine no longer
 * spawns the host CLI itself. For every unit it hands the client one JSON
 * envelope on stdin — who (host/model/effort), what (unit, lane, wave, role),
 * where (cwd, prompt file, report path, write paths), how (the exact argv it
 * would have used) — and the client opens the process where it wants: a
 * terminal in its grid, a tab, a pane. The client answers `{ok, session_id,
 * pid?}` and returns at once; the engine then waits for the only "done" it
 * trusts, the bound JSON report, with the same stall watch and telemetry as a
 * process it spawned itself. On orchestration abort it asks the client to
 * close the session (`action: "close"`), best effort. There is no unit clock.
 *
 * Nothing about the client leaks into the engine: the contract is one command,
 * one envelope in, one JSON line out.
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { resolveExecutable } = require('../executable-resolver');
const { redact } = require('./base');

const ENVELOPE_VERSION = 1;
const DEFAULT_POLL_MS = 1000;
const DEFAULT_SPAWNER_TIMEOUT_MS = 30000;
const OUTPUT_CAP = 64 * 1024;

function parseResponse(stdout) {
  const text = String(stdout || '').trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const lines = text.split(/\r?\n/).reverse();
    for (const line of lines) {
      try {
        const value = JSON.parse(line.trim());
        if (value && typeof value === 'object') return value;
      } catch { /* not this line */ }
    }
    return null;
  }
}

/** Run the client's spawner command once with an envelope on stdin; resolve its JSON answer. */
async function runSpawner(spawner, envelope, { cwd, resolverOptions, timeoutMs = DEFAULT_SPAWNER_TIMEOUT_MS, spawnImpl = spawn } = {}) {
  let resolved;
  try {
    resolved = await resolveExecutable(spawner.command, resolverOptions);
  } catch (error) {
    return { ok: false, reason: 'spawner_not_found', error: redact(error.message) };
  }
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timedOut = false;
    // `timer` is declared before `finish` on purpose: a synchronous throw from
    // `spawnImpl` — a sandbox that refuses to create the process, an invalid
    // cwd — calls `finish` before any timer exists. Declaring it after put the
    // clearTimeout in the temporal dead zone, so every failure to launch the
    // client was reported as `Cannot access 'timer' before initialization`
    // instead of the real cause.
    let timer = null;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(result);
    };
    let child;
    try {
      child = spawnImpl(resolved.executable, [...resolved.prefixArgs, ...(spawner.args || [])], { cwd, shell: false, stdio: 'pipe', windowsHide: true });
    } catch (error) {
      finish({ ok: false, reason: 'spawner_failed', error: redact(error.message) });
      return;
    }
    timer = setTimeout(() => {
      timedOut = true;
      try { child.kill(); } catch { /* already gone */ }
    }, timeoutMs);
    timer.unref?.();
    child.stdout.on('data', (data) => { stdout += data; if (stdout.length > OUTPUT_CAP) stdout = stdout.slice(-OUTPUT_CAP); });
    child.stderr.on('data', (data) => { stderr += data; if (stderr.length > OUTPUT_CAP) stderr = stderr.slice(-OUTPUT_CAP); });
    child.on('error', (error) => finish({ ok: false, reason: 'spawner_failed', error: redact(error.message) }));
    child.on('exit', (code) => {
      if (timedOut) {
        finish({ ok: false, reason: 'spawner_timeout', error: `spawner did not answer within ${timeoutMs} ms` });
        return;
      }
      const response = parseResponse(stdout);
      if (code !== 0) {
        finish({ ok: false, reason: 'spawner_failed', code, error: redact(response?.error || stderr || stdout).slice(0, 1000), response });
        return;
      }
      if (!response || response.ok !== true) {
        finish({ ok: false, reason: 'spawner_failed', code, error: redact(response?.error || 'spawner returned no {ok: true, session_id}').slice(0, 1000), response });
        return;
      }
      finish({ ok: true, response });
    });
    try {
      child.stdin.on('error', () => { /* the client may exit before reading */ });
      child.stdin.end(`${JSON.stringify(envelope)}\n`);
    } catch { /* reported through exit */ }
  });
}

async function reportReady(file) {
  try {
    const text = await fs.readFile(file, 'utf8');
    if (!text.trim()) return false;
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

function sleepUnlessAborted(ms, signal) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
    const onAbort = () => { clearTimeout(timer); resolve(); };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Wrap a host adapter: same capability probe and argv build; the execution is
 * handed to the spawner and the wait is on the bound report.
 */
function createSpawnerAdapter(hostAdapter, spawner, { pollMs = DEFAULT_POLL_MS, spawnerTimeoutMs = DEFAULT_SPAWNER_TIMEOUT_MS, spawnImpl } = {}) {
  return {
    host: hostAdapter.host,
    spawner: { command: spawner.command, args: [...(spawner.args || [])], source: spawner.source || null },

    probe() {
      return hostAdapter.probe();
    },

    build(input) {
      return hostAdapter.build(input);
    },

    async execute(input) {
      const built = this.build(input);
      if (!built.ok) return built;
      if (input.signal?.aborted) return { ok: false, reason: input.abortReason || 'aborted', error: 'execution aborted before spawn' };
      const context = input.spawn_context || {};
      const cwd = input.cwd;
      const reportRel = context.report_path;
      if (!reportRel) return { ok: false, reason: 'spawner_failed', error: 'spawn_context.report_path is required for a spawner' };
      const reportFile = path.resolve(cwd, reportRel);
      const promptRel = reportRel.replace(/\.json$/i, '') + '.prompt.md';
      const promptFile = path.resolve(cwd, promptRel);
      await fs.mkdir(path.dirname(promptFile), { recursive: true });
      await fs.writeFile(promptFile, String(input.prompt_text || ''), 'utf8');
      const identity = {
        feature: context.feature || null,
        run_id: context.run_id || null,
        attempt_id: context.attempt_id || null,
        unit: context.unit || null,
        lane: context.lane || null,
        wave: context.wave ?? null,
        role: context.role || null
      };
      const envelope = {
        version: ENVELOPE_VERSION,
        action: 'spawn',
        ...identity,
        host: hostAdapter.host,
        model: input.model,
        reasoning_effort: input.reasoning_effort || null,
        cwd,
        prompt_path: promptRel,
        report_path: reportRel,
        write_paths: context.write_paths || [],
        writable_roots: input.writable_roots || [],
        command: built.executable,
        args: built.args,
        prompt_stdin: Boolean(built.stdin),
        sandbox_mode: input.sandbox_mode || null
      };
      const spawnerOptions = { cwd, resolverOptions: input.resolverOptions, timeoutMs: spawnerTimeoutMs, spawnImpl };
      const started = await runSpawner(spawner, envelope, spawnerOptions);
      if (!started.ok) return started;
      const sessionId = started.response.session_id !== undefined && started.response.session_id !== null ? String(started.response.session_id) : null;
      const pid = Number.isInteger(started.response.pid) ? started.response.pid : null;
      input.onSpawn?.(pid, new Date().toISOString());
      const close = async (reason) => {
        await runSpawner(spawner, { version: ENVELOPE_VERSION, action: 'close', reason, session_id: sessionId, ...identity }, spawnerOptions).catch(() => {});
      };
      for (;;) {
        if (input.signal?.aborted) {
          await close(input.abortReason || 'aborted');
          return { ok: false, reason: input.abortReason || 'aborted', error: 'execution aborted', session_id: sessionId, resolver_source: 'spawner' };
        }
        if (await reportReady(reportFile)) return { ok: true, code: 0, session_id: sessionId, resolver_source: 'spawner' };
        await sleepUnlessAborted(pollMs, input.signal);
      }
    }
  };
}

function wrapRegistryWithSpawner(registry, spawner, options = {}) {
  return Object.fromEntries(Object.entries(registry).map(([host, adapter]) => [host, createSpawnerAdapter(adapter, spawner, options)]));
}

module.exports = { ENVELOPE_VERSION, createSpawnerAdapter, parseResponse, runSpawner, wrapRegistryWithSpawner };
