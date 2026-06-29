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

### Exit-code honesty (never auto-deceive)

A gate's verdict is its exit code, not your impression of it:

- **Exit 127 = command not found.** That is a FAILURE, not a pass — a missing
  tool/dependency. Stop and report; never read "no error output" as "no errors".
- **Exit 0 with empty output** on a command that should produce output (a
  typecheck over N files, a test run) means the command did **not** run. Verify
  it actually executed (e.g. the output file exists and is non-empty) before
  trusting it.
- **Exit 124 = timeout.** The command hung — investigate, do not blind-retry.
- When you cite a gate as evidence ("typecheck clean", "smoke passed"), paste the
  exact command, the exit code, and the last lines of output. "exit 0" without
  the command is not evidence.

### Static gate (`SG-*`) — proof per acceptance criterion

`aioson harness:check . --slug={slug}` also evaluates the contract's build-free
**`SG-*`** static criteria (`must_match` / `must_not_match` + parse-check) on
every run — they gate `@dev`-done even before the app builds. When you self-review
an AC backed by an `SG-*` criterion, the evidence **is** the pattern hit: cite the
`file:line` where `must_match` matched. A failing `SG-*` (a missing pattern, a
forbidden `TODO`/`as any`, a truncated file) blocks done exactly like a failing
test — fix the code, never relax the pattern.

### Runtime sub-gate (runtime features — has_api / DB / prototype)

A passing unit suite is not "done" for a feature that ships a backend, a database, or a clickable prototype.
Unit tests mock the DB/auth/network; they prove the parts in isolation, not the whole running app. Before
declaring such a feature done, you must have **run the real stack at least once**:

1. **build** the app (`pnpm build` / `npm run build` / `tsc -p .`) — the whole thing, not a subset
2. **apply** the migrations to a real/ephemeral DB (`prisma migrate reset --force` / `migrate deploy`) — a
   `.sql` file on disk is not an applied migration
3. **boot** server + client; confirm a health probe (`/api/health`) returns 200
4. **drive** the prototype's Core happy-path (create/list/switch/edit/archive of the primary objects) end to
   end on the running stack

If no smoke/boot harness exists, building one is part of the slice — do not substitute a unit test. This is
the same evidence `@qa`'s Runtime smoke gate and the §2c `RG-*` contract criteria require.

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
