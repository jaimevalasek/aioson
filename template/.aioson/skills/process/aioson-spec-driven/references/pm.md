# Spec-Driven Reference — @pm

> Router file. Do not duplicate logic from the generic references — load those directly.

## Which references to load for backlog and delivery planning

### Always load when this skill is active

- `approval-gates.md` — @pm owns Gate C; use it to know exactly what must be true before `phase_gates.plan` can be set to `approved` and before handing off to @dev or @orchestrator
- `classification-map.md` — use to calibrate sprint sizing and decide how many delivery phases are appropriate for MICRO/SMALL/MEDIUM

### Load when plan structure is ambiguous

- `artifact-map.md` — use to understand which artifacts @pm may read (prd, requirements, spec, architecture) vs. which it must not overwrite (@analyst's requirements, @architect's architecture)
- `maintenance-and-state.md` — use when retaking a sprint session or checking if a spec-{slug}.md checkpoint needs updating before continuing

### Do not load for @pm

- `hardening-lane.md` — @pm receives hardened input from @product and @analyst; if input is still vague, send it back upstream, do not harden it yourself
- `qa.md` — Gate D belongs to @qa, not @pm

## Behavioral notes for @pm under SDD

- @pm is the **Gate C owner** — the plan is not complete until `spec-{slug}.md` has `phase_gates.plan: approved` and `implementation-plan-{slug}.md` (if MEDIUM) has `status: approved`
- Gate C is **blocking in MEDIUM** — @dev and @orchestrator must not execute without Gate C passing
- The implementation plan's context package must stay short at activation and list phase-triggered loads separately; @dev should not need to re-read the whole artifact chain to start
- Gate C is **informational in SMALL** — flag if the plan looks thin, but do not block
- Gate C is **skipped in MICRO** — @dev reads prd.md directly; @pm does not run for MICRO
- ACs produced by @pm must match or extend the ACs in `conformance-{slug}.yaml` when it exists — never contradict the analyst's behavioral contracts
- @pm adds delivery phases and prioritization; it does NOT rewrite Vision, Problem, Users, or Flows — those belong to @product
- At session end, always tell the user explicitly: "Gate C passed — activate [@orchestrator / @dev]" OR "Gate C blocked — [reason]"
- Load `.aioson/docs/feature-completeness-contract.md`; own `## Capability Delivery Plan` and block Gate C when any required CAP lacks one phase, concrete file paths, or executable verification
