'use strict';

/**
 * Every chain agent reads the feature dossier at session start, and its Agent
 * Trail only grew (a real one reached 97 KB). Past the size budget the oldest
 * entries move verbatim to dossier-trail-archive.md and one pointer line says
 * how many, when, and which phases they name. Nothing may be lost: every entry
 * is in exactly one of the two files, in order; a finding already archived is
 * not recorded twice; the retro still sees a FAIL that moved and its later PASS.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const store = require('../../src/dossier/store');
const { archiveTrail, compact, MAX_ACTIVE_SIZE, TRAIL_KEEP_ENTRIES, trailArchivePath, dossierPath } = require('../../src/dossier/dossier-compact');
const { _internal: { readDossierTrail } } = require('../../src/lib/retro/retro-sources');

const SLUG = 'billing-export';

async function makeDossier() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-trail-archive-'));
  const contextDir = path.join(root, '.aioson', 'context');
  await store.init({ slug: SLUG, contextDir, whyText: 'Billing needs exports.', whatText: 'CSV export of invoices.' });
  return { root, contextDir };
}

let clock = Date.parse('2026-09-01T10:00:00Z');
const tick = () => new Date((clock += 60 * 60 * 1000));

function finding(i) {
  return `Phase ${1 + Math.floor(i / 10)} entry ${i}: implemented CAP-${i} via src/billing/part-${i}.ts; verification: npx vitest run part-${i} (${'evidence '.repeat(40).trim()}).`;
}

async function add(contextDir, i, content = finding(i)) {
  return store.addFinding({ slug: SLUG, contextDir, agent: 'dev', section: 'Agent Trail', content, now: tick });
}

const entriesOf = (text) => [...text.matchAll(/(?:Phase|Fase) \d+ entry (\d+):/g)].map((match) => Number(match[1]));

describe('dossier Agent Trail archive', () => {
  it('keeps the dossier under budget while every entry stays in exactly one file, in order', async () => {
    const { contextDir } = await makeDossier();
    const total = 60;
    for (let i = 0; i < total; i += 1) await add(contextDir, i);

    const dossier = await fs.readFile(dossierPath(contextDir, SLUG), 'utf8');
    const archive = await fs.readFile(trailArchivePath(contextDir, SLUG), 'utf8');
    assert.ok(Buffer.byteLength(dossier) <= MAX_ACTIVE_SIZE, `dossier is ${Buffer.byteLength(dossier)} B (budget ${MAX_ACTIVE_SIZE})`);

    const kept = entriesOf(dossier);
    const moved = entriesOf(archive);
    assert.ok(kept.length >= TRAIL_KEEP_ENTRIES, 'the newest entries stay');
    assert.deepEqual([...moved, ...kept], Array.from({ length: total }, (_, i) => i), 'nothing lost, nothing duplicated, oldest first');
    for (const i of moved) assert.ok(archive.includes(finding(i)), `entry ${i} moved verbatim`);

    const pointer = dossier.split('\n').find((line) => line.includes('older Agent Trail entries'));
    assert.ok(pointer, 'one pointer line stays where the entries were');
    assert.match(pointer, new RegExp(`^_\\(${moved.length} older Agent Trail entries, 2026-09-\\d{2} to 2026-09-\\d{2}, are in \\[dossier-trail-archive\\.md\\]\\(dossier-trail-archive\\.md\\); phases they name: 1, 2, 3`));
    assert.match(pointer, /Read it for an earlier phase's evidence, verdict or decision\.\)_$/);
    assert.equal(dossier.split('\n').filter((line) => line.includes('older Agent Trail entries')).length, 1, 'repeated archiving updates the one pointer');
    assert.match(dossier, /## Why[\s\S]*Billing needs exports\./, 'the current-state sections are untouched');
  });

  it('a finding already moved to the archive is not recorded again', async () => {
    const { contextDir } = await makeDossier();
    for (let i = 0; i < 40; i += 1) await add(contextDir, i);
    const archive = await fs.readFile(trailArchivePath(contextDir, SLUG), 'utf8');
    assert.ok(archive.includes(finding(0)));
    const again = await add(contextDir, 0);
    assert.equal(again.added, false);
    const dossier = await fs.readFile(dossierPath(contextDir, SLUG), 'utf8');
    assert.ok(!dossier.includes(finding(0)), 'no duplicate in the dossier');
  });

  it('a small dossier is left alone, and hand-written trail bullets archive the same way', async () => {
    const { contextDir } = await makeDossier();
    await add(contextDir, 0);
    assert.equal((await archiveTrail({ slug: SLUG, contextDir })).reason, 'size_ok');

    const p = dossierPath(contextDir, SLUG);
    const raw = await fs.readFile(p, 'utf8');
    const bullets = Array.from({ length: 50 }, (_, i) => `- 2026-08-${String(1 + (i % 28)).padStart(2, '0')} @dev — Fase ${1 + Math.floor(i / 25)} entry ${i + 100}: ${'note '.repeat(60).trim()}`);
    await fs.writeFile(p, raw.replace('## Agent Trail\n', `## Agent Trail\n\nTrail kept by hand before add-finding.\n\n${bullets.join('\n')}\n`), 'utf8');
    const result = await compact({ slug: SLUG, contextDir });
    assert.equal(result.compacted, true);
    const dossier = await fs.readFile(p, 'utf8');
    const archive = await fs.readFile(trailArchivePath(contextDir, SLUG), 'utf8');
    assert.match(dossier, /Trail kept by hand before add-finding\./, 'text before the first entry stays');
    assert.deepEqual([...entriesOf(archive), ...entriesOf(dossier)].filter((n) => n >= 100), Array.from({ length: 50 }, (_, i) => i + 100));
    assert.ok(/phases they name: 1\. /.test(dossier), 'only the oldest entries (Fase 1) had to move');
  });

  it('the retro still pairs a FAIL that moved to the archive with its later PASS', async () => {
    const { root, contextDir } = await makeDossier();
    await store.addFinding({ slug: SLUG, contextDir, agent: 'qa', section: 'Agent Trail', content: 'QA verdict: FAIL — AC-3 missing.', now: tick });
    for (let i = 0; i < 40; i += 1) await add(contextDir, i);
    await store.addFinding({ slug: SLUG, contextDir, agent: 'qa', section: 'Agent Trail', content: 'QA verdict: PASS — all ACs proven.', now: tick });
    const archive = await fs.readFile(trailArchivePath(contextDir, SLUG), 'utf8');
    assert.match(archive, /QA verdict: FAIL/, 'the FAIL moved');

    const trail = readDossierTrail({ rootDir: root, slug: SLUG, locations: { dossierFiles: [dossierPath(contextDir, SLUG)] } });
    assert.equal(trail.cycles.length, 1, 'one FAIL→PASS cycle across the two files');
    assert.equal(trail.count, 42, 'every entry is counted once');
  });
});
