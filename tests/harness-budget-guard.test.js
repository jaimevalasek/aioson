'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');

const {
  estimateTokens,
  startRunBudget,
  recordAttemptTokens,
  checkBudget,
  buildBudgetSummary
} = require('../src/harness/budget-guard');

function freshProgress() {
  const progress = { feature: 'demo', iterations: 0 };
  startRunBudget(progress, 'run-1');
  return progress;
}

describe('harness/budget-guard — estimateTokens (chars/4)', () => {
  test('estimates by chars/4, rounded up', () => {
    assert.strictEqual(estimateTokens('abcd'), 1);
    assert.strictEqual(estimateTokens('abcde'), 2);
    assert.strictEqual(estimateTokens(''), 0);
    assert.strictEqual(estimateTokens(null), 0);
  });
});

describe('harness/budget-guard — accumulator (D3)', () => {
  test('startRunBudget zera o acumulador com run_id novo', () => {
    const progress = freshProgress();
    assert.strictEqual(progress.budget.tokens_estimated, 0);
    assert.strictEqual(progress.budget.warned_80, false);
    assert.strictEqual(progress.budget.run_id, 'run-1');
    assert.ok(progress.budget.run_started_at);
  });

  test('recordAttemptTokens acumula; progress legado sem budget é tolerado (EC-10)', () => {
    const progress = freshProgress();
    recordAttemptTokens(progress, 100);
    recordAttemptTokens(progress, 50);
    assert.strictEqual(progress.budget.tokens_estimated, 150);

    const legacy = { feature: 'old' }; // sem campo budget
    recordAttemptTokens(legacy, 10);
    assert.strictEqual(legacy.budget.tokens_estimated, 10);
  });
});

describe('harness/budget-guard — checkBudget (REQ-7/8)', () => {
  test('null ceiling = sem enforcement (retrocompat)', () => {
    const progress = freshProgress();
    recordAttemptTokens(progress, 999999);
    const result = checkBudget(progress, { costCeilingTokens: null, maxRuntimeMinutes: null });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.events, []);
  });

  test('80% emite budget_warning uma vez por run', () => {
    const progress = freshProgress();
    recordAttemptTokens(progress, 85);
    const first = checkBudget(progress, { costCeilingTokens: 100 });
    assert.strictEqual(first.pause, false);
    assert.strictEqual(first.events.length, 1);
    assert.strictEqual(first.events[0].type, 'budget_warning');

    const second = checkBudget(progress, { costCeilingTokens: 100 });
    assert.deepStrictEqual(second.events, [], 'warning must fire only once per run');
  });

  test('80% e 100% na mesma tentativa: dois eventos em ordem, pausa uma vez (EC-11)', () => {
    const progress = freshProgress();
    recordAttemptTokens(progress, 150);
    const result = checkBudget(progress, { costCeilingTokens: 100 });
    assert.strictEqual(result.pause, true);
    assert.deepStrictEqual(result.events.map((e) => e.type), ['budget_warning', 'budget_exceeded']);
  });

  test('run novo zera o acumulador — 100% não persiste entre runs', () => {
    const progress = freshProgress();
    recordAttemptTokens(progress, 150);
    checkBudget(progress, { costCeilingTokens: 100 });
    startRunBudget(progress, 'run-2');
    const result = checkBudget(progress, { costCeilingTokens: 100 });
    assert.strictEqual(result.pause, false);
    assert.deepStrictEqual(result.events, []);
  });

  test('max_runtime_minutes excedido pausa com runtime_exceeded (REQ-8)', () => {
    const progress = freshProgress();
    progress.budget.run_started_at = new Date(Date.now() - 31 * 60000).toISOString();
    const result = checkBudget(progress, { maxRuntimeMinutes: 30 });
    assert.strictEqual(result.pause, true);
    assert.strictEqual(result.events[0].type, 'runtime_exceeded');
  });

  test('dentro do runtime não pausa', () => {
    const progress = freshProgress();
    const result = checkBudget(progress, { maxRuntimeMinutes: 30 });
    assert.strictEqual(result.pause, false);
  });

  test('buildBudgetSummary inclui feito/faltante', () => {
    const progress = freshProgress();
    progress.iterations = 3;
    recordAttemptTokens(progress, 500);
    const summary = buildBudgetSummary(progress, { maxIterations: 5 });
    assert.match(summary, /3\/5/);
    assert.match(summary, /500/);
    assert.match(summary, /resume/);
  });
});
