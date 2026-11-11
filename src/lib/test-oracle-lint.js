'use strict';

/**
 * Static test-oracle linter — where did each expected value come from?
 *
 * A test that asserts what the code does today proves nothing about the
 * approved behavior: when the implementation is wrong, the test is green and
 * the defect is now protected by a regression suite. Until this lint the
 * framework measured that a test file EXISTS, cites an AC and holds "an
 * assertion signal" (ac:test-audit) and that the tester's report has the right
 * sections (test-report-lint) — never whether the oracle of a single assertion
 * was the spec or the output. This module reads the test files themselves and
 * names the shapes that betray an implementation-derived oracle:
 *
 *   - tautologies: a variable or property asserted against itself, a constant,
 *     or a literal asserted against a matcher — the system under test is not in
 *     the assertion (issue: provable from text alone); a call compared with the
 *     same call (`expect(f(x)).toBe(f(x))`) is a determinism check and only a
 *     warning — measured on consumer suites, half of the self-comparisons were
 *     deliberate stability checks;
 *   - expected-to-fail markers (`test.fail`, `xfail`, `expectedFailure`): a test
 *     written FOR the bug and graded green while the bug stands;
 *   - disabled tests (skip/todo/fixme/@Disabled/#[ignore]/markTestSkipped…):
 *     the usual way a red test is made green without touching the code;
 *   - snapshot assertions: the current output IS the oracle by construction;
 *   - bug-shaped expectations: `undefined`, `NaN`, `[object Object]`,
 *     `Invalid Date` or an HTTP 5xx asserted as the correct result;
 *   - admissions in comments and test titles ("current behavior", "known bug",
 *     "until fixed", "comportamento atual", "por enquanto", …);
 *   - the value/existence ratio: a file whose assertions only check that
 *     something exists or did not throw proves the code runs, not that it is
 *     right.
 *
 * Same trade as the sibling lints: pure text, stack-agnostic (JS/TS, Python,
 * PHP, Ruby, Go, Rust, Java/Kotlin, .NET, Swift, Dart, Elixir families),
 * build-free. Only the tautology is an issue; everything else is a measured
 * warning with samples so the reviewer — QA, or the tester before handoff —
 * judges in context. Known limits: assertion vocabularies are catalogs, not
 * parsers; a custom matcher reads as neither value nor existence; a skip
 * guarded by a platform check is still counted as a disabled test (the sample
 * shows the guard).
 */

const fs = require('node:fs');
const path = require('node:path');
const { maskNonCode } = require('./source-mask');

const SAMPLE_LIMIT = 5;
const SAMPLE_WIDTH = 160;

// ── locating assertions whose two sides can be compared ──

