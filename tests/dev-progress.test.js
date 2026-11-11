'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

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

test('below two real intervals there is no number at all', () => {
  const plan = ['1', '2', '3', '4'];
  const none = (entries, planIds = plan) => {
    const progress = projectProgress(entries, planIds);
    assert.equal(progress.status, 'not_measured', JSON.stringify(entries));
    assert.equal(progress.mean_minutes, null);
    assert.equal(progress.min_minutes, null);
    assert.equal(progress.max_minutes, null);
    assert.equal(progress.projected_remaining_minutes, null);
    return progress;
  };
  none([]);
  none([stamp(0, 1)]);
  none([stamp(10)]);
  assert.equal(none([stamp(0), stamp(30, 1)]).intervals, 1, 'a start stamp measures the first phase');
  assert.equal(none([stamp(0, 1), stamp(30, 2)]).intervals, 1, 'with no start stamp the first phase has no duration');

  // One interval over a gap is still one interval, whatever it covers.
  const gap = none([stamp(0, 1), stamp(30, 3)]);
  assert.equal(gap.intervals, 1);
  assert.deepEqual(gap.missing, ['2']);
});

test('an interval with no time in it is not a measure', () => {
  const plan = ['1', '2', '3', '4', '5'];
  const sameClock = projectProgress([stamp(0, 1), stamp(0, 2), stamp(0, 3)], plan);
  assert.equal(sameClock.status, 'not_measured');
  assert.equal(sameClock.finished, 3, 'the phases still count as finished');
  assert.equal(sameClock.intervals, 0);
  assert.equal(sameClock.mean_minutes, null);

  const seconds = projectProgress([stamp(0, 1), stamp(0.03, 2), stamp(0.06, 3), stamp(0.5, 4)], plan);
  assert.equal(seconds.status, 'not_measured', 'under a minute is zero in the unit the report speaks');

  const startOnSameClock = projectProgress([stamp(0), stamp(0, 1), stamp(0, 2)], plan);
  assert.equal(startOnSameClock.status, 'not_measured');

  // A batch does not poison what was really measured around it.
  const mixed = projectProgress([stamp(0, 1), stamp(30, 2), stamp(30, 3), stamp(90, 4)], plan);
  assert.equal(mixed.intervals, 2);
  assert.equal(mixed.mean_minutes, 45);
  assert.equal(mixed.projected_remaining_minutes, 45);
});

test('with two real intervals it projects the rest from this run alone', () => {
  const progress = projectProgress([stamp(0), stamp(30, 1), stamp(70, 2), stamp(120, 3)], ['1', '2', '3', '4', '5', '6']);
  assert.equal(progress.status, 'measured');
  assert.equal(progress.finished, 3);
  assert.equal(progress.total, 6);
  assert.equal(progress.remaining, 3);
  assert.equal(progress.intervals, 3);
  assert.equal(progress.measured, 3);
  assert.equal(progress.mean_minutes, 40);
  assert.equal(progress.min_minutes, 30);
  assert.equal(progress.max_minutes, 50);
  assert.equal(progress.projected_remaining_minutes, 120);
});

test('a phase the plan does not have is not counted', () => {
  const plan = Array.from({ length: 10 }, (_, i) => String(i + 1));
  const typo = projectProgress([stamp(0, 1), stamp(10, 100)], plan);
  assert.equal(typo.status, 'not_measured', 'one wrong number is not a measure');
  assert.equal(typo.finished, 1);
  assert.equal(typo.remaining, 9);
  assert.deepEqual(typo.missing, [], 'the typo does not pass the phases before it');
  assert.deepEqual(typo.unplanned, ['100']);

  const after = projectProgress([stamp(0, 1), stamp(10, 2), stamp(20, 3), stamp(30, 100)], plan);
  assert.equal(after.intervals, 2);
  assert.equal(after.mean_minutes, 10);
  assert.equal(after.projected_remaining_minutes, 70);

  const words = projectProgress([stamp(0, 'setup'), stamp(10, 'backend'), stamp(20, 'frontend')], plan);
  assert.equal(words.status, 'not_measured');
  assert.equal(words.finished, 0);
  assert.equal(words.remaining, 10);
  assert.deepEqual(words.unplanned, ['setup', 'backend', 'frontend']);

  // With no plan there is no list to hold it against, and no numbering to spread over.
  const noPlan = projectProgress([stamp(0, 1), stamp(10, 2), stamp(20, 100)], null);
  assert.equal(noPlan.measured, 2);
  assert.equal(noPlan.mean_minutes, 10);
});

