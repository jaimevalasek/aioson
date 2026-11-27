'use strict';

/**
 * Outcome records — the practices a delivery used and how it went, measured
 * without a model at the close, and what the records show across deliveries.
 * The failure this guards against: the evidence of "how it went" was pruned
 * by feature:close (runtime DB, done/{slug}/ evidence), so nothing could ever
 * say that, for this person, screens drawn as images went with QA passing
 * the first time — and no agent could offer it at the next briefing.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { buildRecord, recordOutcome } = require('../src/lib/outcomes/record');
const { readRecord, writeRecord, readRecords } = require('../src/lib/outcomes/ledger');
const { analyze } = require('../src/lib/outcomes/report');
const { renderReport } = require('../src/lib/outcomes/report-render');
const { practiceTips, MAX_TIP_BYTES } = require('../src/lib/outcomes/tips');
const { closeFinishedSimplePlans } = require('../src/lib/outcomes/simple-plan-hook');
const { runFeatureClose } = require('../src/commands/feature-close');

const CLI = path.join(__dirname, '..', 'bin', 'aioson.js');

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function project({ name = 'Loja Bella', classification = 'SMALL' } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-outcome-'));
  write(path.join(dir, '.aioson', 'context', 'project.context.md'), `---\nproject_name: "${name}"\nproject_type: "web_app"\nprofile: "developer"\nframework: "Laravel"\nclassification: "${classification}"\ninteraction_language: "pt-BR"\nconversation_language: "pt-BR"\naioson_version: "1.84.2"\n---\n\n# Project\n`);
  return dir;
}

function featureArtifacts(dir, slug, { images = true } = {}) {
  const ctx = path.join(dir, '.aioson', 'context');
  write(path.join(ctx, `prd-${slug}.md`), `---\nfeature: ${slug}\nclassification: SMALL\nsheldon_review: approved\n---\n\n# PRD — ${slug}\n`);
  write(path.join(ctx, `implementation-plan-${slug}.md`), `---\nfeature: ${slug}\n---\n\n# Plan\n\n## Phase 1 — Data\n\n- a\n\n## Phase 2 — Screens\n\n- b\n`);
  write(path.join(ctx, `test-report-${slug}.md`), '# Test report\n');
  write(path.join(ctx, 'features.md'), `| slug | status | started | completed |\n|------|--------|---------|-----------|\n| ${slug} | in_progress | 2026-11-20 | — |\n`);
  write(path.join(dir, 'plans', slug, images ? 'tela-checkout.png' : 'notas.md'), images ? 'png' : '# notas\n');
  write(path.join(dir, '.aioson', 'briefings', slug, 'briefings.md'), '# Briefing\n');
}

function synthetic(feature, practices, firstPass, extra = {}) {
  return {
    schema: 1, feature, kind: 'feature', classification: 'SMALL', verdict: 'PASS',
    closed_at: `2026-11-${String(10 + readRecords.length).padStart(2, '0')}T12:00:00.000Z`, aioson_version: '1.84.2', catalog_version: 1,
    shape: 'single-dev', autopilot: false, practices, outcome: { first_pass: firstPass, fail_cycles: firstPass ? 0 : 2 }, ...extra
  };
}

function evidenceSet() {
  return [
    synthetic('a1', { visual_inputs: true }, true),
    synthetic('a2', { visual_inputs: true }, true),
    synthetic('a3', { visual_inputs: true }, true),
    synthetic('b1', { visual_inputs: false }, false),
    synthetic('b2', { visual_inputs: false }, false),
    synthetic('b3', { visual_inputs: false }, true)
  ];
}

test('the record reads the practices from the artifacts and holds only schema fields', async () => {
  const dir = project();
  featureArtifacts(dir, 'checkout-flow');
  const result = await recordOutcome(dir, 'checkout-flow', { verdict: 'PASS', now: Date.parse('2026-11-27T12:00:00Z') });
  assert.equal(result.ok, true, result.error);
  const record = readRecord(dir, 'checkout-flow');
  assert.equal(record.classification, 'SMALL');
  assert.equal(record.practices.visual_inputs, true);
  assert.equal(record.practices.prd_reviewed, true);
  assert.equal(record.practices.phased_plan, true);
  assert.equal(record.practices.tests_reported, true);
  assert.equal(record.practices.shakedown, false);
  assert.equal(record.shape, 'single-dev');
  assert.equal(record.outcome.duration_hours, 7 * 24 + 12);
  assert.equal(record.outcome.first_pass, null, 'no trail and no QA report: unknown, never assumed');
  const text = fs.readFileSync(path.join(dir, '.aioson', 'outcomes', 'checkout-flow.json'), 'utf8');
  for (const leak of ['Loja', 'Bella', 'tela-checkout', 'Laravel', 'PRD']) assert.ok(!text.includes(leak), `${leak} leaked into the record`);
});

test('screens reach the record through the briefing\'s source_plans, never outside the project', async () => {
  const dir = project();
  const slug = 'painel-vendas';
  write(path.join(dir, '.aioson', 'context', `prd-${slug}.md`), `---\nfeature: ${slug}\nclassification: SMALL\n---\n\n# PRD\n`);
  write(path.join(dir, 'plans', 'prints-telas', 'Screenshot_1.png'), 'png');
  write(path.join(dir, '.aioson', 'briefings', 'config.md'), `---\nupdated_at: 2026-11-27\nbriefings:\n  - slug: vendas-briefing\n    status: approved\n    source_plans: ["plans/prints-telas", "../outside", "conversational"]\n    created_at: "2026-11-20"\n    prd_generated: "prd-${slug}.md"\n---\n\n# Briefings Registry\n`);
  const record = await buildRecord(dir, slug, { verdict: 'PASS' });
  assert.equal(record.practices.visual_inputs, true);
  assert.equal(record.practices.document_inputs, false);
});

test('a re-close keeps the person\'s answer', async () => {
  const dir = project();
  featureArtifacts(dir, 'checkout-flow');
  await recordOutcome(dir, 'checkout-flow', { verdict: 'FAIL' });
  const first = readRecord(dir, 'checkout-flow');
  assert.equal(first.outcome.first_pass, false);
  first.feedback = { rating: 4, good: 'ok', bad: '', answered_at: '2026-11-27T12:00:00.000Z' };
  writeRecord(dir, first);
  const again = await buildRecord(dir, 'checkout-flow', { verdict: 'PASS' });
  assert.deepEqual(again.feedback, first.feedback);
});

test('a practice is "better" only with three deliveries on each side and a clear gap', () => {
  const strong = analyze(evidenceSet());
  assert.equal(strong.best.length, 1);
  assert.equal(strong.best[0].id, 'visual_inputs');
  assert.equal(strong.best[0].strength, 'strong');
  const thin = analyze(evidenceSet().slice(1));
  assert.equal(thin.best.length, 0, 'two against three is not evidence');
  const md = renderReport(strong, { locale: 'pt-BR' });
  assert.match(md, /Telas ou referências em imagem na entrada: QA de primeira em 3\/3 com a prática vs 1\/3 sem \(features SMALL\)/);
  assert.match(md, /"Associado a" não é "causa"/);
  assert.match(renderReport(thin, { locale: 'pt-BR' }), /Ainda não há evidência forte/);
});

test('the rating decides when first-pass QA is not on record', () => {
  const rated = (feature, visual, rating) => synthetic(feature, { visual_inputs: visual }, null, { feedback: { rating, good: '', bad: '', answered_at: '2026-11-27T12:00:00.000Z' } });
  const analysis = analyze([rated('a', true, 5), rated('b', true, 5), rated('c', true, 4), rated('d', false, 3), rated('e', false, 2), rated('f', false, 3)]);
  assert.equal(analysis.best[0].metric, 'rating');
});

test('the tip reaches only the agents that shape a delivery, once, and not when the practice is in use', async () => {
  const dir = project();
  const records = evidenceSet();
  const tips = await practiceTips(dir, { agent: 'product', locale: 'pt-BR', records, portfolio: [] });
  assert.equal(tips.length, 1);
  assert.match(tips[0], /^Prática medida: Telas ou referências em imagem/);
  assert.ok(Buffer.byteLength(tips[0]) <= MAX_TIP_BYTES);
  assert.deepEqual(await practiceTips(dir, { agent: 'dev', records, portfolio: [] }), []);
  featureArtifacts(dir, 'with-screens', { images: true });
  assert.deepEqual(await practiceTips(dir, { agent: '@briefing', feature: 'with-screens', records, portfolio: [] }), []);
  assert.deepEqual(await practiceTips(dir, { agent: 'refiner', records: records.slice(1), portfolio: [] }), []);
});

test('feature:close records the outcome before it archives, and never opens a screen in a test run', async () => {
  const dir = project();
  featureArtifacts(dir, 'checkout-flow');
  const result = await runFeatureClose({ args: [dir], options: { feature: 'checkout-flow', verdict: 'FAIL', json: true }, logger: { log() {}, error() {} } });
  assert.equal(result.closed, true);
  assert.equal(result.outcome.file, '.aioson/outcomes/checkout-flow.json');
  assert.equal(result.outcome.feedback.reason, 'not_accepted');
  assert.ok(result.updates.some((line) => /^outcome: \.aioson\/outcomes\/checkout-flow\.json/.test(line)));
  assert.equal(readRecord(dir, 'checkout-flow').verdict, 'FAIL');
  assert.ok(fs.existsSync(path.join(dir, '.aioson', 'outcomes', 'REPORT.md')));
});

test('a simple plan finished now is recorded once; old, abandoned and feature plans are not', async () => {
  const dir = project();
  const plans = path.join(dir, '.aioson', 'context', 'simple-plans');
  write(path.join(plans, 'fix-header.md'), '---\nstatus: done\nupdated_at: 2026-11-27\n---\n\n# Fix header\n');
  write(path.join(plans, 'old-fix.md'), '---\nstatus: done\nupdated_at: 2026-10-01\n---\n\n# Old\n');
  const old = Date.now() / 1000 - 10 * 24 * 60 * 60;
  fs.utimesSync(path.join(plans, 'old-fix.md'), old, old);
  write(path.join(plans, 'gave-up.md'), '---\nstatus: abandoned\n---\n\n# Gave up\n');
  const first = await closeFinishedSimplePlans(dir);
  assert.deepEqual(first.recorded, ['fix-header']);
  assert.equal(readRecord(dir, 'fix-header').kind, 'simple-plan');
  assert.equal(readRecord(dir, 'fix-header').verdict, 'DONE');
  assert.equal(first.feedback.reason, 'test_run');
  assert.deepEqual((await closeFinishedSimplePlans(dir)).recorded, []);
});

function cli(args, home) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env: { ...process.env, HOME: home, USERPROFILE: home, AIOSON_PROJECT_REGISTRY: 'false' } });
}

test('the CLI saves a review from flags, scrubbed, and refuses a bad snooze with exit 1', () => {
  const dir = project();
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-outcome-home-'));
  writeRecord(dir, synthetic('checkout-flow', { visual_inputs: true }, true));
  const saved = cli(['outcome:feedback', dir, '--feature=checkout-flow', '--rating=5', '--good=A Loja Bella ficou linda em C:\\dev\\loja', '--json'], home);
  assert.equal(saved.status, 0, saved.stderr);
  assert.equal(JSON.parse(saved.stdout).feedback.good, 'A [removido] ficou linda em [removido]');
  const snooze = cli(['outcome:feedback', dir, '--snooze=year', '--json'], home);
  assert.equal(snooze.status, 1);
  const never = cli(['outcome:feedback', dir, '--never', '--json'], home);
  assert.equal(never.status, 0, never.stderr);
  assert.equal(JSON.parse(fs.readFileSync(path.join(home, '.aioson', 'outcomes.json'), 'utf8')).feedback.state, 'off');
  const report = cli(['outcome:report', dir, '--json'], home);
  assert.equal(report.status, 0, report.stderr);
  assert.equal(JSON.parse(report.stdout).analysis.total, 1);
});
