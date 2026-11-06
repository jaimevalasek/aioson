'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { runStateSave } = require('../src/commands/state-save');
const { runDevProgress } = require('../src/commands/dev-progress');
const { ensureProjectGitignorePolicy } = require('../src/installer');
const {
  appendPhaseCheckpoint,
  formatMinutes,
  ledgerPath,
  projectProgress,
  readPhaseCheckpoints
} = require('../src/lib/dev-progress');

const SLUG = 'orders';
const silent = { log() {}, error() {} };
const START = Date.parse('2026-11-05T10:00:00.000Z');
const at = (minutes) => START + minutes * 60000;
const stamp = (minutes, phase = null) => ({ at: at(minutes), phase: phase === null ? null : String(phase) });

async function project(t, { phases = 0 } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-dev-progress-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, '.aioson/context'), { recursive: true });
  await fs.writeFile(path.join(root, '.aioson/context/project.context.md'), '---\nproject_name: "demo"\nclassification: SMALL\n---\n');
  if (phases > 0) {
    const body = Array.from({ length: phases }, (_, i) => `## Phase ${i + 1} — Step ${i + 1}\n- Verification: node --test\n- Done when: step ${i + 1} shows on screen.\n`).join('\n');
    await fs.writeFile(path.join(root, `.aioson/context/implementation-plan-${SLUG}.md`), `---\nstatus: approved\n---\n# Plan\n\n${body}`);
  }
  return root;
}

function writeCheckpoint(root, phase, minutes) {
  return runStateSave({ args: [root], options: { feature: SLUG, ...(phase === null ? {} : { phase: String(phase) }), next: `after ${phase}`, json: true }, logger: silent, now: () => at(minutes) });
}

