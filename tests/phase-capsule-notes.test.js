'use strict';

/**
 * phase:next asks @dev for "the decisions that are not on disk" and writes them
 * to the dossier Agent Trail. The next phase starts from its capsule, and the
 * capsule never opened the dossier: the note was written for a reader that did
 * not exist. The capsule now carries every earlier phase's note, from the
 * dossier and from the trail archive the size budget moves old entries to.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { runPhaseNext } = require('../src/commands/phase-next');
const { runDevResumeData } = require('../src/commands/dev-resume');
const { phaseNotes } = require('../src/lib/phase-capsule');
const { archiveTrail } = require('../src/dossier/dossier-compact');

const silent = { log() {}, error() {} };
const SLUG = 'billing';

const PLAN = [
  '---', 'feature: billing', '---', '', '# Implementation Plan — billing', '',
  '## Phase 1 — CSV export', '', 'Deliver AC-1.', '',
  '## Phase 2 — Filters', '', 'Deliver AC-2.', '',
  '## Phase 3 — Schedule', '', 'Deliver AC-3.', ''
].join('\n');

function makeProject(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-capsule-notes-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const context = path.join(dir, '.aioson', 'context');
  fs.mkdirSync(context, { recursive: true });
  fs.writeFileSync(path.join(dir, '.aioson', 'config.md'), '# project\n');
  fs.writeFileSync(path.join(context, `implementation-plan-${SLUG}.md`), PLAN);
  fs.writeFileSync(path.join(context, `prd-${SLUG}.md`), '# PRD — billing\n\n## Problem\n\nExport invoices.\n');
  fs.writeFileSync(path.join(context, 'project.context.md'), '---\nproject_name: "demo"\nclassification: "SMALL"\nphase_restart: off\n---\n\n# Project Context\n');
  return dir;
}

const closePhase = (dir, finished, note) => runPhaseNext({ args: [dir], options: { feature: SLUG, finished: String(finished), note, json: true }, logger: silent, env: {} });
const capsuleOf = (dir, phase) => runDevResumeData({ args: [dir], options: { feature: SLUG, phase: String(phase), capsule: true, json: true }, logger: silent });

test('the note phase:next records reaches the capsule of the phases after it', async (t) => {
  const dir = makeProject(t);
  const before = await capsuleOf(dir, 2);
  assert.equal(before.ok, true);
  assert.doesNotMatch(before.capsule, /Decisions earlier phases left off disk/, 'no dossier, no section');

  const first = await closePhase(dir, 1, 'the CSV keeps the BOM because the finance sheet needs it;\nexport dates are UTC');
  assert.equal(first.ok, true, JSON.stringify(first));
  assert.equal(first.note.recorded, true);

  const second = await capsuleOf(dir, 2);
  assert.match(second.capsule, /## Decisions earlier phases left off disk\n\n[^\n]+\n\n- Phase 1: the CSV keeps the BOM because the finance sheet needs it; export dates are UTC\n/);
  assert.deepEqual(second.notes, [{ phase: '1', text: 'the CSV keeps the BOM because the finance sheet needs it; export dates are UTC' }]);

  assert.equal((await closePhase(dir, 2, 'none')).ok, true);
  const third = await capsuleOf(dir, 3);
  assert.deepEqual(third.notes.map((note) => note.phase), ['1'], 'a phase with nothing to carry adds no line');
  assert.doesNotMatch(third.capsule, /Phase 2: none/);
});

test('a capsule carries the notes of its own past only, each once', async (t) => {
  const dir = makeProject(t);
  await closePhase(dir, 1, 'money is integer cents');
  await closePhase(dir, 1, 'money is integer cents');
  await closePhase(dir, 2, 'filters are AND, never OR');
  assert.deepEqual(phaseNotes(dir, SLUG), [
    { phase: '1', text: 'money is integer cents' },
    { phase: '2', text: 'filters are AND, never OR' }
  ]);
  assert.deepEqual((await capsuleOf(dir, 1)).notes.map((note) => note.phase), ['1'], 'phase 1 run again keeps its own note, not phase 2\'s');
  assert.deepEqual((await capsuleOf(dir, 3)).notes.map((note) => note.phase), ['1', '2']);
});

test('a note the size budget moved to the trail archive is still carried, oldest first', async (t) => {
  const dir = makeProject(t);
  await closePhase(dir, 1, 'the ledger table is append-only');
  await closePhase(dir, 2, 'the scheduler reads the tenant timezone');
  const contextDir = path.join(dir, '.aioson', 'context');
  const archived = await archiveTrail({ slug: SLUG, contextDir, force: true });
  const archive = path.join(contextDir, 'features', SLUG, 'dossier-trail-archive.md');
  if (!archived.archived) {
    // Two entries are under the keep count: move the first by hand, as the budget would.
    const dossier = path.join(contextDir, 'features', SLUG, 'dossier.md');
    const raw = fs.readFileSync(dossier, 'utf8');
    const line = raw.split('\n').find((item) => item.startsWith('Phase 1 closed;'));
    fs.writeFileSync(dossier, raw.replace(`${line}\n`, ''));
    fs.writeFileSync(archive, `# Agent Trail archive — ${SLUG}\n\n## Agent Trail\n\n${line}\n`);
  }
  assert.match(fs.readFileSync(archive, 'utf8'), /Phase 1 closed;/);
  assert.deepEqual((await capsuleOf(dir, 3)).notes, [
    { phase: '1', text: 'the ledger table is append-only' },
    { phase: '2', text: 'the scheduler reads the tenant timezone' }
  ]);
});
