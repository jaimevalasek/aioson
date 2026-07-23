---
description: "Streamlined closure from PRD capabilities to production-path evidence without parallel specification documents."
agents: [briefing, briefing-refiner, product, sheldon, planner, dev, qa, tester, pentester, validator]
modes: [planning, executing]
task_types: [feature-framing, prd-writing, implementation-plan, implementation, verification]
load_tier: trigger
triggers: [feature completeness, capability map, implementation plan, acceptance criteria, production evidence]
---

# Feature Completeness Contract

Completeness means every approved promise is implemented and proven. It does not mean producing more documents.

Canonical trace:

```text
CAP → AC → vertical phase → exact files → executable check → production-path evidence
```

Canonical artifacts:

1. `prd-{slug}.md` — Product writes scope, capabilities, acceptance criteria, and implementation readiness; Sheldon may enrich it in place.
2. `implementation-plan-{slug}.md` — Planner maps capabilities to executable vertical phases.
3. `qa-report-{slug}.md` — QA records the independent verdict.

Requirements, spec, architecture, design-doc, readiness, conformance, decision-checkpoint, implementation-ledger, and harness artifacts are not required by this contract.

## Contextual necessity filter

Add a behavior or constraint only when the causal chain is explicit:

`evidence → necessary implication → observable consequence if omitted`

- Correctness implied by evidence: include it in the PRD.
- Material product choice: ask one blocking question.
- Useful but nonessential: defer it.
- Speculative: discard it.

## PRD capability map

```markdown
## Feature Capability Map
| CAP | Promised outcome | Actor / trigger | Scope decision | Rationale |
|---|---|---|---|---|
| CAP-checkout-submit | Buyer submits one valid order | Buyer confirms checkout | required | Primary outcome |
```

Use stable `CAP-*` IDs. At least one capability is required. Deferred/not-applicable rows need concrete reasons.

## PRD acceptance criteria

```markdown
## Acceptance Criteria
| AC | CAP | Observable behavior | Evidence |
|---|---|---|---|
| AC-checkout-01 | CAP-checkout-submit | From the normal checkout UI, confirmation persists one order and shows its identifier | focused test + production-path smoke |
```

Every required CAP has at least one stable AC. Evidence describes how QA can prove behavior, not merely which test file may exist.

## Capability delivery plan

```markdown
## Capability Delivery Plan
| CAP | Phase | Files | Verification |
|---|---|---|---|
| CAP-checkout-submit | 1 | src/checkout/service.ts, tests/checkout.test.ts | npm test -- checkout + normal checkout smoke |
```

Every required CAP appears exactly once. Paths are complete repository-relative files—no basenames, directories, globs, ellipses, or guessed paths.

Each phase must leave an observable slice working through the normal production entry point. UI and its real backend/state boundary belong in the same earliest useful slice.

## Delivery evidence

QA verifies from promises outward:

- focused stack-native tests cite AC IDs;
- planned implementation files exist;
- the normal application launches;
- the real trigger crosses the real boundary;
- state changes and the promised result is visible;
- failure behavior and prototype fidelity match the PRD.

Detached fixtures, alternate binaries, test-only flags, mock-only screens, status strings, artifact count, and test count are never sufficient production evidence.

The lightweight dossier is contextual memory, not a canonical deliverable or gate. Specialist evidence (Pentester, Tester, Validator, harness) is available in every classification but risk-triggered, plan-triggered, or explicitly requested—never classification-triggered.
