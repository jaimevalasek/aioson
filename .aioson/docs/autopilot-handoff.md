---
description: "Autopilot handoff protocol: automatic agent chaining from @analyst to the @dev handoff in the feature workflow, with deterministic routing and explicit stop conditions"
---

# Autopilot handoff (analyst → dev)

Opt-in protocol that removes manual handoff confirmations in the deterministic segment of the feature workflow. Participating agents: `@analyst`, `@scope-check`, `@architect`, `@discovery-design-doc`. Upstream agents (`@briefing`, `@product`, `@sheldon`) always stay manual — they end on genuine human decisions.

## Activation

Autopilot is active only when ALL are true:

1. `project.context.md` frontmatter has `auto_handoff: true` (absent or `false` = manual handoffs, current behavior).
2. A feature workflow is active (feature slug known, classification SMALL or MEDIUM).
3. The current agent's own gate/verdict passed (see stop conditions).

## Routing — deterministic, never LLM-chosen

The next agent comes from the workflow state machine, not from model judgment:

- CLI available: run `aioson workflow:next .` (inspect mode) and use the stage it reports, or the `next` field of `.aioson/context/workflow.state.json`.
- CLI absent: follow the classification sequence in `.aioson/config.md` exactly.

Never skip a stage, reorder, or pick an agent the state machine did not name.

## Auto-invoke pattern

When autopilot is active and no stop condition applies:

1. Finish your own closing duties first (artifacts on disk, gate registration, `pulse:update`, `agent:done`).
2. Emit a one-line transition notice: `Autopilot: @<current> done → invoking @<next> (Ctrl+C to interrupt)`.
3. Invoke `Skill(aioson:agent:<next>)` with the task `"continue feature {slug} — autopilot handoff from @<current>"`. No user prompt — Ctrl+C interrupts.

## Stop conditions — break the chain and emit the normal manual handoff

1. **Next agent is `@dev`** — goal reached. Produce `dev-state.md` (dev handoff producer), emit the standard handoff message, and recommend `/clear` + a fresh chat for `@dev`. Never auto-invoke `@dev`.
2. **Verdict not clean** — `@scope-check` status is anything other than `approved`/`patched` (`needs-*`, `blocked`): route per Handoff Rules, manually.
3. **Gate or readiness blocked** — `@architect` Gate B blocked, or `@discovery-design-doc` readiness = `blocked`: stop and route to the owner.
4. **Context budget** — estimated context usage ≥ `context_warning_threshold` (`.aioson/config.md`): write the compaction checkpoint to `.aioson/context/last-handoff.json`, stop, and recommend `/clear`. The workflow resumes from `workflow.state.json` — the next session re-enters autopilot automatically.
5. **Ambiguity** — workflow state unavailable AND classification/sequence ambiguous, or any real decision requires user input: stop and ask, manually.

The user can interrupt at any time (Ctrl+C); autopilot never retries an interrupted invocation.

## Rationale

Industry-validated design (see `researchs/auto-handoff-pipeline-2026/summary.md`): deterministic routing beats LLM routing; human gates belong where they catch mistakes (pre-analyst and at @dev); every autonomous loop needs explicit exit conditions; per-hop context checkpointing is the load-bearing cost mitigation.
