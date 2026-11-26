---
description: "Two chats open on one project folder — what they share (the working tree, the workflow binding, the project-level dev-state), what already keeps them apart (each host chat keeps its own feature), and the two ways to isolate them (an own live session per chat, or a git worktree per chat). Read when a gate blocks with implementation_changed_during_checks, workflow:next says Workflow binding mismatch for a feature another chat moved, feature:current returns held_by_other_chat, or dev:resume-data returns ambiguous open_threads."
agents: [dev, neo]
task_types: [continuity, parallel-work, recovery]
triggers: [two chats, another chat open, other chat, second chat, same folder, parallel sessions, parallel chats, concurrent edit, concurrent session, implementation_changed_during_checks, workflow binding mismatch, ambiguous open_threads, held_by_other_chat, git worktree per chat, dois chats, outro chat, chat ao lado, mesma pasta, em paralelo, sessões em paralelo, outra sessão, dos chats, otro chat, misma carpeta, en paralelo]
---

# Parallel sessions — two chats on one folder

One folder is one working tree, one git index, one `HEAD`, and one `.aioson/`. Two chats on it share all of that, whatever parts of the system they touch: the shared things are per project, not per area.

## What they share, and what already holds

| State | Two plain chats on one folder | What keeps them apart |
|---|---|---|
| Working tree, index, `HEAD` | One. Every changed-files measurement (`delivery:parity` at `agent:done`, the technical gate's fingerprint, `rules:check --changed`, `commit:prepare`) sees both chats' edits. | Only a worktree per chat. |
| `project-pulse.md` `active_feature` | One file per project: the chat that runs `pulse:update --feature=<slug>` last rewrites it. | Each chat answers from its own record (below): `feature:current`, `context:select`/`context:brief`, `dev:resume-data`, the observation tag and `workflow:next` read the chat's feature before the pulse. |
| The workflow binding (`workflow.state.json`) | One per project: it follows the feature of the chat that runs `workflow:next --expect-feature=<slug>`, and the other feature's progress waits archived under `features/<slug>/workflow.state.json` until its chat runs `workflow:next` again. | Already safe, as long as each chat names its feature. |
| Project-level `dev-state.md` | One front open: its copy. Two or more written within 7 days: their index (`kind: open-fronts-index`, no `active_feature`), rewritten at every `dev:state:write`. | `features/<slug>/dev-state.md` is per front; `context:brief --feature=<slug>` binds that one for @dev, never the other chat's. |
| `features.md` | One writer, locked. | Already safe. |
| A Simple Plan | Never touches the binding, the pulse or `workflow:next`. | Already safe: the cheapest way to run a second chat beside a feature. |

## Each chat keeps its own feature

The host tells every command it runs which chat it belongs to, and aioson keeps one record per chat in `.aioson/runtime/chats/<key>.json`. A command that names a feature (`--feature`, `--expect-feature`) writes it.

| Host | Variable | One chat is |
|---|---|---|
| Claude Code | `CLAUDE_CODE_SESSION_ID` | one conversation |
| Codex | `CODEX_THREAD_ID` | one thread |
| agy (Antigravity) | `ANTIGRAVITY_CONVERSATION_ID` | one conversation |
| OpenCode | `OPENCODE_PID` | one OpenCode window (it exports no session id, so a new session inside the same window is the same chat) |

- A host started from another one inherits that host's variable and adds its own. The record is keyed by all of them together, so the inner chat never takes the outer chat's feature.
- A chat that named no feature, while another chat named the pulse's feature in the last 12 hours, gets `ambiguous: true` with `held_by_other_chat` from `feature:current`, and no feature from `context:select`. Ask the owner which feature this chat continues, then name it.
- A terminal no host names, or a host not in the table, still reads the pulse. `live:start` sessions keep their own feature as before, ahead of the chat record.
- `pulse:update` still rewrites the pulse. When the feature it replaces is another chat's, the output says so (`other_chat`): that chat keeps its own feature.

## The three signals

- `implementation_changed_during_checks` now names what moved: `source_change.paths` (and `head_changed` when a commit or checkout happened) in the gate result, and the same line in the blocked message. The check itself, another chat, or another tool wrote there. Paths you did not write are the other chat's: **never revert them to make the gate pass**. Re-run when the other chat settles.
- `workflow:next` `Workflow binding mismatch` names who last wrote the pulse (`last_agent`, `active_work`, `last_updated`). On the four hosts above it only happens to a chat that named no feature: pass `--expect-feature=<your slug>`. Elsewhere, if it is the other chat, do not run `pulse:update` to take the binding back: that moves it away from the other chat in turn. Pick one of the two isolations below.
- `dev:resume-data` returns `ambiguous: true` with `open_threads` when this chat names no feature and more than one dev thread was written in the last 7 days. Ask the owner which thread this chat continues. The newest is only the last chat to write.
- After a compaction the checkpoint names the front this chat's own commands named (`Feature: <slug>`) and lists `Other fronts open in this folder` as the other chat's work. `Open fronts in this folder … named none` means this chat never named one: ask before editing.

## Rules for a chat on a shared tree

- Name your feature on every command that takes one (`--feature`, `--expect-feature`): that is what writes this chat's record. Never rely on the pulse or the project-level `dev-state.md`.
- Stage explicit paths (`git add -- <your files>`), then `commit:prepare . --staged-only`. Never `git add -A`, and never `git stash`, `git checkout -- .`, `git clean` or `git reset --hard` here: they take the other chat's uncommitted work.
- A second chat for a bounded fix: Simple Plan. Two tracked features at once, or a long test suite while the other chat edits: isolate.

## What the host shows is not who wrote

A host that diffs the tree around a shell command (Claude Code does) shows every file that changed while the command ran as that command's own edit, the other chat's edits included. A chat running a long test suite or build therefore looks like it is editing the other chat's feature when it is not. Before saying a chat took over another's work, check what it wrote itself: its own Write/Edit calls, and `git diff` against the other chat's plan.

## Isolation 1 — an own session per chat

On a host the table above does not list, launch each chat through its own live session, so the feature binding, the pulse feature and the resume belong to the session:

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
