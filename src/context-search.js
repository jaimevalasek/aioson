'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const Database = require('better-sqlite3');
const { parseFrontmatter, parseAgentList } = require('./preflight-engine');
const { pathMatchesPattern: selectorPathMatchesPattern } = require('./context-selector');

const SEARCH_DIR = path.join(os.homedir(), '.aioson', 'search');
const DB_FILE = 'context-search.sqlite';
const SCHEMA_VERSION = 3;
const MAX_STALE_MS = 24 * 60 * 60 * 1000; // 24h
const CONTENT_LIMIT = 100_000;
const SEARCH_RESULT_MULTIPLIER = 6;

const SKIP_DIR_NAMES = new Set([
  '.git',
  '.hg',
  '.svn',
  'node_modules',
  'vendor',
  'dist',
  'build',
  'coverage',
  '.next',
  '.nuxt'
]);

const SKIP_REL_DIRS = [
  '.aioson/agents',
  '.aioson/backups',
  '.aioson/locales',
  '.aioson/mcp',
  '.aioson/runtime',
  '.aioson/tmp',
  '.aioson/.cache'
];

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
  `);

  ensureSearchTables(db);
  ensureMetaSchema(db);

  // Insert schema version if not present
  const ver = db.prepare('SELECT version FROM schema_version LIMIT 1').get();
  if (!ver) {
    db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(SCHEMA_VERSION);
  } else if (Number(ver.version) < SCHEMA_VERSION) {
    db.prepare('UPDATE schema_version SET version = ?').run(SCHEMA_VERSION);
  }

  return db;
}

function ensureSearchTables(db) {
  const docsColumns = tableColumns(db, 'docs');
  const metaColumns = tableColumns(db, 'docs_meta');
  const docsNeedRebuild = docsColumns.length > 0 && !docsColumns.some((column) => column.name === 'project_dir');
  const metaNeedRebuild = metaColumns.length > 0 && !hasCompositeProjectPathPrimaryKey(metaColumns);

  if (docsNeedRebuild || metaNeedRebuild) {
    db.exec('DROP TABLE IF EXISTS docs');
    db.exec('DROP TABLE IF EXISTS docs_meta');
  }

  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS docs USING fts5(
      project_dir UNINDEXED,
      rel_path,
      title,
      content,
      tokenize = "unicode61 remove_diacritics 2"
    );

    CREATE TABLE IF NOT EXISTS docs_meta (
      project_dir TEXT NOT NULL,
      rel_path TEXT NOT NULL,
      indexed_at TEXT NOT NULL,
      file_mtime TEXT,
      size INTEGER DEFAULT 0,
      PRIMARY KEY (project_dir, rel_path)
    );
  `);
}

function tableColumns(db, tableName) {
  try {
    return db.prepare(`PRAGMA table_info(${tableName})`).all();
  } catch {
    return [];
  }
}

function hasCompositeProjectPathPrimaryKey(columns) {
  const primaryKey = columns
    .filter((column) => Number(column.pk) > 0)
    .sort((a, b) => Number(a.pk) - Number(b.pk))
    .map((column) => column.name);
  return primaryKey.length === 2
    && primaryKey[0] === 'project_dir'
    && primaryKey[1] === 'rel_path';
}

