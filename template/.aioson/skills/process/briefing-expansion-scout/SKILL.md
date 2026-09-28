---
name: briefing-expansion-scout
description: "Discover useful possibilities before PRD in Briefing or Refiner. Use for rich operational or experiential ideas, including games and learning tools from short prompts, prior expansion evidence, or an explicit exploration request. Skip bounded fixes and settled choices."
agents: [briefing, refiner]
task_types: [feature-expansion, briefing]
triggers: [expansion scout, rich surface, explore idea, pressure-test idea, expandir ideia, explorar possibilidades, kart game, jogo de kart, jogo de corrida, learning experience, simulador interativo]
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
- the idea has a rich operational or experiential surface: workflow, collaboration, editor/builder, generator, dashboard, automation, templates, media output, repeated operational use, workspaces, boards, operational CRUD, admin/management, a game, simulation, or learning experience; judge the experience, not the number of words in the prompt
- a prior scout exists and Refiner is auditing its value and unresolved choices
- refiner detects that an existing briefing feels too thin for team discussion

If the idea is a tiny bugfix or a one-field CRUD addition, skip and say the normal briefing path is enough.

## Discover useful experience

Read the intended outcome and exclusions before exploring. Use the taxonomy's experience discovery to imagine the first successful use, a failed attempt, recovery and a return visit. Find useful combinations, simplifications and domain-specific interactions the user may not have named. For each retained idea, explain its mechanism, before/after value, cost or downside, confidence and an observable check. Expertise may generate a hypothesis; do not invent user demand, research or approval.

Keep the selected product recognizable. Distinguish a missing behavior that prevents its promised outcome from an optional improvement. A concise prompt is not an instruction to produce a thin paraphrase, and "simple" still constrains complexity. When the baseline is already complete, say why no extension improves it instead of filling a quota.

Briefing summarizes the strongest candidates in `Proposed solution` / `Open questions` and references this scout. Refiner independently tests their value, preserves prior accepted/rejected/deferred decisions, and turns unresolved useful candidates into review choices through `refinement-loop.md`. A scout referenced without actionable choices does not complete that handoff. Do not reopen a pending review or a settled choice without new evidence or an explicit request.

## Operational Surface Scout

Choose the applicable map from `.aioson/docs/feature-expansion-taxonomy.md`: Experience Map for interaction-led products, Operational Surface Map for managed objects, both only when needed. Skip irrelevant sections in the output.

Treat this as discovery pressure, not committed PRD scope:

- Name the likely Core objects and their parent/owner relationships.
- For each Core object users must manage under the selected promise, identify the minimum management surface that must exist if the product ships.
- When the promise includes managing an object, flag its missing create/edit/delete/archive/restore paths as gaps, not optional polish. Read-only, imported, generated, or immutable objects need no invented local CRUD: mark those actions not applicable with the reason.
- For Trello/Kanban/CRM-style ideas, inspect workspace/account home, board/list index, main work surface, item detail, empty states, and permission boundaries as candidates; category resemblance alone does not make them required — tie each to a promise or bucket it.
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
| Candidate | User moment and mechanism | Before → after value | Evidence or hypothesis | Cost / downside | Bucket / disposition | Observable check |
|---|---|---|---|---|---|---|

## Experience Map
Use the taxonomy's table for interaction-led products; omit when irrelevant.

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
- Keep a small shortlist of high-signal possibilities; do not invent additions to meet a count.
- Do not let "simple MVP" mean "core object exists but cannot be managed."
- A Core object the promise says users manage, without add/edit/list/archive behavior, is a blocking gap in the briefing, not a V2 suggestion.
- Do not approve V2 ideas; park them.
- Do not modify the PRD.
