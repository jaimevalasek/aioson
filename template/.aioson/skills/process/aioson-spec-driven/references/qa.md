# Spec-Driven Reference — @qa

> Router file. Do not duplicate logic from the generic references — load those directly.

## Which references to load for quality verification

### Always load when this skill is active

- `approval-gates.md` — Gate D (execution verification) defines done criteria; @qa is the external verifier of Gate D claims
- `artifact-map.md` — use to verify that all artifacts claimed by upstream agents actually exist and are substantive

### Load when evaluating AC coverage

- `classification-map.md` — use to calibrate verification depth: MICRO gets happy path + auth only; MEDIUM gets full checklist + invariant tests

### Load when investigating failures or forensics

- `maintenance-and-state.md` — use to read `phase_gates`, `last_checkpoint`, and `pending_review` from `spec-{slug}.md` during forensics mode

### Do not load for @qa

- `hardening-lane.md` — @qa activates after implementation; hardening is not relevant
- `ui-language.md` — @qa produces structured reports, not interactive checkpoints

## Behavioral notes

- @qa is the external verifier of @dev's Gate D self-certification — "I think it works" from @dev is not evidence until @qa confirms
- Gate D verification from `approval-gates.md` maps directly to @qa's adversarial probe protocol: truths = behavior tests, artifacts = file existence checks, key_links = wiring verification
- For MEDIUM projects, @qa should verify that `spec_version` in `spec-{slug}.md` matches the version that @dev was working from — if not, flag as potential drift
- AC coverage mapping in the QA report should use the same `AC-*` format from `requirements-{slug}.md`; run `aioson ac:test-audit . --feature={slug}` and treat missing AC test evidence as Gate D blocked.
