'use strict';

// The oracle lint reads the test files themselves and names the shapes of an
// implementation-derived oracle: a test that asserts what the code does today
// instead of what was approved. Tautologies are provable issues; everything else
// is a measured warning with samples. Fixtures cover the stack families the
// catalog claims so a regex drift in one family surfaces here, not in a
// consumer project.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  analyzeTestOracle,
  scanTestFileOracle,
  extractTestFilePaths,
  extractCommentary,
  readBalanced,
  splitTopLevel
} = require('../src/lib/test-oracle-lint');

function scan(content, file = 'tests/sample.test.js') {
  return scanTestFileOracle(content, { file });
}

test('an expression asserted against itself is a tautology in every equality family', () => {
  const js = scan([
    "test('AC-1', () => {",
    '  expect(total).toBe(total);',
    '  expect(sum(a, b)).toEqual(sum(a, b));',
    '  assert.equal(order.total, order.total);',
    '  assert.deepStrictEqual(view(state), view(state));',
    '  expect(result.name).toBe("Ana");',
    '  assert.equal(order.total, 10);',
    '});'
  ].join('\n'));
  assert.equal(js.tautological.length, 2, JSON.stringify(js.tautological));
  assert.ok(js.tautological.every((entry) => /against itself/.test(entry.text)));
  // f(x) against f(x) is a determinism check — measured on consumer suites it
  // is often deliberate, so it is a warning-tier signal, never an issue.
  assert.equal(js.self_comparison_calls.length, 2, JSON.stringify(js.self_comparison_calls));
  assert.ok(js.self_comparison_calls.every((entry) => /compares a call with the same call/.test(entry.text)));

  const py = scan('def test_total():\n    assert total == total\n    self.assertEqual(a, a)\n    assert compute(2) == 4\n', 'tests/test_total.py');
  assert.equal(py.tautological.length, 2);

  const php = scan('class T extends TestCase { function testA() { $this->assertEquals($order->total, $order->total); $this->assertSame(10, $order->total); } }', 'tests/OrderTest.php');
  assert.equal(php.tautological.length, 1);

  const go = scan('func TestX(t *testing.T) {\n  assert.Equal(t, got, got)\n  assert.Equal(t, want, got)\n}\n', 'x_test.go');
  assert.equal(go.tautological.length, 1, 'the testing.T first argument is skipped before comparing');

  const rust = scan('#[test]\nfn ac_1() {\n  assert_eq!(total, total);\n  assert_eq!(total, 10);\n}\n', 'src/lib.rs');
  assert.equal(rust.tautological.length, 1);

  const ruby = scan('def test_total\n  assert_equal total, total\n  assert_equal 10, total\nend\n', 'test/total_test.rb');
  assert.equal(ruby.tautological.length, 1);

  const dotnet = scan('[Fact] public void T() { Assert.Equal(order.Total, order.Total); Assert.Equal(10, order.Total); }', 'OrderTests.cs');
  assert.equal(dotnet.tautological.length, 1);
});

test('a literal or constant in the actual position is a tautology — the system under test is absent', () => {
  const result = scan([
    'expect(true).toBe(true);',
    "expect('ab').toBe('cd');",
    'assert.ok(true);',
    'assertTrue(true);',
    'expect(value).toBe(true);'
  ].join('\n'));
  assert.equal(result.tautological.length, 4, JSON.stringify(result.tautological));
  assert.ok(result.tautological.some((entry) => /asserts a literal/.test(entry.text)));
  assert.ok(result.tautological.some((entry) => /asserts a constant/.test(entry.text)));

  const py = scan('def test_x():\n    assert True\n    assert flag\n', 'tests/test_x.py');
  assert.equal(py.tautological.length, 1);
});

test('strings of equal length are never confused for a tautology (raw text is compared, not the mask)', () => {
  const result = scan("expect(label('a')).toBe('ab');\nexpect(label('b')).toBe('cd');\nexpect(f('x')).toEqual({ a: 1 });");
  assert.equal(result.tautological.length, 0);
  assert.equal(result.assertions.value, 3);
});

test('a template literal with an interpolation is an expression, not a literal', () => {
  const result = scan('expect(`${node.attrs.x},${node.attrs.y}`).toBe(tags.pos);\nexpect(`fixed`).toBe(`fixed`);');
  assert.equal(result.tautological.length, 1, JSON.stringify(result.tautological));
  assert.match(result.tautological[0].text, /`fixed`/);
});

test('a negated matcher against itself is not reported as a tautology', () => {
  const result = scan('expect(copy).not.toBe(copy);');
  assert.equal(result.tautological.length, 0);
});

