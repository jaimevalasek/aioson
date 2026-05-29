---
description: "Code-health / improvement analysis playbook — coverage gaps, test sufficiency, regression need, execution-chain tracing, performance hotspots, componentization/maintainability. Shared on-demand lens for @tester/@qa/@pentester/@architect/@sheldon/@deyvin. Load only when the trigger fires; do not inline."
agents: [tester, qa, pentester, architect, sheldon, deyvin]
---

# Code-Health Analysis

> Shared, **on-demand** lens. Load when assessing where a codebase needs better tests,
> regression guards, performance, or refactoring — never inline by default.
> Scale depth to classification: **MICRO** → coverage + regression only; **SMALL** → add
> execution-chain + perf; **MEDIUM** → all six facets. Respect the loading discipline in
> `.aioson/design-docs/agent-loading-contract.md` — read only the files a facet points to.

## The loop

Run as a cycle, not a one-shot. Each pass narrows scope and produces concrete, verifiable changes.

### 1. Plan
State the goal and bound the scope: which modules/files, which classification, which facets apply.
Prefer the smallest target that answers the question. Write down what "better" means here
(e.g. "critical-path branch coverage ≥ 80%", "no N+1 in the list endpoint").

### 2. Investigate — the six facets
- **Coverage gaps** — find files/paths with weak coverage and **read them**. Critical paths
  (auth, money, ownership, data integrity) first. Signal: no test file, line coverage high but
  branches untested, error paths uncovered.
- **Test sufficiency** — does it test more than happy path? Look for missing edge cases (zero/empty,
  boundary, concurrent), failure paths (invalid input, conflict, unauthorized, not found), and
  business-rule violations. High line coverage + weak assertions = false confidence.
- **Regression need** — has this area broken before (devlogs / git / `current-state-archive.md`)?
  Is it a recurring hotspot? If yes, a regression test pinning the exact prior failure is worth more
  than broad coverage. Pin the bug, not the function.
- **Execution chain** — trace the runtime flow: entry → call chain → side effects → exit. Map
  dependencies and where state mutates. For >5 files, dispatch a read-only scout instead of
  inline-reading (see `@deyvin` sub-task scout) — preserve context.
- **Performance hotspots** — N+1 queries in lists, sync external calls in the request cycle,
  unbounded/unpaginated queries, repeated work in loops, missing indexes on WHERE/ORDER/JOIN,
  O(n²) over growing collections. Flag with the trigger condition, not a micro-benchmark guess.
- **Componentization / maintainability** — duplicated blocks (extract), oversized files/functions
  (split — see `.aioson/design-docs/file-size.md`), tight coupling / mixed concerns (separate),
  god-objects, primitive obsession. Only propose extraction when it lowers real maintenance cost,
  not for symmetry.

### 3. Refine (lapida)
Dedupe findings; prioritize by **risk × effort**. Separate **must-fix** (correctness, security,
critical-path coverage) from **nice-to-have** (cosmetic refactors). Drop speculative findings.

### 4. Operate (opera)
Produce the concrete change, not a description: **write the test**, propose the extraction with the
target shape, or the specific perf fix. Stay within the active agent's scope — analysis agents
recommend + write tests; structural changes route to `@dev`/`@architect`.

### 5. Test
Add/run the test or verification command. Confirm the change does what it claims. For a regression
finding, prove the test fails before the fix and passes after.

### 6. Adjust
Re-measure against the goal from step 1. If not improved, iterate or revert. Record the decision
(spec / dossier Agent Trail) so the next session does not re-derive it.

## Per-agent emphasis

| Agent | Leans on | Output |
|---|---|---|
| @tester | coverage, test sufficiency, regression | writes the missing tests (line/branch/property) |
| @qa | risk-first triage; routes coverage→@tester, perf/structure→@architect | findings in the QA report |
| @pentester | execution-chain, attack surface (perf/componentization light) | threat-surface + chain findings |
| @architect | componentization, maintainability, performance (structural) | structural recommendations / design-doc |
| @sheldon | all six facets (deep technical analysis) | enrichment / analysis report |
| @deyvin | quick lens on a slice during a pair session | inline suggestions; escalate if broad |

## Trigger (when to load this doc)
Load when the task is: "is this well-tested / does it need more tests?", "should we add a regression
test?", "trace how this runs / where it's slow", or "is this worth refactoring/extracting?".
Do **not** load for routine happy-path implementation or a bounded bug fix with a known reproducer.

## Output discipline
Report each finding as: **facet · location (file:line) · what · risk×effort · proposed action**.
Never invent findings to look thorough; never omit a critical one. Scale verbosity to classification.
