# Executable verification — AIOSON (EN)

> **What this is:** the reference for AIOSON's "executable verification" theme (versions 1.24.0–1.28.0).
> **Reading time:** 8 min.
> **What you will learn:**
> - How AIOSON turns binary success criteria into deterministic, runnable checks
> - The five phases: `verification` + `harness:check`, the fresh-context validator, `spec:analyze`, Wave markers, and Lane B (`forge:compile` + `@forge-run`)

---

## The idea in one paragraph

AIOSON's canonical authorities are one PRD, one implementation plan, and one QA verdict. The executable-verification commands are optional evidence that can make selected criteria deterministic or compile an explicitly configured harness workflow. They do not create mandatory specification artifacts or workflow gates. The default route remains Product → optional Sheldon → Planner → DEV → QA at every classification. Scope Check and Validator are opt-in specialists.

The theme ships in five phases.

---

## Phase 1 (v1.24.0) — `harness:check` + the `verification` field

A `harness-contract.json` criterion can carry an authored **`verification`** field: a shell command that proves the criterion mechanically. When a feature explicitly opts into a harness contract, verification should prefer the project's own test runner, remain deterministic and cross-platform, and use **exit 0 = pass**. Contracts without `verification` stay valid; `validateContract` only emits an advisory warning for binary criteria that lack it.

The new command runs those commands deterministically:

```bash
# Run every verifiable criterion of the active contract (auto-discovered)
aioson harness:check . --slug=checkout

# Run only a subset of criteria
aioson harness:check . --slug=checkout --criteria=C1,C3

# Custom timeout and JSON output (exit 0 = pass)
aioson harness:check . --slug=checkout --timeout=120000 --json
```

`harness:check` runs **outside** the self:loop and is **read-only** over `progress.json` — it never mutates circuit-breaker state. It reuses the loop's `runCriteria`/`executeInSandbox` machinery, so it inherits timeouts, process-tree kill, credential redaction, and failure signatures. It persists `last-check-output.json` and emits `criteria_check_failed` telemetry on failure. With `--slug` omitted, it auto-discovers the active contract; `--criteria` runs a subset.

**Validator impact:** `@validator` now runs `harness:check` **first** and copies the exit-code verdicts **verbatim** into `results[].passed`. It only LLM-judges the criteria that have no `verification`. The output schema is unchanged.

