'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');

const {
  DEFAULT_FORBIDDEN_GLOBS,
  CONTRACT_PRESETS,
  validateContract,
  resolveContract
} = require('../src/harness/contract-schema');

function legacyContract(extra = {}) {
  // Shape gerado pelo harness:init pré-loop-guardrails (EC-12)
  return {
    feature: 'demo',
    contract_mode: 'BALANCED',
    governor: {
      max_steps: 50,
      error_streak_limit: 5,
      cost_ceiling_tokens: null
    },
    criteria: [
      { id: 'C1', description: 'Estrutura', assertion: 'all files exist', binary: true }
    ],
    ...extra
  };
}

describe('harness/contract-schema — validateContract (REQ-1)', () => {
  test('legacy contract is valid; binary criterion without verification only warns (EC-12)', () => {
    const result = validateContract(legacyContract());
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.errors, []);
    // Único warning permitido no shape legado: cobertura executável (advisory).
    assert.strictEqual(result.warnings.length, 1);
    assert.strictEqual(result.warnings[0].field, 'criteria[0].verification');
    assert.match(result.warnings[0].reason, /no executable verification/);
  });

  test('binary criterion with verification produces no coverage warning', () => {
    const result = validateContract(legacyContract({
      criteria: [
        { id: 'C1', description: 'Estrutura', assertion: 'all files exist', binary: true, verification: 'node --test tests/foo.test.js' }
      ]
    }));
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.warnings, []);
  });

  test('advisory criterion (binary: false) without verification produces no coverage warning', () => {
    const result = validateContract(legacyContract({
      criteria: [
        { id: 'C1', description: 'UX feel', assertion: 'looks polished', binary: false }
      ]
    }));
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.warnings, []);
  });

  test('unknown top-level field fails with the field name', () => {
    const result = validateContract(legacyContract({ allowed_filez: ['src/**'] }));
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.errors[0].field, 'allowed_filez');
    assert.match(result.errors[0].reason, /unknown field/);
  });

  test('unknown governor field fails with dotted path', () => {
    const contract = legacyContract();
    contract.governor.max_stepz = 10;
    const result = validateContract(contract);
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some((e) => e.field === 'governor.max_stepz'));
  });

  test('wrong types produce explicit field + reason', () => {
    const result = validateContract(legacyContract({
      allowed_files: 'src/**',
      forbidden_files: [42]
    }));
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some((e) => e.field === 'allowed_files' && /array/.test(e.reason)));
    assert.ok(result.errors.some((e) => e.field === 'forbidden_files[0]'));
  });

  test('glob outside the strict subset is rejected (D1)', () => {
    const result = validateContract(legacyContract({ forbidden_files: ['src/{a,b}/**'] }));
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.errors[0].field, 'forbidden_files[0]');
    assert.match(result.errors[0].reason, /unsupported glob syntax/);
  });

  test('allowed_files: [] is a warning, not an error (EC-5)', () => {
    const result = validateContract(legacyContract({ allowed_files: [] }));
    assert.strictEqual(result.ok, true);
    const allowedWarnings = result.warnings.filter((w) => w.field === 'allowed_files');
    assert.strictEqual(allowedWarnings.length, 1);
  });

  test('invalid contract_mode is rejected; presets accepted case-insensitively (REQ-19)', () => {
    assert.strictEqual(validateContract(legacyContract({ contract_mode: 'YOLO' })).ok, false);
    for (const mode of ['safe', 'SAFE', 'builder', 'autopilot', 'BALANCED']) {
      assert.strictEqual(validateContract(legacyContract({ contract_mode: mode })).ok, true, mode);
    }
  });

  test('human_gate requires required_for with valid themes', () => {
    const missing = validateContract(legacyContract({ human_gate: {} }));
    assert.strictEqual(missing.ok, false);
    assert.ok(missing.errors.some((e) => e.field === 'human_gate.required_for'));

    const badTheme = validateContract(legacyContract({
      human_gate: { required_for: ['payment_logic_change', 'world_domination'] }
    }));
    assert.strictEqual(badTheme.ok, false);
    assert.ok(badTheme.errors.some((e) => e.field === 'human_gate.required_for[1]'));

    const ok = validateContract(legacyContract({
      human_gate: {
        required_for: ['publish'],
        themes: [{ name: 'auth_permission_change', paths: ['src/security/**'] }]
      }
    }));
    assert.strictEqual(ok.ok, true);
  });

  test('criteria[].verification must be a non-empty string when present', () => {
    const contract = legacyContract();
    contract.criteria.push({ id: 'C2', verification: '   ' });
    const result = validateContract(contract);
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some((e) => e.field === 'criteria[1].verification'));
  });

  test('non-object contract fails at root', () => {
    assert.strictEqual(validateContract(null).ok, false);
    assert.strictEqual(validateContract([]).ok, false);
  });
});

