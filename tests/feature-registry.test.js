'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

const {
  parseFeatureRegistry,
  serializeFeatureRegistry,
  tidyFeatureRegistry,
  inspectFeatureRegistry
} = require('../src/lib/feature-registry');
const { parseFeaturesMap } = require('../src/preflight-engine');
const { runFeatureRegister, runFeatureTidy } = require('../src/commands/feature-registry');
const { runFeatureClose } = require('../src/commands/feature-close');
const { runDoctor, applyDoctorFixes } = require('../src/doctor');

// The shape measured on a long-lived project: narrative HTML comments between
// rows, rows appended after the comments (no table header above them), one
// comment left unclosed across lines, and a note naming no registered slug.
const NOISY = `# Features

| slug | status | started | completed |
|------|--------|---------|-----------|
| billing | done | 2026-01-04 | 2026-01-09 |
| checkout | in_progress | 2026-02-01 | — |
| legacy-import | paused | 2026-02-02 | — |
<!-- billing: escopo fechado com o dono em 2026-01-09; ver PRD arquivado. -->
<!-- checkout: paralela a legacy-import por confirmação do dono. -->
| search | in_progress | 2026-03-01 | — |
| reports | planning | 2026-03-05 | — |
<!-- reports: registrada a partir de pedido direto do dono

CONFIGURAÇÃO POR PROJETO, 2026-03-06: decisão longa que atravessa linhas. -->
<!-- uma observação solta sem slug -->
`;

async function makeProject(content = NOISY) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-feature-registry-'));
  const ctx = path.join(root, '.aioson', 'context');
  await fs.mkdir(ctx, { recursive: true });
  if (content !== null) await fs.writeFile(path.join(ctx, 'features.md'), content, 'utf8');
  return { root, ctx };
}

// Active rows come before Closed ones, so compare slug → status, not order.
function statuses(content) {
  return [...parseFeaturesMap(content)].sort(([a], [b]) => a.localeCompare(b));
}

function lastInProgress(content) {
  return content.split(/\r?\n/).filter((line) => /\|\s*in_progress\s*\|/.test(line)).pop();
}

describe('feature registry — parse and measure', () => {
  it('measures notes, headerless rows and keeps every row', () => {
    const registry = parseFeatureRegistry(NOISY);
    assert.equal(registry.recognized, true);
    assert.equal(registry.rows.length, 5);
    assert.equal(registry.measures.notes, 4);
    assert.equal(registry.measures.headerlessRows, 2);
    assert.equal(registry.measures.duplicates, 0);
    assert.deepEqual(
      registry.notes.map((note) => note.slug),
      ['billing', 'checkout', 'reports', null]
    );
    // The multi-line comment keeps its whole text — nothing leaks out as prose.
    assert.match(registry.notes[2].text, /CONFIGURAÇÃO POR PROJETO/);
  });

  it('flags an unclosed comment and keeps its text as a note', () => {
    const registry = parseFeatureRegistry('| slug | status | started | completed |\n|---|---|---|---|\n| a | in_progress | 2026-01-01 | — |\n<!-- a: never closed\n| b | done | 2026-01-01 | 2026-01-02 |\n');
    assert.equal(registry.measures.unclosedComment, true);
    assert.equal(registry.rows.length, 1, 'a row inside an unclosed comment is invisible in Markdown too');
    assert.match(registry.notes[0].text, /never closed/);
  });

  it('keeps the last duplicate row (routing semantics) and the earlier one as a note', () => {
    const registry = parseFeatureRegistry('| slug | status | started | completed |\n|---|---|---|---|\n| a | in_progress | 2026-01-01 | — |\n| a | paused | 2026-01-01 | — |\n');
    assert.equal(registry.rows.length, 1);
    assert.equal(registry.rows[0].status, 'paused');
    assert.equal(registry.measures.duplicates, 1);
    assert.equal(registry.notes[0].slug, 'a');
  });

  it('refuses a hand-made format with prose and no table rows', () => {
    const registry = parseFeatureRegistry('# Features\n\n- checkout: done\n- billing: in_progress\n');
    assert.equal(registry.recognized, false);
  });
});

