'use strict';

const { spawn } = require('node:child_process');

const SUPPORTED_RUNNER_TOOLS = new Set(['codex', 'claude', 'opencode']);
const DEFAULT_RUNNER_MODEL = 'configured-default';
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_MAX_OUTPUT_BYTES = 256 * 1024;
const DETECTION_TIMEOUT_MS = 5000;
const MODEL_RE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,119}$/;

function normalizeRunnerTool(tool) {
  const value = String(tool || '').trim().toLowerCase();
  if (!value) return { ok: false, reason: 'missing_tool' };
  if (!SUPPORTED_RUNNER_TOOLS.has(value)) {
    return {
      ok: false,
      reason: 'unsupported_tool',
      tool: value,
      supported_tools: Array.from(SUPPORTED_RUNNER_TOOLS)
    };
  }
  return { ok: true, tool: value };
}

function normalizeRunnerModel(model) {
  const value = String(model || DEFAULT_RUNNER_MODEL).trim();
  if (!value || value === DEFAULT_RUNNER_MODEL) {
    return { ok: true, model: DEFAULT_RUNNER_MODEL, uses_configured_default: true };
  }
  if (!MODEL_RE.test(value) || value.includes('..')) {
    return { ok: false, reason: 'invalid_model', model: value };
  }
  return { ok: true, model: value, uses_configured_default: false };
}

function positiveInt(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const integer = Math.floor(parsed);
  if (integer < min) return min;
  if (integer > max) return max;
  return integer;
}

function runnerLimits(options = {}) {
  return {
    timeout_ms: positiveInt(
      options['timeout-ms'] || options.timeoutMs || options.timeout,
      DEFAULT_TIMEOUT_MS,
      100,
      60 * 60 * 1000
    ),
    max_output_bytes: positiveInt(
      options['max-output-bytes'] || options.maxOutputBytes || options['max-output'],
      DEFAULT_MAX_OUTPUT_BYTES,
      1024,
      5 * 1024 * 1024
    )
  };
}

function adapterInvocation({ tool, model, rootDir, promptPath, promptText }) {
  const usesDefault = model === DEFAULT_RUNNER_MODEL;
  if (tool === 'codex') {
    const args = [
      'exec',
      '--cd', rootDir,
      '--sandbox', 'read-only',
      '--ephemeral',
      '--color', 'never'
    ];
    if (!usesDefault) args.push('--model', model);
    args.push('-');
    return {
      command: 'codex',
      args,
      stdin: promptText,
      permission_mode: 'read-only',
      destructive_commands_allowed: false
    };
  }

  if (tool === 'claude') {
    const args = [
      '--print',
      '--permission-mode', 'plan',
      '--tools', ''
    ];
    if (!usesDefault) args.push('--model', model);
    return {
      command: 'claude',
      args,
      stdin: promptText,
      permission_mode: 'plan',
      destructive_commands_allowed: false
    };
  }

  const args = [
    'run',
    '--dir', rootDir,
    '--pure',
    '--file', promptPath
  ];
  if (!usesDefault) args.push('--model', model);
  args.push('Run the implementation audit described in the attached prompt package. Return only the requested verification report with the Machine Report JSON block.');
  return {
    command: 'opencode',
    args,
    stdin: null,
    permission_mode: 'default',
    destructive_commands_allowed: false
  };
}

function commandLabel(invocation) {
  return [invocation.command, ...invocation.args].join(' ');
}

