# Spec-Driven Reference — @product

> Router file. Do not duplicate logic from the generic references — load those directly.

## Which references to load for PRD and feature scoping

### Always load when this skill is active

- `classification-map.md` — use to declare MICRO/SMALL/MEDIUM at the start of scoping; classification controls PRD depth, whether a `## Specify depth` section is required, and which downstream phases are mandatory
- `artifact-map.md` — use to understand what @product's PRD feeds into downstream; helps scope the PRD correctly without over-specifying what belongs to @analyst or @architect

### Load when input is still ambiguous or exploratory

- `hardening-lane.md` — use to detect if the request is still in vibe mode and needs more discovery before a PRD can be written

### Do not load for @product

- `approval-gates.md` — @product produces the PRD; Gate A is evaluated by @analyst after @product hands off
- `maintenance-and-state.md` — this is for execution/continuation sessions

## Behavioral notes

- Classification (MICRO/SMALL/MEDIUM) from `classification-map.md` must be declared in the PRD — it is the signal that controls all downstream process depth
- @product does not write requirements (`requirements-{slug}.md`) — those belong to @analyst; see `artifact-map.md` for the boundary
- If classification is MEDIUM, the PRD must include a `## Specify depth` section per `classification-map.md`
- For substantive SMALL/MEDIUM features, load `.aioson/docs/feature-completeness-contract.md`, set `feature_completeness: required`, and own the PRD `## Feature Capability Map`; downstream roles own the other three sections