test('every checkpoint leaves a stamp with date and time, and none rotates out with the History', async (t) => {
  const root = await project(t, { phases: 21 });
  for (let phase = 1; phase <= 21; phase += 1) assert.equal((await writeCheckpoint(root, phase, phase * 37)).ok, true);

  // The cause the ledger answers: dev-state.md keeps the last five, stamped by day.
  const state = await fs.readFile(path.join(root, '.aioson/context/dev-state.md'), 'utf8');
  assert.equal((state.match(/^- \d{4}-\d{2}-\d{2}: phase /gm) || []).length, 5);

  const lines = (await fs.readFile(ledgerPath(root, SLUG), 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(lines.length, 21);
  assert.equal(lines[0].phase, '1');
  assert.equal(lines[0].at, new Date(at(37)).toISOString());
  assert.match(lines[20].at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  assert.equal(lines[20].next, 'after 21');
  assert.equal((await readPhaseCheckpoints(root, SLUG)).length, 21);
});

test('the ledger lives under the local-only runtime folder, and an unsafe slug never reaches a path', async (t) => {
  const root = await project(t);
  const written = await appendPhaseCheckpoint(root, { feature: SLUG, phase: 1 }, () => at(0));
  assert.equal(written.path, '.aioson/runtime/dev-progress/orders.jsonl');
  await ensureProjectGitignorePolicy(root);
  assert.match(await fs.readFile(path.join(root, '.gitignore'), 'utf8'), /^\.aioson\/runtime\/$/m);

  assert.deepEqual(await appendPhaseCheckpoint(root, { feature: '../../escape', phase: 1 }), { ok: false, reason: 'invalid_slug' });
  assert.deepEqual(await readPhaseCheckpoints(root, '../../escape'), []);
  const result = await runStateSave({ args: [root], options: { feature: '../../escape', next: 'x', json: true }, logger: silent });
  assert.equal(result.ok, true, 'the checkpoint still works: the stamp is the bonus');
  assert.match(result.warnings.join('\n'), /phase stamp not recorded \(invalid_slug\)/);
  assert.equal(result.path.includes('dev-state.md'), true);
});

test('below two measured phases there is no number at all', () => {
  const plan = ['1', '2', '3', '4'];
  for (const entries of [[], [stamp(0, 1)], [stamp(10)], [stamp(0), stamp(30, 1)], [stamp(0, 1), stamp(30, 2)]]) {
    const progress = projectProgress(entries, plan);
    assert.equal(progress.status, 'not_measured', JSON.stringify(entries));
    assert.equal(progress.mean_minutes, null);
    assert.equal(progress.min_minutes, null);
    assert.equal(progress.max_minutes, null);
    assert.equal(progress.projected_remaining_minutes, null);
  }
  assert.equal(projectProgress([stamp(0), stamp(30, 1)], plan).measured, 1, 'a start stamp measures the first phase');
  assert.equal(projectProgress([stamp(0, 1), stamp(30, 2)], plan).measured, 1, 'with no start stamp the first phase has no duration');
});

test('with two measured phases it projects the rest from this run alone', () => {
  const progress = projectProgress([stamp(0), stamp(30, 1), stamp(70, 2), stamp(120, 3)], ['1', '2', '3', '4', '5', '6']);
  assert.equal(progress.status, 'measured');
  assert.equal(progress.finished, 3);
  assert.equal(progress.total, 6);
  assert.equal(progress.remaining, 3);
  assert.equal(progress.measured, 3);
  assert.equal(progress.mean_minutes, 40);
  assert.equal(progress.min_minutes, 30);
  assert.equal(progress.max_minutes, 50);
  assert.equal(progress.projected_remaining_minutes, 120);
});

test('a rewrite does not move a phase, and a skipped checkpoint spreads over the phases it covers', () => {
  const rewritten = projectProgress([stamp(0, 1), stamp(30, 2), stamp(60, 3), stamp(500, 2)], ['1', '2', '3', '4']);
  assert.equal(rewritten.finished, 3);
  assert.equal(rewritten.mean_minutes, 30, 'a fix after QA is not phase time');

  const skipped = projectProgress([stamp(0, 1), stamp(30, 2), stamp(90, 4)], ['1', '2', '3', '4', '5']);
  assert.equal(skipped.measured, 3);
  assert.equal(skipped.mean_minutes, 30);
  assert.equal(skipped.max_minutes, 30, 'the interval is two phases, not one slow phase');
  assert.deepEqual(skipped.missing, ['3']);
  assert.equal(skipped.remaining, 2, 'a phase without a stamp stays owed');

  const units = projectProgress([stamp(0, '1-backend'), stamp(10, '1-frontend'), stamp(30, '2-backend')], ['1', '2']);
  assert.equal(units.finished, 2, 'the plan counts phases, not units');
  assert.equal(units.status, 'complete');
});

test('the last phase completes it, and with no plan the pace is known but not the rest', () => {
  const done = projectProgress([stamp(0, 1), stamp(30, 2), stamp(60, 3)], ['1', '2', '3']);
  assert.equal(done.status, 'complete');
  assert.equal(done.remaining, 0);
  assert.equal(done.projected_remaining_minutes, 0);

  const noPlan = projectProgress([stamp(0, 1), stamp(30, 2), stamp(60, 3)], null);
  assert.equal(noPlan.status, 'measured');
  assert.equal(noPlan.total, null);
  assert.equal(noPlan.remaining, null);
  assert.equal(noPlan.mean_minutes, 30);
  assert.equal(noPlan.projected_remaining_minutes, null);
});

test('a torn ledger line is dropped, never read as a zero', async (t) => {
  const root = await project(t);
  await fs.mkdir(path.dirname(ledgerPath(root, SLUG)), { recursive: true });
  await fs.writeFile(ledgerPath(root, SLUG), `{"at":"2026-11-05T10:00:00.000Z","phase":"1"}\nnot json\n{"at":"never","phase":"2"}\n{"at":"2026-11-05T10:30:00.000Z","phase":"3"}\n{"at":"2026-11-05T10:0`);
  assert.deepEqual((await readPhaseCheckpoints(root, SLUG)).map((entry) => entry.phase), ['1', '3']);
});

test('dev:progress reads the plan and the stamps, and says when it has no measure', async (t) => {
  const root = await project(t, { phases: 6 });
  assert.equal((await runDevProgress({ args: [root], options: { json: true }, logger: silent })).reason, 'missing_feature');
  assert.equal((await runDevProgress({ args: [root], options: { json: true, feature: '../x' }, logger: silent })).reason, 'invalid_feature');

  const none = await runDevProgress({ args: [root], options: { json: true, feature: SLUG }, logger: silent });
  assert.equal(none.ok, true);
  assert.equal(none.status, 'not_measured');
  assert.equal(none.finished, 0);
  assert.equal(none.total, 6);
  assert.match(none.summary, /^No forecast yet: 0 phase\(s\) measured, at least 2 are needed/);
  assert.equal(none.source, '.aioson/runtime/dev-progress/orders.jsonl');

  await writeCheckpoint(root, null, 0);
  await writeCheckpoint(root, 1, 30);
  await writeCheckpoint(root, 2, 90);
  const lines = [];
  const measured = await runDevProgress({ args: [root], options: { feature: SLUG }, logger: { log: (line) => lines.push(String(line)), error() {} } });
  assert.equal(measured.mean_minutes, 45);
  assert.equal(measured.projected_remaining_minutes, 180);
  assert.ok(lines.includes('  Finished: 2 of 6 phase(s)'), lines.join('\n'));
  assert.ok(lines.some((line) => /Mean per phase: 45 min \(from 30 min to 1 h, 2 phases measured\)\. At this pace the remaining 4 phase\(s\) take about 3 h of wall clock/.test(line)), lines.join('\n'));
});

test('formatMinutes reads as a person would say it', () => {
  assert.equal(formatMinutes(37.4), '37 min');
  assert.equal(formatMinutes(60), '1 h');
  assert.equal(formatMinutes(125), '2 h 5 min');
});
