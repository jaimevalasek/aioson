'use strict';

const { spawn } = require('node:child_process');
const { capabilities, requiredCapability } = require('../capabilities');
const { resolveExecutable } = require('../executable-resolver');
const { resolveSandboxArgs } = require('../../lib/tool-capabilities');
const { createUsageCollector } = require('../execution-usage');

function redact(text) {
  return String(text || '').replace(
    /(authorization\s*[:=]\s*(?:bearer\s+)?|api[_-]?key\s*[:=]\s*|token\s*[:=]\s*|password\s*[:=]\s*)[^\s,;]+/gi,
    '$1[REDACTED]'
  );
}

function normalizeError(error) {
  const text = String(error?.message || error || '').toLowerCase();
  if (/unexpected argument|invalid (?:argument|option)|unknown option/.test(text)) return 'invalid_arguments';
  if (/capacity|overloaded|rate limit|too many requests|quota|insufficient (?:credit|fund)|payment required|billing/.test(text)) return 'capacity';
  if (/model.*invalid|unknown model/.test(text)) return 'invalid_model';
  if (/unauthorized|authentication failed|not authenticated|forbidden/.test(text)) return 'auth';
  if (/connection|network|econnreset|enotfound|socket hang up|service unavailable|bad gateway|gateway timeout/.test(text)) return 'connection';
  if (/timeout|timed out/.test(text)) return 'timeout';
  return 'crash';
}

function terminateChildTree(child, { force = false } = {}) {
  if (!child?.pid || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    const killer = spawn(
      'taskkill',
      ['/pid', String(child.pid), '/T', ...(force ? ['/F'] : [])],
      {
        shell: false,
        stdio: 'ignore',
        windowsHide: true
      }
    );
    killer.on('error', () => {
      try { child.kill(); } catch {}
    });
    killer.unref();
    return;
  }
  try {
    process.kill(-child.pid, force ? 'SIGKILL' : 'SIGTERM');
  } catch {
    try { child.kill(force ? 'SIGKILL' : 'SIGTERM'); } catch {}
  }
}