test('disabled, expected-to-fail and snapshot markers are counted per family, never inside strings', () => {
  const result = scan([
    "it.skip('later', () => {});",
    "test.todo('one day');",
    "test.fixme('broken', () => {});",
    "xit('legacy', () => {});",
    "test.fail('known bug', () => {});",
    'expect(out).toMatchSnapshot();',
    'expect(view).toMatchInlineSnapshot(`x`);',
    'await expect(page).toHaveScreenshot();',
    'const text = "it.skip( and toMatchSnapshot( inside a string";',
    'process.exit(0);'
  ].join('\n'));
  assert.equal(result.disabled_tests.length, 4, JSON.stringify(result.disabled_tests));
  assert.equal(result.expected_failure_markers.length, 1);
  assert.equal(result.snapshot_assertions.length, 3);

  const py = scan('@pytest.mark.skip\ndef test_a(): pass\n@pytest.mark.xfail\ndef test_b(): pass\nassert out == snapshot\n', 'tests/test_a.py');
  assert.equal(py.disabled_tests.length, 1);
  assert.equal(py.expected_failure_markers.length, 1);
  assert.equal(py.snapshot_assertions.length, 1);

  const others = scan([
    "$this->markTestSkipped('later');",
    '@Disabled',
    '[Fact(Skip = "flaky")]',
    't.Skip("ci")',
    '#[ignore]',
    'insta::assert_snapshot!(out);',
    'pending = true;'
  ].join('\n'), 'mixed.txt');
  assert.equal(others.disabled_tests.length, 5, 'a bare `pending` assignment is a disabled test only in a Ruby file');
  assert.equal(others.snapshot_assertions.length, 1);

  const ruby = scan('def test_a\n  skip "flaky"\nend\n', 'test/a_test.rb');
  assert.equal(ruby.disabled_tests.length, 1);
});

test('bug-shaped expectations: undefined/NaN/[object Object] asserted as the correct result, with the legitimate shapes excluded', () => {
  const result = scan([
    "expect(fmt(x)).toBe('R$ NaN');",
    "expect(label).toBe('undefined');",
    "expect(title).toBe('[object Object]');",
    'expect(total).toBeNaN();',
    "expect(typeof v).toBe('undefined');",
    "expect(() => parse()).toThrow('undefined variable');",
    'expect(total).not.toBe(NaN);',
    "expect(res.status).toBe(500);",
    "expect(res.status).toBe(200);",
    "expect(args).toEqual(['-f', 'null']);"
  ].join('\n'));
  assert.equal(result.bug_shaped_expectations.length, 4, JSON.stringify(result.bug_shaped_expectations));
  assert.equal(result.server_error_expectations.length, 1);
});

test('comments and test titles that admit the oracle is the implementation are collected in English, pt-BR and Spanish', () => {
  const result = scan([
    '// matches current behaviour until fixed',
    "test('returns null — comportamento atual', () => {});",
    '# known bug: the API returns 500 here',
    '/* as implemented today */',
    'it("AC-2 totals the cart", () => {});',
    'const observedState = "enabled"; // a domain word, not an admission',
    '// por enquanto devolve a lista vazia',
    "test('\"Manter por enquanto\" keeps the previous folder listed (AC-7)', () => {});",
    "test('preserves the current implementation record', () => {});"
  ].join('\n'));
  const admitted = result.observed_oracle_admissions.map((entry) => entry.line);
  // "for now"/"por enquanto"/"until fixed" count only in comments — in a title
  // they are the product's own copy or the behavior under test (lines 8-9).
  assert.deepEqual(admitted, [1, 2, 3, 4, 7], JSON.stringify(result.observed_oracle_admissions));

  const es = scan('// comportamiento actual, por ahora', 'tests/a.test.js');
  assert.equal(es.observed_oracle_admissions.length, 1);
});

test('value and existence-only assertions are told apart by the operand, not the function name', () => {
  const result = scan([
    'expect(list).toBeDefined();',
    'expect(list).toHaveLength(2);',
    'assert.ok(list);',
    'assert.ok(list.length === 2);',
    'assertTrue(flag);',
    'assertTrue(x > 1);',
    'expect(fn).not.toThrow();',
    "expect(fn).toThrow('boom');",
    'require.NoError(t, err)',
    'assert!(list.is_empty());',
    'assert!(list.len() == 2);'
  ].join('\n'));
  assert.equal(result.assertions.value, 5, JSON.stringify(result.assertions));
  assert.equal(result.assertions.existence_only, 6);
});

