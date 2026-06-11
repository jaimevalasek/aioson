'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { runForgeCompile } = require('../src/commands/forge-compile');

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
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-forge-compile-test-'));
}

const GOOD_PLAN = (slug) => [
  '---',
  `feature: ${slug}`,
  'status: approved',
  '---',
  '# Implementation Plan',
  '## Execution Sequence',
  '| Phase | Wave | Scope | Primary files | Done criteria |',
  '|---|---|---|---|---|',
  '| 1 | 1 | data layer | `src/db.js` | db tests pass |',
  '| 2 | 2 | api | `src/api.js` | api tests pass |',
  '| 3 | 2 | ui | `src/ui.js` | ui renders |'
].join('\n');

const GOOD_CONTRACT = (slug) => ({
  feature: slug,
  contract_mode: 'BALANCED',
  governor: { max_steps: 50, error_streak_limit: 4 },
  criteria: [
    { id: 'C1', description: 'db works', assertion: 'tests pass', binary: true, verification: 'node --test tests/db.test.js' },
    { id: 'C2', description: 'api REST-shaped', assertion: 'endpoints follow REST conventions', binary: true },
    { id: 'C3', description: 'advisory style', assertion: 'code feels clean', binary: false }
  ]
});

async function setupFeature(dir, slug, { plan = GOOD_PLAN(slug), contract = GOOD_CONTRACT(slug) } = {}) {
  const ctx = path.join(dir, '.aioson', 'context');
  const planDir = path.join(dir, '.aioson', 'plans', slug);
  await fs.mkdir(ctx, { recursive: true });
  await fs.mkdir(planDir, { recursive: true });
  if (plan !== null) await fs.writeFile(path.join(ctx, `implementation-plan-${slug}.md`), plan, 'utf8');
  if (contract !== null) await fs.writeFile(path.join(planDir, 'harness-contract.json'), JSON.stringify(contract, null, 2), 'utf8');
  return { ctx, planDir };
}

test('forge:compile: exige --feature', async () => {
  const dir = await makeTmpDir();
  const result = await runForgeCompile({ args: [dir], options: {}, logger: makeLogger() });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.error, 'missing_feature');
});

test('forge:compile: contrato ausente é erro com orientação', async () => {
  const dir = await makeTmpDir();
  const logger = makeLogger();
  const result = await runForgeCompile({ args: [dir], options: { feature: 'nope' }, logger });
  assert.strictEqual(result.error, 'contract_not_found');
  assert.match(logger.errors.join('\n'), /@sheldon/);
});

test('forge:compile: contrato sem critério executável é recusado', async () => {
  const dir = await makeTmpDir();
  const slug = 'no-exec';
  await setupFeature(dir, slug, {
    contract: {
      feature: slug,
      governor: {},
      criteria: [{ id: 'C1', description: 'x', assertion: 'y', binary: true }]
    }
  });
  const result = await runForgeCompile({ args: [dir], options: { feature: slug }, logger: makeLogger() });
  assert.strictEqual(result.error, 'no_executable_criteria');
});

test('forge:compile: plano sem coluna Wave é recusado com orientação ao @pm', async () => {
  const dir = await makeTmpDir();
  const slug = 'no-wave';
  await setupFeature(dir, slug, {
    plan: [
      '## Execution Sequence',
      '| Phase | Scope | Primary files | Done criteria |',
      '|---|---|---|---|',
      '| 1 | data | `src/db.js` | ok |'
    ].join('\n')
  });
  const logger = makeLogger();
  const result = await runForgeCompile({ args: [dir], options: { feature: slug }, logger });
  assert.strictEqual(result.error, 'no_wave_column');
  assert.match(logger.errors.join('\n'), /@pm/);
});

test('forge:compile: wave_file_overlap (warning no analyze) bloqueia a compilação', async () => {
  const dir = await makeTmpDir();
  const slug = 'overlap';
  await setupFeature(dir, slug, {
    plan: [
      '## Execution Sequence',
      '| Phase | Wave | Scope | Primary files | Done criteria |',
      '|---|---|---|---|---|',
      '| 1 | 1 | a | `src/x.js` | ok |',
      '| 2 | 1 | b | `src/x.js` | ok |'
    ].join('\n')
  });
  const result = await runForgeCompile({ args: [dir], options: { feature: slug }, logger: makeLogger() });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.error, 'spec_analyze_blockers');
  assert.ok(result.blockers.some((b) => b.check === 'wave_file_overlap'));
});

