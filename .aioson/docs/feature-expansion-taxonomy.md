---
name: feature-expansion-taxonomy
description: "Shared taxonomy for optional feature expansion: classify richer product possibilities without inflating MVP scope."
agents: [briefing, briefing-refiner, product, sheldon]
modes: [planning, executing]
task_types: [feature-expansion, product-discovery, prd-enrichment, briefing-refinement]
load_tier: trigger
triggers: [feature expansion, rich surface, MVP options, product scope, capability map, Trello, generator, dashboard, workflow, editor, collaboration]
---

# Feature Expansion Taxonomy

Use this shared vocabulary when a feature has a rich surface: workflow tools, collaboration, editors/builders, generators, media outputs, dashboards, CRM/Kanban-style systems, automation, templates, customization, or repeated operational use.

Expansion is not approval. It reveals options, classifies value and risk, and makes scope easier to choose.

## Buckets

| Bucket | Meaning |
|---|---|
| Core | The minimum needed for the feature to exist. |
| Recommended MVP | The smallest version that feels genuinely useful, not just technically present. |
| Optional V1 | Useful additions that can ship in V1 if cost/risk stays low. |
| Delight | Experience boosters that make the feature feel polished, but are not required. |
| V2 / Later | Good ideas that should not enter MVP without explicit approval. |
| Cut List | Ideas that look attractive but should be rejected or deferred for this feature. |

## Expansion Lenses

Check only lenses relevant to the feature:

- Primary objects: entities, documents, posts, cards, boards, templates, reports.
- User roles: creator, viewer, collaborator, admin, reviewer, owner.
- Lifecycle states: draft, active, archived, failed, approved, published, scheduled.
- Actions: create, edit, duplicate, move, assign, comment, approve, export, restore.
- Repeated-use UX: presets, defaults, saved views, bulk actions, keyboard/drag interactions.
- Collaboration: members, mentions, comments, assignment, activity log, notifications.
- Control and trust: permissions, audit trail, undo/redo, validation, moderation, safety limits.
- Discovery: search, filters, sort, tags, labels, grouping, saved filters.
- Output quality: preview, variants, formats, export, accessibility, localization.
- Integrations and automation: imports, exports, webhooks, scheduled jobs, simple rules.
- Implementation leverage: framework-native features, low-cost libraries, existing modules.

## Required Trace

Every expansion artifact should state:

- whether prior expansion artifacts were found
- which bucket each suggestion belongs to
- which ideas need explicit user approval
- which ideas are intentionally deferred
- how the expansion affects project classification or delivery risk

