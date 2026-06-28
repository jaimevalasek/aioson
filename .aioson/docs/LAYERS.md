---
description: "Guide to the three project memory layers: rules, docs, and design-docs — when to use each"
task_types: [framework-structure]
triggers: [framework layers, docs structure]
agents: []
---

# AIOSON Project Memory Layers

Four directories accumulate project knowledge over time.
Each has a different purpose and a different update cadence.

---

## Layer 1 — `.aioson/rules/`

**What it is:** behavioral overrides for agents.
**Who writes it:** the user, or promoted from recurring @dev patterns.
**When to use:** when you want to enforce a convention that overrides agent defaults — globally or for specific agents.
**Cadence:** stable. Rules change rarely; only when a convention is proven wrong or superseded.

Examples of good rules:
- "All API routes must follow REST naming conventions in this project"
- "Never use float for monetary values — use integer cents"
- "The @dev agent must always write a migration for schema changes"

See `rules/README.md` for format and frontmatter reference.

---

## Layer 2 — `.aioson/docs/`

**What it is:** domain knowledge and technical reference that agents load on demand.
**Who writes it:** the user or @architect, based on real integration and domain complexity.
**When to use:** when multiple agents across different features need the same external context — API behavior, third-party quirks, data model explanations, integration patterns.
**Cadence:** updated when the referenced system changes, not after every feature.

Examples of good docs:
- `stripe-integration-context.md` — describes webhook event model, idempotency keys used
- `auth-rbac-model.md` — explains the role/permission system as it stands in production
- `legacy-api-behavior.md` — documents known quirks of an external API affecting multiple features

See `docs/README.md` for format and naming conventions.

---

## Layer 3 — `.aioson/design-docs/`

**What it is:** structural code governance: folder structure, componentization, reuse, naming, and file-size thresholds.
**Who writes it:** installed by AIOSON, then edited by the project team when conventions change.
**When to use:** before architectural structure decisions and before implementation that creates files, splits modules, introduces reusable code, or names APIs.
**Cadence:** stable. These files are project-local and preserved on update.

---

## Layer 4 — `.aioson/context/design-doc*.md`

**What it is:** living decision document for the current feature or project scope.
**Who writes it:** @architect (merged mode) on MEDIUM and @sheldon on the SMALL lean lane by default; @discovery-design-doc when that opt-in detour is in the sequence.
**Who updates it:** @dev at feature close; the design-doc producer (@architect merged / @sheldon / @discovery-design-doc detour) when resuming.
**When to use:** automatically — one per feature (`design-doc-{slug}.md`) or one project-wide (`design-doc.md`).
**Cadence:** updated at the end of each feature implementation session. Decisions are append-only — never deleted.

---

## Decision Guide

| Situation | Where it goes |
|-----------|--------------|
| Enforce a coding convention for this project | `rules/` |
| Agents must always know about an external API behavior | `docs/` |
| Enforce structural code quality guidance | `design-docs/` |
| Document the scope and decisions for a specific feature | `design-doc-{slug}.md` |
| Log a global project-wide architecture decision | `design-doc.md` |
| Promote a recurring @dev pattern | `rules/` via @dev promotion |
| Document an integration used by 3+ features | `docs/` |
| Record what was decided during a single feature session | `design-doc-{slug}.md` (Decisions already made section) |

---

## What NOT to put in these layers

| Content | Where it actually belongs |
|---------|--------------------------|
| Feature requirements | `requirements-{slug}.md` |
| PRD / product scope | `prd-{slug}.md` |
| Execution sequence | `implementation-plan-{slug}.md` |
| Current implementation state | `spec-{slug}.md` |
| Project-wide context | `project.context.md` |
| Domain entity map | `discovery.md` |
| Technical architecture | `architecture.md` |
