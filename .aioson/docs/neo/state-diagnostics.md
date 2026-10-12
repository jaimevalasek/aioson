---
description: Read-only Neo activation diagnostics, hygiene interpretation, and Neural Chain blocker policy
agents: [neo]
task_types: [project-orientation, workflow-status, hygiene-triage]
triggers: [neo activation, what next, where did we stop, project status, pending noises]
---

# Neo State Diagnostics

Use this module on activation. All operations are read-only.

## Fast diagnostics

When `aioson` is available, two reads cover activation; both are read-only and bounded:

- `aioson workflow:status . --json` — the engine's stage, the next official stage, `contractCheck.missing` and the suggestion with its reason (`aioson workflow:next . --status` prints the same preview as text)
- `aioson hygiene:scan .` — text, non-zero buckets only (`--json` lists every item of every bucket; read it only when one bucket must be itemised)

Only for history questions ("where did we stop", "what happened last"): `aioson memory:status .` and `aioson memory:summary . --last=5`.

Failure of an optional diagnostic is not a project blocker. Continue from canonical files and disclose the unavailable signal only if it changes confidence. Measured on a real MEDIUM desktop project: the former four-command activation plus the default `context:brief`, `preflight` and `feature:trace` reads cost about 27,000 input tokens and ten tool calls before the first answer; the two reads above plus the pulse cost about 1,400 tokens of data (3,500 with the kernel), and a concrete request with `feature:current` and the rules-only brief about 4,600, in four CLI calls and 7 s.

## Scan order

Stop expanding once the route is supported:

1. `.aioson/config.md` exists; if absent, stop with `needs_setup`.
2. `.aioson/context/project.context.md` exists and required frontmatter is not blank, `null`, or unresolved `auto`; otherwise `needs_setup` or `needs_setup_repair`.
3. `.aioson/context/project-pulse.md` supplies active feature, last agent, gate, blockers, and recommended action.
4. For a concrete bounded implementation request, apply Simple Plan precedence before checking PRD availability.
5. For a tracked feature, inspect only its PRD, implementation plan, `dev-state.md`, QA report, and `workflow.state.json` as needed.
6. Inspect harness progress and brain index only when an enabled harness or procedural-memory question affects the route.

Canonical bare artifact names resolve under `.aioson/context/`.

## Evidence precedence

Prefer, in order:

1. The engine: `workflow:status` (`state.next`, `contractCheck.missing`, explicit current blocker)
2. Current gate artifact and approval/verdict
3. `dev-state.md` with `status: in_progress`
4. Project pulse
5. Host-provided git snapshot

For a bound feature the engine's next stage is the route; a lower signal that disagrees changes the confidence and the reason, never the agent. The pulse is written by the last agent and goes stale the moment an authority changes (a PRD, a plan, `project.context.md`), while the engine re-reads the hash-bound reviews every time: on a real project the pulse said "Gate C approved, @dev" while the engine said "@sheldon: the Sheldon review is stale for the current PRD/authorities" because `project.context.md` had been edited after the review. `preflight`'s phase gates read frontmatter markers only and can say READY in that same state; they never override the engine. Objectively inferable stale context may be repaired only by the workflow owner, never by Neo.

## Neural Chain impact queue

The authoritative state is `chain_work_items` in `.aioson/runtime/aios.sqlite`; `.aioson/context/noises/{feature}.md` is its human-readable projection. Legacy timestamped noise files are imported by `aioson chain:reconcile .`.

- Report actionable items by feature, status, owner, and pending count.
- Recommend `@dev` for new work or when resuming active implementation; they claim items atomically before touching targets.
- An item means “inspect this causal relationship,” not “edit this file.” `verified_no_change`, `false_positive`, and `obsolete` are valid evidence-backed resolutions.
- Do not route an item already claimed by another run. Expired claims return to the queue automatically.
- Unrelated work is not globally blocked. The queue remains visible implementation debt until resolved or explicitly made obsolete.
- Manual `- [x]` remains compatible and becomes `verified_no_change` during reconciliation.

## Hygiene

Summarize only non-zero actionable buckets from `hygiene:scan`:

- pending Neural Chain noises
- stale resolved Neural Chain projections
- completed features pending archive
- features ready to close (QA passed, row still open), stale open/paused features, status spellings no reader matches
- stale state
- stale runtime sessions/runs
- on-demand review artifacts
- orphan slug artifacts
- heavy or orphan evidence artifacts (runtime captures, walkthrough snapshots — regenerable; `runtime-storage.md` names the prune)
- disk footprint (doc snapshots or rollback folders past retention, oversized logs, heavy paths the framework cannot regenerate)

No hygiene bucket authorizes cleanup. Ask one focused question only when cleanup materially blocks the next route.
When feature-lifecycle buckets are non-zero, the dashboard Hygiene line shows their counts and offers the guarded
cleanup in `feature-lifecycle.md`; `disk_footprint` does the same with the disk-footprint cleanup in
`runtime-storage.md`. Either runs only after the operator accepts.

## Dashboard evidence

The dashboard must distinguish:

- confirmed state
- inferred state
- unavailable signal

Never turn a clean working tree into proof that implementation or QA is complete. Never turn modified files into proof that implementation is active without feature-state evidence.
