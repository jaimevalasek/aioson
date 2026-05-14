'use strict';

/**
 * QA Phase 3 — memory-archive-with-evolution-log negative-path coverage.
 *
 * Written by @qa during Gate D review on 2026-05-14. Pins behaviors not
 * exercised by the dev-supplied tests/memory-archive.test.js:
 *  - FS rollback when the DB write fails after a successful filesystem move
 *  - Concurrent archive of the same target (race resolves to 1 success + N-1
 *    already_archived no-ops)
 *  - Restore preserves binary content (UTF-8 + emoji round-trip)
 *  - Path normalization in payload_json (forward-slashes on Windows)
 *
 * All tests must be deterministic and have zero side effects on the workspace.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { openRuntimeDb } = require('../src/runtime-store');
const { runMemoryArchive } = require('../src/commands/memory-archive');
const { runMemoryRestore } = require('../src/commands/memory-restore');
const { archiveTarget } = require('../src/learning-loop-archive');

const SILENT_LOGGER = () => ({ log: () => {}, error: () => {} });

async function makeRuleProject(slug, body) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'aioson-qa-arch-'));
  fs.mkdirSync(path.join(dir, '.aioson', 'rules'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.aioson', 'rules', `${slug}.md`), body || `---\nname: ${slug}\n---\nbody`);
  return dir;
}

// QA-FS-ROLLBACK — archiveTarget must restore the original file when the DB
// transaction fails after the filesystem move has succeeded. Simulated by
// dropping the new evolution_log columns so the INSERT raises SQLITE_ERROR.

test('QA-FS-ROLLBACK: original file is restored when DB write fails post-FS-move', async () => {
  const dir = await makeRuleProject('fs-rollback');
  const originalContent = fs.readFileSync(path.join(dir, '.aioson', 'rules', 'fs-rollback.md'), 'utf8');

  // Open the DB once to run the full migration, then corrupt the schema so
  // the next INSERT (with the Phase 3 columns) hits "no such column".
  const { db } = await openRuntimeDb(dir);
  db.exec('ALTER TABLE evolution_log RENAME TO evolution_log_bak');
  db.exec('CREATE TABLE evolution_log (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL, deltas_count INTEGER NOT NULL DEFAULT 0)');
  db.close();

  // Reopen with the broken schema and run archive directly against the helper
  // (bypassing the CLI's tier-2 notify, which would otherwise also try to write).
  const { db: db2 } = await openRuntimeDb(dir);
  // Suppress the migration short-circuit by reverting user_version so the
  // re-open does NOT recreate the dropped columns.
  db2.exec('PRAGMA user_version = 0');
  db2.close();

  // The schema-stamped DB will run migration again and re-add columns. We
  // bypass that by patching the migration call: easiest path is to remove the
  // archive helper's expected columns via a direct sql alter after open + skip.
  // Simpler approach: rely on the user_version short-circuit by stamping back
  // to 3 AFTER dropping columns, so runMigration believes work is done.
  const { db: db3 } = await openRuntimeDb(dir);
  db3.exec('ALTER TABLE evolution_log RENAME TO evolution_log_again');
  db3.exec('CREATE TABLE evolution_log (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL, deltas_count INTEGER NOT NULL DEFAULT 0)');
  db3.exec('PRAGMA user_version = 3'); // lie to the migration: pretend we're current
  const result = archiveTarget(db3, {
    targetDir: dir,
    kind: 'rule',
    slug: 'fs-rollback',
    reason: 'rollback probe',
    actor: 'human'
  });
  db3.close();

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'db_failed');
  assert.ok(/no such column/i.test(result.error || ''), `expected schema error, got: ${result.error}`);

  // The original file must be back in place (FS rollback worked).
  const restoredPath = path.join(dir, '.aioson', 'rules', 'fs-rollback.md');
  assert.ok(fs.existsSync(restoredPath), 'FS rollback failed: original file is gone');
  const restoredContent = fs.readFileSync(restoredPath, 'utf8');
  assert.equal(restoredContent, originalContent, 'FS rollback corrupted the original content');
});

// QA-CONCURRENCY — 5 parallel `aioson memory:archive` calls against the same
// target must converge to exactly one success and N-1 `already_archived`
// no-ops. The natural atomicity of `fs.rename` plus the existence-check inside
// archiveTarget is the lock primitive for Phase 3.

test('QA-CONCURRENCY: 5 parallel archives of the same target → 1 success + 4 already_archived', async () => {
  const dir = await makeRuleProject('race-target');
  const calls = Array.from({ length: 5 }, () => runMemoryArchive({
    args: [dir],
    options: { id: 'rule:race-target', reason: 'concurrent', json: true },
    logger: SILENT_LOGGER(),
    t: () => null
  }));
  const results = await Promise.all(calls);
  const successes = results.filter((r) => r.ok);
  const failures = results.filter((r) => !r.ok);

  assert.equal(successes.length, 1, `expected exactly 1 success, got ${successes.length}`);
  assert.equal(failures.length, 4, `expected exactly 4 failures, got ${failures.length}`);
  for (const f of failures) {
    assert.equal(f.reason, 'already_archived', `unexpected failure reason: ${f.reason}`);
  }

  // Exactly one archived entry should exist in evolution_log.
  const { db } = await openRuntimeDb(dir);
  try {
    const { count } = db.prepare(
      `SELECT COUNT(*) AS count FROM evolution_log WHERE target_type='rule' AND target_id='race-target' AND event_type='archived'`
    ).get();
    assert.equal(count, 1, `expected exactly 1 archived event, got ${count}`);
  } finally {
    db.close();
  }
});

// QA-FIDELITY — restore must preserve file content byte-for-byte, including
// UTF-8 multi-byte sequences and emoji surrogate pairs.

test('QA-FIDELITY: archive + restore preserves UTF-8 content byte-for-byte (including emoji)', async () => {
  const original = '---\nname: utf8-fixture\nversion: 1\n---\n\nbody with utf8: çafé 🚀\nlinha em português\n';
  const dir = await makeRuleProject('utf8-fixture', original);

  await runMemoryArchive({
    args: [dir],
    options: { id: 'rule:utf8-fixture', reason: 'round-trip', json: true },
    logger: SILENT_LOGGER(),
    t: () => null
  });
  await runMemoryRestore({
    args: [dir],
    options: { id: 'rule:utf8-fixture', json: true },
    logger: SILENT_LOGGER(),
    t: () => null
  });
  const restored = fs.readFileSync(path.join(dir, '.aioson', 'rules', 'utf8-fixture.md'), 'utf8');
  assert.equal(restored, original);
});

// QA-PATH-NORMALIZATION — payload_json must use forward-slashes on every OS,
// per EC-ALL-13. This guards Phase 4 doctor queries that join across the
// payload paths.

test('QA-PATH-NORMALIZATION: payload_json source_path and archived_path use forward-slashes on Windows', async () => {
  const dir = await makeRuleProject('path-norm');
  const result = await runMemoryArchive({
    args: [dir],
    options: { id: 'rule:path-norm', reason: 'paths', json: true },
    logger: SILENT_LOGGER(),
    t: () => null
  });
  assert.equal(result.ok, true);

  const { db } = await openRuntimeDb(dir);
  try {
    const row = db.prepare('SELECT payload_json FROM evolution_log WHERE id = ?').get(result.archived_entry_id);
    const payload = JSON.parse(row.payload_json);
    const bs = String.fromCharCode(92); // '\\'
    assert.ok(payload.source_path && payload.source_path.indexOf(bs) === -1, `source_path leaks backslash: ${payload.source_path}`);
    assert.ok(payload.archived_path && payload.archived_path.indexOf(bs) === -1, `archived_path leaks backslash: ${payload.archived_path}`);
    assert.ok(payload.source_path.startsWith('.aioson/rules/'));
    assert.ok(payload.archived_path.startsWith('.aioson/rules/_archived/'));
  } finally {
    db.close();
  }
});
