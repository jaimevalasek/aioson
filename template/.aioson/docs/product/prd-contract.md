---
description: "Product PRD contract — exact PRD structure, visual identity block, output paths, and next-step routing."
agents: [product]
modes: [executing]
task_types: [prd-writing, prd-finalization, output-contract, artifact-writing]
load_tier: trigger
triggers: [writing PRD, updating PRD, PRD contract, output path, next-step routing, visual identity]
---

# Product PRD Contract

Load this module immediately before writing or updating any PRD.

## Output paths

- Creation / enrichment mode → `.aioson/context/prd.md`
- Feature mode → `.aioson/context/prd-{slug}.md`

`.aioson/context/` accepts only `.md` files.

## Required PRD structure

Use these sections. For substantive SMALL/MEDIUM features, also include the conditional Feature Capability Map shown below and set `feature_completeness: required` in frontmatter.

```markdown
# PRD — [Project Name]

## Vision
[One sentence. What this product is and why it matters.]

## Problem
[2–3 lines. The specific pain point and who experiences it.]

## Users
- [Role]: [what they need to accomplish]

## Feature Capability Map
| CAP | Promised outcome | Actor / trigger | Scope decision | Rationale |
|---|---|---|---|---|
| CAP-[slug]-[outcome] | [observable outcome] | [actor or system trigger] | required / deferred / not_applicable | [concrete reason] |
- [Role]: [what they need to accomplish]

## MVP scope
### Must-have 🔴
- [Feature or capability — why it's required for launch]

### Should-have 🟡
- [Feature or capability — why it's valuable but not blocking]

## Out of scope
- [What is explicitly excluded from this version]

## User flows
### [Key flow name]
[Step-by-step: User does X → System does Y → User sees Z]

## Success metrics
- [Metric]: [target and timeframe]

## Open questions
- [Unresolved decision that needs an answer before or during development]

## Visual identity
### Design skill
### Aesthetic direction
### Color & theme
### Typography
### Motion & interactions
### Component style
### Quality bar
```

## Visual identity inclusion rule

Include `## Visual identity` when:

- the client expressed visual preferences, or
- `design_skill` is already set in `project.context.md`

Omit it only when visual requirements were truly not discussed and no design skill was selected.

## Feature completeness inclusion rule

Load `.aioson/docs/feature-completeness-contract.md`. Include `## Feature Capability Map` for every substantive SMALL/MEDIUM feature. Omit it only for a genuinely bounded MICRO task with no rich/sensitive surface. When `operational-management` is relevant, also include `## Operational Surface Map` from `.aioson/docs/feature-expansion-taxonomy.md`.

Capability rows never contain `TBD`: unresolved scope stays in `## Open questions`, and the handoff remains blocked when it changes a required promise.

### Design skill block

Inside `### Design skill`:

- write the selected design skill if chosen
- if postponed, write `pending-selection`
- add a note that `@ux-ui` must read `.aioson/skills/design/{skill}/SKILL.md` before design work when a skill is selected

## Writing rules

- Do not invent undiscussed content unless the user explicitly requested surprise mode
- In standard finalize mode, unresolved sections become `TBD — not discussed.`
- Keep the PRD focused; summarize sections that are getting too long
- Preserve the user's product framing; do not drift into analyst or architect territory

## Next-step routing

After the PRD is produced:

### New project (`prd.md`)

| classification | Next step |
|---|---|
| MICRO | `@dev` |
| SMALL | `@sheldon` (lean default) |
| MEDIUM | `@orchestrator` (maestro spec authority) |

### New feature (`prd-{slug}.md`)

| feature complexity | Next step |
|---|---|
| MICRO | `@dev` |
| SMALL | `@sheldon` (lean default) |
| MEDIUM | `@orchestrator` (maestro) → `@dev` → `@pentester` → `@qa` |

Assess feature complexity from the conversation and state the next agent explicitly.
