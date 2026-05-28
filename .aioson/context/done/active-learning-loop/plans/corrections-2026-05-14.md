---
phase: 1
created: 2026-05-14
status: open
reviewer: qa
slug: active-learning-loop
---

# Corrections Plan — Phase 1 (telemetry-foundation) — 2026-05-14

## Context
QA reviewed Phase 1 (telemetry-foundation) on 2026-05-14. AC coverage: 5/5 ACs (AC-ALL-101..105) Covered. Performance budget met by wide margin (p99 32ms vs 100ms SLA). Zero Critical and zero High findings. Two Medium findings + one Low documented below — none block Gate D PASS, but they are tracked for `@dev` resolution before Phase 4 (doctor-curation-checks) starts consuming this telemetry.

## Mandatory corrections

_None._ No Critical/High findings — Phase 1 is approved for handoff to Phase 2 setup (DD-4 closure + `@dev` Phase 2).

## Optional corrections

### M-01 — `clampPayload` violates BR-ALL-08 contract under pathological inputs
File: `src/commands/context-load.js:72-80`
Problem: `clampPayload` only truncates `target_path` when JSON exceeds 4096 bytes; it never re-measures after truncation and never adds the `"_truncated": true` marker. With an 8KB `target_slug` the persisted `payload_json` measures 8566 bytes (more than 2× the cap) and `_truncated` is absent. This contradicts BR-ALL-08 ("≤4KB ... adicionar `_truncated: true` marker") and EC-ALL-09 ("Doctor queries ignoram payload truncado mas count event para frequency" — Phase 4 doctor checks rely on the marker).
Affected ACs: indirect — AC-ALL-102 passes today because normal slugs are <100 bytes, but Phase 4 doctor staleness queries (`living-memory:rule_staleness`, BR-ALL-08-aware) will produce skewed frequency counts when the payload is silently bloated.
Expected fix:
1. Truncate offending fields in priority order: `target_slug` → `target_path` → `feature_slug`, re-measure JSON byte length after each truncation, stop when `≤ PAYLOAD_BYTE_CAP - len('"_truncated":true,')`.
2. Set `payload._truncated = true` whenever any field was truncated.
3. Update `tests/qa-telemetry-foundation.test.js#QA-BR-08` to assert the desired behavior (`bytes ≤ 4096 && payload._truncated === true`) instead of locking in current behavior.
Severity: Medium — not blocking for Phase 1 sign-off because normal Phase 1 traffic never exceeds 250 bytes/payload, but a real regression risk once Phase 4 consumes the field.

### M-02 — Payload field naming mismatch between requirements doc and spec/AC
File: `.aioson/context/requirements-active-learning-loop.md:135-145` vs `.aioson/context/spec-active-learning-loop.md:30` and `.aioson/plans/active-learning-loop/plan-telemetry-foundation.md:41-42`
Problem: Requirements doc names two payload fields that the spec/AC do NOT include and implementation does NOT emit:
- `loader_agent` (requirements) vs `agent_name` (spec/AC/impl)
- `ts_iso` (requirements) — not present in spec/AC/impl (redundant with `execution_events.created_at` column).
The implementation follows spec/AC (binding for Gate D), so this is a doc drift, not a code bug.
Expected fix: update `requirements-active-learning-loop.md § M2` example payload to match spec exactly (`agent_name`, drop `ts_iso`). Add a one-line note in the @analyst section explaining that `created_at` is the source of truth for event timestamp, not a duplicated payload field.
Severity: Medium — affects future analyst/architect re-reads of the requirements doc when scoping Phase 4 doctor queries.

## Low / informational

### L-01 — `aioson` CLI not on PATH on this development host
Observation: Both `@dev` and `@qa` had to fall back to `node bin/aioson.js` because `aioson` is not on PATH. As a result, none of the workflow CLI integrations ran (`aioson workflow:next --complete=dev`, `aioson workflow:next --complete=qa`, `aioson preflight`, `aioson security:audit`, `aioson agent:done`). Dashboard receives no runtime events for this Phase 1 work.
Impact: zero on code correctness; only loss is runtime telemetry visibility on the developer dashboard.
Fix: out of scope for Phase 1. Either install the CLI globally (`npm link` from this repo) before Phase 2 work, or accept dashboard blindness until the project ships its own internal release. No code change required.

## QA verification artifacts

- `tests/qa-telemetry-foundation.test.js` — 8 new tests covering QA-PERF-01/02, EC-ALL-13/14, EC-ALL-10/02, PMD-1, and BR-ALL-08 current-behavior pin.
- Combined Phase 1 telemetry coverage: 18 tests across two files, all green.
- Stress data: p50=17.7ms, p95=26.0ms, p99=32.1ms, max=78.1ms across 500 sequential calls. Batch mode: 100 events in 100ms (2151 events/s sustained inside a single transaction). Zero drops in either workload.

## Next agent

- Resolution of M-01 and M-02 is recommended (not required) before Phase 4 (doctor-curation-checks) starts, since that phase reads `payload_json` and depends on the `_truncated` filter. `@dev` can fold M-01 into the kickoff of Phase 2 or treat as a follow-up MICRO slice. M-02 belongs to `@analyst` (doc-only).
- Phase 1 is approved for closure. No auto-cycle to `@dev` necessary (no Critical/High).
