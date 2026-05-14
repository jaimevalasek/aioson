'use strict';

/**
 * Active Learning Loop — Phase 6 inception self-test (AC-ALL-601).
 *
 * Simulates 5 feature closures inside an isolated tmpdir greenfield workspace
 * (NOT the live `.aioson/runtime/aios.sqlite`) and asserts that the 3 new
 * doctor curation checks settle at `ok=true` afterward.
 *
 * The simulation:
 *  1. Install template to tmpdir (greenfield).
 *  2. For each of 5 fictional MEDIUM features:
 *     a. Write prd-{slug}.md + spec-{slug}.md + append to features.md.
 *     b. Emit `rule_loaded` telemetry for every template rule (simulating an
 *        agent that loaded them — clears `rule_staleness`).
 *     c. Run `aioson feature:close` (which fires the Phase 5 distillation
 *        hook → writes one `auto_distillation` row per feature; clears
 *        `distillation_lag` because closed_count == distillation_count).
 *  3. Run `aioson doctor` and verify zero `ok=false` curation checks.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { installTemplate } = require('../src/installer');
const { openRuntimeDb, appendContextLoadEvent } = require('../src/runtime-store');
const { runFeatureClose } = require('../src/commands/feature-close');
const { runDoctor } = require('../src/doctor');

const SILENT_LOGGER = () => ({ log: () => {}, error: () => {} });

async function listInstalledRuleSlugs(targetDir) {
  const dir = path.join(targetDir, '.aioson', 'rules');
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.md') && !e.name.startsWith('_'))
    .map((e) => e.name.slice(0, -3));
}

function writeFeatureArtifacts(targetDir, { slug, classification = 'MEDIUM', completedDate }) {
  const ctxDir = path.join(targetDir, '.aioson', 'context');
  fs.mkdirSync(ctxDir, { recursive: true });
  fs.writeFileSync(
    path.join(ctxDir, `prd-${slug}.md`),
    `---\nclassification: ${classification}\n---\n\n# PRD — ${slug}\n`
  );
  fs.writeFileSync(
    path.join(ctxDir, `spec-${slug}.md`),
    `---\nfeature: ${slug}\nstatus: in_progress\n---\n\n# Spec — ${slug}\n`
  );
  // Ensure project-pulse.md exists (feature-close reads it).
  const pulsePath = path.join(ctxDir, 'project-pulse.md');
  if (!fs.existsSync(pulsePath)) {
    fs.writeFileSync(pulsePath, '# Project Pulse\n');
  }
}

function upsertFeatureRow(targetDir, slug, status, completed) {
  const file = path.join(targetDir, '.aioson', 'context', 'features.md');
  let existing;
  try { existing = fs.readFileSync(file, 'utf8'); }
  catch { existing = '# Features\n\n| slug | status | started | completed |\n|------|--------|---------|-----------|\n'; }
  const lines = existing.split('\n');
  const idx = lines.findIndex((l) => l.startsWith(`| ${slug} |`));
  const row = `| ${slug} | ${status} | 2026-05-01 | ${completed || '—'} |`;
  if (idx >= 0) lines[idx] = row;
  else lines.push(row);
  fs.writeFileSync(file, lines.join('\n'));
}

test('AC-ALL-601: 5 simulated feature closures produce zero ok=false curation checks (inception self-test)', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'aioson-inception-'));

  // 1. Greenfield install.
  await installTemplate(dir, { overwrite: true, mode: 'install' });

  // Strip the live features.md that the template ships with (so the test
  // controls the full feature ledger).
  fs.writeFileSync(
    path.join(dir, '.aioson', 'context', 'features.md'),
    '# Features\n\n| slug | status | started | completed |\n|------|--------|---------|-----------|\n'
  );

  // 2. Enumerate the rules the template installed — we will mark them all
  //    as "recently loaded" so `rule_staleness` doesn't fire.
  const ruleSlugs = await listInstalledRuleSlugs(dir);
  assert.ok(ruleSlugs.length > 0, 'template should ship at least one rule');

  // 3. Define 5 fictional MEDIUM features.
  const fictional = [
    { slug: 'inc-feat-1', completed: '2026-05-10' },
    { slug: 'inc-feat-2', completed: '2026-05-11' },
    { slug: 'inc-feat-3', completed: '2026-05-12' },
    { slug: 'inc-feat-4', completed: '2026-05-13' },
    { slug: 'inc-feat-5', completed: '2026-05-14' }
  ];

  // 4. For each feature: write artifacts, register a row in features.md as
  //    in_progress, emit rule_loaded telemetry, then feature:close → PASS.
  for (const f of fictional) {
    writeFeatureArtifacts(dir, { slug: f.slug, classification: 'MEDIUM' });
    upsertFeatureRow(dir, f.slug, 'in_progress', '—');

    // Emit rule_loaded events for every rule under this feature's flag so
    // assessRuleStaleness sees them as "loaded inside the recent window".
    const { db } = await openRuntimeDb(dir);
    try {
      for (const slug of ruleSlugs) {
        appendContextLoadEvent(db, {
          eventType: 'rule_loaded',
          agentName: 'dev',
          payload: {
            target_slug: slug,
            target_path: `.aioson/rules/${slug}.md`,
            feature_slug: f.slug
          }
        });
      }
    } finally {
      db.close();
    }

    // eslint-disable-next-line no-await-in-loop
    const closure = await runFeatureClose({
      args: [dir],
      options: { feature: f.slug, verdict: 'PASS', json: true },
      logger: SILENT_LOGGER()
    });
    assert.equal(closure.ok, true, `feature:close failed for ${f.slug}`);
    assert.ok(closure.distillation && closure.distillation.ok, `distillation hook failed for ${f.slug}`);
  }

  // 5. Run doctor and verify the 3 curation checks all settled to ok=true.
  const report = await runDoctor(dir);
  const curation = report.checks.filter((c) =>
    c.id && /(rule_staleness|learning_orphans|distillation_lag)/.test(c.id)
  );
  assert.equal(curation.length, 3, `expected 3 curation checks, got ${curation.length}`);

  for (const check of curation) {
    assert.equal(
      check.ok,
      true,
      `inception self-test failed: ${check.id} returned ok=false (params=${JSON.stringify(check.params)})`
    );
  }

  // Sanity: distillation_lag specifically should show 5 closed / 5 distillations.
  const lag = curation.find((c) => c.id === 'living-memory:distillation_lag');
  assert.equal(lag.params.closed, 5);
  assert.equal(lag.params.distillations, 5);
});
