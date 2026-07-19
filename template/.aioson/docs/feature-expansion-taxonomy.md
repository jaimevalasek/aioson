---
name: feature-expansion-taxonomy
description: "Shared taxonomy for optional feature expansion: classify richer product possibilities without inflating MVP scope."
agents: [briefing, briefing-refiner, product, sheldon]
modes: [planning, executing]
task_types: [feature-expansion, product-discovery, prd-enrichment, briefing-refinement]
load_tier: trigger
triggers: [feature expansion, rich surface, MVP options, product scope, capability map, operational surface, CRUD surface, management surface, Trello, Kanban, CRM, workspace, board, dashboard, workflow, editor, collaboration]
---

# Feature Expansion Taxonomy

Use this shared vocabulary when a feature has a rich surface: workflow tools, collaboration, editors/builders, generators, media outputs, dashboards, CRM/Kanban-style systems, automation, templates, customization, workspaces, boards, operational CRUD, or repeated operational use.

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

## Operational Surface Map

For rich-surface products, expansion is incomplete until the main objects have an operational surface map.

When the feature advances from exploration into a PRD/spec, load `.aioson/docs/feature-completeness-contract.md`. The taxonomy discovers operational possibilities; the generic contract turns every approved feature promise into deterministic product, requirements, architecture, plan, implementation, and QA evidence. Operational management remains only one conditional lens.

Use this table shape:

| Object | Parent / owner | Lifecycle states | Required actions | Management surface | Empty / error states | Permissions / roles |
|---|---|---|---|---|---|---|
| Workspace | owner / members | active, archived | create, switch, edit, archive, invite | workspace switcher + workspace settings | no workspaces, invite failed | owner, member |

Rules:

- A named Core object is not real scope until its create, list/view, edit, delete/archive, and restore behavior is either covered or explicitly deferred.
- Search, filter, sort, pagination, form/input validation, loading, and permissions are decision-complete only when each is marked required, not applicable with a reason, or deferred with a reason in the downstream Operational Capability Matrix.
- Every Core object needs a management surface: page, panel, modal, drawer, inline action, settings screen, or command. If there is no place to manage it, the product is underspecified.
- Parent/child relationships must be explicit. For Trello-like systems, cards imply lists/columns, boards, workspaces, members, and at least basic role boundaries.
- A user flow that says "manage cards" is too thin unless it names how the user adds, edits, moves, archives, restores, and sees validation feedback.
- Empty states and failure states are Core for first-use products, admin surfaces, and repeated-use operational tools.
- Deferred lifecycle actions must be visible in Out of scope, not silently omitted.

Minimum expected surfaces for Trello/Kanban/CRM/workspace-like products:

- Workspace or account home: create/select workspace, invite/manage members, edit settings.
- Board/list/index surface: create/select/search/archive boards or pipelines.
- Main work surface: view columns/lists/status groups, create/move/edit/archive primary items.
- Item detail surface: edit content, metadata, assignee/owner, labels/status, comments/notes when in scope.
- Empty/error surfaces: no workspace, no board, no items, permission denied, validation failure.

## Required Trace

Every expansion artifact should state:

- whether prior expansion artifacts were found
- which bucket each suggestion belongs to
- which Core objects were mapped in the operational surface map
- which management surfaces are required for those Core objects
- which ideas need explicit user approval
- which ideas are intentionally deferred
- how the expansion affects project classification or delivery risk
