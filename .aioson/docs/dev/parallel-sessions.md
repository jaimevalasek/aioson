---
description: "Two chats open on one project folder — what they share (the working tree, the workflow binding, the project-level dev-state), what already keeps them apart, and the two ways to isolate them (an own live session per chat, or a git worktree per chat). Read when a gate blocks with implementation_changed_during_checks, workflow:next says Workflow binding mismatch for a feature another chat moved, or dev:resume-data returns ambiguous open_threads."
agents: [dev, neo]
task_types: [continuity, parallel-work, recovery]
triggers: [two chats, another chat open, other chat, second chat, same folder, parallel sessions, parallel chats, concurrent edit, concurrent session, implementation_changed_during_checks, workflow binding mismatch, ambiguous open_threads, git worktree per chat, dois chats, outro chat, chat ao lado, mesma pasta, em paralelo, sessões em paralelo, outra sessão, dos chats, otro chat, misma carpeta, en paralelo]
---

# Parallel sessions — two chats on one folder

One folder is one working tree, one git index, one `HEAD`, and one `.aioson/`. Two chats on it share all of that, whatever parts of the system they touch: the shared things are per project, not per area.

## What they share, and what already holds

| State | Two plain chats on one folder | What keeps them apart |
|---|---|---|
| Working tree, index, `HEAD` | One. Every changed-files measurement (`delivery:parity` at `agent:done`, the technical gate's fingerprint, `rules:check --changed`, `commit:prepare`) sees both chats' edits. | Only a worktree per chat. |
| `project-pulse.md` `active_feature` and the workflow binding | One per project: the chat that runs `pulse:update --feature=<slug>` moves it for both, and the other's `workflow:next --expect-feature=<its slug>` aborts with `Workflow binding mismatch`. | `live:start --own-session --feature=<slug>` (a binding per session) or a worktree. |
| Project-level `dev-state.md` | A copy of whichever chat wrote last. | `features/<slug>/dev-state.md` is per thread; read it with `dev:resume-data --feature=<slug>`. |
| `features.md` | One writer, locked. | Already safe. |
| A Simple Plan | Never touches the binding, the pulse or `workflow:next`. | Already safe: the cheapest way to run a second chat beside a feature. |

## The three signals

- `implementation_changed_during_checks` now names what moved: `source_change.paths` (and `head_changed` when a commit or checkout happened) in the gate result, and the same line in the blocked message. The check itself, another chat, or another tool wrote there. Paths you did not write are the other chat's: **never revert them to make the gate pass**. Re-run when the other chat settles.
- `workflow:next` `Workflow binding mismatch` names who last wrote the pulse (`last_agent`, `active_work`, `last_updated`). If it is the other chat, do not run `pulse:update` to take the binding back: that moves it away from the other chat in turn. Pick one of the two isolations below.
- `dev:resume-data` returns `ambiguous: true` with `open_threads` when this chat names no feature and more than one dev thread was written in the last 7 days. Ask the owner which thread this chat continues. The newest is only the last chat to write.

## Rules for a chat on a shared tree

- Name your feature on every command that takes one (`--feature`, `--expect-feature`); never rely on the pulse or the project-level `dev-state.md`.
- Stage explicit paths (`git add -- <your files>`), then `commit:prepare . --staged-only`. Never `git add -A`, and never `git stash`, `git checkout -- .`, `git clean` or `git reset --hard` here: they take the other chat's uncommitted work.
- A second chat for a bounded fix: Simple Plan. Two tracked features at once, or a long test suite while the other chat edits: isolate.

## Isolation 1 — an own session per chat

Launch each chat through its own live session, so the feature binding, the pulse feature and the resume belong to the session:

```
aioson live:start . --tool=<tool> --agent=<agent> --session=<name> --own-session --feature=<slug>
```

This separates the workflow binding and the resume. It does not separate the working tree: the gate block and the shared git state above still apply.

## Isolation 2 — a git worktree per chat

A worktree is a second checkout of the same repository: its own files, index, `HEAD` and `.aioson/`. aioson treats a git checkout as a project of its own, so the pulse, the binding, `feature:current` and `dev-state` of the worktree never touch the main folder's (measured: a `pulse:update` in the worktree left the main folder's pulse and `git status` unchanged).

```
git worktree add ../<project>-<name> -b work/<name>
```

Open the second chat in `../<project>-<name>`. Then:

- Use a short sibling path: deep paths hit the Windows path limit.
- Only what git tracks follows the branch. `node_modules`, `.env` and every untracked or ignored file do not: install again or link them (on Windows `mklink /J node_modules ..\<project>\node_modules`), and copy the untracked config the chat needs.
- Merge back from the main folder: `git merge work/<name>`. If `features.md` or `project-pulse.md` is tracked and both sides changed it, keep both feature rows and the main folder's pulse.
- Clean up: `git worktree remove ../<project>-<name>` and `git branch -d work/<name>`.

## When not to isolate

Same feature, one chat after the other: nothing to do. A single quick fix that fits a Simple Plan and a feature that does not run long checks: the Simple Plan lane plus explicit staging is enough.
