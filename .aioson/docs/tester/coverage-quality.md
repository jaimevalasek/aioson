---
description: "Tester deep guide — mutation testing, property-based patterns, test smells catalog, contract testing, adjacent quality layers. Load when entering Phase 4 on critical modules or when a coverage gap requires graduated assertion quality."
---

# Tester — Coverage Quality Beyond Line %

Line coverage tells you which lines ran. It tells you nothing about whether the test caught the bug. This module is the playbook for graduating from "lines covered" to "bugs prevented".

Load this when:
- Critical modules (auth, money, ownership, irreversible actions) reach line coverage ≥ 80% and need stronger evidence.
- Existing tests pass but the user reports bugs in production (signal: weak assertions, missing failure-mode tests).
- A failing mutation, property, or pact test surfaces in CI and you need to interpret it.

## 1. The four-tier coverage quality ladder

| Tier | Metric | Target overall | Target critical paths |
|---|---|---|---|
| 1 — Line | line coverage | ≥ 80% | ≥ 90% |
| 2 — Branch | branch / decision coverage | ≥ 60% | ≥ 80% |
| 3 — Mutation | mutation score | not required overall | ≥ 80% on critical modules |
| 4 — Property | invariants on serializers, calculators, state machines | n/a | one property test per critical invariant |

**Critical paths** (always treated as critical):
- Authentication, authorization, ownership boundaries
- Money / value transfer, balance accounting
- Irreversible actions (delete, send, publish)
- Public APIs that other systems consume
- State machines with consistency invariants (queues, ledgers, inventory)

## 2. Mutation testing — the actual quality signal

### 2.1 Tooling by stack

| Stack | Tool | Install |
|---|---|---|
| JavaScript / TypeScript | `@stryker-mutator/core` | `npm i -D @stryker-mutator/core` |
| .NET | Stryker.NET | `dotnet tool install -g dotnet-stryker` |
| PHP (Laravel/Symfony) | Infection | `composer require --dev infection/infection` |
| Python | mutmut | `pip install mutmut` |
| Java | PIT | Maven/Gradle plugin |
| Ruby | mutant | `gem install mutant` |
| Solidity | (no true mutation tool — `forge fuzz` is closest analog) | — |

### 2.2 Threshold configuration

Working defaults (project-wide):
```yaml
# Stryker (JS/TS) — stryker.conf.json
{
  "thresholds": { "high": 80, "low": 70, "break": 70 },
  "mutate": ["src/**/*.ts", "!src/**/*.test.ts", "!src/**/*.spec.ts"]
}
```

For legacy code being driven up: `high: 80, low: 60, break: 50`. The `break` value fails the build.

### 2.3 What to do with the score

- **80–100%**: ship. Track over time as quality leading indicator.
- **60–80%**: identify survived mutants by category — boundary conditions and conditional logic produce the most valuable feedback.
- **< 60%**: tests are coincidentally passing; rewrite assertions or add property-based tests.

### 2.4 When to run

- **Full codebase**: nightly CI job. 10×–100× normal test runtime; never run on every push.
- **Incremental** (changed files only): every PR via `--since` flag (Stryker) or equivalent. Adds ~30 s–2 min depending on diff size.
- **First-time adoption**: pick one critical module, run mutation, fix survived mutants, ratchet. Don't try to mutate the whole repo on day one.

### 2.5 Survived mutant — example workflow

```
SURVIVED  src/auth/jwt.ts:42:10  Boolean replacement (true → false)
```

The mutator changed `if (token.expired === true)` to `if (token.expired === false)` and your tests still passed → the test never exercises the `expired` branch. Action: add a test that boots an expired token and asserts rejection.

## 3. Property-based testing — the five canonical patterns

Property-based tests describe a property that must hold for *all* inputs, then the framework generates inputs that try to break it. One good property test replaces dozens of brittle example tests.

### 3.1 Round-trip (most common, easiest first win)

`decode(encode(x)) == x`. Any serialization, encoding, compression, encryption.

```ts
// fast-check
import fc from 'fast-check';
import { encode, decode } from './codec';

test('codec round-trip', () => {
  fc.assert(fc.property(fc.anything(), (x) => {
    expect(decode(encode(x))).toEqual(x);
  }));
});
```

```python
# Hypothesis
from hypothesis import given, strategies as st
from codec import encode, decode

@given(st.dictionaries(st.text(), st.integers()))
def test_codec_round_trip(payload):
    assert decode(encode(payload)) == payload
```

### 3.2 Invariants (always-true properties)

```ts
test('sort preserves multiset and orders ascending', () => {
  fc.assert(fc.property(fc.array(fc.integer()), (xs) => {
    const sorted = sort(xs);
    expect(sorted.length).toBe(xs.length);
    expect([...sorted].sort((a,b)=>a-b)).toEqual(sorted);
  }));
});
```

