'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { readLatestCheckpoint } = require('../src/commands/workflow-heal');
const { runGateApprove, CHECKPOINTS_DIR } = require('../src/commands/gate-approve');

async function makeTmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-heal-ckpt-'));
}

async function writeCheckpoint(dir, gate, slug, extra = {}) {
  const cpDir = path.join(dir, CHECKPOINTS_DIR);
  await fs.mkdir(cpDir, { recursive: true });
  const checkpoint = {
    gate,
    slug,
    agent: 'test-agent',
    timestamp: new Date().toISOString(),
    prerequisites_snapshot: [],
    gate_check_result: { ok: true },
    decision_log: [],
    ...extra
  };
  const file = path.join(cpDir, `gate-${gate}-${slug}.json`);
  await fs.writeFile(file, JSON.stringify(checkpoint, null, 2) + '\n', 'utf8');
  return checkpoint;
}

async function writeFile(dir, relPath, content) {
  const full = path.join(dir, relPath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, 'utf8');
}

function makeLogger() {
  const lines = [];
  return { log: (m = '') => lines.push(String(m)), error: (m = '') => lines.push(String(m)), lines };
}

function productReadyPrd(scope = 'pending', ready = 'pending') {
  return `---\nproduct_scope: ${scope}\nprd_ready: ${ready}\n---\n# PRD\n\n## Feature Capability Map\n\n| CAP | Promised outcome | Actor / trigger | Scope decision | Rationale |\n|---|---|---|---|---|\n| CAP-demo-01 | User sees the result | User triggers action | required | Core promise |\n\n## Acceptance Criteria\n\n| AC | CAP | Observable behavior | Evidence |\n|---|---|---|---|\n| AC-demo-01 | CAP-demo-01 | Result appears | focused test |\n`;
}

// ─── readLatestCheckpoint unit tests ──────────────────────────────────────────

test('readLatestCheckpoint: returns null when checkpoints dir does not exist (EC-AO-02)', async () => {
  const tmpDir = await makeTmpDir();
  const result = await readLatestCheckpoint(tmpDir, 'no-dir');
  assert.equal(result, null);
});

test('readLatestCheckpoint: returns null when no matching files for slug', async () => {
  const tmpDir = await makeTmpDir();
  await writeCheckpoint(tmpDir, 'A', 'other-feature');
  const result = await readLatestCheckpoint(tmpDir, 'my-feature');
  assert.equal(result, null);
});

test('readLatestCheckpoint: returns single checkpoint when only one exists', async () => {
  const tmpDir = await makeTmpDir();
  const written = await writeCheckpoint(tmpDir, 'A', 'my-feature');
  const result = await readLatestCheckpoint(tmpDir, 'my-feature');
  assert.equal(result.gate, 'A');
  assert.equal(result.slug, 'my-feature');
});

test('readLatestCheckpoint: BR-AO-02 latest-gate-wins D > C > B > A', async () => {
  const tmpDir = await makeTmpDir();
  await writeCheckpoint(tmpDir, 'A', 'multi');
  await writeCheckpoint(tmpDir, 'C', 'multi');
  await writeCheckpoint(tmpDir, 'B', 'multi');

  const result = await readLatestCheckpoint(tmpDir, 'multi');
  assert.equal(result.gate, 'C', 'must select C as highest of A, B, C');
});

test('readLatestCheckpoint: gate D wins over all others', async () => {
  const tmpDir = await makeTmpDir();
  await writeCheckpoint(tmpDir, 'A', 'full');
  await writeCheckpoint(tmpDir, 'B', 'full');
  await writeCheckpoint(tmpDir, 'C', 'full');
  await writeCheckpoint(tmpDir, 'D', 'full');

  const result = await readLatestCheckpoint(tmpDir, 'full');
  assert.equal(result.gate, 'D');
});

