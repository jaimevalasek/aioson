'use strict';

/**
 * Active Learning Loop — schema migration runner.
 *
 * Idempotent. Safe to call on every openRuntimeDb. Each phase appends steps
 * to runMigration. All steps use IF NOT EXISTS or guards so legacy v1.x DBs
 * (AC-ALL-103) acquire new structures without ALTER on existing columns.
 *
 * Phase 1: partial index over execution_events for context:load queries.
 * Phase 2: FTS5 virtual table over project_learnings + 3 sync triggers + backfill.
 * Phase 3: validity-window columns on evolution_log + 3 indexes.
 */

// Phase 3 — evolution_log validity-window columns (requirements § M1).
// ALTER TABLE ... ADD COLUMN is O(1) on SQLite ≥3.25 and preserves legacy rows
// (existing squad-learning entries keep event_type=NULL, interpreted as
// 'legacy_squad' by convention). CHECKs are enforced in application code, not in
// the schema, because SQLite does not support ALTER TABLE ADD CONSTRAINT.
const PHASE3_COLUMNS = [
  'event_type TEXT',
  'target_type TEXT',
  'target_id TEXT',
  'start_at TEXT',
  'end_at TEXT',
  'reason TEXT',
  'actor TEXT',
  'feature_slug TEXT',
  'payload_json TEXT'
];

const PHASE3_INDEXES = [
  `CREATE INDEX IF NOT EXISTS idx_evolution_log_target
     ON evolution_log(target_type, target_id)`,
  `CREATE INDEX IF NOT EXISTS idx_evolution_log_active
     ON evolution_log(target_type, target_id, end_at)
     WHERE end_at IS NULL`,
  `CREATE INDEX IF NOT EXISTS idx_evolution_log_feature
     ON evolution_log(feature_slug, event_type)`
];

function listColumns(db, table) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all();
  return new Set(rows.map((r) => r.name));
}

const PHASE2_STEPS = [
  // FTS5 virtual table — external content over project_learnings.
  // FTS5 columns kept minimal (title, evidence) per requirements § E1; remaining
  // metadata (target_type, target_id, feature_slug, status) is JOINed at query
  // time. content_rowid='rowid' binds the FTS5 entries to the source table.
  `CREATE VIRTUAL TABLE IF NOT EXISTS project_learnings_fts USING fts5(
     title,
     evidence,
     content='project_learnings',
     content_rowid='rowid',
     tokenize='unicode61 remove_diacritics 2'
   )`,
  // Sync triggers — transactional (BR-ALL-07). 'delete' command on FTS5
  // contentless/external tables removes the entry without storing content.
  `CREATE TRIGGER IF NOT EXISTS project_learnings_ai
   AFTER INSERT ON project_learnings BEGIN
     INSERT INTO project_learnings_fts(rowid, title, evidence)
     VALUES (new.rowid, new.title, new.evidence);
   END`,
  `CREATE TRIGGER IF NOT EXISTS project_learnings_ad
   AFTER DELETE ON project_learnings BEGIN
     INSERT INTO project_learnings_fts(project_learnings_fts, rowid, title, evidence)
     VALUES ('delete', old.rowid, old.title, old.evidence);
   END`,
  `CREATE TRIGGER IF NOT EXISTS project_learnings_au
   AFTER UPDATE ON project_learnings BEGIN
     INSERT INTO project_learnings_fts(project_learnings_fts, rowid, title, evidence)
     VALUES ('delete', old.rowid, old.title, old.evidence);
     INSERT INTO project_learnings_fts(rowid, title, evidence)
     VALUES (new.rowid, new.title, new.evidence);
   END`
];

// PRAGMA user_version sentinel — set once after the migration completes so
// that subsequent `openRuntimeDb` calls (which invoke this function on every
// open) skip the IF NOT EXISTS / PRAGMA table_info probes. Bump this constant
// when a new Phase adds steps to runMigration; the next call against an older
// DB will then re-run all idempotent steps and update the sentinel.
const SCHEMA_VERSION = 3;

function readUserVersion(db) {
  const row = db.prepare('PRAGMA user_version').get();
  if (!row) return 0;
  // sqlite returns { user_version: N }
  return Number(row.user_version || 0);
}

function runMigration(db) {
  if (!db || typeof db.exec !== 'function') {
    throw new Error('runMigration requires an open better-sqlite3 database handle');
  }

  // Fast path: if the DB already carries the current schema version, skip the
  // idempotent probes. Saves ~100ms p99 on tight `openRuntimeDb` loops.
  const currentVersion = readUserVersion(db);
  if (currentVersion >= SCHEMA_VERSION) return;

  // Phase 1 — partial index over execution_events for context:load lookups.
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_execution_events_context_load
    ON execution_events(event_type, agent_name)
    WHERE event_type IN ('rule_loaded', 'brain_loaded');
  `);

  // Phase 2 — FTS5 + triggers. Requires the project_learnings source table to
  // already exist. In the live openRuntimeDb flow that is guaranteed (CREATE TABLE
  // runs before this migration). Synthetic legacy-DB fixtures may not have it; skip
  // gracefully in that case so AC-ALL-103 (v1.x compatibility) still holds.
  const hasProjectLearnings = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='project_learnings'")
    .get();

  if (hasProjectLearnings) {
    for (const stmt of PHASE2_STEPS) {
      db.exec(stmt);
    }

    // Backfill guarded by count check — runs once when FTS5 is fresh.
    const fts = db.prepare('SELECT COUNT(*) AS c FROM project_learnings_fts').get();
    if (fts && Number(fts.c) === 0) {
      const src = db.prepare('SELECT COUNT(*) AS c FROM project_learnings').get();
      if (src && Number(src.c) > 0) {
        db.exec(`
          INSERT INTO project_learnings_fts(rowid, title, evidence)
          SELECT rowid, title, evidence FROM project_learnings
        `);
      }
    }
  }

  // Phase 3 — evolution_log validity-window columns + 3 indexes.
  // The squad-learning evolution_log table is created earlier in
  // runtime-store.js#ensureLegacyColumns, so we can ALTER it directly.
  // Synthetic legacy fixtures may not have the table — skip in that case so
  // AC-ALL-103 (v1.x compatibility) still holds.
  const hasEvolutionLog = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='evolution_log'")
    .get();

  if (hasEvolutionLog) {
    const existing = listColumns(db, 'evolution_log');
    for (const colSpec of PHASE3_COLUMNS) {
      const colName = colSpec.split(/\s+/)[0];
      if (!existing.has(colName)) {
        db.exec(`ALTER TABLE evolution_log ADD COLUMN ${colSpec}`);
      }
    }
    for (const stmt of PHASE3_INDEXES) {
      db.exec(stmt);
    }
  }

  // Stamp the sentinel so subsequent opens take the fast path.
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}

module.exports = { runMigration };
