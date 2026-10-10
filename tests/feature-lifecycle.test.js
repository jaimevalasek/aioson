'use strict';

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

const { triageFeatures, findingsOf, qaVerdictFrom } = require('../src/lib/feature-lifecycle');
const { canonicalStatus, parseFeatureRegistry, inspectFeatureRegistry } = require('../src/lib/feature-registry');
const { parseFeaturesMap } = require('../src/preflight-engine');
const { runFeatureTriage } = require('../src/commands/feature-triage');
const { runHygieneScan, classifyArtifactName } = require('../src/commands/hygiene-scan');
const { runDoctor } = require('../src/doctor');

const DAY = 24 * 60 * 60 * 1000;
// Ages are relative to the real clock: doctor, hygiene and the command read it too.
const NOW = Date.now();
const SILENT = { log() {}, error() {}, warn() {} };

// The shapes measured on consumer projects: QA passed and the row stayed open,
// rows spelled `in-progress`/`active`, open work untouched for weeks, a paused
// row from months ago, a closed row whose documents never left.
const REGISTRY = `# Features

| slug | status | started | completed |
|------|--------|---------|-----------|
| shipped | in_progress | 2026-09-01 | — |
| edited-after | in_progress | 2026-09-01 | — |
| quiet | in_progress | 2026-08-01 | — |
| current | in_progress | 2026-08-01 | — |
| old-pause | paused | 2026-05-01 | — |
| recent-pause | paused | 2026-09-20 | — |
| spelled | in-progress | 2026-10-01 | — |
| legacy-active | active | 2026-10-01 | — |
| closed | done | 2026-07-01 | 2026-07-10 |
| gone | done | 2026-06-01 | 2026-06-02 |
`;

let project;

async function write(rel, content, ageDays) {
  const file = path.join(project, rel);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content, 'utf8');
  if (ageDays !== undefined) {
    const when = new Date(NOW - ageDays * DAY);
    await fs.utimes(file, when, when);
  }
}

async function makeProject({ pulse = 'current' } = {}) {
  project = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-feature-lifecycle-'));
  await write('.aioson/context/features.md', REGISTRY);
  await write('.aioson/context/project-pulse.md', `---\nactive_feature: ${pulse}\n---\n\n# Project Pulse\n`);
  await write('.aioson/context/prd-shipped.md', '# Shipped\n', 5);
  await write('.aioson/context/qa-report-shipped.md', '---\nverdict: PASS\n---\n\n# QA\n', 4);
  await write('.aioson/context/qa-report-edited-after.md', '---\nverdict: PASS\n---\n\n# QA\n', 6);
  await write('.aioson/context/implementation-plan-edited-after.md', '# Plan\n', 2);
  await write('.aioson/context/prd-quiet.md', '# Quiet\n', 40);
  await write('.aioson/context/qa-report-quiet.md', '---\nverdict: FAIL\n---\n', 40);
  await write('.aioson/context/prd-current.md', '# Current\n', 40);
  await write('.aioson/context/prd-old-pause.md', '# Old\n', 90);
  await write('.aioson/context/prd-recent-pause.md', '# Recent\n', 10);
  await write('.aioson/context/prd-spelled.md', '# Spelled\n', 1);
  await write('.aioson/context/prd-legacy-active.md', '# Legacy\n', 1);
  await write('.aioson/context/prd-closed.md', '# Closed\n', 30);
  return project;
}

function kinds(triage, slug) {
  return triage.features.find((feature) => feature.slug === slug).findings.map((item) => item.kind);
}

