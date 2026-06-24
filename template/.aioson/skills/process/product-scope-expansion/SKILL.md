---
name: product-scope-expansion
description: "Product process skill for controlled scope expansion and operational completeness before writing or updating a PRD. Use in @product when a feature has a rich surface, when a briefing expansion scout exists, when the user asks for a more complete MVP, or when the product implies workspaces, boards, cards, pipelines, operational CRUD, admin/management surfaces, or Trello/CRM/Kanban-like behavior without turning the feature into an oversized V2."
---

# Product Scope Expansion

Use this skill to convert product possibilities into an approvable scope. The output informs the PRD; it does not replace user approval.

## Load

Read `.aioson/docs/feature-expansion-taxonomy.md`.

Read prior expansion artifacts when present:

- `.aioson/briefings/{slug}/expansion-scout.md`
- `.aioson/context/features/{slug}/scope-expansion.md`
- `.aioson/context/features/{slug}/expansion-audit.md`

## Ask Before Expanding

When the feature is not obviously rich, ask a short choice:

1. Continue with simple MVP
2. Run recommended expansion
3. Run full expansion, then cut back to MVP

When a scout artifact exists or the user explicitly asks for richer product thinking, run the skill without re-asking unless expansion would materially change classification or timeline.

## Operational Completeness Gate

Before writing or updating the PRD, build the Operational Surface Map from `.aioson/docs/feature-expansion-taxonomy.md`.

This is not optional for rich-surface products. A Core object is incomplete until the PRD accounts for:

- parent/owner relationship
- lifecycle states
- create, list/view, edit, delete/archive, and restore behavior, or an explicit deferral
- the page, panel, modal, drawer, inline action, settings screen, or command where the user manages it
- first-use empty state and validation/error state
- basic role/permission boundary when ownership or collaboration exists

If any Core object lacks a management surface or add/edit path, do not finalize the PRD as-is. Either ask one owner-level decision, choose the smallest defensible default, or put the missing behavior in `## Open questions` and keep it out of "ready for dev" handoff.

For Trello/Kanban/CRM/workspace-like products, treat workspace/account home, board/pipeline index, main work surface, item detail, and empty/error surfaces as expected Core surfaces unless explicitly excluded.

## Output

Write `.aioson/context/features/{slug}/scope-expansion.md`.

Use this structure:

```md
# Scope Expansion - {Feature}

## Inputs
- PRD/briefing source:
- Prior expansion artifacts:
- User approval mode: simple / recommended / full

## Scope Buckets
| Bucket | Items | Why | Approval needed |
|---|---|---|---|
| Core | ... | ... | no |
| Recommended MVP | ... | ... | maybe |
| Optional V1 | ... | ... | yes |
| Delight | ... | ... | yes |
| V2 / Later | ... | ... | yes, future |
| Cut List | ... | ... | no |

## Operational Surface Map
| Object | Parent / owner | Lifecycle states | Required actions | Management surface | Empty / error states | PRD destination |
|---|---|---|---|---|---|---|

## Core Capability Closure
- Complete:
- Missing / needs decision:
- Explicitly deferred:

## Recommended Product Shape
- Include in PRD:
- Keep as optional:
- Explicitly defer:

## Risks And Classification
- Scope risk:
- Delivery risk:
- Classification impact:

## Cheap / Native Implementation Ideas
- ...
```

## PRD Incorporation Rules

- Incorporate Core and approved Recommended MVP into the PRD.
- Do not silently include Optional V1, Delight, or V2 items.
- If expansion raises classification, surface that before finalizing.
- Preserve "small project, small solution": a rich feature can still have a small first release.
- Core operational surfaces must appear in `## MVP scope`, `## User flows`, `## Out of scope`, or `## Open questions`; never leave them only in `scope-expansion.md`.
- Do not route to implementation while a Core object's create/manage flow is undefined.
