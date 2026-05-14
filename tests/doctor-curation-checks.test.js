'use strict';

// Active Learning Loop — Phase 4 (doctor-curation-checks) acceptance tests.
// Covers AC-ALL-401..406 + threshold formula + MICRO opt-out + DB-absent edge case.

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
  computeStalenessThreshold,
  readProjectClassification,
  readClosedFeatures,
  assessRuleStaleness,
  assessLearningOrphans,
  assessDistillationLag,
  MIN_STALENESS_FEATURES
} = require('../src/learning-loop-doctor');
const { insertEvolutionEntry } = require('../src/learning-loop-archive');
const { runDoctor } = require('../src/doctor');

async function makeProject({ classification = 'MEDIUM', features = [], rules = [] } = {}) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'aios-doc4-'));
  fs.mkdirSync(path.join(dir, '.aioson', 'context'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.aioson', 'rules'), { recursive: true });
  const ctx = [
    '---',
    'project_name: "fixture"',
    `classification: "${classification}"`,
    'conversation_language: "en"',
    '---',
    '# Project Context'
  ].join('\n');
  fs.writeFileSync(path.join(dir, '.aioson', 'context', 'project.context.md'), ctx);
  // features.md
  const header = ['# Features', '', '| slug | status | started | completed |', '|------|--------|---------|-----------|'];
  for (const f of features) {
    header.push(`| ${f.slug} | ${f.status || 'done'} | ${f.started || '2026-05-01'} | ${f.completed || '2026-05-01'} |`);
  }
  fs.writeFileSync(path.join(dir, '.aioson', 'context', 'features.md'), header.join('\n') + '\n');
  for (const slug of rules) {
    fs.writeFileSync(path.join(dir, '.aioson', 'rules', `${slug}.md`), `---\nname: ${slug}\n---\nbody`);
  }
  return dir;
}

// ─── computeStalenessThreshold (pure) ───────────────────────────────────────

test('computeStalenessThreshold returns MIN_STALENESS_FEATURES (5) when <2 dates', () => {
  assert.equal(computeStalenessThreshold([]), MIN_STALENESS_FEATURES);
  assert.equal(computeStalenessThreshold(['2026-01-01']), MIN_STALENESS_FEATURES);
});

test('computeStalenessThreshold returns 5 for typical weekly cadence', () => {
  // 5 features 7 days apart → avg = 7 days → ceil(7/7) = 1 → max(5,1) = 5
  const dates = ['2026-01-01', '2026-01-08', '2026-01-15', '2026-01-22', '2026-01-29'];
  assert.equal(computeStalenessThreshold(dates), 5);
});

test('computeStalenessThreshold extends to >5 for low-velocity projects', () => {
  // 5 features 42 days apart → avg = 42 days → ceil(42/7) = 6 → max(5,6) = 6
  const dates = ['2026-01-01', '2026-02-12', '2026-03-26', '2026-05-07', '2026-06-18'];
  assert.equal(computeStalenessThreshold(dates), 6);
});

test('computeStalenessThreshold ignores invalid dates', () => {
  const dates = ['2026-01-01', 'not-a-date', '2026-01-08'];
  assert.equal(computeStalenessThreshold(dates), 5);
});

// ─── readProjectClassification + readClosedFeatures (FS readers) ────────────

test('readProjectClassification returns the frontmatter value', async () => {
  const dir = await makeProject({ classification: 'SMALL' });
  assert.equal(await readProjectClassification(dir), 'SMALL');
});

test('readProjectClassification returns null when file missing', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'aios-doc4-empty-'));
  assert.equal(await readProjectClassification(dir), null);
});

test('readClosedFeatures parses pipe-table rows for status=done only', async () => {
  const dir = await makeProject({
    features: [
      { slug: 'feat-a', status: 'done', completed: '2026-05-01' },
      { slug: 'feat-b', status: 'in_progress', completed: '—' },
      { slug: 'feat-c', status: 'done', completed: '2026-05-08' }
    ]
  });
  const closed = await readClosedFeatures(dir);
  assert.deepEqual(closed.map((f) => f.slug), ['feat-a', 'feat-c']);
});

// ─── AC-ALL-401 (rule_staleness) ────────────────────────────────────────────

test('AC-ALL-401: rule_staleness fires for rules with no rule_loaded in last N features', async () => {
  const features = [
    { slug: 'feat-1', completed: '2026-05-01' },
    { slug: 'feat-2', completed: '2026-05-02' },
    { slug: 'feat-3', completed: '2026-05-03' }
  ];
  const dir = await makeProject({
    features,
    rules: ['always-loaded', 'never-loaded', 'old-loaded']
  });
  const { db } = await openRuntimeDb(dir);
  try {
    // always-loaded: emitted in feat-3 (recent)
    appendContextLoadEvent(db, {
      eventType: 'rule_loaded',
      agentName: 'dev',
      payload: { target_slug: 'always-loaded', target_path: '.aioson/rules/always-loaded.md', feature_slug: 'feat-3' }
    });
    // old-loaded: emitted in feat-99 (not in recent set)
    appendContextLoadEvent(db, {
      eventType: 'rule_loaded',
      agentName: 'dev',
      payload: { target_slug: 'old-loaded', target_path: '.aioson/rules/old-loaded.md', feature_slug: 'feat-99' }
    });
    // never-loaded: no event

    const assessment = await assessRuleStaleness({
      db, targetDir: dir, threshold: 5,
      recentFeatureSlugs: features.map((f) => f.slug)
    });
    assert.equal(assessment.ok, false);
    const slugs = assessment.items.map((i) => i.slug).sort();
    assert.deepEqual(slugs, ['never-loaded', 'old-loaded']);
  } finally {
    db.close();
  }
});

