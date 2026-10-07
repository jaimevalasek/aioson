---
description: "Implementation-time decisions — before choosing a library, pattern or approach, ask the project: a recorded precedent answers, JEV may recommend, and the choice is recorded once with aioson decide."
agents: [product, sheldon, planner, dev, qa, tester]
task_types: [decision, trade-off]
triggers: [which library, choose between, decide between, trade-off, which approach, qual biblioteca, escolher entre, decidir entre, qual abordagem]
aliases: [precedent, precedente, decisão técnica, technical decision]
load_tier: trigger
---

# Implementation decisions

A choice between libraries, patterns or approaches is made once per project, then followed by every agent that meets it.

## Before choosing

1. Ask the project:
   `aioson decide . --question="<the decision>" --options="a|b" --paths=<files touched>`
   - **Precedent** → follow it. It is a routed doc under `.aioson/docs/decisions/`.
   - **Governing knowledge** listed → read those rules and docs first; a rule may already settle it.
   - **JEV recommendation** (only when configured) → a recommendation with its confidence, not a decision.
2. When the evidence does not settle it, or the choice changes product scope, cost, security or data → raise it for a human with `aioson decision:add` (it blocks the feature until resolved).

## After choosing

Record it once, with the reason the next agent needs:

`aioson decide . --question="<the decision>" --options="a|b" --record --choice="a" --why="<reason>" --by=@<agent> --triggers="<words agents use for this>"`

The decision becomes a routed doc, proven at birth to reach the next agent who asks the question.

## Never

- Re-decide a recorded decision silently. Contrary evidence is raised with `aioson decision:add`.
- Record a recommendation without checking the evidence behind it.
