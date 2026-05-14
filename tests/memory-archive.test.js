'use strict';

// Active Learning Loop — Phase 3 (memory-archive-with-evolution-log) acceptance tests.
// Covers AC-ALL-301..306 + tier-2 hook block + idempotency + integridade referencial.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  openRuntimeDb,
  insertProjectLearning
} = require('../src/runtime-store');
const {
  archiveTarget,
  restoreTarget,
  findActiveEntry,
  listHistory,
  insertEvolutionEntry
} = require('../src/learning-loop-archive');
const { runMemoryArchive } = require('../src/commands/memory-archive');
const { runMemoryRestore } = require('../src/commands/memory-restore');

const SILENT_LOGGER = () => ({ log: () => {}, error: () => {} });

async function makeProjectWithRule(slug, body) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'aioson-arch-'));
  fs.mkdirSync(path.join(dir, '.aioson', 'rules'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, '.aioson', 'rules', `${slug}.md`),
    body || `---\nname: ${slug}\n---\nbody`
  );
  return dir;
}

async function makeProjectWithLearning(learning) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'aioson-arch-'));
  const { db } = await openRuntimeDb(dir);
  try {
    insertProjectLearning(db, {
      learningId: learning.learning_id,
      projectName: 'aioson',
      featureSlug: learning.feature_slug || null,
      type: learning.type || 'process',
      title: learning.title,
      evidence: learning.evidence || '',
      status: learning.status || 'active',
      promotedTo: learning.promoted_to || null
    });
  } finally {
    db.close();
  }
  return dir;
}

async function makeProjectWithBrain(relPath, content) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'aioson-arch-'));
  const abs = path.join(dir, '.aioson', 'brains', ...relPath.split('/'));
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, JSON.stringify(content || { tag: 'sample' }, null, 2));
  return dir;
}

// ─── AC-ALL-301 ─────────────────────────────────────────────────────────────

