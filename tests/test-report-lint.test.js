'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { analyzeTestReport, MANDATORY_SECTIONS, HYPOTHESIS_CLASSES, MATRIX_COLUMNS } = require('../src/lib/test-report-lint');
const { runVerifyArtifact, availableKinds } = require('../src/commands/verify-artifact');

function makeLogger() {
  const lines = [];
  return { log: (m = '') => lines.push(String(m)), error: (m = '') => lines.push(String(m)), warn: () => {}, lines };
}

const SLUG = 'demo-feature';
const MATRIX_HEADER = '| Path | Class | Test | Expected | Result |\n|---|---|---|---|---|';

function goodReport({ matrix, tests, commands, residual } = {}) {
  return `---
feature: ${SLUG}
---

# Test report — Demo Feature

## Scope

QA recorded a coverage trigger on the cancellation flow; tested paths: src/orders/cancel.js, src/orders/refund.js.

## Hypothesis matrix

${matrix ?? `${MATRIX_HEADER}
| src/orders/cancel.js | boundary | rejects cancel on already-cancelled order | 409 with code ALREADY_CANCELLED (AC-cancel-02) | PASS |
| src/orders/cancel.js | failure | refund API timeout leaves order state untouched | status stays \`paid\`, no refund row (EC-2) | PASS |
| src/orders/refund.js | invariant | refund total never exceeds captured total | sum(refunds) <= captured for every sequence (invariant) | PASS |`}

## Tests added or changed

${tests ?? '- tests/orders/cancel-boundary.test.js (new, 3 tests)'}

## Commands and results

${commands ?? '- `npm test -- tests/orders/cancel-boundary.test.js`: PASS (exit code 0)'}

## Residual risk

${residual ?? '- Concurrent cancel+refund race not covered — needs a harness the project does not have; returned to QA as residual.'}
`;
}

test('a well-formed test report measures clean', () => {
  const result = analyzeTestReport({ report: goodReport(), slug: SLUG });
  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.warnings, []);
  assert.equal(result.metrics.sections_present, MANDATORY_SECTIONS.length);
  assert.equal(result.metrics.hypotheses_total, 3);
  assert.equal(result.metrics.hypotheses_by_class.boundary, 1);
  assert.equal(result.metrics.oracle_spec_cited, 3);
  assert.equal(result.metrics.has_expected_column, true);
  assert.deepEqual(result.metrics.test_files_named, ['tests/orders/cancel-boundary.test.js']);
  assert.equal(result.metrics.has_command_evidence, true);
  assert.equal(result.metrics.residual_risk_entries, 1);
  assert.deepEqual(MATRIX_COLUMNS, ['path', 'class', 'test', 'expected', 'result']);
});

test('missing mandatory sections and feature mismatch are issues', () => {
  const text = goodReport().replace('## Residual risk', '## Riscos').replace(`feature: ${SLUG}`, 'feature: other-slug');
  const result = analyzeTestReport({ report: text, slug: SLUG });
  assert.ok(result.issues.some((i) => i.includes('## Residual risk')));
  assert.ok(result.issues.some((i) => i.includes('does not match')));
});

test('an invalid hypothesis class is an issue; the enum is pinned', () => {
  const result = analyzeTestReport({
    report: goodReport({
      matrix: `${MATRIX_HEADER}\n| src/a.js | vibes | looks fine | 42 (AC-1) | PASS |`
    }),
    slug: SLUG
  });
  assert.equal(result.metrics.hypotheses_invalid_class, 1);
  assert.ok(result.issues.some((i) => i.includes('invalid class "vibes"')));
  assert.deepEqual(HYPOTHESIS_CLASSES, ['boundary', 'invariant', 'state-transition', 'failure', 'regression', 'property']);
});

test('a matrix without boundary or failure rows is the adversarial-floor warning', () => {
  const result = analyzeTestReport({
    report: goodReport({
      matrix: `${MATRIX_HEADER}\n| src/a.js | regression | bug #42 stays fixed | total is 30 for the #42 cart (AC-cart-04) | PASS |`
    }),
    slug: SLUG
  });
  assert.deepEqual(result.issues, []);
  assert.ok(result.warnings.some((w) => w.includes('no boundary or failure class')));
});

// ── the oracle: where each expected value came from ──

test('a matrix without the Expected column is an issue — the old four-column shape no longer measures clean', () => {
  const result = analyzeTestReport({
    report: goodReport({
      matrix: '| Path | Class | Test | Result |\n|---|---|---|---|\n| src/a.js | boundary | empty cart | PASS |'
    }),
    slug: SLUG
  });
  assert.equal(result.metrics.has_expected_column, false);
  assert.ok(result.issues.some((i) => /missing column\(s\): expected/.test(i) && /current output is never the oracle/.test(i)));
});

