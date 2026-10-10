'use strict';

// Loaded via --require by the npm test script (the test runner propagates
// exec flags to its child processes, so every test file gets this).
//
// Windows only: antivirus and indexing services briefly hold handles inside
// freshly-written temp trees, so recursive cleanup randomly dies with
// ENOTEMPTY/EBUSY/EPERM — the recurring `rmdir ENOTEMPTY` flake in suite
// runs. Node's own remedy is fs.rm's retry knobs; this injects them as a
// default (never overriding a caller's explicit choice) for recursive
// removals during tests, on the platform where the race exists. Linux and
// macOS keep strict semantics, so a genuine handle leak still fails loudly
// somewhere.

if (process.platform === 'win32') {
  const fs = require('node:fs');

  const withRetries = (options) =>
    options && typeof options === 'object' && options.recursive && options.maxRetries === undefined
      ? { ...options, maxRetries: 5, retryDelay: 120 }
      : options;

  const promisesRm = fs.promises.rm.bind(fs.promises);
  fs.promises.rm = (target, options) => promisesRm(target, withRetries(options));
  fs.promises.rm.aiosonWindowsRetries = true;

  const rmSync = fs.rmSync.bind(fs);
  fs.rmSync = (target, options) => rmSync(target, withRetries(options));

  const rm = fs.rm.bind(fs);
  fs.rm = (target, options, callback) => {
    if (typeof options === 'function') return rm(target, options);
    return rm(target, withRetries(options), callback);
  };
}

// All platforms: operator-store isolation. `verify:artifact --kind=visual`
// records a palette fingerprint in the operator's registry
// (~/.aioson/design-fingerprints.json) for every craft-measured surface. A
// test fixture large enough to be craft-measured would otherwise write the
// developer's real registry and then warn about its own siblings' palettes.
// Nesting the path under a FILE makes both read and write fail silently
// (best-effort by design) — the registry is simply absent for the suite. A
// test that wants a live registry sets its own path (design-seed.test.js).
if (!process.env.AIOSON_DESIGN_REGISTRY) {
  process.env.AIOSON_DESIGN_REGISTRY = require('node:path').join(__filename, 'no-registry', 'design-fingerprints.json');
}

// All platforms: one temp root per suite run. Hundreds of tests create
// fixtures with fs.mkdtemp(os.tmpdir()…); a teardown that loses a Windows
// handle race, or a test that never cleans, left its tree in the machine's
// temp folder — measured at ~15 GB after four days of suite runs, until the
// disk was full. The first process of a run (the test-runner parent) points
// TEMP/TMP/TMPDIR at `aioson-t-<pid>` inside the real temp folder; every test
// file and every CLI it spawns inherits it, the parent removes the whole root
// on exit, and the next run sweeps roots whose runner is gone. The root also
// holds the machine-wide stores a test would otherwise touch in the
// developer's home: the agent:done doc snapshots, and the old shared recall
// folder that opening a project's own recall index retires.
if (!process.env.AIOSON_TEST_TMP_ROOT) {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const PREFIX = 'aioson-t-';
  const STALE_MS = 12 * 60 * 60 * 1000;
  const base = os.tmpdir();
  const alive = (pid) => {
    try { process.kill(pid, 0); return true; } catch (error) { return Boolean(error) && error.code === 'EPERM'; }
  };
  let names = [];
  try { names = fs.readdirSync(base); } catch { /* no temp folder listing — nothing to sweep */ }
  for (const name of names) {
    if (!name.startsWith(PREFIX)) continue;
    const full = path.join(base, name);
    let age;
    try { age = Date.now() - fs.statSync(full).mtimeMs; } catch { continue; }
    const pid = Number(name.slice(PREFIX.length));
    if (Number.isInteger(pid) && pid !== process.pid && alive(pid) && age < STALE_MS) continue;
    try { fs.rmSync(full, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch { /* the next run sweeps it */ }
  }
  const root = path.join(base, `${PREFIX}${process.pid}`);
  fs.mkdirSync(root, { recursive: true });
  process.env.AIOSON_TEST_TMP_ROOT = root;
  process.env.TMPDIR = root;
  process.env.TEMP = root;
  process.env.TMP = root;
  if (!process.env.AIOSON_BACKUPS_DIR) process.env.AIOSON_BACKUPS_DIR = path.join(root, 'aioson-backups');
  if (!process.env.AIOSON_SEARCH_DIR) process.env.AIOSON_SEARCH_DIR = path.join(root, 'aioson-search');
  process.on('exit', () => {
    try { fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); } catch { /* the next run sweeps it */ }
  });
}