test('a rewrite does not move a phase, and a skipped checkpoint spreads over the phases it covers', () => {
  const rewritten = projectProgress([stamp(0, 1), stamp(30, 2), stamp(60, 3), stamp(500, 2)], ['1', '2', '3', '4']);
  assert.equal(rewritten.finished, 3);
  assert.equal(rewritten.mean_minutes, 30, 'a fix after QA is not phase time');

  const skipped = projectProgress([stamp(0, 1), stamp(30, 2), stamp(90, 4)], ['1', '2', '3', '4', '5']);
  assert.equal(skipped.intervals, 2);
  assert.equal(skipped.measured, 3);
  assert.equal(skipped.mean_minutes, 30);
  assert.equal(skipped.max_minutes, 30, 'the interval is two phases, not one slow phase');
  assert.deepEqual(skipped.missing, ['3']);
  assert.equal(skipped.remaining, 2, 'a phase without a stamp stays owed');

  const units = projectProgress([stamp(0, '1-backend'), stamp(10, '1-frontend'), stamp(30, '2-backend')], ['1', '2']);
  assert.equal(units.finished, 2, 'the plan counts phases, not units');
  assert.equal(units.status, 'complete');
});

test('a stamp with no phase marks the start, and only before the first phase', () => {
  const plan = ['1', '2', '3', '4'];
  const middle = projectProgress([stamp(0), stamp(10, 1), stamp(15), stamp(20, 2)], plan);
  assert.equal(middle.intervals, 2);
  assert.equal(middle.min_minutes, 10, 'a checkpoint between phases does not cut the second one short');
  assert.equal(middle.max_minutes, 10);
  assert.equal(middle.mean_minutes, 10);
  const latestStart = projectProgress([stamp(0), stamp(50), stamp(60, 1), stamp(70, 2)], plan);
  assert.equal(latestStart.min_minutes, 10, 'the latest stamp before the first phase is the start');
});

test('intervals count only the phases present in a plan with gaps in its numbering', () => {
  const progress = projectProgress([stamp(0, 1), stamp(30, 3), stamp(90, 7)], ['1', '3', '5', '7', '9']);
  assert.equal(progress.intervals, 2);
  assert.equal(progress.measured, 3, 'the second interval covers phases 5 and 7 only');
  assert.equal(progress.mean_minutes, 30);
  assert.equal(progress.min_minutes, 30);
  assert.equal(progress.max_minutes, 30);
  assert.equal(progress.projected_remaining_minutes, 60);
  assert.deepEqual(progress.missing, ['5']);
});

test('a large phase id cannot make progress walk through nonexistent phase numbers', () => {
  const script = `
    const { projectProgress } = require(${JSON.stringify(require.resolve('../src/lib/dev-progress'))});
    const stamp = (minutes, phase) => ({ at: minutes * 60000, phase: String(phase) });
    const progress = projectProgress([stamp(0, 1), stamp(30, 3), stamp(60, 1e12)], ['1', '3', '1000000000000', '1000000000001']);
    process.stdout.write(JSON.stringify(progress));
  `;
  const result = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8', timeout: 10000 });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr);
  const progress = JSON.parse(result.stdout);
  assert.equal(progress.measured, 2);
  assert.equal(progress.mean_minutes, 30);
  assert.equal(progress.projected_remaining_minutes, 30);
});

test('the ledger reads in time order, whatever order the lines landed', async (t) => {
  const root = await project(t);
  await fs.mkdir(path.dirname(ledgerPath(root, SLUG)), { recursive: true });
  await fs.writeFile(ledgerPath(root, SLUG), `{"at":"2026-11-05T11:00:00.000Z","phase":"2"}\n{"at":"2026-11-05T10:00:00.000Z","phase":"1"}\n`);
  assert.deepEqual((await readPhaseCheckpoints(root, SLUG)).map((entry) => entry.phase), ['1', '2']);
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
  assert.match(none.summary, /^No measure yet: 0 real interval\(s\) between checkpoints, at least 2 are needed/);
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

test('dev:progress names what it left out, and gives no number on the same clock', async (t) => {
  const root = await project(t, { phases: 10 });
  for (const phase of [1, 2, 3]) await writeCheckpoint(root, phase, 0);
  await writeCheckpoint(root, 100, 0);
  const lines = [];
  const result = await runDevProgress({ args: [root], options: { feature: SLUG }, logger: { log: (line) => lines.push(String(line)), error() {} } });
  assert.equal(result.mean_minutes, null);
  assert.equal(result.projected_remaining_minutes, null);
  assert.ok(lines.includes('  Not counted, because the plan has no such phase: 100'), lines.join('\n'));
  assert.ok(lines.some((line) => line.startsWith('  No measure yet: 0 real interval(s)')), lines.join('\n'));
  assert.doesNotMatch(lines.join('\n'), /\b0 min\b/);
});

test('a phase stamped out of order took its own time, and a real gap still spreads', () => {
  const e = (minutes, phase) => ({ at: Date.UTC(2026, 0, 1, 0, minutes), phase });
  const plan = Array.from({ length: 10 }, (_, i) => String(i + 1));
  const outOfOrder = projectProgress([e(0, 1), e(10, 10), e(20, 2), e(30, 3)], plan);
  assert.equal(outOfOrder.mean_minutes, 10, 'phases 2 and 3 were stamped later, so 10 did not cover them');
  const gap = projectProgress([e(0, 1), e(30, 4), e(40, 5)], plan);
  assert.equal(gap.measured, 4, 'nothing stamped 2 and 3, so the interval stands for 3 phases');
  assert.equal(gap.mean_minutes, 10);
});
