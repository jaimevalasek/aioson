---
description: Read-only Neo activation diagnostics, hygiene interpretation, and Neural Chain blocker policy
agents: [neo]
task_types: [project-orientation, workflow-status, hygiene-triage]
triggers: [neo activation, what next, where did we stop, project status, pending noises]
---

# Neo State Diagnostics

Use this module on activation. All operations are read-only.

## Fast diagnostics

When `aioson` is available, run these in parallel:

- `aioson memory:status .`
- `aioson memory:summary . --last=5`
- `aioson workflow:next . --status`
- `aioson hygiene:scan . --json`

Failure of an optional diagnostic is not a project blocker. Continue from canonical files and disclose the unavailable signal only if it changes confidence.

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

1. Explicit current blocker or workflow state
2. Current gate artifact and approval/verdict
3. `dev-state.md` with `status: in_progress`
4. Project pulse
5. Host-provided git snapshot

If two authoritative signals conflict, recommend the owner that can repair the state rather than guessing. Objectively inferable stale context may be repaired only by the workflow owner, never by Neo.

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
