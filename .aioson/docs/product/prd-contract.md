---
description: "Single-authority PRD contract for Product → Sheldon → Planner with source-promise coverage and approved prototype binding."
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

This file is the single product/specification authority. Product makes it review-ready; Sheldon must challenge, enrich, and hash-bind approve it in place before Planner.

## Frontmatter

```yaml
---
feature: {slug}
classification: SMALL
feature_completeness: required
product_scope: approved
prd_ready: approved
sheldon_review: pending
prototype: .aioson/briefings/{slug}/prototype.html
prototype_status: current
prototype_feature: {slug}
identity: .aioson/briefings/{slug}/identity.md
identity_status: current
---
```

When the exact feature-owned prototype does not exist, replace the three prototype fields with:

```yaml
prototype: null
prototype_status: none
prototype_feature: null
```

`identity`/`identity_status` are the second half of the visual contract, resolved independently of the prototype, with exactly three legitimate states — `current` (feature-owned `.aioson/briefings/{slug}/identity.md`), `project` (shared `.aioson/context/identity.md`), or `none` (`identity: null`; the design engine runs intent-first). When the approved prototype manifest declares the record it was built from, the PRD must carry that same path — dropping it is a `prototype:check` failure. Never bind an exploration identity.

After the final PRD edit, Sheldon records `sheldon_review: approved` and promotes a current hash-bound PASS. Planner requires both; any later PRD or hard-authority edit invalidates the review.

## Required structure

- Vision
- Problem and users
- `## Feature Capability Map`
- `## Source Coverage` when the approved briefing contains `PROM-*`
- `## Current System Fit`
- MVP scope
- Out of scope
- User flows, including visible success/failure states
- Success metrics
- Prototype contract and approved deviations
- Open questions, with blocking questions explicitly marked
- Visual identity when relevant
- `## Acceptance Criteria` (owned and finalized by Product before Planner)
- `## Business Rules` when the feature carries rules or invariants — `| Rule | Statement | Kind | Applies to | Source |`, `RULE-*`, kind `rule` | `invariant`, bound to `CAP-*` or `feature-wide`; every rule is cited by the AC that proves it (optional; linted when present, and rule language in prose with no table is a measured warning)
- `## Decision Branches` when behavior forks — `| Branch | Condition | Expected behavior | AC |`, `BR-*`, one row per `if / when / unless`, each tied to its AC (optional; linted when present, and conditional prose with no table is a measured warning)

Capability map:

```markdown
| CAP | Promised outcome | Actor / trigger | Scope decision | Rationale |
|---|---|---|---|---|
| CAP-{slug}-main | observable outcome | actor/trigger | required | concrete reason |
```

Source coverage:

```markdown
| Promise | Product decision | CAP / AC | Evidence or rationale |
|---|---|---|---|
| PROM-{slug}-01 | required | CAP-{slug}-main / AC-{slug}-01 | preserved from SRC-001 |
```

Every briefing promise appears exactly once. Required or already-satisfied promises map to known CAP/AC IDs; deferred, rejected, or not-applicable promises record a concrete rationale.

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

The `Evidence` cell is a binding declaration, not decoration. An AC that declares an automated check
(test, spec, e2e, automated check) must be cited inside an asserting test to close — the close-time
`ac:test-audit` enforces exactly what was promised. An AC whose verification is genuinely manual
(visual smoke, measurement, inspection) should say so; at close it is then satisfied by a concrete QA
PASS row in the CAP/AC evidence table instead of a ritual test file. Declare honestly per row —
"smoke visual" on a behavior a test could cover trades durable regression coverage for one manual pass.

## Prototype contract

Resolve prototype ownership before using it:

- Only `.aioson/briefings/{slug}/prototype.html` plus an approved manifest declaring `feature: {slug}` can bind `prd-{slug}.md`.
- A prototype under another slug remains owned by that feature after closure. Record it only as an excluded historical reference; never infer it is current because search found it.
- When no owned prototype exists, write `prototype: null`, `prototype_status: none`, and a `## Prototype contract` with `status: none`.
- If the user explicitly wants an old experience to govern the new feature, first create or re-synchronize a new feature-owned prototype under the active slug. Never cross-link the old folder.

With `current`, the prototype is binding source evidence for layout, interactions, states, and visual direction. Record deliberate changes in the PRD. Never treat a static copy or test fixture as equivalent to a working application.

## Writing rules

- Preserve user intent and explicit exclusions.
- Originate optional ideas as proposals with value, uncertainty, and scope impact; never present them as approved requirements. Only accepted choices enter required CAP/AC rows.
- Apply the repository-backed recommended fit without asking for routine confirmation; ask only when alternatives materially change behavior, scope, cost, data, or risk.
- Apply the safe prototype resolution without routine confirmation: matching owned artifact → `current`; missing/mismatched/closed-feature artifact → `none` plus explicit exclusion. State the result in chat.
- Avoid implementation architecture and file plans.
- Never create requirements/spec/design/readiness/conformance/harness artifacts as PRD companions.

## Routing

- MICRO/SMALL/MEDIUM feature → `@sheldon`, then `@planner`, `@dev`, and `@qa`.
- A bounded already-specified technical outcome may use the separate Simple Plan lane directly with `@dev`.
- Other specialists remain opt-in for one concrete unresolved decision, explicit review, or triggered risk.
