# Spec-Driven Reference — @dev

> Router file. Do not duplicate logic from the generic references — load those directly.

## Which references to load for implementation

### Always load when this skill is active

- `maintenance-and-state.md` — use to write and update `spec-{slug}.md` correctly: `phase_gates`, `last_checkpoint`, `pending_review`, and `Key decisions` format
- `approval-gates.md` — Gate C (plan approval) must be checked before executing a significant batch; Gate D (execution verification) defines done criteria for each phase
- For SMALL/MEDIUM work, confirm `.aioson/context/design-doc*.md` and `.aioson/context/readiness*.md` exist before implementation starts — produced by `@orchestrator` (maestro mode) on MEDIUM, by `@sheldon` on the SMALL lean lane, or by `@architect` (merged mode) / `@discovery-design-doc` when those detours are in the sequence. Load them only when `dev-state.md`, readiness, the plan, or touched paths require their details.

### Load when starting a new feature with classification context

- `classification-map.md` — use to confirm whether an implementation plan is optional (MICRO), recommended (SMALL), or required (MEDIUM) before starting

### Load when resuming or checking artifact chain

- `artifact-map.md` — use to verify which upstream artifacts exist and which @dev should read before implementing

### Do not load for @dev

- `hardening-lane.md` — @dev activates after hardening; if the spec is still in vibe mode, stop and route back
- `ui-language.md` — load only when producing a checkpoint or gate status presentation for the user

## Spec drift detection

At session start, after reading `spec-{slug}.md`:

1. Compare `spec_version` in `spec-{slug}.md` with the version recorded in `dev-state.md` (`last_spec_version` field)
2. If versions differ:
   > "⚠ Spec changed since last session (version {old} → {new}). Reading the changes before continuing."
   - Read the diff (Key decisions, Entities added, Edge cases sections)
   - Update `dev-state.md` with new `last_spec_version`
3. If versions match: proceed normally

Additionally, at session start for SMALL/MEDIUM:
4. Run `aioson ac:test-audit . --feature={slug} --strict` when the feature completeness contract applies (compatibility mode otherwise), or manually check that each `AC-*` from `requirements-{slug}.md` appears in an asserting test
5. If coverage is < 50%:
   > "⚠ AC coverage is low ({N}/{M} ACs have tests). Consider writing missing tests before adding new behavior."
   This is informational, not blocking.

## Behavioral notes

- `spec-{slug}.md` must be updated at the end of every implementation session — see `maintenance-and-state.md` for format
- Gate C from `approval-gates.md` means the implementation plan is locked — do not re-discuss pre-taken decisions
- Treat `dev-state.md` as the primary activation package and `implementation-plan-{slug}.md` as the source for phase-triggered context loads
- Gate D verification must happen before marking a phase complete — not just "I think it works". The deterministic floor is `aioson ac:test-audit . --feature={slug}` plus the real test command.
- If `phase_gates.plan` is `pending` and classification is SMALL/MEDIUM, suggest generating an implementation plan before proceeding
- If `design-doc.md` or `readiness.md` is missing for SMALL/MEDIUM, route back to their producer instead of coding first — `@orchestrator` (maestro mode) on MEDIUM, `@sheldon` on the SMALL lean lane, or `@architect` (merged mode) / `@discovery-design-doc` when those detours are active
- Load `.aioson/docs/feature-completeness-contract.md` when applicable, build the four-section CAP ledger, and implement/verify each planned `CAP-*`; context minimization may defer detail loads but may not skip an artifact participating in the trace