test('rule_staleness counts events with feature_slug=NULL as "loaded somewhere"', async () => {
  const dir = await makeProject({
    features: [{ slug: 'feat-1', completed: '2026-05-01' }],
    rules: ['external-load']
  });
  const { db } = await openRuntimeDb(dir);
  try {
    appendContextLoadEvent(db, {
      eventType: 'rule_loaded',
      agentName: 'dev',
      payload: { target_slug: 'external-load', target_path: '.aioson/rules/external-load.md' } // no feature_slug
    });
    const assessment = await assessRuleStaleness({
      db, targetDir: dir, threshold: 5, recentFeatureSlugs: ['feat-1']
    });
    assert.equal(assessment.ok, true, 'rule loaded with NULL feature_slug must count');
  } finally {
    db.close();
  }
});

// ─── AC-ALL-402 (learning_orphans) ──────────────────────────────────────────

test('AC-ALL-402: learning_orphans fires for promoted learnings without post-promotion rule_loaded', async () => {
  const dir = await makeProject({ rules: ['used-promoted', 'orphan-promoted'] });
  const { db } = await openRuntimeDb(dir);
  try {
    insertProjectLearning(db, {
      learningId: 'pl-used',
      title: 'used learning',
      evidence: 'x',
      type: 'process',
      status: 'promoted',
      promotedTo: '.aioson/rules/used-promoted.md'
    });
    insertProjectLearning(db, {
      learningId: 'pl-orphan',
      title: 'orphan learning',
      evidence: 'y',
      type: 'process',
      status: 'promoted',
      promotedTo: '.aioson/rules/orphan-promoted.md'
    });
    // Bump updated_at on both to a known timestamp so we can post-date the event
    db.prepare(`UPDATE project_learnings SET updated_at = ? WHERE learning_id = ?`).run('2026-05-01T00:00:00.000Z', 'pl-used');
    db.prepare(`UPDATE project_learnings SET updated_at = ? WHERE learning_id = ?`).run('2026-05-01T00:00:00.000Z', 'pl-orphan');
    // pl-used: rule loaded AFTER promotion
    appendContextLoadEvent(db, {
      eventType: 'rule_loaded',
      agentName: 'dev',
      createdAt: '2026-05-10T00:00:00.000Z',
      payload: { target_slug: 'used-promoted', target_path: '.aioson/rules/used-promoted.md' }
    });
    // pl-orphan: no post-promotion event

    const assessment = await assessLearningOrphans({ db });
    assert.equal(assessment.ok, false);
    const ids = assessment.items.map((i) => i.learning_id).sort();
    assert.deepEqual(ids, ['pl-orphan']);
  } finally {
    db.close();
  }
});

test('learning_orphans returns ok=true when no promoted learnings exist', async () => {
  const dir = await makeProject();
  const { db } = await openRuntimeDb(dir);
  try {
    const assessment = await assessLearningOrphans({ db });
    assert.equal(assessment.ok, true);
    assert.equal(assessment.items.length, 0);
  } finally {
    db.close();
  }
});

// ─── AC-ALL-403 (distillation_lag) ──────────────────────────────────────────

test('AC-ALL-403: distillation_lag fires when 5+ done features but <N auto_distillation events', async () => {
  const features = Array.from({ length: 6 }, (_, i) => ({
    slug: `feat-${i + 1}`,
    completed: `2026-05-0${i + 1}`
  }));
  const dir = await makeProject({ features });
  const { db } = await openRuntimeDb(dir);
  try {
    // Insert auto_distillation for only 3 features
    for (const f of features.slice(0, 3)) {
      insertEvolutionEntry(db, {
        eventType: 'auto_distillation',
        targetType: 'learning',
        targetId: `pl-${f.slug}`,
        featureSlug: f.slug,
        actor: 'auto'
      });
    }
    const closed = await readClosedFeatures(dir);
    const assessment = await assessDistillationLag({ db, closedFeatures: closed });
    assert.equal(assessment.ok, false, 'should fire when distillations < closed');
    assert.equal(assessment.params.closed, 6);
    assert.equal(assessment.params.distillations, 3);
    const missing = assessment.items.map((i) => i.slug).sort();
    assert.deepEqual(missing, ['feat-4', 'feat-5', 'feat-6']);
  } finally {
    db.close();
  }
});