describe('harness/contract-schema — resolveContract', () => {
  test('defaults proibidos sempre presentes e não-removíveis (REQ-4)', () => {
    const resolved = resolveContract(legacyContract());
    for (const glob of DEFAULT_FORBIDDEN_GLOBS) {
      assert.ok(resolved.forbidden_files.includes(glob), `missing default: ${glob}`);
    }
    const withCustom = resolveContract(legacyContract({ forbidden_files: ['dist/**'] }));
    assert.ok(withCustom.forbidden_files.includes('dist/**'));
    assert.ok(withCustom.forbidden_files.includes('.env*'));
  });

  test('preset fills only undefined governor values; explicit wins (REQ-19)', () => {
    const contract = legacyContract({ contract_mode: 'safe' });
    contract.governor = { max_steps: 99 }; // explícito
    const resolved = resolveContract(contract);
    assert.strictEqual(resolved.governor.max_steps, 99);
    assert.strictEqual(resolved.governor.error_streak_limit, CONTRACT_PRESETS.safe.error_streak_limit);
    assert.strictEqual(resolved.governor.cost_ceiling_tokens, CONTRACT_PRESETS.safe.cost_ceiling_tokens);
    assert.strictEqual(resolved.governor.max_runtime_minutes, CONTRACT_PRESETS.safe.max_runtime_minutes);
  });

  test('BALANCED fills nothing (default unchanged)', () => {
    const resolved = resolveContract(legacyContract());
    assert.strictEqual(resolved.governor.max_runtime_minutes, undefined);
    assert.strictEqual(resolved.governor.max_changed_files, undefined);
  });

  test('explicit null survives preset (null = sem limite, explícito)', () => {
    const contract = legacyContract({ contract_mode: 'safe' });
    contract.governor.cost_ceiling_tokens = null;
    const resolved = resolveContract(contract);
    assert.strictEqual(resolved.governor.cost_ceiling_tokens, null);
  });

  test('allowed_files [] resolves to null (EC-5); populated list survives', () => {
    assert.strictEqual(resolveContract(legacyContract({ allowed_files: [] })).allowed_files, null);
    assert.deepStrictEqual(
      resolveContract(legacyContract({ allowed_files: ['src/**'] })).allowed_files,
      ['src/**']
    );
  });

  test('theme override substitui (não mescla) os paths default', () => {
    const resolved = resolveContract(legacyContract({
      human_gate: {
        required_for: ['payment_logic_change'],
        themes: [{ name: 'payment_logic_change', paths: ['src/money/**'] }]
      }
    }));
    assert.deepStrictEqual(resolved.human_gate.theme_paths.payment_logic_change, ['src/money/**']);
    // tema sem override mantém o default
    assert.deepStrictEqual(resolved.human_gate.theme_paths.auth_permission_change, ['**/auth/**']);
  });

  test('does not mutate the input contract', () => {
    const contract = legacyContract({ contract_mode: 'safe' });
    const snapshot = JSON.stringify(contract);
    resolveContract(contract);
    assert.strictEqual(JSON.stringify(contract), snapshot);
  });
});
