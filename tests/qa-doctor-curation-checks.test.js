'use strict';

/**
 * QA Phase 4 — doctor-curation-checks coverage pins.
 *
 * Beyond the dev tests/doctor-curation-checks.test.js this suite pins:
 *  - Performance budget (10k rule_loaded events, p99 <200ms per plan note)
 *  - target_slug-only matching path in assessLearningOrphans (when payload has
 *    no target_path field, basename derived from promoted_to is the fallback)
 *  - doctor JSON output exposes the new curation summary on `livingMemory.curation`
 *  - Rule enumeration is flat (convention: `.aioson/rules/<slug>.md`; nested
 *    `.aioson/rules/<sub>/<slug>.md` are NOT counted — this is a documented
 *    limit of the flat convention used by `learning-auto-promote.js`)
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  openRuntimeDb,
  insertProjectLearning,
  appendContextLoadEvent
} = require('../src/runtime-store');
const {
  listRuleSlugs,
  assessRuleStaleness,
  assessLearningOrphans
} = require('../src/learning-loop-doctor');
const { runDoctor } = require('../src/doctor');

async function makeFixture({ classification = 'MEDIUM', features = [], rules = [] } = {}) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'aios-qa4-'));
  fs.mkdirSync(path.join(dir, '.aioson', 'context'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.aioson', 'rules'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, '.aioson', 'context', 'project.context.md'),
    `---\nclassification: "${classification}"\n---\n`
  );
  const lines = [
    '# Features', '',
    '| slug | status | started | completed |',
    '|------|--------|---------|-----------|'
  ];
  for (const f of features) lines.push(`| ${f.slug} | done | 2026-05-01 | ${f.completed || '2026-05-01'} |`);
  fs.writeFileSync(path.join(dir, '.aioson', 'context', 'features.md'), lines.join('\n') + '\n');
  for (const r of rules) fs.writeFileSync(path.join(dir, '.aioson', 'rules', `${r}.md`), 'body');
  return dir;
}

test('QA-PERF-04: assessRuleStaleness p99 <200ms across 10k rule_loaded events', async () => {
  const dir = await makeFixture({
    features: [{ slug: 'feat-1', completed: '2026-05-01' }],
    rules: ['ruleA', 'ruleB', 'ruleC']
  });
  const { db } = await openRuntimeDb(dir);
  try {
    // Seed 10k events inside one transaction for speed: 8k for ruleA in recent
    // feature, 2k for ruleB in feat-99 (old). ruleC has no event.
    const tx = db.transaction(() => {
      for (let i = 0; i < 8000; i++) {
        appendContextLoadEvent(db, {
          eventType: 'rule_loaded',
          agentName: 'dev',
          payload: { target_slug: 'ruleA', target_path: '.aioson/rules/ruleA.md', feature_slug: 'feat-1' }
        });
      }
      for (let i = 0; i < 2000; i++) {
        appendContextLoadEvent(db, {
          eventType: 'rule_loaded',
          agentName: 'dev',
          payload: { target_slug: 'ruleB', target_path: '.aioson/rules/ruleB.md', feature_slug: 'feat-99' }
        });
      }
    });
    tx();

    const N = 20;
    const lats = new Array(N);
    for (let i = 0; i < N; i++) {
      const t0 = process.hrtime.bigint();
      // eslint-disable-next-line no-await-in-loop
      await assessRuleStaleness({ db, targetDir: dir, threshold: 5, recentFeatureSlugs: ['feat-1'] });
      lats[i] = Number(process.hrtime.bigint() - t0) / 1e6;
    }
    lats.sort((a, b) => a - b);
    const p99 = lats[Math.floor(N * 0.99)];
    assert.ok(p99 < 200, `p99 ${p99.toFixed(2)}ms exceeds 200ms budget over 10k events`);
  } finally {
    db.close();
  }
});

test('QA-ORPHAN-MATCH: learning_orphans matches target_slug when target_path absent (basename derivation from promoted_to)', async () => {
  const dir = await makeFixture({ rules: ['legacy-slug-only'] });
  const { db } = await openRuntimeDb(dir);
  try {
    insertProjectLearning(db, {
      learningId: 'pl-legacy',
      title: 'legacy',
      evidence: 'x',
      type: 'process',
      status: 'promoted',
      promotedTo: '.aioson/rules/legacy-slug-only.md'
    });
    db.prepare(`UPDATE project_learnings SET updated_at = ? WHERE learning_id = ?`)
      .run('2026-05-01T00:00:00.000Z', 'pl-legacy');
    appendContextLoadEvent(db, {
      eventType: 'rule_loaded',
      agentName: 'dev',
      createdAt: '2026-05-10T00:00:00.000Z',
      payload: { target_slug: 'legacy-slug-only' } // intentionally no target_path
    });

    const out = await assessLearningOrphans({ db });
    assert.equal(out.ok, true, 'orphan check should be ok=true when target_slug matches promoted_to basename');
    assert.equal(out.items.length, 0);
  } finally {
    db.close();
  }
});

test('QA-JSON-SHAPE: doctor report exposes livingMemory.curation summary', async () => {
  const dir = await makeFixture({
    features: [{ slug: 'feat-1', completed: '2026-05-01' }],
    rules: ['shape-rule']
  });
  const report = await runDoctor(dir);
  assert.ok(report.livingMemory, 'report.livingMemory missing');
  assert.ok(report.livingMemory.curation, 'report.livingMemory.curation missing');
  assert.equal(report.livingMemory.curation.classification, 'MEDIUM');
  assert.equal(report.livingMemory.curation.closedFeatureCount, 1);
  assert.equal(report.livingMemory.curation.stalenessThreshold, 5);
  assert.equal(report.livingMemory.curation.dbError, null);
});

test('QA-FLAT-CONVENTION: listRuleSlugs enumerates only top-level rules — nested directories not recursed', async () => {
  const dir = await makeFixture({ rules: ['top-level'] });
  fs.mkdirSync(path.join(dir, '.aioson', 'rules', 'squad'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.aioson', 'rules', 'squad', 'nested-rule.md'), 'body');

  const slugs = await listRuleSlugs(dir);
  assert.deepEqual(slugs.sort(), ['top-level'], 'nested rules should NOT be enumerated (flat convention)');
});

test('QA-EXCLUDE-ARCHIVED-DIR: _archived/ directory is excluded from rule enumeration', async () => {
  const dir = await makeFixture({ rules: ['alive-rule'] });
  fs.mkdirSync(path.join(dir, '.aioson', 'rules', '_archived', '2026-05-14'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, '.aioson', 'rules', '_archived', '2026-05-14', 'archived-rule.md'),
    'body'
  );
  const slugs = await listRuleSlugs(dir);
  assert.deepEqual(slugs.sort(), ['alive-rule'], '_archived/ contents leaked into enumeration');
});

test('QA-FRESH-INSTALL: doctor on a project without any aios.sqlite emits 3 curation checks with ok=true (EC-ALL-11)', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'aios-qa4-fresh-'));
  fs.mkdirSync(path.join(dir, '.aioson', 'context'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, '.aioson', 'context', 'project.context.md'),
    '---\nclassification: "MEDIUM"\n---\n'
  );
  const report = await runDoctor(dir);
  const curation = report.checks.filter((c) =>
    c.id && c.id.startsWith('living-memory:') && /(rule_staleness|learning_orphans|distillation_lag)/.test(c.id)
  );
  assert.equal(curation.length, 3);
  for (const c of curation) {
    assert.equal(c.ok, true, `fresh install: ${c.id} should be ok=true`);
  }
});
