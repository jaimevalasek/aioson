---
name: aioson-spec-driven
description: Streamlined spec-driven feature delivery — the canonical product → sheldon → planner → dev → qa route with one role reference per stage. Use for substantive feature definition, planning, implementation, or QA; not for a bounded Simple Plan or a bare Deyvin recovery.
agents: [product, sheldon, planner, dev, qa, deyvin]
task_types: [feature-definition, prd, implementation-plan, tracked-implementation, qa-review]
triggers: [tracked feature, spec-driven, implementation plan, prd, gate d, feature delivery]
---

# Skill: aioson-spec-driven

> Streamlined feature delivery methodology. Load this file first, then exactly one role reference.

## When to use

Use for substantive feature definition, planning, implementation, or QA. Do not use for a bounded Simple Plan or bare Deyvin recovery.

## Canonical route

```text
optional raw sources/briefing/refinement/approval → product → sheldon → planner → dev → qa
```

The route has three canonical artifacts:

1. `prd-{slug}.md` — product intent, prototype contract, capabilities, current-system fit, acceptance criteria.
2. `implementation-plan-{slug}.md` — repository-backed implementation delta, executable vertical phases, exact paths, verification.
3. `qa-report-{slug}.md` — independent delivery verdict and production-path evidence.

Project mode uses the same bare names without `{slug}` where applicable. Code and tests are delivery outputs, not specification artifacts.

## Classification depth

- **Simple Plan (outside feature workflow):** already-specified bounded technical work may go directly to Dev with proportionate verification.
- **MICRO:** one bounded product capability; the same Product → Sheldon → Planner → Dev → QA route with a terse PRD and plan.
- **SMALL:** multiple related capabilities or one new boundary; the same route with broader file/AC coverage.
- **MEDIUM:** broader or riskier impact; the same route with more constraints, checkpoints, and risk-focused evidence.

Sheldon is the mandatory independent specification review before Planner. Analyst, Architect, PM, UX/UI, Discovery Design Doc, Scope Check, Orchestrator, Tester, Pentester, and Validator are opt-in specialists available at every classification. Invoke one only for a named unresolved decision, explicit request, or triggered verification need. Merge its conclusion into the PRD, plan, implementation, or QA report; do not create a second canonical chain. The feature dossier and continuity mapping are lightweight non-blocking context caches.

## Non-negotiable trace

`source fingerprint → PROM → Product decision → CAP → current-system fit → AC → implementation delta → vertical phase → exact files → executable check → production-path evidence`

This trace replaces the former `CAP → lens → REQ → AC → design → plan → harness` document chain.

## Runtime truth

- Verify the application's normal entry point.
- For UI capabilities, prove action → real boundary → state change → visible result.
- A detached fixture, alternate binary, test-only flag, mock-only screen, artifact count, or test count is not production evidence.
- Harnesses are optional when the plan deliberately needs them; never generate one by classification alone.

## References

Load exactly one role reference:

- `references/product.md`
- `references/sheldon.md`
- `references/planner.md`
- `references/dev.md`
- `references/qa.md`

Compatibility references for legacy specialist detours remain available. Use `artifact-map.md`, `approval-gates.md`, or `classification-map.md` only when a CLI/gate question specifically requires them.

## Delivery contract versions

New plans declare `plan_contract: 2`, bind the reviewed PRD hash, cover every AC in numbered executable phases, and name observable completion conditions. Legacy artifacts keep their prior behavior. Runtime contracts may be planned at Gate C but must exist and verify at delivery.

QA may use `accepted_with_followups` only under the explicitly authorized policy in `.aioson/docs/delivery-followups.md`. A missing test, unknown risk, failed primary flow or material security/data/availability issue remains blocking.
