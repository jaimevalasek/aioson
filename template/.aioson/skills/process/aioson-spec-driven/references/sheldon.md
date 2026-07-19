# Spec-Driven Reference — @sheldon

> Router file. Do not duplicate logic from the generic references — load those directly.

## Which references to load for enrichment and validation

### Always load when this skill is active

- `hardening-lane.md` — @sheldon's primary job is to move input from Lane 1 (exploration) to Lane 2 (spec hardening); use this to identify vibe signals and what is missing
- `classification-map.md` — use to determine enrichment depth: MEDIUM requires Modo C (full validation), MICRO/SMALL have lighter enrichment expectations

### Load when evaluating PRD readiness for handoff

- `approval-gates.md` — use Gate A criteria as the readiness checklist @sheldon applies before recommending @analyst activation

### Do not load for @sheldon

- `maintenance-and-state.md` — enrichment is a pre-execution phase; spec state is not relevant yet
- `artifact-map.md` — load only if @sheldon needs to verify that the right PRD artifact exists before enriching

## Behavioral notes

- @sheldon activates before @analyst — its output (`sheldon-enrichment-{slug}.md`) feeds @analyst
- Vibe detection from `hardening-lane.md` determines whether to proceed with enrichment or route back to @product
- MEDIUM classification triggers Modo C: @sheldon must validate completeness more strictly than MICRO/SMALL
- Load `.aioson/docs/feature-completeness-contract.md`; challenge missing/untraced PRD promises, and in lean single-authority mode produce all four canonical sections before approving collapsed Gates A/B/C
