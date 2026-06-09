'use strict';

/**
 * QA Phase 5 — feature-close-distillation-hook coverage pins.
 *
 * Beyond the dev tests/feature-close-distillation.test.js this suite pins:
 *  - 10-way concurrency stress (BEGIN IMMEDIATE lock holds; exactly 1 success)
 *  - Promise.race timeout enforcement (slow auto-promote → distillation_failed
 *    with error_phase='timeout' within budget+jitter)
 *  - Stuck-lock V1 behavior (crash mid-distillation leaves end_at=NULL;
 *    subsequent invocations cleanly return lock_held — V2 trajectory:
 *    doctor `distillation_stuck` + `memory:unlock`)
 *  - Sequential feature:close re-runs distillation each time (no lock leak)
 *  - i18n keys for learning_loop are present across all 4 locales
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { openRuntimeDb } = require('../src/runtime-store');
const {
  runDistillation,
  acquireDistillationLock
} = require('../src/learning-loop-engine');

async function makeProject(slug, classification = 'MEDIUM') {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'aios-qa5-'));
  fs.mkdirSync(path.join(dir, '.aioson', 'context'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.aioson', 'rules'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, '.aioson', 'context', `prd-${slug}.md`),
    `---\nclassification: ${classification}\n---\n`
  );
  fs.writeFileSync(
    path.join(dir, '.aioson', 'context', `spec-${slug}.md`),
    `---\nfeature: ${slug}\nstatus: in_progress\n---\n`
  );
  fs.writeFileSync(
    path.join(dir, '.aioson', 'context', 'features.md'),
    `# Features\n\n| slug | status | started | completed |\n|------|--------|---------|-----------|\n| ${slug} | in_progress | 2026-05-01 | — |\n`
  );
  fs.writeFileSync(path.join(dir, '.aioson', 'context', 'project-pulse.md'), '# Project Pulse\n');
  return dir;
}

test('QA-CONCURRENCY-PHASE5: 10 parallel runDistillation on same slug → exactly 1 success + 9 lock_held', async () => {
  const dir = await makeProject('race10');
  const calls = await Promise.all(
    Array.from({ length: 10 }, async () => {
      const { db } = await openRuntimeDb(dir);
      try {
        return await runDistillation({ targetDir: dir, slug: 'race10', db });
      } finally {
        db.close();
      }
    })
  );
  const successes = calls.filter((r) => r.ok);
  const lockHeld = calls.filter((r) => !r.ok && r.reason === 'lock_held');
  assert.equal(successes.length, 1, `expected 1 success, got ${successes.length}`);
  assert.equal(lockHeld.length, 9, `expected 9 lock_held, got ${lockHeld.length}`);

  // evolution_log should have exactly 1 auto_distillation entry for this slug.
  const Database = require('better-sqlite3');
  const db = new Database(path.join(dir, '.aioson/runtime/aios.sqlite'), { readonly: true });
  try {
    const { c } = db.prepare(
      `SELECT COUNT(*) AS c FROM evolution_log WHERE feature_slug = ? AND event_type = 'auto_distillation'`
    ).get('race10');
    assert.equal(c, 1, `expected exactly 1 auto_distillation entry, got ${c}`);
  } finally {
    db.close();
  }
});

test('QA-TIMEOUT: slow auto-promote triggers Promise.race timeout — distillation_failed with error_phase=timeout', async () => {
  const dir = await makeProject('timeout-test');
  const autoPromoteMod = require('../src/commands/learning-auto-promote');
  const original = autoPromoteMod.runLearningAutoPromote;
  autoPromoteMod.runLearningAutoPromote = () => new Promise(
    (resolve) => setTimeout(() => resolve({ ok: true, promoted: [], noted: [], skipped: [] }), 8000)
  );
  try {
    const { db } = await openRuntimeDb(dir);
    const t0 = Date.now();
    let result;
    try {
      // Use 200ms timeout to keep the test fast; the engine accepts any value.
      result = await runDistillation({ targetDir: dir, slug: 'timeout-test', db, timeoutMs: 200 });
    } finally {
      db.close();
    }
    const elapsed = Date.now() - t0;

    assert.equal(result.ok, false);
    assert.equal(result.reason, 'auto_promote_failed');
    assert.equal(result.error_phase, 'timeout');
    // The mock resolves at 8000ms; the 200ms timeout must fire well before that.
    // A 5000ms ceiling cleanly separates "timeout fired" (~200ms + jitter) from
    // "timeout did not fire" (~8000ms) while tolerating parallel-suite scheduler
    // contention on Windows.
    assert.ok(elapsed < 5000, `runDistillation took ${elapsed}ms (timeout did not fire)`);

    // evolution_log should carry the failed state.
    const Database = require('better-sqlite3');
    const dbR = new Database(path.join(dir, '.aioson/runtime/aios.sqlite'), { readonly: true });
    try {
      const failed = dbR.prepare(
        `SELECT payload_json FROM evolution_log WHERE feature_slug = ? AND event_type = 'distillation_failed'`
      ).get('timeout-test');
      assert.ok(failed, 'distillation_failed entry not written');
      const payload = JSON.parse(failed.payload_json);
      assert.equal(payload.error_phase, 'timeout');
    } finally {
      dbR.close();
    }
  } finally {
    autoPromoteMod.runLearningAutoPromote = original;
  }
});

test('QA-STUCK-LOCK-V1: crash mid-distillation leaves end_at=NULL; subsequent invocations cleanly return lock_held', async () => {
  // Documented V1 limitation per decision-concurrency.md: stuck rows survive
  // crashes; manual cleanup needed until V2 ships `distillation_stuck` doctor
  // check + `memory:unlock` command.
  const dir = await makeProject('stuck-test');
  const { db } = await openRuntimeDb(dir);
  try {
    // Simulate crash: acquire lock but never release.
    const lock = acquireDistillationLock(db, 'stuck-test');
    assert.equal(lock.acquired, true);
  } finally {
    db.close();
  }
  // New invocation finds the lock still held.
  const { db: db2 } = await openRuntimeDb(dir);
  try {
    const result = await runDistillation({ targetDir: dir, slug: 'stuck-test', db: db2 });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'lock_held');
  } finally {
    db2.close();
  }
});

test('QA-SEQUENTIAL-CLOSURES: 3 sequential feature:close on the same slug each create their own auto_distillation entry', async () => {
  const dir = await makeProject('sequential');
  const { runFeatureClose } = require('../src/commands/feature-close');
  const featuresPath = path.join(dir, '.aioson/context/features.md');

  for (let i = 0; i < 3; i++) {
    // Reset state so feature-close has work to do
    fs.writeFileSync(
      featuresPath,
      `# Features\n\n| slug | status | started | completed |\n|------|--------|---------|-----------|\n| sequential | in_progress | 2026-05-01 | — |\n`
    );
    fs.mkdirSync(path.join(dir, '.aioson', 'context'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.aioson', 'context', 'prd-sequential.md'), '---\nclassification: MEDIUM\n---\n');
    fs.writeFileSync(path.join(dir, '.aioson', 'context', 'spec-sequential.md'), '---\nfeature: sequential\nstatus: in_progress\n---\n');
    // eslint-disable-next-line no-await-in-loop
    const r = await runFeatureClose({
      args: [dir],
      options: { feature: 'sequential', verdict: 'PASS', json: true },
      logger: { log: () => {}, error: () => {} }
    });
    assert.equal(r.ok, true);
    assert.equal(r.distillation && r.distillation.ok, true, `closure #${i + 1} distillation failed`);
  }

  const Database = require('better-sqlite3');
  const db = new Database(path.join(dir, '.aioson/runtime/aios.sqlite'), { readonly: true });
  try {
    const rows = db.prepare(
      `SELECT end_at FROM evolution_log WHERE feature_slug = ? AND event_type = 'auto_distillation' ORDER BY rowid`
    ).all('sequential');
    assert.equal(rows.length, 3, `expected 3 auto_distillation entries, got ${rows.length}`);
    for (const row of rows) {
      assert.ok(row.end_at, 'sequential closure left a lock open (end_at=NULL)');
    }
  } finally {
    db.close();
  }
});

test('QA-I18N-PHASE5: doctor.learning_loop keys present in all 4 locales', () => {
  const locales = ['en', 'pt-BR', 'es', 'fr'];
  const keys = [
    'distillation_complete',
    'distillation_failed_silent',
    'skipped_micro',
    'skipped_no_distill',
    'lock_held',
    'notify_template'
  ];
  for (const lang of locales) {
    const msgs = require(`../src/i18n/messages/${lang}`);
    assert.ok(msgs && msgs.doctor && msgs.doctor.learning_loop, `${lang}: doctor.learning_loop missing`);
    for (const k of keys) {
      assert.ok(msgs.doctor.learning_loop[k], `${lang}: missing key doctor.learning_loop.${k}`);
    }
  }
});

test('QA-CONFIG-PHASE5: template/.aioson/config/learning-loop.json carries the documented defaults', () => {
  const raw = fs.readFileSync(path.join('template', '.aioson', 'config', 'learning-loop.json'), 'utf8');
  const cfg = JSON.parse(raw);
  assert.equal(cfg.enabled, true);
  assert.deepEqual(cfg.skip_on_classification, ['MICRO']);
  assert.equal(cfg.execution_mode, 'foreground');
  assert.equal(cfg.lock_strategy, 'sqlite-row');
  assert.equal(cfg.auto_promote_threshold, 3);
  assert.equal(cfg.timeout_ms, 5000);
});
