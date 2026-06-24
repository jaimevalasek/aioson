---
name: sheldon-expansion-audit
description: "Sheldon process skill for auditing a PRD against prior feature expansion artifacts, expected product richness, and operational surface completeness. Use in @sheldon when expansion-scout.md or scope-expansion.md exists, or when a PRD for a rich-surface feature looks too thin, too inflated, lacks acceptance criteria for enriched capabilities, or implies workspaces, boards, cards, pipelines, operational CRUD, admin/management surfaces, or Trello/CRM/Kanban-like behavior."
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

## Operational Surface Audit

Before recommending enrichment, audit the PRD against the Operational Surface Map in `.aioson/docs/feature-expansion-taxonomy.md`.

Flag as **critical** when a Core object exists in scope but lacks:

- parent/owner relationship
- create, list/view, edit, delete/archive, or restore handling
- a management surface where the user performs those actions
- empty state and validation/error behavior
- role/permission boundary for owner/member/admin scenarios

For Trello/Kanban/CRM/workspace-like PRDs, missing workspace management, board/pipeline CRUD, primary item creation/editing, or the main work surface is a blocking product gap, not optional enrichment.

Do not allow generic phrases like "manage cards", "manage boards", or "workspace support" to pass unless the PRD names the surfaces and flows that make those capabilities usable.

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

## Operational Surface Audit
| Object | Expected surface | Missing action/state | Severity | Required PRD patch |
|---|---|---|---|---|

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
- Treat missing Core management surfaces and create/edit flows as critical gaps.
- For Trello-like products, workspace/board management and card creation/editing are Core unless explicitly excluded in the PRD.
- Flag when V2 ideas entered MVP without explicit rationale.
- Convert accepted expansion items into acceptance-criteria gaps.
- Do not rewrite Product-owned Vision, Problem, or Users.
