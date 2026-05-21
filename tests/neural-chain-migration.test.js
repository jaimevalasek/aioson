'use strict';

// Neural Chain — Phase 1 Slice 1 (schema migration) acceptance tests.
// Covers chain_edges table creation + CHECK constraints + 3 indexes +
// partial uniqueness (active rows only) + idempotency.
//
// Maps to requirements-neural-chain.md § New entities and fields and to
// BR-NC-01 (confidence range), BR-NC-07 (validity-window active uniqueness),
// BR-NC-08 (archive flow allows new active edge for same combo).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { openRuntimeDb } = require('../src/runtime-store');
const { runMigration } = require('../src/neural-chain-migration');

async function makeTempProject() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-neural-chain-'));
  await fs.mkdir(path.join(dir, '.aioson', 'runtime'), { recursive: true });
  return dir;
}

function insertActiveEdge(db, row) {
  return db.prepare(`
    INSERT INTO chain_edges
      (source_path, target_path, edge_type, confidence, start_at, last_seen_at, hit_count, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    row.source_path,
    row.target_path,
    row.edge_type,
    row.confidence,
    row.start_at,
    row.last_seen_at,
    row.hit_count ?? 1,
    row.metadata ?? null
  );
}

test('chain_edges table is created on first openRuntimeDb', async () => {
  const dir = await makeTempProject();
  const { db } = await openRuntimeDb(dir);
  try {
    const row = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='chain_edges'"
    ).get();
    assert.ok(row, 'chain_edges table should exist');
    assert.equal(row.name, 'chain_edges');
  } finally {
    db.close();
  }
});

test('chain_edges has all required columns with correct nullability', async () => {
  const dir = await makeTempProject();
  const { db } = await openRuntimeDb(dir);
  try {
    const cols = db.prepare('PRAGMA table_info(chain_edges)').all();
    const byName = Object.fromEntries(cols.map((c) => [c.name, c]));

    assert.ok(byName.id && byName.id.pk === 1, 'id must be primary key');

    for (const required of ['source_path', 'target_path', 'edge_type', 'confidence', 'start_at', 'last_seen_at', 'hit_count']) {
      assert.ok(byName[required], `${required} column missing`);
      assert.equal(byName[required].notnull, 1, `${required} must be NOT NULL`);
    }

    assert.equal(byName.end_at.notnull, 0, 'end_at must be nullable (M1 always NULL)');
    assert.equal(byName.metadata.notnull, 0, 'metadata must be nullable');

    assert.equal(byName.confidence.type, 'REAL', 'confidence must be REAL');
    assert.equal(byName.hit_count.type, 'INTEGER', 'hit_count must be INTEGER');
  } finally {
    db.close();
  }
});

test('edge_type CHECK constraint accepts the 2 canonical values and rejects others', async () => {
  const dir = await makeTempProject();
  const { db } = await openRuntimeDb(dir);
  try {
    assert.doesNotThrow(() =>
      insertActiveEdge(db, {
        source_path: 'src/a.js',
        target_path: 'src/b.js',
        edge_type: 'git_co_edit',
        confidence: 0.5,
        start_at: '2026-05-21T00:00:00Z',
        last_seen_at: '2026-05-21T00:00:00Z'
      })
    );

    assert.doesNotThrow(() =>
      insertActiveEdge(db, {
        source_path: 'src/c.js',
        target_path: 'src/d.js',
        edge_type: 'agent_event',
        confidence: 0.8,
        start_at: '2026-05-21T00:00:00Z',
        last_seen_at: '2026-05-21T00:00:00Z'
      })
    );

    assert.throws(
      () =>
        insertActiveEdge(db, {
          source_path: 'src/e.js',
          target_path: 'src/f.js',
          edge_type: 'invalid_type',
          confidence: 0.5,
          start_at: '2026-05-21T00:00:00Z',
          last_seen_at: '2026-05-21T00:00:00Z'
        }),
      /CHECK constraint failed/i
    );
  } finally {
    db.close();
  }
});

test('confidence CHECK rejects values outside [0.0, 1.0] (BR-NC-01)', async () => {
  const dir = await makeTempProject();
  const { db } = await openRuntimeDb(dir);
  try {
    const baseRow = {
      source_path: 'src/a.js',
      target_path: 'src/b.js',
      edge_type: 'git_co_edit',
      start_at: '2026-05-21T00:00:00Z',
      last_seen_at: '2026-05-21T00:00:00Z'
    };

    assert.throws(
      () => insertActiveEdge(db, { ...baseRow, confidence: 1.5 }),
      /CHECK constraint failed/i,
      'confidence > 1.0 must be rejected'
    );
    assert.throws(
      () => insertActiveEdge(db, { ...baseRow, confidence: -0.1 }),
      /CHECK constraint failed/i,
      'confidence < 0.0 must be rejected'
    );

    assert.doesNotThrow(() => insertActiveEdge(db, { ...baseRow, confidence: 0.0 }));
    assert.doesNotThrow(() =>
      insertActiveEdge(db, { ...baseRow, target_path: 'src/c.js', confidence: 1.0 })
    );
  } finally {
    db.close();
  }
});

test('hit_count CHECK rejects 0 and negative (BR-NC-07 ingest semantics)', async () => {
  const dir = await makeTempProject();
  const { db } = await openRuntimeDb(dir);
  try {
    const baseRow = {
      source_path: 'src/a.js',
      target_path: 'src/b.js',
      edge_type: 'git_co_edit',
      confidence: 0.5,
      start_at: '2026-05-21T00:00:00Z',
      last_seen_at: '2026-05-21T00:00:00Z'
    };
    assert.throws(
      () => insertActiveEdge(db, { ...baseRow, hit_count: 0 }),
      /CHECK constraint failed/i
    );
    assert.throws(
      () => insertActiveEdge(db, { ...baseRow, hit_count: -1 }),
      /CHECK constraint failed/i
    );
  } finally {
    db.close();
  }
});

test('uniq_chain_active prevents duplicate active edges on same (source, target, type)', async () => {
  const dir = await makeTempProject();
  const { db } = await openRuntimeDb(dir);
  try {
    insertActiveEdge(db, {
      source_path: 'src/a.js',
      target_path: 'src/b.js',
      edge_type: 'git_co_edit',
      confidence: 0.5,
      start_at: '2026-05-21T00:00:00Z',
      last_seen_at: '2026-05-21T00:00:00Z'
    });

    assert.throws(
      () =>
        insertActiveEdge(db, {
          source_path: 'src/a.js',
          target_path: 'src/b.js',
          edge_type: 'git_co_edit',
          confidence: 0.7,
          start_at: '2026-05-21T01:00:00Z',
          last_seen_at: '2026-05-21T01:00:00Z'
        }),
      /UNIQUE constraint failed/i
    );
  } finally {
    db.close();
  }
});

test('different edge_type for same (source, target) coexists as active', async () => {
  const dir = await makeTempProject();
  const { db } = await openRuntimeDb(dir);
  try {
    // Combinação per BR-NC-01 (max c_git, c_event) presupõe que as duas arestas
    // podem coexistir simultaneamente — uma por tipo. O uniq index inclui
    // edge_type, então tipos diferentes não colidem.
    insertActiveEdge(db, {
      source_path: 'src/a.js',
      target_path: 'src/b.js',
      edge_type: 'git_co_edit',
      confidence: 0.5,
      start_at: '2026-05-21T00:00:00Z',
      last_seen_at: '2026-05-21T00:00:00Z'
    });
    assert.doesNotThrow(() =>
      insertActiveEdge(db, {
        source_path: 'src/a.js',
        target_path: 'src/b.js',
        edge_type: 'agent_event',
        confidence: 0.8,
        start_at: '2026-05-21T00:00:00Z',
        last_seen_at: '2026-05-21T00:00:00Z'
      })
    );

    const rows = db
      .prepare('SELECT count(*) AS c FROM chain_edges WHERE source_path = ? AND target_path = ?')
      .get('src/a.js', 'src/b.js');
    assert.equal(rows.c, 2);
  } finally {
    db.close();
  }
});

test('archived edges (end_at set) allow new active edge for same combo (BR-NC-08 archive flow)', async () => {
  const dir = await makeTempProject();
  const { db } = await openRuntimeDb(dir);
  try {
    insertActiveEdge(db, {
      source_path: 'src/a.js',
      target_path: 'src/b.js',
      edge_type: 'git_co_edit',
      confidence: 0.5,
      start_at: '2026-05-21T00:00:00Z',
      last_seen_at: '2026-05-21T00:00:00Z'
    });

    db.prepare(
      'UPDATE chain_edges SET end_at = ? WHERE source_path = ? AND target_path = ? AND edge_type = ?'
    ).run('2026-05-21T00:30:00Z', 'src/a.js', 'src/b.js', 'git_co_edit');

    assert.doesNotThrow(() =>
      insertActiveEdge(db, {
        source_path: 'src/a.js',
        target_path: 'src/b.js',
        edge_type: 'git_co_edit',
        confidence: 0.8,
        start_at: '2026-05-21T01:00:00Z',
        last_seen_at: '2026-05-21T01:00:00Z'
      })
    );

    const totals = db
      .prepare('SELECT count(*) AS c FROM chain_edges WHERE source_path = ? AND target_path = ?')
      .get('src/a.js', 'src/b.js');
    assert.equal(totals.c, 2, 'should have 1 archived + 1 active edge');

    const active = db
      .prepare(
        'SELECT count(*) AS c FROM chain_edges WHERE source_path = ? AND target_path = ? AND end_at IS NULL'
      )
      .get('src/a.js', 'src/b.js');
    assert.equal(active.c, 1, 'exactly 1 active edge after archive flow');
  } finally {
    db.close();
  }
});

test('the 3 indexes are created (source, target, partial unique)', async () => {
  const dir = await makeTempProject();
  const { db } = await openRuntimeDb(dir);
  try {
    const indexNames = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='chain_edges'")
      .all()
      .map((row) => row.name);

    assert.ok(indexNames.includes('idx_chain_edges_source'), 'idx_chain_edges_source missing');
    assert.ok(indexNames.includes('idx_chain_edges_target'), 'idx_chain_edges_target missing');
    assert.ok(indexNames.includes('uniq_chain_active'), 'uniq_chain_active missing');
  } finally {
    db.close();
  }
});

test('migration is idempotent — second runMigration call does not throw and does not duplicate', async () => {
  const dir = await makeTempProject();
  const { db } = await openRuntimeDb(dir);
  try {
    // First migration ran inside openRuntimeDb. Explicit second call must be safe.
    assert.doesNotThrow(() => runMigration(db));
    assert.doesNotThrow(() => runMigration(db));

    const tables = db
      .prepare("SELECT count(*) AS c FROM sqlite_master WHERE type='table' AND name='chain_edges'")
      .get();
    assert.equal(tables.c, 1, 'still exactly 1 chain_edges table after repeated migration');

    const indexes = db
      .prepare("SELECT count(*) AS c FROM sqlite_master WHERE type='index' AND tbl_name='chain_edges'")
      .get();
    assert.ok(indexes.c >= 3, 'at least the 3 expected indexes (no duplicates produced)');
  } finally {
    db.close();
  }
});

test('runMigration throws on invalid db handle', () => {
  assert.throws(() => runMigration(null), /requires an open better-sqlite3/);
  assert.throws(() => runMigration({}), /requires an open better-sqlite3/);
});
