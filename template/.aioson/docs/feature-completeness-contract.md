---
description: "Streamlined closure from PRD capabilities to production-path evidence without parallel specification documents."
agents: [briefing, briefing-refiner, product, sheldon, planner, dev, qa, tester, pentester, validator]
modes: [planning, executing]
task_types: [feature-framing, prd-writing, implementation-plan, implementation, verification]
load_tier: trigger
triggers: [feature completeness, capability map, current system fit, implementation delta, implementation plan, acceptance criteria, production evidence]
---

# Feature Completeness Contract

Completeness means every approved promise is implemented and proven. It does not mean producing more documents.

Canonical trace:

```text
CAP → current-system fit → AC → implementation delta → vertical phase → exact files → executable check → production-path evidence
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

## PRD current-system fit

```markdown
## Current System Fit
| CAP | Existing behavior / evidence | Fit decision | Required product delta |
|---|---|---|---|
| CAP-checkout-submit | `src/checkout/current.ts` validates and persists draft carts | extend | Preserve draft behavior and add final order submission |
```

Every required CAP has one repository-backed row. `reuse`, `extend`, `replace`, and `new` describe product fit, not architecture. For `new`, cite the inspected boundary and why it does not already provide the behavior.

## PRD acceptance criteria

```markdown
## Acceptance Criteria
| AC | CAP | Observable behavior | Evidence |
|---|---|---|---|
| AC-checkout-01 | CAP-checkout-submit | From the normal checkout UI, confirmation persists one order and shows its identifier | focused test + production-path smoke |
```

Every required CAP has at least one stable AC. Evidence describes how QA can prove behavior, not merely which test file may exist.

## Implementation delta

```markdown
## Implementation Delta
| CAP | Action | Existing evidence | Exact paths | Required change |
|---|---|---|---|---|
| CAP-checkout-submit | modify | Existing checkout service persists drafts | src/checkout/service.ts | Extend the service through the established transaction boundary |
| CAP-checkout-submit | create | No final-order test exists beside `tests/checkout-draft.test.ts` | tests/checkout-submit.test.ts | Add AC-linked coverage |
```

Every delivery path is classified as `reuse`, `modify`, `create`, or `retire`. At Gate C, reuse/modify/retire paths already exist and create paths do not. `retire` means the exact file is intentionally removed. Evidence-backed recommended technical choices proceed without a routine human confirmation.

## Capability delivery plan

```markdown
## Capability Delivery Plan
| CAP | Phase | Files | Verification |
|---|---|---|---|
| CAP-checkout-submit | 1 | src/checkout/service.ts, tests/checkout.test.ts | npm test -- checkout + normal checkout smoke |
```

Every required CAP appears exactly once. Its files exactly match the same CAP's Implementation Delta paths. Paths are complete repository-relative files—no basenames, directories, globs, ellipses, or guessed paths.

Each phase must leave an observable slice working through the normal production entry point. UI and its real backend/state boundary belong in the same earliest useful slice.

The plan also contains `## Engineering Controls`. Planner uses model knowledge to consider quality concerns, but records only those triggered by the PRD, inspected repository, dependency/runtime contract, or production risk. Each material control belongs to a vertical phase and names verification plus recovery when persistent or externally visible state can change. This section seeds Dev/QA coverage and optional specialists; it never activates them by itself.

## Delivery evidence

QA verifies from promises outward:

- focused stack-native tests cite AC IDs;
- planned implementation files exist;
- the normal application launches;
- the real trigger crosses the real boundary;
- state changes and the promised result is visible;
- failure behavior and verified current-prototype fidelity match the PRD, or the PRD explicitly declares `prototype_status: none` and excludes historical references.

Detached fixtures, alternate binaries, test-only flags, mock-only screens, status strings, artifact count, and test count are never sufficient production evidence.

Prototype evidence is feature-scoped: `prd-{slug}.md`, `.aioson/briefings/{slug}/prototype.html`, its manifest `feature: {slug}`, and `prototype_feature: {slug}` must agree. A path owned by another or closed feature is a Product-stage completeness error even when the file exists. With no owned prototype, repository-backed current behavior replaces prototype fidelity as the baseline; historical paths remain non-binding.

The lightweight dossier is contextual memory, not a canonical deliverable or gate. Specialist evidence (Pentester, Tester, Validator, harness) is available in every classification but risk-triggered, plan-triggered, or explicitly requested—never classification-triggered.

When enabled and triggered, Tester/Pentester may implement a bounded, contract-preserving correction with persisted evidence, exact allowed paths, a finite review cycle, and targeted regression proof. QA independently revalidates the change and remains the only Gate D owner. Broader or ambiguous corrections return once to Dev/Product rather than creating an unbounded specialist loop.
