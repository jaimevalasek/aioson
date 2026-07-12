---
feature_slug: agent-execution-dispatcher
schema_version: "1.2"
created_by: dossier-init
created_at: 2026-07-10T18:59:31.284Z
status: active
classification: MEDIUM
last_updated_by: dossier-init
last_updated_at: 2026-07-10T18:59:31.284Z
---
## Why

Desenvolvedores que usam o AIOSON em Claude Code, Codex ou OpenCode já conseguem planejar uma feature e calcular verificadores, mas ainda precisam iniciar agentes, interpretar aliases de modelos e coordenar relatórios manualmente. Isso torna o autopilot frágil: um modelo inválido ou sem capacidade interrompe o fluxo, e o `@dev` não possui um contrato determinístico para despachar, aguardar e consumir `@qa`, `@tester`, `@pentester` e `@validator`.

## What

_(preencher manualmente — PRD não encontrado ou sem seção de Escopo)_

## Code Map

```yaml
files: []
modules: []
patterns: []
```

## Rules & Design-Docs aplicáveis

_(vazio — populado a partir da Phase 2)_

## Agent Trail

_(vazio — populado a partir da Phase 2)_

<!-- sha256:165b85c767b98404aca83789c0799a61ba95f54017b34388a05a0175c6e17a38 -->
**2026-07-10T18:59:31.675Z** | @product | _What_

MVP: manifesto JSON editável por feature com host/modelo/modo por agente, validação pré-código, retomada limpa do dev, despacho e espera de verificadores, ciclos limitados de correção e capacidade/fallback somente por política explícita. Constraints: preservar workflow-execute.json e verification.json, sem fallback silencioso.

<!-- sha256:c89c7f854ff56c35cc6709297ccba4f22099e57bb47909044dbb7824144b4e92 -->
**2026-07-10T19:00:11.391Z** | @product | _Agent Trail_

PRD agent-execution-dispatcher: MEDIUM, 4 fluxos

<!-- sha256:9b6d3ca11d987b10e6874b4615c1d056d38539162ab793bc2779c3a0d4325055 -->
**2026-07-10T19:08:10.738Z** | @orchestrator | _Agent Trail_

Maestro spec complete. Requirements, architecture and plan consolidated; Gates A/B/C approved; readiness ready; next @dev phase 1.

<!-- sha256:1d9493a0ecd3bb06b12baaab716193e5e23ee36d3be61c1a40215b653992006b -->
**2026-07-10T19:08:11.255Z** | @orchestrator | _Agent Trail_

Orchestration agent-execution-dispatcher: pacote MEDIUM consolidado, Gates A/B/C aprovados, ready para dev

<!-- sha256:e84ee5d81d8417fc99df40c7e2b960feed6b1dba842b7c0b8cfe694bbead026c -->
**2026-07-10T19:57:26.638Z** | @qa | _Agent Trail_

QA completed. Verdict: PASS. Coverage: 100%. Issues: no Critical/High; SEC-SBD-03 documentary Medium.

<!-- sha256:a6d88468701633b4361dcf9bf620f56cd71f168fb233727b5091b5ad6268adeb -->
**2026-07-10T20:05:56.324Z** | @tester | _Agent Trail_

Tester: 5 tests added; 29/29 focused and 3621/3621 full-suite tests passing (1 skip). Critical dispatcher coverage: 100% lines, 87.65% branches. Harness 7/7 and AC 18/18 PASS. Next: @validator.

<!-- sha256:379fe4304751ae9da29b29dc6fdd75c518a8f0ed1376567b673ddcf9b6ef9cc4 -->
**2026-07-10T20:05:56.693Z** | @tester | _Agent Trail_

Tester PASS: state/capacity/resume branches hardened; 3621 tests passing

## Revision Requests

_(vazio — populado a partir da Phase 2)_

<!-- dev-20260710-agent-execution -->
**2026-07-10** | @dev | _Code Map_

`src/agent-execution/` owns manifest/schema/capabilities/adapters/dispatcher/reports; `src/commands/agent-execution.js` owns CLI UX; `verification-plan.js` and `workflow-execute.js` consume the contract additively; managed Product/Dev/autopilot prompts use the dispatcher.

**2026-07-10** | @dev | _Agent Trail_

Phases 1–6 implemented. Native subagent/fresh-session are never assumed: missing capability persists `unsupported_capability`; external CLI execution is the only process-backed route and uses argv with `shell:false`. Focused new tests 16/16, legacy integration 60/60, AC audit 18/18. Next: independent QA/security/validator review.

**2026-07-10** | @dev | _Agent Trail_

Pentester corrections cycle 1: fixed SF-01..06. Reports are attempt-bound and anti-replay; dispatch is lease-serialized; prompts are workspace-contained; schemas reject secrets/unknown fields; stderr is redacted; capability claims are adapter-owned; capacity/fallback is bounded and explicit. Adversarial + compatibility verification 84/84, lint PASS, AC 18/18. Next: pentester re-check.

**2026-07-10** | @dev | _Agent Trail_

Runtime pilot correction: defaults changed to executable external/headless CLIs; dispatcher now executes and awaits the process and bound report instead of returning only an argv specification. CLI syntax was verified locally for Claude, Codex and OpenCode. E2E real child-process coverage and compatibility suites passed 130/130; lint PASS. Visible chat-window creation remains client-owned; headless fresh context is supported.

**2026-07-10** | @dev | _Agent Trail_

Windows pilot follow-up: npm `.cmd` shims are resolved without shell, Codex receives large/frontmatter prompts through stdin, and process completion no longer waits forever on inherited pipes. The real Play pilot exited 0 after 161s, produced a bound BLOCKED report and moved state to `correcting`; no process was orphaned.

**2026-07-10** | @dev | _Agent Trail_

Cross-repository allowlist follow-up: per-agent writable roots are explicit, canonicalized and report-bound. Codex/Claude support verified `--add-dir`; OpenCode fails closed. Play pilot wrote to the single authorized aioson-auth root and completed PASS, advancing to verification. Compatibility 99/99, lint PASS.
