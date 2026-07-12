---
gate_execution: approved
slug: agent-execution-dispatcher
classification: MEDIUM
status: implemented_pending_qa
spec_version: 1
gate_requirements: approved
gate_design: approved
gate_plan: approved
phase_gates:
  requirements: approved
  design: approved
  plan: approved
  execution: pending
last_checkpoint: "2026-07-10 — dev phases 1–6 implemented; 18/18 AC traced; QA pending"
---

# Spec — Agent Execution Dispatcher

## Goal

Executar o pipeline de agentes com host/modelo/mode configurados e verificáveis, mantendo seleção, estado e execução como contratos separados.

## Traceability

- REQ-AED-01, REQ-AED-02, REQ-AED-03 → AC-AED-01, AC-AED-02, AC-AED-03
- REQ-AED-04 → AC-AED-04, AC-AED-05, AC-AED-14, AC-AED-15
- REQ-AED-05, REQ-AED-06, REQ-AED-07 → AC-AED-06, AC-AED-07, AC-AED-08, AC-AED-09, AC-AED-16
- REQ-AED-08, REQ-AED-09 → AC-AED-10, AC-AED-11, AC-AED-12, AC-AED-13
- REQ-AED-10, REQ-AED-11, REQ-AED-12 → AC-AED-15, AC-AED-16, AC-AED-17, AC-AED-18

## Decisions

- Manifesto: `.aioson/context/agent-execution-{slug}.json`.
- Configuração válida não promete capacidade em tempo real.
- Capability ausente pausa; nunca simula subagente/fresh-session.
- O fluxo legado permanece somente quando o manifesto está ausente, não quando inválido.
- Gate D e fechamento permanecem fora deste pacote.

## Must haves

Todos os 18 ACs do requirements, arquitetura sem dupla autoridade, plano em seis fases e harness contract binário.

## Open decisions

Nenhuma decisão de produto ou arquitetura bloqueante.

## Implementation checkpoint — 2026-07-10

- Added the versioned manifest, schema, additive merge/digest, report validation and atomic persistence.
- Added honest Claude/Codex/OpenCode capability adapters; native capabilities default to unavailable and external execution uses structured argv with `shell:false`.
- Added `agent:execution:init|validate|show|dispatch|resume` and integrated manifest resolution into verification planning and workflow seeding.
- Preserved legacy behavior when no manifest exists; invalid manifests block rather than falling back.
- Updated managed Product/Dev/autopilot contracts to consume the dispatcher and pause on missing capability.
- Gate D remains pending independent QA, tester/pentester and validator review.

## Security correction checkpoint — 2026-07-10

- Bound every report to the registered feature/run/attempt/agent/host/model/manifest digest and eligible attempt status; duplicate report creation is rejected.
- Added per-feature exclusive leases with owner tokens, expiration and stale recovery around dispatch read-modify-write.
- Restricted prompt inputs to regular files whose realpath remains inside the workspace.
- Closed runtime/schema fields, prohibited secret-like keys recursively and redacted credentials from adapter errors.
- Removed caller-controlled capability overrides; runtime capabilities now come only from registered adapters.
- Enforced capacity limits and explicit ordered host/model fallbacks, with cross-host use requiring authorization and persisted resolution history.
- Pentester correction cycle 1 focused verification: 84/84; lint and AC audit passed.

## Runtime pilot correction — 2026-07-10

- Generated manifests now default every agent to portable `external` execution instead of unavailable native modes.
- Confirmed installed CLI contracts: `codex exec`, `claude --print`, and `opencode run`, with optional model argv and no shell interpolation.
- Dispatch now spawns the headless CLI, waits for exit/timeout, applies bounded capacity policy, requires the bound report, and persists execution history plus terminal state.
- Native subagent/fresh-session remains bridge-only. The portable guarantee is a fresh headless process; opening a visible client chat window is outside CLI control.
- Runtime E2E uses a real child executable and proves spawn, wait, report binding, missing-report pause and resume integrity. Focused + compatibility validation: 130/130; lint passed.

## Windows shim pilot correction — 2026-07-10

- Windows executable resolution now prefers real `.exe` files and safely unwraps validated npm `.cmd` shims to `process.execPath + JavaScript entrypoint` or their referenced `.exe`; no shell or command interpolation is used.
- Codex prompts use stdin (`codex exec -`) to support frontmatter and avoid Windows argv length limits.
- Adapter drains stdout, bounds stderr, resolves on process `exit`, destroys inherited pipes and reports timeout distinctly.
- Real Play pilot completed: Codex spawned via npm shim, exited code 0, wrote a schema-bound report and transitioned the dispatcher to `correcting` for a legitimate BLOCKED verdict. No orphan process remained.

## Cross-repository pilot correction — 2026-07-10

- Added explicit per-agent `writable_roots`, additive defaults, strict runtime/template validation and canonical existing-directory resolution without traversal.
- Codex and Claude translate approved roots to separated `--add-dir` argv; OpenCode blocks with `host_capability_missing` because its verified `run` interface has no equivalent writable-root flag.
- Resolved roots are persisted and report-bound. The Play pilot authorized only `C:\dev\services\aioson-auth`, exited code 0, returned a bound PASS report and advanced to `verification_planned`.
- Final focused and compatibility validation: 99/99; lint passed.

## QA sign-off

- Date: 2026-07-10
- Verdict: PASS
- AC coverage: 18/18 fully covered
- Evidence: 24/24 focused tests; full suite 3616 pass, 0 fail, 1 skip; harness 7/7; AC audit PASS
- Residual risks: formal Attack Surface Map absent from requirements; no line/branch/mutation coverage baseline

## QA Sign-off

- **Date:** 2026-07-10
- **Verdict:** PASS
- **Gate D (execution):** approved
