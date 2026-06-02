---
description: "Squad eval-gate — derive a citation-grounded quality rubric from the squad's own sources and grade each executor with a multi-model jury. The enforced, source-grounded counterpart of quality-lens.md."
---

# Squad Eval-Gate

The quality bar is **derived from the same sources that generated the squad**, then enforced. `quality-lens.md` is the squad's self-review (advisory); the eval-gate is the *enforced* verdict — run it before delivery or in CI via `@squad eval <slug>`.

Why source-grounded: a rubric invented by the grader drifts to a generic "is it helpful?". A rubric *extracted from the brief / design-doc / sourceDocs* tests what THIS squad was actually asked to be — and every criterion traces back to a span the user can audit. (Grounded in 2026 eval research; see `.aioson/design-docs/squad-self-improving-roadmap.md`.)

## Step 1 — Synthesize the rubric (from the sources, not from priors)

Inputs: `sourceDocs`, `analysis` (entities/workflows/stakeholders), the design intent (problem/goal/scope), and `package-contract.md` § Executor depth block.

For each executor, extract **atomic requirement claims** — one testable statement each, binary (met / not-met), every claim citing its origin:

```yaml
executor: <slug>
claims:
  - id: c1
    claim: "Owns the <workflow> workflow end to end"
    source: "analysis.workflows[<workflow>] / design goal"
    kind: responsibility
  - id: c2
    claim: "Carries a persona anchored in real seniority, not a bare label"
    source: "package-contract § depth block (Variant A)"
    kind: depth
  - id: c3
    claim: "expertise.vocabulary uses terms of art from <sourceDoc>"
    source: "<sourceDoc path / span>"
    kind: grounding
  - id: c4
    claim: "Hands off <X> to <executor> when <condition>"
    source: "design scope / workflow"
    kind: handoff
```

Claim kinds to always cover: `responsibility` (traces to a workflow/goal), `depth` (has the depth block), `grounding` (vocabulary/frameworks come from sources), `handoff` (delegation is explicit), `anti_pattern` (role failure modes are Hard constraints), `scope` (no responsibility the sources don't imply).

Keep claims few and load-bearing (≈4–8 per executor). **A claim with no source citation is invented — drop it.**

## Step 2 — Grade with a jury (multi-model when available)

Grade each executor's `.md` against its claims. Prefer a **multi-model jury** — AIOSON already ships the primitive: a `reviewer` executor with `cross_ai: true` (`detect_clis: [claude, codex]`) sends the executor + rubric to multiple model families and synthesizes verdicts. Use it when the CLIs are available.

If only one model is available, simulate a 3-lens jury with **distinct, adversarial perspectives** (do not grade the same way thrice):
- *correctness* lens — is the claim literally satisfied by the prompt text?
- *grounding* lens — is it backed by the cited source, or invented?
- *skeptic* lens — try to REFUTE the claim; default to not-met when ambiguous.

Each judge returns per-claim met/not-met + a one-line reason.

### Reliability weighting (do not average blindly)
2026 eval research is clear that naive equal-weight juries underperform and that judges are fragile to formatting/verbosity. So:
- A claim is **met** only if a majority of judges agree AND the vote is not split (e.g. ≥ 2/3).
- Mark **split** claims as `uncertain` — these need a human glance, not an auto-pass.
- Down-weight a judge that disagrees with consensus across many claims (likely miscalibrated for this domain).

## Step 3 — Gate

Per executor compute `coverage` = met / total, and `agreement` = fraction of non-split claims. Verdict (thresholds tunable):
- **PASS** — coverage ≥ 0.85 AND no `depth`/`grounding` claim unmet AND agreement ≥ 0.8.
- **WARN** — coverage 0.70–0.85, or some `uncertain` claims.
- **FAIL** — coverage < 0.70, OR any `depth`/`grounding` claim unmet (a basic or ungrounded executor fails outright).

A FAIL is not advisory. Route every unmet claim to `@squad refresh <slug>` as an actionable diff: "claim `<id>` unmet for `<executor>` → `<what to add>`". Then capture the *generalized* lesson to the generation playbook so the generator stops repeating it: `aioson squad:playbook capture --rule="<which generation rule produced this>" --lesson="<what to do instead>" --from=<slug>/<claim>` (see `creation-flow.md` § Generation playbook). Capture the rule, not the squad-specific fix.

## Honest limits (do not oversell the gate)
- This verifies **fidelity to the spec/sources**, NOT real-world task performance. Pair it with a few held-out task-execution checks before trusting a squad in production.
- A single quality number hides regressions — keep coverage, agreement, and the per-kind breakdown separate.
- Auto-extracted rubrics still carry noise (~15% on first run) — treat `uncertain` as "look", not "fail", and skim once.
- Refresh the rubric when the sources change — a stale bar passes a drifted squad.

## Relationship to the other gates
- `squad-validate` (cheap, always-on): structure + depth-block presence. The floor.
- `quality-lens` (advisory self-review): is the package non-generic?
- **eval-gate (this; opt-in / CI): the enforced, source-grounded verdict.** The ceiling.

Run validate always; run the eval-gate before delivery or in CI.
