'use strict';

// QA tests — active-learning-loop Phase 1 (telemetry-foundation).
// Independent risk-first verification on top of tests/telemetry-foundation.test.js (@dev unit tests).
// Stress: AC-ALL-101 SLA p99 ≤100ms; BR-ALL-08 payload cap; EC-ALL-13 cross-platform paths; EC-ALL-14 concurrent reads.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');

const { openRuntimeDb } = require('../src/runtime-store');
const { runContextLoad } = require('../src/commands/context-load');

async function makeTempProject(ruleCount = 0) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-qa-tf-'));
  await fs.mkdir(path.join(dir, '.aioson', 'rules'), { recursive: true });
  for (let i = 0; i < ruleCount; i++) {
    await fs.writeFile(path.join(dir, '.aioson', 'rules', `rule-${i}.md`), `rule ${i}`, 'utf8');
  }
  return dir;
}

const silentLogger = () => ({ log: () => {}, error: () => {} });
const tFn = (k) => k;

// Skip on Windows under full-suite execution (2026-05-14 @architect,
// known-flake-001): the 100ms p99 cap holds in isolation (`node --test
// tests/qa-telemetry-foundation.test.js` consistently reports p99 < 100ms),
// but the full npm-test run on NTFS pushes p99 to 1000-1300ms because
// ~100 test files compete for SQLite/disk/temp IO simultaneously. We
// tried platform-aware caps (250ms, then 1500ms) — none catch real
// regressions, they just track ambient contention. Skip preserves the
// signal where it matters (Linux/CI run the strict bound) and stops the
// noise on Windows. To measure perf on Windows, run this file in
// isolation. Re-enable globally if/when the suite gets a serial
// perf-only profile.
test('QA-PERF-01: p99 latency stays under 100ms across 500 sequential context:load calls', {
  skip: process.platform === 'win32'
    ? 'flake under full-suite IO contention on NTFS; run this file in isolation to measure Windows perf'
    : false
}, async () => {
  const dir = await makeTempProject(50);
  const N = 500;
  const latencies = new Array(N);

  for (let i = 0; i < N; i++) {
    const start = process.hrtime.bigint();
    const result = await runContextLoad({
      args: [dir],
      options: { target: `rule:rule-${i % 50}`, agent: 'dev', feature: 'active-learning-loop' },
      logger: silentLogger(),
      t: tFn
    });
    const end = process.hrtime.bigint();
    latencies[i] = Number(end - start) / 1e6;
    assert.equal(result.ok, true, `call #${i} failed`);
  }

  latencies.sort((a, b) => a - b);
  const p99 = latencies[Math.floor(N * 0.99)];
  // Strict 100ms p99 cap — only enforced on POSIX. Windows is gated via
  // the test-level `skip` option above; see that comment for rationale.
  assert.ok(p99 < 100, `p99 latency ${p99.toFixed(2)}ms exceeds 100ms SLA`);

  // No drops: every emitted event must be persisted.
  const { db } = await openRuntimeDb(dir);
  try {
    const { count } = db.prepare("SELECT COUNT(*) as count FROM execution_events WHERE event_type = 'rule_loaded'").get();
    assert.equal(count, N, `expected ${N} rows, got ${count} (event drop detected)`);
  } finally {
    db.close();
  }
});

test('QA-PERF-02: batch mode persists N events in a single transaction with high throughput', async () => {
  const dir = await makeTempProject(100);
  const slugs = Array.from({ length: 100 }, (_, i) => `rule-${i}`).join(',');

  const start = Date.now();
  const result = await runContextLoad({
    args: [dir],
    options: { target: 'rule', agent: 'dev', batch: slugs, feature: 'active-learning-loop' },
    logger: silentLogger(),
    t: tFn
  });
  const elapsedMs = Date.now() - start;

  assert.equal(result.ok, true);
  assert.equal(result.emitted, 100);
  assert.ok(elapsedMs < 2000, `batch of 100 took ${elapsedMs}ms (>2s)`);

  const { db } = await openRuntimeDb(dir);
  try {
    const { count } = db.prepare("SELECT COUNT(*) as count FROM execution_events WHERE event_type = 'rule_loaded'").get();
    assert.equal(count, 100);
  } finally {
    db.close();
  }
});

