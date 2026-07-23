---
description: "Single-authority PRD contract for the streamlined Product → Planner workflow, with optional Sheldon enrichment."
agents: [product, sheldon]
modes: [executing]
task_types: [prd-writing, prd-finalization, output-contract]
load_tier: trigger
triggers: [writing PRD, updating PRD, PRD contract, output path, prototype]
---

# Product PRD Contract

## Output

- Project: `.aioson/context/prd.md`
- Feature: `.aioson/context/prd-{slug}.md`

This file is the single product/specification authority. Product must make it ready for planning; Sheldon may challenge and enrich it in place.

## Frontmatter

```yaml
---
feature: {slug}
classification: SMALL
feature_completeness: required
product_scope: approved
prd_ready: approved
sheldon_review: not_requested
prototype: .aioson/briefings/{slug}/prototype.html
---
```

If Sheldon is explicitly invoked, it records `sheldon_review: approved` after the independent enrichment. Planner never requires that optional marker.

## Required structure

- Vision
- Problem and users
- `## Feature Capability Map`
- MVP scope
- Out of scope
- User flows, including visible success/failure states
- Success metrics
- Prototype contract and approved deviations
- Open questions, with blocking questions explicitly marked
- Visual identity when relevant
- `## Acceptance Criteria` (owned and finalized by Product before Planner)

Capability map:

```markdown
| CAP | Promised outcome | Actor / trigger | Scope decision | Rationale |
|---|---|---|---|---|
| CAP-{slug}-main | observable outcome | actor/trigger | required | concrete reason |
```

Acceptance criteria:

```markdown
| AC | CAP | Observable behavior | Evidence |
|---|---|---|---|
| AC-{slug}-01 | CAP-{slug}-main | production-path behavior | focused test + real app smoke |
```

## Prototype contract

When a briefing prototype exists, it is binding source evidence for layout, interactions, states, and visual direction. Record deliberate changes in the PRD. Never treat a static copy or test fixture as equivalent to a working application.

## Writing rules

- Preserve user intent and explicit exclusions.
- Do not invent optional features.
- Avoid implementation architecture and file plans.
- Never create requirements/spec/design/readiness/conformance/harness artifacts as PRD companions.

## Routing

- MICRO/SMALL/MEDIUM feature → `@planner`, then `@dev` and `@qa`.
- A bounded already-specified technical outcome may use the separate Simple Plan lane directly with `@dev`.
- Sheldon and other specialists are opt-in for one concrete unresolved decision, explicit review, or triggered risk in any classification.
