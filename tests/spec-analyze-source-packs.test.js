'use strict';

// At --complete=dev and --complete=qa the scope-drift advisory listed the
// feature's own source pack — `A plans/todo-due-dates/idea.md` — as delivery
// outside the plan and told the owner to "add it to the plan … or revert it":
// reverting would delete the raw sources the briefing pinned.

const test = require('node:test');
const assert = require('node:assert/strict');

const { analyzePlanDeliveryDrift } = require('../src/commands/spec-analyze');

test('plans/ and researchs/ are source packs, never delivery outside the plan', () => {
  const drift = analyzePlanDeliveryDrift({
    plannedPaths: ['src/store.js'],
    changeSet: {
      baseSource: 'merge-base main',
      changedFiles: [{ path: 'src/store.js', status: 'M' }],
      untracked: ['plans/todo-due-dates/idea.md', 'researchs/todo-due-dates/extract.md']
    }
  });
  assert.ok(!drift.findings.some((f) => f.check === 'delivery_outside_plan'), JSON.stringify(drift.findings));
});

test('an undeclared behavior path is still delivery outside the plan', () => {
  const drift = analyzePlanDeliveryDrift({
    plannedPaths: ['src/store.js'],
    changeSet: { baseSource: 'merge-base main', changedFiles: [{ path: 'src/store.js', status: 'M' }], untracked: ['src/rogue.js'] }
  });
  const outside = drift.findings.find((f) => f.check === 'delivery_outside_plan');
  assert.ok(outside, JSON.stringify(drift.findings));
  assert.match(outside.message, /src\/rogue\.js/);
});