function ensureMetaSchema(db) {
  const existing = new Set(tableColumns(db, 'docs_meta').map((column) => column.name));
  const columns = [
    ['source_type', "source_type TEXT DEFAULT ''"],
    ['description', "description TEXT DEFAULT ''"],
    ['agents', "agents TEXT DEFAULT ''"],
    ['modes', "modes TEXT DEFAULT ''"],
    ['task_types', "task_types TEXT DEFAULT ''"],
    ['triggers', "triggers TEXT DEFAULT ''"],
    ['aliases', "aliases TEXT DEFAULT ''"],
    ['entities', "entities TEXT DEFAULT ''"],
    ['paths', "paths TEXT DEFAULT ''"],
    ['retrieval_intents', "retrieval_intents TEXT DEFAULT ''"],
    ['load_tier', "load_tier TEXT DEFAULT ''"],
    ['priority', 'priority INTEGER DEFAULT 0']
  ];

  for (const [name, ddl] of columns) {
    if (!existing.has(name)) {
      db.exec(`ALTER TABLE docs_meta ADD COLUMN ${ddl}`);
    }
  }
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
      try {
        this._db.pragma('wal_checkpoint(TRUNCATE)');
      } catch {
        // best effort only
      }
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
    const baseDir = path.resolve(dir);
    let indexed = 0;
    let skipped = 0;

    const files = await this._listFiles(baseDir, extensions);
    this._purgeSkippedEntries(baseDir);
    this._purgeDeletedEntries(baseDir, new Set(files.map((file) => file.relPath)));

    const insertDoc = this._db.prepare(
      'INSERT INTO docs (project_dir, rel_path, title, content) VALUES (?, ?, ?, ?)'
    );
    const insertMeta = this._db.prepare(`
      INSERT OR REPLACE INTO docs_meta (
        project_dir,
        rel_path,
        indexed_at,
        file_mtime,
        size,
        source_type,
        description,
        agents,
        modes,
        task_types,
        triggers,
        aliases,
        entities,
        paths,
        retrieval_intents,
        load_tier,
        priority
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const getMeta = this._db.prepare(
      'SELECT indexed_at, file_mtime FROM docs_meta WHERE rel_path = ? AND project_dir = ?'
    );
    const deletePrev = this._db.prepare(
      'DELETE FROM docs WHERE project_dir = ? AND rel_path = ?'
    );

    const doIndex = this._db.transaction((fileList) => {
      for (const { relPath, absPath } of fileList) {
        let content = '';
        let size = 0;
        let mtime = '';
        let stat;

        try {
          stat = require('node:fs').statSync(absPath);
          size = stat.size;
          mtime = stat.mtimeMs.toString();
        } catch {
          skipped++;
          continue;
        }

        if (!force) {
          const meta = getMeta.get(relPath, baseDir);
          if (meta && meta.file_mtime === mtime) {
            skipped++;
            continue;
          }
        }

        try {
          // Synchronous read inside transaction
          const raw = require('node:fs').readFileSync(absPath, 'utf8');
          content = raw.slice(0, CONTENT_LIMIT);
        } catch {
          skipped++;
          continue;
        }

        const metadata = extractMetadata(relPath, content);

        deletePrev.run(baseDir, relPath);

        insertDoc.run(baseDir, relPath, metadata.title, metadata.searchText);
        insertMeta.run(
          baseDir,
          relPath,
          new Date().toISOString(),
          mtime,
          size,
          metadata.source_type,
          metadata.description,
          metadata.agents.join(','),
          metadata.modes.join(','),
          metadata.task_types.join(','),
          metadata.triggers.join(','),
          metadata.aliases.join(','),
          metadata.entities.join(','),
          metadata.paths.join(','),
          metadata.retrieval_intents.join(','),
          metadata.load_tier,
          metadata.priority
        );
        indexed++;
      }
    });

    doIndex(files);
    return { indexed, skipped };
  }

  _purgeSkippedEntries(projectDir) {
    const rows = this._db.prepare(
      'SELECT rel_path FROM docs_meta WHERE project_dir = ?'
    ).all(projectDir);
    const skipped = rows.filter((row) => matchesSkippedRelDir(row.rel_path));
    if (skipped.length === 0) return;

    const purge = this._db.transaction((items) => {
      const delDoc = this._db.prepare('DELETE FROM docs WHERE project_dir = ? AND rel_path = ?');
      const delMeta = this._db.prepare('DELETE FROM docs_meta WHERE project_dir = ? AND rel_path = ?');
      for (const item of items) {
        delDoc.run(projectDir, item.rel_path);
        delMeta.run(projectDir, item.rel_path);
      }
    });
    purge(skipped);
  }

  _purgeDeletedEntries(projectDir, currentRelPaths) {
    const rows = this._db.prepare(
      'SELECT rel_path FROM docs_meta WHERE project_dir = ?'
    ).all(projectDir);
    const deleted = rows.filter((row) => !currentRelPaths.has(row.rel_path));
    if (deleted.length === 0) return;

    const purge = this._db.transaction((items) => {
      const delDoc = this._db.prepare('DELETE FROM docs WHERE project_dir = ? AND rel_path = ?');
      const delMeta = this._db.prepare('DELETE FROM docs_meta WHERE project_dir = ? AND rel_path = ?');
      for (const item of items) {
        delDoc.run(projectDir, item.rel_path);
        delMeta.run(projectDir, item.rel_path);
      }
    });
    purge(deleted);
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

    const rows = this._searchRows(query, {
      limit: limit * 2,
      projectDir
    });

    const now = Date.now();
    const results = rows.map(row => {
      let recencyBonus = 0;
      if (row.file_mtime) {
        const ageMs = now - Number(row.file_mtime);
        const ageDays = ageMs / (1000 * 60 * 60 * 24);
        recencyBonus = Math.max(0, 1 - ageDays / 30); // fade over 30 days
      }
      // BM25 rank is negative in FTS5 (lower = better), invert it
      const bm25 = -(row.bm25_score || 0);
      const score = bm25 + recencyBonus * 0.5;
      return {
        projectDir: row.project_dir || '',
        relPath: row.rel_path,
        title: row.title,
        snippet: row.snippet || '',
        score,
        source_type: row.source_type || '',
        load_tier: row.load_tier || ''
      };
    });

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  /**
   * Search broad project context and return a load-oriented package.
   *
   * context:search is intentionally permissive: agent, mode, source and intent
   * are ranking signals, not hard filters. context:select remains the final
   * strict selector before loading files into an agent prompt.
   *
   * @param {string} query
   * @param {object} opts
   * @returns {{query:string, results:Array, package:{must_read:Array, should_read:Array, maybe:Array}}}
   */
  searchPackage(query, opts = {}) {
    const limit = Number(opts.limit) || 10;
    const projectDir = opts.projectDir || null;
    const searchInput = buildSearchInput(query, opts);

    if (!searchInput.trim()) {
      return emptyPackage(query);
    }

    const rows = this._searchRows(searchInput, {
      limit: Math.max(limit * SEARCH_RESULT_MULTIPLIER, 30),
      projectDir
    });

    const context = buildRankingContext(query, opts);
    const results = dedupeRankedResults(rows
      .map((row) => rankContextRow(row, context))
      .sort((a, b) => b.score - a.score || a.relPath.localeCompare(b.relPath)))
      .slice(0, limit);

    return {
      query,
      search_input: searchInput,
      results,
      package: bucketResults(results)
    };
  }

  _searchRows(query, opts = {}) {
    const safeQuery = buildFtsQuery(query);
    if (!safeQuery) return [];

    let sql = `
      SELECT
        docs.project_dir,
        docs.rel_path,
        docs.title,
        snippet(docs, 2, '[', ']', '...', 20) AS snippet,
        rank AS bm25_score,
        docs_meta.indexed_at,
        docs_meta.file_mtime,
        docs_meta.source_type,
        docs_meta.description,
        docs_meta.agents,
        docs_meta.modes,
        docs_meta.task_types,
        docs_meta.triggers,
        docs_meta.aliases,
        docs_meta.entities,
        docs_meta.paths,
        docs_meta.retrieval_intents,
        docs_meta.load_tier,
        docs_meta.priority
      FROM docs
      LEFT JOIN docs_meta
        ON docs.project_dir = docs_meta.project_dir
        AND docs.rel_path = docs_meta.rel_path
      WHERE docs MATCH ?
    `;
    const params = [safeQuery];

    if (opts.projectDir) {
      sql += ` AND docs.project_dir = ?`;
      params.push(path.resolve(opts.projectDir));
    }

    sql += ` ORDER BY rank LIMIT ?`;
    params.push(Number(opts.limit) || 10);

    try {
      return this._db.prepare(sql).all(...params);
    } catch {
      return [];
    }
  }

  /**
   * Remove stale index entries older than maxAge ms.
   * @param {number} maxAge — milliseconds (default 24h)
   * @returns {{ removed: number }}
   */
  invalidateStale(maxAge = MAX_STALE_MS) {
    const cutoff = new Date(Date.now() - maxAge + 1).toISOString();
    const stale = this._db.prepare(
      'SELECT project_dir, rel_path FROM docs_meta WHERE indexed_at < ?'
    ).all(cutoff);

    if (stale.length === 0) return { removed: 0 };

    const doRemove = this._db.transaction((rows) => {
      const delDoc = this._db.prepare('DELETE FROM docs WHERE project_dir = ? AND rel_path = ?');
      const delMeta = this._db.prepare('DELETE FROM docs_meta WHERE project_dir = ? AND rel_path = ?');
      for (const row of rows) {
        delDoc.run(row.project_dir, row.rel_path);
        delMeta.run(row.project_dir, row.rel_path);
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
    const absPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (shouldSkipDirectory(absPath, entry.name, baseDir)) continue;
      await walkDir(absPath, extensions, results, baseDir);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (extensions.includes(ext)) {
        const relPath = normalizeRelPath(path.relative(baseDir, absPath));
        results.push({ relPath, absPath });
      }
    }
  }
}

function shouldSkipDirectory(absPath, dirName, baseDir) {
  if (SKIP_DIR_NAMES.has(dirName)) return true;
  if (dirName.startsWith('.') && dirName !== '.aioson') return true;

  const relPath = normalizeRelPath(path.relative(baseDir, absPath));
  if (!relPath) return false;
  return matchesSkippedRelDir(relPath);
}

function matchesSkippedRelDir(relPathValue) {
  const relPath = normalizeRelPath(relPathValue);
  return SKIP_REL_DIRS.some((skip) => (
    relPath === skip
    || relPath.startsWith(`${skip}/`)
    || relPath.endsWith(`/${skip}`)
    || relPath.includes(`/${skip}/`)
  ));
}

function extractTitle(relPath, content) {
  // Try first H1 heading
  const match = content.match(/^#\s+(.+)$/m);
  if (match) return match[1].trim();
  // Fallback: filename without extension
  return path.basename(relPath, path.extname(relPath));
}

function extractMetadata(relPath, content) {
  const fm = parseFrontmatter(content);
  const title = fm.title || fm.name || extractTitle(relPath, content);
  const description = fm.description || fm.summary || '';
  const sourceType = normalizeKey(fm.source_type || fm.sourceType || inferSourceType(relPath));
  const loadTier = normalizeKey(fm.load_tier || fm.loadTier || inferLoadTier(sourceType, relPath));
  const priority = Number.parseInt(fm.priority || '0', 10) || 0;

  const metadata = {
    title,
    description,
    source_type: sourceType,
    agents: parseAgentList(fm.agents) || [],
    modes: parseListValue(fm.modes),
    task_types: parseListValue(fm.task_types || fm.taskTypes),
    triggers: parseListValue(fm.triggers),
    aliases: parseListValue(fm.aliases || fm.alias),
    entities: parseListValue(fm.entities || fm.entity),
    paths: parseListValue(fm.paths || fm.globs),
    retrieval_intents: parseListValue(fm.retrieval_intents || fm.intents || fm.intent),
    load_tier: loadTier,
    priority
  };

  metadata.searchText = [
    relPath,
    title,
    description,
    sourceType,
    loadTier,
    metadata.agents.join(' '),
    metadata.modes.join(' '),
    metadata.task_types.join(' '),
    metadata.triggers.join(' '),
    metadata.aliases.join(' '),
    metadata.entities.join(' '),
    metadata.paths.join(' '),
    metadata.retrieval_intents.join(' '),
    stripFrontmatter(content)
  ].filter(Boolean).join('\n');

  return metadata;
}

function stripFrontmatter(content) {
  return String(content || '').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
}

function inferSourceType(relPath) {
  const normalized = normalizeRelPath(relPath).toLowerCase();
  if (normalized.includes('/.aioson/rules/') || normalized.startsWith('.aioson/rules/')) return 'rule';
  if (normalized.includes('/.aioson/docs/') || normalized.startsWith('.aioson/docs/')) return 'doc';
  if (normalized.includes('/.aioson/design-docs/') || normalized.startsWith('.aioson/design-docs/')) return 'design-governance';
  if (normalized.includes('/.aioson/skills/') || normalized.startsWith('.aioson/skills/')) return normalized.endsWith('/skill.md') ? 'skill' : 'skill-reference';
  if (normalized.includes('/.aioson/installed-skills/') || normalized.startsWith('.aioson/installed-skills/')) return normalized.endsWith('/skill.md') ? 'skill' : 'skill-reference';
  if (normalized.includes('/.aioson/context/bootstrap/') || normalized.startsWith('.aioson/context/bootstrap/')) return 'bootstrap';
  if (normalized.includes('/.aioson/context/features/') || normalized.startsWith('.aioson/context/features/')) return 'feature';
  if (normalized.includes('/.aioson/context/') || normalized.startsWith('.aioson/context/')) return 'context';
  if (normalized.includes('/.aioson/briefings/') || normalized.startsWith('.aioson/briefings/')) return 'briefing';
  if (normalized.startsWith('researchs/')) return 'research';
  if (normalized.startsWith('plans/')) return 'plan';
  if (normalized.startsWith('prds/')) return 'prd';
  return 'file';
}

function inferLoadTier(sourceType, relPath) {
  const normalized = normalizeRelPath(relPath).toLowerCase();
  const base = path.basename(normalized);
  if (base === 'project.context.md' || base === 'project-pulse.md') return 'always';
  if (sourceType === 'rule') return 'trigger';
  if (sourceType === 'skill') return 'skill';
  if (sourceType === 'bootstrap') return 'trigger';
  if (sourceType === 'feature' || sourceType === 'prd' || sourceType === 'plan') return 'feature';
  return 'reference';
}

function parseListValue(value) {
  if (Array.isArray(value)) {
    return value.map(String).map((item) => item.trim()).filter(Boolean);
  }
  if (value === undefined || value === null) return [];
  const raw = String(value).trim();
  if (!raw || raw === '[]') return [];
  if (raw.startsWith('[') && raw.endsWith(']')) {
    return raw
      .slice(1, -1)
      .split(',')
      .map((item) => item.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean);
  }
  return raw
    .split(',')
    .map((item) => item.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
}

function buildSearchInput(query, opts = {}) {
  const values = [
    query,
    opts.task,
    opts.goal,
    opts.paths,
    opts.path,
    opts.intent,
    opts.intents,
    opts.source,
    opts.sourceType,
    opts.source_type
  ];
  return values.flatMap(parseListValue).join(' ').trim();
}

function buildRankingContext(query, opts = {}) {
  const agent = normalizeKey(opts.agent || '');
  const mode = normalizeKey(opts.mode || '');
  const sourceTypes = parseListValue(opts.source || opts.sourceType || opts.source_type).map(normalizeKey);
  const intents = parseListValue(opts.intent || opts.intents || opts.retrieval_intents).map(normalizeToken);
  const paths = parseListValue(opts.paths || opts.path).map(normalizeRelPath);
  const task = [query, opts.task, opts.goal, paths.join(' '), intents.join(' ')].filter(Boolean).join(' ');

  return {
    agent,
    mode,
    sourceTypes,
    intents,
    paths,
    lookup: normalizeToken(task)
  };
}

function rankContextRow(row, context) {
  const reasons = [];
  const metadata = rowToMetadata(row);
  const bm25 = Math.max(0, -(Number(row.bm25_score) || 0));
  let score = 20 + bm25 * 10;

  if (metadata.priority) {
    score += Math.min(20, Math.max(0, metadata.priority));
    reasons.push(`priority:${metadata.priority}`);
  }

  if (metadata.source_type === 'rule') {
    score += 16;
    reasons.push('source:rule');
  } else if (metadata.source_type === 'skill' || metadata.source_type === 'skill-reference') {
    score += 10;
    reasons.push(`source:${metadata.source_type}`);
  } else if (metadata.source_type === 'bootstrap' || metadata.source_type === 'context') {
    score += 8;
    reasons.push(`source:${metadata.source_type}`);
  }

  if (context.sourceTypes.length > 0 && context.sourceTypes.includes(metadata.source_type)) {
    score += 14;
    reasons.push(`source-filter:${metadata.source_type}`);
  }

  if (context.agent) {
    if (metadata.agents.length === 0 || metadata.agents.includes('all')) {
      score += 4;
      reasons.push('agent:all');
    } else if (metadata.agents.map(normalizeKey).includes(context.agent)) {
      score += 14;
      reasons.push(`agent:${context.agent}`);
    } else {
      score -= 4;
      reasons.push('agent:mismatch-boost-only');
    }
  }

  if (context.mode) {
    if (metadata.modes.length === 0) {
      score += 2;
    } else if (metadata.modes.map(normalizeKey).includes(context.mode)) {
      score += 10;
      reasons.push(`mode:${context.mode}`);
    } else {
      score -= 3;
      reasons.push('mode:mismatch-boost-only');
    }
  }

  const boosts = [
    ['task_types', metadata.task_types, 18],
    ['triggers', metadata.triggers, 24],
    ['aliases', metadata.aliases, 24],
    ['entities', metadata.entities, 20],
    ['retrieval_intents', metadata.retrieval_intents, 18],
    ['paths', metadata.paths, 16]
  ];
  for (const [label, values, points] of boosts) {
    const matched = label === 'paths'
      ? pathMatches(context.paths, values)
      : keywordMatches(context.lookup, values);
    if (matched.length > 0) {
      score += points;
      reasons.push(`${label}:${matched.slice(0, 3).join(',')}`);
    }
  }

  if (context.intents.length > 0) {
    const matchedIntents = listIntersection(context.intents, metadata.retrieval_intents.map(normalizeToken));
    if (matchedIntents.length > 0) {
      score += 16;
      reasons.push(`intent:${matchedIntents.slice(0, 3).join(',')}`);
    }
  }

  if (metadata.description && phraseMatches(context.lookup, metadata.description)) {
    score += 10;
    reasons.push('description');
  }

  const confidence = Math.max(0.1, Math.min(0.99, score / 100));
  return {
    projectDir: row.project_dir || '',
    relPath: row.rel_path,
    path: row.rel_path,
    title: row.title,
    snippet: row.snippet || '',
    score: Number(score.toFixed(3)),
    confidence: Number(confidence.toFixed(2)),
    source_type: metadata.source_type,
    load_tier: metadata.load_tier,
    reason: reasons.length > 0 ? reasons.join('; ') : 'fts',
    metadata
  };
}

function rowToMetadata(row) {
  return {
    source_type: normalizeKey(row.source_type || 'file'),
    description: row.description || '',
    agents: parseListValue(row.agents).map(normalizeKey),
    modes: parseListValue(row.modes).map(normalizeKey),
    task_types: parseListValue(row.task_types),
    triggers: parseListValue(row.triggers),
    aliases: parseListValue(row.aliases),
    entities: parseListValue(row.entities),
    paths: parseListValue(row.paths),
    retrieval_intents: parseListValue(row.retrieval_intents),
    load_tier: normalizeKey(row.load_tier || ''),
    priority: Number.parseInt(row.priority || '0', 10) || 0
  };
}

function bucketResults(results) {
  const must = [];
  const should = [];
  const maybe = [];

  for (const result of results) {
    const hardRuleHit = result.source_type === 'rule'
      && /(?:task_types|triggers|aliases|entities|paths|retrieval_intents):/.test(result.reason);
    if (result.score >= 70 || hardRuleHit) {
      must.push(result);
    } else if (result.score >= 45) {
      should.push(result);
    } else {
      maybe.push(result);
    }
  }

  return {
    must_read: must,
    should_read: should,
    maybe
  };
}

function dedupeRankedResults(results) {
  const byKey = new Map();

  for (const result of results) {
    const key = canonicalResultKey(result);
    const current = byKey.get(key);
    byKey.set(key, preferResult(result, current));
  }

  return Array.from(byKey.values())
    .sort((a, b) => b.score - a.score || a.relPath.localeCompare(b.relPath));
}

function canonicalResultKey(result) {
  const relPath = normalizeRelPath(result.relPath || result.path).toLowerCase();
  const projectDir = normalizeRelPath(result.projectDir || result.project_dir || '').toLowerCase();
  const pathKey = relPath.startsWith('template/') ? relPath.slice('template/'.length) : relPath;
  return `${projectDir}\0${pathKey}`;
}

function preferResult(candidate, current) {
  if (!current) return candidate;

  const candidateTemplate = isTemplateMirror(candidate);
  const currentTemplate = isTemplateMirror(current);
  if (candidateTemplate !== currentTemplate) {
    return candidateTemplate ? current : candidate;
  }

  if (candidate.score > current.score) return candidate;
  return current;
}

function isTemplateMirror(result) {
  return normalizeRelPath(result.relPath || result.path).toLowerCase().startsWith('template/');
}

function emptyPackage(query) {
  return {
    query,
    search_input: '',
    results: [],
    package: {
      must_read: [],
      should_read: [],
      maybe: []
    }
  };
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

function buildFtsQuery(query) {
  const tokens = tokenizeQuery(query).slice(0, 32);
  if (tokens.length === 0) return '';
  return [...new Set(tokens)]
    .map((token) => `"${token.replace(/"/g, '')}"`)
    .join(' OR ');
}

