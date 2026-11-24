---
description: "What @dev does with an improvement it notices while building — record it with observe the moment it is seen, never build it, relay it to the owner at the end of the task, and run the owner's choice (add to this feature, Simple Plan, or draft of a future feature) with observation:route."
agents: [dev]
task_types: [improvement, observation, completion]
triggers: [improvement noticed, improvement idea, would be more complete, missing detail modal, nice to have, noticed while building, melhoria percebida, ideia de melhoria, ficaria mais completo, notei durante a implementação, mejora detectada, quedaría más completo]
---

# Improvement radar — what @dev notices while building

A capability is built to the approved CAPs, and building it shows what the CAPs did not say: the listing screen has no way to open one row, the form has no empty state, the export the users will ask for next is one query away. None of it is in scope; all of it is lost when the session ends, or built in passing against "exact scope". The radar keeps it as one line, hands it to the owner at the end of the task, and runs the owner's answer.

## While building — record, never build

When the delivered behavior would be materially more complete with something no CAP, AC or deferred item asks for, record it at once and keep going:

```bash
aioson observe . --kind=idea --summary="<screen or flow> — <what is missing> — <why it completes the capability>" --paths=<files where it showed up>
```

One line in domain words. Worth a line: a counterpart a user reaches for next (detail, edit, delete, undo, search, filter, pagination, export), a missing state (empty, loading, error, no permission) the ACs do not cover, a flow that dead-ends, a consistency gap with a sibling screen, a technical improvement the plan could not justify (shared component, index, cache). Not worth a line: a defect in this feature's own ACs (fix it), something the repository already settles, a preference with no user-visible effect, anything the PRD already lists as deferred or out of scope (cite that instead). Keep to the five that matter most; a sixth replaces the weakest.

Do not build it, widen a CAP, or interrupt the owner mid-task unless it blocks the phase.

## At the end of the task — relay and ask

`aioson workflow:next . --complete=dev` and `aioson agent:done` print an `[Improvements]` block with every open idea this feature recorded (and `[Scope additions]` for approved ones the PRD does not cite yet). Relay it in `interaction_language`, in the completion report, as one short list and one question:

```text
Improvements noticed while building {feature}:
- {OBS-id} {what, one line} — {why it makes the capability more complete}
Where should each go?  1) add to this feature (the PRD is amended first)  2) Simple Plan  3) draft of a future feature  4) drop it
```

The question is an offer, never a gate: if the owner ignores it, or under Autopilot, leave the ideas open (the hub carries them to `feature:close`, nothing is lost), list them in the final summary, and never route one on the owner's behalf.

## Running the owner's answer

Only the owner decides; run exactly that, once per idea:

| Answer | Command | What exists afterwards |
|---|---|---|
| add to this feature | `aioson observation:route . --id=<OBS> --to=feature` | a row in `features/{slug}/scope-additions.md`; **not scope yet** — hand off to `@product` to amend the PRD citing the OBS id, then `@planner`, and only then build it |
| Simple Plan | `aioson observation:route . --id=<OBS> --to=simple-plan` | `simple-plans/{slug}.md`, `status: pending`; `.aioson/docs/dev/simple-plan-lane.md` runs it when the owner starts it |
| draft of a future feature | `aioson observation:route . --id=<OBS> --to=draft` | a `planning` row in `features.md` and `plans/{slug}/idea.md` for `@briefing` |
| drop it | `aioson observation:resolve . --id=<OBS> --as=dismissed --why="<reason>"` | the reason, so a later session does not raise it again |

`--slug` names the destination when the derived one is not right; routing again reuses the same artifact. A routed idea is settled against something that exists — never against the chat — and leaves one line in the Agent Trail of the feature's dossier (best effort), so the next agent that reads the dossier sees the owner's decision.
