'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { projectSchedule, formatProjection, hotFiles, measuredDurations } = require('../src/agent-execution/schedule-projection');

// Two lanes, two waves; the frontend units share a messages file.
const unit = (id, lane, wave, files) => ({ id, lane, wave, owner: 'lane', files });
const PLAN = {
  parallel: { max_concurrent_lanes: 10 },
  units: [
    unit('b1', 'backend', 1, ['api/a.ts']),
    unit('f1', 'frontend', 1, ['ui/a.tsx', 'i18n/pt.json']),
    unit('b2', 'backend', 2, ['api/b.ts']),
    unit('f2', 'frontend', 2, ['ui/b.tsx', 'i18n/pt.json']),
    unit('f3', 'frontend', 3, ['ui/c.tsx', 'i18n/pt.json']),
    { id: 'i1', owner: 'integration', wave: 3, files: ['app.ts'] }
  ]
};
const byKey = (projection) => Object.fromEntries(projection.policies.map((policy) => [policy.key, policy]));

test('projection: the wave barrier and lane chains follow the engine readiness rules', () => {
  const projection = projectSchedule(PLAN, { devMinutes: 2, qaMinutes: 3 });
  const p = byKey(projection);
  assert.equal(projection.units, 5, 'integration units are the session DEV, not lane pipelines');
  assert.equal(p.waves.minutes, 15, 'three waves of 5 minutes each');
  assert.equal(p.lanes_after_qa.minutes, 15, 'the frontend lane chain of three units is the critical path');
  assert.equal(p.lanes_after_dev.minutes, 15, 'a shared file keeps the frontend chain serial even at after_dev');
  assert.equal(p.waves.peak, 2);
});

test('projection: after_dev pipelines a lane whose units share no file', () => {
  const plan = { ...PLAN, units: PLAN.units.map((u) => ({ ...u, files: (u.files || []).filter((file) => file !== 'i18n/pt.json') })) };
  const p = byKey(projectSchedule(plan, { devMinutes: 2, qaMinutes: 3 }));
  assert.equal(p.lanes_after_dev.minutes, 9, 'three DEVs back to back plus the last review');
  assert.ok(p.lanes_after_dev.peak > p.waves.peak);
  assert.equal(p.file_ceiling.minutes, 5, 'with nothing shared every unit runs at once');
});

for (const gate of ['after_dev', 'after_qa']) {
  test(`projection: explicit ${gate} dependencies across lanes override the policy gate`, () => {
    const plan = { parallel: { max_concurrent_lanes: 2 }, units: [
      unit('producer', 'backend', 1, ['api.ts']),
      { ...unit('consumer', 'frontend', 2, ['ui.ts']), depends_on: [{ unit: 'producer', gate }] }
    ] };
    const p = byKey(projectSchedule(plan, { devMinutes: 2, qaMinutes: 3 }));
    for (const key of ['waves', 'lanes_after_qa', 'lanes_after_dev']) assert.equal(p[key].minutes, gate === 'after_dev' ? 7 : 10);
    assert.equal(p.file_ceiling.minutes, 5, 'the file-only ceiling deliberately ignores dependencies');
    plan.units[1].files = ['api.ts'];
    const locked = byKey(projectSchedule(plan, { devMinutes: 2, qaMinutes: 3 }));
    assert.equal(locked.lanes_after_dev.minutes, 10, 'explicit edges do not bypass a file held during QA');
  });
}

test('projection: explicit edges replace unrelated wave barriers, including transitive chains', () => {
  const plan = { parallel: { max_concurrent_lanes: 5 }, units: [
    unit('a', 'backend', 1, ['a']),
    { ...unit('b', 'backend', 2, ['b']), depends_on: [{ unit: 'a', gate: 'after_qa' }] },
    { ...unit('c', 'backend', 3, ['c']), depends_on: [{ unit: 'b', gate: 'after_qa' }] },
    { ...unit('d', 'frontend', 4, ['d']), depends_on: [{ unit: 'a', gate: 'after_qa' }] }
  ] };
  const p = byKey(projectSchedule(plan, { devMinutes: 2, qaMinutes: 3 }));
  assert.equal(p.waves.minutes, 15, 'd can overlap b; it does not wait for c');
  assert.equal(p.lanes_after_dev.minutes, 15, 'explicit QA gates still control the backend chain');
});

test('projection: integration prerequisites stay outside lane readiness, matching the runtime', () => {
  const plan = { units: [
    { id: 'integration', owner: 'integration', wave: 1 },
    { ...unit('consumer', 'frontend', 2, ['ui']), depends_on: [{ unit: 'integration', gate: 'after_qa' }] }
  ] };
  assert.equal(byKey(projectSchedule(plan, { devMinutes: 2, qaMinutes: 3 })).waves.minutes, 5);
});

test('projection: invalid dependency cycles fail instead of looping forever', () => {
  const plan = { units: [
    { ...unit('a', 'backend', 1, []), depends_on: [{ unit: 'b', gate: 'after_qa' }] },
    { ...unit('b', 'frontend', 1, []), depends_on: [{ unit: 'a', gate: 'after_dev' }] }
  ] };
  assert.throws(() => projectSchedule(plan), /blocked dependencies for a, b/);
});

test('projection: hot files name the units they serialize; formatting is one line per concern', () => {
  const hot = hotFiles(PLAN.units.filter((u) => u.owner === 'lane'));
  assert.deepEqual(hot, [{ path: 'i18n/pt.json', units: ['f1', 'f2', 'f3'], lanes: ['frontend'] }]);
  const lines = formatProjection(projectSchedule(PLAN));
  assert.match(lines[0], /^projection \(DEV 8 \/ QA 14 min per unit, assumed; max 10 at once\): waves 1h06 /);
  assert.match(lines[1], /i18n\/pt\.json ×3/);
  assert.deepEqual(formatProjection(projectSchedule({ units: [] })), []);
});

test('measuredDurations: medians of finished attempts; interrupted attempts do not count', () => {
  const at = (minute) => new Date(Date.UTC(2026, 9, 1, 12, minute)).toISOString();
  const state = { attempts: [
    { stage: 'dev', started_at: at(0), finished_at: at(6) },
    { stage: 'dev', started_at: at(0), finished_at: at(10) },
    { stage: 'qa', started_at: at(0), finished_at: at(14) },
    { stage: 'qa', started_at: at(0), finished_at: at(2), reason: 'process_interrupted' },
    { stage: 'dev', started_at: at(0), finished_at: null }
  ] };
  assert.deepEqual(measuredDurations(state), { devMinutes: 8, qaMinutes: 14, samples: 3 });
  assert.equal(measuredDurations({ attempts: [] }), null);
  assert.equal(measuredDurations(null), null);
});
