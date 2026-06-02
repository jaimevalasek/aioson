'use strict';

const { spawn } = require('node:child_process');

/**
 * Detecta qual CLI de AI está disponível no sistema.
 * Usa AIOSON_RUNNER_TOOL env var se definida, depois tenta
 * claude, codex, opencode em sequência.
 */
async function detectCLI() {
  const envTool = process.env.AIOSON_RUNNER_TOOL;
  if (envTool) return envTool;

  for (const cli of ['claude', 'codex', 'opencode']) {
    const found = await new Promise((resolve) => {
      const child = spawn('which', [cli], { stdio: 'pipe' });
      child.on('close', (code) => resolve(code === 0));
      child.on('error', () => resolve(false));
    });
    if (found) return cli;
  }
  throw new Error('No AI CLI found. Install claude, codex, or opencode.');
}

/**
 * Monta os argumentos de headless para cada CLI.
 */
function buildArgs(cli, prompt, options = {}) {
  const { allowedTools, outputFormat } = options;

  switch (cli) {
    case 'claude':
      return [
        '-p', prompt,
        '--output-format', outputFormat || 'stream-json',
        '--dangerously-skip-permissions',
        ...(allowedTools ? ['--allowedTools', allowedTools] : [])
      ];
    case 'codex':
      return ['-p', prompt, '--quiet', '--no-interactive'];
    default:
      return ['-p', prompt];
  }
}

/**
 * Spawna o CLI de AI com o prompt headless e retorna o output.
 * Detecta TASK_COMPLETE no stream para sinalizar conclusão.
 *
 * @param {string} projectDir
 * @param {string} prompt
 * @param {object} options
 * @returns {Promise<{ok: boolean, output: string, stderr: string, completionMarker: boolean, exitCode: number}>}
 */
async function launchCLI(projectDir, prompt, options = {}) {
  const { tool, timeout = 120000, onData, env: extraEnv } = options;
  const cli = tool || await detectCLI();
  const args = buildArgs(cli, prompt, options);

  return new Promise((resolve) => {
    const child = spawn(cli, args, {
      cwd: projectDir,
      env: { ...process.env, ...(extraEnv || {}) },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    let completionMarker = false;
    let settled = false;

    const timer = timeout > 0
      ? setTimeout(() => {
          if (!settled) child.kill('SIGTERM');
        }, timeout)
      : null;

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      if (onData) onData(text);
      if (text.includes('TASK_COMPLETE')) completionMarker = true;
    });

    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    child.on('close', (code) => {
      settled = true;
      if (timer) clearTimeout(timer);
      resolve({
        ok: code === 0,
        output: stdout.trim(),
        stderr: stderr.trim(),
        completionMarker,
        exitCode: code ?? -1
      });
    });

    child.on('error', (err) => {
      settled = true;
      if (timer) clearTimeout(timer);
      resolve({ ok: false, output: '', stderr: err.message, completionMarker: false, exitCode: -1 });
    });
  });
}

module.exports = { launchCLI, detectCLI, buildArgs };
