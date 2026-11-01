'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { extractPlannedPaths } = require('../src/lib/planned-paths');
const { parseImplementationDelta } = require('../src/lib/gate-checkpoint');
const { measurePlanScale } = require('../src/lib/plan-scale');

test('literal Next parameters count as files; expansion patterns never count', () => {
  const paths = ['app/[id]/page.tsx', 'app/[...slug]/route.ts', 'app/[[...slug]]/page.tsx'];
  const cell = paths.map((file) => `\`${file}\``).join(', ');
  assert.deepEqual(extractPlannedPaths(`${cell}, src/*.ts, src/file?.ts, src/[ab].ts, src/{a,b}.ts`), paths);
  const plan = `## Implementation Delta\n\n| Action | Exact paths |\n|---|---|\n| create | ${cell} |\n`;
  assert.deepEqual(parseImplementationDelta(plan).map((item) => item.path), paths);
  const scale = measurePlanScale(plan);
  assert.equal(scale.files, 3);
});