function createAdapter(host, buildArgs) {
  return {
    host,

    probe() {
      return capabilities(host);
    },

    build(input) {
      const cap = this.probe();
      const required = requiredCapability(input.mode);
      if (required && !cap[required]) {
        return { ok: false, reason: 'unsupported_capability', capability: required, host };
      }
      if (input.reasoning_effort && !cap.reasoning_effort) {
        return {
          ok: false,
          reason: 'unsupported_reasoning_effort',
          capability: 'reasoning_effort',
          host
        };
      }
      if (input.writable_roots?.length && !cap.additional_workspaces) {
        return {
          ok: false,
          reason: 'host_capability_missing',
          capability: 'additional_workspaces',
          host
        };
      }
      // The sandbox translation is the registry's, not the adapter's: a mode
      // the host cannot honor is refused here, for every adapter alike.
      const sandbox = resolveSandboxArgs(host, input.sandbox_mode);
      if (!sandbox.ok) {
        return {
          ok: false,
          reason: sandbox.reason,
          sandbox_mode: sandbox.sandbox_mode || null,
          host,
          error: sandbox.message || null
        };
      }
      const command = buildArgs({ ...input, sandbox_args: sandbox.args });
      const args = Array.isArray(command) ? command : command.args;
      const stdin = Array.isArray(command) ? false : command.stdin;
      return {
        ok: true,
        executable: cap.executable,
        args,
        // Most adapters use `true` to stream the raw prompt. Structured-input
        // harnesses may provide the exact bounded payload while still keeping
        // prompts out of argv (and therefore outside Windows' argv limit).
        stdin: typeof stdin === 'string' ? stdin : Boolean(stdin),
        options: {
          cwd: input.cwd,
          shell: false,
          stdio: 'pipe',
          detached: process.platform !== 'win32',
          windowsHide: true
        }
      };
    },

    async execute(input) {
      const built = this.build(input);
      if (!built.ok) return built;
      if (input.signal?.aborted) {
        return {
          ok: false,
          reason: input.abortReason || 'aborted',
          error: 'execution aborted before spawn'
        };
      }

      let resolved;
      try {
        resolved = await resolveExecutable(built.executable, input.resolverOptions);
      } catch (error) {
        return {
          ok: false,
          reason: 'executable_not_found',
          error: redact(error.message)
        };
      }
      if (input.signal?.aborted) {
        return {
          ok: false,
          reason: input.abortReason || 'aborted',
          error: 'execution aborted before spawn'
        };
      }

      return new Promise((resolve) => {
        const child = spawn(
          resolved.executable,
          [...resolved.prefixArgs, ...built.args],
          built.options
        );
        input.onSpawn?.(child.pid, new Date().toISOString());
        let stderr = '';
        let timedOut = false;
        let aborted = false;
        let settled = false;
        let forceTimer = null;
        let contextExceeded = false;
        let structuredAbortReason = null;
        let contextBudget = input.context_budget;
        const usage = input.captureUsage ? createUsageCollector(host, {
          onUpdate: value => input.onUsage?.(value),
          onEvent: event => {
            if (structuredAbortReason || typeof input.onStructuredEvent !== 'function') return;
            try { structuredAbortReason = input.onStructuredEvent(event) || null; } catch { structuredAbortReason = null; }
            if (structuredAbortReason) stopTree();
          },
          onContext: value => {
            input.onContext?.(value);
            if (contextBudget && value.context_window_tokens) contextBudget = { ...contextBudget, context_window_tokens: value.context_window_tokens, window_source: 'harness', max_tokens: Math.min(contextBudget.max_tokens, Math.floor(value.context_window_tokens * contextBudget.max_fraction)) };
            if (!contextExceeded && contextBudget && value.tokens >= contextBudget.max_tokens) {
              contextExceeded = true;
              stopTree();
            }
          }
        }) : null;

        const stopTree = () => {
          terminateChildTree(child);
          forceTimer = setTimeout(() => terminateChildTree(child, { force: true }), 1000);
          forceTimer.unref?.();
        };
        const onAbort = () => {
          aborted = true;
          stopTree();
        };
        input.signal?.addEventListener('abort', onAbort, { once: true });
        if (input.signal?.aborted) onAbort();

        child.stdout.on('data', (data) => { usage?.push(data); input.onStdout?.(data); });
        child.stderr.on('data', (data) => {
          input.onStderr?.(data);
          stderr += data;
          if (stderr.length > 4000) stderr = stderr.slice(-4000);
        });
        // A harness can exit before consuming a large prompt (for example auth
        // failure). Its exit/stderr is authoritative; EPIPE must not kill the engine.
        child.stdin.on('error', () => {});
        if (typeof built.stdin === 'string') child.stdin.end(built.stdin);
        else if (built.stdin) child.stdin.end(String(input.prompt_text || ''));
        else child.stdin.end();

        const finish = (result) => {
          if (settled) return;
          settled = true;
          if (usage) result = { ...result, usage: usage.finish() };
          if (contextBudget) result = { ...result, context_budget: contextBudget };
          if (contextExceeded) result = { ...result, ok: false, reason: 'context_budget_exceeded' };
          if (!result.ok && result.usage) result.usage = { ...result.usage, complete: false };
          if (timer) clearTimeout(timer);
          if (forceTimer) clearTimeout(forceTimer);
          input.signal?.removeEventListener('abort', onAbort);
          child.stdout.destroy();
          child.stderr.destroy();
          input.onExit?.(result);
          resolve(result);
        };
        const timer = input.timeout
          ? setTimeout(() => {
              timedOut = true;
              stopTree();
            }, input.timeout)
          : null;
        timer?.unref?.();

        child.on('error', (error) => finish(aborted
          ? {
              ok: false,
              reason: input.abortReason || 'aborted',
              error: 'execution aborted'
            }
          : {
              ok: false,
              reason: normalizeError(error),
              error: redact(error.message)
            }));
        child.on('close', (code) => finish(aborted
          ? {
              ok: false,
              code,
              reason: input.abortReason || 'aborted',
              error: 'execution aborted',
              resolver_source: resolved.source
            }
          : structuredAbortReason
            ? { ok: false, code, reason: structuredAbortReason, error: `execution stopped after repeated structured activity: ${structuredAbortReason}`, resolver_source: resolved.source }
            : code === 0 && !timedOut
              ? { ok: true, code, resolver_source: resolved.source }
              : {
                ok: false,
                code,
                reason: timedOut ? 'timeout' : normalizeError(stderr),
                error: redact(stderr).slice(0, 1000),
                resolver_source: resolved.source
              }));
      });
    }
  };
}

module.exports = {
  createAdapter,
  normalizeError,
  redact,
  terminateChildTree
};
