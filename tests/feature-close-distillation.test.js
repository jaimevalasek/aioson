'use strict';

// Active Learning Loop — Phase 5 (feature-close-distillation-hook) acceptance tests.
// Covers AC-ALL-501..506 + tier-2 notify dedup + lock contention + MICRO skip +
// best-effort silent failure + completion within 5s timeout window.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  openRuntimeDb,
  insertProjectLearning
} = require('../src/runtime-store');
const {
  runDistillation,
  readFeatureClassification,
  acquireDistillationLock,
  withTimeout
} = require('../src/learning-loop-engine');

const SILENT_LOGGER = () => ({ log: () => {}, error: () => {} });

async function makeProjectWithFeature({ slug, classification = 'MEDIUM', learnings = [], status = 'in_progress' } = {}) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'aios-fc5-'));
  fs.mkdirSync(path.join(dir, '.aioson', 'context'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.aioson', 'rules'), { recursive: true });
  // prd-{slug}.md with classification frontmatter
  fs.writeFileSync(
    path.join(dir, '.aioson', 'context', `prd-${slug}.md`),
    `---\nclassification: ${classification}\n---\n\n# PRD — ${slug}\n`
  );
  // spec-{slug}.md placeholder
  fs.writeFileSync(
    path.join(dir, '.aioson', 'context', `spec-${slug}.md`),
    `---\nfeature: ${slug}\nstatus: ${status}\n---\n\n# Spec\n`
  );
  // features.md
  fs.writeFileSync(
    path.join(dir, '.aioson', 'context', 'features.md'),
    `# Features\n\n| slug | status | started | completed |\n|------|--------|---------|-----------|\n| ${slug} | ${status} | 2026-05-01 | — |\n`
  );
  // project-pulse.md placeholder
  fs.writeFileSync(path.join(dir, '.aioson', 'context', 'project-pulse.md'), '# Project Pulse\n');
  // Seed runtime DB with learnings
  if (learnings.length > 0) {
    const { db } = await openRuntimeDb(dir);
    try {
      for (const l of learnings) {
        insertProjectLearning(db, {
          learningId: l.id,
          projectName: 'fixture',
          featureSlug: slug,
          type: l.type || 'process',
          title: l.title,
          evidence: l.evidence || 'x',
          status: l.status || 'active'
        });
        if (l.frequency) {
          db.prepare(`UPDATE project_learnings SET frequency = ? WHERE learning_id = ?`).run(l.frequency, l.id);
        }
      }
    } finally {
      db.close();
    }
  }
  return dir;
}

function getEvolutionRows(dir, slug) {
  const Database = require('better-sqlite3');
  const dbPath = path.join(dir, '.aioson', 'runtime', 'aios.sqlite');
  const db = new Database(dbPath, { readonly: true });
  try {
    return db.prepare(`SELECT id, event_type, start_at, end_at, payload_json FROM evolution_log WHERE feature_slug = ?`).all(slug);
  } finally {
    db.close();
  }
}

function countNotifyEvents(dir, slug) {
  const Database = require('better-sqlite3');
  const dbPath = path.join(dir, '.aioson', 'runtime', 'aios.sqlite');
  const db = new Database(dbPath, { readonly: true });
  try {
    const rows = db.prepare(`SELECT message FROM agent_events WHERE event_type LIKE 'notify_%'`).all();
    return rows.filter((r) => String(r.message || '').includes('distillation') && String(r.message || '').includes(slug.replace(/[^a-z]/gi, ''))).length;
  } finally {
    db.close();
  }
}

// ─── AC-ALL-501 (orchestration runs) ────────────────────────────────────────

test('AC-ALL-501: runDistillation invokes learning-auto-promote and records auto_distillation entry', async () => {
  const dir = await makeProjectWithFeature({
    slug: 'feat-501',
    classification: 'MEDIUM',
    learnings: [
      { id: 'pl-501-1', title: 'use uuid keys', evidence: 'always', frequency: 5 },
      { id: 'pl-501-2', title: 'snake case columns', evidence: 'always', frequency: 5 }
    ]
  });
  const { db } = await openRuntimeDb(dir);
  let result;
  try {
    result = await runDistillation({ targetDir: dir, slug: 'feat-501', db });
  } finally {
    db.close();
  }
  assert.equal(result.ok, true);
  assert.ok(result.lock_id, 'lock_id missing');
  assert.equal(typeof result.duration_ms, 'number');
  const rows = getEvolutionRows(dir, 'feat-501');
  const distillation = rows.find((r) => r.event_type === 'auto_distillation');
  assert.ok(distillation, 'no auto_distillation entry written');
  assert.ok(distillation.end_at, 'distillation entry should be closed (end_at set)');
  const payload = JSON.parse(distillation.payload_json);
  assert.equal(payload.state, 'complete');
  assert.ok(typeof payload.duration_ms === 'number');
});

// ─── AC-ALL-502 (exactly 1 notify) ──────────────────────────────────────────

test('AC-ALL-502: feature:close --verdict=PASS triggers exactly 1 tier-2 notify with summary', async () => {
  const dir = await makeProjectWithFeature({ slug: 'notify-test', classification: 'MEDIUM' });
  const { runFeatureClose } = require('../src/commands/feature-close');
  const captured = [];
  const logger = { log: (m) => captured.push(String(m)), error: () => {} };
  const r = await runFeatureClose({
    args: [dir],
    options: { feature: 'notify-test', verdict: 'PASS', json: true },
    logger
  });
  assert.equal(r.ok, true);
  // The notify is invoked via runNotify which appends to agent_events.
  const Database = require('better-sqlite3');
  const db = new Database(path.join(dir, '.aioson/runtime/aios.sqlite'), { readonly: true });
  try {
    // runNotify writes via logAgentEvent which integrates with the agent run
    // lifecycle: the FIRST event for a new agent run is event_type='start'
    // (not 'notify_info'). Filter by message content rather than event_type.
    const notifyRows = db.prepare(`SELECT event_type, message FROM agent_events`).all();
    const distillationNotifies = notifyRows.filter((row) =>
      String(row.message || '').includes('distillation') && /promoted/.test(String(row.message || ''))
    );
    assert.equal(distillationNotifies.length, 1, `expected exactly 1 distillation notify, got ${distillationNotifies.length}`);
  } finally {
    db.close();
  }
});

// ─── AC-ALL-503 (silent failure) ────────────────────────────────────────────

test('AC-ALL-503: failure inside distillation does NOT throw — feature-close exits ok=true and writes distillation_failed', async () => {
  const dir = await makeProjectWithFeature({ slug: 'fail-test', classification: 'MEDIUM' });

  // Inject a failure: monkey-patch the auto-promote command module to throw.
  const autoPromoteMod = require('../src/commands/learning-auto-promote');
  const original = autoPromoteMod.runLearningAutoPromote;
  autoPromoteMod.runLearningAutoPromote = async () => { throw new Error('synthetic failure'); };
  try {
    const { runFeatureClose } = require('../src/commands/feature-close');
    const r = await runFeatureClose({
      args: [dir],
      options: { feature: 'fail-test', verdict: 'PASS', json: true },
      logger: SILENT_LOGGER()
    });
    assert.equal(r.ok, true, 'feature:close must return ok=true even on distillation failure');
    const rows = getEvolutionRows(dir, 'fail-test');
    const failed = rows.find((r) => r.event_type === 'distillation_failed');
    assert.ok(failed, 'distillation_failed entry missing');
    const payload = JSON.parse(failed.payload_json);
    assert.equal(payload.error_phase, 'auto_promote');
    assert.ok(/synthetic failure/.test(payload.error_message));
  } finally {
    autoPromoteMod.runLearningAutoPromote = original;
  }
});

// ─── AC-ALL-504 (concurrency lock) ──────────────────────────────────────────

test('AC-ALL-504: BEGIN IMMEDIATE lock prevents double-distillation; second invocation no-ops with lock_held', async () => {
  const dir = await makeProjectWithFeature({ slug: 'concurrent', classification: 'MEDIUM' });
  // Hold a lock manually by inserting a fake in-progress row.
  const { db: lockDb } = await openRuntimeDb(dir);
  const { acquireDistillationLock } = require('../src/learning-loop-engine');
  const lock1 = acquireDistillationLock(lockDb, 'concurrent');
  assert.equal(lock1.acquired, true);

  // From a separate handle, try to acquire — should fail.
  const { db: db2 } = await openRuntimeDb(dir);
  const lock2 = acquireDistillationLock(db2, 'concurrent');
  assert.equal(lock2.acquired, false);
  assert.equal(lock2.lockHolder, lock1.lockId);

  // And full runDistillation on db2 returns lock_held cleanly.
  const result = await runDistillation({ targetDir: dir, slug: 'concurrent', db: db2 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'lock_held');

  lockDb.close();
  db2.close();
});

// ─── AC-ALL-505 (MICRO skip) ────────────────────────────────────────────────

test('AC-ALL-505: MICRO classification → zero evolution_log entries for this slug', async () => {
  const dir = await makeProjectWithFeature({ slug: 'micro-feat', classification: 'MICRO' });
  const { runFeatureClose } = require('../src/commands/feature-close');
  const r = await runFeatureClose({
    args: [dir],
    options: { feature: 'micro-feat', verdict: 'PASS', json: true },
    logger: SILENT_LOGGER()
  });
  assert.equal(r.ok, true);
  // MICRO → distillation == null (skipped entirely before opening DB)
  assert.equal(r.distillation, null);
  // No evolution_log entry for this slug.
  const Database = require('better-sqlite3');
  const dbPath = path.join(dir, '.aioson/runtime/aios.sqlite');
  if (fs.existsSync(dbPath)) {
    const db = new Database(dbPath, { readonly: true });
    try {
      const rows = db.prepare(`SELECT COUNT(*) AS c FROM evolution_log WHERE feature_slug = ?`).get('micro-feat');
      assert.equal(rows.c, 0);
    } finally {
      db.close();
    }
  }
  // updates line confirms skip
  assert.ok(r.updates.some((u) => /MICRO/.test(u)));
});

// ─── AC-ALL-506 (completes within 5s budget) ────────────────────────────────

test('AC-ALL-506: distillation produces an evolution_log entry within 5s of runDistillation returning', async () => {
  const dir = await makeProjectWithFeature({
    slug: 'budget-test',
    classification: 'MEDIUM',
    learnings: [{ id: 'pl-budget', title: 'sample', evidence: 'x', frequency: 5 }]
  });
  const { db } = await openRuntimeDb(dir);
  const t0 = Date.now();
  let result;
  try {
    result = await runDistillation({ targetDir: dir, slug: 'budget-test', db });
  } finally {
    db.close();
  }
  const elapsed = Date.now() - t0;
  assert.ok(elapsed < 5000, `runDistillation took ${elapsed}ms (> 5s budget)`);
  const rows = getEvolutionRows(dir, 'budget-test');
  const entry = rows.find((r) => r.event_type === 'auto_distillation' || r.event_type === 'distillation_failed');
  assert.ok(entry, 'no evolution_log entry within 5s');
});

// ─── --no-distill escape valve ──────────────────────────────────────────────

test('--no-distill flag skips the hook entirely', async () => {
  const dir = await makeProjectWithFeature({ slug: 'opt-out', classification: 'MEDIUM' });
  const { runFeatureClose } = require('../src/commands/feature-close');
  const r = await runFeatureClose({
    args: [dir],
    options: { feature: 'opt-out', verdict: 'PASS', json: true, 'no-distill': true },
    logger: SILENT_LOGGER()
  });
  assert.equal(r.ok, true);
  assert.equal(r.distillation, null);
  assert.ok(r.updates.some((u) => /--no-distill/.test(u)));
});

// ─── FAIL verdict skips ────────────────────────────────────────────────────

test('verdict=FAIL never runs distillation (QA already rejected)', async () => {
  const dir = await makeProjectWithFeature({ slug: 'failed-feat', classification: 'MEDIUM' });
  const { runFeatureClose } = require('../src/commands/feature-close');
  const r = await runFeatureClose({
    args: [dir],
    options: { feature: 'failed-feat', verdict: 'FAIL', notes: 'qa rejected', json: true },
    logger: SILENT_LOGGER()
  });
  assert.equal(r.ok, true);
  assert.equal(r.distillation, null);
});

// ─── readFeatureClassification ──────────────────────────────────────────────

test('readFeatureClassification parses prd-{slug}.md frontmatter', async () => {
  const dir = await makeProjectWithFeature({ slug: 'cls-test', classification: 'SMALL' });
  assert.equal(await readFeatureClassification(dir, 'cls-test'), 'SMALL');
});

test('readFeatureClassification returns null when PRD is missing', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'aios-fc5-empty-'));
  assert.equal(await readFeatureClassification(dir, 'nope'), null);
});

// ─── withTimeout helper ────────────────────────────────────────────────────

test('withTimeout rejects with _aioson_timeout flag when the promise exceeds the deadline', async () => {
  const slow = new Promise((resolve) => setTimeout(resolve, 500));
  try {
    await withTimeout(slow, 50);
    assert.fail('should have rejected on timeout');
  } catch (err) {
    assert.equal(err._aioson_timeout, true);
  }
});

test('withTimeout resolves with the workPromise value when it beats the deadline', async () => {
  const fast = Promise.resolve(42);
  const value = await withTimeout(fast, 1000);
  assert.equal(value, 42);
});
