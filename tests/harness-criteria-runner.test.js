'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');

const {
  normalizeErrorLine,
  failureSignature,
  runCriteria,
  registerFailureSignatures,
  startRunSignatures
} = require('../src/harness/criteria-runner');

describe('harness/criteria-runner — normalização e assinatura (D7)', () => {
  test('normalizeErrorLine remove paths absolutos, dígitos e timestamps', () => {
    const a = normalizeErrorLine('Error at C:\\dev\\app\\src\\index.js:42:7 on 2026-06-09T10:00:00');
    const b = normalizeErrorLine('Error at /home/ci/app/src/index.js:99:1 on 2026-06-10T23:59:59');
    assert.strictEqual(a, b, 'same error shape must normalize identically across machines');
  });

  test('mesma falha → mesma assinatura; criterion ou exit diferentes → assinaturas diferentes', () => {
    const sig1 = failureSignature('C1', 1, 'AssertionError: expected 2\nstack...');
    const sig2 = failureSignature('C1', 1, 'AssertionError: expected 7\nother stack...');
    assert.strictEqual(sig1, sig2, 'digit normalization makes these equal');
    assert.notStrictEqual(failureSignature('C2', 1, 'AssertionError: expected 2'), sig1);
    assert.notStrictEqual(failureSignature('C1', 2, 'AssertionError: expected 2'), sig1);
  });

  test('timeout tem assinatura própria e estável (EC-7)', () => {
    const sig1 = failureSignature('C1', null, 'Command timed out after 120000ms');
    const sig2 = failureSignature('C1', null, 'Command timed out after 5000ms');
    assert.strictEqual(sig1, sig2);
  });
});

describe('harness/criteria-runner — runCriteria (REQ-16)', () => {
  test('só executa critérios com verification; resultado carrega log e assinatura', async () => {
    const executed = [];
    const sandboxExec = async (command) => {
      executed.push(command);
      if (command === 'exit 1') {
        return { ok: false, stdout: '', stderr: 'boom at line 12', exitCode: 1, timedOut: false };
      }
      return { ok: true, stdout: 'fine', stderr: '', exitCode: 0, timedOut: false };
    };

    const checks = await runCriteria({
      criteria: [
        { id: 'C1', description: 'sem verification — não roda' },
        { id: 'C2', verification: 'echo ok' },
        { id: 'C3', verification: 'exit 1' }
      ],
      cwd: process.cwd(),
      sandboxExec
    });

    assert.deepStrictEqual(executed, ['echo ok', 'exit 1']);
    assert.strictEqual(checks.length, 2);
    const passed = checks.find((c) => c.id === 'C2');
    const failed = checks.find((c) => c.id === 'C3');
    assert.strictEqual(passed.ok, true);
    assert.strictEqual(passed.signature, null);
    assert.strictEqual(failed.ok, false);
    assert.ok(failed.signature, 'failed check must carry a signature');
  });

  test('exceção do sandbox vira check falho, não quebra o runner', async () => {
    const sandboxExec = async () => { throw new Error('spawn failed'); };
    const checks = await runCriteria({
      criteria: [{ id: 'C1', verification: 'anything' }],
      cwd: process.cwd(),
      sandboxExec
    });
    assert.strictEqual(checks[0].ok, false);
    assert.ok(checks[0].signature);
  });
});

describe('harness/criteria-runner — registerFailureSignatures (REQ-17)', () => {
  test('2ª ocorrência no run detecta repetição, mesmo não-consecutiva (EC-13)', () => {
    const progress = {};
    startRunSignatures(progress);

    const failedC1 = { id: 'C1', signature: failureSignature('C1', 1, 'err X') };
    const failedC2 = { id: 'C2', signature: failureSignature('C2', 1, 'err Y') };

    // attempt 1: C1 falha
    assert.deepStrictEqual(registerFailureSignatures(progress, [failedC1]), []);
    // attempt 2: outra falha no meio (sucesso parcial) — EC-13
    assert.deepStrictEqual(registerFailureSignatures(progress, [failedC2]), []);
    // attempt 3: C1 falha de novo → repetição
    const repeats = registerFailureSignatures(progress, [failedC1]);
    assert.strictEqual(repeats.length, 1);
    assert.strictEqual(repeats[0].criterion_id, 'C1');
    assert.strictEqual(progress.failure_signatures.length, 3);
  });

  test('run novo zera as assinaturas — repetição não vaza entre runs', () => {
    const progress = {};
    startRunSignatures(progress);
    const failed = { id: 'C1', signature: failureSignature('C1', 1, 'err') };
    registerFailureSignatures(progress, [failed]);
    startRunSignatures(progress);
    assert.deepStrictEqual(registerFailureSignatures(progress, [failed]), []);
  });
});
