'use strict';

/**
 * operator-memory — storage tree + _index.sqlite (Phase 1, v1.12.0).
 *
 * Markdown is source-of-truth (PMD-AN-06); SQLite is regenerable index (FTS5).
 * Phase 1 creates the schema (operators + decisions_fts virtual table). Phase 2
 * activates FTS5 mirroring from op:capture/op:promote.
 *
 * Storage tree (architecture-operator-memory.md § Storage architecture):
 *   ~/.aioson/operators/
 *   ├── _index.sqlite          shared across identities (PMD-01 hybrid)
 *   └── {identity}/
 *       ├── decisions/         Phase 2 populates
 *       ├── proposals/         Phase 2 populates
 *       └── history/           Phase 2+5 populates
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const Database = require('better-sqlite3');

const ROOT_DIR_NAME = '.aioson';
const OPERATORS_SUBDIR = 'operators';
const INDEX_DB_FILE = '_index.sqlite';
const SCHEMA_VERSION = 1;

function getRootDir() {
  return path.join(os.homedir(), ROOT_DIR_NAME, OPERATORS_SUBDIR);
}

function getStorageRoot(identity) {
  if (typeof identity !== 'string' || identity === '') {
    throw new Error('getStorageRoot: identity must be a non-empty string');
  }
  return path.join(getRootDir(), identity);
}

function getIndexDbPath() {
  return path.join(getRootDir(), INDEX_DB_FILE);
}

function ensureStorageTree(identity) {
  const root = getStorageRoot(identity);
  fs.mkdirSync(path.join(root, 'decisions'), { recursive: true });
  fs.mkdirSync(path.join(root, 'proposals'), { recursive: true });
  fs.mkdirSync(path.join(root, 'history'), { recursive: true });
  return root;
}

function migrateIndexSchema(db) {
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY
    );

    CREATE TABLE IF NOT EXISTS operators (
      identity       TEXT PRIMARY KEY,
      created_at     TEXT NOT NULL,
      source         TEXT NOT NULL,
      last_active_at TEXT NOT NULL
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS decisions_fts USING fts5(
      identity        UNINDEXED,
      slug            UNINDEXED,
      signal_type,
      category,
      body,
      last_reinforced UNINDEXED,
      tokenize = 'porter'
    );

    CREATE INDEX IF NOT EXISTS idx_operators_last_active
      ON operators(last_active_at);
  `);

  const existing = db.prepare('SELECT version FROM schema_version LIMIT 1').get();
  if (!existing) {
    db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(SCHEMA_VERSION);
  }
}

function openIndexDb() {
  const rootDir = getRootDir();
  fs.mkdirSync(rootDir, { recursive: true });
  const dbPath = getIndexDbPath();
  const db = new Database(dbPath);
  migrateIndexSchema(db);
  return db;
}

function recordIdentityActivity(db, { identity, source }) {
  const now = new Date().toISOString();
  const existing = db.prepare('SELECT identity FROM operators WHERE identity = ?').get(identity);
  if (existing) {
    db.prepare('UPDATE operators SET last_active_at = ? WHERE identity = ?').run(now, identity);
  } else {
    db.prepare(
      'INSERT INTO operators (identity, created_at, source, last_active_at) VALUES (?, ?, ?, ?)'
    ).run(identity, now, source, now);
  }
}

module.exports = {
  getRootDir,
  getStorageRoot,
  getIndexDbPath,
  ensureStorageTree,
  openIndexDb,
  migrateIndexSchema,
  recordIdentityActivity,
  SCHEMA_VERSION,
  INDEX_DB_FILE,
  ROOT_DIR_NAME,
  OPERATORS_SUBDIR
};
