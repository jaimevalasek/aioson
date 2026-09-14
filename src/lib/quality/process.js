'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

function commandFor(argv) {
  if (!Array.isArray(argv) || !argv.length || argv.some(value => typeof value !== 'string' || value.includes('\0')) || !argv[0]) {
    throw new Error('Quality commands require a nonempty argv array of strings.');
  }
  if (argv[0] === 'node') return [process.execPath, ...argv.slice(1)];
  if (argv[0] === 'npm' && process.platform === 'win32') {
    const candidates = [process.env.npm_execpath, path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js')];
    const cli = candidates.find(file => file && /npm-cli\.js$/i.test(file) && fs.existsSync(file));
    if (!cli) throw new Error('Cannot locate npm-cli.js. Configure an explicit Node entrypoint.');
    return [process.execPath, cli, ...argv.slice(1)];
  }
  if (/\.(cmd|bat)$/i.test(argv[0])) throw new Error('Use an executable or Node entrypoint, not a shell shim.');
  return argv;
}

function stop(child) {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    killer.on('error', () => child.kill());
  } else {
    try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
  }
}

async function execute(argv, { cwd, input = '', timeout = 60000 } = {}) {
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 600000) throw new Error('Quality timeout must be 1..600000 milliseconds.');
  const [file, ...args] = commandFor(argv);
  const start = performance.now();
  return new Promise(resolve => {
    const child = spawn(file, args, { cwd, windowsHide: true, shell: false, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', bytes = 0, reason = null;
    const timer = setTimeout(() => { reason = 'timeout'; stop(child); }, timeout);
    function collect(stream, chunk) {
      bytes += chunk.length;
      if (bytes > 4 * 1024 * 1024) { reason = 'output_limit'; stop(child); return; }
      if (stream === 'stdout') stdout += chunk.toString();
      else stderr += chunk.toString();
    }
    child.stdout.on('data', chunk => collect('stdout', chunk));
    child.stderr.on('data', chunk => collect('stderr', chunk));
    child.stdin.on('error', () => {});
    child.on('error', error => { reason = error.code || 'spawn_error'; stderr += error.message; });
    child.on('close', code => {
      clearTimeout(timer);
      resolve({ status: reason ? 'error' : code === 0 ? 'pass' : 'fail', reason, exit_code: code,
        duration_ms: Math.round(performance.now() - start), stdout, stderr });
    });
    child.stdin.end(input);
  });
}

module.exports = { execute, commandFor };