test('forge:compile: happy path gera o script com waves, critérios e bounds do governor', async () => {
  const dir = await makeTmpDir();
  const slug = 'happy';
  const { planDir } = await setupFeature(dir, slug);

  const result = await runForgeCompile({ args: [dir], options: { feature: slug }, logger: makeLogger() });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.executable_criteria, 1);
  assert.strictEqual(result.judged_criteria, 1, 'C2 (binary sem verification) é julgado; C3 (advisory) fica fora');
  assert.strictEqual(result.max_fix_rounds, 4, 'error_streak_limit do governor vira o cap do fix loop');
  assert.deepStrictEqual(result.waves, [
    { wave: 1, phases: ['1'] },
    { wave: 2, phases: ['2', '3'] }
  ]);

  const script = fsSync.readFileSync(path.join(planDir, 'forge-run.workflow.js'), 'utf8');

  // Contrato do runtime de workflows
  assert.match(script, /^export const meta = \{/, 'meta literal puro no topo');
  assert.match(script, new RegExp(`"name": "forge-run-${slug}"`));
  assert.ok(!script.includes('Date.now('), 'Date.now é proibido em workflow scripts');
  assert.ok(!script.includes('Math.random('), 'Math.random é proibido em workflow scripts');
  assert.ok(!script.includes('new Date('), 'new Date é proibido em workflow scripts');

  // Estrutura compilada
  assert.match(script, /phase\("Wave 1"\)/);
  assert.match(script, /phase\("Wave 2"\)/);
  assert.strictEqual((script.match(/await parallel\(\[/g) || []).length, 2, 'um parallel por wave');
  assert.match(script, /dev:phase-2/);
  assert.match(script, /dev:phase-3/);
  assert.match(script, /const MAX_FIX_ROUNDS = 4/);
  assert.match(script, /node --test tests\/db\.test\.js/, 'verification do C1 embutida');
  assert.match(script, /JUDGED_CRITERIA/);
  assert.match(script, /refute:/, 'revisão adversarial para critérios julgados');
  assert.match(script, /harness:check/, 'convergência determinística');
  assert.match(script, /harness:apply-validation/, 'veredito consumido pelo circuit breaker');
  assert.match(script, /feature:close is yours/, 'gate humano explícito');
  assert.ok(!script.includes('feature:close . --feature=' + slug + "'\n)"), 'script nunca executa feature:close');
});

test('forge:compile: determinístico — duas compilações produzem o mesmo script', async () => {
  const dir = await makeTmpDir();
  const slug = 'determinism';
  const { planDir } = await setupFeature(dir, slug);

  await runForgeCompile({ args: [dir], options: { feature: slug }, logger: makeLogger() });
  const first = fsSync.readFileSync(path.join(planDir, 'forge-run.workflow.js'), 'utf8');
  await runForgeCompile({ args: [dir], options: { feature: slug }, logger: makeLogger() });
  const second = fsSync.readFileSync(path.join(planDir, 'forge-run.workflow.js'), 'utf8');
  assert.strictEqual(first, second);
});

test('forge:compile: texto malicioso do plano não escapa do literal JS', async () => {
  const dir = await makeTmpDir();
  const slug = 'inject';
  await setupFeature(dir, slug, {
    plan: [
      '## Execution Sequence',
      '| Phase | Wave | Scope | Primary files | Done criteria |',
      '|---|---|---|---|---|',
      '| 1 | 1 | evil `${process.exit(1)}` scope | `src/a.js` | done`; return {}; ` |'
    ].join('\n')
  });
  const result = await runForgeCompile({ args: [dir], options: { feature: slug }, logger: makeLogger() });
  assert.strictEqual(result.ok, true);
  const script = fsSync.readFileSync(path.join(dir, '.aioson', 'plans', slug, 'forge-run.workflow.js'), 'utf8');
  // O conteúdo vindo do plano entra via JSON.stringify (string com aspas
  // duplas, onde ${} é inerte). O invariante: removidos os literais de aspas
  // duplas, NENHUM ${ pode sobrar no código gerado — ou seja, interpolação
  // só poderia existir dentro de strings inertes.
  const stripped = script.replace(/"(?:[^"\\]|\\.)*"/g, '""');
  assert.ok(!stripped.includes('${'), 'nenhuma interpolação fora de strings inertes no script gerado');
  const promptLine = script.split('\n').find((l) => l.includes('process.exit(1)'));
  assert.ok(promptLine, 'texto do plano presente');
  assert.ok(promptLine.includes('agent("'), 'texto do plano embutido como string JSON dentro do agent()');
  assert.match(script, /dev:phase-1/);
});

test('forge:compile: --json emite o relatório', async () => {
  const dir = await makeTmpDir();
  const slug = 'json-mode';
  await setupFeature(dir, slug);
  const logger = makeLogger();
  const result = await runForgeCompile({ args: [dir], options: { feature: slug, json: true }, logger });
  assert.strictEqual(result.ok, true);
  const parsed = JSON.parse(logger.lines.join('\n'));
  assert.strictEqual(parsed.slug, slug);
  assert.match(parsed.scriptPath, /forge-run\.workflow\.js/);
});
