'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { prepareFollowups, evaluateFollowups, persistFollowupPlans, safeWrite } = require('../src/lib/delivery-followups');
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-followups-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await safeWrite(root, '.aioson/closure-policy.json', JSON.stringify({ schema_version: 1, enabled: true, auto_close: true, allow_secondary_ac_deferral: true, authorized_by: 'test-owner' }));
  await safeWrite(root, 'src/main.js', 'module.exports = "saved";\n');
  await safeWrite(root, '.aioson/context/prd-demo.md', '# PRD\n## Feature Capability Map\n| CAP | Outcome | Actor | Scope | Why |\n|---|---|---|---|---|\n| CAP-demo | Saved result | User | required | Value |\n## Acceptance Criteria\n| AC | CAP | Behavior | Evidence |\n|---|---|---|---|\n| AC-main | CAP-demo | Saved result appears | node --test |\n| AC-label | CAP-demo | Caption matches terminology | manual inspection |\n');
  await safeWrite(root, '.aioson/context/implementation-plan-demo.md', '# Plan\n## Implementation Delta\n| CAP | Action | Evidence | Exact paths | Change |\n|---|---|---|---|---|\n| CAP-demo | modify | Existing module | src/main.js | save result |\n');
  await safeWrite(root, '.aioson/context/qa-report-demo.md', '---\nverdict: accepted_with_followups\n---\n## CAP/AC evidence table\n| CAP | AC | Result | Evidence |\n|---|---|---|---|\n| CAP-demo | AC-main | PASS | Executed save command and read back the saved value |\n| CAP-demo | AC-label | FAIL | Inspected saved result: caption uses old terminology |\n');
  const input = { schema_version: 1, findings: [{ id: 'caption', severity: 'low', kind: 'wording', verified: true, risk: { primary_flow: false, data_loss: false, security: false, availability: false }, summary: 'Correct result caption', reproduction: 'Run the saved result command and inspect the caption.', expected: 'Caption uses the approved terminology.', observed: 'Caption still uses the old wording.', verification: 'node --test tests/caption.test.js', rationale: 'The saved value remains correct and readable.', files: ['src/main.js'], ac_ids: ['AC-label'] }] };
  return { root, input };
}
test('eligible low impact closure persists idempotent plans before archive', async t => {
  const { root, input } = await fixture(t);
  const evaluation = await prepareFollowups(root, 'demo', input);
  assert.equal(evaluation.eligible, true);
  assert.deepEqual(evaluation.deferred_acs, ['AC-LABEL']);
  const plans = await persistFollowupPlans(root, 'demo', evaluation);
  assert.deepEqual(await persistFollowupPlans(root, 'demo', evaluation), plans);
  assert.match(await fs.readFile(path.join(root, plans[0]), 'utf8'), /status: pending/);
  assert.equal((await evaluateFollowups(root, 'demo')).eligible, true);
});
test('changed delivery bytes invalidate the decision', async t => {
  const { root, input } = await fixture(t);
  await prepareFollowups(root, 'demo', input);
  await safeWrite(root, 'src/main.js', 'module.exports = "changed";');
  assert.equal((await evaluateFollowups(root, 'demo')).eligible, false);
});
test('unknown or material risk and missing PASS evidence cannot be classified away', async t => {
  const { root, input } = await fixture(t);
  input.findings[0].risk.security = true;
  await assert.rejects(prepareFollowups(root, 'demo', input), /risk/);
  input.findings[0].risk.security = false;
  input.findings[0].ac_ids.push('AC-main');
  await assert.rejects(prepareFollowups(root, 'demo', input), /FAIL row/);
});
test('traversal and conflicting followup paths fail closed', async t => {
  const { root, input } = await fixture(t);
  input.findings[0].files = ['../outside.txt'];
  await assert.rejects(prepareFollowups(root, 'demo', input));
  input.findings[0].files = ['src/main.js'];
  const evaluation = await prepareFollowups(root, 'demo', input);
  await safeWrite(root, '.aioson/context/simple-plans/demo-followup-caption.md', '# User-owned plan');
  await assert.rejects(persistFollowupPlans(root, 'demo', evaluation), /Conflicting/);
  await assert.rejects(fs.access(path.join(root, '.aioson/context/done/demo/closure-review.json')));
});
test('policy defaults to disabled', async t => {
  const { root } = await fixture(t);
  await fs.unlink(path.join(root, '.aioson/closure-policy.json'));
  assert.equal((await evaluateFollowups(root, 'demo')).reason, 'policy_disabled');
});


test('external links cannot receive followups or supply decision evidence', async t => {
  const { root, input } = await fixture(t);
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-followups-outside-'));
  t.after(() => fs.rm(outside, { recursive: true, force: true }));
  await fs.writeFile(path.join(outside, 'source.js'), 'external data');
  await fs.symlink(outside, path.join(root, 'external'), process.platform === 'win32' ? 'junction' : 'dir');
  input.findings[0].files = ['external/source.js'];
  await assert.rejects(prepareFollowups(root, 'demo', input), /Unsafe/);
  input.findings[0].files = ['src/main.js'];
  const evaluation = await prepareFollowups(root, 'demo', input);
  await fs.symlink(outside, path.join(root, '.aioson/context/simple-plans'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(persistFollowupPlans(root, 'demo', evaluation), /escapes/);
  assert.deepEqual(await fs.readdir(outside), ['source.js']);
});

test('unknown review version, changed policy and missing risk never authorize close', async t => {
  const { root, input } = await fixture(t);
  input.schema_version = 2;
  await assert.rejects(prepareFollowups(root, 'demo', input), /version/);
  input.schema_version = 1;
  delete input.findings[0].risk.availability;
  await assert.rejects(prepareFollowups(root, 'demo', input), /risk/);
  input.findings[0].risk.availability = false;
  await prepareFollowups(root, 'demo', input);
  const policyFile = path.join(root, '.aioson/closure-policy.json');
  const policy = JSON.parse(await fs.readFile(policyFile, 'utf8'));
  policy.authorized_by = 'different-owner';
  await fs.writeFile(policyFile, JSON.stringify(policy));
  assert.equal((await evaluateFollowups(root, 'demo')).eligible, false);
});


test('binary delivery changes invalidate evidence even when UTF-8 decoding would match', async t => {
  const { root, input } = await fixture(t);
  const asset = path.join(root, 'src/icon.png');
  await fs.writeFile(asset, Buffer.from([0xff]));
  input.findings[0].files = ['src/icon.png'];
  await prepareFollowups(root, 'demo', input);
  await fs.writeFile(asset, Buffer.from([0xfe]));
  assert.equal((await evaluateFollowups(root, 'demo')).eligible, false);
});
