'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const Database = require('better-sqlite3');

const SEARCH_DIR = path.join(os.homedir(), '.aioson', 'search');
const DB_FILE = 'context-search.sqlite';
const SCHEMA_VERSION = 1;
const MAX_STALE_MS = 24 * 60 * 60 * 1000; // 24h

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

function openDb(dbPath) {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  // Wait up to 5s for a transient lock (e.g. WAL checkpoint, AV file-lock on
  // Windows) instead of throwing SQLITE_BUSY immediately.
  db.pragma('busy_timeout = 5000');
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER NOT NULL
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS docs USING fts5(
      rel_path,
      title,
      content,
      tokenize = "unicode61 remove_diacritics 2"
    );

    CREATE TABLE IF NOT EXISTS docs_meta (
      rel_path TEXT PRIMARY KEY,
      project_dir TEXT NOT NULL,
      indexed_at TEXT NOT NULL,
      file_mtime TEXT,
      size INTEGER DEFAULT 0
    );
  `);

  // Insert schema version if not present
  const ver = db.prepare('SELECT version FROM schema_version LIMIT 1').get();
  if (!ver) {
    db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(SCHEMA_VERSION);
  }

  return db;
}

class IndexManager {
  constructor(searchDir) {
    this._dir = searchDir || SEARCH_DIR;
    this._db = null;
  }

  async open() {
    if (!this._db) {
      await ensureDir(this._dir);
      const dbPath = path.join(this._dir, DB_FILE);
      this._db = openDb(dbPath);
    }
    return this;
  }

  close() {
    if (this._db) {
      this._db.close();
      this._db = null;
    }
  }

  /**
   * Index all markdown/text files in a directory.
   * @param {string} dir  — absolute path to index
   * @param {object} opts — { extensions?, force? }
   * @returns {{ indexed: number, skipped: number }}
   */
  async indexDirectory(dir, opts = {}) {
    const extensions = opts.extensions || ['.md', '.txt', '.json'];
    const force = Boolean(opts.force);
    let indexed = 0;
    let skipped = 0;

    const files = await this._listFiles(dir, extensions);

    const insertDoc = this._db.prepare(
      'INSERT INTO docs (rel_path, title, content) VALUES (?, ?, ?)'
    );
    const insertMeta = this._db.prepare(`
      INSERT OR REPLACE INTO docs_meta (rel_path, project_dir, indexed_at, file_mtime, size)
      VALUES (?, ?, ?, ?, ?)
    `);
    const getMeta = this._db.prepare(
      'SELECT indexed_at, file_mtime FROM docs_meta WHERE rel_path = ?'
    );
    const deletePrev = this._db.prepare(
      "DELETE FROM docs WHERE rel_path = ?"
    );

    const doIndex = this._db.transaction((fileList) => {
      for (const { relPath, absPath } of fileList) {
        // Check staleness
        if (!force) {
          const meta = getMeta.get(relPath);
          if (meta) {
            skipped++;
            continue;
          }
        }

        let content = '';
        let size = 0;
        let mtime = '';

        try {
          // Synchronous read inside transaction
          const raw = require('node:fs').readFileSync(absPath, 'utf8');
          const stat = require('node:fs').statSync(absPath);
          content = raw.slice(0, 100_000); // cap at 100KB
          size = stat.size;
          mtime = stat.mtimeMs.toString();
        } catch {
          skipped++;
          continue;
        }

        const title = extractTitle(relPath, content);

        // Remove old entry if force
        if (force) {
          deletePrev.run(relPath);
        }

        insertDoc.run(relPath, title, content);
        insertMeta.run(relPath, dir, new Date().toISOString(), mtime, size);
        indexed++;
      }
    });

    doIndex(files);
    return { indexed, skipped };
  }

  /**
   * Full-text search with BM25 ranking + recency reranking.
   * @param {string} query
   * @param {object} opts — { limit?, agent?, goal?, projectDir? }
   * @returns {Array<{relPath, title, snippet, score}>}
   */
  search(query, opts = {}) {
    const limit = opts.limit || 10;
    const projectDir = opts.projectDir || null;

    if (!query || !query.trim()) return [];

    // Sanitize FTS5 query: escape special characters
    const safeQuery = sanitizeFtsQuery(query);

    let sql = `
      SELECT rel_path, title,
             snippet(docs, 2, '[', ']', '...', 20) AS snippet,
             rank AS bm25_score
      FROM docs
      WHERE docs MATCH ?
    `;
    const params = [safeQuery];

    if (projectDir) {
      sql += ` AND rel_path IN (SELECT rel_path FROM docs_meta WHERE project_dir = ?)`;
      params.push(projectDir);
    }

    sql += ` ORDER BY rank LIMIT ?`;
    params.push(limit * 2); // fetch more for reranking

    let rows;
    try {
      rows = this._db.prepare(sql).all(...params);
    } catch {
      return [];
    }

    // Rerank by recency
    const metas = new Map();
    if (rows.length > 0) {
      const relPaths = rows.map(r => r.rel_path);
      const placeholders = relPaths.map(() => '?').join(',');
      const metaRows = this._db.prepare(
        `SELECT rel_path, indexed_at, file_mtime FROM docs_meta WHERE rel_path IN (${placeholders})`
      ).all(...relPaths);
      for (const m of metaRows) {
        metas.set(m.rel_path, m);
      }
    }

    const now = Date.now();
    const results = rows.map(row => {
      const meta = metas.get(row.rel_path);
      let recencyBonus = 0;
      if (meta && meta.file_mtime) {
        const ageMs = now - Number(meta.file_mtime);
        const ageDays = ageMs / (1000 * 60 * 60 * 24);
        recencyBonus = Math.max(0, 1 - ageDays / 30); // fade over 30 days
      }
      // BM25 rank is negative in FTS5 (lower = better), invert it
      const bm25 = -(row.bm25_score || 0);
      const score = bm25 + recencyBonus * 0.5;
      return {
        relPath: row.rel_path,
        title: row.title,
        snippet: row.snippet || '',
        score
      };
    });

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  /**
   * Remove stale index entries older than maxAge ms.
   * @param {number} maxAge — milliseconds (default 24h)
   * @returns {{ removed: number }}
   */
  invalidateStale(maxAge = MAX_STALE_MS) {
    const cutoff = new Date(Date.now() - maxAge + 1).toISOString();
    const stale = this._db.prepare(
      'SELECT rel_path FROM docs_meta WHERE indexed_at < ?'
    ).all(cutoff);

    if (stale.length === 0) return { removed: 0 };

    const doRemove = this._db.transaction((rows) => {
      const delDoc = this._db.prepare("DELETE FROM docs WHERE rel_path = ?");
      const delMeta = this._db.prepare('DELETE FROM docs_meta WHERE rel_path = ?');
      for (const row of rows) {
        delDoc.run(row.rel_path);
        delMeta.run(row.rel_path);
      }
    });

    doRemove(stale);
    return { removed: stale.length };
  }

  /**
   * Return index statistics.
   * @returns {{ totalDocs: number, totalSize: number, dbPath: string }}
   */
  stats() {
    const { totalDocs } = this._db.prepare(
      'SELECT COUNT(*) AS totalDocs FROM docs_meta'
    ).get();
    const { totalSize } = this._db.prepare(
      'SELECT COALESCE(SUM(size), 0) AS totalSize FROM docs_meta'
    ).get();
    const dbPath = path.join(this._dir, DB_FILE);
    return { totalDocs, totalSize, dbPath };
  }

  async _listFiles(dir, extensions) {
    const results = [];
    await walkDir(dir, extensions, results, dir);
    return results;
  }
}

async function walkDir(dir, extensions, results, baseDir) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    // Skip hidden dirs and node_modules
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;

    const absPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      await walkDir(absPath, extensions, results, baseDir);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (extensions.includes(ext)) {
        const relPath = path.relative(baseDir, absPath);
        results.push({ relPath, absPath });
      }
    }
  }
}

function extractTitle(relPath, content) {
  // Try first H1 heading
  const match = content.match(/^#\s+(.+)$/m);
  if (match) return match[1].trim();
  // Fallback: filename without extension
  return path.basename(relPath, path.extname(relPath));
}

function sanitizeFtsQuery(query) {
  // Remove FTS5 special chars that could cause parse errors
  return query
    .replace(/["*^()]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .join(' ');
}

/**
 * Convenience: open a global IndexManager, use it, close it.
 */
async function withIndex(fn, searchDir) {
  const idx = new IndexManager(searchDir);
  await idx.open();
  try {
    return await fn(idx);
  } finally {
    idx.close();
  }
}

module.exports = { IndexManager, withIndex, sanitizeFtsQuery };
