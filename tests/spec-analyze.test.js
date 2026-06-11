'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

const { runSpecAnalyze } = require('../src/commands/spec-analyze');

function makeLogger() {
  const lines = [];
  const errors = [];
  return {
    log: (msg = '') => lines.push(String(msg)),
    error: (msg = '') => errors.push(String(msg)),
    lines,
    errors
  };
}

async function makeTmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-spec-analyze-test-'));
}

async function writeContext(dir, files) {
  const ctx = path.join(dir, '.aioson', 'context');
  await fs.mkdir(ctx, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    await fs.writeFile(path.join(ctx, name), content, 'utf8');
  }
  return ctx;
}

async function writeContract(dir, slug, contract) {
  const planDir = path.join(dir, '.aioson', 'plans', slug);
  await fs.mkdir(planDir, { recursive: true });
  await fs.writeFile(path.join(planDir, 'harness-contract.json'), JSON.stringify(contract, null, 2), 'utf8');
}

function findingsBy(report, check) {
  return report.findings.filter((f) => f.check === check);
}

test('spec:analyze: exige --feature', async () => {
  const dir = await makeTmpDir();
  const result = await runSpecAnalyze({ args: [dir], options: {}, logger: makeLogger() });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.error, 'missing_feature');
});

test('spec:analyze: cadeia consistente não gera findings', async () => {
  const dir = await makeTmpDir();
  const slug = 'clean';
  await writeContext(dir, {
    [`prd-${slug}.md`]: '# PRD\nGoal.',
    [`requirements-${slug}.md`]: '# Reqs\nREQ-CL-01 must hold. AC-CL-01 verifies it.',
    [`implementation-plan-${slug}.md`]: '# Plan\nPhase 1 implements REQ-CL-01 per AC-CL-01.'
  });
  const result = await runSpecAnalyze({ args: [dir], options: { feature: slug }, logger: makeLogger() });
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.findings, []);
});

test('spec:analyze: REQ declarado sem rastreio downstream gera warning (com pelo menos um rastreado)', async () => {
  const dir = await makeTmpDir();
  const slug = 'untraced';
  await writeContext(dir, {
    [`requirements-${slug}.md`]: 'REQ-UT-01 covered. REQ-UT-02 forgotten.',
    [`implementation-plan-${slug}.md`]: 'Plan covers REQ-UT-01 only.'
  });
  const result = await runSpecAnalyze({ args: [dir], options: { feature: slug }, logger: makeLogger() });
  assert.strictEqual(result.ok, true, 'warning não bloqueia');
  const untraced = findingsBy(result, 'untraced_requirement');
  assert.strictEqual(untraced.length, 1);
  assert.match(untraced[0].message, /REQ-UT-02/);
});

test('spec:analyze: plano em prosa (zero IDs rastreados) não gera ruído de gap', async () => {
  const dir = await makeTmpDir();
  const slug = 'prose';
  await writeContext(dir, {
    [`requirements-${slug}.md`]: 'REQ-PR-01 and REQ-PR-02.',
    [`implementation-plan-${slug}.md`]: 'A prose plan that names no ids at all.'
  });
  const result = await runSpecAnalyze({ args: [dir], options: { feature: slug }, logger: makeLogger() });
  assert.strictEqual(findingsBy(result, 'untraced_requirement').length, 0);
});

test('spec:analyze: ID referenciado downstream sem declaração é órfão', async () => {
  const dir = await makeTmpDir();
  const slug = 'orphan';
  await writeContext(dir, {
    [`requirements-${slug}.md`]: 'REQ-OR-01 only.',
    [`implementation-plan-${slug}.md`]: 'Implements REQ-OR-01 and the invented REQ-OR-99.'
  });
  const result = await runSpecAnalyze({ args: [dir], options: { feature: slug }, logger: makeLogger() });
  const orphans = findingsBy(result, 'orphan_reference');
  assert.strictEqual(orphans.length, 1);
  assert.match(orphans[0].message, /REQ-OR-99/);
  assert.ok(orphans[0].artifacts.includes('implementation_plan'));
});

test('spec:analyze: upstream editado depois do downstream gera stale_downstream', async () => {
  const dir = await makeTmpDir();
  const slug = 'stale';
  const ctx = await writeContext(dir, {
    [`prd-${slug}.md`]: '# PRD v1',
    [`implementation-plan-${slug}.md`]: '# Plan from v1'
  });
  // PRD "editado" bem depois do plano: empurra o mtime além da tolerância de 60s
  const future = new Date(Date.now() + 10 * 60 * 1000);
  await fs.utimes(path.join(ctx, `prd-${slug}.md`), future, future);

  const result = await runSpecAnalyze({ args: [dir], options: { feature: slug }, logger: makeLogger() });
  const stale = findingsBy(result, 'stale_downstream');
  assert.strictEqual(stale.length, 1);
  assert.match(stale[0].message, /prd was modified after implementation-plan/);
  assert.strictEqual(result.ok, true, 'staleness é warning, não bloqueia');
});

test('spec:analyze: readiness blocked é error e bloqueia o gate', async () => {
  const dir = await makeTmpDir();
  const slug = 'blocked';
  await writeContext(dir, {
    [`design-doc-${slug}.md`]: '---\nreadiness: blocked\n---\n# Design'
  });
  const result = await runSpecAnalyze({ args: [dir], options: { feature: slug }, logger: makeLogger() });
  assert.strictEqual(result.ok, false);
  const blockedFindings = findingsBy(result, 'readiness_blocked');
  assert.strictEqual(blockedFindings.length, 1);
});

