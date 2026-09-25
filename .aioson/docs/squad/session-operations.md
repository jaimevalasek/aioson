---
description: "Squad session operations — ephemeral squads, investigation, inter-squad routing, learnings, dashboard guidance, and recurring tasks."
agents: [squad]
task_types: [session, operations]
triggers: [squad session, ephemeral, learnings]
---

# Squad Session Operations

Use this module for ongoing orchestration and maintenance concerns around the squad.

## Run, inspect and resume

- Start: `aioson squad run . --squad=<slug> --goal="<delivery>"`.
- Inspect: `aioson squad status . --squad=<slug> --session=<id> --json`.
- Resume: `aioson squad resume . --squad=<slug> --session=<id>`.
- Existing `squad:autorun --plan=<id>` and `squad:status --session=<id>` use the same portable session plan. Resume requires the original ID; a new goal starts a new operation.
- Status includes the goal, task counts, blockers, execution evidence, known budget usage and next action. `ok` on a query means the query succeeded, not that the work completed. `prepared` means no execution has been confirmed.
- Process ownership is checked locally when a session says running. Missing/unknown owners require reconciliation, not automatic replay. Remote process ownership cannot be verified locally. Heartbeat is unavailable (`null`) until a timestamp is actually recorded; never invent freshness.
- Retrying an interrupted external effect requires reconciliation. Completed tasks remain accepted and are not rerun by resume.
- Successful worker output is preserved in session `deliveries/<sha256>.json`; the accepted task references its exact snapshot in `result.delivery_evidence`, also exposed by status. Candidates from unsuccessful reviews remain candidates; a snapshot alone never grants acceptance. If snapshot persistence fails, the task stays unverified.
- These snapshots preserve the returned value, including long content and structured receipts. Paths inside that value still refer to external files: their contents are not implicitly backed up. Verify referenced files separately and do not claim semantic correctness from a hash.

## Localized revision

`aioson squad revise . --squad=<slug> --session=<accepted-id> --tasks=<id,id> --feedback="<requested change>"` prepares a new session. It requires a completed source session with verified output snapshots. The original plan and accepted outputs remain unchanged; only selected tasks and their transitive dependents become pending. Preparation executes nothing: inspect the affected task list, then use the returned resume command.

Workers receive `revision_context` (feedback and previous snapshot), `dependency_deliveries` (current dependency snapshots) and `project_dir` to resolve references. Honor the requested change and preserve unrelated content. A dependent output stays pending until regenerated and accepted. Revision reuses the original event context without claiming new events. External files/effects still require domain-specific controls; do not infer that a saved JSON response backs up a file or permits replaying a payment or publication.

## Evidence by delivery type

- Content: retain source references next to factual claims, the requested voice/format and the accepted full text. Missing or conflicting sources stay explicit. Revise a bounded task, preserve unaffected content and regenerate dependent formats. A hash or word count does not evaluate factual or editorial quality.
- Processes: retain event identity, consumer, attempts, effect receipt and exception/reconciliation evidence. Inspect uncertain external effects before retrying. Daemon deliveries can be inspected with `squad:daemon --sub=deliveries --squad=<slug>` and reconciled with `--sub=reconcile --delivery=<key> --resolution=retry|completed|failed --evidence="<checked receipt or reason>"`. Reconciliation requires observed evidence.
- Software: include an executable verification task that depends on implementation, runs the actual entry point with representative input and fails on an unexpected exit/output. Return the command, observed exit/output and artifact references. File existence and an implementation worker's narrative cannot replace this check. A failed verifier keeps the session incomplete. After repair, explicitly rearm the safe verification task using the plan-store task update API; resume preserves accepted independent work and does not automatically retry failed effects.

Use the existing worker/acceptance contracts for these checks. Semantic judgments require an identified reviewer/evaluator; unknown criteria remain unverified. Do not add presentation-only workers to prove delivery. Publish only under the user's existing authorization.

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

- involve specialists only when their distinct contribution is needed
- require concrete reasoning, tradeoffs, and next steps
- synthesize convergences and tensions at the end
- continue the authorized work; ask for a decision only when it changes the outcome

If a specialist produces a final artifact:

- save a draft `.md` in `output/{squad-slug}/`
- reference the artifact from the session record; update an existing HTML view when the delivery contract calls for it

## Recurring tasks

If the environment supports them and the use case is justified:

- `CronCreate`
- `CronList`
- `CronDelete`

Use cases include polling external APIs during research and scheduled health checks across executors.
Always clean recurring tasks up before the session ends.
