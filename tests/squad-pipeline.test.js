'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');
const {
  openRuntimeDb,
  upsertPipeline,
  addPipelineNode,
  addPipelineEdge,
  removePipelineEdge,
  getPipelineDAG,
  listPipelines,
  upsertSquadPorts,
  getTopologicalOrder
} = require('../src/runtime-store');

async function makeTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-pipeline-'));
}

async function openDb(dir) {
  // Ensure squads table exists by opening the db (runtime-store creates all tables)
  const result = await openRuntimeDb(dir);
  return result.db;
}

function insertSquad(db, slug) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT OR IGNORE INTO squads (squad_slug, name, mode, status, visibility, created_at, updated_at)
    VALUES (?, ?, 'content', 'active', 'private', ?, ?)
  `).run(slug, slug, now, now);
}

// ─── Topological sort tests ────────────────────────────────────────────────

test('topological sort — linear chain A→B→C', async () => {
  const dir = await makeTempDir();
  const db = await openDb(dir);

  try {
    upsertPipeline(db, { slug: 'topo-linear', name: 'Linear' });
    insertSquad(db, 'squad-a'); insertSquad(db, 'squad-b'); insertSquad(db, 'squad-c');
    addPipelineNode(db, { pipelineSlug: 'topo-linear', squadSlug: 'squad-a' });
    addPipelineNode(db, { pipelineSlug: 'topo-linear', squadSlug: 'squad-b' });
    addPipelineNode(db, { pipelineSlug: 'topo-linear', squadSlug: 'squad-c' });
    addPipelineEdge(db, { pipelineSlug: 'topo-linear', sourceSquad: 'squad-a', sourcePort: 'out', targetSquad: 'squad-b', targetPort: 'in' });
    addPipelineEdge(db, { pipelineSlug: 'topo-linear', sourceSquad: 'squad-b', sourcePort: 'out', targetSquad: 'squad-c', targetPort: 'in' });

    const order = getTopologicalOrder(db, 'topo-linear');
    assert.ok(order !== null, 'No cycle expected');
    assert.equal(order.length, 3);
    assert.ok(order.indexOf('squad-a') < order.indexOf('squad-b'), 'a before b');
    assert.ok(order.indexOf('squad-b') < order.indexOf('squad-c'), 'b before c');
  } finally {
    db.close();
  }
});

test('topological sort — cycle detection returns null', async () => {
  const dir = await makeTempDir();
  const db = await openDb(dir);

  try {
    upsertPipeline(db, { slug: 'topo-cycle', name: 'Cycle' });
    insertSquad(db, 'squad-x'); insertSquad(db, 'squad-y');
    addPipelineNode(db, { pipelineSlug: 'topo-cycle', squadSlug: 'squad-x' });
    addPipelineNode(db, { pipelineSlug: 'topo-cycle', squadSlug: 'squad-y' });
    addPipelineEdge(db, { pipelineSlug: 'topo-cycle', sourceSquad: 'squad-x', sourcePort: 'out', targetSquad: 'squad-y', targetPort: 'in' });
    addPipelineEdge(db, { pipelineSlug: 'topo-cycle', sourceSquad: 'squad-y', sourcePort: 'out', targetSquad: 'squad-x', targetPort: 'in' });

    const order = getTopologicalOrder(db, 'topo-cycle');
    assert.equal(order, null, 'Cycle should return null');
  } finally {
    db.close();
  }
});

test('topological sort — parallel branches', async () => {
  const dir = await makeTempDir();
  const db = await openDb(dir);

  try {
    // A → C and B → C (parallel inputs into C)
    upsertPipeline(db, { slug: 'topo-parallel', name: 'Parallel' });
    insertSquad(db, 'squad-a'); insertSquad(db, 'squad-b'); insertSquad(db, 'squad-c');
    addPipelineNode(db, { pipelineSlug: 'topo-parallel', squadSlug: 'squad-a' });
    addPipelineNode(db, { pipelineSlug: 'topo-parallel', squadSlug: 'squad-b' });
    addPipelineNode(db, { pipelineSlug: 'topo-parallel', squadSlug: 'squad-c' });
    addPipelineEdge(db, { pipelineSlug: 'topo-parallel', sourceSquad: 'squad-a', sourcePort: 'out', targetSquad: 'squad-c', targetPort: 'in1' });
    addPipelineEdge(db, { pipelineSlug: 'topo-parallel', sourceSquad: 'squad-b', sourcePort: 'out', targetSquad: 'squad-c', targetPort: 'in2' });

    const order = getTopologicalOrder(db, 'topo-parallel');
    assert.ok(order !== null);
    assert.equal(order.length, 3);
    assert.ok(order.indexOf('squad-a') < order.indexOf('squad-c'));
    assert.ok(order.indexOf('squad-b') < order.indexOf('squad-c'));
  } finally {
    db.close();
  }
});

// ─── Pipeline CRUD ─────────────────────────────────────────────────────────

test('upsertPipeline creates and updates', async () => {
  const dir = await makeTempDir();
  const db = await openDb(dir);

  try {
    upsertPipeline(db, { slug: 'my-pipeline', name: 'My Pipeline', status: 'draft' });
    const dag = getPipelineDAG(db, 'my-pipeline');
    assert.ok(dag);
    assert.equal(dag.pipeline.slug, 'my-pipeline');
    assert.equal(dag.pipeline.status, 'draft');

    // Update
    upsertPipeline(db, { slug: 'my-pipeline', name: 'My Pipeline Updated', status: 'active' });
    const dag2 = getPipelineDAG(db, 'my-pipeline');
    assert.equal(dag2.pipeline.status, 'active');
    assert.equal(dag2.pipeline.name, 'My Pipeline Updated');
  } finally {
    db.close();
  }
});

test('addPipelineNode + getPipelineDAG returns nodes and edges', async () => {
  const dir = await makeTempDir();
  const db = await openDb(dir);

  try {
    upsertPipeline(db, { slug: 'dag-test', name: 'DAG Test' });
    insertSquad(db, 'alpha'); insertSquad(db, 'beta');
    addPipelineNode(db, { pipelineSlug: 'dag-test', squadSlug: 'alpha', positionX: 100, positionY: 200 });
    addPipelineNode(db, { pipelineSlug: 'dag-test', squadSlug: 'beta', positionX: 300, positionY: 200 });
    addPipelineEdge(db, { pipelineSlug: 'dag-test', sourceSquad: 'alpha', sourcePort: 'output', targetSquad: 'beta', targetPort: 'input' });

    const dag = getPipelineDAG(db, 'dag-test');
    assert.equal(dag.nodes.length, 2);
    assert.equal(dag.edges.length, 1);
    assert.equal(dag.edges[0].source_squad, 'alpha');
    assert.equal(dag.edges[0].target_squad, 'beta');
  } finally {
    db.close();
  }
});

test('removePipelineEdge removes only that edge', async () => {
  const dir = await makeTempDir();
  const db = await openDb(dir);

  try {
    upsertPipeline(db, { slug: 'remove-edge', name: 'Remove Edge' });
    insertSquad(db, 'p1'); insertSquad(db, 'p2'); insertSquad(db, 'p3');
    addPipelineNode(db, { pipelineSlug: 'remove-edge', squadSlug: 'p1' });
    addPipelineNode(db, { pipelineSlug: 'remove-edge', squadSlug: 'p2' });
    addPipelineNode(db, { pipelineSlug: 'remove-edge', squadSlug: 'p3' });
    addPipelineEdge(db, { pipelineSlug: 'remove-edge', sourceSquad: 'p1', sourcePort: 'out', targetSquad: 'p2', targetPort: 'in' });
    addPipelineEdge(db, { pipelineSlug: 'remove-edge', sourceSquad: 'p2', sourcePort: 'out', targetSquad: 'p3', targetPort: 'in' });

    const dag1 = getPipelineDAG(db, 'remove-edge');
    assert.equal(dag1.edges.length, 2);

    const edgeId = dag1.edges[0].id;
    removePipelineEdge(db, edgeId);

    const dag2 = getPipelineDAG(db, 'remove-edge');
    assert.equal(dag2.edges.length, 1);
  } finally {
    db.close();
  }
});

test('listPipelines returns all pipelines sorted by updated_at', async () => {
  const dir = await makeTempDir();
  const db = await openDb(dir);

  try {
    upsertPipeline(db, { slug: 'pip-a', name: 'A' });
    upsertPipeline(db, { slug: 'pip-b', name: 'B' });
    const list = listPipelines(db);
    assert.ok(list.length >= 2);
    const slugs = list.map(p => p.slug);
    assert.ok(slugs.includes('pip-a'));
    assert.ok(slugs.includes('pip-b'));
  } finally {
    db.close();
  }
});

// ─── Squad ports ───────────────────────────────────────────────────────────

test('upsertSquadPorts stores inputs and outputs', async () => {
  const dir = await makeTempDir();
  const db = await openDb(dir);

  try {
    insertSquad(db, 'my-squad');
    upsertSquadPorts(db, 'my-squad', {
      inputs: [{ key: 'raw-content', dataType: 'text', description: 'Input text', required: true }],
      outputs: [{ key: 'article', dataType: 'file', description: 'Final article' }]
    });

    const rows = db.prepare('SELECT * FROM squad_ports WHERE squad_slug = ?').all('my-squad');
    assert.equal(rows.length, 2);
    const input = rows.find(r => r.port_type === 'input');
    const output = rows.find(r => r.port_type === 'output');
    assert.ok(input);
    assert.equal(input.port_key, 'raw-content');
    assert.equal(input.required, 1);
    assert.ok(output);
    assert.equal(output.port_key, 'article');
    assert.equal(output.data_type, 'file');
  } finally {
    db.close();
  }
});

test('upsertSquadPorts replaces on re-upsert', async () => {
  const dir = await makeTempDir();
  const db = await openDb(dir);

  try {
    insertSquad(db, 'replace-squad');
    upsertSquadPorts(db, 'replace-squad', {
      inputs: [{ key: 'old-key', dataType: 'any' }],
      outputs: []
    });
    upsertSquadPorts(db, 'replace-squad', {
      inputs: [{ key: 'new-key', dataType: 'json' }],
      outputs: [{ key: 'result', dataType: 'json' }]
    });

    const rows = db.prepare('SELECT * FROM squad_ports WHERE squad_slug = ?').all('replace-squad');
    assert.equal(rows.length, 2);
    const keys = rows.map(r => r.port_key);
    assert.ok(!keys.includes('old-key'), 'old-key should be replaced');
    assert.ok(keys.includes('new-key'));
    assert.ok(keys.includes('result'));
  } finally {
    db.close();
  }
});

// ─── Handoff lifecycle ─────────────────────────────────────────────────────

test('handoff lifecycle: pending → consumed', async () => {
  const dir = await makeTempDir();
  const db = await openDb(dir);

  try {
    const now = new Date().toISOString();
    const id = `handoff-${Date.now()}`;
    insertSquad(db, 'squad-a'); insertSquad(db, 'squad-b');
    db.prepare(`
      INSERT INTO squad_handoffs (id, pipeline_slug, from_squad, from_port, to_squad, to_port, payload_json, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)
    `).run(id, 'some-pipeline', 'squad-a', 'output', 'squad-b', 'input', JSON.stringify({ key: 'article-001' }), now);

    const row = db.prepare('SELECT * FROM squad_handoffs WHERE id = ?').get(id);
    assert.equal(row.status, 'pending');

    // Consume it
    db.prepare(`UPDATE squad_handoffs SET status = 'consumed', consumed_at = ? WHERE id = ?`).run(now, id);
    const consumed = db.prepare('SELECT * FROM squad_handoffs WHERE id = ?').get(id);
    assert.equal(consumed.status, 'consumed');
    assert.ok(consumed.consumed_at);
  } finally {
    db.close();
  }
});

const { runSquadPipeline } = require('../src/commands/squad-pipeline');
const { spawnSync } = require('node:child_process');
const quiet = { log() {}, error() {} };

async function guidedFixture(t, edges) {
  const dir = await makeTempDir();
  const db = await openDb(dir);
  t.after(async () => { db.close(); await fs.rm(dir, { recursive: true, force: true }); });
  upsertPipeline(db, { slug: 'guided', name: 'Guided' });
  for (const slug of new Set(edges.flat())) {
    insertSquad(db, slug);
    addPipelineNode(db, { pipelineSlug: 'guided', squadSlug: slug });
  }
  for (const [source, target] of edges) addPipelineEdge(db, {
    pipelineSlug: 'guided', sourceSquad: source, sourcePort: 'out', targetSquad: target, targetPort: 'in'
  });
  const handoff = (id, from, to, status = 'pending', payload = {}) => db.prepare(`
    INSERT INTO squad_handoffs (id, pipeline_slug, from_squad, from_port, to_squad, to_port, payload_json, status, created_at)
    VALUES (?, 'guided', ?, 'out', ?, 'in', ?, ?, ?)
  `).run(id, from, to, JSON.stringify(payload), status, new Date().toISOString());
  const run = (sub = 'run') => runSquadPipeline({ args: [dir], options: { sub, pipeline: 'guided' }, logger: quiet });
  return { dir, db, handoff, run };
}

test('guided CLI repeats preparation without consuming or dispatching', async t => {
  const { dir, db, handoff, run } = await guidedFixture(t, [['a', 'b']]);
  handoff('ab', 'a', 'b');
  for (const sub of ['run', 'continue']) {
    const result = await run(sub);
    assert.equal(result.status, 'prepared');
    assert.equal(result.nextNode, 'b');
    assert.deepEqual(result.incomingHandoffIds, ['ab']);
    assert.equal(result.nodeStatus.a, 'produced');
    assert.equal(db.prepare('SELECT status FROM squad_handoffs WHERE id = ?').get('ab').status, 'pending');
  }
  const cli = spawnSync(process.execPath, [path.resolve(__dirname, '../bin/aioson.js'), 'squad:pipeline', dir,
    '--sub=run', '--pipeline=guided', '--json'], { encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stderr);
  assert.equal(JSON.parse(cli.stdout).status, 'prepared');
  assert.equal(db.prepare('SELECT consumed_at FROM squad_handoffs WHERE id = ?').get('ab').consumed_at, null);
});

test('legacy consumed handoffs do not prove terminal completion', async t => {
  const { handoff, run } = await guidedFixture(t, [['a', 'b']]);
  handoff('ab', 'a', 'b', 'consumed');
  const result = await run();
  assert.equal(result.status, 'unverified');
  assert.equal(result.nodeStatus.b, 'unverified');
  assert.equal(result.nextNode, null);
});

test('fan-out matches destinations and fan-in requires every source', async t => {
  const { handoff, run } = await guidedFixture(t, [['a', 'b'], ['a', 'c'], ['b', 'd'], ['c', 'd']]);
  handoff('ab', 'a', 'b');
  handoff('bd', 'b', 'd');
  let result = await run();
  assert.equal(result.nodeStatus.a, 'pending');
  assert.equal(result.nodeStatus.c, 'blocked');
  assert.equal(result.nodeStatus.d, 'blocked');
  handoff('ac', 'a', 'c');
  result = await run();
  assert.equal(result.nextNode, 'c');
  handoff('cd', 'c', 'd');
  result = await run();
  assert.equal(result.nextNode, 'd');
});

test('latest failed input and skipped output cannot satisfy dependencies', async t => {
  const { handoff, run } = await guidedFixture(t, [['a', 'b']]);
  handoff('old', 'a', 'b', 'consumed');
  handoff('new', 'a', 'b', 'failed');
  assert.equal((await run()).nodeStatus.b, 'blocked');
  const skipped = await run('skip');
  assert.equal(skipped.skipped, 'a');
  const result = await run();
  assert.equal(result.nodeStatus.a, 'skipped');
  assert.equal(result.nodeStatus.b, 'blocked');
  assert.equal(result.status, 'blocked');
});