```python
@given(st.lists(st.integers()))
def test_balance_never_negative(transactions):
    account = Account(starting_balance=100)
    for t in transactions:
        account.apply(t)
    assert account.balance >= 0  # invariant
```

### 3.3 Stateful (sequence-based)

Generate sequences of operations; replay must reach a consistent state regardless of order. Critical for ledgers, inventory, queues.

```python
# Hypothesis stateful
from hypothesis.stateful import RuleBasedStateMachine, rule, invariant

class LedgerMachine(RuleBasedStateMachine):
    def __init__(self):
        super().__init__()
        self.ledger = Ledger()

    @rule(amount=st.integers(min_value=1, max_value=1000))
    def deposit(self, amount):
        self.ledger.deposit(amount)

    @rule(amount=st.integers(min_value=1, max_value=1000))
    def withdraw(self, amount):
        try: self.ledger.withdraw(amount)
        except InsufficientFunds: pass

    @invariant()
    def balance_matches_history(self):
        assert self.ledger.balance == sum(self.ledger.history)
```

### 3.4 Differential (compare two implementations)

When migrating from a legacy implementation to a new one, or comparing optimized vs reference. Same input → same output.

```ts
test('new sort matches legacy sort on all inputs', () => {
  fc.assert(fc.property(fc.array(fc.integer()), (xs) => {
    expect(newSort(xs)).toEqual(legacySort(xs));
  }));
});
```

### 3.5 Metamorphic (relations between inputs/outputs)

When there's no single correct answer, only relative correctness.

```ts
test('reverse(reverse(x)) == x', () => {
  fc.assert(fc.property(fc.string(), (s) => {
    expect(reverse(reverse(s))).toBe(s);
  }));
});

test('sum(reverse(xs)) == sum(xs)', () => {
  fc.assert(fc.property(fc.array(fc.integer()), (xs) => {
    expect(sum(reverse(xs))).toBe(sum(xs));
  }));
});
```

### 3.6 Solidity / Foundry fuzz

```solidity
function testFuzz_transferNeverExceedsBalance(uint256 amount) public {
    amount = bound(amount, 0, token.balanceOf(alice));
    uint256 before = token.balanceOf(bob);
    vm.prank(alice);
    token.transfer(bob, amount);
    assertEq(token.balanceOf(bob), before + amount);
}

function invariant_TotalSupplyEqualsSumOfBalances() public {
    assertEq(token.totalSupply(), token.balanceOf(alice) + token.balanceOf(bob));
}
```

### 3.7 When to use property-based vs example tests

- **Property-based**: for invariants, codecs, calculators, state machines, parsers. The gain is finding edge cases you didn't think of.
- **Example tests**: for known-bug regressions, specific business rules with named inputs, UI flows. The gain is readable documentation.
- Use both. They are complements, not substitutes.

## 4. Test smell self-audit — Phase 4.5 checklist

Run this checklist after writing tests, before declaring Phase 4 done. Each smell links to a specific refactor.

### 4.1 Eager Test
**Symptom**: one test contains 10+ assertions on unrelated behaviors.
**Detection**: count `expect`/`assert` statements per test; > 5 unrelated → eager.
**Fix**: split into one test per behavior. Name each by what it asserts.

### 4.2 Mystery Guest
**Symptom**: test reads from a file, env var, current time, or external service without explicit setup.
**Detection**: grep for `fs.readFile`, `process.env`, `new Date()`, `Date.now()`, `fetch(` inside test bodies.
**Fix**: inject the dependency. Use `vi.useFakeTimers()` / `freezegun` for time.

### 4.3 Test Run War
**Symptom**: tests pass alone, fail when run together. Or: parallel runs are flaky.
**Detection**: run with `--shuffle` (Pest) / `vitest --no-isolate` / `pytest -p no:randomly`. Or simply re-run 10×.
**Fix**: per-test fresh database, in-memory state, or transactional rollback.

### 4.4 Conditional Test Logic
**Symptom**: `if`/`else` or loops inside the test body.
**Detection**: AST scan or eyeball.
**Fix**: parameterize (`it.each` / `pytest.mark.parametrize`) or split.

### 4.5 Redundant Assertion
**Symptom**: `assert.equal(x, x)`, `expect(true).toBe(true)`, multiple assertions verifying the same property.
**Detection**: identical LHS/RHS, or repeated equivalent assertions on the same value.
**Fix**: delete.

### 4.6 Mock Overdose
**Symptom**: more than ~50% of test setup is mocks; the test verifies the mock, not the system.
**Detection**: count mock invocations vs system invocations in setup.
**Fix**: write an integration test instead. If integration is too slow/complex, the abstraction is wrong — escalate to `@architect`.

### 4.7 Tools

