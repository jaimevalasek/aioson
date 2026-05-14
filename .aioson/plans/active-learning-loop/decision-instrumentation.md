---
decision: DD-1
phase: 1
slug: telemetry-foundation
resolved_by: architect
resolved_at: 2026-05-14
status: closed
---

# DD-1 — Rule/Brain load instrumentation mechanism

**Resolution**: option **(b) CLI verb `aioson context:load`**.

**Signature**:
```
aioson context:load --target=<rule|brain>:<slug> --agent=<name> [--batch="slug1,slug2,..."] [--feature=<slug>]
```

Examples:
```
aioson context:load --target=rule:security-baseline --agent=dev --feature=active-learning-loop
aioson context:load --target=rule --agent=dev --batch="security-baseline,disk-first-artifacts"
aioson context:load --target=brain:dev/patterns/security-001 --agent=dev
```

**Behavior**:
- Tier 1 silent (no stdout output unless `--verbose`).
- Each call emits 1 row em `execution_events` com `event_type='rule_loaded'` ou `'brain_loaded'`, `payload_json` per requirements F1 schema.
- `--batch` emits N events em single transaction; reduces overhead em agentes que carregam múltiplas rules.
- Validates target exists on filesystem before emitting (warn on missing, do not fail).
- `--feature` optional; if absent, reads `pulse:get` for active feature (best-effort).

**Why this option**:
- Brain `sheldon-005`: CLI over direct file write — single source of instrumentation logic.
- Test isolation: instrumentation is a callable verb, mockable em fixtures.
- Harness-agnostic: any agent in any harness invokes the same CLI verb.
- Zero drift: 1 entry point vs 13+ inline instrumentation points em agent .md files.

**Trade-offs accepted**:
- Agents must explicitly emit (not auto-traced via tooling). Drift risk if agent forgets, but it's 1 line per agent vs distributed instrumentation.
- Adds 1 verb to the CLI surface (zero new dependencies; small file).

**Full reasoning**: see `.aioson/context/architecture-active-learning-loop.md § DD-1..DD-5 resolutions`.
