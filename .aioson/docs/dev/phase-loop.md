---
description: "Lean DEV phase loop — focused checks, a phase:next checkpoint per phase (next phase here or in a new session), one post-DEV QA."
agents: [dev]
task_types: [implementation, verification]
triggers: [phase loop, auto-continue phases, implementation checkpoints, phase:next, new session per phase]
---

# Lean DEV phase loop

Use this loop when `implementation-plan-{slug}.md` contains more than one vertical phase. A clean phase checkpoint never asks the user to continue and never launches QA early; `phase:next` (step 5) decides whether the next phase runs here or in a new conversation.

## Starting a phase in a new context

A Dev that starts fresh on a phase — from a `phase:next` kickoff, `aioson session:kickoff . --agent=dev --feature={slug} --phase={n}`, or after compaction — compiles the capsule before reading the plan or the PRD:

```bash
aioson dev:resume-data . --feature={slug} --phase={n} --capsule
```

It carries the phase, the PRD rows it cites, what the branch already created (check it before writing a helper), the feature's open process/risk observations, and the plan's shared sections scoped to this phase. Open the full plan or PRD only for what it leaves out.

## After each phase

1. Run the phase's focused automated command and production-path check. A dev server is not the production path: iterate on it if the plan names only one, then repeat the flows on the served build before calling the phase verified, and report the plan's gap. A `Runtime` line is a walkthrough under `.aioson/qa/walkthroughs/{slug}/`, run with `aioson browser:run` (write it once from `.aioson/docs/qa/browser-walkthrough.md`; log a seeded account in once with `--save-state`, start the others with `--state`). Write your own browser script only for what the instrument cannot express.
2. Check the project rules against what the phase wrote: `aioson rules:check . --changed`. A `HIGH` is a rule being broken and outranks the PRD, the plan, and any dossier deviation: fix it now or stop and report the conflict for a human to resolve on the rule file (it blocks the stage gate later anyway). With `divergence`, the tree already followed another convention: do not migrate or baseline; present the options the command prints. A `LOW` `duplicate-declaration` names an existing helper: import it and delete the copy, or say in the phase report why it stays.
3. Fix a failing check before advancing. Stop only after the configured retry limit or for a genuine product/security decision.
4. Update the dossier evidence and write the checkpoint (`--feature` and `--next` are required; `--phase` is the phase just finished):

   ```bash
   aioson dev:state:write . --feature={slug} --phase={n} --next="{next concrete step}" --context=prd,impl-plan 2>/dev/null || true
   ```

   Asked how long the rest will take, answer from `aioson dev:progress . --feature={slug}` (it projects from these stamps once two real intervals exist); without a measure, say so.
5. Close the phase (the last one waits for the end of DEV, below) with what only this conversation knows — decisions, rejected options and gotchas not already in the code, `dev-state.md` or the dossier; `--note=none` when there are none:

   ```bash
   aioson phase:next . --feature={slug} --finished={n} --note="{decisions not on disk}" --json
   ```

   It refuses a phase the plan does not have, records the note in the dossier Agent Trail, and returns `next_phase` (or `next_stage: qa`), `policy`, `kickoff` and `directive`. Do what `directive` says:

   - `auto` — end the reply with one sentence: phase {n} is done and the Play continues with the next one. Then stop. Do no further work in this conversation, not even the next phase's preflight.
   - `suggest` — continue in this conversation, and quote `kickoff` once so the person can restart in a new conversation instead.
   - `off` — continue in this conversation.

   The checkpoint is crash recovery and the next conversation's starting point, never a handoff or approval gate.

## After the last phase

Run the full relevant build/tests and production-path smoke once, then `aioson verification:plan . --feature={slug} --trigger=end-of-feature`. Complete the DEV stage as the kernel says, through `agent:done`, and only then run step 5 for the last phase, adding the `--auto` or `--step` this activation was given. It returns `next_stage: qa`, and that handoff follows Autopilot: with Autopilot off the `directive` stops DEV here and quotes the QA kickoff for the person; with it on, under `auto`, QA starts in a new conversation with its own kickoff and never inherits this one.

QA is the only default reviewer; Tester, Pentester, and Validator join only when explicitly enabled in `agent-execution-{slug}.json`, never by classification or phase count. Split development lanes follow `.aioson/docs/dev/execution-lanes.md`. Small project, small solution: no per-phase QA loop, no synthesized spec checkpoint, and no mandatory harness unless the approved plan deliberately requires one.