function runProcessWithLimits(invocation, { cwd, timeoutMs, maxOutputBytes, spawnImpl = spawn }) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    let settled = false;
    let timedOut = false;
    let outputLimited = false;
    let stdout = '';
    let stderr = '';
    let outputBytes = 0;
    let timer = null;

    function finish(result) {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve({
        ...result,
        duration_ms: Date.now() - startedAt,
        stdout,
        stderr,
        output_bytes: outputBytes,
        output_truncated: outputLimited
      });
    }

    let child;
    try {
      child = spawnImpl(invocation.command, invocation.args, {
        cwd,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          NO_COLOR: '1',
          CI: process.env.CI || '1'
        }
      });
    } catch (error) {
      finish({
        status: 'spawn_error',
        exit_code: null,
        signal: null,
        error: error.message
      });
      return;
    }

    timer = setTimeout(() => {
      timedOut = true;
      if (child && child.kill) child.kill('SIGTERM');
      setTimeout(() => {
        if (!settled && child && child.kill) child.kill('SIGKILL');
      }, 1000).unref?.();
    }, timeoutMs);

    function capture(kind, chunk) {
      const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk || '');
      outputBytes += Buffer.byteLength(text, 'utf8');
      if (outputBytes <= maxOutputBytes) {
        if (kind === 'stdout') stdout += text;
        else stderr += text;
        return;
      }
      outputLimited = true;
      const remaining = Math.max(0, maxOutputBytes - Buffer.byteLength(stdout + stderr, 'utf8'));
      if (remaining > 0) {
        const slice = Buffer.from(text, 'utf8').subarray(0, remaining).toString('utf8');
        if (kind === 'stdout') stdout += slice;
        else stderr += slice;
      }
      if (child && child.kill) child.kill('SIGTERM');
    }

    if (child.stdout && child.stdout.on) child.stdout.on('data', (chunk) => capture('stdout', chunk));
    if (child.stderr && child.stderr.on) child.stderr.on('data', (chunk) => capture('stderr', chunk));
    if (child.on) {
      child.on('error', (error) => {
        finish({
          status: 'spawn_error',
          exit_code: null,
          signal: null,
          error: error.message
        });
      });
      child.on('close', (code, signal) => {
        if (timedOut) {
          finish({ status: 'timeout', exit_code: code, signal });
        } else if (outputLimited) {
          finish({ status: 'output_limit', exit_code: code, signal });
        } else {
          finish({
            status: code === 0 ? 'completed' : 'failed',
            exit_code: code,
            signal
          });
        }
      });
    }

    if (child.stdin) {
      if (invocation.stdin) child.stdin.write(invocation.stdin);
      child.stdin.end();
    }
  });
}

async function detectRunnerTool(tool, { rootDir, spawnImpl = spawn }) {
  const invocation = {
    command: tool,
    args: ['--version'],
    stdin: null
  };
  const result = await runProcessWithLimits(invocation, {
    cwd: rootDir,
    timeoutMs: DETECTION_TIMEOUT_MS,
    maxOutputBytes: 16 * 1024,
    spawnImpl
  });
  if (result.status !== 'completed') {
    return {
      ok: false,
      reason: result.status === 'spawn_error' ? 'tool_not_found' : `tool_detection_${result.status}`,
      tool,
      detail: result.error || result.stderr || result.stdout || null
    };
  }
  return {
    ok: true,
    tool,
    version_output: (result.stdout || result.stderr || '').trim().slice(0, 500)
  };
}

async function runAuditorTool({
  rootDir,
  tool,
  model,
  promptPath,
  promptText,
  limits = {},
  spawnImpl = spawn
}) {
  const toolResult = normalizeRunnerTool(tool);
  if (!toolResult.ok) return toolResult;
  const modelResult = normalizeRunnerModel(model);
  if (!modelResult.ok) return modelResult;

  const detected = await detectRunnerTool(toolResult.tool, { rootDir, spawnImpl });
  if (!detected.ok) return detected;

  const invocation = adapterInvocation({
    tool: toolResult.tool,
    model: modelResult.model,
    rootDir,
    promptPath,
    promptText
  });
  const run = await runProcessWithLimits(invocation, {
    cwd: rootDir,
    timeoutMs: limits.timeout_ms || DEFAULT_TIMEOUT_MS,
    maxOutputBytes: limits.max_output_bytes || DEFAULT_MAX_OUTPUT_BYTES,
    spawnImpl
  });

  return {
    ok: run.status === 'completed',
    status: run.status,
    tool: toolResult.tool,
    model: modelResult.model,
    command: commandLabel(invocation),
    permission_mode: invocation.permission_mode,
    destructive_commands_allowed: invocation.destructive_commands_allowed,
    timeout_ms: limits.timeout_ms || DEFAULT_TIMEOUT_MS,
    max_output_bytes: limits.max_output_bytes || DEFAULT_MAX_OUTPUT_BYTES,
    duration_ms: run.duration_ms,
    exit_code: run.exit_code,
    signal: run.signal,
    stdout: run.stdout,
    stderr: run.stderr,
    output_bytes: run.output_bytes,
    output_truncated: run.output_truncated,
    error: run.error || null,
    detected
  };
}

module.exports = {
  SUPPORTED_RUNNER_TOOLS,
  DEFAULT_RUNNER_MODEL,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_MAX_OUTPUT_BYTES,
  normalizeRunnerTool,
  normalizeRunnerModel,
  runnerLimits,
  adapterInvocation,
  runProcessWithLimits,
  detectRunnerTool,
  runAuditorTool
};
