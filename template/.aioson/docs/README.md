---
description: "Guide to the docs layer: domain knowledge and technical reference for agents"
agents: []
---

# Project Docs

Files in this directory are domain knowledge and technical reference that agents load on demand.

Unlike `rules/` (which enforce conventions), docs explain **how something works** — external APIs, data models, integration patterns, legacy behavior, third-party quirks.

---

## Frontmatter Format

```yaml
---
description: "Short description of what this doc covers — used by agents to decide relevance"
scope: "global"       # or a feature slug if doc is scoped to one area
agents: []            # empty = any agent may load; or restrict: [dev, planner]
---
```

---

## Field Reference

| Field | Required | Description |
|-------|----------|-------------|
| `description` | yes | What this doc covers — agents use this to decide whether to load it |
| `scope` | no | `global` (default) or a feature slug for narrow scope |
| `agents` | no | If empty, any agent may load; if listed, only those agents load it |

---

## Loading Behavior

Agents load docs when the `description` frontmatter is relevant to the current task.
An empty `agents:` field means any agent can load the doc.
Docs are loaded in addition to the current context — not as replacements.

---

## When to Create a Doc

Create a doc when:
- Two or more features need the same external context
- An integration has non-obvious behavior that has caused bugs or would cause rework
- A data model exists only in production and is not derivable from the codebase
- A third-party API has quirks that affect how agents implement against it

Do NOT create a doc for:
- Feature-specific decisions (use the PRD/plan decision sections or `aioson decision:add`)
- Project conventions (use `rules/` instead)
- Current implementation state (use `spec-{slug}.md` instead)

---

## Naming Convention

Use kebab-case. Name the file after the system or concept, not the feature:

| Good | Bad |
|------|-----|
| `stripe-webhook-behavior.md` | `billing-feature-notes.md` |
| `auth-rbac-model.md` | `auth-stuff.md` |
| `legacy-api-quirks.md` | `misc-notes.md` |
| `email-delivery-constraints.md` | `sendgrid.md` (too generic) |

---

## Example

See `example-external-api-context.md` in this directory for a working template.

For the layer separation guide (when to use `docs/` vs `rules/` vs `design-doc`), see `LAYERS.md`.
