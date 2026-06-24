---
name: briefing-expansion-scout
description: "Briefing process skill for early feature expansion and operational surface scouting. Use in @briefing or @briefing-refiner when an idea may have a rich surface and the user wants to explore whether it is worth pursuing before PRD: tools, workflows, generators, dashboards, editors, collaboration, automation, templates, media outputs, workspace/board/card systems, operational CRUD, or Trello/CRM/Kanban-like systems."
---

# Briefing Expansion Scout

Use this skill to explore possibilities before scope is committed. Do not turn ideas into PRD scope. Produce discussion material that helps the user or team decide whether the idea deserves product definition.

## Load

Read `.aioson/docs/feature-expansion-taxonomy.md` before writing the artifact.

Also read existing expansion artifacts when present:

- `.aioson/briefings/{slug}/expansion-scout.md`
- `.aioson/context/features/{slug}/scope-expansion.md`
- `.aioson/context/features/{slug}/expansion-audit.md`

## Trigger Guard

Run only when one is true:

- user asks to explore, expand, evaluate, or pressure-test an idea
- the idea has a rich surface: workflow, collaboration, editor/builder, generator, dashboard, automation, templates, media output, repeated operational use, workspaces, boards, operational CRUD, or admin/management surfaces
- briefing-refiner detects that an existing briefing feels too thin for team discussion

If the idea is a tiny bugfix or a one-field CRUD addition, skip and say the normal briefing path is enough.

## Operational Surface Scout

Before writing the artifact, build the Operational Surface Map from `.aioson/docs/feature-expansion-taxonomy.md`.

Treat this as discovery pressure, not committed PRD scope:

- Name the likely Core objects and their parent/owner relationships.
- For each Core object, identify the minimum management surface that must exist if the product ships.
- Flag missing create/edit/delete/archive/restore paths as gaps, not optional polish.
- For Trello/Kanban/CRM-style ideas, assume workspace/account home, board/list index, main work surface, item detail, empty states, and permission boundaries are relevant unless evidence says otherwise.
- Keep speculative objects in Recommended MVP / Optional / V2 buckets until the user approves them.

If the plan says "Trello-like", "board", "card", "workspace", "pipeline", "CRM", "dashboard", "admin", or "manage X", the scout must explicitly answer: where does the user create/manage each object, and what happens when there are none?

## Output

Write `.aioson/briefings/{slug}/expansion-scout.md`.

Use this structure:

```md
# Expansion Scout - {Feature}

## Why Scout
- Trigger:
- Prior expansion artifacts found:

## Possibility Map
| Lens | Useful possibilities | Why it matters | Risk |
|---|---|---|---|

## Operational Surface Map
| Object | Parent / owner | Lifecycle states | Required actions | Management surface | Empty / error states | Bucket |
|---|---|---|---|---|---|---|

## Missing Management Surfaces
- ...

## Likely MVP Shape
- Core:
- Recommended MVP:
- Not enough evidence yet:

## Discussion Questions
- [decision-required] ...
- [research-able] ...
- [testable] ...

## Do Not Pull Into MVP Yet
- ...

## Recommendation
Proceed to product definition? yes / no / only after questions.
```

## Rules

- Keep this artifact exploratory.
- Mark assumptions explicitly.
- Separate attractive ideas from useful ideas.
- Prefer 3-7 high-signal possibilities over exhaustive lists.
- Do not let "simple MVP" mean "core object exists but cannot be managed."
- A Core object without add/edit/list/archive behavior is a blocking gap in the briefing, not a V2 suggestion.
- Do not approve V2 ideas; park them.
- Do not modify the PRD.