test('AC-ALL-301: memory:archive moves rule file to _archived/<date>/, sets end_at on prior active entry, creates archived event', async () => {
  const dir = await makeProjectWithRule('prisma-migration-discipline');
  const { db } = await openRuntimeDb(dir);
  // Seed a prior active entry to test the supersede path.
  const priorId = insertEvolutionEntry(db, {
    eventType: 'promoted',
    targetType: 'rule',
    targetId: 'prisma-migration-discipline',
    actor: 'human',
    reason: 'initial promotion'
  });
  db.close();

  const result = await runMemoryArchive({
    args: [dir],
    options: {
      id: 'rule:prisma-migration-discipline',
      reason: 'unused 6 features',
      json: true
    },
    logger: SILENT_LOGGER(),
    t: () => null
  });

  assert.equal(result.ok, true);
  assert.equal(result.kind, 'rule');
  assert.equal(result.slug, 'prisma-migration-discipline');
  assert.ok(result.dest_path.startsWith('.aioson/rules/_archived/'));
  assert.ok(result.archived_entry_id);
  assert.equal(result.superseded_entry_id, priorId);

  // Filesystem: file moved
  assert.ok(!fs.existsSync(path.join(dir, '.aioson', 'rules', 'prisma-migration-discipline.md')));
  assert.ok(fs.existsSync(path.join(dir, result.dest_path.replace(/\//g, path.sep))));

  // DB: prior entry has end_at set; new archived entry exists
  const { db: db2 } = await openRuntimeDb(dir);
  try {
    const history = listHistory(db2, 'rule', 'prisma-migration-discipline');
    assert.equal(history.length, 2);
    assert.equal(history[0].event_type, 'promoted');
    assert.ok(history[0].end_at, 'prior entry must have end_at set after archive');
    assert.equal(history[1].event_type, 'archived');
  } finally {
    db2.close();
  }
});

test('AC-ALL-301: works for learning targets (snapshot JSON written, project_learnings.status flipped)', async () => {
  const dir = await makeProjectWithLearning({
    learning_id: 'pl-test-learning',
    feature_slug: 'qa-fixture',
    title: 'Learning to be archived',
    evidence: 'sample evidence',
    status: 'active'
  });

  const result = await runMemoryArchive({
    args: [dir],
    options: { id: 'learning:pl-test-learning', reason: 'obsolete', json: true },
    logger: SILENT_LOGGER(),
    t: () => null
  });

  assert.equal(result.ok, true);
  assert.equal(result.kind, 'learning');
  assert.ok(result.dest_path.startsWith('.aioson/context/_archived/'));
  assert.ok(fs.existsSync(path.join(dir, result.dest_path.replace(/\//g, path.sep))));

  // DB: status flipped
  const { db } = await openRuntimeDb(dir);
  try {
    const row = db.prepare('SELECT status FROM project_learnings WHERE learning_id = ?').get('pl-test-learning');
    assert.equal(row.status, 'archived');
  } finally {
    db.close();
  }
});

test('AC-ALL-301: works for brain targets (file moved under nested path)', async () => {
  const dir = await makeProjectWithBrain('sheldon/architecture-decisions.brain.json', { tag: 'sheldon' });
  const result = await runMemoryArchive({
    args: [dir],
    options: { id: 'brain:sheldon/architecture-decisions', reason: 'rotating', json: true },
    logger: SILENT_LOGGER(),
    t: () => null
  });
  assert.equal(result.ok, true);
  assert.equal(result.kind, 'brain');
  assert.ok(result.dest_path.includes('_archived'));
  assert.ok(result.dest_path.includes('sheldon/architecture-decisions.brain.json'));
  assert.ok(fs.existsSync(path.join(dir, result.dest_path.replace(/\//g, path.sep))));
});

// ─── AC-ALL-302 (tier-2) ────────────────────────────────────────────────────

test('AC-ALL-302: refuses when AIOSON_RUNTIME_HOOK=1 (hook context)', async () => {
  const dir = await makeProjectWithRule('hook-test');
  const originalEnv = process.env.AIOSON_RUNTIME_HOOK;
  process.env.AIOSON_RUNTIME_HOOK = '1';
  try {
    const result = await runMemoryArchive({
      args: [dir],
      options: { id: 'rule:hook-test', reason: 'never via hook', json: true },
      logger: SILENT_LOGGER(),
      t: () => null
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'hook_blocked');
    // File untouched
    assert.ok(fs.existsSync(path.join(dir, '.aioson', 'rules', 'hook-test.md')));
  } finally {
    if (originalEnv === undefined) delete process.env.AIOSON_RUNTIME_HOOK;
    else process.env.AIOSON_RUNTIME_HOOK = originalEnv;
  }
});

test('AC-ALL-302: emits tier-2 notify BEFORE mutation (logger receives warn line)', async () => {
  const dir = await makeProjectWithRule('notify-test');
  const captured = [];
  const logger = { log: (m) => captured.push(String(m)), error: () => {} };

  const result = await runMemoryArchive({
    args: [dir],
    options: { id: 'rule:notify-test', reason: 'instrumented', json: false },
    logger,
    t: () => null
  });
  assert.equal(result.ok, true);
  // At least one captured line should carry the ⚠ prefix (warn-level notify).
  const warnLine = captured.find((l) => l.includes('⚠'));
  assert.ok(warnLine, 'expected a ⚠ notify line before the archive summary');
  // The notify message contains the archive intent.
  assert.ok(warnLine.includes('notify-test'));
});

// ─── AC-ALL-303 (append-only) ───────────────────────────────────────────────

test('AC-ALL-303: evolution_log is append-only — start_at and reason of prior entry are not mutated by archive', async () => {
  const dir = await makeProjectWithRule('append-only');
  const { db } = await openRuntimeDb(dir);
  const priorId = insertEvolutionEntry(db, {
    eventType: 'promoted',
    targetType: 'rule',
    targetId: 'append-only',
    actor: 'human',
    reason: 'original-reason',
    startAt: '2026-05-01T00:00:00.000Z'
  });
  const before = db.prepare('SELECT start_at, reason, end_at FROM evolution_log WHERE id = ?').get(priorId);
  db.close();

  await runMemoryArchive({
    args: [dir],
    options: { id: 'rule:append-only', reason: 'new-reason', json: true },
    logger: SILENT_LOGGER(),
    t: () => null
  });

  const { db: db2 } = await openRuntimeDb(dir);
  try {
    const after = db2.prepare('SELECT start_at, reason, end_at FROM evolution_log WHERE id = ?').get(priorId);
    assert.equal(after.start_at, before.start_at, 'start_at must not mutate');
    assert.equal(after.reason, before.reason, 'reason must not mutate');
    assert.notEqual(after.end_at, before.end_at, 'end_at must be set (was NULL)');
    assert.ok(after.end_at, 'end_at must now hold a timestamp');
  } finally {
    db2.close();
  }
});

// ─── AC-ALL-304 (restore) ───────────────────────────────────────────────────

test('AC-ALL-304: memory:restore moves rule back + creates restored event with new start_at; history preserved', async () => {
  const dir = await makeProjectWithRule('restore-me');
  // Archive first
  const archiveResult = await runMemoryArchive({
    args: [dir],
    options: { id: 'rule:restore-me', reason: 'temporary', json: true },
    logger: SILENT_LOGGER(),
    t: () => null
  });
  assert.equal(archiveResult.ok, true);
  const archivedAt = archiveResult.start_at;

  // Restore
  const restoreResult = await runMemoryRestore({
    args: [dir],
    options: { id: 'rule:restore-me', reason: 'reverting', json: true },
    logger: SILENT_LOGGER(),
    t: () => null
  });
  assert.equal(restoreResult.ok, true);
  assert.ok(restoreResult.restored_entry_id);
  assert.notEqual(restoreResult.start_at, archivedAt, 'restore start_at must be fresh');

  // FS: file back to active location
  assert.ok(fs.existsSync(path.join(dir, '.aioson', 'rules', 'restore-me.md')));

  // DB: archived entry still has its end_at; new restored entry exists
  const { db } = await openRuntimeDb(dir);
  try {
    const history = listHistory(db, 'rule', 'restore-me');
    const archived = history.find((h) => h.event_type === 'archived');
    const restored = history.find((h) => h.event_type === 'restored');
    assert.ok(archived, 'archived entry must remain');
    assert.ok(archived.end_at, 'archived entry retains its end_at after restore');
    assert.ok(restored, 'new restored entry must exist');
    assert.equal(restored.end_at, null, 'restored entry is the new active row');
  } finally {
    db.close();
  }
});

// ─── AC-ALL-305 (referential integrity) ─────────────────────────────────────

test('AC-ALL-305: evolution_log query resolves history of an archived target without filesystem dependency', async () => {
  const dir = await makeProjectWithRule('integrity-check');
  await runMemoryArchive({
    args: [dir],
    options: { id: 'rule:integrity-check', reason: 'audit trail', json: true },
    logger: SILENT_LOGGER(),
    t: () => null
  });

  const { db } = await openRuntimeDb(dir);
  try {
    const history = listHistory(db, 'rule', 'integrity-check');
    assert.ok(history.length >= 1);
    const archived = history.find((h) => h.event_type === 'archived');
    assert.ok(archived);
    assert.ok(archived.payload_json, 'payload should hold archived path for audit');
    const payload = JSON.parse(archived.payload_json);
    assert.ok(payload.archived_path);
    assert.ok(payload.archived_path.includes('_archived'));
  } finally {
    db.close();
  }
});

// ─── AC-ALL-306 (dry-run) ───────────────────────────────────────────────────

test('AC-ALL-306: --dry-run produces summary with zero side effects on FS or DB', async () => {
  const dir = await makeProjectWithRule('dry-run-test');
  const { db } = await openRuntimeDb(dir);
  const rowsBefore = db.prepare('SELECT COUNT(*) AS c FROM evolution_log').get().c;
  db.close();

  const result = await runMemoryArchive({
    args: [dir],
    options: { id: 'rule:dry-run-test', reason: 'preview', 'dry-run': true, json: true },
    logger: SILENT_LOGGER(),
    t: () => null
  });

  assert.equal(result.ok, true);
  assert.equal(result.dry_run, true);
  assert.equal(result.archived_entry_id, null);
  assert.equal(result.superseded_entry_id, null);

  // FS: original file untouched
  assert.ok(fs.existsSync(path.join(dir, '.aioson', 'rules', 'dry-run-test.md')));
  // Dest dir should not have been materialized (no row to write).
  // The chooseAvailableArchivePath probe does NOT create the folder; only
  // ensureDir does and we never call it under dry-run.
  const archivedRoot = path.join(dir, '.aioson', 'rules', '_archived');
  // Folder may or may not exist (chooseAvailableArchivePath only reads). Either is acceptable;
  // critical is that no file inside it matches dry-run-test.md.
  if (fs.existsSync(archivedRoot)) {
    const dates = fs.readdirSync(archivedRoot);
    for (const d of dates) {
      const files = fs.readdirSync(path.join(archivedRoot, d));
      assert.ok(!files.includes('dry-run-test.md'), 'dry-run leaked a file into _archived/');
    }
  }

  // DB: no new rows
  const { db: db2 } = await openRuntimeDb(dir);
  try {
    const rowsAfter = db2.prepare('SELECT COUNT(*) AS c FROM evolution_log').get().c;
    assert.equal(rowsAfter, rowsBefore, 'dry-run inserted a row');
  } finally {
    db2.close();
  }
});

test('AC-ALL-306: memory:restore --dry-run does not move file back or write evolution_log', async () => {
  const dir = await makeProjectWithRule('restore-dry');
  // Archive first (real)
  await runMemoryArchive({
    args: [dir],
    options: { id: 'rule:restore-dry', reason: 'test', json: true },
    logger: SILENT_LOGGER(),
    t: () => null
  });
  const { db } = await openRuntimeDb(dir);
  const before = db.prepare('SELECT COUNT(*) AS c FROM evolution_log').get().c;
  db.close();

  const result = await runMemoryRestore({
    args: [dir],
    options: { id: 'rule:restore-dry', 'dry-run': true, json: true },
    logger: SILENT_LOGGER(),
    t: () => null
  });
  assert.equal(result.ok, true);
  assert.equal(result.dry_run, true);
  assert.ok(!fs.existsSync(path.join(dir, '.aioson', 'rules', 'restore-dry.md')), 'dry-run restored the file');

  const { db: db2 } = await openRuntimeDb(dir);
  try {
    const after = db2.prepare('SELECT COUNT(*) AS c FROM evolution_log').get().c;
    assert.equal(after, before, 'dry-run wrote evolution_log row');
  } finally {
    db2.close();
  }
});

// ─── Idempotency (EC-ALL-04) ────────────────────────────────────────────────

test('EC-ALL-04: re-archiving an already-archived target returns already_archived (no-op)', async () => {
  const dir = await makeProjectWithRule('idempotent-test');
  const first = await runMemoryArchive({
    args: [dir],
    options: { id: 'rule:idempotent-test', reason: 'first', json: true },
    logger: SILENT_LOGGER(),
    t: () => null
  });
  assert.equal(first.ok, true);

  const second = await runMemoryArchive({
    args: [dir],
    options: { id: 'rule:idempotent-test', reason: 'second attempt', json: true },
    logger: SILENT_LOGGER(),
    t: () => null
  });
  assert.equal(second.ok, false);
  assert.equal(second.reason, 'already_archived');
});

// ─── Validation paths ───────────────────────────────────────────────────────

test('missing --id rejected with structured error', async () => {
  const dir = await makeProjectWithRule('whatever');
  const result = await runMemoryArchive({
    args: [dir],
    options: { reason: 'no id', json: true },
    logger: SILENT_LOGGER(),
    t: () => null
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing_id');
});

test('missing --reason rejected with structured error', async () => {
  const dir = await makeProjectWithRule('reason-required');
  const result = await runMemoryArchive({
    args: [dir],
    options: { id: 'rule:reason-required', json: true },
    logger: SILENT_LOGGER(),
    t: () => null
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing_reason');
});

test('invalid --id format rejected with structured error', async () => {
  const dir = await makeProjectWithRule('valid');
  const result = await runMemoryArchive({
    args: [dir],
    options: { id: 'whatever-no-colon', reason: 'x', json: true },
    logger: SILENT_LOGGER(),
    t: () => null
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'invalid_id');
});

test('target_not_found surfaced when rule does not exist on disk', async () => {
  const dir = await makeProjectWithRule('only-this');
  const result = await runMemoryArchive({
    args: [dir],
    options: { id: 'rule:does-not-exist', reason: 'x', json: true },
    logger: SILENT_LOGGER(),
    t: () => null
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'target_not_found');
});

test('restore on a never-archived target returns target_not_archived', async () => {
  const dir = await makeProjectWithRule('only-active');
  const result = await runMemoryRestore({
    args: [dir],
    options: { id: 'rule:only-active', json: true },
    logger: SILENT_LOGGER(),
    t: () => null
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'target_not_archived');
});

// ─── Migration idempotency ──────────────────────────────────────────────────

test('migration is idempotent — running runMigration twice does not duplicate ALTER columns or indexes', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'aioson-arch-mig-'));
  const { db } = await openRuntimeDb(dir);
  const { runMigration } = require('../src/learning-loop-migration');
  try {
    runMigration(db);
    runMigration(db);
    const cols = db.prepare('PRAGMA table_info(evolution_log)').all().map((r) => r.name);
    // 6 legacy + 9 new = 15
    assert.equal(cols.length, 15, `expected 15 columns, got ${cols.length}: ${cols.join(', ')}`);
    for (const expected of ['event_type', 'target_type', 'target_id', 'start_at', 'end_at', 'reason', 'actor', 'feature_slug', 'payload_json']) {
      assert.ok(cols.includes(expected), `missing column ${expected}`);
    }
    const idx = db.prepare(`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='evolution_log'`).all().map((r) => r.name);
    for (const i of ['idx_evolution_log_target', 'idx_evolution_log_active', 'idx_evolution_log_feature']) {
      assert.ok(idx.includes(i), `missing index ${i}`);
    }
  } finally {
    db.close();
  }
});

// ─── findActiveEntry sanity ─────────────────────────────────────────────────

test('findActiveEntry returns the row with end_at IS NULL ordered by rowid DESC', async () => {
  const dir = await makeProjectWithRule('find-active');
  const { db } = await openRuntimeDb(dir);
  try {
    insertEvolutionEntry(db, {
      eventType: 'promoted',
      targetType: 'rule',
      targetId: 'find-active',
      actor: 'human',
      startAt: '2026-05-01T00:00:00.000Z'
    });
    const active = findActiveEntry(db, 'rule', 'find-active');
    assert.ok(active);
    assert.equal(active.event_type, 'promoted');
    assert.equal(active.end_at, null);
  } finally {
    db.close();
  }
});
