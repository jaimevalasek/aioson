---
name: product-scope-expansion
description: "Compare creative product options and operational completeness in Product before committing PRD scope. Use for rich surfaces, prior feature expansion evidence, a more complete MVP, or explicit creative enrichment; skip routine bounded edits."
agents: [product]
task_types: [feature-expansion, scope]
triggers: [scope expansion, complete mvp, operational crud, expansion scout, expandir escopo, mvp completo, creative enrichment, enriquecimento criativo]
---

# Product Scope Expansion

Originate and select valuable product possibilities, including simpler alternatives. Expansion is exploration; inclusion in the PRD follows the user's approved intent and delegated decision boundary.

## Load and scope

Read `.aioson/docs/feature-expansion-taxonomy.md` and `.aioson/docs/product/quality-lens.md` for shared buckets and horizontal lenses. Read only matching feature-owned artifacts when present:

- `.aioson/briefings/{slug}/expansion-scout.md`
- `.aioson/context/features/{slug}/scope-expansion.md`
- `.aioson/context/features/{slug}/expansion-audit.md`

Prior artifacts are candidate evidence, not approval. Reuse recorded decisions and exclusions. If no prior artifact exists, originate options from the actor, workflow friction, existing capabilities, and intended outcome.

Run without a permission menu when a rich surface, prior evidence, or explicit richer-thinking request triggers the skill. Otherwise keep the kernel's bounded PRD process. Asking to explore is not a commitment to ship every candidate.

## Explore and select

1. Establish the minimum confirmed outcome, constraints, existing workaround, and approved prototype boundary.
2. Explore relevant journey, handoff, combination, subtraction, analogy, and repeated-use opportunities from the quality lens. Avoid synonym variants and feature-count targets.
3. Compare serious alternatives by observable value, supporting evidence, uncertainty, added user/operational burden, dependencies, and scope impact. Include a simpler or no-change option when viable. Recommend one shape and state when a different choice would win.
4. Classify using the shared buckets; separately record disposition and authorization. `Core` means necessary for the selected promise, not automatically accepted. An inexpensive feature can still be a material scope change.
5. Apply objective repairs and authorized choices. Present only unresolved material decisions to the owner, with a recommendation and consequences. Defer optional candidates without blocking the agreed release.

## Conditional operational completeness

For rich surfaces, map main objects against the selected promise. State why management is required or not applicable. Imported, immutable, generated, or read-only objects can be complete without local CRUD. A category resemblance to Trello/CRM does not authorize workspaces, members, admin screens, or restoration.

When the approved promise includes managing an object, close its owner/parent, lifecycle, required actions and management entry, empty/error behavior, and relevant permissions. For each applicable action, record required, not applicable, or deferred with a reason. Do not silently omit an approved create/manage flow; unresolved required behavior stays blocking in the PRD. Describe product behavior and entry points, leaving composition and implementation to their owners.

## Output

Write `.aioson/context/features/{slug}/scope-expansion.md` as a compact advisory record. Update existing entries rather than duplicating them. It is neither a new specification nor a handoff gate.

```md
# Scope Expansion - {Feature}

## Inputs and decision boundary
- Approved outcome, sources, prototype, and exclusions:
- Prior expansion evidence or none:
- Existing authorization / bounded delegated judgment:

## Product Options
| Option / changed user moment | Value and evidence or hypothesis | Cost / downside | Bucket | Disposition / authorization | Cheap validation |
|---|---|---|---|---|---|

## Recommended Product Shape
- Selected shape and why it beats the baseline:
- Approved inclusions and PRD destinations:
- Deferred / cut alternatives and reasons:
- Material decisions remaining, if any:

## Operational Surface Map
| Object | Parent / owner | Lifecycle | Required actions or not applicable | Management entry or not applicable | Empty / error / permissions | PRD destination |
|---|---|---|---|---|---|---|

## Risks And Classification
- Value uncertainty and validation:
- User effort, scope/prototype impact, and ongoing burden:
- Classification impact of selected scope:
```

## Incorporation and stopping

Promote only approved/authorized behavior into required CAP/AC rows. Preserve all source promises with explicit coverage decisions; do not fabricate a `PROM-*` or source approval for an original proposal. Keep stable CAP/AC IDs when enriching an existing PRD.

Record intentional deviations from the approved prototype. Run `classify --apply` on the completed selected PRD, not on the ideas inventory; surface material expansion before committing it. The taxonomy's implementation lens may identify existing behavior to reuse, but never produce an architecture or implementation plan here.

Stop when the product choice and required behavior are decision-complete, or name the remaining owner decision. Use the existing Product self-review and Sheldon handoff. Do not open extra rounds to fill buckets, chase novelty, or close deferred ideas.
