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

**What it is:** `design-doc.md` is the stable system design baseline; `design-doc-{slug}.md` records only a real feature architecture delta.
**Who writes it:** project setup/design discovery owns the baseline. @orchestrator/@architect own MEDIUM deltas; @sheldon writes a SMALL delta only when inspection proves the baseline is insufficient.
**Who updates it:** the design owner updates the relevant authority. @dev may propose promotion of a proven recurring decision from a feature delta into the baseline.
**When to use:** read the selected baseline sections for any structural change. Create `design-doc-{slug}.md` only for a new architecture, public contract, data, integration, authorization, or security boundary—not once per feature by default.
**Cadence:** baseline changes rarely; feature deltas live with their feature. Decisions are append-only until explicitly superseded.

---

## Decision Guide

| Situation | Where it goes |
|-----------|--------------|
| Enforce a coding convention for this project | `rules/` |
| Agents must always know about an external API behavior | `docs/` |
| Enforce structural code quality guidance | `design-docs/` |
| Document feature requirements/scope without an architecture delta | `requirements-{slug}.md` / `spec-{slug}.md`; reuse `design-doc.md` |
| Document a real feature architecture delta | `design-doc-{slug}.md` |
| Log a global project-wide architecture decision | `design-doc.md` |
| Promote a recurring @dev pattern | `rules/` via @dev promotion |
| Document an integration used by 3+ features | `docs/` |
| Record a non-architectural feature decision | `spec-{slug}.md` (Key decisions section) |

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