See [`harness:check`](./cli-reference.md#harnesscheck) in the CLI reference.

---

## Phase 2 (v1.25.0) — Fresh-context validator (review payload)

`harness:validate` now appends a self-contained **review payload** to the generated `validator-prompt.txt`, so the validator can judge without access to the implementing session:

- (a) the `harness:check` results,
- (b) the changed-file list (untracked files included; `.aioson/**` framework state filtered out),
- (c) a unified diff against a resolved base.

```bash
# Generate the validator prompt with review payload
aioson harness:validate . --slug=checkout

# Resolve the diff against an explicit base
aioson harness:validate . --slug=checkout --base=main

# Skip the diff (results + changed files still included)
aioson harness:validate . --slug=checkout --no-diff

# Cap the embedded diff size
aioson harness:validate . --slug=checkout --max-diff-bytes=200000
```

The base is resolved in this order: `--base` > `baseline.json` head > merge-base with `main`/`master` > `HEAD`. `--max-diff-bytes` defaults to `200000` and truncates on a line boundary; `--no-diff` is a pure boolean flag that skips the diff. The payload degrades gracefully outside a git repo. The work lives in a new module, `src/harness/review-payload.js`.

**Protocol:** `@validator` runs in a **fresh, isolated context** — a subagent (Task tool) or a separate session — **never inline** in the implementing session, because implementation history biases the verdict. The flow is:

```text
harness:check  →  harness:validate  →  isolated subagent run  →  harness:validate (consume verdict)
```

The final `harness:validate` re-run consumes the verdict back through the circuit breaker.

See [`harness:validate`](./cli-reference.md#harnessvalidate) in the CLI reference.

---

## Phase 3 (v1.26.0) — `spec:analyze` cross-artifact consistency

`spec:analyze` is the **content** sibling of `artifact:validate`. Where `artifact:validate` checks chain **presence** (unchanged), `spec:analyze` checks **consistency of content** across the feature's artifacts before the execution gate:

```bash
# Analyze cross-artifact consistency
aioson spec:analyze . --feature=checkout

# JSON output for gate scripting (errors → exit 1)
aioson spec:analyze . --feature=checkout --json
```

It runs five deterministic checks:

1. **REQ/AC ID traceability** — declared-but-unreferenced = coverage-gap warning; referenced-but-undeclared = orphan/drift warning (noise-guarded for prose plans).
2. **Staleness** — an upstream artifact modified after a downstream one = warning (60s tolerance; the project-global `architecture.md` is excluded).
3. **Readiness** — `blocked` = error; `ready_with_warnings` = info.
4. **Harness-contract sanity** — schema errors = error; executable-coverage = info.
5. **AC→contract linkage** = info.

An `error` flips `ok: false` (exit 1 in `--json`). Results persist to `spec-analyze-{slug}.json`. The command remains available as deterministic drift evidence when the approved plan or an explicitly requested Scope Check calls for it; it does not add a workflow stage.

See [`spec:analyze`](./cli-reference.md#specanalyze) in the CLI reference.

---

## Phase 4 (v1.27.0) — Wave parallelism markers

An optional compiled-harness plan may carry a **`Wave`** column. Same-wave phases must be file-disjoint and dependency-free. Wave metadata is specialist evidence; Planner still owns the single canonical implementation plan.

`spec:analyze` gains the **`wave_file_overlap`** check: same-wave phases that share Primary files raise a warning. Plans without a `Wave` column skip the check entirely.

The Wave column is what Phase 5 compiles into `parallel()` blocks.

---

## Phase 5 (v1.28.0) — Lane B: `forge:compile` + `@forge-run`

Lane B is an **opt-in, additive** compiled-harness path. Classification does not activate it. It applies only when the user deliberately maintains the optional contract and Wave metadata; the canonical Product → Planner → DEV → QA route remains authoritative.

```bash
# Compile the feature into a forge-run.workflow.js
aioson forge:compile . --feature=checkout

# JSON output (hard preflights may refuse)
aioson forge:compile . --feature=checkout --json
```

`forge:compile` produces `.aioson/plans/{slug}/forge-run.workflow.js` — a Claude Code dynamic-workflow script committed alongside the spec. Its structure mirrors the whole theme:

- one **`parallel()` per Wave** (file-disjoint dev agents; blocked-wave early stop),
- a deterministic **`harness:check` convergence loop** bounded by the governor's `error_streak_limit` (sequential fixes — only waves prove disjointness) plus a token-budget guard,
- a **3-lens adversarial review** (correctness / completeness / regression-risk; majority survives; refute-by-default) for binary criteria **without** `verification`,
- a **fresh-context validator** stage closing through `harness:validate` → `last-validator-output.json` → `apply-validation`.

**Hard preflights** refuse compilation and name the owning agent: invalid/missing contract, zero executable criteria, plan without a `Wave` column, `spec:analyze` errors, and `wave_file_overlap` (a warning in `spec:analyze`, an **error** here). The generated code is deterministic by construction: pure-literal metadata, plain JS, no `Date.now`/`Math.random`/`new Date`, artifact text via `JSON.stringify` (injection-safe). It **never** runs `feature:close`. New module: `src/harness/plan-waves.js`.

The opt-in entry point is the **`@forge-run`** agent: compile → review with the user (cost warning) → execute via the workflow runtime (never hand-emulated) → report. One feature per run. **PASS** recommends the human run `feature:close`; **FAIL** routes to `@dev` via the normal lane. It never auto-runs `feature:close`/publish.

See [`forge:compile`](./cli-reference.md#forgecompile) in the CLI reference and the [@forge-run agent card](../4-agents/forge-run.md).

---

## How the phases fit together

```text
Product ► optional Sheldon ► Planner ► DEV ► QA
                              │
                              ├► harness:check when the approved plan enables it
                              ├► spec:analyze when explicitly planned/requested
                              └► QA consumes the bounded evidence

Optional specialists:
  @validator ► fresh-context contract review (explicitly enabled)
  @forge-run ► forge:compile ► compiled harness workflow
```

The optional compiled path may consume the same plan and verification evidence, but it never replaces the canonical PRD, implementation plan, DEV integration responsibility, or QA verdict.

---

## See also

- [CLI reference](./cli-reference.md) — `harness:check`, `harness:validate`, `spec:analyze`, `forge:compile`
- [@forge-run agent card](../4-agents/forge-run.md) — the opt-in Lane B entry point
- [Agents index](../4-agents/README.md) — `@sheldon`, `@pm`, `@scope-check`, `@validator`
