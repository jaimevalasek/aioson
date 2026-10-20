'use strict';

// getCanonicalArtifactsForAgent answered null for a renamed agent's old id
// (`briefing-refiner`) as if no agent answered to it, though a rename is the
// same agent for every comparison (agents.js). Only a retired id — whose work
// moved into another agent — and an unknown name own no contract.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const TEST_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-handoff-renamed-home-'));
process.env.HOME = TEST_HOME;
process.env.USERPROFILE = TEST_HOME;

const { getCanonicalArtifactsForAgent } = require('../src/handoff-contract');
const { LEGACY_AGENT_IDS, RETIRED_AGENT_IDS } = require('../src/agents');

const STATE = { mode: 'feature', featureSlug: 'checkout', classification: 'MEDIUM' };

function project() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-handoff-renamed-'));
  fs.mkdirSync(path.join(dir, '.aioson', 'context'), { recursive: true });
  return dir;
}

test('briefing-refiner answers exactly as refiner, in any spelling', async () => {
  const dir = project();
  const current = await getCanonicalArtifactsForAgent('refiner', dir, STATE);
  assert.deepEqual(current, [], 'refiner owns no stage contract');
  for (const spelling of ['briefing-refiner', '@briefing-refiner', '@Briefing-Refiner']) {
    assert.deepEqual(await getCanonicalArtifactsForAgent(spelling, dir, STATE), current, spelling);
  }
});

test('every renamed id answers as its current id', async () => {
  const dir = project();
  const renamed = Object.entries(LEGACY_AGENT_IDS).filter(([id]) => !Object.hasOwn(RETIRED_AGENT_IDS, id));
  assert.ok(renamed.length > 0, 'the definitions declare at least one rename');
  for (const [oldId, currentId] of renamed) {
    assert.deepEqual(
      await getCanonicalArtifactsForAgent(oldId, dir, STATE),
      await getCanonicalArtifactsForAgent(currentId, dir, STATE),
      `${oldId} → ${currentId}`
    );
  }
});

test('retired and unknown names own no contract; own ids keep theirs', async () => {
  const dir = project();
  for (const retired of Object.keys(RETIRED_AGENT_IDS)) {
    assert.equal(await getCanonicalArtifactsForAgent(retired, dir, STATE), null, `${retired} is retired`);
  }
  assert.equal(await getCanonicalArtifactsForAgent('no-such-agent', dir, STATE), null);
  assert.equal(await getCanonicalArtifactsForAgent('', dir, STATE), null);
  assert.deepEqual(await getCanonicalArtifactsForAgent('@quality', dir, STATE), [], 'a known agent outside the stage contracts');
  const planner = await getCanonicalArtifactsForAgent('planner', dir, STATE);
  assert.ok(Array.isArray(planner) && planner.length > 0, 'a contract agent still resolves its artifacts');
});
