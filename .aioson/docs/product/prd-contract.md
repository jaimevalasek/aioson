---
description: "Product PRD contract — exact PRD structure, visual identity block, output paths, and next-step routing."
---

# Product PRD Contract

Load this module immediately before writing or updating any PRD.

## Output paths

- Creation / enrichment mode → `.aioson/context/prd.md`
- Feature mode → `.aioson/context/prd-{slug}.md`

`.aioson/context/` accepts only `.md` files.

## Required PRD structure

Use exactly these sections:

```markdown
# PRD — [Project Name]

## Vision
[One sentence. What this product is and why it matters.]

## Problem
[2–3 lines. The specific pain point and who experiences it.]

## Users
- [Role]: [what they need to accomplish]
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
| SMALL | `@analyst` |
| MEDIUM | `@analyst` then `@architect` → `@ux-ui` → `@pm` → `@orchestrator` |

### New feature (`prd-{slug}.md`)

| feature complexity | Next step |
|---|---|
| MICRO | `@dev` |
| SMALL | `@analyst` |
| MEDIUM | `@analyst` → `@architect` → `@scope-check` → `@dev` → `@qa` |

Assess feature complexity from the conversation and state the next agent explicitly.
