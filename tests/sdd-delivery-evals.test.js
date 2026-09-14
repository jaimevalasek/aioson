'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const corpus = require('./fixtures/sdd-delivery/corpus.json');
const { validatePlanContract } = require('../src/lib/plan-contract');
const { contentHash } = require('../src/lib/plan-document');

for (const scenario of corpus.cases) test(`SDD corpus: ${scenario.id}`, async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-sdd-eval-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, '.aioson/context'), { recursive: true });
  const prd = '# Approved outcome\nSave valid values; reject invalid values with an observable error.\n';
  await fs.writeFile(path.join(root, '.aioson/context/prd-demo.md'), prd);
  let content = `---\nplan_contract: 2\nsource_prd_sha256: ${contentHash(prd)}\n---\n## Phase 1 — Save and reject invalid input\n- CAP/AC: CAP-save, AC-save, AC-error\n- Files: src/save.js\n- Verification: node --test tests/save.test.js\n- Done when: Saved values reload and invalid input returns a visible error.\n`;
  const delivery = { rows: [{ cap: 'CAP-save', phase: '1', files: 'src/save.js', verification: 'node --test tests/save.test.js' }] };
  if (['omit-error-ac', 'legacy-omission', 'appendix-ac'].includes(scenario.mutation)) content = content.replace(', AC-error', '');
  if (scenario.mutation === 'invent-ac') content = content.replace('AC-error', 'AC-error, AC-admin');
  if (scenario.mutation === 'phantom-phase') delivery.rows[0].phase = '9';
  if (scenario.mutation === 'prose-verification') {
    content = content.replace('node --test tests/save.test.js', 'check that it works');
    delivery.rows[0].verification = 'check that it works';
  }
  if (scenario.mutation === 'stale-prd') await fs.appendFile(path.join(root, '.aioson/context/prd-demo.md'), 'Owner now requires cancellation.\n');
  if (scenario.mutation === 'legacy-omission') content = content.replace('plan_contract: 2', 'plan_contract: 1');
  if (scenario.mutation === 'appendix-ac') content += '\n## Appendix\nAC-error is important.\n';
  const report = await validatePlanContract({ targetDir: root, slug: 'demo', content, delivery, acceptance: { rows: [{ ac: 'AC-save' }, { ac: 'AC-error' }] } });
  assert.deepEqual([...new Set(report.findings.map(f => f.check))].sort(), [...scenario.blocking].sort());
  for (const expected of scenario.warnings || []) assert.ok(report.warnings.some(f => f.check === expected));
});
