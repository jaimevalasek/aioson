'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

const { runHarnessCheck } = require('../src/commands/harness-check');

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

const mockT = () => undefined; // força fallback embutido, como nos demais testes de harness

async function makeTmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-harness-check-test-'));
}

async function writeContract(tmpDir, slug, contract, progress = null) {
  const planDir = path.join(tmpDir, '.aioson', 'plans', slug);
  await fs.mkdir(planDir, { recursive: true });
  await fs.writeFile(
    path.join(planDir, 'harness-contract.json'),
    JSON.stringify(contract, null, 2),
    'utf8'
  );
  if (progress) {
    await fs.writeFile(
      path.join(planDir, 'progress.json'),
      JSON.stringify(progress, null, 2),
      'utf8'
    );
  }
  return planDir;
}

function baseContract(slug, criteria) {
  return { feature: slug, governor: {}, criteria };
}

test('harness:check: exige slug quando não há contrato ativo', async () => {
  const tmpDir = await makeTmpDir();
  const result = await runHarnessCheck({ args: [tmpDir], options: {}, logger: makeLogger(), t: mockT });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.error, 'missing_slug');
});

test('harness:check: erro quando contrato não existe para o slug', async () => {
  const tmpDir = await makeTmpDir();
  const result = await runHarnessCheck({
    args: [tmpDir],
    options: { slug: 'no-such-feature' },
    logger: makeLogger(),
    t: mockT
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.error, 'contract_not_found');
});

test('harness:check: contrato com schema inválido é rejeitado', async () => {
  const tmpDir = await makeTmpDir();
  const slug = 'bad-schema';
  await writeContract(tmpDir, slug, { feature: slug, governor: {}, typo_field: true });
  const result = await runHarnessCheck({
    args: [tmpDir],
    options: { slug },
    logger: makeLogger(),
    t: mockT
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.error, 'contract_schema_invalid');
  assert.ok(result.errors.length >= 1);
});

test('harness:check: critérios sem verification = nada executável, ok=true', async () => {
  const tmpDir = await makeTmpDir();
  const slug = 'prose-only';
  await writeContract(tmpDir, slug, baseContract(slug, [
    { id: 'C1', description: 'subjetivo', assertion: 'looks good', binary: true }
  ]));
  const result = await runHarnessCheck({
    args: [tmpDir],
    options: { slug },
    logger: makeLogger(),
    t: mockT
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.executable_total, 0);
  assert.strictEqual(result.skipped_no_verification, 1);
  assert.strictEqual(result.checks.length, 0);
});

test('harness:check: check que passa retorna ok=true e persiste last-check-output.json', async () => {
  const tmpDir = await makeTmpDir();
  const slug = 'passing';
  const planDir = await writeContract(tmpDir, slug, baseContract(slug, [
    { id: 'C1', description: 'sai com 0', assertion: 'exit 0', binary: true, verification: 'node -e "process.exit(0)"' }
  ]));
  const result = await runHarnessCheck({
    args: [tmpDir],
    options: { slug },
    logger: makeLogger(),
    t: mockT
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.passed, 1);
  assert.strictEqual(result.failed, 0);
  assert.strictEqual(result.checks[0].id, 'C1');
  assert.strictEqual(result.checks[0].ok, true);

  const persisted = JSON.parse(
    await fs.readFile(path.join(planDir, 'last-check-output.json'), 'utf8')
  );
  assert.strictEqual(persisted.slug, slug);
  assert.strictEqual(persisted.ok, true);
  assert.strictEqual(persisted.checks.length, 1);
});

test('harness:check: check que falha retorna ok=false com assinatura e não toca progress.json', async () => {
  const tmpDir = await makeTmpDir();
  const slug = 'failing';
  const progress = {
    feature: slug,
    phase: 1,
    status: 'in_progress',
    completed_steps: [],
    last_error: null,
    session_count: 1,
    last_updated: '2026-01-01T00:00:00.000Z',
    circuit_state: 'CLOSED'
  };
  const planDir = await writeContract(tmpDir, slug, baseContract(slug, [
    { id: 'C1', description: 'sai com 1', assertion: 'exit 1', binary: true, verification: 'node -e "console.error(\'boom\'); process.exit(1)"' }
  ]), progress);

  const result = await runHarnessCheck({
    args: [tmpDir],
    options: { slug },
    logger: makeLogger(),
    t: mockT
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.failed, 1);
  assert.strictEqual(result.checks[0].ok, false);
  assert.ok(result.checks[0].signature, 'check falho deve carregar failure signature');

  // read-only: progress.json permanece byte a byte como antes
  const after = JSON.parse(await fs.readFile(path.join(planDir, 'progress.json'), 'utf8'));
  assert.deepStrictEqual(after, progress);
});

test('harness:check: --criteria filtra subconjunto', async () => {
  const tmpDir = await makeTmpDir();
  const slug = 'subset';
  await writeContract(tmpDir, slug, baseContract(slug, [
    { id: 'C1', description: 'passa', binary: true, verification: 'node -e "process.exit(0)"' },
    { id: 'C2', description: 'falharia', binary: true, verification: 'node -e "process.exit(1)"' }
  ]));
  const result = await runHarnessCheck({
    args: [tmpDir],
    options: { slug, criteria: 'C1' },
    logger: makeLogger(),
    t: mockT
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.criteria_total, 1);
  assert.strictEqual(result.checks.length, 1);
  assert.strictEqual(result.checks[0].id, 'C1');
});

test('harness:check: --criteria com id desconhecido é erro', async () => {
  const tmpDir = await makeTmpDir();
  const slug = 'unknown-id';
  await writeContract(tmpDir, slug, baseContract(slug, [
    { id: 'C1', description: 'ok', binary: true }
  ]));
  const result = await runHarnessCheck({
    args: [tmpDir],
    options: { slug, criteria: 'C1,C9' },
    logger: makeLogger(),
    t: mockT
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.error, 'unknown_criteria');
  assert.deepStrictEqual(result.missing, ['C9']);
});

test('harness:check: auto-descobre o contrato ativo quando --slug é omitido', async () => {
  const tmpDir = await makeTmpDir();
  const slug = 'auto-discovered';
  await writeContract(tmpDir, slug, baseContract(slug, [
    { id: 'C1', description: 'passa', binary: true, verification: 'node -e "process.exit(0)"' }
  ]), {
    feature: slug,
    status: 'in_progress',
    last_updated: '2026-06-11T00:00:00.000Z',
    circuit_state: 'CLOSED'
  });
  const result = await runHarnessCheck({
    args: [tmpDir],
    options: {},
    logger: makeLogger(),
    t: mockT
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.slug, slug);
});

test('harness:check: --json emite o relatório completo no logger', async () => {
  const tmpDir = await makeTmpDir();
  const slug = 'json-mode';
  await writeContract(tmpDir, slug, baseContract(slug, [
    { id: 'C1', description: 'passa', binary: true, verification: 'node -e "process.exit(0)"' }
  ]));
  const logger = makeLogger();
  const result = await runHarnessCheck({
    args: [tmpDir],
    options: { slug, json: true },
    logger,
    t: mockT
  });
  assert.strictEqual(result.ok, true);
  const parsed = JSON.parse(logger.lines.join('\n'));
  assert.strictEqual(parsed.slug, slug);
  assert.strictEqual(parsed.passed, 1);
});