- **JS/TS**: `eslint-plugin-vitest`, `eslint-plugin-jest` rules cover most static smells.
- **Java**: TASTE, JNose Test, tsdetect.
- **Python**: `pylint` custom rules for `pytest` smells.
- **Generic fallback**: write the checklist above as a code review template.

### 4.8 Auto-generated tests are higher-smell

Tests generated by EvoSuite, Pynguin, or LLMs are 2–3× denser in smells than human-written tests. Treat anything generated as a *draft*: check every test for Mystery Guest and Mock Overdose before keeping.

## 5. Consumer-Driven Contract Testing (Pact)

### 5.1 When it applies

Two or more services with explicit boundaries: microservices, mobile↔backend, frontend↔BFF, public APIs. Skip if the codebase is a single deployable.

### 5.2 The discipline

1. **Consumer writes** the contract from real client code (not mocks of the contract).
2. **Pact library generates** the pact file from the consumer test run.
3. **Provider verifies** against the latest pact file fetched from the broker (Pactflow, self-hosted).
4. **CI pipeline**: provider verification blocks deploy on red; consumer publishes pact on every commit.

### 5.3 Best practices

- **Loose contracts**: match only fields the consumer reads. Tightening leaks implementation details and creates false breakage.
- **Real consumer code**: contract tests must exercise the actual HTTP client / SDK, not a mock of it.
- **Separate from E2E**: pact answers "do the contracts match?", E2E answers "does the user flow work?". Different failure modes; don't mix them.
- **Anti-pattern**: writing pact tests against mock providers — validates the mock, not the integration.

### 5.4 Minimal example (Node + pact-js)

```ts
const { PactV3, MatchersV3 } = require('@pact-foundation/pact');

const provider = new PactV3({ consumer: 'frontend', provider: 'orders-api' });

test('GET /orders/:id returns order', async () => {
  provider
    .given('order 42 exists')
    .uponReceiving('a request for order 42')
    .withRequest({ method: 'GET', path: '/orders/42' })
    .willRespondWith({
      status: 200,
      body: MatchersV3.like({ id: 42, total: 100, status: 'paid' })
    });

  await provider.executeTest(async (mockServer) => {
    const order = await fetchOrder(mockServer.url, 42);  // real consumer code
    expect(order.id).toBe(42);
  });
});
```

## 6. Adjacent quality layers — opt-in by trigger

Don't auto-load. Add only when the trigger fires.

| Layer | Trigger | Tooling |
|---|---|---|
| Snapshot | Stable UI/DOM/JSON output | `vitest --update`, `jest --ci`, `__snapshots__/` |
| Visual regression | Design-system-stable UI | Percy, Chromatic, Playwright `toHaveScreenshot()` |
| Accessibility | User-facing UI | `axe-core`, `jest-axe`, `playwright/axe` |
| Load / performance | Public API or perf-sensitive flow | `k6`, `locust`, `artillery` |
| Dependency vuln scan | Every project | `npm audit`, `pip-audit`, `OSV-Scanner`, `Snyk`, `Trivy` |

**Rules:**
- Snapshot — sanitize timestamps and IDs before snapshotting; never snapshot dynamic data.
- Visual — high cost (storage, antialiasing flake); only when design system is stable.
- A11y — one automated pass catches ~30% of WCAG issues; doesn't replace human/assistive-tech testing.
- Load — separate suite, never blocks unit/integration; report against agreed SLOs.
- Depscan — treat as test signal in CI, fail PRs on `high`/`critical` CVEs unless explicitly accepted.

## 7. Reporting template

When invoked on a feature, produce this structure in `test-plan.md`:

```markdown
## Coverage Quality Report — {feature/module} — {date}

### Tier 1 — Line coverage
- Module: src/auth/  →  87% (target ≥ 90% critical) ⚠
- Module: src/orders/ →  82% (target ≥ 80% overall) ✓

### Tier 2 — Branch coverage
- src/auth/jwt.ts: 64% — gap: error-path branches uncovered
- src/orders/cart.ts: 71% ✓

### Tier 3 — Mutation score (critical modules only)
- src/auth/jwt.ts: 73% (target ≥ 80%) ⚠ — survivors:
  - jwt.ts:42:10 boolean replacement (expired check)
  - jwt.ts:58:14 conditional boundary (>= → >)

### Tier 4 — Property-based
- ✓ codec round-trip (auth/token.ts)
- ✗ ledger-balance-invariant — not implemented yet

### Test smells found
- Mystery Guest in tests/auth.test.ts:88 (reads JWT_SECRET from env)
- Mock Overdose in tests/orders.test.ts (8 mocks for 1 system call)

### Recommendations
- Cover the two survived mutants in jwt.ts before merge.
- Add ledger-balance invariant property test.
- Refactor 2 smells before next sprint.
```

## 8. References

This document distills `researchs/tester-coverage-quality-2026/summary.md`. See that file for the full source list and verdict.