test('an empty Expected cell and an Expected cell that names the current output are issues; the incident is caught from the text alone', () => {
  const result = analyzeTestReport({
    report: goodReport({
      matrix: [
        MATRIX_HEADER,
        '| src/a.js | boundary | empty cart total | | PASS |',
        '| src/a.js | failure | timeout | current output | PASS |',
        '| src/a.js | regression | rounding | same as before | PASS |',
        '| src/b.js | invariant | pt-BR | comportamento atual | PASS |',
        '| src/b.js | boundary | spec-derived | 0 items → total R$ 0,00 (AC-cart-01) | PASS |'
      ].join('\n')
    }),
    slug: SLUG
  });
  assert.equal(result.metrics.oracle_empty_rows, 1);
  assert.equal(result.metrics.oracle_observed_rows, 3, JSON.stringify(result.issues));
  assert.equal(result.metrics.oracle_spec_cited, 1);
  assert.ok(result.issues.some((i) => /"empty cart total" has an empty Expected cell/.test(i)));
  assert.ok(result.issues.some((i) => /"timeout" takes the current output as its oracle \("current output"\)/.test(i)));
  assert.ok(result.issues.some((i) => /"pt-BR" takes the current output as its oracle/.test(i)));
});

test('rows with values but no traceable source are a warning, not an issue', () => {
  const result = analyzeTestReport({
    report: goodReport({
      matrix: `${MATRIX_HEADER}\n| src/a.js | boundary | empty cart | total 0 | PASS |\n| src/a.js | failure | timeout | order untouched | PASS |`
    }),
    slug: SLUG
  });
  assert.deepEqual(result.issues, []);
  assert.equal(result.metrics.oracle_spec_cited, 0);
  assert.ok(result.warnings.some((w) => /no hypothesis row cites the source of its expected value/.test(w)));
});

test('a Tests section that names no file is a warning — the oracle of the pass cannot be measured', () => {
  const result = analyzeTestReport({ report: goodReport({ tests: 'Existing tests already cover the scope; nothing added.' }), slug: SLUG });
  assert.deepEqual(result.metrics.test_files_named, []);
  assert.ok(result.warnings.some((w) => /names no test file/.test(w)));
});

test('commands without an exact command or result marker are an issue; FAIL is legal evidence', () => {
  const noEvidence = analyzeTestReport({
    report: goodReport({ commands: 'Everything was run and worked well.' }),
    slug: SLUG
  });
  assert.ok(noEvidence.issues.some((i) => i.includes('exact executed command')));

  const failEvidence = analyzeTestReport({
    report: goodReport({ commands: '- `npm test -- tests/orders`: FAIL (1 failing) — reproduction routed to Dev' }),
    slug: SLUG
  });
  assert.ok(!failEvidence.issues.some((i) => i.includes('exact executed command')), 'a recorded FAIL is valid evidence');
  assert.equal(failEvidence.metrics.has_red_evidence, true);
});

test('placeholders are issues; an empty residual-risk section is a warning', () => {
  const dirty = analyzeTestReport({ report: goodReport().replace('## Scope\n', '## Scope\n\nTODO: describe scope.\n'), slug: SLUG });
  assert.ok(dirty.issues.some((i) => i.includes('placeholder')));

  const empty = analyzeTestReport({ report: goodReport({ residual: '' }), slug: SLUG });
  assert.equal(empty.metrics.residual_risk_entries, 0);
  assert.ok(empty.warnings.some((w) => w.includes('fully proven')));
});

test('a correction packet without allowed_fix_paths is an issue; one without a recorded red run is a warning', () => {
  const packet = `${goodReport()}
## Correction packet

- Affected AC: AC-cancel-02
- Reproduction: cancel twice, second call double-refunds
- Expected: second call rejected with 409
`;
  const result = analyzeTestReport({ report: packet, slug: SLUG });
  assert.ok(result.issues.some((i) => i.includes('allowed_fix_paths')));
  assert.ok(result.warnings.some((w) => /without a recorded failing run/.test(w)));

  const complete = analyzeTestReport({
    report: `${packet}- allowed_fix_paths:\n  - src/orders/cancel.js\n`.replace(
      '- `npm test -- tests/orders/cancel-boundary.test.js`: PASS (exit code 0)',
      '- `npm test -- tests/orders/cancel-boundary.test.js`: FAIL (1 failing) before the fix\n- `npm test -- tests/orders/cancel-boundary.test.js`: PASS (exit code 0) after the fix'
    ),
    slug: SLUG
  });
  assert.ok(!complete.issues.some((i) => i.includes('allowed_fix_paths')));
  assert.ok(!complete.warnings.some((w) => /without a recorded failing run/.test(w)));
});

// ── adapter wiring ──

test('kind=test-report is registered and requires a slug', async () => {
  assert.ok(availableKinds().includes('test-report'));
  const logger = makeLogger();
  const res = await runVerifyArtifact({ args: ['.'], options: { kind: 'test-report', json: true, suppressExitCode: true }, logger });
  assert.equal(res.ok, false);
  assert.equal(res.error, 'missing_slug');
});

