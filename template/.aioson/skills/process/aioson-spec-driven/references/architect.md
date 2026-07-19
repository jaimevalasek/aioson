# Spec-Driven Reference — @architect

> Router file. Do not duplicate logic from the generic references — load those directly.

## Which references to load for architecture work

### Always load when this skill is active

- `classification-map.md` — use to determine architecture depth: MICRO skips most of this, MEDIUM requires full `architecture.md`
- `approval-gates.md` — Gate B criteria define what @architect must produce before @dev can start; Gate A must already be passed before @architect begins
- `artifact-map.md` — use to confirm which artifacts @architect owns (`architecture.md`, `design-doc*.md`) and which feed into it

### Do not load for @architect

- `hardening-lane.md` — input is expected to be already past vibe mode when @architect is activated
- `maintenance-and-state.md` — this is for execution/continuation sessions

## Behavioral notes

- Classification depth from `classification-map.md` controls whether `architecture.md` is required, selective, or skippable
- Gate B is the handoff signal — @dev must not start implementation without Gate B passing (MEDIUM) or being explicitly waived (SMALL)
- Decision rationale is mandatory for non-obvious choices — `approval-gates.md` Gate B checklist item applies
- `design-doc*.md` is @architect's scope-specific decision document — see `artifact-map.md`
- `architecture.md` should include dev context triggers so @dev knows when to load architecture sections instead of reading the full file at activation
- Load `.aioson/docs/feature-completeness-contract.md`; own `## Implementation Leverage Matrix`, inspect installed packages/framework facilities/existing modules, and block Gate B when a required CAP lacks evidence plus a target
