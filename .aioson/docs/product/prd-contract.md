---
description: "Single-authority PRD contract for the streamlined Product → Planner workflow, with optional Sheldon enrichment."
agents: [product, sheldon]
modes: [executing]
task_types: [prd-writing, prd-finalization, output-contract]
load_tier: trigger
triggers: [writing PRD, updating PRD, PRD contract, current system fit, output path, prototype]
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
prototype_status: current
prototype_feature: {slug}
---
```

When the exact feature-owned prototype does not exist, replace the last three fields with:

```yaml
prototype: null
prototype_status: none
prototype_feature: null
```

If Sheldon is explicitly invoked, it records `sheldon_review: approved` after the independent enrichment. Planner never requires that optional marker.

## Required structure

- Vision
- Problem and users
- `## Feature Capability Map`
- `## Current System Fit`
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

Current-system fit:

```markdown
| CAP | Existing behavior / evidence | Fit decision | Required product delta |
|---|---|---|---|
| CAP-{slug}-main | `src/current/path.ext` currently exposes ... | extend | Preserve ... and add ... |
```

Every required CAP has exactly one fit row. `Fit decision` is `reuse`, `extend`, `replace`, or `new`. Cite exact repository paths/packages and observed behavior. `new` requires evidence that the nearest existing boundary was inspected and does not fit. This records product compatibility, not implementation architecture.

Acceptance criteria:

```markdown
| AC | CAP | Observable behavior | Evidence |
|---|---|---|---|
| AC-{slug}-01 | CAP-{slug}-main | production-path behavior | focused test + real app smoke |
```

## Prototype contract

Resolve prototype ownership before using it:

- Only `.aioson/briefings/{slug}/prototype.html` plus a manifest declaring `feature: {slug}` can bind `prd-{slug}.md`.
- A prototype under another slug remains owned by that feature after closure. Record it only as an excluded historical reference; never infer it is current because search found it.
- When no owned prototype exists, write `prototype: null`, `prototype_status: none`, and a `## Prototype contract` with `status: none`.
- If the user explicitly wants an old experience to govern the new feature, first create or re-synchronize a new feature-owned prototype under the active slug. Never cross-link the old folder.

With `current`, the prototype is binding source evidence for layout, interactions, states, and visual direction. Record deliberate changes in the PRD. Never treat a static copy or test fixture as equivalent to a working application.

## Writing rules

- Preserve user intent and explicit exclusions.
- Do not invent optional features.
- Apply the repository-backed recommended fit without asking for routine confirmation; ask only when alternatives materially change behavior, scope, cost, data, or risk.
- Apply the safe prototype resolution without routine confirmation: matching owned artifact → `current`; missing/mismatched/closed-feature artifact → `none` plus explicit exclusion. State the result in chat.
- Avoid implementation architecture and file plans.
- Never create requirements/spec/design/readiness/conformance/harness artifacts as PRD companions.

## Routing

- MICRO/SMALL/MEDIUM feature → `@planner`, then `@dev` and `@qa`.
- A bounded already-specified technical outcome may use the separate Simple Plan lane directly with `@dev`.
- Sheldon and other specialists are opt-in for one concrete unresolved decision, explicit review, or triggered risk in any classification.