const EXPECT_CHAIN_RE = /(?<![\w$.])expect\s*\(/g;
const EQUALITY_MATCHER_RE = /^\s*(?:\.\s*(?:resolves|rejects)\s*)?\.\s*(toBe|toEqual|toStrictEqual|toBeTruthy|toBeFalsy|toBeDefined|toBeNull|toBeUndefined|to\.(?:deep\.)?(?:equal|eql|eq))\s*\(/;
// `(?<![\w$])` and not `[\w$.]`: method-style calls (`self.assertEqual`,
// `$this->assertEquals`, `t.is`) are the common form in half the families.
const EQUALITY_CALL_RE = /(?<![\w$])(?:assert\s*\.\s*(?:equal|strictEqual|deepEqual|deepStrictEqual|Equal|EqualValues|Same)|Assert\s*\.\s*(?:Equal|AreEqual|Same|StrictEqual)|assertEquals|assertEqual|assertSame|assertStrictEquals|XCTAssertEqual|assert_eq!|assert_equal|t\s*\.\s*(?:is|deepEqual|equal|same|strictSame)|should\s*\.\s*equal|expect_equal)\s*\(/g;
const RUBY_ASSERT_EQUAL_RE = /^\s*assert_equal\s+([^,\n(]+),\s*([^\n]+?)\s*$/gm;
const PY_BARE_EQUALITY_RE = /^\s*assert\s+(?!True\b|False\b)([^\n]+?)\s*$/gm;
const CONSTANT_TRUTH_RE = /(?<![\w$])(?:assert\s*\.\s*(?:ok|isTrue|isOk|strictEqual)|assertTrue|assert|Assert\s*\.\s*(?:True|IsTrue)|XCTAssertTrue|XCTAssert|assert!|ok|t\s*\.\s*(?:ok|true|truthy))\s*\(\s*(?:true|True|1)\s*[,)]/g;
const PY_CONSTANT_TRUTH_RE = /^\s*assert\s+True\b/gm;
// A template literal with `${…}` is an expression, not a literal.
const BARE_LITERAL_RE = /^(?:true|false|null|undefined|None|nil|-?\d+(?:\.\d+)?|'[^']*'|"[^"]*"|`(?:(?!\$\{)[^`])*`)$/;
// `f(x)` compared with `f(x)` is a determinism check — weak, but not a
// tautology: a stateful or time-based call can legitimately differ.
const CALL_EXPRESSION_RE = /\w\s*\(/;
const TEST_HARNESS_FIRST_ARG_RE = /^(?:t|s\.T\(\)|suite\.T\(\)|tb)$/;

// ── shapes read on the masked (code-only) view ──

const DISABLED_TEST_RE = [
  /(?<![\w$.])(?:it|test|describe|context|suite|specify|scenario)\s*\.\s*(?:skip|todo|fixme|skipIf)\s*\(/,
  /(?<![\w$.])(?:xit|xtest|xdescribe|xcontext|xspecify)\s*\(/,
  /@pytest\.mark\.skip(?:if)?\b|(?<![\w.])pytest\.skip\s*\(|@unittest\.skip(?:If|Unless)?\b|\bself\.skipTest\s*\(/,
  /\bmarkTestSkipped\s*\(|\bmarkTestIncomplete\s*\(/,
  /@Disabled\b|@Ignore\b|@Ignored\b/,
  /\[Ignore\b|\[(?:Fact|Theory)\s*\(\s*Skip\s*=/,
  /\bt\.Skip(?:f|Now)?\s*\(/,
  /#\[ignore\b/,
  /@tag\s+:skip\b|@moduletag\s+:skip\b/
];
// Ruby's bare `skip` / `pending` read as a disabled test only in a Ruby file —
// `pending = true` is an ordinary assignment everywhere else.
const RUBY_DISABLED_RE = /^\s*(?:skip|pending)(?:\s*\(|\s+\S|\s*$)/m;

const EXPECTED_FAILURE_RE = [
  /(?<![\w$.])(?:test|it)\s*\.\s*(?:fail|fails)\s*\(/,
  /@pytest\.mark\.xfail\b|(?<![\w.])pytest\.xfail\s*\(/,
  /@unittest\.expectedFailure\b/
];

const SNAPSHOT_RE = [
  /\.\s*toMatch(?:Inline|File|Image|Diff)?Snapshot\s*\(/,
  /\.\s*toHaveScreenshot\s*\(/,
  /\.\s*toThrowErrorMatching(?:Inline)?Snapshot\s*\(/,
  /\bassertMatches(?:Json|Html|Text|Xml|File|Object)?Snapshot\s*\(|\bassertSnapshot\s*\(/,
  /\binsta::assert_\w+!|\bassert_(?:debug_|display_|json_|yaml_|ron_|toml_|csv_)?snapshot!/,
  /\bcupaloy\.|\bsnaps\.Match|\bsnapshotter\./,
  /==\s*snapshot\b|\bsnapshot\s*==|\bsnapshot\.assert_match\b/,
  /\bmatch_snapshot\b/
];

// A line is an assertion when the masked view carries one of these.
const ASSERTION_SIGNAL_RE = /(?<![\w$])(?:expect|assert\w*|should|Assert\s*\.\s*\w+|XCTAssert\w*|require\s*\.\s*\w+|t\s*\.\s*(?:ok|is|equal|deepEqual|same|throws|match))\s*[(!.]|\.\s*(?:toBe|toEqual|toStrictEqual|toMatch|toContain|toHave\w+|to\s*\.|should\s*\.)/;

// Expected values no approved behavior ever describes.
const BUG_SHAPED_STRING_RE = /(['"`])(?:undefined|NaN|Invalid Date|\[object (?:Object|Promise|Undefined|Array|Null)\]|undefined undefined|NaN%|R\$\s?NaN|\$NaN|NaN,00|undefined,undefined|: undefined|: NaN)\1|\[object Object\]|Invalid Date/;
const BUG_SHAPED_CODE_RE = /\.\s*toBeNaN\s*\(|(?:toBe|toEqual|toStrictEqual|strictEqual|deepStrictEqual|deepEqual|equal|assertEqual|assertEquals|assertSame|assert_eq!|Equal|AreEqual|XCTAssertEqual|assert_equal)\s*\(\s*(?:[^,()]+,\s*)?(?:NaN|-?Infinity|float\(\s*['"]nan['"]\s*\)|math\.nan|f64::NAN|f32::NAN|double\.NaN|Double\.NaN|Float::NAN)\s*[,)]/;
const BUG_SHAPED_EXCLUDE_RE = /typeof|parsedType|\.not\s*\.|toThrow|throws|rejects|raises|expectException|assertRaises|Raises|rescue|catch\s*\(|error|Error|message|Message|invalid|Invalid(?! Date)|\bnot\b|should_not|not_to|to_not/;
const SERVER_ERROR_RE = /(?<![\w.])50[0-4](?![\w.])/;
const SERVER_ERROR_CONTEXT_RE = /status|Status|code|Code|response|resp\b|res\b|http|HTTP|ServerError|server_error/;

// Comments and test titles that admit the oracle was the implementation. The
// first list is unambiguous anywhere; the second reads as an admission only in
// a comment — in a test title "for now" or "until fixed" is usually the
// product's own copy or the behavior under test (measured on consumer suites).
const OBSERVED_ORACLE_PHRASES = [
  /\b(?:current|existing|observed|actual|today'?s)\s+behaviou?r\b/i,
  /\bmatch(?:es|ing)?\s+(?:the\s+)?(?:current|existing)\s+(?:behaviou?r|output|implementation)\b/i,
  /\b(?:known|existing|open)\s+(?:bug|issue|defect|limitation)\b/i,
  /\b(?:locks?|pins?|freezes?)\s+(?:in\s+)?(?:the\s+)?current\s+(?:behaviou?r|output)\b/i,
  /\bcharacteri[sz]ation\s+test/i,
  /\bgolden\s+master\b/i,
  /\b(?:comportamento|sa[ií]da)\s+atua(?:l|is)\b/i,
  /\bbug\s+conhecido\b/i,
  /\bcongela\s+o\s+comportamento\b/i,
  /\bcomportamiento\s+actual\b/i,
  /\bbug\s+conocido\b/i
];
const COMMENT_ONLY_PHRASES = [
  /\b(?:current|existing|observed|actual|today'?s)\s+output\b/i,
  /\bas\s+(?:currently\s+)?implemented\b/i,
  /\b(?:until|till)\s+(?:this\s+is\s+|it\s+is\s+|the\s+bug\s+is\s+)?fixed\b/i,
  /\bnot\s+yet\s+(?:implemented|fixed|wired)\b/i,
  /\bworkaround\b/i,
  /\bfor\s+now\b/i,
  /\bcomo\s+(?:est[aá]\s+)?implementad[oa]\b/i,
  /\bat[ée]\s+(?:ser\s+|que\s+seja\s+)?corrigid[oa]\b/i,
  /\bainda\s+n[aã]o\s+(?:implementad|corrigid)/i,
  /\bpor\s+enquanto\b/i,
  /\b(?:hoje|atualmente)\s+(?:retorna|devolve|exibe|mostra|falha|quebra)\b/i,
  /\bpor\s+ahora\b/i
];

// ── assertion families: does the assertion pin a value, or only an existence? ──

const VALUE_ASSERTION_RE = [
  /\.\s*(?:toBe|toEqual|toStrictEqual|toMatch|toMatchObject|toContain|toContainEqual|toHaveLength|toHaveProperty|toHaveBeenCalledWith|toHaveBeenLastCalledWith|toHaveBeenNthCalledWith|toHaveBeenCalledTimes|toHaveReturnedWith|toHaveLastReturnedWith|toHaveText|toHaveValue|toHaveValues|toHaveAttribute|toHaveURL|toHaveTitle|toHaveCount|toHaveClass|toHaveCSS|toHaveId|toHaveJSProperty|toContainText|toHaveAccessibleName|toHaveRole|toBeGreaterThan|toBeGreaterThanOrEqual|toBeLessThan|toBeLessThanOrEqual|toBeCloseTo|toBeInstanceOf|toThrow|toThrowError|toBeOneOf|toSatisfy|toEqualTypeOf|toMatchTypeOf|toBeTypeOf|toHaveResolvedWith|toHaveRejectedWith)\s*\(\s*[^)\s]/,
  /\.\s*(?:to|and)\s*(?:\.\s*(?:be|have|deep|not|include|been|a|an))*\s*\.\s*(?:equal|eql|eq|equals|match|include|includes|contain|contains|lengthOf|length|property|members|keys|closeTo|above|below|least|most|within|instanceOf|instanceof|throw|string|oneOf|respondTo|satisfy)\s*\(\s*[^)\s]/,
  /\bassert\s*\.\s*(?:equal|strictEqual|deepEqual|deepStrictEqual|notEqual|notStrictEqual|notDeepEqual|notDeepStrictEqual|match|doesNotMatch|lengthOf|include|includes|notInclude|property|propertyVal|nestedPropertyVal|closeTo|approximately|isAbove|isBelow|isAtLeast|isAtMost|sameMembers|sameDeepMembers|containsAllKeys|hasAllKeys|hasAnyKeys|instanceOf|typeOf|oneOf)\s*\(/,
  /\bassert\s*\.\s*(?:throws|rejects|doesNotThrow|doesNotReject)\s*\([^,)]+,\s*\S/,
  /\bassert(?:Equal|Equals|NotEqual|AlmostEqual|NotAlmostEqual|In|NotIn|Is|IsNot|IsInstance|NotIsInstance|Regex|NotRegex|Raises|RaisesRegex|Warns|WarnsRegex|Logs|NoLogs|CountEqual|ListEqual|DictEqual|SetEqual|TupleEqual|SequenceEqual|MultiLineEqual|Greater|GreaterEqual|Less|LessEqual)\s*\(/,
  /^\s*assert\s+.*?(?:==|!=|>=|<=|=~|\bin\b|\bnot\s+in\b|\bis\s+not\b|\bisinstance\s*\(|\.startswith\(|\.endswith\(|\blen\s*\()/,
  /\bpytest\.(?:raises|warns|approx)\s*\(/,
  /->\s*assert(?:Equals|Same|NotEquals|NotSame|Count|NotCount|Contains|NotContains|StringContainsString|StringNotContainsString|StringStartsWith|StringEndsWith|Matches|MatchesRegularExpression|ArrayHasKey|ArrayNotHasKey|InstanceOf|NotInstanceOf|Json|JsonStringEqualsJsonString|JsonPath|JsonFragment|JsonCount|JsonStructure|JsonMissing|EqualsCanonicalizing|EqualsWithDelta|GreaterThan|LessThan|GreaterThanOrEqual|LessThanOrEqual|IsArray|IsString|IsInt|IsFloat|IsBool|IsIterable|ObjectHasProperty|Status|Ok|Created|Accepted|NoContent|NotFound|Forbidden|Unauthorized|Redirect|RedirectToRoute|See|SeeText|SeeInOrder|DontSee|SessionHas|SessionHasErrors|SessionMissing|ViewIs|ViewHas|Exact|ExactJson|Header|HeaderMissing|Cookie|Download|Successful|ServerError|Unprocessable|BadRequest|Conflict|Gone|MethodNotAllowed|DatabaseHas|DatabaseMissing|DatabaseCount|SoftDeleted|NotSoftDeleted|ModelExists|ModelMissing|Dispatched|NotDispatched|DispatchedTimes|Pushed|NotPushed|Sent|NotSent|NothingSent|Queued|NotQueued|Stored|Missing|FileEquals|StringEqualsFile|Equal)\s*\(/,
  /->\s*expectException(?:Message|MessageMatches|Code)?\s*\(/,
  /\b(?:assert_eq|assert_ne|assert_matches|debug_assert_eq|debug_assert_ne|assert_approx_eq)!\s*\(/,
  /\b(?:assert|require)\s*\.\s*(?:Equal|EqualValues|NotEqual|NotEqualValues|Exactly|Contains|NotContains|Len|ElementsMatch|Regexp|JSONEq|YAMLEq|Greater|GreaterOrEqual|Less|LessOrEqual|InDelta|InEpsilon|ErrorIs|ErrorAs|ErrorContains|EqualError|Same|NotSame|Subset|NotSubset|WithinDuration|IsType|Implements|HTTPStatusCode|HTTPBodyContains|HTTPBodyNotContains|Positive|Negative|Zero|NotZero|Condition)\s*\(/,
  /\b(?:reflect\.DeepEqual|cmp\.Diff|cmp\.Equal)\s*\(|\b(?:got|actual|result|resp|res|out|have)\b[\w.[\]]*\s*(?:!=|==)\s*(?:want|expected|tt\.\w+|tc\.\w+|exp)\b|\b(?:want|expected|tt\.want|tc\.want)\b\s*(?:!=|==)\s*(?:got|actual|result)\b/,
  /\bassert(?:Equals|NotEquals|ArrayEquals|Same|NotSame|Throws|ThrowsExactly|That|Iterable|LinesMatch|Lines|All|Instanceof|Contains|DoesNotContain)\s*\(/,
  /\bassertThat\b.*\.\s*(?:isEqualTo|isNotEqualTo|isEqualToIgnoringCase|isEqualByComparingTo|contains|containsExactly|containsExactlyInAnyOrder|containsOnly|containsEntry|containsKey|containsValue|containsSequence|containsSubsequence|doesNotContain|hasSize|hasSizeGreaterThan|hasSizeLessThan|isGreaterThan|isGreaterThanOrEqualTo|isLessThan|isLessThanOrEqualTo|isBetween|isInstanceOf|isExactlyInstanceOf|hasMessage|hasMessageContaining|hasMessageStartingWith|hasCauseInstanceOf|startsWith|endsWith|matches|hasFieldOrPropertyWithValue|hasFieldOrProperty|isCloseTo|isSameAs|isIn|isNotIn|isZero|isPositive|isNegative|extracting|hasToString|satisfies|allMatch|anyMatch|noneMatch|usingRecursiveComparison)\s*\(/,
  /\bAssert\s*\.\s*(?:Equal|AreEqual|NotEqual|AreNotEqual|Contains|DoesNotContain|StartsWith|EndsWith|Matches|DoesNotMatch|InRange|NotInRange|IsType|IsNotType|IsAssignableFrom|Throws|ThrowsAsync|ThrowsAny|ThrowsAnyAsync|Equivalent|Single|Collection|Same|NotSame|AreSame|AreNotSame|StrictEqual|NotStrictEqual|That|Greater|GreaterOrEqual|Less|LessOrEqual|IsInstanceOfType|IsNotInstanceOfType|Subset|Superset|ProperSubset|ProperSuperset|Distinct|Raises\w*|PropertyChanged\w*)\s*\(/,
  /\.\s*Should\s*\(\s*\)\s*\.\s*(?:Be|NotBe|BeEquivalentTo|NotBeEquivalentTo|Contain|NotContain|ContainSingle|HaveCount|HaveCountGreaterThan|HaveCountLessThan|BeGreaterThan|BeGreaterThanOrEqualTo|BeLessThan|BeLessThanOrEqualTo|BeInRange|StartWith|EndWith|Match|MatchRegex|BeOfType|BeAssignableTo|Throw|ThrowAsync|ThrowExactly|ThrowExactlyAsync|BeCloseTo|HaveLength|ContainKey|ContainValue|BeSameAs|BeOneOf|Equal|BeApproximately|HaveElementAt|BeSubsetOf|IntersectWith|HaveSameCount|BeInAscendingOrder|BeInDescendingOrder|OnlyContain|Satisfy\w*|BeDecoratedWith)\s*(?:<[^>]*>)?\s*\(/,
  /\bassert_(?:equal|match|in_delta|in_epsilon|includes|instance_of|kind_of|raises|same|operator|respond_to|output|throws|send|difference|changes|response|redirected_to|select|template|no_match)\b/,
  /\bexpect\s*\(.*\)\s*\.\s*(?:to|not_to|to_not)\s+(?:eq|eql|equal|match|include|have_attributes|contain_exactly|match_array|start_with|end_with|be_within|raise_error\s*[(\w]|be_a|be_an|be_kind_of|be_instance_of|have_http_status|respond_with|have_content|have_text|have_selector|have_css|have_link|have_button|have_field|be_between|have_key|have_value|cover|output|change|satisfy|be\s*[<>=])/,
  /\bexpect\s*\(.+?,\s*(?:equals|contains|matches|isA|throwsA|throwsArgumentError|throwsStateError|throwsFormatException|throwsException|hasLength|same|closeTo|inInclusiveRange|inExclusiveRange|startsWith|endsWith|containsAll|containsAllInOrder|orderedEquals|unorderedEquals|isIn|greaterThan|greaterThanOrEqualTo|lessThan|lessThanOrEqualTo|equalsIgnoringCase|equalsIgnoringWhitespace|isNot|anyOf|allOf|predicate|isList|isMap|everyElement|anyElement|containsPair|findsOneWidget|findsNWidgets|findsWidgets|findsNothing)\s*[<(]/,
  /\bXCTAssert(?:Equal|NotEqual|EqualWithAccuracy|NotEqualWithAccuracy|GreaterThan|GreaterThanOrEqual|LessThan|LessThanOrEqual|ThrowsError|Identical|NotIdentical)\s*\(/,
  /\bassert_(?:raise|receive|received)\b/,
  /\bt\s*\.\s*(?:equal|same|deepEqual|strictSame|match|like|has|hasStrict|is|not|notSame|notMatch|type|hasProp|hasProps|hasOwnProp|matchOnly|matchStrict|includes|notEqual|snapshot|regex|throws|rejects)\s*\(/
];

// Truthiness/existence families whose operand decides: a comparison inside is a
// value assertion, a bare operand is existence-only.
const TRUTH_FAMILY_RE = /(?<![\w$])(?:assert(?:True|False|IsNone|IsNotNone|NotNull|Null|IsNotNull|IsNull|Not|Nil|NotNil|Empty|NotEmpty|Blank|Present|Predicate)?|Assert\s*\.\s*(?:True|False|IsTrue|IsFalse|NotNull|Null|IsNotNull|IsNull|IsEmpty|IsNotEmpty|Empty|NotEmpty)|assert\s*\.\s*(?:ok|isOk|isNotOk|isTrue|isFalse|isNotTrue|isNotFalse|isDefined|isUndefined|isNotNull|isNull|exists|notExists|isNaN|isNotNaN|isFunction|isObject|isArray|isString|isNumber|isBoolean|isNotEmpty|isEmpty)|XCTAssert(?:True|False|Nil|NotNil|NoThrow)?|assert!|debug_assert!|ok|t\s*\.\s*(?:ok|notOk|true|false|truthy|falsy)|refute|refute_nil|assert_nil|assert_not_nil)\s*\(/g;
const PY_BARE_ASSERT_RE = /^\s*assert\s+(?!True\b|False\b)([^\n]+?)\s*$/gm;
const VALUE_OPERATOR_RE = /===|!==|==|!=|>=|<=|(?<![-=<>!])>(?![=>])|(?<![-=<>!])<(?![=<])|=~|\binstanceof\b|\bisinstance\s*\(|\.(?:includes|contains|startsWith|endsWith|starts_with|ends_with|equals|equalsIgnoreCase|match|matches|test|has|hasOwnProperty|every|some|hasPrefix|hasSuffix|count|index|indexOf|find|any|all|get|getAttribute|attr|value|text|textContent|innerText|innerHTML|status|statusCode|length|len|size)\b|\blen\s*\(|\bin\b|\bnot\s+in\b|\bis\s+not\b|\bcontains\(|\bempty\?/;

const EXISTENCE_ONLY_RE = [
  /\.\s*(?:toBeDefined|toBeUndefined|toBeTruthy|toBeFalsy|toBeNull|toBeNil|toBeNaN|toHaveBeenCalled|toBeCalled|toExist|toBeOk|toBeFunction|toBeObject|toBeArray|toBeString|toBeNumber|toBeBoolean|toBeTrue|toBeFalse|toHaveResolved|toHaveRejected|toBeVisible|toBeHidden|toBeAttached|toBeInTheDocument|toBeEnabled|toBeDisabled|toBeEmpty|toBeEmptyDOMElement)\s*\(\s*\)/,
  /\.\s*(?:not\s*\.\s*)?(?:toThrow|toThrowError|toReject|toResolve)\s*\(\s*\)/,
  /\.\s*(?:to|and)\s*(?:\.\s*(?:be|have|not|been|a|an))*\s*\.\s*(?:ok|true|false|null|undefined|exist|empty|NaN|defined|nullish|finite)\b(?!\s*\()/,
  /\bassert\s*\.\s*(?:throws|rejects|doesNotThrow|doesNotReject)\s*\(\s*[^,)]+\s*\)/,
  /\b(?:assert|require)\s*\.\s*(?:NotNil|Nil|True|False|NoError|Error|Empty|NotEmpty|Nilf|NotNilf|NoErrorf|Errorf|Truef|Falsef|Panics|NotPanics|FileExists|DirExists)\s*\(/,
  /\.\s*Should\s*\(\s*\)\s*\.\s*(?:NotBeNull|BeNull|BeTrue|BeFalse|NotBeEmpty|BeEmpty|NotThrow|NotThrowAsync|BeNullOrEmpty|NotBeNullOrEmpty|NotBeNullOrWhiteSpace|BeNullOrWhiteSpace|HaveValue|NotHaveValue)\s*\(\s*\)/,
  /\bexpect\s*\(.*\)\s*\.\s*(?:to|not_to|to_not)\s+(?:be_truthy|be_falsey|be_falsy|be_nil|be_present|be_blank|be_empty|exist|be_valid|be_invalid|be_persisted|be_success|be_successful|be_ok)\b/,
  /\bexpect\s*\(.+?,\s*(?:isNotNull|isNull|isTrue|isFalse|isNotEmpty|isEmpty|returnsNormally|isNonNegative|isPositive|isNegative|isZero|isNonZero|isNaN|isNotNaN)\s*[,)]/,
  /\bassertThat\b.*\.\s*(?:isNotNull|isNull|isTrue|isFalse|isPresent|isNotPresent|isEmpty|isNotEmpty|isNotBlank|isBlank|exists|doesNotExist)\s*\(\s*\)/,
  /\bassert(?:DoesNotThrow|NotNull|Null)\s*\(/,
  /\bassert_(?:nil|not_nil|empty|not_empty|predicate)\b|\brefute(?:_nil|_empty)?\b/
];

// ── helpers ──

function lineOf(text, index) {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i += 1) if (text.charCodeAt(i) === 10) line += 1;
  return line;
}

function clip(value) {
  const flat = String(value || '').replace(/\s+/g, ' ').trim();
  return flat.length > SAMPLE_WIDTH ? `${flat.slice(0, SAMPLE_WIDTH - 1)}…` : flat;
}

/**
 * Inner text of the balanced group opening at `openIndex` (a `(`), read on the
 * RAW text so string contents survive, skipping nested groups and quoted
 * strings. Returns null when the group never closes.
 */
function readBalanced(text, openIndex) {
  const open = text[openIndex];
  const close = open === '(' ? ')' : open === '[' ? ']' : open === '{' ? '}' : null;
  if (!close) return null;
  let depth = 0;
  let quote = null;
  for (let i = openIndex; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') { i += 1; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '(' || ch === '[' || ch === '{') depth += 1;
    else if (ch === ')' || ch === ']' || ch === '}') {
      depth -= 1;
      if (depth === 0) return { inner: text.slice(openIndex + 1, i), end: i };
    }
  }
  return null;
}

/** Split at depth-0 commas outside quotes. */
function splitTopLevel(inner) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let start = 0;
  for (let i = 0; i < inner.length; i += 1) {
    const ch = inner[i];
    if (quote) {
      if (ch === '\\') { i += 1; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '(' || ch === '[' || ch === '{') depth += 1;
    else if (ch === ')' || ch === ']' || ch === '}') depth -= 1;
    else if (ch === ',' && depth === 0) {
      parts.push(inner.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(inner.slice(start));
  return parts.map((part) => part.trim()).filter((part) => part.length > 0);
}

function normalizeExpr(value) {
  return String(value || '').replace(/\s+/g, '').replace(/;$/, '');
}

function sameExpression(left, right) {
  const a = normalizeExpr(left);
  const b = normalizeExpr(right);
  return a.length > 0 && a === b;
}

function isBareLiteral(value) {
  return BARE_LITERAL_RE.test(normalizeExpr(value).replace(/\s+/g, ' '));
}

/** Comments plus test titles/names — the places an admission is written. */
function extractCommentary(text) {
  const out = [];
  const lines = String(text || '').split(/\r?\n/);
  let inBlock = false;
  lines.forEach((rawLine, i) => {
    let line = rawLine;
    const number = i + 1;
    if (inBlock) {
      const end = line.indexOf('*/');
      if (end === -1) { out.push({ line: number, text: line }); return; }
      out.push({ line: number, text: line.slice(0, end) });
      line = line.slice(end + 2);
      inBlock = false;
    }
    let blockStart;
    while ((blockStart = line.indexOf('/*')) !== -1) {
      const end = line.indexOf('*/', blockStart + 2);
      if (end === -1) {
        out.push({ line: number, text: line.slice(blockStart + 2) });
        inBlock = true;
        line = line.slice(0, blockStart);
        break;
      }
      out.push({ line: number, text: line.slice(blockStart + 2, end) });
      line = `${line.slice(0, blockStart)} ${line.slice(end + 2)}`;
    }
    const slashes = line.match(/(?:^|[^:'"`\w])\/\/(.*)$/);
    if (slashes) out.push({ line: number, text: slashes[1] });
    const hash = line.match(/(?:^|\s)#(?![[!{])(.*)$/);
    if (hash) out.push({ line: number, text: hash[1] });
    const title = line.match(/(?<![\w$.])(?:it|test|describe|context|specify|scenario|xit|xtest)\s*(?:\.\s*\w+\s*)?\(\s*(['"`])(.*?)\1/);
    if (title) out.push({ line: number, text: title[2], kind: 'title' });
    const named = line.match(/\b(?:def\s+test_(\w+)|function\s+test(\w+)|fn\s+(\w*test\w*)|func\s+Test(\w+)|void\s+(\w*[Tt]est\w*)\s*\()/);
    if (named) {
      const name = named.slice(1).find(Boolean);
      if (name) out.push({ line: number, text: name.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2'), kind: 'title' });
    }
  });
  return out.map((entry) => ({ kind: 'comment', ...entry }));
}

function matchesAny(patterns, line) {
  return patterns.some((pattern) => pattern.test(line));
}

/**
 * The audit's mask blanks comments and string contents to spaces, which is
 * right for AC matching but wrong for syntax: `toThrow('boom')` must still
 * read as a call WITH an argument. Every masked-out non-blank character
 * becomes `_` instead — offsets preserved, string contents still unreadable,
 * argument presence still visible.
 */
function maskForSyntax(raw) {
  const masked = maskNonCode(raw);
  const out = [...masked];
  const chars = [...raw];
  for (let i = 0; i < chars.length; i += 1) {
    if (out[i] === ' ' && chars[i] !== ' ' && !/\s/.test(chars[i])) out[i] = '_';
  }
  return out.join('');
}

// ── per-file scan ──

function emptyScan(file) {
  return {
    file,
    assertions: { value: 0, existence_only: 0 },
    tautological: [],
    self_comparison_calls: [],
    disabled_tests: [],
    expected_failure_markers: [],
    snapshot_assertions: [],
    bug_shaped_expectations: [],
    server_error_expectations: [],
    observed_oracle_admissions: []
  };
}

function sample(file, line, text) {
  return { file, line, text: clip(text) };
}

/** Same text on both sides: a tautology for a variable or property, a determinism check for a call. */
function classifySelfComparison(result, file, line, call, expression) {
  if (CALL_EXPRESSION_RE.test(expression)) {
    result.self_comparison_calls.push(sample(file, line, `${call} — compares a call with the same call: proves the call is stable, not that its value is right`));
  } else {
    result.tautological.push(sample(file, line, `${call} — asserts an expression against itself`));
  }
}

/** `expect(actual).toBe(expected)` chains — located on the masked view, compared on the raw view. */
function expectChainTautologies(raw, code, result) {
  const { file } = result;
  let match;
  EXPECT_CHAIN_RE.lastIndex = 0;
  while ((match = EXPECT_CHAIN_RE.exec(code)) !== null) {
    const actual = readBalanced(raw, match.index + match[0].length - 1);
    if (!actual) continue;
    const matcher = code.slice(actual.end + 1, actual.end + 80).match(EQUALITY_MATCHER_RE);
    if (!matcher) continue;
    const expected = readBalanced(raw, actual.end + 1 + matcher[0].length - 1);
    if (!expected) continue;
    const call = raw.slice(match.index, expected.end + 1);
    if (isBareLiteral(actual.inner.trim())) {
      result.tautological.push(sample(file, lineOf(raw, match.index), `${call} — asserts a literal, the system under test is not in the assertion`));
    } else if (/^to(?:Be|Equal|StrictEqual)$|^to\./.test(matcher[1]) && sameExpression(actual.inner, expected.inner)) {
      classifySelfComparison(result, file, lineOf(raw, match.index), call, actual.inner);
    }
  }
}

/** `assert.equal(a, a)`, `assertEquals(a, a)`, `assert_eq!(a, a)`, `assert.Equal(t, a, a)`… */
function equalityCallTautologies(raw, code, result) {
  let match;
  EQUALITY_CALL_RE.lastIndex = 0;
  while ((match = EQUALITY_CALL_RE.exec(code)) !== null) {
    const group = readBalanced(raw, match.index + match[0].length - 1);
    if (!group) continue;
    let args = splitTopLevel(group.inner);
    if (args.length >= 3 && (TEST_HARNESS_FIRST_ARG_RE.test(args[0]) || /^(['"`]).*\1$/.test(args[0]))) args = args.slice(1);
    if (args.length >= 2 && sameExpression(args[0], args[1])) {
      classifySelfComparison(result, result.file, lineOf(raw, match.index), raw.slice(match.index, group.end + 1), args[0]);
    }
  }
}

/** Parenthesis-free forms: Ruby `assert_equal a, a`, Python `assert a == a`, constant truths. */
function bareTautologies(raw, code, rawLines, file) {
  const out = [];
  const rawLineAt = (index) => rawLines[lineOf(code, index) - 1] || '';
  const scan = (pattern, judge) => {
    let match;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(code)) !== null) {
      const rawLine = rawLineAt(match.index);
      const verdict = judge(rawLine);
      if (verdict) out.push(sample(file, lineOf(code, match.index), `${rawLine} — ${verdict}`));
    }
  };
  scan(RUBY_ASSERT_EQUAL_RE, (rawLine) => {
    const parts = splitTopLevel(rawLine.replace(/^\s*assert_equal\s+/, ''));
    return parts.length >= 2 && sameExpression(parts[0], parts[1]) ? 'asserts an expression against itself' : null;
  });
  scan(PY_BARE_EQUALITY_RE, (rawLine) => {
    const sides = (splitTopLevel(rawLine.replace(/^\s*assert\s+/, ''))[0] || '').split(/\s*==\s*/);
    return sides.length === 2 && sameExpression(sides[0], sides[1]) ? 'asserts an expression against itself' : null;
  });
  scan(CONSTANT_TRUTH_RE, () => 'asserts a constant');
  scan(PY_CONSTANT_TRUTH_RE, () => 'asserts a constant');
  return out;
}

/** Does this masked line pin a value, only an existence, or neither? */
function classifyAssertionLine(codeLine) {
  let value = matchesAny(VALUE_ASSERTION_RE, codeLine);
  let existence = false;
  TRUTH_FAMILY_RE.lastIndex = 0;
  let truth;
  while ((truth = TRUTH_FAMILY_RE.exec(codeLine)) !== null) {
    const group = readBalanced(codeLine, truth.index + truth[0].length - 1);
    const operand = group ? splitTopLevel(group.inner)[0] || '' : '';
    if (VALUE_OPERATOR_RE.test(operand)) value = true;
    else existence = true;
  }
  if (!value && matchesAny(EXISTENCE_ONLY_RE, codeLine)) existence = true;
  if (!value) {
    PY_BARE_ASSERT_RE.lastIndex = 0;
    const bare = PY_BARE_ASSERT_RE.exec(codeLine);
    if (bare) {
      if (VALUE_OPERATOR_RE.test(bare[1])) value = true;
      else existence = true;
    }
  }
  return { value, existence: existence && !value };
}

/** Line-shaped signals: disabled/xfail/snapshot markers, bug-shaped expectations, assertion counts. */
function scanLines(rawLines, codeLines, result) {
  codeLines.forEach((codeLine, i) => {
    const rawLine = rawLines[i] || '';
    const number = i + 1;
    const push = (list) => list.push(sample(result.file, number, rawLine));
    if (matchesAny(DISABLED_TEST_RE, codeLine) || (/\.rb$/i.test(result.file) && RUBY_DISABLED_RE.test(codeLine))) push(result.disabled_tests);
    if (matchesAny(EXPECTED_FAILURE_RE, codeLine)) push(result.expected_failure_markers);
    if (matchesAny(SNAPSHOT_RE, codeLine)) push(result.snapshot_assertions);

    const isAssertion = ASSERTION_SIGNAL_RE.test(codeLine);
    if (isAssertion && !BUG_SHAPED_EXCLUDE_RE.test(rawLine)
      && (BUG_SHAPED_STRING_RE.test(rawLine) || BUG_SHAPED_CODE_RE.test(rawLine))) push(result.bug_shaped_expectations);
    if (isAssertion && SERVER_ERROR_RE.test(codeLine) && SERVER_ERROR_CONTEXT_RE.test(codeLine) && !/\.\s*not\s*\./.test(codeLine)) {
      push(result.server_error_expectations);
    }

    const kind = classifyAssertionLine(codeLine);
    if (kind.value) result.assertions.value += 1;
    else if (kind.existence) result.assertions.existence_only += 1;
  });
}

/**
 * @param {string} content raw test source
 * @param {{ file?: string }} [options]
 */
function scanTestFileOracle(content, options = {}) {
  const raw = String(content || '');
  const file = options.file || '<memory>';
  const code = maskForSyntax(raw);
  const rawLines = raw.split(/\r?\n/);
  const result = emptyScan(file);

  expectChainTautologies(raw, code, result);
  equalityCallTautologies(raw, code, result);
  result.tautological.push(...bareTautologies(raw, code, rawLines, file));
  scanLines(rawLines, code.split(/\r?\n/), result);
  for (const entry of extractCommentary(raw)) {
    const admits = matchesAny(OBSERVED_ORACLE_PHRASES, entry.text)
      || (entry.kind === 'comment' && matchesAny(COMMENT_ONLY_PHRASES, entry.text));
    if (admits) result.observed_oracle_admissions.push(sample(file, entry.line, entry.text));
  }
  return result;
}

// ── aggregate ──

const SIGNAL_KEYS = ['tautological', 'self_comparison_calls', 'disabled_tests', 'expected_failure_markers', 'snapshot_assertions', 'bug_shaped_expectations', 'server_error_expectations', 'observed_oracle_admissions'];

/**
 * @param {object} inputs
 * @param {Array<{file: string, content: string}>} inputs.files
 * @param {'tester'|'audit'} [inputs.mode] tester: expected-to-fail markers are
 *   issues (the tester's own output may never grade a bug green); audit: they
 *   are warnings for QA to adjudicate across the whole suite.
 * @returns {{ issues: string[], warnings: string[], metrics: object, files: object[] }}
 */
function analyzeTestOracle({ files = [], mode = 'audit' } = {}) {
  const issues = [];
  const warnings = [];
  const scanned = files
    .filter((item) => item && typeof item.content === 'string')
    .map((item) => scanTestFileOracle(item.content, { file: item.file }));

  const totals = Object.fromEntries(SIGNAL_KEYS.map((key) => [key, 0]));
  const samples = Object.fromEntries(SIGNAL_KEYS.map((key) => [key, []]));
  let value = 0;
  let existence = 0;
  const filesWithoutValue = [];

  for (const result of scanned) {
    value += result.assertions.value;
    existence += result.assertions.existence_only;
    for (const key of SIGNAL_KEYS) {
      totals[key] += result[key].length;
      for (const entry of result[key]) {
        if (samples[key].length < SAMPLE_LIMIT) samples[key].push(`${entry.file}:${entry.line} ${entry.text}`);
      }
    }
    if (result.assertions.value === 0 && result.assertions.existence_only > 0) filesWithoutValue.push(result.file);
    for (const entry of result.tautological) {
      issues.push(`tautological assertion ${entry.file}:${entry.line} — ${entry.text}; it is green whatever the code does`);
    }
    if (mode === 'tester') {
      for (const entry of result.expected_failure_markers) {
        issues.push(`${entry.file}:${entry.line} marks a test as expected to fail (${entry.text}) — a test written for the bug stays green while the bug stands; keep it RED and route the defect`);
      }
    }
  }

  const describe = (key, label, advice) => {
    if (totals[key] === 0) return;
    warnings.push(`${totals[key]} ${label} — ${advice}: ${samples[key].join(' | ')}`);
  };
  if (mode !== 'tester') describe('expected_failure_markers', 'test(s) marked as expected to fail', 'a test written for the bug is graded green while the bug stands; QA treats each as an open defect');
  describe('self_comparison_calls', 'assertion(s) comparing a call with the same call', 'a determinism check proves the call is stable, not that its value is right; add the value the AC implies');
  describe('disabled_tests', 'disabled test(s) (skip/todo/fixme/@Disabled/#[ignore]/markTestSkipped)', 'a skipped test proves nothing; a platform guard must say so in the sample, anything else is a defect routed, never a test silenced');
  describe('snapshot_assertions', 'snapshot assertion(s)', 'a snapshot records the current output as its oracle and proves stability, not the approved behavior; pair each with a value assertion derived from the AC');
  describe('bug_shaped_expectations', 'bug-shaped expectation(s) (undefined/NaN/[object Object]/Invalid Date asserted as the correct result)', 'no approved behavior produces these values; the test is enshrining a defect');
  // A whole suite legitimately holds 5xx failure-path tests; only the tester's
  // own new files are worth a line — the audit keeps the count as a metric.
  if (mode === 'tester') describe('server_error_expectations', 'assertion(s) expecting an HTTP 5xx', 'legitimate only for a simulated dependency failure; a 5xx on an approved user path is the bug, not the oracle');
  describe('observed_oracle_admissions', 'comment(s)/title(s) admitting the oracle is the implementation', 'rewrite the expected value from the AC/EC/invariant or route the defect');
  if (filesWithoutValue.length > 0) {
    warnings.push(`${filesWithoutValue.length} file(s) never pin a value — their assertions only check that something exists or did not throw, so they prove the code runs, not that it is right: ${filesWithoutValue.slice(0, SAMPLE_LIMIT).join(' | ')}`);
  }
  const totalAssertions = value + existence;
  const ratio = totalAssertions === 0 ? 0 : Math.round((existence / totalAssertions) * 100) / 100;
  if (totalAssertions >= 5 && ratio >= 0.6) {
    warnings.push(`${Math.round(ratio * 100)}% of ${totalAssertions} assertions are existence-only — the expected values of the approved behavior are mostly unpinned`);
  }

  return {
    issues,
    warnings,
    files: scanned,
    metrics: {
      files_scanned: scanned.length,
      assertions_value: value,
      assertions_existence_only: existence,
      weak_assertion_ratio: ratio,
      files_without_value_assertion: filesWithoutValue.length,
      ...totals,
      samples: { ...samples, files_without_value_assertion: filesWithoutValue.slice(0, SAMPLE_LIMIT) }
    }
  };
}

/**
 * Path-like tokens of test files in a Markdown body (the tester's
 * `## Tests added or changed` section). Requires a known source extension and
 * either a directory separator or a test-file naming convention; URLs,
 * absolute paths are dropped. Parent-relative candidates are opt-in: a
 * caller accepting them must enforce the repository path policy before reading.
 */
function extractTestFilePaths(body, { allowParentPaths = false } = {}) {
  const text = String(body || '').replace(/\\/g, '/');
  const found = new Set();
  const withDir = /(?<![\w./-])(?!https?:)(?:[\w@.-]+\/)+[\w@.-]+\.(?:js|cjs|mjs|ts|tsx|jsx|mts|cts|py|php|rb|go|rs|java|kt|kts|cs|swift|dart|ex|exs|scala|clj|lua|sql|vue|svelte)(?![\w.])/g;
  const byConvention = /(?<![\w./-])[\w.-]+(?:\.(?:test|spec)\.\w+|_test\.(?:go|rb|py|exs)|Test\.php|Tests?\.cs|Test\.java|Test\.kt)(?![\w.])/g;
  for (const pattern of [withDir, byConvention]) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const token = match[0].replace(/^\.\//, '');
      if (token.startsWith('/') || (!allowParentPaths && token.includes('../')) || /^[A-Za-z]:\//.test(token)) continue;
      found.add(token);
    }
  }
  return [...found];
}

/**
 * Read the test files a report names and analyze their oracles. A path is read
 * only when it resolves inside the project (or an opted-in repository root) on
 * disk — a path the report invents, a link that leaves the tree, or a directory
 * is listed under `files_unreadable`, never read.
 */
async function analyzeNamedTestFiles(targetDir, relPaths, options = {}) {
  const { loadRepositoryPathPolicy } = require('./repository-paths');
  const files = [];
  const unreadable = [];
  const named = Array.isArray(relPaths) ? relPaths : [];
  let policy = null;
  if (named.length > 0) {
    try {
      policy = await loadRepositoryPathPolicy(targetDir);
    } catch {
      unreadable.push(...named);
    }
  }
  for (const rel of policy ? named : []) {
    try {
      const state = await policy.inspect(rel);
      if (!state.safe || !state.exists) {
        unreadable.push(rel);
        continue;
      }
      files.push({ file: rel, content: fs.readFileSync(path.resolve(targetDir, rel), 'utf8') });
    } catch {
      unreadable.push(rel);
    }
  }
  const result = analyzeTestOracle({ files, mode: options.mode || 'tester' });
  result.metrics.files_unreadable = unreadable;
  if (named.length > 0 && files.length === 0) {
    result.warnings.push(`the report names ${named.length} test file(s) but none is readable inside the project — oracle quality unmeasured (${unreadable.join(', ')})`);
  }
  return result;
}

module.exports = {
  analyzeTestOracle,
  analyzeNamedTestFiles,
  scanTestFileOracle,
  extractTestFilePaths,
  extractCommentary,
  readBalanced,
  splitTopLevel
};