test('spec:analyze: contrato com erro de schema é error; cobertura é info', async () => {
  const dir = await makeTmpDir();
  const slug = 'contract';
  await writeContext(dir, {
    [`requirements-${slug}.md`]: 'AC-CT-01 holds.'
  });
  await writeContract(dir, slug, {
    feature: slug,
    governor: {},
    typo_field: true,
    criteria: [{ id: 'C1', description: 'x', binary: true }]
  });
  const result = await runSpecAnalyze({ args: [dir], options: { feature: slug }, logger: makeLogger() });
  assert.strictEqual(result.ok, false);
  assert.ok(findingsBy(result, 'contract_schema').length >= 1, 'typo_field deve virar error');
});

test('spec:analyze: AC declarado sem menção no contrato gera info contract_ac_unlinked', async () => {
  const dir = await makeTmpDir();
  const slug = 'ac-link';
  await writeContext(dir, {
    [`requirements-${slug}.md`]: 'AC-AL-01 e AC-AL-02.'
  });
  await writeContract(dir, slug, {
    feature: slug,
    governor: {},
    criteria: [{ id: 'C1', description: 'paraphrased criterion', binary: true, verification: 'node -e "process.exit(0)"' }]
  });
  const result = await runSpecAnalyze({ args: [dir], options: { feature: slug }, logger: makeLogger() });
  assert.strictEqual(result.ok, true);
  const unlinked = findingsBy(result, 'contract_ac_unlinked');
  assert.strictEqual(unlinked.length, 1);
  assert.strictEqual(unlinked[0].severity, 'info');
});

test('spec:analyze: fases na mesma wave com arquivos sobrepostos geram wave_file_overlap', async () => {
  const dir = await makeTmpDir();
  const slug = 'waves-overlap';
  await writeContext(dir, {
    [`implementation-plan-${slug}.md`]: [
      '# Plan',
      '## Execution Sequence',
      '| Phase | Wave | Scope | Primary files | Done criteria |',
      '|---|---|---|---|---|',
      '| 1 | 1 | data | `src/db.js`, `src/models.js` | tests pass |',
      '| 2 | 2 | api | `src/api.js`, `src/db.js` | tests pass |',
      '| 3 | 2 | ui | `src/ui.js`, src/db.js | tests pass |',
      ''
    ].join('\n')
  });
  const result = await runSpecAnalyze({ args: [dir], options: { feature: slug }, logger: makeLogger() });
  const overlaps = findingsBy(result, 'wave_file_overlap');
  assert.strictEqual(overlaps.length, 1, 'apenas o par da wave 2 compartilha arquivo');
  assert.match(overlaps[0].message, /wave 2/);
  assert.match(overlaps[0].message, /src\/db\.js/);
  assert.strictEqual(result.ok, true, 'overlap é warning, não bloqueia');
});

test('spec:analyze: waves disjuntas não geram findings', async () => {
  const dir = await makeTmpDir();
  const slug = 'waves-clean';
  await writeContext(dir, {
    [`implementation-plan-${slug}.md`]: [
      '## Execution Sequence',
      '| Phase | Wave | Scope | Primary files | Done criteria |',
      '|---|---|---|---|---|',
      '| 1 | 1 | data | `src/db.js` | ok |',
      '| 2 | 2 | api | `src/api.js` | ok |',
      '| 3 | 2 | ui | `src/ui.js` | ok |'
    ].join('\n')
  });
  const result = await runSpecAnalyze({ args: [dir], options: { feature: slug }, logger: makeLogger() });
  assert.strictEqual(findingsBy(result, 'wave_file_overlap').length, 0);
});

test('spec:analyze: plano sem coluna Wave não dispara o check (retrocompat)', async () => {
  const dir = await makeTmpDir();
  const slug = 'waves-legacy';
  await writeContext(dir, {
    [`implementation-plan-${slug}.md`]: [
      '## Execution Sequence',
      '| Phase | Scope | Primary files | Done criteria |',
      '|---|---|---|---|',
      '| 1 | data | `src/db.js` | ok |',
      '| 2 | api | `src/db.js` | ok |'
    ].join('\n')
  });
  const result = await runSpecAnalyze({ args: [dir], options: { feature: slug }, logger: makeLogger() });
  assert.strictEqual(findingsBy(result, 'wave_file_overlap').length, 0);
  assert.strictEqual(result.ok, true);
});

test('spec:analyze: persiste spec-analyze-{slug}.json em .aioson/context', async () => {
  const dir = await makeTmpDir();
  const slug = 'persist';
  const ctx = await writeContext(dir, {
    [`requirements-${slug}.md`]: 'REQ-PS-01.'
  });
  const result = await runSpecAnalyze({ args: [dir], options: { feature: slug }, logger: makeLogger() });
  assert.strictEqual(result.ok, true);
  const persisted = JSON.parse(await fs.readFile(path.join(ctx, `spec-analyze-${slug}.json`), 'utf8'));
  assert.strictEqual(persisted.feature, slug);
  assert.deepStrictEqual(persisted.summary, { errors: 0, warnings: 0, info: 0 });
});

test('spec:analyze: --json emite o relatório completo no logger', async () => {
  const dir = await makeTmpDir();
  const slug = 'json-out';
  await writeContext(dir, {
    [`requirements-${slug}.md`]: 'REQ-JO-01.'
  });
  const logger = makeLogger();
  const result = await runSpecAnalyze({ args: [dir], options: { feature: slug, json: true }, logger });
  assert.strictEqual(result.ok, true);
  const parsed = JSON.parse(logger.lines.join('\n'));
  assert.strictEqual(parsed.feature, slug);
  assert.ok(Array.isArray(parsed.findings));
});