test('distillation_lag returns ok=true when <5 closed features (under threshold)', async () => {
  const features = Array.from({ length: 4 }, (_, i) => ({ slug: `feat-${i + 1}`, completed: `2026-05-0${i + 1}` }));
  const dir = await makeProject({ features });
  const { db } = await openRuntimeDb(dir);
  try {
    const closed = await readClosedFeatures(dir);
    const assessment = await assessDistillationLag({ db, closedFeatures: closed });
    assert.equal(assessment.ok, true, 'under-threshold should not fire');
    assert.equal(assessment.params.closed, 4);
  } finally {
    db.close();
  }
});

// ─── AC-ALL-404 (warning severity, doctor.ok unchanged) ─────────────────────

test('AC-ALL-404: 3 curation checks emit at severity=warning; doctor.ok unaffected', async () => {
  // Use a fresh project with a stale rule so rule_staleness fires.
  const features = [{ slug: 'feat-1', completed: '2026-05-01' }];
  const dir = await makeProject({ features, rules: ['definitely-stale'] });
  const report = await runDoctor(dir);
  const curation = report.checks.filter((c) => c.id && c.id.startsWith('living-memory:') && /(rule_staleness|learning_orphans|distillation_lag)/.test(c.id));
  assert.equal(curation.length, 3, `expected 3 curation checks, got ${curation.length}`);
  for (const c of curation) {
    assert.equal(c.severity, 'warning', `${c.id} is not severity=warning`);
  }
  // Warnings should not flip overall ok (only errors do).
  // (Other error checks may exist for missing CLAUDE.md etc. — we only assert
  // that the curation warnings themselves don't drive ok.)
  const errorChecks = report.checks.filter((c) => !c.ok && c.severity !== 'warning');
  assert.equal(report.ok, errorChecks.length === 0);
});

// ─── AC-ALL-405 (JSON shape) ────────────────────────────────────────────────

test('AC-ALL-405: curation checks carry the documented JSON fields', async () => {
  const dir = await makeProject({
    features: [{ slug: 'feat-1', completed: '2026-05-01' }],
    rules: ['shape-check']
  });
  const report = await runDoctor(dir);
  const check = report.checks.find((c) => c.id === 'living-memory:rule_staleness');
  assert.ok(check);
  // schema: { id, severity, key, params, ok, hintKey?, hintParams? }
  assert.equal(typeof check.id, 'string');
  assert.equal(check.severity, 'warning');
  assert.equal(typeof check.key, 'string');
  assert.equal(typeof check.params, 'object');
  assert.equal(typeof check.ok, 'boolean');
});

// ─── AC-ALL-406 (i18n keys present in 4 locales) ────────────────────────────

test('AC-ALL-406: i18n keys present in en/pt-BR/es/fr', async () => {
  const locales = ['en', 'pt-BR', 'es', 'fr'];
  const keys = [
    'rule_staleness', 'rule_staleness_hint', 'rule_staleness_skipped_micro',
    'learning_orphans', 'learning_orphans_hint', 'learning_orphans_skipped_micro',
    'distillation_lag', 'distillation_lag_hint', 'distillation_lag_skipped_micro'
  ];
  for (const lang of locales) {
    const msgs = require(`../src/i18n/messages/${lang}`);
    assert.ok(msgs && msgs.doctor && msgs.doctor.living_memory, `${lang}: doctor.living_memory missing`);
    for (const k of keys) {
      assert.ok(msgs.doctor.living_memory[k], `${lang}: missing key doctor.living_memory.${k}`);
    }
  }
});

// ─── BR-ALL-11 (MICRO opt-out) ──────────────────────────────────────────────

test('BR-ALL-11: MICRO project skips all 3 curation checks with skipped_micro hint key', async () => {
  const dir = await makeProject({
    classification: 'MICRO',
    features: Array.from({ length: 6 }, (_, i) => ({ slug: `feat-${i + 1}`, completed: `2026-05-0${i + 1}` })),
    rules: ['would-be-stale']
  });
  const report = await runDoctor(dir);
  const checks = report.checks.filter((c) => c.id && c.id.startsWith('living-memory:') && /(rule_staleness|learning_orphans|distillation_lag)/.test(c.id));
  assert.equal(checks.length, 3);
  for (const c of checks) {
    assert.equal(c.ok, true, `MICRO should mark ${c.id} as ok=true`);
    assert.ok(/skipped_micro/.test(c.key), `MICRO should use skipped_micro key (got ${c.key})`);
  }
});

// ─── EC-ALL-11 (fresh install, no runtime DB) ───────────────────────────────

test('EC-ALL-11: fresh install (no aios.sqlite) — checks emit ok=true', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'aios-doc4-fresh-'));
  fs.mkdirSync(path.join(dir, '.aioson', 'context'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, '.aioson', 'context', 'project.context.md'),
    '---\nclassification: "MEDIUM"\n---\n'
  );
  // No features.md, no aios.sqlite, no rules — pristine state
  const report = await runDoctor(dir);
  const curation = report.checks.filter((c) => c.id && c.id.startsWith('living-memory:') && /(rule_staleness|learning_orphans|distillation_lag)/.test(c.id));
  assert.equal(curation.length, 3);
  for (const c of curation) {
    assert.equal(c.ok, true, `fresh install: ${c.id} should be ok=true`);
  }
});
