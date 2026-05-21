'use strict';

/**
 * Neural Chain feature — Phase 1 schema migration.
 *
 * Adds chain_edges table + 3 indexes to .aioson/runtime/aios.sqlite per
 * requirements-neural-chain.md § New entities and fields.
 *
 * Idempotent (IF NOT EXISTS guards on every step). Safe to call on every
 * openRuntimeDb invocation. The 4 statements are all O(1) probes when the
 * schema already exists, so no PRAGMA user_version sentinel is used —
 * coordination with the existing learning-loop migration's user_version=3
 * would require a shared versioning table (deferred until multiple features
 * need migrations).
 *
 * Schema invariants enforced here:
 *   - edge_type ∈ {'git_co_edit', 'agent_event'}     (BR-NC-01 sources)
 *   - 0.0 ≤ confidence ≤ 1.0                          (BR-NC-01 formula range)
 *   - hit_count > 0                                   (BR-NC-07 ingest semantics)
 *   - source_path, target_path, edge_type uniqueness  (active rows only,
 *     allowing archive flow per BR-NC-08 hard cap enforcement)
 *
 * Invariants enforced by application code, not schema:
 *   - validity-window discipline (start_at always set; end_at NULL in M1)
 *   - hard cap 10k per source_path node (audit at ingest time)
 *   - confidence formula and combination (max not sum)
 */

const STEPS = [
  `CREATE TABLE IF NOT EXISTS chain_edges (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     source_path TEXT NOT NULL,
     target_path TEXT NOT NULL,
     edge_type TEXT NOT NULL CHECK (edge_type IN ('git_co_edit', 'agent_event')),
     confidence REAL NOT NULL CHECK (confidence >= 0.0 AND confidence <= 1.0),
     start_at TEXT NOT NULL,
     end_at TEXT,
     hit_count INTEGER NOT NULL DEFAULT 1 CHECK (hit_count > 0),
     last_seen_at TEXT NOT NULL,
     metadata TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS idx_chain_edges_source
     ON chain_edges(source_path, end_at)`,
  `CREATE INDEX IF NOT EXISTS idx_chain_edges_target
     ON chain_edges(target_path, end_at)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uniq_chain_active
     ON chain_edges(source_path, target_path, edge_type)
     WHERE end_at IS NULL`
];

function runMigration(db) {
  if (!db || typeof db.exec !== 'function') {
    throw new Error('runMigration requires an open better-sqlite3 database handle');
  }

  for (const stmt of STEPS) {
    db.exec(stmt);
  }
}

module.exports = { runMigration };
