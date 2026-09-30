'use strict';

/**
 * `execution:run --detach` — start the engine as its own process and return.
 *
 * A run lasts hours (ten to forty minutes per unit). Launched in the
 * foreground of an agent's shell tool, it dies with that tool's time limit and
 * takes its workers with it; many clients also refuse a hand-written detached
 * launch. Detaching is an ordinary AIOSON command instead: the child writes
 * its JSON result and live lines to a log under `.aioson/runtime/`, survives
 * the caller, and is followed with `execution:status --watch` or the
 * dashboard (which also restarts a continuous run whose engine died).
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const PASS_THROUGH_FLAGS = ['resume', 'fresh', 'step', 'until-complete', 'bounded-recovery'];

function detachedRunArgs(projectDir, feature, options = {}) {
  const args = ['execution:run', projectDir, `--feature=${feature}`];
  for (const flag of PASS_THROUGH_FLAGS) if (options[flag] === true) args.push(`--${flag}`);
  if (typeof options['expect-run'] === 'string') args.push(`--expect-run=${options['expect-run']}`);
  if (options.wave !== undefined && options.wave !== true) args.push(`--wave=${Number(options.wave)}`);
  args.push('--json');
  return args;
}

function launchDetachedRun({ projectDir, feature, options = {}, env = process.env, spawnImpl = spawn }) {
  const relative = `.aioson/runtime/execution-detached/${feature}/${crypto.randomUUID()}`;
  const directory = path.join(projectDir, relative);
  fs.mkdirSync(directory, { recursive: true });
  const out = fs.openSync(path.join(directory, 'stdout.log'), 'a');
  let err;
  try { err = fs.openSync(path.join(directory, 'stderr.log'), 'a'); }
  catch (error) { fs.closeSync(out); throw error; }
  const cli = path.resolve(__dirname, '../../bin/aioson.js');
  const args = detachedRunArgs(projectDir, feature, options);
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawnImpl(process.execPath, [cli, ...args], { cwd: projectDir, env, detached: true, windowsHide: true, stdio: ['ignore', out, err] });
    } catch (error) { reject(error); return; }
    finally { fs.closeSync(out); fs.closeSync(err); }
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve({ pid: child.pid, log: relative, args });
    });
  });
}

module.exports = { launchDetachedRun, detachedRunArgs };
