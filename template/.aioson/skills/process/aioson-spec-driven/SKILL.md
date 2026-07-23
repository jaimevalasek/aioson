# Skill: aioson-spec-driven

> Streamlined feature delivery methodology. Load this file first, then exactly one role reference.

## When to use

Use for substantive feature definition, planning, implementation, or QA. Do not use for a bounded Simple Plan or bare Deyvin recovery.

## Canonical route

```text
optional briefing/refinement → product → planner → dev → qa
```

The route has three canonical artifacts:

1. `prd-{slug}.md` — product intent, prototype contract, capabilities, current-system fit, acceptance criteria.
2. `implementation-plan-{slug}.md` — repository-backed implementation delta, executable vertical phases, exact paths, verification.
3. `qa-report-{slug}.md` — independent delivery verdict and production-path evidence.

Project mode uses the same bare names without `{slug}` where applicable. Code and tests are delivery outputs, not specification artifacts.

## Classification depth

- **Simple Plan (outside feature workflow):** already-specified bounded technical work may go directly to Dev with proportionate verification.
- **MICRO:** one bounded product capability; the same Product → Planner → Dev → QA route with a terse PRD and plan.
- **SMALL:** multiple related capabilities or one new boundary; the same route with broader file/AC coverage.
- **MEDIUM:** broader or riskier impact; the same route with more constraints, checkpoints, and risk-focused evidence.

Sheldon, Analyst, Architect, PM, UX/UI, Discovery Design Doc, Scope Check, Orchestrator, Tester, Pentester, and Validator are opt-in specialists available at every classification. Invoke one only for a named unresolved decision, explicit request, or triggered verification need. Merge its conclusion into the PRD, plan, implementation, or QA report; do not create a second canonical chain. The feature dossier is a lightweight non-blocking context cache.

## Non-negotiable trace

`CAP → current-system fit → AC → implementation delta → vertical phase → exact files → executable check → production-path evidence`

This trace replaces the former `CAP → lens → REQ → AC → design → plan → harness` document chain.

## Runtime truth

- Verify the application's normal entry point.
- For UI capabilities, prove action → real boundary → state change → visible result.
- A detached fixture, alternate binary, test-only flag, mock-only screen, artifact count, or test count is not production evidence.
- Harnesses are optional when the plan deliberately needs them; never generate one by classification alone.

## References

Load exactly one role reference:

- `references/product.md`
- `references/sheldon.md` — only when the optional Sheldon detour is active
- `references/planner.md`
- `references/dev.md`
- `references/qa.md`

Compatibility references for legacy specialist detours remain available. Use `artifact-map.md`, `approval-gates.md`, or `classification-map.md` only when a CLI/gate question specifically requires them.
