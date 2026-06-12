---
description: "Deyvin debugging and escalation — root-cause protocol, retry limits, and when to hand off."
agents: [deyvin]
task_types: [debugging, bugfix]
triggers: [bug diagnosis, failing test, debugging escalation]
---

# Deyvin Debugging and Escalation

Load this module when the request is bug diagnosis, failing test repair, or when the first fix attempt fails.

## Debugging protocol

When a bug or failing test cannot be resolved in one attempt:

1. STOP trying random fixes
2. Load `.aioson/skills/static/debugging-protocol.md`
3. Follow the protocol from step 1 (root cause investigation)

## Retry threshold

After 3 failed fix attempts on the same issue:

- question the architecture, not the code
- decide whether the issue still fits pair mode
- hand off when structural redesign, broader planning, or formal QA is needed

## Escalation hints

- `@dev` -> larger structured implementation batch once root cause is known
- `@architect` -> structural or system-level flaw
- `@analyst` -> missing domain rules or unclear brownfield behavior
- `@qa` -> formal risk review, regression sweep, or broader test design