afterEach(async () => {
  if (project) await fs.rm(project, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  project = null;
});

describe('status spellings', () => {
  it('maps hand-written spellings to the canonical token, never to done', () => {
    assert.equal(canonicalStatus('in-progress'), 'in_progress');
    assert.equal(canonicalStatus('In Progress'), 'in_progress');
    assert.equal(canonicalStatus('active'), 'in_progress');
    assert.equal(canonicalStatus('em andamento'), 'in_progress');
    assert.equal(canonicalStatus('on-hold'), 'paused');
    assert.equal(canonicalStatus('cancelado'), 'abandoned');
    assert.equal(canonicalStatus('completed'), null);
    assert.equal(canonicalStatus('shipped'), null);
  });

  it('parse reads the alias as canonical, measures it, and the doctor flags it', async () => {
    await makeProject();
    const registry = parseFeatureRegistry(REGISTRY);
    assert.equal(registry.rows.find((row) => row.slug === 'spelled').status, 'in_progress');
    assert.equal(registry.measures.aliasStatuses, 2);
    assert.equal((await inspectFeatureRegistry(project)).needsTidy, true);
    const report = await runDoctor(project);
    const check = report.checks.find((entry) => entry.id === 'context:feature_registry_noise');
    assert.equal(check.params.aliases, 2);
  });
});

describe('triageFeatures', () => {
  it('classifies each lifecycle shape from the context tree', async () => {
    await makeProject();
    const triage = await triageFeatures(project, { now: () => NOW });
    assert.equal(triage.ok, true);

    const shipped = findingsOf(triage, 'ready_to_close').find((item) => item.slug === 'shipped');
    assert.equal(shipped.verdict, 'PASS');
    assert.equal(shipped.changed_after_qa, false);
    assert.equal(shipped.decides, 'owner');

    const edited = findingsOf(triage, 'ready_to_close').find((item) => item.slug === 'edited-after');
    assert.equal(edited.changed_after_qa, true, 'a plan rewritten after the verdict needs re-verification');

    assert.deepEqual(kinds(triage, 'quiet'), ['stale_open']);
    assert.deepEqual(kinds(triage, 'current'), [], 'the active feature is never called stale');
    assert.deepEqual(kinds(triage, 'old-pause'), ['stale_paused']);
    assert.deepEqual(kinds(triage, 'recent-pause'), []);
    assert.deepEqual(kinds(triage, 'spelled'), ['status_alias']);
    assert.deepEqual(kinds(triage, 'legacy-active'), ['status_alias']);
    assert.deepEqual(kinds(triage, 'closed'), ['closed_not_archived']);
    assert.deepEqual(kinds(triage, 'gone'), []);
    assert.equal(triage.summary.open_features, 6);
  });

  it('flags a pulse that names a closed feature, and stays quiet on pre-PRD work', async () => {
    await makeProject({ pulse: 'closed' });
    let triage = await triageFeatures(project, { now: () => NOW });
    assert.deepEqual(triage.project.map((item) => item.kind), ['active_is_closed']);

    await fs.rm(project, { recursive: true, force: true });
    await makeProject({ pulse: 'new-idea' });
    await write('.aioson/briefings/new-idea/briefings.md', '# Idea\n');
    triage = await triageFeatures(project, { now: () => NOW });
    assert.deepEqual(triage.project, []);

    await fs.rm(path.join(project, '.aioson', 'briefings'), { recursive: true, force: true });
    triage = await triageFeatures(project, { now: () => NOW });
    assert.deepEqual(triage.project.map((item) => item.kind), ['active_not_registered']);
  });

  it('reads verdicts from frontmatter or a Verdict line, in either language', () => {
    assert.equal(qaVerdictFrom('---\nverdict: PASS\n---\n'), 'pass');
    assert.equal(qaVerdictFrom('# QA\n\n**Verdict:** ACCEPTED_WITH_FOLLOWUPS\n'), 'accepted_with_followups');
    assert.equal(qaVerdictFrom('# QA\n\nVeredito: reprovado\n'), 'fail');
    assert.equal(qaVerdictFrom(''), null);
  });
});

describe('feature:triage', () => {
  async function registry() {
    return parseFeaturesMap(await fs.readFile(path.join(project, '.aioson', 'context', 'features.md'), 'utf8'));
  }

  it('without flags only reads', async () => {
    await makeProject();
    const before = await fs.readFile(path.join(project, '.aioson', 'context', 'features.md'), 'utf8');
    const result = await runFeatureTriage({ args: [project], options: { json: true }, logger: SILENT });
    assert.equal(result.readonly, true);
    assert.equal(await fs.readFile(path.join(project, '.aioson', 'context', 'features.md'), 'utf8'), before);
  });

  it('refuses every decision the evidence contradicts, and then changes nothing', async () => {
    await makeProject();
    const before = await fs.readFile(path.join(project, '.aioson', 'context', 'features.md'), 'utf8');
    const result = await runFeatureTriage({
      args: [project],
      options: { json: true, close: 'quiet,edited-after', pause: 'current', abandon: 'closed', resume: 'quiet', apply: true },
      logger: SILENT
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'decision_refused');
    const refused = result.refusals.map((item) => `${item.action}:${item.slug}`).sort();
    assert.deepEqual(refused, ['abandon:closed', 'close:edited-after', 'close:quiet', 'pause:current', 'resume:quiet']);
    assert.equal(await fs.readFile(path.join(project, '.aioson', 'context', 'features.md'), 'utf8'), before);
  });

  it('--apply rewrites spellings and archives closed work; decisions move rows through their owners', async () => {
    await makeProject();
    const result = await runFeatureTriage({
      args: [project],
      options: { json: true, apply: true, pause: 'quiet', abandon: 'old-pause', resume: 'recent-pause' },
      logger: SILENT
    });
    assert.equal(result.ok, true, JSON.stringify(result));
    const rows = await registry();
    assert.equal(rows.get('spelled'), 'in_progress');
    assert.equal(rows.get('legacy-active'), 'in_progress');
    assert.equal(rows.get('quiet'), 'paused');
    assert.equal(rows.get('old-pause'), 'abandoned');
    assert.equal(rows.get('recent-pause'), 'in_progress');
    await assert.rejects(fs.access(path.join(project, '.aioson', 'context', 'prd-closed.md')));
    await fs.access(path.join(project, '.aioson', 'context', 'done', 'closed'));
    await fs.access(path.join(project, '.aioson', 'context', 'abandoned', 'old-pause'));
    assert.equal(result.after.counts.status_alias, undefined);
    assert.equal(result.after.counts.closed_not_archived, undefined);
  });

  it('--close runs feature:close with the verdict QA recorded', async () => {
    await makeProject();
    const result = await runFeatureTriage({ args: [project], options: { json: true, close: 'shipped' }, logger: SILENT });
    const action = result.actions.find((item) => item.slug === 'shipped');
    assert.equal(action.verdict, 'PASS');
    assert.equal(action.ok, true, JSON.stringify(action));
    assert.equal((await registry()).get('shipped'), 'done');
    await fs.access(path.join(project, '.aioson', 'context', 'done', 'shipped'));
  });

  it('a blocked close is reported with its preflight command, never forced', async () => {
    await makeProject();
    // A harness contract with no criteria fails the close's integrity gate.
    await write('.aioson/plans/shipped/harness-contract.json', '{"feature":"shipped"}', 10);
    const result = await runFeatureTriage({ args: [project], options: { json: true, close: 'shipped' }, logger: SILENT });
    const action = result.actions.find((item) => item.slug === 'shipped');
    assert.equal(result.ok, false);
    assert.equal(action.ok, false);
    assert.match(action.hint, /--preflight/);
    assert.equal((await registry()).get('shipped'), 'in_progress');
  });

  it('--dry-run validates and previews without writing', async () => {
    await makeProject();
    const before = await fs.readFile(path.join(project, '.aioson', 'context', 'features.md'), 'utf8');
    const result = await runFeatureTriage({ args: [project], options: { json: true, apply: true, pause: 'quiet', 'dry-run': true }, logger: SILENT });
    assert.equal(result.dryRun, true);
    assert.equal(result.plan.mechanical.status_alias, 2);
    assert.equal(await fs.readFile(path.join(project, '.aioson', 'context', 'features.md'), 'utf8'), before);
  });
});

describe('doctor surfaces the lifecycle on every run', () => {
  it('counts what passed QA but never closed, what went quiet and what never left', async () => {
    await makeProject();
    const report = await runDoctor(project);
    const check = report.checks.find((entry) => entry.id === 'context:feature_lifecycle');
    assert.equal(check.severity, 'warning');
    assert.deepEqual(check.params, { ready: 2, stale: 2, unarchived: 1 });
  });

  it('stays silent when every feature is where it belongs', async () => {
    project = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-feature-lifecycle-'));
    await write('.aioson/context/features.md', '| slug | status | started | completed |\n|---|---|---|---|\n| fresh | in_progress | 2026-10-08 | — |\n');
    await write('.aioson/context/prd-fresh.md', '# Fresh\n');
    const report = await runDoctor(project);
    assert.ok(!report.checks.some((entry) => entry.id === 'context:feature_lifecycle'));
  });
});

describe('hygiene:scan surfaces the lifecycle', () => {
  it('reports ready-to-close, stale and alias rows by slug', async () => {
    await makeProject();
    const result = await runHygieneScan({ args: [project], options: { json: true }, logger: SILENT });
    const slugs = (bucket) => result.buckets[bucket].map((item) => item.slug).sort();
    assert.deepEqual(slugs('features_ready_to_close'), ['edited-after', 'shipped']);
    assert.ok(slugs('stale_features').includes('old-pause'));
    assert.deepEqual(slugs('feature_status_aliases'), ['legacy-active', 'spelled']);
  });

  it('reads spec-analyze reports as owned by their feature', () => {
    assert.equal(classifyArtifactName('spec-analyze-checkout.json').slug, 'checkout');
  });
});
