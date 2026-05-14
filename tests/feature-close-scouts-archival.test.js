'use strict';

// Phase 3 ACs W3, W4, W8 — feature:close archival hook for sub-task scouts.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { runFeatureClose } = require('../src/commands/feature-close');

function makeLogger() {
  const lines = [];
  return { lines, log(line = '') { lines.push(String(line)); }, error(line = '') { lines.push(String(line)); } };
}

async function makeProject({ withScouts = [], featureSlug = 'foo-feature' } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-feature-close-scouts-'));
  // Minimal project structure for feature:close to do its job.
  await fs.mkdir(path.join(dir, '.aioson', 'context'), { recursive: true });
  await fs.writeFile(
    path.join(dir, '.aioson', 'context', 'features.md'),
    `# Features\n\n| slug | status | started | completed |\n|------|--------|---------|-----------|\n| ${featureSlug} | in_progress | 2026-05-13 | — |\n`,
    'utf8'
  );
  await fs.writeFile(
    path.join(dir, '.aioson', 'context', `spec-${featureSlug}.md`),
    `---\nfeature: ${featureSlug}\nstatus: in_progress\n---\n# Spec\n`,
    'utf8'
  );
  // PRD so feature-archive doesn't choke
  await fs.writeFile(
    path.join(dir, '.aioson', 'context', `prd-${featureSlug}.md`),
    `---\nslug: ${featureSlug}\n---\n# PRD\n`,
    'utf8'
  );

  // Seed scout files
  if (withScouts.length > 0) {
    const scoutsDir = path.join(dir, '.aioson', 'runtime', 'scouts');
    await fs.mkdir(scoutsDir, { recursive: true });
    for (const scout of withScouts) {
      await fs.writeFile(path.join(scoutsDir, `${scout.id}.json`), JSON.stringify(scout, null, 2), 'utf8');
    }
  }
  return dir;
}

function makeScoutReport(overrides = {}) {
  return {
    schema_version: 1,
    id: 'scout-foo-feature-2026-05-13-aaa111',
    parent_agent: 'deyvin',
    parent_session_id: 'sess-1',
    parent_session_excerpt: 'Sample excerpt long enough to satisfy the 50-1000 char range required for cold-load comprehension downstream.',
    feature_slug: 'foo-feature',
    question: 'Where does X happen and why?',
    scope: { paths: ['src/x.js'], globs: [], exclude: [], files_resolved: ['src/x.js'] },
    completed_at: '2026-05-13T14:32:11.123Z',
    status: 'success',
    confidence: 'high',
    recommendation: 'Add transition guard at the persisted-state read path in module foo to avoid stale reads.',
    findings: [],
    files_inspected: ['src/x.js'],
    ...overrides
  };
}

// W3 — archival happy path + dossier auto-append
test('W3 — feature:close archives scouts with matching feature_slug + dossier append', async () => {
  const a = makeScoutReport({ id: 'scout-foo-feature-2026-05-13-aaa111' });
  const b = makeScoutReport({ id: 'scout-foo-feature-2026-05-13-bbb222', question: 'Why does Y break under load?', confidence: 'medium' });
  const other = makeScoutReport({ id: 'scout-other-2026-05-13-zzz999', feature_slug: 'other-feature' });
  const dir = await makeProject({ withScouts: [a, b, other] });

  const result = await runFeatureClose({
    args: [dir],
    options: { feature: 'foo-feature', verdict: 'PASS', json: true, 'no-archive': true },
    logger: makeLogger()
  });
  assert.equal(result.ok, true, JSON.stringify(result));

  // Two scouts archived to features/foo-feature/scouts/
  const archiveDir = path.join(dir, '.aioson', 'context', 'features', 'foo-feature', 'scouts');
  assert.ok(fsSync.existsSync(path.join(archiveDir, `${a.id}.json`)));
  assert.ok(fsSync.existsSync(path.join(archiveDir, `${b.id}.json`)));
  // The other-feature scout NOT archived under foo-feature.
  assert.ok(!fsSync.existsSync(path.join(archiveDir, `${other.id}.json`)));

  // Originals still in runtime/scouts/ (BR-09 idempotent contract; archival
  // doesn't delete the runtime copy).
  const runtimeDir = path.join(dir, '.aioson', 'runtime', 'scouts');
  assert.ok(fsSync.existsSync(path.join(runtimeDir, `${a.id}.json`)));

  // Dossier auto-appended with both scout ids.
  const dossier = fsSync.readFileSync(
    path.join(dir, '.aioson', 'context', 'features', 'foo-feature', 'dossier.md'),
    'utf8'
  );
  assert.ok(dossier.includes(a.id));
  assert.ok(dossier.includes(b.id));
  assert.ok(dossier.includes('## Sub-task scouts'));
});

// W4 — feature:close with zero attached scouts is a no-op (no error)
test('W4 — feature:close with zero attached scouts: archival is no-op', async () => {
  const dir = await makeProject({ withScouts: [] });
  const result = await runFeatureClose({
    args: [dir],
    options: { feature: 'foo-feature', verdict: 'PASS', json: true, 'no-archive': true },
    logger: makeLogger()
  });
  assert.equal(result.ok, true);
  // scoutArchive present but archived empty
  assert.ok(result.scoutArchive);
  assert.equal(result.scoutArchive.archived.length, 0);
});

// W3 idempotency — re-running feature:close with same scouts doesn't duplicate dossier bullets
test('W3 — re-running feature:close is idempotent on dossier', async () => {
  const a = makeScoutReport({ id: 'scout-foo-feature-2026-05-13-idem99' });
  const dir = await makeProject({ withScouts: [a] });

  await runFeatureClose({ args: [dir], options: { feature: 'foo-feature', verdict: 'PASS', json: true, 'no-archive': true }, logger: makeLogger() });
  await runFeatureClose({ args: [dir], options: { feature: 'foo-feature', verdict: 'PASS', json: true, 'no-archive': true }, logger: makeLogger() });

  const dossier = fsSync.readFileSync(
    path.join(dir, '.aioson', 'context', 'features', 'foo-feature', 'dossier.md'),
    'utf8'
  );
  const occurrences = (dossier.match(/scout-foo-feature-2026-05-13-idem99/g) || []).length;
  assert.equal(occurrences, 1, `expected exactly one bullet for the scout id, got ${occurrences}`);
});
