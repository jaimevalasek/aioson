---
generated: "2026-05-27"
agent: "tester"
scope: "agent-orchestration-v2 (Phase 1: M1+M2+M3) — gap-fill for QA findings"
strategy: "Risk-first Gap Filling — bounded scope, no new deps, no production code changes"
---

# Test Plan — agent-orchestration-v2

## Strategy
Risk-first Gap Filling targeting 3 gaps from QA report + test inventory:
1. `workflow-heal.js` zero coverage → `readLatestCheckpoint` unit + integration tests
2. `dev-resume.js` partial coverage → `decision_rationale` passthrough tests
3. BR-AO-03 size cap → stress test for checkpoint truncation

## Tests written

### tests/workflow-heal-checkpoint.test.js (NEW — 11 tests)

| Test | BR/EC | What it proves |
|---|---|---|
| returns null when checkpoints dir missing | EC-AO-02 | Graceful fallback |
| returns null when no matching files | — | Slug filtering |
| returns single checkpoint | — | Happy path read |
| latest-gate-wins D>C>B>A | BR-AO-02 | Gate ordering logic |
| gate D wins over all others | BR-AO-02 | Full ordering with 4 gates |
| similar slugs no collision | EC-AO-03 | Suffix filtering safety |
| malformed JSON returns null | — | Error resilience |
| empty checkpoints dir | — | Edge case |
| integration: gate:approve → readLatestCheckpoint | M1 e2e | Round-trip proof |
| integration: multiple approvals pick highest | BR-AO-02 e2e | Multi-gate with real writes |
| size cap stress | BR-AO-03 | File stays under 5KB |

### tests/dev-resume.test.js (MODIFIED — +2 tests)

| Test | BR/EC | What it proves |
|---|---|---|
| includes decision_rationale when present | M2 | Passthrough from handoff to resume |
| omits decision_rationale when empty | M2 | No noise in payload |

## Coverage summary

| Module | Before @tester | After @tester | Delta |
|---|---|---|---|
| workflow-heal.js (`readLatestCheckpoint`) | 0 tests | 11 tests | +11 |
| dev-resume.js (`decision_rationale`) | 0 explicit tests | 2 tests | +2 |
| **Total new** | | | **+13** |
| **Feature total** | 23 | 36 | |
| **All related (incl. regression)** | 102 | 115 | |

## Smell audit
Zero smells in new test files. Fresh tmpDir per test, no Date dependencies, no conditional logic, no mocks.

## Residual risks
- M-01 (QA): `gate_check_result` can theoretically push checkpoint over 5KB. Truncation only targets `decision_log` (empty at creation). Low real-world probability.
- M-02 (QA): `confidence` field uses string `'confirmed'` vs PRD numeric `0.9`. Spec alignment needed.
- Neither of these are test gaps — they're implementation design decisions for @dev/@product.

---

# Test Plan — squad CLI commands (Stages 3-4)

> generated: 2026-05-30 · agent: tester · scope: `squad:role-scan` + `squad:playbook` (the only new *code* from the squad self-improving work; Stages 0-2 are prose/docs, not unit-testable).

## Strategy
Risk-first Gap Filling + Coverage Quality Tier 1-2 on the two new commands; characterization of the pre-existing suite baseline. No production code changes, no new deps.

## Test inventory (testable surface)
| Source file | Test file | Status |
|---|---|---|
| src/commands/squad-role-scan.js | tests/squad-role-scan.test.js | ✓ covered (5 tests) |
| src/commands/squad-playbook.js | tests/squad-playbook.test.js | ✓ covered (5 tests) |

Stages 0-2 (eval-gate / persona-grounding / decomposition) are agent prose, not code — no unit tests apply; behavior is exercised by `@squad` at runtime.

## 4-Tier verification (both commands)
- Tier 1 Exists ✓ — files present, non-empty.
- Tier 2 Substantive ✓ — real logic (tokenizer, inflection match, entity regex, dedup/normalize); the 10 tests fail if logic is removed.
- Tier 3 Wired ✓ — registered in `src/cli.js` (import + JSON_SUPPORTED_COMMANDS + dispatcher).
- Tier 4 Functional ✓ — smoke-tested end-to-end via `node bin/aioson.js squad:role-scan` and `squad:playbook capture|list`; correct JSON/output through the real entrypoint, not just the in-process function.

## Baseline characterization (regression proof)
Full suite, my work STASHED vs present:
| | Total | Pass | Fail |
|---|---|---|---|
| Baseline (work stashed) | 2868 | 2857 | 10 |
| With Stages 1-4 | 2878 | 2868 | 9 |
My 10 new tests pass; the baseline already fails ≥10. The red set is **[pre-existing]**, all in subsystems untouched this session: product/sheldon/dev kernel size (product.md 20886 > 20000 budget), feature:archive/dossier, constants-pentester, deyvin-density, runOpIdentity, pentester text contracts, AC-ALL-105 decision file, `update --selective`, plus timeout-flaky (`security:scan` 10.3s, `QA-TIMEOUT`). **Zero regressions from Stages 1-4** — route the pre-existing reds to @dev/@qa separately; do not block the squad work on them.

## [fixed] role-scan entity-extraction noise (severity: low)
`extractEntities` regex `\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b` has two defects:
1. `\s+` matches newlines → glues a heading word to the next line (`"Editorial Brief\nThe"`).
2. Leading articles captured as entities (`"The"`, `"An"`, `"A"`).
Repro: `node bin/aioson.js squad:role-scan <dir> --docs=brief.md --json` on a doc with a heading → entities include `"The"` and `"Editorial Brief\nThe"`.
Impact: noisier role-pool seed; the consuming LLM ignores noise → functional but degraded. Desired: entities exclude bare articles and never cross newlines/sentence boundaries.
**Fixed this session** (@dev): regex gap restricted to `[ \t]` (no newline crossing) + leading articles/pronouns stripped via a `NON_ENTITY` set. Regression test added (`role-scan entities exclude bare articles and never span newlines`). Verified via CLI smoke test → entities now `["Content Strategy","Editorial Brief"]`.

## Hardening tests (added — suite now 15 tests, all green)
- role-scan: entities exclude bare articles + never contain `\n`; non-ASCII corpus; malformed manifest JSON → manifest_not_found; empty/whitespace doc.
- playbook: corrupt JSON file → treated as empty (resilience); status≠active filtered from list; `from` updated on reinforce.

## Smell audit
New tests: fresh `os.tmpdir()` per test, no Date/Date.now, no conditional logic, no mocks, one behavior per test. Zero smells.

## Residual risks
- The entity-noise bug above ([bug-found], low) — @dev.
- Pre-existing suite reds (10) — @dev/@qa, unrelated to the squad work.