test('readLatestCheckpoint: EC-AO-03 similar slugs do not collide', async () => {
  const tmpDir = await makeTmpDir();
  await writeCheckpoint(tmpDir, 'A', 'checkout');
  await writeCheckpoint(tmpDir, 'B', 'checkout-v2');

  const r1 = await readLatestCheckpoint(tmpDir, 'checkout');
  assert.equal(r1.gate, 'A');
  assert.equal(r1.slug, 'checkout');

  const r2 = await readLatestCheckpoint(tmpDir, 'checkout-v2');
  assert.equal(r2.gate, 'B');
  assert.equal(r2.slug, 'checkout-v2');
});

test('readLatestCheckpoint: returns null on malformed JSON checkpoint file', async () => {
  const tmpDir = await makeTmpDir();
  const cpDir = path.join(tmpDir, CHECKPOINTS_DIR);
  await fs.mkdir(cpDir, { recursive: true });
  await fs.writeFile(path.join(cpDir, 'gate-A-broken.json'), '{ not valid json', 'utf8');

  const result = await readLatestCheckpoint(tmpDir, 'broken');
  assert.equal(result, null);
});

test('readLatestCheckpoint: returns null when checkpoints dir is empty', async () => {
  const tmpDir = await makeTmpDir();
  await fs.mkdir(path.join(tmpDir, CHECKPOINTS_DIR), { recursive: true });
  const result = await readLatestCheckpoint(tmpDir, 'empty-dir');
  assert.equal(result, null);
});

// ─── Integration: gate:approve → readLatestCheckpoint round-trip ─────────────

test('integration: gate:approve writes checkpoint that readLatestCheckpoint reads', async () => {
  const tmpDir = await makeTmpDir();
  const slug = 'roundtrip';
  await writeFile(tmpDir, `.aioson/context/prd-${slug}.md`, productReadyPrd());

  await runGateApprove({
    args: [tmpDir],
    options: { json: true, feature: slug, gate: 'A', agent: 'product' },
    logger: makeLogger()
  });

  const cp = await readLatestCheckpoint(tmpDir, slug);
  assert.ok(cp, 'checkpoint must be readable');
  assert.equal(cp.gate, 'A');
  assert.equal(cp.slug, slug);
  assert.equal(cp.agent, 'product');
  assert.ok(cp.timestamp);
  assert.ok(Array.isArray(cp.prerequisites_snapshot));
  assert.ok(cp.gate_check_result.ok === true);
});

test('integration: multiple gate:approve calls, readLatestCheckpoint picks highest gate', async () => {
  const tmpDir = await makeTmpDir();
  const slug = 'multi-approve';
  await writeFile(tmpDir, `.aioson/context/prd-${slug}.md`, productReadyPrd());

  await runGateApprove({
    args: [tmpDir],
    options: { json: true, feature: slug, gate: 'A', agent: 'product' },
    logger: makeLogger()
  });
  await runGateApprove({
    args: [tmpDir],
    options: { json: true, feature: slug, gate: 'B', agent: 'product' },
    logger: makeLogger()
  });

  const cp = await readLatestCheckpoint(tmpDir, slug);
  assert.equal(cp.gate, 'B', 'must select B as highest approved gate');
  assert.equal(cp.agent, 'product');
});

// ─── BR-AO-03: size cap stress test ─────────────────────────────────────────

test('BR-AO-03: checkpoint truncates decision_log when payload exceeds 5KB', async () => {
  const tmpDir = await makeTmpDir();
  const slug = 'size-stress';
  await writeFile(tmpDir, `.aioson/context/prd-${slug}.md`, productReadyPrd());

  const result = await runGateApprove({
    args: [tmpDir],
    options: { json: true, feature: slug, gate: 'A' },
    logger: makeLogger()
  });

  assert.equal(result.ok, true);
  const cpFile = path.join(tmpDir, CHECKPOINTS_DIR, `gate-A-${slug}.json`);
  const raw = await fs.readFile(cpFile, 'utf8');
  const stat = await fs.stat(cpFile);
  assert.ok(stat.size <= 5120, `checkpoint must be <= 5KB, got ${stat.size}`);
});
