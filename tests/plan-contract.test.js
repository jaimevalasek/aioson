'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { validatePlanContract } = require('../src/lib/plan-contract');
const { contentHash } = require('../src/lib/plan-document');
const prd = '# PRD\n';
const valid = `---\nplan_contract: 2\nsource_prd_sha256: ${contentHash(prd)}\n---\n## Phase 1 — Deliver result\n- CAP/AC: CAP-demo, AC-main, AC-error\n- Files: src/demo.js\n- Verification: node --test\n- Done when: Saved result appears and invalid input is rejected.\n`;
async function check(t, plan = valid, overrides = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-plan-contract-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, '.aioson/context'), { recursive: true });
  await fs.writeFile(path.join(root, '.aioson/context/prd-demo.md'), prd);
  return validatePlanContract({ targetDir: root, slug: 'demo', content: plan,
    acceptance: { rows: [{ ac: 'AC-main' }, { ac: 'AC-error' }] },
    delivery: { rows: [{ cap: 'CAP-demo', phase: '1', files: 'src/demo.js', verification: 'node --test' }] }, ...overrides });
}
test('valid v2 plan is accepted', async t => assert.deepEqual((await check(t)).findings, []));
test('unknown and omitted criteria and absent phases are rejected', async t => {
  let result = await check(t, valid.replace('AC-error', 'AC-ghost'));
  assert.ok(result.findings.some(f => f.check === 'plan_ac_unknown'));
  assert.ok(result.findings.some(f => f.check === 'plan_ac_uncovered'));
  result = await check(t, valid.split('## Phase')[0]);
  assert.ok(result.findings.some(f => f.check === 'plan_phase_unknown'));
});
test('missing verification mechanism and duplicate phase are rejected', async t => {
  const result = await check(t, valid.replace('node --test', 'banana') + '\n## Phase 1 — Duplicate\n');
  assert.ok(result.findings.some(f => f.check === 'plan_phase_duplicate'));
  assert.ok(result.findings.some(f => f.check === 'plan_phase_verification_missing'));
});
test('legacy findings are advisory and new source hashes are enforced', async t => {
  const result = await check(t, valid.replace('plan_contract: 2', 'plan_contract: 1').replace('AC-error', 'AC-ghost'));
  assert.equal(result.findings.length, 0);
  assert.ok(result.warnings.length > 0);
  assert.ok((await check(t, valid.replace(contentHash(prd), '0'.repeat(64)))).findings.some(f => f.check === 'plan_source_stale'));
});


test('npm verification scripts must exist or be explicitly planned', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-plan-script-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ scripts: { test: 'node --test' } }));
  const args = { targetDir: root, slug: 'demo', content: valid.replace('node --test', 'npm run verify:missing'), acceptance: { rows: [{ ac: 'AC-main' }, { ac: 'AC-error' }] }, delivery: { rows: [] } };
  assert.ok((await validatePlanContract(args)).findings.some(f => f.check === 'plan_script_unknown'));
  args.content += '- Create script: verify:missing in package.json\n';
  assert.equal((await validatePlanContract(args)).findings.some(f => f.check === 'plan_script_unknown'), false);
});
