---
name: briefing-expansion-scout
description: "Briefing process skill for early feature expansion scouting. Use in @briefing or @briefing-refiner when an idea may have a rich surface and the user wants to explore whether it is worth pursuing before PRD: tools, workflows, generators, dashboards, editors, collaboration, automation, templates, media outputs, or Trello/CRM/Kanban-like systems."
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
- the idea has a rich surface: workflow, collaboration, editor/builder, generator, dashboard, automation, templates, media output, repeated operational use
- briefing-refiner detects that an existing briefing feels too thin for team discussion

If the idea is a tiny bugfix or a one-field CRUD addition, skip and say the normal briefing path is enough.

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
- Do not approve V2 ideas; park them.
- Do not modify the PRD.

