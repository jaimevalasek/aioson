'use strict';

/**
 * cross-tool-project-knowledge — Slice 1 (schema + M1 capture).
 *
 * Covers: project_learnings.kind migration (Phase 4), the devlog tagged-learning
 * parser (gotcha/resolution -> type=quality + kind), the app-level kind allow-list
 * + re-tag enrichment, and an end-to-end devlog:process round-trip on a fresh DB.
 *
 * All DB work runs in :memory: or isolated temp dirs — never the real runtime.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');

const { runMigration } = require('../src/learning-loop-migration');
const { materializeLearnings } = require('../src/learning-materialize');
const fsSync = require('node:fs');
const {
  extractTaggedLearnings,
  upsertProjectLearning,
  runDevlogProcess
} = require('../src/commands/devlog-process');
const { runLearning } = require('../src/commands/learning');

function hasColumn(db, table, col) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((r) => r.name === col);
}

// ───────────────────────────── parser ─────────────────────────────

test('parser: [gotcha] -> type=quality, kind=gotcha', () => {
  const out = extractTaggedLearnings('## Learnings\n- [gotcha] filtering by name breaks; filter by content\n');
  assert.equal(out.length, 1);
  assert.deepEqual(out[0], {
    type: 'quality',
    kind: 'gotcha',
    title: 'filtering by name breaks; filter by content'
  });
});

test('parser: [resolution] -> type=quality, kind=resolution', () => {
  const out = extractTaggedLearnings('## Learnings\n- [resolution] remove stale postmaster.pid before relaunch\n');
  assert.equal(out[0].type, 'quality');
  assert.equal(out[0].kind, 'resolution');
});

test('parser: the 4 base tags keep kind=null (backward compat)', () => {
  const out = extractTaggedLearnings('## Learnings\n- [process] keep slices small\n- [domain] devlog feeds sqlite\n');
  assert.deepEqual(out.map((l) => [l.type, l.kind]), [['process', null], ['domain', null]]);
});

test('parser: untagged line falls back to process/null', () => {
  const out = extractTaggedLearnings('## Learnings\n- some untagged finding worth keeping\n');
  assert.deepEqual(out[0], { type: 'process', kind: null, title: 'some untagged finding worth keeping' });
});

// ──────────────────────────── migration ───────────────────────────

function minimalLegacyDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE execution_events (id INTEGER PRIMARY KEY, event_type TEXT, agent_name TEXT);
    CREATE TABLE project_learnings (learning_id TEXT PRIMARY KEY, title TEXT, evidence TEXT, type TEXT, status TEXT);
    CREATE TABLE evolution_log (id INTEGER PRIMARY KEY);
    PRAGMA user_version = 3;
  `);
  return db;
}

test('migration: Phase 4 adds kind to a legacy project_learnings (v3 -> v4)', () => {
  const db = minimalLegacyDb();
  assert.equal(hasColumn(db, 'project_learnings', 'kind'), false);
  runMigration(db);
  assert.equal(hasColumn(db, 'project_learnings', 'kind'), true);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 4);
  db.close();
});

test('migration: idempotent — second run is a no-op, kind exists exactly once', () => {
  const db = minimalLegacyDb();
  runMigration(db);
  runMigration(db);
  const kindCols = db.prepare('PRAGMA table_info(project_learnings)').all().filter((r) => r.name === 'kind');
  assert.equal(kindCols.length, 1);
  db.close();
});

// ─────────────────────── upsert allow-list / enrichment ───────────────────────

function dbWithLearningsTable() {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE project_learnings (
    learning_id TEXT PRIMARY KEY, project_name TEXT, feature_slug TEXT,
    type TEXT, title TEXT, confidence TEXT, frequency INTEGER, last_reinforced TEXT,
    applies_to TEXT, promoted_to TEXT, status TEXT, source_session TEXT, evidence TEXT,
    created_at TEXT, updated_at TEXT, kind TEXT
  );`);
  return db;
}

test('upsert: invalid kind is coerced to NULL (app-level allow-list)', () => {
  const db = dbWithLearningsTable();
  upsertProjectLearning(db, { title: 'x', type: 'quality', kind: 'bogus', featureSlug: 'f' });
  assert.equal(db.prepare('SELECT kind FROM project_learnings WHERE title = ?').get('x').kind, null);
  db.close();
});

test('upsert: re-tag enriches a NULL kind but never clobbers an existing one', () => {
  const db = dbWithLearningsTable();
  upsertProjectLearning(db, { title: 't', type: 'process', kind: null, featureSlug: 'f' });
  upsertProjectLearning(db, { title: 't', type: 'quality', kind: 'gotcha', featureSlug: 'f' });
  let row = db.prepare('SELECT kind, frequency FROM project_learnings WHERE title = ?').get('t');
  assert.equal(row.kind, 'gotcha');
  assert.equal(row.frequency, 2);
  upsertProjectLearning(db, { title: 't', type: 'quality', kind: 'resolution', featureSlug: 'f' });
  row = db.prepare('SELECT kind FROM project_learnings WHERE title = ?').get('t');
  assert.equal(row.kind, 'gotcha', 'existing classification must survive a later re-tag');
  db.close();
});

// ─────────────────── end-to-end: fresh DB + devlog:process ───────────────────

test('e2e: fresh runtime DB has kind, devlog gotcha/resolution/process round-trip', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ctpk-'));
  try {
    const logsDir = path.join(tmp, 'aioson-logs');
    await fs.mkdir(logsDir, { recursive: true });
    await fs.writeFile(path.join(logsDir, 'devlog-001.md'), `---
agent: dev
feature: ctpk-fixture
session_key: direct-session:1:dev
started_at: 2026-01-01T00:00:00Z
finished_at: 2026-01-01T01:00:00Z
status: completed
---

# Devlog

## Summary
fixture devlog

## Learnings
- [gotcha] filtering by name breaks; filter by content
- [resolution] remove stale postmaster.pid before relaunch
- [process] keep slices small
`, 'utf8');

    const res = await runDevlogProcess({ args: [tmp], options: { json: true }, logger: { log() {}, error() {} } });
    assert.equal(res.ok, true);

    const db = new Database(res.dbPath);
    try {
      assert.equal(hasColumn(db, 'project_learnings', 'kind'), true);
      const gotcha = db.prepare("SELECT type, kind FROM project_learnings WHERE title LIKE 'filtering by name%'").get();
      assert.deepEqual([gotcha.type, gotcha.kind], ['quality', 'gotcha']);
      const reso = db.prepare("SELECT type, kind FROM project_learnings WHERE title LIKE 'remove stale%'").get();
      assert.deepEqual([reso.type, reso.kind], ['quality', 'resolution']);
      const proc = db.prepare("SELECT type, kind FROM project_learnings WHERE title LIKE 'keep slices%'").get();
      assert.deepEqual([proc.type, proc.kind], ['process', null]);
    } finally {
      db.close();
    }
  } finally {
    await fs.rm(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
});

// ─────────────────── Slice 2: M2 materialize + M3 INDEX ───────────────────

function seedLearning(db, { id, title, kind, status = 'active', updated_at, feature_slug = 'f', evidence = null }) {
  db.prepare(`INSERT INTO project_learnings
    (learning_id, feature_slug, type, kind, title, confidence, frequency, applies_to, status, evidence, created_at, updated_at)
    VALUES (?, ?, 'quality', ?, ?, 'high', 1, 'project', ?, ?, '2026-01-01T00:00:00Z', ?)`)
    .run(id, feature_slug, kind, title, status, evidence, updated_at);
}

test('materialize: gotcha->gotchas/, resolution->recipes/ with frontmatter + ordered INDEX', async () => {
  const db = dbWithLearningsTable();
  seedLearning(db, { id: 'l1', title: 'OpenClaw CSP iframe', kind: 'gotcha', updated_at: '2026-05-02T00:00:00Z' });
  seedLearning(db, { id: 'l2', title: 'Paperclip postgres orphan', kind: 'resolution', updated_at: '2026-05-01T00:00:00Z' });
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ctpk-mat-'));
  try {
    const res = materializeLearnings({ db, targetDir: tmp });
    assert.equal(res.ok, true);
    assert.equal(res.written, 2);
    const gotcha = await fs.readFile(path.join(tmp, '.aioson/learnings/gotchas/openclaw-csp-iframe.md'), 'utf8');
    assert.match(gotcha, /type: gotcha/);
    assert.match(gotcha, /category: gotchas/);
    assert.match(gotcha, /# OpenClaw CSP iframe/);
    await fs.access(path.join(tmp, '.aioson/learnings/recipes/paperclip-postgres-orphan.md'));
    const index = await fs.readFile(path.join(tmp, '.aioson/learnings/INDEX.md'), 'utf8');
    assert.match(index, /# Project Learnings/);
    assert.ok(index.indexOf('gotchas/openclaw') < index.indexOf('recipes/paperclip'), 'gotchas listed before recipes');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    db.close();
  }
});

test('materialize: idempotent — re-run with same updated_at skips writes (BR-CTPK-03)', async () => {
  const db = dbWithLearningsTable();
  seedLearning(db, { id: 'l1', title: 'stable gotcha', kind: 'gotcha', updated_at: '2026-05-02T00:00:00Z' });
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ctpk-idem-'));
  try {
    assert.equal(materializeLearnings({ db, targetDir: tmp }).written, 1);
    const second = materializeLearnings({ db, targetDir: tmp });
    assert.equal(second.written, 0);
    assert.equal(second.skipped, 1);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    db.close();
  }
});

test('materialize: newer row updated_at triggers a rewrite', async () => {
  const db = dbWithLearningsTable();
  seedLearning(db, { id: 'l1', title: 'evolving gotcha', kind: 'gotcha', updated_at: '2026-05-02T00:00:00Z' });
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ctpk-upd-'));
  try {
    materializeLearnings({ db, targetDir: tmp });
    db.prepare("UPDATE project_learnings SET updated_at = '2026-05-09T00:00:00Z' WHERE learning_id = 'l1'").run();
    assert.equal(materializeLearnings({ db, targetDir: tmp }).written, 1);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    db.close();
  }
});

test('materialize: no active learnings + no dir is a true no-op (EC-CTPK-02)', async () => {
  const db = dbWithLearningsTable();
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ctpk-noop-'));
  try {
    const res = materializeLearnings({ db, targetDir: tmp });
    assert.equal(res.total, 0);
    assert.equal(fsSync.existsSync(path.join(tmp, '.aioson/learnings')), false);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    db.close();
  }
});

test('materialize: archived orphan removed; hand-authored file preserved (EC-CTPK-09)', async () => {
  const db = dbWithLearningsTable();
  seedLearning(db, { id: 'l1', title: 'will be archived', kind: 'gotcha', updated_at: '2026-05-02T00:00:00Z' });
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ctpk-orphan-'));
  try {
    materializeLearnings({ db, targetDir: tmp });
    const userFile = path.join(tmp, '.aioson/learnings/gotchas/hand-written.md');
    await fs.writeFile(userFile, '# manual note\nno frontmatter learning_id here\n', 'utf8');
    db.prepare("UPDATE project_learnings SET status = 'archived' WHERE learning_id = 'l1'").run();
    const res = materializeLearnings({ db, targetDir: tmp });
    assert.equal(res.removed, 1);
    assert.equal(fsSync.existsSync(path.join(tmp, '.aioson/learnings/gotchas/will-be-archived.md')), false);
    await fs.access(userFile); // user-authored file untouched
  } finally {
    await fs.rm(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    db.close();
  }
});

// ─────────────────── Slice 4: M5 import-from-claude ───────────────────

async function makeClaudeMemoryFixture() {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ctpk-claude-'));
  const projectDir = path.join(tmp, 'project');
  const homeDir = path.join(tmp, 'home');
  const hash = 'C--dev-aioson-play';
  const memoryDir = path.join(homeDir, '.claude', 'projects', hash, 'memory');
  await fs.mkdir(memoryDir, { recursive: true });
  await fs.mkdir(projectDir, { recursive: true });
  await fs.writeFile(path.join(memoryDir, 'MEMORY.md'), `# Claude Memory

- [OpenClaw CSP iframe](openclaw_iframe_csp_patch.md)
- [External apps orphan processes Windows](external_apps_orphan_processes_windows.md)
- [Tone preference](operator_preference.md)
`, 'utf8');
  await fs.writeFile(path.join(memoryDir, 'openclaw_iframe_csp_patch.md'), `---
source: claude
---
# OpenClaw CSP iframe

OpenClaw 2026.5.19 sends X-Frame-Options and CSP frame-ancestors hardcoded, so the naive iframe assumption fails.
`, 'utf8');
  await fs.writeFile(path.join(memoryDir, 'external_apps_orphan_processes_windows.md'), `# External apps orphan processes Windows

Symptom: postgres remains alive after the app exits.
Root cause: Windows child processes can become orphan processes.
Fix: cleanup with Stop-Process before relaunch.
`, 'utf8');
  await fs.writeFile(path.join(memoryDir, 'operator_preference.md'), `# Tone preference

My preference: always respond in a concise style.
`, 'utf8');
  return { tmp, projectDir, homeDir, hash };
}

function silentLogger() {
  return { lines: [], log(line) { this.lines.push(String(line)); }, error(line) { this.lines.push(String(line)); } };
}

test('import-from-claude: dry-run lists candidates without mutating runtime DB', async () => {
  const fixture = await makeClaudeMemoryFixture();
  try {
    const res = await runLearning({
      args: [fixture.projectDir],
      options: {
        sub: 'import-from-claude',
        'project-hash': fixture.hash,
        'claude-home': fixture.homeDir,
        'dry-run': true
      },
      logger: silentLogger(),
      t: (k) => k
    });
    assert.equal(res.ok, true);
    assert.equal(res.dryRun, true);
    assert.equal(res.promoted, 0);
    assert.deepEqual(res.candidates.map((c) => c.kind), ['gotcha', 'resolution', null]);
    assert.equal(fsSync.existsSync(path.join(fixture.projectDir, '.aioson/runtime/aios.sqlite')), false);
  } finally {
    await fs.rm(fixture.tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
});

test('import-from-claude: selected technical candidates promote through project_learnings', async () => {
  const fixture = await makeClaudeMemoryFixture();
  try {
    const res = await runLearning({
      args: [fixture.projectDir],
      options: {
        sub: 'import-from-claude',
        'project-hash': fixture.hash,
        'claude-home': fixture.homeDir,
        select: '1,2,3'
      },
      logger: silentLogger(),
      t: (k) => k
    });
    assert.equal(res.ok, true);
    assert.equal(res.promoted.length, 2);
    assert.equal(res.skipped.length, 1);

    const db = new Database(path.join(fixture.projectDir, '.aioson/runtime/aios.sqlite'));
    try {
      const rows = db.prepare('SELECT title, type, kind, evidence, source_session FROM project_learnings ORDER BY kind').all();
      assert.equal(rows.length, 2);
      assert.deepEqual(rows.map((r) => [r.type, r.kind]), [['quality', 'gotcha'], ['quality', 'resolution']]);
      assert.match(rows[0].evidence, /X-Frame-Options/);
      assert.match(rows[1].evidence, /Stop-Process/);
      assert.match(rows[0].source_session, /^claude-memory:C--dev-aioson-play:/);
    } finally {
      db.close();
    }
  } finally {
    await fs.rm(fixture.tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
});
