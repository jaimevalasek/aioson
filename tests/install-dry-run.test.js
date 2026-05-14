'use strict';

/**
 * Characterization tests for `aioson install --dry-run`.
 *
 * bug-found-001 (2026-05-14 @tester audit):
 *   `aioson install --dry-run` reports "Installation completed at: ...",
 *   "Files copied: N", "Files skipped: N" — identical to a real install.
 *   The wizard/reveal-animation branch is correctly skipped, and no files are
 *   actually written (verified with `git status` after invocation), but the
 *   stdout is indistinguishable from the real run. Operators have no way to
 *   know whether they just simulated or just executed.
 *
 * Root cause (src/commands/install.js, the else branch around lines 121-128):
 *   the non-TTY/dry-run else clause reuses `install.done_at`,
 *   `install.files_copied`, and `install.files_skipped` for BOTH a real
 *   non-interactive install AND for dry-run. Dry-run-specific i18n keys
 *   never existed.
 *
 * These tests pin the contract that prevents the regression:
 *   - AC-DRY-01: dry-run stdout contains a visible "DRY RUN" marker
 *   - AC-DRY-02: dry-run summary uses "would copy" / "would skip" language,
 *                not the past-tense "copied" / "skipped" of the real run
 *   - AC-DRY-03: dry-run does not create any files on disk
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createTranslator } = require('../src/i18n');
const { runInstall } = require('../src/commands/install');

async function makeTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-install-dryrun-'));
}

async function countFiles(dir) {
  let n = 0;
  async function walk(p) {
    let entries;
    try { entries = await fs.readdir(p, { withFileTypes: true }); }
    catch { return; }
    for (const e of entries) {
      const full = path.join(p, e.name);
      if (e.isDirectory()) await walk(full);
      else n += 1;
    }
  }
  await walk(dir);
  return n;
}

function createCollectLogger() {
  const lines = [];
  return {
    lines,
    log(line)   { lines.push(String(line)); },
    error(line) { lines.push(String(line)); }
  };
}

test('AC-DRY-01: install --dry-run stdout contains a visible DRY RUN marker', async () => {
  const dir = await makeTempDir();
  const { t } = createTranslator('en');
  const logger = createCollectLogger();

  await runInstall({
    args: [dir],
    options: { 'dry-run': true, 'no-interactive': true },
    logger,
    t
  });

  const all = logger.lines.join('\n');
  // The marker must be a recognizable, locale-independent sentinel that an
  // operator can grep for. "DRY RUN" (uppercase, with surrounding context)
  // is the convention used by every other AIOSON dry-run path.
  assert.match(
    all,
    /DRY RUN/,
    `dry-run stdout must contain a "DRY RUN" marker; logger output was:\n${all}`
  );
});

test('AC-DRY-02: install --dry-run summary uses "would" (conditional), not past-tense "copied/skipped"', async () => {
  const dir = await makeTempDir();
  const { t } = createTranslator('en');
  const logger = createCollectLogger();

  await runInstall({
    args: [dir],
    options: { 'dry-run': true, 'no-interactive': true },
    logger,
    t
  });

  const all = logger.lines.join('\n');
  // Past-tense lines like "Files copied: N" are a lie in dry-run: nothing
  // was copied. Demand the conditional form ("would be copied"/"would be
  // skipped") so the operator cannot mistake a simulation for a real run.
  assert.match(
    all,
    /would be copied/i,
    `dry-run must report "would be copied" (conditional), not past-tense "copied"; output was:\n${all}`
  );
  assert.match(
    all,
    /would be skipped/i,
    `dry-run must report "would be skipped" (conditional), not past-tense "skipped"; output was:\n${all}`
  );
  // And the past-tense forms used by the real install path MUST NOT appear
  // as summary lines (any occurrence inside the tempdir path is fine, but
  // we anchor at line start to be precise).
  const offendingLines = logger.lines.filter((line) =>
    /^Files copied:/.test(line) || /^Files skipped:/.test(line) || /^Installation completed at:/.test(line)
  );
  assert.deepEqual(
    offendingLines,
    [],
    `dry-run must not emit the real-install summary lines; offending lines:\n${offendingLines.join('\n')}`
  );
});

test('AC-DRY-03: install --dry-run does not write any files to the target directory', async () => {
  const dir = await makeTempDir();
  const { t } = createTranslator('en');
  const logger = createCollectLogger();

  const before = await countFiles(dir);
  await runInstall({
    args: [dir],
    options: { 'dry-run': true, 'no-interactive': true },
    logger,
    t
  });
  const after = await countFiles(dir);

  assert.equal(after, before, 'dry-run must not create any files on disk');
});