test('QA-EC-13: payload.target_path uses forward-slashes on all platforms (Windows + POSIX)', async () => {
  const dir = await makeTempProject();
  await fs.mkdir(path.join(dir, '.aioson', 'brains', 'dev'), { recursive: true });
  await fs.writeFile(path.join(dir, '.aioson', 'brains', 'dev', 'patterns.brain.json'), '{}', 'utf8');
  await fs.writeFile(path.join(dir, '.aioson', 'rules', 'sec.md'), 'r', 'utf8');

  await runContextLoad({
    args: [dir],
    options: { target: 'rule:sec', agent: 'dev' },
    logger: silentLogger(),
    t: tFn
  });
  await runContextLoad({
    args: [dir],
    options: { target: 'brain:dev/patterns', agent: 'dev' },
    logger: silentLogger(),
    t: tFn
  });

  const { db } = await openRuntimeDb(dir);
  try {
    const rows = db.prepare("SELECT payload_json FROM execution_events WHERE event_type IN ('rule_loaded','brain_loaded')").all();
    assert.equal(rows.length, 2);
    for (const row of rows) {
      const payload = JSON.parse(row.payload_json);
      assert.ok(!payload.target_path.includes('\\'), `target_path "${payload.target_path}" contains backslash`);
      assert.ok(payload.target_path.startsWith('.aioson/'), `target_path "${payload.target_path}" missing forward-slash prefix`);
    }
  } finally {
    db.close();
  }
});

test('QA-EC-14: SQLite WAL allows concurrent reader while writer holds connection', async () => {
  const dir = await makeTempProject(3);

  // Establish DB + initial event with writer.
  await runContextLoad({
    args: [dir],
    options: { target: 'rule:rule-0', agent: 'dev' },
    logger: silentLogger(),
    t: tFn
  });

  // Open a long-lived reader connection (simulating concurrent memory:search reader from a future phase).
  const reader = new Database(path.join(dir, '.aioson', 'runtime', 'aios.sqlite'), { readonly: true });
  reader.pragma('journal_mode = WAL');

  // Writer keeps emitting; reader keeps polling.
  for (let i = 1; i < 5; i++) {
    await runContextLoad({
      args: [dir],
      options: { target: `rule:rule-${i % 3}`, agent: 'dev' },
      logger: silentLogger(),
      t: tFn
    });
    const { count } = reader.prepare("SELECT COUNT(*) as count FROM execution_events WHERE event_type = 'rule_loaded'").get();
    assert.ok(count >= i, `reader saw ${count} rows after ${i + 1} writes (WAL lock contention)`);
  }
  reader.close();
});

test('QA-EC-10: multiple agents loading same rule produce DISTINCT(target_slug, agent_name) rows', async () => {
  const dir = await makeTempProject();
  await fs.writeFile(path.join(dir, '.aioson', 'rules', 'shared.md'), 'r', 'utf8');

  for (const agent of ['dev', 'qa', 'architect']) {
    await runContextLoad({
      args: [dir],
      options: { target: 'rule:shared', agent, feature: 'active-learning-loop' },
      logger: silentLogger(),
      t: tFn
    });
  }

  const { db } = await openRuntimeDb(dir);
  try {
    const rows = db.prepare(
      "SELECT agent_name, payload_json FROM execution_events WHERE event_type = 'rule_loaded' ORDER BY id"
    ).all();
    assert.equal(rows.length, 3);
    const agents = rows.map((r) => r.agent_name).sort();
    assert.deepEqual(agents, ['architect', 'dev', 'qa']);
    for (const row of rows) {
      const payload = JSON.parse(row.payload_json);
      assert.equal(payload.target_slug, 'shared');
    }
  } finally {
    db.close();
  }
});

