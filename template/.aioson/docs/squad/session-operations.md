---
description: "Squad session operations — ephemeral squads, investigation, inter-squad routing, learnings, dashboard guidance, and recurring tasks."
agents: [squad]
task_types: [session, operations]
triggers: [squad session, ephemeral, learnings]
---

# Squad Session Operations

Use this module for ongoing orchestration and maintenance concerns around the squad.

## Ephemeral squads

Trigger on:

- `@squad --ephemeral`
- "quick squad"
- "temporary squad"
- "session-only squad"

Rules:

- set `"ephemeral": true` in the manifest
- optionally set `"ttl": "24h"`
- skip deep design-doc/readiness work
- keep the package in `.aioson/squads/{slug}/`
- keep output in `output/{slug}/`
- do not register ephemeral squads in `CLAUDE.md` or `AGENTS.md`

## Investigation via `@orache`

Offer investigation when:

- the domain is unfamiliar or specialized
- the user did not provide deep context
- the squad will be reused repeatedly
- richer domain vocabulary and benchmarks would materially help

If the domain-classification gate marked the domain as regulated, investigation is mandatory and blocks final squad generation.

If investigation is accepted or required:

1. invoke `@orache`
2. read the `squad-searches/` report
3. persist an `investigation` object in the blueprint and final manifest
4. use it to refine executors, vocabulary, blueprints, quality checks, and anti-patterns
5. translate regulations into hard constraints, human gates, or review criteria
6. translate anti-patterns into checklist items and `vetoConditions`
7. translate benchmarks into workflow quality bars and warm-up expectations

If the report covers fewer than 4 of the 7 investigation dimensions, ask whether the user wants a deeper pass before finalizing the squad.

## Inter-squad routing

When multiple squads exist:

1. scan `.aioson/squads/`
2. read sibling `squad.md` files
3. if a request belongs to a sibling squad, route explicitly
4. if collaboration is required, coordinate a handoff instead of absorbing the work silently

Never duplicate an existing squad's responsibility without an explicit user request.

## Squad learnings

At session start:

- read `learnings/index.md` if present
- load only the learnings relevant to the current topic

During session:

- capture corrections, rejections, and quality signals internally
- do not interrupt productive work to discuss learning capture

At session end:

- list the main detected learnings
- show them briefly to the user
- save approved ones under `learnings/`
- update `learnings/index.md`

Promotion checks:

- repeated quality learning → offer promotion to a rule
- accumulated domain learnings → offer domain skill creation
- stable preference over many sessions → mark established

## Dashboard guidance

If the user asks for a dashboard or panel:

- explain that the dashboard app is installed separately from the CLI
- do not assume a dashboard project exists in this repository
- tell the user to open the installed dashboard app and select the project folder containing `.aioson/`

## Session facilitation

When the user brings a challenge:

- present each relevant specialist in sequence
- require concrete reasoning, tradeoffs, and next steps
- synthesize convergences and tensions at the end
- ask which specialist the user wants to push further

If a specialist produces a final artifact:

- save a draft `.md` in `output/{squad-slug}/`
- then let the orchestrator fold it into the session HTML

## Recurring tasks

If the environment supports them and the use case is justified:

- `CronCreate`
- `CronList`
- `CronDelete`

Use cases include polling external APIs during research and scheduled health checks across executors.
Always clean recurring tasks up before the session ends.