function tokenizeQuery(value) {
  return normalizeToken(value)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

function keywordMatches(lookup, values) {
  const matches = [];
  for (const value of values) {
    if (phraseMatches(lookup, value)) matches.push(String(value));
  }
  return matches;
}

function phraseMatches(lookup, value) {
  const normalized = normalizeToken(value);
  if (!lookup || !normalized) return false;
  if (lookup.includes(normalized)) return true;
  const parts = normalized.split(/\s+/).filter(Boolean);
  return parts.length > 1 && parts.every((part) => lookup.includes(part));
}

function pathMatches(requestedPaths, patterns) {
  const matches = [];
  for (const requestedPath of requestedPaths) {
    for (const pattern of patterns) {
      if (pathPatternMatches(requestedPath, pattern)) {
        matches.push(`${requestedPath}~${pattern}`);
      }
    }
  }
  return matches;
}

function pathPatternMatches(filePath, pattern) {
  return selectorPathMatchesPattern(filePath, pattern);
}

function listIntersection(a, b) {
  const right = new Set(b);
  return a.filter((item) => right.has(item));
}

function normalizeRelPath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

function normalizeKey(value) {
  return normalizeToken(value).replace(/\s+/g, '-');
}

function normalizeToken(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[`*_]/g, '')
    .replace(/[^a-z0-9/-]+/g, ' ')
    .trim();
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

module.exports = {
  IndexManager,
  withIndex,
  sanitizeFtsQuery,
  buildFtsQuery,
  extractMetadata,
  inferSourceType
};
