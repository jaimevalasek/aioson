---
description: "Deyvin runtime and handoffs — tracked session behavior, live milestones, direct sessions, and dashboard visibility."
---

# Deyvin Runtime and Handoffs

Load this module when the session is tracked or when the user asks about runtime visibility.

## Runtime principle

The AIOSON execution gateway records tasks, runs, and events in the project runtime automatically. Focus on accurate step summaries, clean handoffs, and updated memory.

## Live-session behavior

If the user entered through `aioson live:start`, do not open a parallel `runtime:session:*` session. Reuse the live session and emit compact milestones instead:

1. When clearly starting a new user-visible slice, run `aioson runtime:emit . --agent=deyvin --type=task_started --title="<short slice title>"`
2. After each completed user-visible task, run `aioson runtime:emit . --agent=deyvin --type=task_completed --summary="<what was just completed>" --refs="<files>"`
3. When the session is linked to a plan and you complete a named step, run `aioson runtime:emit . --agent=deyvin --type=plan_checkpoint --plan-step="<step-id>" --summary="<what was completed>"`
4. For meaningful progress or risk, run `aioson runtime:emit . --agent=deyvin --type=milestone|correction|block --summary="<what changed>"`
5. If the request clearly belongs to another AIOSON agent, hand the same live session over with `aioson live:handoff . --agent=deyvin --to=<next-agent> --reason="<why the handoff is needed>"`
6. If the user wants to monitor the session in another terminal, recommend `aioson live:status . --agent=deyvin --watch=2`
7. Let the session owner close it with `aioson live:close . --agent=<active-agent> --summary="<one-line summary>"`

## Direct-session behavior

If the user did not enter through `aioson live:start`, keep one direct session open while the pair session is active:

1. At session start or when resuming work, run `aioson runtime:session:start . --agent=deyvin --title="<current focus>"`
2. After each completed user-visible task, run `aioson runtime:session:log . --agent=deyvin --message="<what was just completed>"`
3. On handoff, explicit pause, or session end, run `aioson runtime:session:finish . --agent=deyvin --summary="<one-line summary>"`
4. If the user wants to monitor the session in another terminal, recommend `aioson runtime:session:status . --agent=deyvin --watch=2`

## Dashboard visibility

Plain natural-language agent activation in an external client does not create runtime records by itself. If the user wants tracked dashboard visibility, they must enter through `aioson workflow:next`, `aioson agent:prompt`, or `aioson live:start` first.

## Cross-session handoffs — persist before /clear

The runtime helpers above cover same-session handoffs (`live:handoff`, `runtime:session:finish`). For cross-session handoffs — when the next agent will run in a fresh terminal or after `/clear` — chat memory does not survive. Before suggesting `/clear`, persist the diagnostic to `plans/{slug}.md` so the next agent works from an artifact rather than from a seed prompt.

Load `.aioson/docs/handoff-persistence.md` for the full pattern (when to apply, what to write, the exit-block template). Apply it whenever the recommended next agent is one that consumes raw plans (`/aioson:agent:briefing` foremost, sometimes `/aioson:agent:product`) or needs the full diagnostic to operate (`/aioson:agent:analyst`, `/aioson:agent:architect`, `/aioson:agent:sheldon`). Skip when the next agent continues in the same session, or when the handoff is trivial.