test('analyzeTestOracle: tautologies are issues, expected-to-fail is an issue for the tester and a warning for the audit, the rest are warnings with samples', () => {
  const files = [{
    file: 'tests/orders.test.js',
    content: [
      "test('AC-orders-01', () => {",
      '  expect(total).toBe(total);',
      "  expect(fmt(x)).toBe('NaN');",
      '  expect(out).toMatchSnapshot();',
      '});',
      "test.fail('AC-orders-02 known bug', () => {});",
      "it.skip('AC-orders-03', () => {});"
    ].join('\n')
  }];
  const tester = analyzeTestOracle({ files, mode: 'tester' });
  assert.equal(tester.issues.length, 2, JSON.stringify(tester.issues));
  assert.ok(tester.issues.some((issue) => /tautological assertion tests\/orders\.test\.js:2/.test(issue)));
  assert.ok(tester.issues.some((issue) => /expected to fail/.test(issue)));
  assert.ok(tester.warnings.some((warning) => /disabled test/.test(warning) && /tests\/orders\.test\.js:7/.test(warning)));
  assert.ok(tester.warnings.some((warning) => /snapshot assertion/.test(warning)));
  assert.ok(tester.warnings.some((warning) => /bug-shaped expectation/.test(warning)));
  assert.equal(tester.metrics.files_scanned, 1);
  assert.equal(tester.metrics.tautological, 1);
  assert.equal(tester.metrics.expected_failure_markers, 1);
  assert.equal(tester.metrics.samples.tautological.length, 1);

  const audit = analyzeTestOracle({ files, mode: 'audit' });
  assert.equal(audit.issues.length, 1);
  assert.ok(audit.warnings.some((warning) => /expected to fail/.test(warning)));
});

test('a file that never pins a value and a suite that is mostly existence-only are named', () => {
  const weak = analyzeTestOracle({
    files: [{ file: 'tests/smoke.test.js', content: 'expect(app).toBeDefined();\nexpect(app.boot).toBeTruthy();\nassert.ok(app);\nexpect(fn).not.toThrow();\nexpect(x).toBeNull();\n' }]
  });
  assert.ok(weak.warnings.some((warning) => /1 file\(s\) never pin a value/.test(warning) && /tests\/smoke\.test\.js/.test(warning)));
  assert.ok(weak.warnings.some((warning) => /existence-only/.test(warning)));
  assert.equal(weak.metrics.weak_assertion_ratio, 1);
  assert.deepEqual(weak.metrics.samples.files_without_value_assertion, ['tests/smoke.test.js']);

  const clean = analyzeTestOracle({
    files: [{ file: 'tests/cart.test.js', content: "expect(cart.total()).toBe(30);\nexpect(cart.items).toHaveLength(2);\nexpect(cart.coupon).toBeNull();\n" }]
  });
  assert.deepEqual(clean.issues, []);
  assert.deepEqual(clean.warnings, []);
});

test('extractTestFilePaths keeps project-relative test files and drops URLs, absolute paths and traversals', () => {
  const body = [
    '- tests/orders/cancel.test.js (new, 3 tests)',
    '- `src/__tests__/a.spec.ts` (changed)',
    '- tests\\win\\b.test.ts',
    '- api_test.go and FooTest.php',
    '- https://example.test/x.test.js',
    '- ../outside/c.test.js',
    '- C:/abs/d.test.js',
    '- the file src/orders/cancel.js itself was not changed'
  ].join('\n');
  assert.deepEqual(extractTestFilePaths(body), [
    'tests/orders/cancel.test.js',
    'src/__tests__/a.spec.ts',
    'tests/win/b.test.ts',
    'src/orders/cancel.js',
    'api_test.go',
    'FooTest.php'
  ]);
  assert.deepEqual(extractTestFilePaths('none — the existing tests already cover the scope'), []);
});

test('helpers: balanced groups skip quotes and nesting; commentary covers //, #, /* */ and test titles', () => {
  const group = readBalanced('expect(f("a)b", [1, (2)])).toBe(1)', 6);
  assert.equal(group.inner, 'f("a)b", [1, (2)])');
  assert.deepEqual(splitTopLevel('a, g(b, c), "d,e", [f, g]'), ['a', 'g(b, c)', '"d,e"', '[f, g]']);
  const commentary = extractCommentary('// one\nconst url = "http://x/y"; # two\n/* three\nfour */\nit("five", () => {});\n');
  assert.deepEqual(commentary.map((entry) => entry.text.trim()), ['one', 'two', 'three', 'four', 'five']);
});
