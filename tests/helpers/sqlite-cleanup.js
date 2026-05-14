'use strict';

/**
 * Windows-safe tmpdir teardown for tests that open a better-sqlite3 handle.
 *
 * Background (bug-found-002, 2026-05-14 @tester audit):
 *   On Windows, `fs.rm(tmpDir, { recursive: true })` fails with EBUSY when a
 *   better-sqlite3 handle still holds the underlying `aios.sqlite` file (or
 *   its WAL/SHM siblings). POSIX filesystems permit unlink-while-open; NTFS
 *   does not. Several squad-* test fixtures called `await openRuntimeDb(...)`
 *   and discarded the returned handle, leaving the file locked at teardown.
 *
 * Fix shape:
 *   - Tests now capture the handle and pass it to `cleanupTmpDir`.
 *   - `closeHandles` swallows errors so callers can pass partially-built
 *     fixtures without try/catch noise.
 *   - `cleanupTmpDir` relies on Node's native `fs.rm` retry options
 *     (maxRetries + retryDelay) to bridge the ~50-100ms window between
 *     `db.close()` returning and Windows releasing the OS-level file lock.
 *
 * This module is test-infrastructure only. Production code paths must continue
 * to close their handles explicitly — the retry layer is a safety net, not a
 * license to leak handles.
 */

const fs = require('node:fs/promises');

/**
 * Closes a list of better-sqlite3 handles. Each item may be:
 *   - the raw `Database` instance from `new Database(...)`
 *   - the `{ db, dbPath, runtimeDir }` wrapper returned by `openRuntimeDb`
 *   - undefined / null (silently skipped — useful for partially-built fixtures)
 *
 * Errors during close are swallowed: a teardown helper that throws is worse
 * than a teardown helper that leaves a stale handle (the OS will reap it).
 */
function closeHandles(...items) {
  for (const item of items) {
    if (!item) continue;
    const db = item.db || item;
    if (!db || typeof db.close !== 'function') continue;
    try {
      if (db.open !== false) db.close();
    } catch {
      // Intentional: teardown must not throw.
    }
  }
}

/**
 * Closes any handles in `handles`, then removes `tmpDir` recursively with
 * Node's native EBUSY/EPERM retry. Returns once the directory is gone (or
 * never existed).
 *
 * @param {string} tmpDir
 * @param {{ handles?: Array<unknown> }} [options]
 */
async function cleanupTmpDir(tmpDir, { handles = [] } = {}) {
  closeHandles(...handles);
  if (!tmpDir) return;
  await fs.rm(tmpDir, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100
  });
}

module.exports = {
  closeHandles,
  cleanupTmpDir
};