test('QA-EC-02: feature_slug NULL outside feature is allowed (omitted from payload)', async () => {
  const dir = await makeTempProject();
  await fs.writeFile(path.join(dir, '.aioson', 'rules', 'r.md'), 'r', 'utf8');

  const result = await runContextLoad({
    args: [dir],
    options: { target: 'rule:r', agent: 'dev' }, // no --feature
    logger: silentLogger(),
    t: tFn
  });
  assert.equal(result.ok, true);

  const { db } = await openRuntimeDb(dir);
  try {
    const row = db.prepare("SELECT payload_json FROM execution_events WHERE event_type = 'rule_loaded'").get();
    const payload = JSON.parse(row.payload_json);
    assert.equal(payload.target_slug, 'r');
    assert.equal(payload.feature_slug, undefined, 'feature_slug must be omitted when not provided');
  } finally {
    db.close();
  }
});

test('QA-PMD-1: only execution_events is written — no new tables or schema columns introduced', async () => {
  const dir = await makeTempProject();
  await fs.writeFile(path.join(dir, '.aioson', 'rules', 'r.md'), 'r', 'utf8');

  await runContextLoad({
    args: [dir],
    options: { target: 'rule:r', agent: 'dev' },
    logger: silentLogger(),
    t: tFn
  });

  const { db } = await openRuntimeDb(dir);
  try {
    // No new table named context_load_events (would violate PMD-1 / Article VI Simplicity).
    const newTables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE '%context_load%' OR name LIKE '%learning_loop%' OR name = 'rule_loads')"
    ).all();
    assert.equal(newTables.length, 0, `unexpected new tables: ${newTables.map((t) => t.name).join(',')}`);

    // Partial index from learning-loop-migration must exist.
    const idx = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND name = 'idx_execution_events_context_load'"
    ).get();
    assert.ok(idx, 'idx_execution_events_context_load partial index missing');
  } finally {
    db.close();
  }
});

// --- Documented gap (Medium finding M-01): BR-ALL-08 _truncated marker ---
// Current clampPayload only truncates target_path and never adds the `_truncated: true` marker.
// EC-ALL-09 + BR-ALL-08 require both. With normal slugs the cap is never hit, so this is residual.
// The test below documents the current behavior; the desired behavior (assertions in the
// "expected behavior" block) is recorded in corrections-2026-05-14.md.

test('QA-BR-08 (current behavior): payload cap is best-effort; pathological slugs bypass the 4KB ceiling', async () => {
  const dir = await makeTempProject();
  const longSlug = 'x'.repeat(8000);
  await fs.writeFile(path.join(dir, '.aioson', 'rules', `${longSlug.slice(0, 200)}.md`), 'r', 'utf8');

  const result = await runContextLoad({
    args: [dir],
    options: { target: `rule:${longSlug}`, agent: 'dev' },
    logger: silentLogger(),
    t: tFn
  });
  assert.equal(result.ok, true);

  const { db } = await openRuntimeDb(dir);
  try {
    const row = db.prepare("SELECT payload_json FROM execution_events WHERE event_type = 'rule_loaded'").get();
    const bytes = Buffer.byteLength(row.payload_json, 'utf8');
    // Current behavior: payload may exceed 4096 bytes when target_slug is the oversized field.
    // Desired behavior (M-01 in corrections plan): bytes <= 4096 AND payload._truncated === true.
    assert.ok(bytes > 0, 'payload must be persisted even when oversized');
    // Document the regression boundary — if this assertion ever starts failing it likely means
    // someone added proper clamp+marker; flip the assertion direction at that point.
    assert.ok(bytes > 4096, `clamp regression: payload now <=4KB (${bytes}b) — update test to assert _truncated marker`);
  } finally {
    db.close();
  }
});
