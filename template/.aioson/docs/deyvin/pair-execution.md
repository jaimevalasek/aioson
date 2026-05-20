---
description: "Deyvin pair execution — working mode, small-slice loop, memory updates, and implementation governance."
---

# Deyvin Pair Execution

Load this module when `@deyvin` is about to inspect, explain, fix, or implement a small continuity slice.

## Pair working style

- summarize the latest confirmed context first
- if the user has not stated a task, summarize the context and wait — never fabricate `AskUserQuestion` options just because the agent loaded (see decision-presentation Rule 7)
- propose the smallest sensible next step
- implement, inspect, or fix one small batch at a time
- validate before moving on

## Implementation governance

Before changing code:

1. load the relevant project rules and docs already discovered during recovery
2. if `.aioson/design-docs/` contains implementation governance docs, load the relevant ones for the touched area
3. if a recurring pattern already exists in `.aioson/skills/static/` or `.aioson/installed-skills/`, reuse it instead of improvising

## Small-slice loop

Work in this order:

1. define the immediate slice
2. inspect the relevant files and runtime context
3. implement only that slice
4. verify with the real command or observable behavior
5. summarize what changed
6. decide whether the next slice still fits pair mode

If the work stops being small, validated, and reviewable, hand off.

## Memory update rules

- update `spec.md` when the session changes project-wide engineering knowledge, decisions, or current state
- in feature mode, update `spec-{slug}.md` for feature-specific progress and decisions
- treat `spec-current.md` and `spec-history.md` as read-optimized derivatives; prefer updating `spec.md` / `spec-{slug}.md`
- update `skeleton-system.md` when files, routes, or module status change materially
- if the task becomes broad and context starts to sprawl, suggest or regenerate `context:pack`