test('kind=test-report measures a real report on disk end to end, reading the test files it names', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-test-report-lint-'));
  try {
    await fs.mkdir(path.join(dir, '.aioson/context'), { recursive: true });
    await fs.mkdir(path.join(dir, 'tests/orders'), { recursive: true });
    await fs.writeFile(path.join(dir, '.aioson/context', `test-report-${SLUG}.md`), goodReport(), 'utf8');
    await fs.writeFile(path.join(dir, 'tests/orders/cancel-boundary.test.js'), [
      "test('AC-cancel-02 rejects a second cancel', () => {",
      "  expect(cancel(order).status).toBe(409);",
      "  expect(cancel(order).code).toBe('ALREADY_CANCELLED');",
      '});'
    ].join('\n'), 'utf8');

    const logger = makeLogger();
    const res = await runVerifyArtifact({
      args: [dir],
      options: { kind: 'test-report', slug: SLUG, json: true, advisory: true, suppressExitCode: true },
      logger
    });
    assert.equal(res.ok, true, JSON.stringify(res.issues));
    assert.equal(res.exitCode, 0);
    assert.equal(res.metrics.hypotheses_total, 3);
    assert.equal(res.metrics.oracle.files_scanned, 1);
    assert.equal(res.metrics.oracle.assertions_value, 2);
    assert.equal(res.metrics.oracle.tautological, 0);
    assert.ok(res.checks.some((check) => check.id === 'test-oracle' && check.ok === true));

    const missing = await runVerifyArtifact({
      args: [dir],
      options: { kind: 'test-report', slug: 'ghost', json: true, advisory: true, suppressExitCode: true },
      logger
    });
    assert.equal(missing.ok, false);
    assert.ok(missing.issues.some((i) => i.includes('test report not found')));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('kind=test-report: the incident replayed — a green test whose oracle is the buggy output is caught at the gate', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-test-report-oracle-'));
  try {
    await fs.mkdir(path.join(dir, '.aioson/context'), { recursive: true });
    await fs.mkdir(path.join(dir, 'tests'), { recursive: true });
    // The tester ran the buggy formatter, saw "R$ NaN", and wrote a test that
    // passes with the bug; a second test was marked expected-to-fail; a third
    // compares the result with itself.
    await fs.writeFile(path.join(dir, 'tests/totals.test.js'), [
      "test('AC-cart-03 formats the total', () => {",
      "  expect(formatTotal(cart)).toBe('R$ NaN'); // matches current output",
      '});',
      "test.fail('AC-cart-04 applies the coupon (known bug)', () => {",
      '  expect(applyCoupon(cart).total).toBe(27);',
      '});',
      "test('AC-cart-05 keeps the subtotal', () => {",
      '  expect(cart.subtotal).toBe(cart.subtotal);',
      '});'
    ].join('\n'), 'utf8');
    await fs.writeFile(path.join(dir, '.aioson/context', `test-report-${SLUG}.md`), goodReport({
      matrix: `${MATRIX_HEADER}\n| src/cart.js | boundary | formats the total | current output | PASS |\n| src/cart.js | regression | coupon | 27 (AC-cart-04) | PASS |`,
      tests: '- tests/totals.test.js (new)'
    }), 'utf8');

    const res = await runVerifyArtifact({
      args: [dir],
      options: { kind: 'test-report', slug: SLUG, json: true, advisory: true, suppressExitCode: true },
      logger: makeLogger()
    });
    assert.equal(res.ok, false);
    assert.ok(res.issues.some((i) => /takes the current output as its oracle/.test(i)), 'the matrix row names the output as the oracle');
    assert.ok(res.issues.some((i) => /tautological assertion tests\/totals\.test\.js:8/.test(i)), 'the self-comparison is an issue');
    assert.ok(res.issues.some((i) => /expected to fail/.test(i)), 'the expected-to-fail test is an issue for the tester');
    assert.ok(res.warnings.some((w) => /bug-shaped expectation/.test(w) && /R\$ NaN/.test(w)), 'the NaN expectation is named with its sample');
    assert.ok(res.warnings.some((w) => /admitting the oracle is the implementation/.test(w)), 'the comment is named');
    assert.equal(res.metrics.oracle.tautological, 1);
    assert.equal(res.metrics.oracle.expected_failure_markers, 1);
    assert.equal(res.metrics.oracle.bug_shaped_expectations, 1);
    assert.ok(res.checks.some((check) => check.id === 'test-oracle' && check.ok === false));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('kind=test-report: a named file outside the project or missing on disk is reported, never read', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-test-report-paths-'));
  try {
    await fs.mkdir(path.join(dir, '.aioson/context'), { recursive: true });
    await fs.writeFile(path.join(dir, '.aioson/context', `test-report-${SLUG}.md`), goodReport({
      tests: '- tests/ghost.test.js (new)\n- ../outside/evil.test.js'
    }), 'utf8');
    const res = await runVerifyArtifact({
      args: [dir],
      options: { kind: 'test-report', slug: SLUG, json: true, advisory: true, suppressExitCode: true },
      logger: makeLogger()
    });
    assert.equal(res.metrics.oracle.files_scanned, 0);
    assert.deepEqual(res.metrics.oracle.files_unreadable, ['tests/ghost.test.js']);
    assert.ok(res.warnings.some((w) => /none is readable inside the project/.test(w)));
    assert.ok(res.warnings.some((w) => /names 1 test file\(s\)/.test(w)), 'the traversal was dropped before the policy, so one path was named');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
