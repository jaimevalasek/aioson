---
name: feature-expansion-taxonomy
description: "Shared taxonomy for optional feature expansion: classify richer product possibilities without inflating MVP scope."
agents: [briefing, refiner, product, sheldon]
modes: [planning, executing]
task_types: [feature-expansion, product-discovery, prd-enrichment, briefing-refinement]
load_tier: trigger
triggers: [feature expansion, rich surface, MVP options, product scope, capability map, operational surface, CRUD surface, management surface, Trello, Kanban, CRM, workspace, board, dashboard, workflow, editor, collaboration, kart game, jogo de kart, jogo de corrida, learning experience, simulador interativo]
---

# Feature Expansion Taxonomy

Use this shared vocabulary when a feature has a rich operational or experiential surface: workflow tools, collaboration, editors/builders, generators, media outputs, dashboards, CRM/Kanban-style systems, automation, templates, customization, workspaces, boards, operational CRUD, games, simulations, learning experiences, or repeated use. A short prompt can describe a rich experience; brevity alone is not a reason to skip discovery.

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

Use this map when the promise includes operational management. For interaction-led products, use the Experience Map below; use both only when both kinds of behavior matter. A game does not acquire administration screens merely because it has objects.

When the feature advances from exploration into a PRD/spec, load `.aioson/docs/feature-completeness-contract.md`. The taxonomy discovers operational possibilities; the generic contract turns every approved feature promise into deterministic product, requirements, architecture, plan, implementation, and QA evidence. Operational management remains only one conditional lens.

Use this table shape:

| Object | Parent / owner | Lifecycle states | Required actions | Management surface | Empty / error states | Permissions / roles |
|---|---|---|---|---|---|---|
| Workspace | owner / members | active, archived | create, switch, edit, archive, invite | workspace switcher + workspace settings | no workspaces, invite failed | owner, member |

Rules:

- Anchor Core to the selected product promise. For applicable lifecycle actions (create, list/view, edit, delete/archive, restore), record required, not applicable, or deferred with a reason. Read-only, imported, generated, or immutable objects need no invented local CRUD.
- Search, filter, sort, pagination, form/input validation, loading, and permissions are decision-complete only when each is marked required, not applicable with a reason, or deferred with a reason in the downstream Operational Capability Matrix.
- When the promise includes management, every Core object needs a management entry: page, panel, modal, drawer, inline action, settings screen, or command. Its absence is a gap in that promise, not a reason to add management to read-only scope.
- Parent/child relationships must be explicit where relevant. For Trello-like systems, inspect cards, lists/columns, boards, workspaces, members, and role boundaries as candidates; category resemblance alone does not make them required.
- A user flow that says "manage cards" is too thin unless it names how the user adds, edits, moves, archives, restores, and sees validation feedback.
- Empty states and failure states are Core for first-use products, admin surfaces, and repeated-use operational tools.
- Deferred lifecycle actions must be visible in Out of scope, not silently omitted.

Candidate surfaces for Trello/Kanban/CRM/workspace-like products; select only those required by approved promises and preserve exclusions:

- Workspace or account home: create/select workspace, invite/manage members, edit settings.
- Board/list/index surface: create/select/search/archive boards or pipelines.
- Main work surface: view columns/lists/status groups, create/move/edit/archive primary items.
- Item detail surface: edit content, metadata, assignee/owner, labels/status, comments/notes when in scope.
- Empty/error surfaces: no workspace, no board, no items, permission denied, validation failure.

## Experience discovery

Start from the intended user outcome and constraints. Walk through entry, first meaningful action, response, success/failure, recovery, and repeated use. Discover opportunities by connecting these moments, removing friction, or borrowing a mechanism from another domain with an explicit reason it fits. Do not reduce enrichment to missing fields or generic error states.

For each promising mechanism, explain the concrete before/after experience, expected value, downside or effort, bucket, evidence or hypothesis, and a cheap observable check. Compare with the simplest coherent baseline. Keep only useful candidates; neither an idea quota nor a longer document demonstrates quality.

### Experience Map

| User moment / goal | Action or choice | System response / feedback | Success, failure and recovery | Evidence or hypothesis | Bucket / decision | Observable check |
|---|---|---|---|---|---|---|

Adapt the relevant lenses to the domain:

- **Games:** player goal, discoverable controls, action → consequence → feedback, challenge and fairness, meaningful choices, progress, finish/failure, restart, and replay value. Consider responsive input, camera/readability, collisions, pacing, pause/focus loss, and audio only where the chosen experience needs them. Specify behavior worth testing; leave engine and algorithm choices to implementation owners.
- **Learning:** learner goal, exercise, feedback that explains an error, retry, progress and transfer to a fresh example. Do not assume accounts, grading dashboards, or gamification.
- **Creative tools and simulations:** creation/manipulation, immediate feedback, exploration, reversible mistakes, result and reuse. Do not add management flows when a local interaction meets the goal.

For a short kart-racing idea, a useful candidate baseline is a controllable vehicle, readable course, start, valid lap completion, result and restart. Compare a time trial with opponents if that choice is open. Drifting, items or a rival can deepen a particular experience; explain the trade-off before recommending them. Accounts, online multiplayer, stores and a track editor are separate scope proposals, never genre obligations. Respect a request for a driving toy without races; the example is not a mandatory game template.

An observed play session can prove controls and state transitions; screenshots alone cannot prove handling, collision behavior or replay value. Label untested experience claims as hypotheses. For a learning tool, likewise, a visible score is not proof of learning.

## Required Trace

Every expansion artifact should state:

- whether prior expansion artifacts were found
- which bucket each suggestion belongs to
- which user moments or Core objects were mapped in the applicable experience/operational map
- which interactions or management surfaces are needed for the selected promise
- which ideas need explicit user approval
- which ideas are intentionally deferred
- how the expansion affects project classification or delivery risk
