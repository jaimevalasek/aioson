---
name: product-scope-expansion
description: "Product process skill for controlled scope expansion before writing or updating a PRD. Use in @product when a feature has a rich surface, when a briefing expansion scout exists, or when the user asks for a more complete MVP without turning the feature into an oversized V2."
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

