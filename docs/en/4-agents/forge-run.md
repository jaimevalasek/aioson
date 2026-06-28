# @forge-run - Compile and run the Lane B verification workflow

> **For whom:** people with a MEDIUM feature that has a binary contract and a wave-based plan, who want to run the entire executable-verification cycle as a single compiled workflow.
> **Reading time:** 4 min.
> **What you will learn:**
> - What Lane B is and why it is **opt-in** and **additive**
> - The protocol: `forge:compile` → review with you → execute → report
> - Why `@forge-run` never weakens a verification nor closes the feature

---

## What it is for

The default executable-verification lane (`@scope-check` → `@dev` → `@qa` → `@validator`) is **unchanged** and remains the recommended path. `@forge-run` is a **second lane (Lane B), optional and additive**: it compiles a MEDIUM feature's artifacts into a single **versionable workflow** and runs the whole deterministic-verification cycle end to end.

Instead of advancing stage by stage manually, `@forge-run` generates `.aioson/plans/{slug}/forge-run.workflow.js` — a Claude Code dynamic-workflow script — and executes it through the workflow runtime (never hand-emulated). The compiled structure mirrors the executable-verification roadmap:

- **`parallel()` per Wave** — same-wave phases are file-disjoint and run in parallel (see the `Wave` column produced by `@pm`).
- **Deterministic loop over `harness:check`** — bounded by the governor's `error_streak_limit`; fixes are sequential (only waves prove disjointness).
- **3-lens adversarial review** — for binary criteria that lack `verification` and therefore cannot be checked mechanically.
- **Fresh-context validator** — closes through the `harness:validate` → `apply-validation` cycle (see `@validator`).

**Hard rule:** one feature per run. `@forge-run` never runs `feature:close` and never publishes.

---

## When to invoke

- A **MEDIUM** feature whose `harness-contract.json` carries `verification` per criterion (authored by `@sheldon`).
- An implementation plan with the `Wave` column filled in (produced by `@pm`).
- A clean `aioson spec:analyze` (no `errors`) — the execution-gate precondition.
- When you want to run the whole executable-verification cycle as a single reproducible, versionable workflow.

---

## When not to invoke

- MICRO or SMALL features → use the default lane (`@dev` → `@qa` → `@validator`).
- A contract without executable criteria, or a plan without a `Wave` column → the hard preflights refuse to compile.
- `spec:analyze` reporting `errors` or `wave_file_overlap` → resolve those first; Lane B does not compile over drift.
- You only want to validate, not execute → use `@validator` directly.

---

## Required inputs

Lane B only compiles when every prerequisite is present — otherwise the hard preflights refuse:

- `.aioson/plans/{slug}/harness-contract.json` — a **valid** contract with at least one executable criterion (`verification` present).
- `implementation-plan-{slug}.md` — a plan with the `Wave` column filled in.
- `spec-analyze-{slug}.json` with no `errors` and no `wave_file_overlap`.

---

## Where it fits in the workflow

Lane B is an opt-in branch off the standard MEDIUM flow, taken after the spec and plan are ready:

```text
@product -> @orchestrator (fans out @analyst/@architect/@pm; @pm fills Wave column;
             @orchestrator or @sheldon authors harness-contract verification fields) ->
spec:analyze clean (scope-drift gate) -> @forge-run (Lane B)
```

It never replaces the default lane — it compiles the same artifacts into a single executable workflow. (`@pm`, `@sheldon`, and `@validator` cards are tracked in the [agents index](./README.md); PT is canonical until each is translated.)

---

## Typical dialogue

```text
You > @forge-run

@forge-run > Feature: checkout-stripe (MEDIUM)

             Lane B preflight:
             - harness-contract.json valid ✓
             - 5 criteria, 4 with verification (executable) ✓
             - implementation-plan with Wave column ✓
             - spec:analyze → ok, no errors, no wave_file_overlap ✓

             $ aioson forge:compile . --feature=checkout-stripe
             Compiled: .aioson/plans/checkout-stripe/forge-run.workflow.js

             Workflow structure:
             - Wave 1 (parallel): backend + migrations
             - Wave 2: frontend
             - harness:check loop (error_streak limit: 3, sequential fixes)
             - 3-lens adversarial review for C5 (no verification)
             - Fresh-context validator → apply-validation

             ⚠ Cost: this workflow runs multiple LLM executions.
             Review the script before executing. Approve execution? (y/n)

You > y

@forge-run > Executing via the workflow runtime...
             Wave 1 ✓  Wave 2 ✓
             harness:check → 4/4 executable criteria PASS
             Adversarial review C5 → PASS
             Fresh-context validator → overall_score: 1

             RESULT: PASS
             Recommendation: run `aioson feature:close` manually.
```

---

## Disk outputs

| File | Content |
|---|---|
| `.aioson/plans/{slug}/forge-run.workflow.js` | Compiled, versionable workflow (Claude Code dynamic workflow) |
| `.aioson/plans/{slug}/last-check-output.json` | Last `harness:check` result consumed by the loop |
| `.aioson/plans/{slug}/last-validator-output.json` | Fresh-context validator verdict |
| `.aioson/plans/{slug}/progress.json` | Post-execution state (`circuit_state`, `ready_for_done_gate`) |

The generated code is deterministic by construction: pure-literal metadata, no `Date.now`/`Math.random`/`new Date`, artifact text always via `JSON.stringify`, and it **never** invokes `feature:close`.

---

## How it reads your project

- `.aioson/plans/{slug}/harness-contract.json` — the contract and criteria with `verification`
- `.aioson/context/implementation-plan-{slug}.md` — the plan with the `Wave` column
- `.aioson/plans/{slug}/spec-analyze-{slug}.json` — cross-artifact consistency (execution gate)
- `.aioson/plans/{slug}/progress.json` — state and the governor's `error_streak_limit`

---

## Related CLI commands

```bash
# Compile the feature's artifacts into the Lane B workflow
aioson forge:compile . --feature={slug}

# Parseable output
aioson forge:compile . --feature={slug} --json
```

See [forge:compile in the CLI reference](../5-reference/cli-reference.md) and [Executable verification](../5-reference/executable-verification.md) for the full theme.

---

## Hard rules

- **Never** bypass a failed preflight (invalid contract, zero executable criteria, plan without a `Wave` column, `spec:analyze` `errors` or `wave_file_overlap`).
- **Never** weaken or remove a `verification` check to make a criterion pass.
- **Never** run `feature:close` or publish — that is always a human decision.
- One feature per run.

---

## Typical handoff

- **Comes from:** opt-in entry by the user (Lane B); assumes `@sheldon`, `@pm`, and `@scope-check`/`spec:analyze` are already complete.
- **PASS:** recommends the **human** run `aioson feature:close` manually.
- **FAIL:** routes back to `@dev` via the **normal lane** to fix and re-verify.

---

## Next step

- `@pm` — produces the `Wave` column that becomes `parallel()` in the workflow (card in the [agents index](./README.md))
- `@validator` — the fresh-context validator that closes the cycle (card in the [agents index](./README.md))
- [Executable verification](../5-reference/executable-verification.md) — the full theme (Phases 1–5)