describe('feature registry — canonical serialization', () => {
  it('preserves every status the routing parser reads and the last in_progress row', () => {
    const out = serializeFeatureRegistry(parseFeatureRegistry(NOISY));
    assert.deepEqual(statuses(out), statuses(NOISY));
    assert.equal(lastInProgress(out), lastInProgress(NOISY).replace(/\s+/g, ' ').trim());
    assert.ok(!out.includes('<!--'), 'rows only');
    assert.match(out, /## In progress[\s\S]*checkout[\s\S]*## Planning[\s\S]*reports[\s\S]*## Paused[\s\S]*legacy-import[\s\S]*## Done[\s\S]*billing/);
    assert.match(out, /^2 in progress · 1 planning · 1 paused · 1 done$/m);
    assert.ok(!out.includes('## Abandoned'), 'empty sections are omitted');
  });

  it('groups by situation: QA states stay in progress, closed sections read newest first', () => {
    const out = serializeFeatureRegistry(parseFeatureRegistry([
      '| slug | status | started | completed |',
      '|---|---|---|---|',
      '| old | done | 2026-01-01 | 2026-01-05 |',
      '| wip-a | in_progress | 2026-03-01 | — |',
      '| fresh | done | 2026-02-01 | 2026-04-02 |',
      '| blocked | qa_blocked | 2026-03-02 | — |',
      '| dropped | abandoned | 2026-02-03 | 2026-02-04 |',
      '| wip-b | in_progress | 2026-01-15 | — |',
      '| odd | draft | — | — |'
    ].join('\n')));
    const order = (heading) => {
      const section = out.split(`## ${heading}\n`)[1].split('\n## ')[0];
      return section.split('\n').filter((line) => /^\| [a-z]/.test(line) && !/^\| slug/.test(line)).map((line) => line.split('|')[1].trim());
    };
    assert.deepEqual(order('In progress'), ['wip-a', 'blocked', 'wip-b'], 'file order kept');
    assert.deepEqual(order('Done'), ['fresh', 'old'], 'newest completed first');
    assert.deepEqual(order('Abandoned'), ['dropped']);
    assert.deepEqual(order('Other'), ['odd'], 'an unknown status is never hidden');
    assert.equal(lastInProgress(out).split('|')[1].trim(), 'wip-b');
  });

  it('an empty registry still renders a table', () => {
    const out = serializeFeatureRegistry(parseFeatureRegistry(''));
    assert.match(out, /## In progress\n\n\| slug \| status \| started \| completed \|/);
    assert.equal(parseFeatureRegistry(out).recognized, true);
  });

  it('is idempotent and has no headerless rows', () => {
    const once = serializeFeatureRegistry(parseFeatureRegistry(NOISY));
    const twice = serializeFeatureRegistry(parseFeatureRegistry(once));
    assert.equal(twice, once);
    assert.equal(parseFeatureRegistry(once).measures.headerlessRows, 0);
    assert.equal(parseFeatureRegistry(once).measures.notes, 0);
  });

  it('keeps legacy notes verbatim at the bottom when asked, and reads them back as notes', () => {
    const registry = parseFeatureRegistry(NOISY);
    const out = serializeFeatureRegistry(registry, { keepNotes: registry.notes });
    const back = parseFeatureRegistry(out);
    assert.equal(back.measures.notes, registry.measures.notes);
    assert.equal(back.measures.headerlessRows, 0);
    assert.deepEqual(back.notes.map((note) => note.text), registry.notes.map((note) => note.text));
  });
});

describe('feature:tidy', () => {
  let project;
  beforeEach(async () => { project = await makeProject(); });
  afterEach(async () => { await fs.rm(project.root, { recursive: true, force: true }); });

  it('dry-run writes nothing', async () => {
    const result = await tidyFeatureRegistry(project.root, { dryRun: true });
    assert.equal(result.changed, true);
    assert.equal(await fs.readFile(path.join(project.ctx, 'features.md'), 'utf8'), NOISY);
    await assert.rejects(fs.access(path.join(project.ctx, 'features', 'checkout', 'registry-notes.md')));
    await assert.rejects(fs.access(path.join(project.root, '.aioson', 'backups')));
  });

  it('relocates every note losslessly beside its feature, live or archived, with a backup', async () => {
    await fs.mkdir(path.join(project.ctx, 'done', 'billing', 'dossier'), { recursive: true });
    const result = await runFeatureTidy({ args: [project.root], options: { json: true } });
    assert.equal(result.ok, true);

    const after = await fs.readFile(path.join(project.ctx, 'features.md'), 'utf8');
    assert.ok(!after.includes('<!--'));
    assert.deepEqual(statuses(after), statuses(NOISY));

    const read = (rel) => fs.readFile(path.join(project.ctx, rel), 'utf8');
    assert.match(await read('done/billing/dossier/registry-notes.md'), /escopo fechado com o dono/);
    assert.match(await read('features/checkout/registry-notes.md'), /paralela a legacy-import/);
    assert.match(await read('features/reports/registry-notes.md'), /CONFIGURAÇÃO POR PROJETO/);
    assert.match(await read('done/registry-notes.md'), /observação solta sem slug/);

    const backup = await fs.readFile(path.join(project.root, result.backup), 'utf8');
    assert.equal(backup, NOISY);

    // Second run: canonical already, and no note is written twice.
    const again = await tidyFeatureRegistry(project.root);
    assert.equal(again.changed, false);
    const notes = await read('features/checkout/registry-notes.md');
    assert.equal(notes.split('paralela a legacy-import').length, 2);
  });

  it('refuses an unrecognized format without touching it', async () => {
    await fs.writeFile(path.join(project.ctx, 'features.md'), '- checkout: done\n', 'utf8');
    const result = await runFeatureTidy({ args: [project.root], options: { json: true } });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'unrecognized_format');
    assert.equal(await fs.readFile(path.join(project.ctx, 'features.md'), 'utf8'), '- checkout: done\n');
  });
});

describe('feature:register', () => {
  let project;
  afterEach(async () => { await fs.rm(project.root, { recursive: true, force: true }); });

  it('creates the index on first use and upserts rows without hand edits', async () => {
    project = await makeProject(null);
    const created = await runFeatureRegister({ args: [project.root], options: { feature: 'checkout', json: true } });
    assert.equal(created.ok, true);
    assert.equal(created.created, true);
    let map = parseFeaturesMap(await fs.readFile(path.join(project.ctx, 'features.md'), 'utf8'));
    assert.equal(map.get('checkout'), 'in_progress');

    const moved = await runFeatureRegister({ args: [project.root], options: { feature: 'checkout', status: 'paused', json: true } });
    assert.equal(moved.previousStatus, 'in_progress');
    const content = await fs.readFile(path.join(project.ctx, 'features.md'), 'utf8');
    map = parseFeaturesMap(content);
    assert.equal(map.get('checkout'), 'paused');
    assert.equal(map.size, 1);
    assert.match(content, new RegExp(`\\| checkout \\| paused \\| ${created.started} \\|`), 'started date is kept');
  });

  it('abandoned sets the completed date and lands in Abandoned', async () => {
    project = await makeProject(null);
    await runFeatureRegister({ args: [project.root], options: { feature: 'search', json: true } });
    await runFeatureRegister({ args: [project.root], options: { feature: 'search', status: 'abandoned', json: true } });
    const content = await fs.readFile(path.join(project.ctx, 'features.md'), 'utf8');
    assert.match(content, /## Abandoned\n\n\| slug[^\n]*\n[^\n]*\n\| search \| abandoned \| \d{4}-\d{2}-\d{2} \| \d{4}-\d{2}-\d{2} \|/);
  });

  it('refuses done, unknown statuses and unsafe slugs', async () => {
    project = await makeProject(null);
    const done = await runFeatureRegister({ args: [project.root], options: { feature: 'x', status: 'done', json: true } });
    assert.equal(done.reason, 'use_feature_close');
    const unknown = await runFeatureRegister({ args: [project.root], options: { feature: 'x', status: 'shipped', json: true } });
    assert.equal(unknown.reason, 'invalid_status');
    const traversal = await runFeatureRegister({ args: [project.root], options: { feature: '../x', json: true } });
    assert.equal(traversal.reason, 'invalid_slug');
    await assert.rejects(fs.access(path.join(project.ctx, 'features.md')));
  });

  it('on a noisy index keeps the notes verbatim at the bottom and rejoins the table', async () => {
    project = await makeProject();
    const result = await runFeatureRegister({ args: [project.root], options: { feature: 'exports', json: true } });
    assert.equal(result.remainingNotes, 4);
    const registry = parseFeatureRegistry(await fs.readFile(path.join(project.ctx, 'features.md'), 'utf8'));
    assert.equal(registry.measures.headerlessRows, 0);
    assert.equal(registry.measures.notes, 4);
    assert.equal(registry.rows.length, 6);
  });
});

describe('feature:close moves the closing feature notes with it', () => {
  let project;
  afterEach(async () => { await fs.rm(project.root, { recursive: true, force: true }); });

  it('relocates only the closed slug notes and keeps the rest', async () => {
    project = await makeProject();
    await runFeatureClose({
      args: [project.root],
      options: { json: true, feature: 'checkout', verdict: 'PASS', 'no-archive': true, noArchive: true },
      logger: { log() {}, error() {} }
    });
    const content = await fs.readFile(path.join(project.ctx, 'features.md'), 'utf8');
    const registry = parseFeatureRegistry(content);
    assert.equal(parseFeaturesMap(content).get('checkout'), 'done');
    assert.equal(registry.measures.headerlessRows, 0);
    assert.ok(!registry.notes.some((note) => note.slug === 'checkout'));
    assert.equal(registry.measures.notes, 3);
    assert.match(
      await fs.readFile(path.join(project.ctx, 'features', 'checkout', 'registry-notes.md'), 'utf8'),
      /paralela a legacy-import/
    );
  });
});

describe('doctor — feature registry advisory', () => {
  let project;
  afterEach(async () => { await fs.rm(project.root, { recursive: true, force: true }); });

  it('warns on a noisy index and --fix migrates it', async () => {
    project = await makeProject();
    const report = await runDoctor(project.root);
    const check = report.checks.find((entry) => entry.id === 'context:feature_registry_noise');
    assert.ok(check, 'advisory present');
    assert.equal(check.severity, 'warning');
    assert.equal(check.params.notes, 4);
    assert.equal(check.params.headerless, 2);

    const fix = await applyDoctorFixes(project.root, report, { dryRun: false });
    const action = fix.actions.find((entry) => entry.id === 'feature_registry');
    assert.equal(action.applied, true);
    assert.equal((await inspectFeatureRegistry(project.root)).needsTidy, false);
  });

  it('stays silent on a canonical index', async () => {
    project = await makeProject(serializeFeatureRegistry(parseFeatureRegistry(NOISY)));
    const report = await runDoctor(project.root);
    assert.ok(!report.checks.some((entry) => entry.id === 'context:feature_registry_noise'));
  });
});
