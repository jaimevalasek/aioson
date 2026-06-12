---
description: "Dev execution discipline — semantic commits, learnings, task tracking, planning, atomic execution, verification gates, skeleton updates, and debugging."
agents: [dev, deyvin]
task_types: [implementation, execution]
triggers: [implementing slices, execution discipline, commit cadence]
---

# Dev Execution Discipline

Load this module when the work is multi-file, ambiguous, near completion, or requires repeated verification.

## Semantic commit format

Use:

- `feat(module): ...`
- `fix(module): ...`
- `refactor(module): ...`
- `test(module): ...`
- `docs(module): ...`
- `chore(module): ...`

## Session learnings

At the end of productive sessions, look for:

- user corrections
- repeated successful patterns
- new domain facts
- quality failures or bugs

Capture only the top 3 to 5 concise learnings in `spec.md` under session learnings.

## Working memory

Use task tooling when available:

- `TaskCreate` — create slices
- `TaskUpdate (in_progress)` — mark in-progress
- `TaskUpdate (completed)` — mark completed with a one-line summary
- `TaskList` — review before starting new slices

`dev-state.md` is the persistent human-readable summary, not the live task board.

## Self-directed planning

Before ambiguous or multi-file work:

1. declare planning mode
2. list touched files and why
3. sequence the implementation
4. define verification criteria
5. exit planning mode before coding

Single-file, obvious changes do not need a full planning pass.

## Working rules

- reuse skills before reinventing patterns
- load detailed skills and docs on demand
- decide the minimum context package before coding
- stop if a recurring pattern already exists in `.aioson/skills/static/` or `.aioson/installed-skills/`

## Atomic execution

Work in small validated steps:

1. declare the next step
2. write the test first when business logic is new
3. implement only that slice
4. verify with the actual command output
5. commit the working slice
6. repeat

Unexpected output means stop and investigate. Do not stack speculative fixes.

## Done gate

Before marking any task or feature done:

1. run the verification command
2. read the complete output
3. confirm exit code `0`
4. only then mark done

Update `skeleton-system.md` whenever files are created, deleted, or materially changed.

## `*update-skeleton`

If the user types `*update-skeleton`, rewrite `.aioson/context/skeleton-system.md` to reflect:

- file map status
- module status
- key routes
- update date

## Debugging

If a failing issue survives one attempt:

- stop random fixing
- load `.aioson/skills/static/debugging-protocol.md`
- follow the protocol from root-cause analysis onward

After 3 failed attempts on the same issue, question the architecture instead of pushing patches blindly.

## Git worktrees

For SMALL or MEDIUM work, consider `.aioson/skills/static/git-worktrees.md` if the user wants a cleaner parallel workflow.
