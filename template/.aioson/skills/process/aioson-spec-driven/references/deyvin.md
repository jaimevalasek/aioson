# Spec-Driven Reference — @deyvin

> Router file. Do not duplicate logic from the generic references — load those directly.

## Which references to load for continuation and resume flows

### Activation-only sessions

If the user only activates `@deyvin` without a concrete task, stop after the lightweight context summary from `context:select`. Do not load this reference's downstream files.

### Load only for concrete continuation

- `maintenance-and-state.md` — load when the concrete task requires reading or writing `spec*.md`, `last_checkpoint`, or `pending_review`
- `approval-gates.md` — load when the next action could cross a phase gate, approve/deny readiness, or continue implementation past Gate C/D

### Load when the continuation context is unclear

- `artifact-map.md` — use to quickly orient which artifacts exist and which are missing after a concrete continuation task names a feature but the selected artifacts contradict each other

### Do not load for @deyvin

- `hardening-lane.md` — by the time @deyvin is active, the spec pack should already be hardened
- `classification-map.md` — classification was set in the spec and should not be re-evaluated during continuation
- `ui-language.md` — load only when producing a checkpoint or gate status presentation for the user

## Behavioral notes

- `last_checkpoint` in `spec-{slug}.md` is the first thing @deyvin reads only after a concrete continuation task selects that spec — see `maintenance-and-state.md` for format
- Do not re-read the full spec pack unless `last_checkpoint` is null or contradictory
- `phase_gates` from `approval-gates.md` defines what is locked — @deyvin does not re-open locked decisions
- `pending_review` items must be surfaced to the user before proceeding past them
