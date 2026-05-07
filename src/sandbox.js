'use strict';

const { spawn } = require('node:child_process');

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_BYTES = 5 * 1024; // 5KB before summarization

// Credential redaction patterns — covers the most common secret formats
const REDACTION_PATTERNS = [
  // GitHub tokens (classic and fine-grained)
  { pattern: /ghp_[A-Za-z0-9]{36}/g, replacement: 'ghp_[REDACTED]' },
  { pattern: /github_pat_[A-Za-z0-9_]{82}/g, replacement: 'github_pat_[REDACTED]' },
  // AWS access keys
  { pattern: /AKIA[0-9A-Z]{16}/g, replacement: 'AKIA[REDACTED]' },
  // Google OAuth tokens
  { pattern: /ya29\.[A-Za-z0-9_\-]{50,}/g, replacement: 'ya29.[REDACTED]' },
  // Generic Bearer tokens in headers
  { pattern: /Bearer\s+[A-Za-z0-9\-._~+\/]+=*/gi, replacement: 'Bearer [REDACTED]' },
  // Password in URL (e.g. postgres://user:password@host)
  { pattern: /:[^/:@\s]{4,}@[a-z0-9.\-]+(?::\d+)?/gi, replacement: ':[REDACTED]@host' },
  // Generic password= key=value pairs
  { pattern: /password\s*=\s*["']?[^\s"'&;,]{4,}["']?/gi, replacement: 'password=[REDACTED]' },
  { pattern: /passwd\s*=\s*["']?[^\s"'&;,]{4,}["']?/gi, replacement: 'passwd=[REDACTED]' },
  // secret= key=value pairs
  { pattern: /secret\s*=\s*["']?[^\s"'&;,]{4,}["']?/gi, replacement: 'secret=[REDACTED]' },
  // api_key= or apikey= patterns
  { pattern: /api[_-]?key\s*=\s*["']?[^\s"'&;,]{4,}["']?/gi, replacement: 'api_key=[REDACTED]' },
  // Private key blocks
  { pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g, replacement: '-----BEGIN PRIVATE KEY [REDACTED] END PRIVATE KEY-----' },
];

/**
 * Redact known credential patterns from a string.
 * @param {string} text
 * @returns {string}
 */
function redactCredentials(text) {
  if (!text) return text;
  let result = text;
  for (const { pattern, replacement } of REDACTION_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/**
 * Summarize long output to stay within size budget.
 * @param {string} output
 * @param {string} intent — optional context about what was executed
 * @param {number} maxSize — max bytes to return
 * @returns {string}
 */
function summarizeOutput(output, intent = '', maxSize = MAX_OUTPUT_BYTES) {
  if (!output || output.length <= maxSize) return output;

  const half = Math.floor(maxSize / 2);
  const head = output.slice(0, half);
  const tail = output.slice(-half);
  const omitted = output.length - maxSize;
  const intentNote = intent ? ` (${intent})` : '';

  return `${head}\n\n[... ${omitted} bytes omitted${intentNote} ...]\n\n${tail}`;
}

/**
 * Execute a shell command in a sandboxed subprocess with timeout and redaction.
 *
 * @param {string} command  — shell command to run
 * @param {object} opts     — { cwd?, timeout?, env?, maxOutput?, intent?, shell? }
 * @returns {{ ok: boolean, stdout: string, stderr: string, exitCode: number|null, timedOut: boolean }}
 */
async function executeInSandbox(command, opts = {}) {
  const timeout = opts.timeout || DEFAULT_TIMEOUT_MS;
  const cwd = opts.cwd || process.cwd();
  const maxOutput = opts.maxOutput || MAX_OUTPUT_BYTES;
  const intent = opts.intent || command.slice(0, 60);
  const shell = opts.shell !== false; // default true

  // SF-project-15: when a tool policy is supplied, gate the command against
  // shell_whitelist / shell_blacklist before spawning. Without this gate the
  // policy in autonomy-protocol.json was advisory only.
  if (opts.policy) {
    const { isCommandAllowed } = require('./autonomy-policy');
    if (!isCommandAllowed(opts.policy, 'shell', command)) {
      return {
        ok: false,
        stdout: '',
        stderr: `[autonomy-policy] command refused — not in shell_whitelist or matched shell_blacklist`,
        exitCode: null,
        timedOut: false,
        refusedByPolicy: true
      };
    }
  }

  return new Promise((resolve) => {
    const controller = new AbortController();
    let timedOut = false;
    let killed = false;

    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeout);

    const stdoutChunks = [];
    const stderrChunks = [];
    let stdoutSize = 0;
    let stderrSize = 0;

    const baseOpts = {
      cwd,
      env: { ...process.env, ...(opts.env || {}) },
      signal: controller.signal
    };

    let child;
    try {
      if (shell) {
        // Use Node's built-in shell wrapping
        child = spawn(command, [], { ...baseOpts, shell: true });
      } else {
        const parts = command.split(/\s+/);
        child = spawn(parts[0], parts.slice(1), { ...baseOpts, shell: false });
      }
    } catch (err) {
      clearTimeout(timer);
      resolve({ ok: false, stdout: '', stderr: err.message, exitCode: null, timedOut: false, error: err.message });
      return;
    }

    child.stdout.on('data', (chunk) => {
      if (stdoutSize < maxOutput * 2) {
        stdoutChunks.push(chunk);
        stdoutSize += chunk.length;
      }
    });

    child.stderr.on('data', (chunk) => {
      if (stderrSize < maxOutput * 2) {
        stderrChunks.push(chunk);
        stderrSize += chunk.length;
      }
    });

    child.on('close', (code, signal) => {
      if (killed) return;
      clearTimeout(timer);

      const rawStdout = Buffer.concat(stdoutChunks).toString('utf8');
      const rawStderr = Buffer.concat(stderrChunks).toString('utf8');

      const stdout = redactCredentials(summarizeOutput(rawStdout, intent, maxOutput));
      const stderr = redactCredentials(summarizeOutput(rawStderr, intent, maxOutput));

      resolve({
        ok: !timedOut && code === 0,
        stdout,
        stderr,
        exitCode: code,
        timedOut,
        signal: signal || null
      });
    });

    child.on('error', (err) => {
      if (killed) return;
      clearTimeout(timer);

      if (err.code === 'ABORT_ERR' || timedOut) {
        resolve({
          ok: false,
          stdout: '',
          stderr: `Command timed out after ${timeout}ms`,
          exitCode: null,
          timedOut: true,
          signal: null
        });
      } else {
        resolve({
          ok: false,
          stdout: '',
          stderr: err.message,
          exitCode: null,
          timedOut: false,
          error: err.message
        });
      }
      killed = true;
    });
  });
}

module.exports = { executeInSandbox, redactCredentials, summarizeOutput };
