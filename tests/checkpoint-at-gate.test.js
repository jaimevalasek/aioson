'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { runGateApprove, CHECKPOINTS_DIR } = require('../src/commands/gate-approve');

async function makeTmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-checkpoint-'));
}

async function writeFile(dir, relPath, content) {
  const full = path.join(dir, relPath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, 'utf8');
  return full;
}

function makeLogger() {
  const lines = [];
  return {
    log: (msg = '') => lines.push(String(msg)),
    error: (msg = '') => lines.push(String(msg)),
    lines
  };
}

function productReadyPrd(scope = 'pending', ready = 'pending') {
  return `---\nclassification: SMALL\nproduct_scope: ${scope}\nprd_ready: ${ready}\nsheldon_review: not_requested\n---\n# PRD\n\n## Feature Capability Map\n\n| CAP | Promised outcome | Actor / trigger | Scope decision | Rationale |\n|---|---|---|---|---|\n| CAP-demo-01 | User sees the result | User triggers action | required | Core promise |\n\n## Acceptance Criteria\n\n| AC | CAP | Observable behavior | Evidence |\n|---|---|---|---|\n| AC-demo-01 | CAP-demo-01 | Result appears | focused test |\n`;
}

test('checkpoint: written on successful gate:approve', async () => {
  const tmpDir = await makeTmpDir();
  const slug = 'ckpt-test';
  await writeFile(tmpDir, `.aioson/context/prd-${slug}.md`, productReadyPrd());

  const result = await runGateApprove({
    args: [tmpDir],
    options: { json: true, feature: slug, gate: 'A', agent: 'product' },
    logger: makeLogger()
  });

  assert.equal(result.ok, true);
  assert.equal(result.checkpoint_written, true);

  const cpFile = path.join(tmpDir, CHECKPOINTS_DIR, `gate-A-${slug}.json`);
  const raw = await fs.readFile(cpFile, 'utf8');
  const cp = JSON.parse(raw);

  assert.equal(cp.gate, 'A');
  assert.equal(cp.slug, slug);
  assert.equal(cp.agent, 'product');
  assert.ok(cp.timestamp);
  assert.ok(Array.isArray(cp.prerequisites_snapshot));
  assert.ok(cp.gate_check_result);
  assert.ok(Array.isArray(cp.decision_log));
});

test('checkpoint: agent defaults to unknown when not provided', async () => {
  const tmpDir = await makeTmpDir();
  const slug = 'no-agent';
  await writeFile(tmpDir, `.aioson/context/prd-${slug}.md`, productReadyPrd());

  const result = await runGateApprove({
    args: [tmpDir],
    options: { json: true, feature: slug, gate: 'A' },
    logger: makeLogger()
  });

  assert.equal(result.ok, true);
  const cpFile = path.join(tmpDir, CHECKPOINTS_DIR, `gate-A-${slug}.json`);
  const cp = JSON.parse(await fs.readFile(cpFile, 'utf8'));
  assert.equal(cp.agent, 'unknown');
});

test('checkpoint: prerequisites_snapshot includes artifact mtimes', async () => {
  const tmpDir = await makeTmpDir();
  const slug = 'snapshot-test';
  await writeFile(tmpDir, `.aioson/context/prd-${slug}.md`, productReadyPrd());

  await runGateApprove({
    args: [tmpDir],
    options: { json: true, feature: slug, gate: 'A' },
    logger: makeLogger()
  });

  const cpFile = path.join(tmpDir, CHECKPOINTS_DIR, `gate-A-${slug}.json`);
  const cp = JSON.parse(await fs.readFile(cpFile, 'utf8'));

  assert.ok(cp.prerequisites_snapshot.length > 0, 'snapshot must have entries');
  for (const entry of cp.prerequisites_snapshot) {
    assert.ok(entry.file, 'each entry must have file');
    assert.ok(entry.mtime, 'each entry must have mtime');
    assert.ok(!Number.isNaN(Date.parse(entry.mtime)), 'mtime must be valid ISO-8601');
  }
});

test('checkpoint: not written when gate:check fails', async () => {
  const tmpDir = await makeTmpDir();
  const slug = 'fail-ckpt';

  const result = await runGateApprove({
    args: [tmpDir],
    options: { json: true, feature: slug, gate: 'A' },
    logger: makeLogger()
  });

  assert.equal(result.ok, false);
  const cpDir = path.join(tmpDir, CHECKPOINTS_DIR);
  try {
    await fs.access(cpDir);
    const files = await fs.readdir(cpDir);
    assert.equal(files.length, 0, 'no checkpoint when gate blocked');
  } catch {
    // dir doesn't exist — correct
  }
});

test('checkpoint: file stays under 5KB', async () => {
  const tmpDir = await makeTmpDir();
  const slug = 'size-cap';
  await writeFile(tmpDir, `.aioson/context/prd-${slug}.md`, productReadyPrd());

  await runGateApprove({
    args: [tmpDir],
    options: { json: true, feature: slug, gate: 'A' },
    logger: makeLogger()
  });

  const cpFile = path.join(tmpDir, CHECKPOINTS_DIR, `gate-A-${slug}.json`);
  const stat = await fs.stat(cpFile);
  assert.ok(stat.size <= 5120, `checkpoint must be <= 5KB, got ${stat.size}`);
});

test('checkpoint: gate:approve succeeds even if checkpoint dir is unwritable (BR-AO-01)', async () => {
  const tmpDir = await makeTmpDir();
  const slug = 'ro-ckpt';
  await writeFile(tmpDir, `.aioson/context/prd-${slug}.md`, productReadyPrd());
  // Create a FILE where the directory should be — ensureDir will fail
  await writeFile(tmpDir, `${CHECKPOINTS_DIR}`, 'not a directory');

  const result = await runGateApprove({
    args: [tmpDir],
    options: { json: true, feature: slug, gate: 'A' },
    logger: makeLogger()
  });

  assert.equal(result.ok, true, 'gate must still approve');
  assert.equal(result.checkpoint_written, false, 'checkpoint not written');
  assert.equal(result.field_written, 'product_scope');
});

test('checkpoint: multiple gates produce separate files (EC-AO-03)', async () => {
  const tmpDir = await makeTmpDir();
  const slug = 'multi-gate';

  // Setup for Gate A
  await writeFile(tmpDir, `.aioson/context/prd-${slug}.md`, productReadyPrd());
  await runGateApprove({
    args: [tmpDir],
    options: { json: true, feature: slug, gate: 'A' },
    logger: makeLogger()
  });

  // Gate B is a second decision on the same canonical PRD.
  await runGateApprove({
    args: [tmpDir],
    options: { json: true, feature: slug, gate: 'B' },
    logger: makeLogger()
  });

  const cpDir = path.join(tmpDir, CHECKPOINTS_DIR);
  const files = await fs.readdir(cpDir);
  const matching = files.filter((f) => f.includes(slug));
  assert.equal(matching.length, 2);
  assert.ok(matching.includes(`gate-A-${slug}.json`));
  assert.ok(matching.includes(`gate-B-${slug}.json`));
});
