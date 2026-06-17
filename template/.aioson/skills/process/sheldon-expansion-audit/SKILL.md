---
name: sheldon-expansion-audit
description: "Sheldon process skill for auditing a PRD against prior feature expansion artifacts and expected product richness. Use in @sheldon when expansion-scout.md or scope-expansion.md exists, or when a PRD for a rich-surface feature looks too thin, too inflated, or lacks acceptance criteria for enriched capabilities."
---

# Sheldon Expansion Audit

Use this skill to judge whether product expansion was handled well. Sheldon should not be the primary dreamer; it should protect the PRD from being too poor or too large.

## Load

Read `.aioson/docs/feature-expansion-taxonomy.md`.

Read available inputs:

- target `prd-{slug}.md`
- `.aioson/briefings/{slug}/expansion-scout.md`
- `.aioson/context/features/{slug}/scope-expansion.md`
- prior `.aioson/context/features/{slug}/expansion-audit.md`

If no prior expansion artifact exists, perform only a lightweight inferred expansion and label it clearly.

## Output

Write `.aioson/context/features/{slug}/expansion-audit.md`.

Use this structure:

```md
# Expansion Audit - {Feature}

## Inputs
- PRD:
- Prior expansion artifacts found:
- Audit mode: prior-artifact / inferred-lightweight

## Findings
| Severity | Finding | Evidence | Recommendation |
|---|---|---|---|

## Too Thin Check
- Missing Core/Recommended MVP items:
- Missing user states/actions:
- Missing acceptance criteria:

## Too Large Check
- V2 items pulled into MVP:
- Optional items without approval:
- Classification/timeline risk:

## PRD Patch Recommendations
- Add:
- Move to V2:
- Ask user:

## Sheldon Decision
Proceed / enrich PRD first / return to product for decision.
```

## Rules

- Prefer evidence from prior expansion artifacts over inventing new ideas.
- Flag when a rich-surface PRD has only generic fields or thin CRUD.
- Flag when V2 ideas entered MVP without explicit rationale.
- Convert accepted expansion items into acceptance-criteria gaps.
- Do not rewrite Product-owned Vision, Problem, or Users.

