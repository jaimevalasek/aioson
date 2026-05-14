---
decision: DD-2
phase: 5
slug: feature-close-distillation-hook
resolved_by: architect
resolved_at: 2026-05-14
status: closed
overrides: analyst_recommendation
---

# DD-2 — Distillation execution mode

**Resolution**: **Foreground com timeout 5s**.

**Behavior**:
- `feature:close` blocks até distillation completar OR timeout (5000ms).
- Timeout via `setTimeout` + `AbortController` propagado para sub-process calls (`pattern:detect`, `learning:auto-promote`).
- Em timeout: UPDATE `evolution_log` row para `event_type='distillation_failed'`, `payload_json={error_phase:'timeout', timeout_ms:5000}`, return.
- Exit code preservado para CI: 0 sempre (hook é best-effort, nunca bloqueia feature:close).

**Why foreground**:
- AIOSON pattern: hooks existentes (`memory:reflect-commit`, `dossier:add-finding`) são foreground com notify-based status updates.
- Article VI Simplicity: zero lock complexity entre processos, zero detached process management cross-platform.
- 2s blocking é UX aceitável; >5s seria. Timeout 5s preserva responsiveness.
- Testability: foreground tem exit code semantics claro; background exigiria event waiting em fixtures.

**Override sobre @analyst recommendation** (que sugeriu background):
- @analyst recommendation focava resilience em CI; foreground sem block timeout 5s preserva resilience.
- Foreground evita: new lifecycle paradigm (background process tracking), DD-3 lock complexity para cross-process, cleanup de detached processes em CI.

**V2 trajectory**: se telemetria mostrar `duration_ms p95 > 3000ms` em uso real, considerar background OR async chunking. V1 não otimiza preventivamente.

**Full reasoning**: see `.aioson/context/architecture-active-learning-loop.md § DD-1..DD-5 resolutions`.
